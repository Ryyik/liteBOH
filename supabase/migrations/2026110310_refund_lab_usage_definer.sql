-- ============================================================================
-- A1 · refund_lab_usage 从「永远删不到行」修成「能退且不越权」
--
-- 症状（2026-11-02 RC 安全复审 §3）：
--   函数是 SECURITY INVOKER，体内做 DELETE from lab_usage_records，
--   而该表只有 INSERT / SELECT 策略、**没有任何 DELETE 策略**
--   ⇒ RLS 默认拒绝 ⇒ 永远删 0 行、返回 false。
--   `src/composables/useLabQuota.js` 走「本地回退」分支：
--   UI 上配额退回来了，数据侧没退 —— 两边长期对不上账。
--
-- 为什么不能只加一条 DELETE 策略：
--   策略要写 `auth.uid() = user_id`，但匿名设备（user_id is null）
--   正好是这条链路的另一半使用面，策略写法会分叉成两条且以后每加一种
--   调用形态都要再补一条。用 SECURITY DEFINER + 函数内显式判权更窄。
--
-- 越权面（本次一并收掉，比原函数更严）：
--   原函数 `(p_user_id is null or user_id = p_user_id)` 在 p_user_id 为空时
--   会匹配**任意 user_id** 的记录 —— 即任意人凭一个 device_id 就能删掉
--   别人的记录。现在：
--     · 传了 p_user_id ⇒ 必须 auth.uid() = p_user_id，否则直接 false
--     · 没传 p_user_id（匿名设备）⇒ 只删 user_id is null 的记录，
--       且要求调用者本身未登录；登录用户不许借 device 通道
--     · device_id / flow_type 加长度上限，避免超长键把索引拖慢
--
-- ⚠️ SECURITY DEFINER 必须配 `set search_path = public`，否则可被
--    search_path 劫持（本仓所有 definer 函数同款约束）。
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
  v_deleted_id uuid;
begin
  if p_user_id is null and v_device_id is null then
    return false;
  end if;

  -- 入参长度上限：device_id 是本地生成的 uuid/短串，flow_type 是常量枚举
  if v_device_id is not null and char_length(v_device_id) > 128 then
    return false;
  end if;
  if p_flow_type is not null and char_length(p_flow_type) > 64 then
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
        and (p_flow_type is null or flow_type = p_flow_type)
      order by created_at desc
      limit 1
   )
  returning id into v_deleted_id;

  return v_deleted_id is not null;
end;
$function$;

-- 授权与原函数保持一致：匿名设备要能退（lab 允许未登录试用），
-- 但函数体内已把匿名路径收窄到 user_id is null 的记录。
revoke all on function public.refund_lab_usage(uuid, text, text) from public;
grant execute on function public.refund_lab_usage(uuid, text, text) to anon, authenticated, service_role;
