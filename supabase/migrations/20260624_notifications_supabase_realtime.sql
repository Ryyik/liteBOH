-- 将 notifications 表加入 supabase_realtime publication
-- 修复实时订阅 CLOSED/CHANNEL_ERROR 问题
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
