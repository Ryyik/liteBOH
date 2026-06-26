-- notifications 表增加 archived_at 字段
-- 允许用户归档通知，从主列表隐藏但保留数据
--
-- Down Migration (回滚):
--   DROP INDEX IF EXISTS idx_notifications_archived;
--   DROP INDEX IF EXISTS idx_notifications_active;
--   ALTER TABLE public.notifications DROP COLUMN IF EXISTS archived_at;
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'archived_at'
  ) then
    alter table public.notifications
      add column archived_at timestamp with time zone default null;
  end if;
end $$;

-- 索引：按接收者查询未归档通知
CREATE INDEX IF NOT EXISTS idx_notifications_active
  ON public.notifications USING btree (recipient_id, created_at DESC)
  WHERE archived_at IS NULL;

-- 索引：按接收者查询已归档通知
CREATE INDEX IF NOT EXISTS idx_notifications_archived
  ON public.notifications USING btree (recipient_id, archived_at DESC)
  WHERE archived_at IS NOT NULL;

COMMENT ON COLUMN public.notifications.archived_at IS '归档时间，NULL 表示未归档；非 NULL 表示已归档';
