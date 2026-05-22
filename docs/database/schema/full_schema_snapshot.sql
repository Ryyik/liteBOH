create table public.activities (
  id bigint not null,
  title character varying(255) not null,
  date character varying(50) not null,
  image text null,
  description text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint activities_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists idx_activities_date on public.activities using btree (date desc) TABLESPACE pg_default;

create index IF not exists idx_activities_created_at on public.activities using btree (created_at desc) TABLESPACE pg_default;

create trigger update_activities_updated_at BEFORE
update on activities for EACH row
execute FUNCTION update_updated_at_column ();

create table public.addresses (
  id uuid not null default gen_random_uuid (),
  user_username text null,
  address_data jsonb null,
  constraint addresses_pkey primary key (id),
  constraint addresses_user_username_fkey foreign KEY (user_username) references profiles (username)
) TABLESPACE pg_default;

create table public.comments (
  id uuid not null default gen_random_uuid (),
  post_id uuid null,
  author_id uuid null,
  author_username text null,
  content text not null,
  created_at timestamp with time zone null default now(),
  status text null default 'approved'::text,
  parent_id uuid null,
  reply_to_username text null,
  constraint comments_pkey primary key (id),
  constraint comments_author_id_fkey foreign KEY (author_id) references profiles (id) on delete CASCADE,
  constraint comments_parent_id_fkey foreign KEY (parent_id) references comments (id) on delete CASCADE,
  constraint comments_post_id_fkey foreign KEY (post_id) references posts (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_comments_author_username on public.comments using btree (author_username) TABLESPACE pg_default;

create index IF not exists idx_comments_parent_id on public.comments using btree (parent_id) TABLESPACE pg_default;

create trigger trigger_on_comment
after INSERT on comments for EACH row
execute FUNCTION create_comment_notification ();
create table public.likes (
  id uuid not null default gen_random_uuid (),
  post_id uuid null,
  user_id uuid null,
  constraint likes_pkey primary key (id),
  constraint likes_post_id_user_id_key unique (post_id, user_id),
  constraint likes_post_id_fkey foreign KEY (post_id) references posts (id) on delete CASCADE,
  constraint likes_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create trigger trigger_on_like
after INSERT on likes for EACH row
execute FUNCTION create_like_notification ();

create table public.messages (
  id uuid not null default gen_random_uuid (),
  sender_id uuid not null,
  sender_name text not null,
  receiver_id uuid not null,
  receiver_name text not null,
  subject text null,
  content text not null,
  status text null default 'unread'::text,
  moderation_status text not null default 'approved'::text,
  moderation_reason text null,
  created_at timestamp with time zone null default now(),
  constraint messages_pkey primary key (id),
  constraint messages_receiver_id_fkey foreign KEY (receiver_id) references auth.users (id),
  constraint messages_sender_id_fkey foreign KEY (sender_id) references auth.users (id)
) TABLESPACE pg_default;

create index IF not exists idx_messages_sender on public.messages using btree (sender_id) TABLESPACE pg_default;

create index IF not exists idx_messages_receiver on public.messages using btree (receiver_id) TABLESPACE pg_default;

create index IF not exists idx_messages_receiver_status on public.messages using btree (receiver_id, status) TABLESPACE pg_default
where
  (status = 'unread'::text);

create table public.moderation_logs (
  id uuid not null default gen_random_uuid (),
  target_id uuid not null,
  target_type text not null,
  ai_result text null,
  ai_reason text null,
  moderator_id uuid null,
  created_at timestamp with time zone null default now(),
  constraint moderation_logs_pkey primary key (id),
  constraint moderation_logs_moderator_id_fkey foreign KEY (moderator_id) references profiles (id)
) TABLESPACE pg_default;

create table public.news (
  id bigint not null,
  category character varying(50) not null,
  title character varying(255) not null,
  excerpt text not null,
  date date not null,
  author character varying(100) not null,
  image text null,
  content text not null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint news_pkey primary key (id),
  constraint news_category_check check (
    (
      (category)::text = any (
        (
          array[
            'event'::character varying,
            'update'::character varying,
            'community'::character varying,
            'announce'::character varying
          ]
        )::text[]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_news_category on public.news using btree (category) TABLESPACE pg_default;

create index IF not exists idx_news_date on public.news using btree (date desc) TABLESPACE pg_default;

create index IF not exists idx_news_created_at on public.news using btree (created_at desc) TABLESPACE pg_default;

create trigger update_news_updated_at BEFORE
update on news for EACH row
execute FUNCTION update_updated_at_column ();

create table public.notifications (
  id uuid not null default gen_random_uuid (),
  recipient_id uuid not null,
  sender_id uuid null,
  type text not null,
  post_id uuid null,
  comment_id uuid null,
  status text null default 'unread'::text,
  created_at timestamp with time zone null default now(),
  constraint notifications_pkey primary key (id),
  constraint notifications_comment_id_fkey foreign KEY (comment_id) references comments (id) on delete CASCADE,
  constraint notifications_post_id_fkey foreign KEY (post_id) references posts (id) on delete CASCADE,
  constraint notifications_recipient_id_fkey foreign KEY (recipient_id) references profiles (id) on delete CASCADE,
  constraint notifications_sender_profiles_fkey foreign KEY (sender_id) references profiles (id) on delete set null,
  constraint notifications_status_check check (
    (
      status = any (array['unread'::text, 'read'::text])
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_notifications_recipient_created on public.notifications using btree (recipient_id, created_at desc) TABLESPACE pg_default;

create index IF not exists idx_notifications_unread on public.notifications using btree (recipient_id, created_at desc) TABLESPACE pg_default
where
  (status = 'unread'::text);

create table public.posts (
  id uuid not null default gen_random_uuid (),
  content text not null,
  author_id uuid null,
  author_username text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  status text null default 'approved'::text,
  constraint posts_pkey primary key (id),
  constraint posts_author_id_fkey foreign KEY (author_id) references profiles (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_posts_author_username on public.posts using btree (author_username) TABLESPACE pg_default;

create trigger update_posts_updated_at BEFORE
update on posts for EACH row
execute FUNCTION update_updated_at_column ();

create table public.profiles (
  id uuid not null default gen_random_uuid (),
  username text not null,
  join_date date null,
  tags text[] null,
  role text null default 'user'::text,
  points integer null default 0,
  birth_month text null,
  birth_day text null,
  email text null,
  bio text null,
  avatar_url text null,
  profile_background_url text null,
  profile_background_public_id text null,
  experience integer null default 0,
  shipping_recipient text null,
  shipping_phone text null,
  shipping_address text null,
  gift_status text null default 'preparing'::text,
  gift_content text null,
  gift_no text null,
  gift_price numeric null,
  pushplus_token text null,
  pushplus_enabled boolean null default false,
  constraint profiles_pkey primary key (id),
  constraint profiles_username_key unique (username),
  constraint profiles_profile_background_url_len check (
    (
      (profile_background_url is null)
      or (char_length(profile_background_url) <= 2048)
    )
  ),
  constraint profiles_profile_background_public_id_len check (
    (
      (profile_background_public_id is null)
      or (char_length(profile_background_public_id) <= 512)
    )
  ),
  constraint profiles_id_fkey foreign KEY (id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create trigger on_username_updated
after
update on profiles for EACH row
execute FUNCTION sync_username_change ();

create table public.user_gifts (
  id uuid not null default gen_random_uuid (),
  user_id uuid null,
  gift_no text not null,
  gift_content text not null,
  gift_price numeric null default 0,
  gift_image text null,
  gift_status text null default 'preparing'::text,
  is_active boolean null default true,
  created_at timestamp with time zone null default now(),
  completed_at timestamp with time zone null,
  updated_at timestamp with time zone null default now(),
  constraint user_gifts_pkey primary key (id),
  constraint user_gifts_user_id_fkey foreign KEY (user_id) references profiles (id) on delete CASCADE,
  constraint check_gift_status check (
    (
      gift_status = any (
        array[
          'preparing'::text,
          'processing'::text,
          'shipped'::text,
          'completed'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_user_gifts_user_id on public.user_gifts using btree (user_id) TABLESPACE pg_default; 

create table public.user_impressions (
  id uuid not null default gen_random_uuid (),
  author_id uuid null,
  target_id uuid null,
  content text not null,
  category text null default 'general'::text,
  created_at timestamp with time zone null default now(),
  constraint user_impressions_pkey primary key (id),
  constraint user_impressions_author_id_target_id_key unique (author_id, target_id),
  constraint user_impressions_author_id_fkey foreign KEY (author_id) references profiles (id) on delete CASCADE,
  constraint user_impressions_target_id_fkey foreign KEY (target_id) references profiles (id) on delete CASCADE
) TABLESPACE pg_default;
