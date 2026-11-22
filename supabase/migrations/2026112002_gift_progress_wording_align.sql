-- ============================================================================
-- 2026-11-20 免费赠礼（user_gifts）站内信文案去交易词
--
-- 背景（接 2026112001）：11-12 的「订单→方块礼物」词表只覆盖了商城订单链路
-- （DB 触发器 + 用户侧邮件 + 前端商城页）。另一套免费赠礼 user_gifts 的
-- notify_gift_progress 站内信仍写「进度更新为『已发货』」。
-- 用户口径（2026-11-20）：「确保订单和礼物进度的更新都不是带有敏感词汇」——
-- 交易词（发货）按 11-12 词表整体退场，两条进度链路口径统一。
--
-- 只改文案，不动状态机、不动触发条件、不动 trigger 定义：
--   · v_label：已发货 → 已寄出（准备中 / 已完成 / 已取消 不变）
--   · 正文：「你的礼物「x」进度更新为「y」」→「你的礼物「x」有新进展：y」
--   · 保留「礼物」不带「方块」前缀：与本链路 2026110202 的区分口径一致
--     （商城 = 方块礼物 = 自己买的；这里 = 礼物 = 别人送的）
--
-- 注：此链路只发站内信（无邮件），敏感词风险本就低；改它是为了口径统一 +
--     将来若给它接邮件不必再返工。
--
-- 幂等：create or replace function，可重复执行。
-- ============================================================================

begin;

create or replace function public.notify_gift_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
  v_name text;
begin
  if new.user_id is null then
    return new;
  end if;

  -- 只有状态真的变了才发：后台「保存」按钮经常原样提交，不该刷屏
  if new.gift_status is not distinct from old.gift_status then
    return new;
  end if;

  v_label := case new.gift_status
    when 'preparing' then '准备中'
    when 'shipped' then '已寄出'
    when 'completed' then '已完成'
    when 'cancelled' then '已取消'
    else coalesce(new.gift_status, '已更新')
  end;

  v_name := coalesce(nullif(trim(new.gift_content), ''), nullif(trim(new.gift_no), ''), '礼物');

  begin
    insert into public.notifications (recipient_id, sender_id, type, status, content)
    values (
      new.user_id,
      null, -- 系统消息：sender 为空，前端 filterSelfActionNotifications 不会误判成自操作
      'gift',
      'unread',
      concat('你的礼物「', v_name, '」有新进展：', v_label)
    );
  exception
    when others then
      null; -- 通知是附属品，失败不影响礼物状态落库
  end;

  return new;
end;
$$;

comment on function public.notify_gift_progress() is
  '礼物状态变更 → 给持有人插一条 gift 类型站内通知（2026-11-02 补发送端，2026-11-20 对齐礼物口径去交易词）';

-- 触发器函数不对外暴露执行权限（与 2026110314 同口径）
revoke all on function public.notify_gift_progress() from public;
revoke all on function public.notify_gift_progress() from anon;
revoke all on function public.notify_gift_progress() from authenticated;

commit;
