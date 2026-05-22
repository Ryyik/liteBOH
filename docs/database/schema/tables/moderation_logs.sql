-- moderation_logs 表 - 审核日志

CREATE TABLE IF NOT EXISTS public.moderation_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL,
  target_type text NOT NULL,
  ai_result text NULL,
  ai_reason text NULL,
  moderator_id uuid NULL,
  created_at timestamp with time zone NULL DEFAULT now(),
  CONSTRAINT moderation_logs_pkey PRIMARY KEY (id),
  CONSTRAINT moderation_logs_moderator_id_fkey FOREIGN KEY (moderator_id) REFERENCES profiles (id)
) TABLESPACE pg_default;
