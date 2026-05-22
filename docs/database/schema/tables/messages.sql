-- messages 表 - 消息

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  sender_name text NOT NULL,
  receiver_id uuid NOT NULL,
  receiver_name text NOT NULL,
  subject text NULL,
  content text NOT NULL,
  status text NULL DEFAULT 'unread'::text,
  moderation_status text NOT NULL DEFAULT 'approved'::text,
  moderation_reason text NULL,
  created_at timestamp with time zone NULL DEFAULT now(),
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_moderation_status_check CHECK ((moderation_status = ANY (ARRAY['approved'::text, 'rejected'::text]))),
  CONSTRAINT messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES auth.users (id),
  CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users (id)
) TABLESPACE pg_default;

-- 索引
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages USING btree (sender_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON public.messages USING btree (receiver_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_messages_receiver_status ON public.messages USING btree (receiver_id, status) TABLESPACE pg_default
  WHERE (status = 'unread'::text);
