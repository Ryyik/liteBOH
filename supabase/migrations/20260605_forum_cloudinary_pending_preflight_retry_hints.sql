begin;

create table if not exists public.cloudinary_pending_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  public_id text not null,
  url text not null default '',
  resource_type text not null default 'image' check (resource_type in ('image')),
  source text not null default 'generic',
  folder text not null default '',
  claimed_at timestamp with time zone null,
  deleted_at timestamp with time zone null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint cloudinary_pending_uploads_public_id_len check (char_length(public_id) between 1 and 255),
  constraint cloudinary_pending_uploads_url_len check (char_length(url) <= 2048),
  constraint cloudinary_pending_uploads_source_len check (char_length(source) <= 40),
  constraint cloudinary_pending_uploads_folder_len check (char_length(folder) <= 255)
);

create unique index if not exists uniq_cloudinary_pending_uploads_public_id
  on public.cloudinary_pending_uploads (public_id);

create index if not exists idx_cloudinary_pending_uploads_user_active
  on public.cloudinary_pending_uploads (user_id, created_at desc)
  where deleted_at is null and claimed_at is null;

create or replace function public.touch_cloudinary_pending_uploads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_cloudinary_pending_uploads_updated_at on public.cloudinary_pending_uploads;
create trigger trg_cloudinary_pending_uploads_updated_at
before update on public.cloudinary_pending_uploads
for each row
execute function public.touch_cloudinary_pending_uploads_updated_at();

alter table public.cloudinary_pending_uploads enable row level security;

drop policy if exists cloudinary_pending_uploads_select_own on public.cloudinary_pending_uploads;
create policy cloudinary_pending_uploads_select_own
  on public.cloudinary_pending_uploads
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists cloudinary_pending_uploads_insert_own on public.cloudinary_pending_uploads;
create policy cloudinary_pending_uploads_insert_own
  on public.cloudinary_pending_uploads
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists cloudinary_pending_uploads_update_own on public.cloudinary_pending_uploads;
create policy cloudinary_pending_uploads_update_own
  on public.cloudinary_pending_uploads
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on table public.cloudinary_pending_uploads to authenticated;
grant all on table public.cloudinary_pending_uploads to service_role;

comment on table public.cloudinary_pending_uploads is
  'Cloudinary 直传图片的临时归属记录，用于删除未发布草稿图、上传预检和服务端权限校验。';

create or replace function public.assert_cloudinary_upload_allowed(
  p_source text default 'generic'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_recent_count integer := 0;
  v_active_count integer := 0;
  v_oldest_recent timestamptz;
  v_retry_after_seconds integer := 60;
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'CLOUDINARY_UPLOAD_RATE_LIMIT:NOT_AUTHENTICATED:请先登录后再上传图片';
  end if;

  if public.current_user_is_admin() then
    return;
  end if;

  select count(*), min(created_at)
    into v_recent_count, v_oldest_recent
    from public.cloudinary_pending_uploads
   where user_id = v_user_id
     and source = left(trim(coalesce(p_source, 'generic')), 40)
     and created_at >= now() - interval '10 minutes';

  if v_recent_count >= 24 then
    v_retry_after_seconds := greatest(1, ceil(extract(epoch from (v_oldest_recent + interval '10 minutes' - now())))::integer);
    raise exception using
      errcode = 'P0001',
      message = 'CLOUDINARY_UPLOAD_RATE_LIMIT:UPLOAD_10M_LIMIT:图片上传过于频繁，请稍后再试',
      hint = v_retry_after_seconds::text;
  end if;

  select count(*)
    into v_active_count
    from public.cloudinary_pending_uploads
   where user_id = v_user_id
     and claimed_at is null
     and deleted_at is null
     and created_at >= now() - interval '24 hours';

  if v_active_count >= 18 then
    raise exception using
      errcode = 'P0001',
      message = 'CLOUDINARY_UPLOAD_RATE_LIMIT:ACTIVE_DRAFT_LIMIT:草稿图片较多，请先发布或删除一些图片后再继续上传',
      hint = '600';
  end if;
end;
$$;

revoke all on function public.assert_cloudinary_upload_allowed(text) from public;
grant execute on function public.assert_cloudinary_upload_allowed(text) to authenticated;
grant execute on function public.assert_cloudinary_upload_allowed(text) to service_role;

create or replace function public.enforce_forum_post_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_last_post_at timestamptz;
  v_oldest_recent_post_at timestamptz;
  v_recent_post_count integer := 0;
  v_retry_after_seconds integer := 30;
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_RATE_LIMIT:NOT_AUTHENTICATED:请先登录后再发布';
  end if;

  if new.author_id is distinct from v_user_id then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_RATE_LIMIT:AUTHOR_MISMATCH:只能以当前登录账号发布内容';
  end if;

  if public.current_user_is_admin() then
    return new;
  end if;

  select max(p.created_at)
    into v_last_post_at
    from public.posts p
   where p.author_id = v_user_id
     and p.created_at >= now() - interval '30 seconds';

  if v_last_post_at is not null then
    v_retry_after_seconds := greatest(1, ceil(extract(epoch from (v_last_post_at + interval '30 seconds' - now())))::integer);
    perform public.log_forum_rate_limit_event(v_user_id, 'post', 'POST_COOLDOWN', new.id);
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_RATE_LIMIT:POST_COOLDOWN:发布太频繁了，请稍后再试',
      hint = v_retry_after_seconds::text;
  end if;

  select count(*), min(p.created_at)
    into v_recent_post_count, v_oldest_recent_post_at
    from public.posts p
   where p.author_id = v_user_id
     and p.created_at >= now() - interval '10 minutes';

  if v_recent_post_count >= 5 then
    v_retry_after_seconds := greatest(1, ceil(extract(epoch from (v_oldest_recent_post_at + interval '10 minutes' - now())))::integer);
    perform public.log_forum_rate_limit_event(v_user_id, 'post', 'POST_10M_LIMIT', new.id);
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_RATE_LIMIT:POST_10M_LIMIT:短时间内发布帖子较多，请稍后再试',
      hint = v_retry_after_seconds::text;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_forum_comment_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_last_comment_at timestamptz;
  v_oldest_recent_comment_at timestamptz;
  v_recent_comment_count integer := 0;
  v_retry_after_seconds integer := 10;
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_RATE_LIMIT:NOT_AUTHENTICATED:请先登录后再回复';
  end if;

  if new.author_id is distinct from v_user_id then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_RATE_LIMIT:AUTHOR_MISMATCH:只能以当前登录账号回复';
  end if;

  if public.current_user_is_admin() then
    return new;
  end if;

  select max(c.created_at)
    into v_last_comment_at
    from public.comments c
   where c.author_id = v_user_id
     and c.created_at >= now() - interval '10 seconds';

  if v_last_comment_at is not null then
    v_retry_after_seconds := greatest(1, ceil(extract(epoch from (v_last_comment_at + interval '10 seconds' - now())))::integer);
    perform public.log_forum_rate_limit_event(v_user_id, 'comment', 'COMMENT_COOLDOWN', new.id);
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_RATE_LIMIT:COMMENT_COOLDOWN:回复太频繁了，请稍后再试',
      hint = v_retry_after_seconds::text;
  end if;

  select count(*), min(c.created_at)
    into v_recent_comment_count, v_oldest_recent_comment_at
    from public.comments c
   where c.author_id = v_user_id
     and c.created_at >= now() - interval '10 minutes';

  if v_recent_comment_count >= 20 then
    v_retry_after_seconds := greatest(1, ceil(extract(epoch from (v_oldest_recent_comment_at + interval '10 minutes' - now())))::integer);
    perform public.log_forum_rate_limit_event(v_user_id, 'comment', 'COMMENT_10M_LIMIT', new.id);
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_RATE_LIMIT:COMMENT_10M_LIMIT:短时间内回复较多，请稍后再试',
      hint = v_retry_after_seconds::text;
  end if;

  return new;
end;
$$;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.create_forum_post_with_images(text, text, text, jsonb, text)'::regprocedure)
    into v_def;

  if v_def is not null and position('FORUM_RATE_LIMIT:DAILY_IMAGE_POST_LIMIT' in v_def) > 0 then
    raise notice 'create_forum_post_with_images still contains DAILY_IMAGE_POST_LIMIT; review before deploying.';
  end if;

  if v_def is not null and position('hint = ' in v_def) = 0 then
    v_def := replace(
      v_def,
      'message = ''FORUM_RATE_LIMIT:IMAGE_POST_COOLDOWN:图片帖发布太频繁了，请 3 分钟后再试'';',
      'message = ''FORUM_RATE_LIMIT:IMAGE_POST_COOLDOWN:图片帖发布太频繁了，请 3 分钟后再试'', hint = ''180'';'
    );
    v_def := replace(
      v_def,
      'message = ''FORUM_RATE_LIMIT:IMAGE_10M_LIMIT:短时间内发布图片较多，请稍后再试'';',
      'message = ''FORUM_RATE_LIMIT:IMAGE_10M_LIMIT:短时间内发布图片较多，请稍后再试'', hint = ''600'';'
    );
    execute v_def;
  end if;
exception
  when undefined_function then
    null;
end;
$$;

notify pgrst, 'reload schema';

commit;
