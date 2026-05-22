-- BOH 创作者节目发布
-- 目标：
-- 1) 在节目页支持创作者投稿；
-- 2) 仅允许已认证 BOH 创作者发布；
-- 3) 发布时要求绑定对应平台账号，并限制视频链接域名。

begin;

create or replace function public.boh_creator_show_video_url_is_valid(
  p_platform text,
  p_url text
)
returns boolean
language sql
immutable
as $$
  select
    p_platform in ('bilibili', 'xiaohongshu', 'douyin')
    and p_url is not null
    and char_length(trim(p_url)) between 8 and 500
    and trim(p_url) ~* '^https?://'
    and case
      when p_platform = 'bilibili'
        then trim(p_url) ~* '^https?://([a-z0-9-]+\.)*(bilibili\.com|b23\.tv)(/|$)'
      when p_platform = 'xiaohongshu'
        then trim(p_url) ~* '^https?://([a-z0-9-]+\.)*(xiaohongshu\.com|xhslink\.com)(/|$)'
      when p_platform = 'douyin'
        then trim(p_url) ~* '^https?://([a-z0-9-]+\.)*(douyin\.com|iesdouyin\.com)(/|$)'
      else false
    end;
$$;

create table if not exists public.boh_creator_shows (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  author_username text not null default '',
  creator_platform text not null,
  creator_platform_id text not null default '',
  title text not null default '',
  description text not null default '',
  video_url text not null default '',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.boh_creator_shows
  drop constraint if exists boh_creator_shows_platform_valid,
  drop constraint if exists boh_creator_shows_author_username_len,
  drop constraint if exists boh_creator_shows_creator_platform_id_len,
  drop constraint if exists boh_creator_shows_title_len,
  drop constraint if exists boh_creator_shows_description_len,
  drop constraint if exists boh_creator_shows_video_url_valid;

create or replace function public.sync_boh_creator_show_fields()
returns trigger
language plpgsql
as $$
declare
  v_profile record;
  v_platform_id text;
begin
  new.creator_platform := lower(trim(coalesce(new.creator_platform, '')));
  new.title := trim(coalesce(new.title, ''));
  new.description := trim(coalesce(new.description, ''));
  new.video_url := trim(coalesce(new.video_url, ''));
  new.author_username := trim(coalesce(new.author_username, ''));

  if new.author_id is null then
    raise exception 'author_id is required';
  end if;

  select
    p.id,
    p.username,
    p.is_boh_creator,
    p.creator_platform_ids
  into v_profile
  from public.profiles p
  where p.id = new.author_id;

  if not found then
    raise exception 'creator profile not found';
  end if;

  if not coalesce(v_profile.is_boh_creator, false) then
    raise exception 'only verified creator can publish shows';
  end if;

  v_platform_id := trim(coalesce(v_profile.creator_platform_ids ->> new.creator_platform, ''));
  if v_platform_id = '' then
    raise exception 'creator has not bound % account id', new.creator_platform;
  end if;

  new.author_username := trim(coalesce(v_profile.username, new.author_username, ''));
  new.creator_platform_id := left(v_platform_id, 64);
  new.updated_at := now();

  return new;
end;
$$;

-- 先对历史数据做基础规整，避免迁移时因空格/大小写导致约束直接失败。
update public.boh_creator_shows
set author_username = trim(coalesce(author_username, '')),
    creator_platform = lower(trim(coalesce(creator_platform, ''))),
    creator_platform_id = left(trim(coalesce(creator_platform_id, '')), 64),
    title = trim(coalesce(title, '')),
    description = trim(coalesce(description, '')),
    video_url = trim(coalesce(video_url, ''));

drop trigger if exists trg_boh_creator_shows_sync_fields on public.boh_creator_shows;
create trigger trg_boh_creator_shows_sync_fields
before insert or update
on public.boh_creator_shows
for each row
execute function public.sync_boh_creator_show_fields();

-- 使用 NOT VALID 兼容历史数据；新写入/更新仍会执行校验。
alter table public.boh_creator_shows
  add constraint boh_creator_shows_platform_valid
  check (creator_platform in ('bilibili', 'xiaohongshu', 'douyin'))
  not valid,
  add constraint boh_creator_shows_author_username_len
  check (char_length(trim(author_username)) between 1 and 64)
  not valid,
  add constraint boh_creator_shows_creator_platform_id_len
  check (char_length(trim(creator_platform_id)) between 1 and 64)
  not valid,
  add constraint boh_creator_shows_title_len
  check (char_length(trim(title)) between 1 and 80)
  not valid,
  add constraint boh_creator_shows_description_len
  check (char_length(trim(description)) between 1 and 320)
  not valid,
  add constraint boh_creator_shows_video_url_valid
  check (public.boh_creator_show_video_url_is_valid(creator_platform, video_url))
  not valid;

create index if not exists idx_boh_creator_shows_created_at
  on public.boh_creator_shows (created_at desc);

create index if not exists idx_boh_creator_shows_author_created_at
  on public.boh_creator_shows (author_id, created_at desc);

alter table public.boh_creator_shows enable row level security;

drop policy if exists boh_creator_shows_select_all on public.boh_creator_shows;
create policy boh_creator_shows_select_all
  on public.boh_creator_shows
  for select
  to public
  using (true);

drop policy if exists boh_creator_shows_insert_verified_creator on public.boh_creator_shows;
create policy boh_creator_shows_insert_verified_creator
  on public.boh_creator_shows
  for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_boh_creator = true
        and coalesce(trim(p.creator_platform_ids ->> lower(trim(creator_platform))), '') <> ''
    )
  );

drop policy if exists boh_creator_shows_update_own on public.boh_creator_shows;
create policy boh_creator_shows_update_own
  on public.boh_creator_shows
  for update
  to authenticated
  using (auth.uid() = author_id)
  with check (
    auth.uid() = author_id
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_boh_creator = true
        and coalesce(trim(p.creator_platform_ids ->> lower(trim(creator_platform))), '') <> ''
    )
  );

drop policy if exists boh_creator_shows_delete_own on public.boh_creator_shows;
create policy boh_creator_shows_delete_own
  on public.boh_creator_shows
  for delete
  to authenticated
  using (auth.uid() = author_id);

grant select on table public.boh_creator_shows to anon;
grant select, insert, update, delete on table public.boh_creator_shows to authenticated;
grant all on table public.boh_creator_shows to service_role;

commit;
