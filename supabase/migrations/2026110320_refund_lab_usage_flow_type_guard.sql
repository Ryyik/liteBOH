-- ============================================================================
-- refund_lab_usage：补 p_flow_type 守卫（**不**加设备过滤，理由见下）
--
-- 背景（2026-11-03 外部审查 F3）。核实后 §2 F3 的建议修法不成立，这里说明
-- 为什么没有照抄，避免下一个人「按报告补一行」把退款打坏：
--
--   ✗ 报告建议：登录分支补 `and (v_device_id is null or device_id = v_device_id)`
--   ✓ 实际情况：`src/composables/useLabQuota.js:232` 在登录态传的是
--     `p_device_id: null`（`const deviceId = isLoggedIn.value ? null : getOrCreateDeviceId()`），
--     且登录态写入的 `lab_usage_records.device_id` 本来就是 null。
--     ⇒ `v_device_id` 恒为 null，该子句**永不生效**；而一旦将来客户端开始在
--       登录态传 device_id，这个子句会让退款匹配不到任何历史行（历史行
--       device_id 全为 null），**退款直接失效**。
--
--   影响面也要下调：Lab 配额是**按用户**计的，登录用户删掉「该 flow 最新一条」
--   在账目上等价于「自己的次数 -1」，与那条记录来自哪台设备无关。
--   真正的跨设备需求（谁生成的退谁的）要等「登录态也落 device_id」之后，
--   按 (user_id, device_id, flow_type) 三元组匹配才有意义 —— 属下一批。
--
-- 本次只做一件有实际收益的事：`p_flow_type is null` 时原来会退**任意 flow**
-- 的最新一条（哪个 flow 最后生成就退哪个），是潜在的退错账口子。当前唯一
-- 调用方恒传该参数（`refundQuota(flowType)` 三个枚举值预先校验过），所以
-- 收紧它零风险。
-- ============================================================================

create or replace function public.refund_lab_usage(
  p_user_id uuid default null,
  p_device_id text default null,
  p_flow_type text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_device_id text := nullif(trim(coalesce(p_device_id, '')), '');
  v_flow_type text := nullif(trim(coalesce(p_flow_type, '')), '');
  v_deleted_id uuid;
begin
  if p_user_id is null and v_device_id is null then
    return false;
  end if;

  -- 不指定 flow 就不退：否则会删掉「最近一次任意 flow」的记录，退错账。
  -- `record_lab_usage` 侧 flow_type 是 not null，历史记录不会缺这一列。
  if v_flow_type is null then
    return false;
  end if;

  -- 入参长度上限：device_id 是本地生成的 uuid/短串，flow_type 是常量枚举
  if v_device_id is not null and char_length(v_device_id) > 128 then
    return false;
  end if;
  if char_length(v_flow_type) > 64 then
    return false;
  end if;

  -- 登录用户只能退自己的
  if p_user_id is not null and (v_uid is null or v_uid <> p_user_id) then
    return false;
  end if;

  -- 登录用户不许走 device 通道（否则可用别人的 device_id 删匿名记录）
  if p_user_id is null and v_uid is not null then
    return false;
  end if;

  delete from public.lab_usage_records
   where id = (
     select id
       from public.lab_usage_records
      where case
              when p_user_id is not null then user_id = p_user_id
              else user_id is null and device_id = v_device_id
            end
        and flow_type = v_flow_type
      order by created_at desc
      limit 1
   )
  returning id into v_deleted_id;

  return v_deleted_id is not null;
end;
$function$;

-- 授权面保持不变：匿名设备要能退（lab 允许未登录试用），函数体内已收窄。
revoke all on function public.refund_lab_usage(uuid, text, text) from public;
grant execute on function public.refund_lab_usage(uuid, text, text) to anon, authenticated, service_role;
