-- ============================================================================
-- 2026-11-21 订单进度邮件的投递状态查询（后台只读）
--
-- 背景：用户问「后台推进进度，Brevo 邮件到底发出去了没有」，此前**无法回答**：
--   · mail_outbox 的 RLS 只授 service_role，管理员账号读不到；
--   · 前端只能看到「状态 UPDATE 成功」，看不到投递结果。
--   于是后台文案只能含糊写「通知已排队」，管理员不知道要不要人工补发。
--
-- 本函数只读、不改任何数据，把一单的进度通知账本摊给管理员看：
--   pending = 已入队待投（follow-mail-send 尚未处理，5 分钟 cron 会兜底）
--   sent    = Brevo 已接受（sent_at 有值）
--   skipped = 没发（无可用邮箱 / 用户没注册邮箱等，last_error 说明原因）
--   failed  = 重试用尽后放弃（last_error 说明原因）
--
-- 安全口径：security definer + current_user_is_admin()，且**只返回**
--   状态/时间/原因，不返回收件邮箱本身 —— 排障不需要看明文邮箱。
--
-- 幂等：create or replace function；不改表结构、不改已有数据。
-- ============================================================================

begin;

create or replace function public.admin_shop_order_mail_status(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor uuid := auth.uid();
  v_status text;
  v_last_error text;
  v_attempts integer := 0;
  v_queued_at timestamptz;
  v_sent_at timestamptz;
  v_due_at timestamptz;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  if not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'message', 'NOT_ADMIN');
  end if;

  if p_order_id is null then
    return jsonb_build_object('ok', false, 'message', 'INVALID_INPUT');
  end if;

  /* 同一单同一状态只入账一次（dedupe_key = shop_order:<id>:<status>），
     所以这里取该单**最新**一条进度邮件即可代表当前状态的通知结果。 */
  select status, last_error, attempts, created_at, sent_at, due_at
    into v_status, v_last_error, v_attempts, v_queued_at, v_sent_at, v_due_at
    from public.mail_outbox
   where order_id = p_order_id
     and kind = 'shop_order'
   order by created_at desc
   limit 1;

  if v_status is null then
    return jsonb_build_object(
      'ok', true,
      'has_record', false,
      'message', 'NO_MAIL_RECORD'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'has_record', true,
    'status', v_status,
    'attempts', coalesce(v_attempts, 0),
    'last_error', v_last_error,
    'queued_at', v_queued_at,
    'sent_at', v_sent_at,
    'due_at', v_due_at
  );
end;
$function$;

comment on function public.admin_shop_order_mail_status(uuid) is
  '后台只读：查一张订单最新一条进度邮件的投递状态（pending/sent/skipped/failed），不返回收件邮箱。';

revoke all on function public.admin_shop_order_mail_status(uuid) from public;
revoke all on function public.admin_shop_order_mail_status(uuid) from anon;
grant execute on function public.admin_shop_order_mail_status(uuid) to authenticated;
grant execute on function public.admin_shop_order_mail_status(uuid) to service_role;

commit;

notify pgrst, 'reload schema';