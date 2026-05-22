-- profiles 表 - 用户资料

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  username text NOT NULL,
  join_date date NULL,
  tags text[] NULL,
  role text NULL DEFAULT 'user'::text,
  points integer NULL DEFAULT 0,
  birth_month text NULL,
  birth_day text NULL,
  email text NULL,
  bio text NULL,
  avatar_url text NULL,
  profile_background_url text NULL,
  profile_background_public_id text NULL,
  experience integer NULL DEFAULT 0,
  shipping_recipient text NULL,
  shipping_phone text NULL,
  shipping_address text NULL,
  gift_status text NULL DEFAULT 'preparing'::text,
  gift_content text NULL,
  gift_no text NULL,
  gift_price numeric NULL,
  pushplus_token text NULL,
  pushplus_enabled boolean NULL DEFAULT false,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_username_key UNIQUE (username),
  CONSTRAINT profiles_profile_background_url_len CHECK ((profile_background_url IS NULL) OR (char_length(profile_background_url) <= 2048)),
  CONSTRAINT profiles_profile_background_public_id_len CHECK ((profile_background_public_id IS NULL) OR (char_length(profile_background_public_id) <= 512)),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE
) TABLESPACE pg_default;

-- 触发器
CREATE TRIGGER on_username_updated
  AFTER UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_username_change();
