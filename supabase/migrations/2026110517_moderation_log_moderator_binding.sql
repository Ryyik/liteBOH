-- ============================================================================
-- insert_moderation_log：moderator_id 必须与调用者身份一致（2026-11-05 安全审查补丁）
--
-- 补的是什么洞：
--   函数是 SECURITY DEFINER，签名里带 p_moderator_id，但函数体原样落库、
--   不与 auth.uid() 做任何比对 ⇒ 任何登录用户都能以**他人名义**写一条
--   approved/rejected 审核留痕（`{"p_target_id":"<任意帖>","p_moderator_id":"<某版主>"}`）。
--   审核链是纠纷与申诉的唯一凭据，可以被栽赃就等于没有。
--
-- 修法：
--   · authenticated 调用 ⇒ moderator_id 强制 = auth.uid()，传入值直接忽略
--     （版主自己操作时本来也等于自己，语义不变）；
--   · service_role 调用（auth.uid() 为 null，后台批处理/回填）⇒ 允许显式指定，
--     否则那条路径就没法代他人记日志；
--   · target_type **刻意不收白名单**：现有调用方用的值不止帖子一类
--     （profile-api 传 'impression'、memory-api 传 'shared_memory'），收窄会
--     在运行时抛错，而调用方是「写日志失败不阻断业务」的静默降级 ⇒ 只会变成
--     一条条看不到的丢失留痕。要收窄得先把 target_type 收敛成枚举。
--   anon 的执行权已在 2026092101 撤销，这里再撤一次（幂等，防线上时序差）。
-- ============================================================================

begin;

create or replace function public.insert_moderation_log(
  p_target_id uuid,
  p_target_type text,
  p_ai_result text,
  p_ai_reason text default null,
  p_moderator_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_type text := trim(coalesce(p_target_type, ''));
  v_ai_result text := lower(trim(coalesce(p_ai_result, 'approved')));
  v_caller_id uuid := auth.uid();
  v_moderator_id uuid;
begin
  if p_target_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'TARGET_ID_REQUIRED:target_id is required';
  end if;

  if v_target_type = '' then
    raise exception using
      errcode = 'P0001',
      message = 'TARGET_TYPE_REQUIRED:target_type is required';
  end if;

  if v_ai_result not in ('approved', 'rejected') then
    v_ai_result := 'approved';
  end if;

  -- 归属绑定：登录用户只能记自己的名；没有 auth.uid() 的（service_role）才允许代记。
  v_moderator_id := coalesce(v_caller_id, p_moderator_id);

  insert into public.moderation_logs (
    target_id,
    target_type,
    ai_result,
    ai_reason,
    moderator_id
  ) values (
    p_target_id,
    v_target_type,
    v_ai_result,
    nullif(trim(coalesce(p_ai_reason, '')), ''),
    v_moderator_id
  );
end;
$$;

revoke execute on function public.insert_moderation_log(uuid, text, text, text, uuid)
  from anon, public;
grant execute on function public.insert_moderation_log(uuid, text, text, text, uuid)
  to authenticated;
grant execute on function public.insert_moderation_log(uuid, text, text, text, uuid)
  to service_role;

comment on function public.insert_moderation_log(uuid, text, text, text, uuid) is
  '写审核留痕。moderator_id 对 authenticated 恒等于 auth.uid()（传入值被忽略），仅 service_role 可代记。';

commit;
