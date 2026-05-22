-- user_impressions 表 - 用户印象

CREATE TABLE IF NOT EXISTS public.user_impressions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  author_id uuid NULL,
  target_id uuid NULL,
  content text NOT NULL,
  category text NULL DEFAULT 'general'::text,
  created_at timestamp with time zone NULL DEFAULT now(),
  CONSTRAINT user_impressions_pkey PRIMARY KEY (id),
  CONSTRAINT user_impressions_author_id_target_id_key UNIQUE (author_id, target_id),
  CONSTRAINT user_impressions_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT user_impressions_target_id_fkey FOREIGN KEY (target_id) REFERENCES profiles (id) ON DELETE CASCADE
) TABLESPACE pg_default;
