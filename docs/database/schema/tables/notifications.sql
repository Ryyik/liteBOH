-- notifications 表 - 通知

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL,
  sender_id uuid NULL,
  type text NOT NULL,
  post_id uuid NULL,
  comment_id uuid NULL,
  status text NULL DEFAULT 'unread'::text,
  created_at timestamp with time zone NULL DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES comments (id) ON DELETE CASCADE,
  CONSTRAINT notifications_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT notifications_sender_profiles_fkey FOREIGN KEY (sender_id) REFERENCES profiles (id) ON DELETE SET NULL,
  CONSTRAINT notifications_status_check CHECK (
    status = ANY (ARRAY['unread'::text, 'read'::text])
  )
) TABLESPACE pg_default;

-- 索引
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created ON public.notifications USING btree (recipient_id, created_at DESC) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications USING btree (recipient_id, created_at DESC) TABLESPACE pg_default
  WHERE (status = 'unread'::text);
