-- posts 表 - 帖子

CREATE TABLE IF NOT EXISTS public.posts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  content text NOT NULL,
  author_id uuid NULL,
  author_username text NULL,
  created_at timestamp with time zone NULL DEFAULT now(),
  updated_at timestamp with time zone NULL DEFAULT now(),
  status text NULL DEFAULT 'approved'::text,
  CONSTRAINT posts_pkey PRIMARY KEY (id),
  CONSTRAINT posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles (id) ON DELETE CASCADE
) TABLESPACE pg_default;

-- 索引
CREATE INDEX IF NOT EXISTS idx_posts_author_username ON public.posts USING btree (author_username) TABLESPACE pg_default;

-- 触发器
CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
