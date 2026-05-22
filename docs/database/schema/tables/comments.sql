-- comments 表 - 评论

CREATE TABLE IF NOT EXISTS public.comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NULL,
  author_id uuid NULL,
  author_username text NULL,
  content text NOT NULL,
  created_at timestamp with time zone NULL DEFAULT now(),
  status text NULL DEFAULT 'approved'::text,
  parent_id uuid NULL,
  reply_to_username text NULL,
  CONSTRAINT comments_pkey PRIMARY KEY (id),
  CONSTRAINT comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES comments (id) ON DELETE CASCADE,
  CONSTRAINT comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
) TABLESPACE pg_default;

-- 索引
CREATE INDEX IF NOT EXISTS idx_comments_author_username ON public.comments USING btree (author_username) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON public.comments USING btree (parent_id) TABLESPACE pg_default;

-- 触发器
CREATE TRIGGER trigger_on_comment
  AFTER INSERT ON comments
  FOR EACH ROW
  EXECUTE FUNCTION create_comment_notification();
