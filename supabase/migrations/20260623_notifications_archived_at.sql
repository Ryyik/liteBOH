-- notifications 表增加 archived_at 字段
-- 允许用户归档通知，从主列表隐藏但保留数据

ALTER TABLE IF EXISTS public.notifications
  ADD COLUMN archived_at timestamp with time zone DEFAULT NULL;

-- 索引：按接收者查询未归档通知
CREATE INDEX IF NOT EXISTS idx_notifications_active
  ON public.notifications USING btree (recipient_id, created_at DESC)
  WHERE archived_at IS NULL;

-- 索引：按接收者查询已归档通知
CREATE INDEX IF NOT EXISTS idx_notifications_archived
  ON public.notifications USING btree (recipient_id, archived_at DESC)
  WHERE archived_at IS NOT NULL;

COMMENT ON COLUMN public.notifications.archived_at IS '归档时间，NULL 表示未归档；非 NULL 表示已归档';
