-- 关注通知触发器 (Follow Notification Trigger)
-- 当 user_follows 插入新关注关系时，自动在 notifications 表
-- 为被关注者创建 "XX 关注了你" 通知。
--
-- 使用 security definer 绕过 RLS（与 create_like_notification 相同模式）
--
-- Down Migration:
--   DROP TRIGGER IF EXISTS trigger_on_follow ON public.user_follows;
--   DROP FUNCTION IF EXISTS public.create_follow_notification();

create or replace function public.create_follow_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.follower_id is not null
     and new.following_id is not null
     and new.follower_id <> new.following_id then
    insert into public.notifications (
      recipient_id,
      sender_id,
      type,
      status
    )
    values (
      new.following_id,
      new.follower_id,
      'follow',
      'unread'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_on_follow on public.user_follows;
create trigger trigger_on_follow
  after insert on public.user_follows
  for each row
  execute function public.create_follow_notification();
