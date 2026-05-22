-- news 表 - 新闻公告

CREATE TABLE IF NOT EXISTS public.news (
  id bigint NOT NULL,
  category character varying(50) NOT NULL,
  title character varying(255) NOT NULL,
  excerpt text NOT NULL,
  date date NOT NULL,
  author character varying(100) NOT NULL,
  image text NULL,
  content text NOT NULL,
  created_at timestamp with time zone NULL DEFAULT now(),
  updated_at timestamp with time zone NULL DEFAULT now(),
  CONSTRAINT news_pkey PRIMARY KEY (id),
  CONSTRAINT news_category_check CHECK (
    (category)::text = ANY (
      (ARRAY[
        'event'::character varying,
        'update'::character varying,
        'community'::character varying,
        'announce'::character varying
      ])::text[]
    )
  )
) TABLESPACE pg_default;

-- 索引
CREATE INDEX IF NOT EXISTS idx_news_category ON public.news USING btree (category) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_news_date ON public.news USING btree (date DESC) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_news_created_at ON public.news USING btree (created_at DESC) TABLESPACE pg_default;

-- 触发器
CREATE TRIGGER update_news_updated_at
  BEFORE UPDATE ON news
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
