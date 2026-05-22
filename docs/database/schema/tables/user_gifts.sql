-- user_gifts 表 - 用户礼物

CREATE TABLE IF NOT EXISTS public.user_gifts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  gift_no text NOT NULL,
  gift_content text NOT NULL,
  gift_price numeric NULL DEFAULT 0,
  gift_image text NULL,
  gift_status text NULL DEFAULT 'preparing'::text,
  is_active boolean NULL DEFAULT true,
  created_at timestamp with time zone NULL DEFAULT now(),
  completed_at timestamp with time zone NULL,
  updated_at timestamp with time zone NULL DEFAULT now(),
  CONSTRAINT user_gifts_pkey PRIMARY KEY (id),
  CONSTRAINT user_gifts_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE,
  CONSTRAINT check_gift_status CHECK (
    gift_status = ANY (
      ARRAY[
        'preparing'::text,
        'processing'::text,
        'shipped'::text,
        'completed'::text
      ]
    )
  )
) TABLESPACE pg_default;

-- 索引
CREATE INDEX IF NOT EXISTS idx_user_gifts_user_id ON public.user_gifts USING btree (user_id) TABLESPACE pg_default;
