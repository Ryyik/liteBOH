-- addresses 表 - 地址信息

CREATE TABLE IF NOT EXISTS public.addresses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_username text NULL,
  address_data jsonb NULL,
  CONSTRAINT addresses_pkey PRIMARY KEY (id),
  CONSTRAINT addresses_user_username_fkey FOREIGN KEY (user_username) REFERENCES profiles (username)
) TABLESPACE pg_default;
