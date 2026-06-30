-- 印象通知触发器 (Impression Notification Trigger)
-- 当 user_impressions 插入新印象时，自动在 notifications 表
-- 为被印象者创建 "XX 留下了印象" 通知。
--
-- 使用 security definer 绕过 RLS（与 create_like_notification 相同模式）
--
-- Down Migration:
--   DROP TRIGGER IF EXISTS trigger_on_impression ON public.user_impressions;
--   DROP FUNCTION IF EXISTS public.create_impression_notification();

create or replace function public.create_impression_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.author_id is not null
     and new.target_id is not null
     and new.author_id <> new.target_id then
    insert into public.notifications (
      recipient_id,
      sender_id,
      type,
      status,
      content
    )
    values (
      new.target_id,
      new.author_id,
      'impression',
      'unread',
      new.content
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_on_impression on public.user_impressions;
create trigger trigger_on_impression
  after insert on public.user_impressions
  for each row
  execute function public.create_impression_notification();
