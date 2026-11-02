-- ============================================================================
-- 2026-11-02 礼物进度变更 → 通知用户
--
-- 用户口径：「礼物有进度时通知用户这个功能实现落地了吗」。
--
-- 落地前的事实（2026-11-02 排查）：
--   · **接收端早就接好了**：`src/views/user-center/Messages/index.vue` 里
--     type='gift' 有专门的类型名「礼物通知」、标题「礼物进度更新」、预览与正文
--     都读 `content`，并且算进系统通知（isSystemNotificationType）。
--   · **发送端一行都没有**：管理员在 DataManagement 改 gift_status、或者直改
--     数据库，都不会产生任何通知。也就是说 UI 在等一个永远不会来的消息。
--
-- 为什么用触发器而不是在 DataAdmin 里调 createNotification：
--   ① 覆盖所有写入路径 —— 后台表单、SQL 直改、EF、将来的批量脚本都会触发；
--      写在客户端就只能覆盖「从那个表单保存」这一条路。
--   ② 不依赖客户端 RLS：notifications 的 insert 策略是给「发自己相关通知」用的，
--      让管理员端替他插入是绕路；触发器是 security definer，语义正当。
--   ③ 与仓库既有做法一致：中奖通知 / 关注通知 / 印象通知都是触发器
--      （见 2026051002_home_lotteries.sql、2026063001_follow_notification_trigger.sql）。
--
-- 口径：
--   · 只在 gift_status **真的变了**时发（is distinct from 判等，重复保存不发）；
--   · 四态文案与 2026110201 的 check_gift_status 一一对应；
--   · 通知失败绝不回滚礼物本身（begin/exception 兜住）—— 发货状态是主数据，
--     通知是附属品，不能因为通知表抽风把管理员的操作吃掉；
--   · user_id 为空（历史脏数据）直接跳过。
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
    when 'shipped' then '已发货'
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
      concat('你的礼物「', v_name, '」进度更新为「', v_label, '」')
    );
  exception
    when others then
      null; -- 通知是附属品，失败不影响礼物状态落库
  end;

  return new;
end;
$$;

comment on function public.notify_gift_progress() is
  '礼物状态变更 → 给持有人插一条 gift 类型站内通知（2026-11-02 补发送端）';

drop trigger if exists trg_notify_gift_progress on public.user_gifts;
create trigger trg_notify_gift_progress
  after update of gift_status on public.user_gifts
  for each row
  execute function public.notify_gift_progress();

commit;
