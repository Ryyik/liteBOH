-- activities 表 - 活动信息

CREATE TABLE IF NOT EXISTS public.activities (
  id bigint NOT NULL,
  title character varying(255) NOT NULL,
  date character varying(50) NOT NULL,
  image text NULL,
  description text NULL,
  created_at timestamp with time zone NULL DEFAULT now(),
  updated_at timestamp with time zone NULL DEFAULT now(),
  CONSTRAINT activities_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

-- 索引
CREATE INDEX IF NOT EXISTS idx_activities_date ON public.activities USING btree (date DESC) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON public.activities USING btree (created_at DESC) TABLESPACE pg_default;

-- 触发器
CREATE TRIGGER update_activities_updated_at
  BEFORE UPDATE ON activities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
