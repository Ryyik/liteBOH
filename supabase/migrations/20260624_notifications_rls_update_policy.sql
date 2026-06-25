-- notifications 表增加 UPDATE RLS 策略
-- 允许用户只能归档/取消归档自己的通知
-- 前置条件：notifications 表已启用 RLS

create policy "Users can update their own notifications"
  on public.notifications
  for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);
