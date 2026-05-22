begin;

-- This migration may be applied before the title/counter migration when files are
-- sorted by name, so keep the prerequisite forum columns idempotent here too.
alter table public.posts
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists comment_count bigint not null default 0,
  add column if not exists like_count bigint not null default 0;

alter table public.posts
  add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(nullif(title, ''), public.forum_post_title(content), '')), 'A')
    || setweight(to_tsvector('simple', coalesce(nullif(body, ''), public.forum_post_body(content), content, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(author_username, '')), 'C')
  ) stored;

alter table public.posts
  add column if not exists image_count integer not null default 0,
  add column if not exists cover_image_url text not null default '',
  add column if not exists forum_cloud_entry_id uuid null references public.boh_cloud_entries(id) on delete set null;

alter table public.boh_cloud_entries
  drop constraint if exists boh_cloud_entries_source_check;

alter table public.boh_cloud_entries
  add constraint boh_cloud_entries_source_check
  check (source in ('manual', 'ai', 'migrated', 'forum'));

create table if not exists public.forum_post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  cloud_entry_id uuid null references public.boh_cloud_entries(id) on delete set null,
  url text not null,
  public_id text not null,
  width integer not null,
  height integer not null,
  format text not null default '',
  moderation_status text not null default 'approved'
    check (moderation_status in ('approved', 'pending', 'rejected')),
  moderation_source text not null default 'client_nsfwjs'
    check (moderation_source in ('client_nsfwjs', 'manual', 'none')),
  moderation_score numeric null,
  moderation_reason text null,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  constraint forum_post_images_url_len check (char_length(url) <= 2048),
  constraint forum_post_images_public_id_len check (char_length(public_id) between 1 and 255),
  constraint forum_post_images_dimensions_chk check (
    width > 0
    and height > 0
    and width <= 8192
    and height <= 8192
    and (width::bigint * height::bigint) <= 24000000
  ),
  constraint forum_post_images_order_chk check (sort_order >= 0 and sort_order < 3)
);

create index if not exists idx_forum_post_images_post_order
  on public.forum_post_images (post_id, sort_order);

create index if not exists idx_forum_post_images_user_created
  on public.forum_post_images (user_id, created_at desc);

create unique index if not exists uniq_forum_post_images_post_order
  on public.forum_post_images (post_id, sort_order);

alter table public.forum_post_images enable row level security;

drop policy if exists forum_post_images_select_visible on public.forum_post_images;
drop policy if exists forum_post_images_select_public on public.forum_post_images;
create policy forum_post_images_select_public
  on public.forum_post_images
  for select
  to anon, authenticated
  using (
    exists (
      select 1
        from public.posts p
       where p.id = forum_post_images.post_id
         and (p.status = 'approved' or p.status is null)
    )
  );

drop policy if exists forum_post_images_select_owner_admin on public.forum_post_images;
create policy forum_post_images_select_owner_admin
  on public.forum_post_images
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.current_user_is_admin()
  );

grant select on table public.forum_post_images to anon;
grant select on table public.forum_post_images to authenticated;
grant insert, update, delete on table public.forum_post_images to service_role;

create or replace function public.delete_forum_post_synced_cloud_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.forum_cloud_entry_id is not null then
    delete from public.boh_cloud_entries e
     where e.id = old.forum_cloud_entry_id
       and e.user_id = old.author_id
       and e.source = 'forum';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_delete_forum_post_synced_cloud_entry on public.posts;
create trigger trg_delete_forum_post_synced_cloud_entry
after delete on public.posts
for each row
execute function public.delete_forum_post_synced_cloud_entry();

create or replace function public.create_forum_post_with_images(
  p_title text,
  p_body text,
  p_author_username text default '',
  p_images jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_title text := left(trim(coalesce(p_title, '')), 120);
  v_body text := trim(coalesce(p_body, ''));
  v_author_username text := left(trim(coalesce(p_author_username, '')), 80);
  v_images jsonb := coalesce(p_images, '[]'::jsonb);
  v_image jsonb;
  v_image_count integer := 0;
  v_today_count integer := 0;
  v_post_id uuid;
  v_cloud_entry_id uuid;
  v_content text;
  v_cover_url text := '';
  v_cloud_blocks jsonb := '[]'::jsonb;
  v_cloud_image_blocks jsonb := '[]'::jsonb;
  v_url text;
  v_public_id text;
  v_width_text text;
  v_height_text text;
  v_score_text text;
  v_width integer;
  v_height integer;
  v_format text;
  v_score numeric;
  v_reason text;
  v_order integer := 0;
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_IMAGE:NOT_AUTHENTICATED:请先登录后再发布';
  end if;

  if v_title = '' then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_IMAGE:EMPTY_TITLE:请填写标题';
  end if;

  if v_body = '' then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_IMAGE:EMPTY_BODY:请填写正文内容';
  end if;

  if jsonb_typeof(v_images) <> 'array' then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_IMAGE:INVALID_IMAGES:图片数据格式无效';
  end if;

  v_image_count := jsonb_array_length(v_images);
  if v_image_count > 3 then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_IMAGE:POST_IMAGE_LIMIT:每个帖子最多发布 3 张图片';
  end if;

  if v_image_count > 0 and not public.current_user_is_admin() then
    select count(*)
      into v_today_count
      from public.forum_post_images i
     where i.user_id = v_user_id
       and i.created_at >= ((timezone('Asia/Shanghai', now())::date)::timestamp at time zone 'Asia/Shanghai')
       and i.created_at < (((timezone('Asia/Shanghai', now())::date + 1)::timestamp) at time zone 'Asia/Shanghai')
       and i.moderation_status <> 'rejected';

    if v_today_count + v_image_count > 5 then
      raise exception using
        errcode = 'P0001',
        message = 'FORUM_IMAGE:DAILY_IMAGE_LIMIT:今天论坛发图额度已满，每天最多 5 张';
    end if;
  end if;

  v_content := '【' || v_title || '】' || chr(10) || v_body;

  if v_image_count > 0 then
    for v_image in select value from jsonb_array_elements(v_images)
    loop
      if jsonb_typeof(v_image) <> 'object' then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:INVALID_IMAGE:图片数据无效';
      end if;

      v_url := trim(coalesce(v_image ->> 'url', ''));
      v_public_id := trim(coalesce(v_image ->> 'publicId', v_image ->> 'public_id', ''));
      v_width_text := trim(coalesce(v_image ->> 'width', ''));
      v_height_text := trim(coalesce(v_image ->> 'height', ''));
      v_score_text := trim(coalesce(v_image ->> 'moderationScore', ''));
      v_format := left(lower(trim(coalesce(v_image ->> 'format', ''))), 16);
      v_reason := left(trim(coalesce(v_image ->> 'moderationReason', '')), 160);

      if trim(coalesce(v_image ->> 'moderationStatus', '')) <> 'approved' then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:IMAGE_NOT_APPROVED:图片未通过发布前安全检测';
      end if;

      if char_length(v_url) > 2048
         or v_url !~ '^https://res[.]cloudinary[.]com/[A-Za-z0-9_-]+/image/upload/'
         or v_url !~* '[.](png|jpe?g|webp)([?#].*)?$' then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:INVALID_IMAGE_URL:图片来源异常，已阻止发布';
      end if;

      if v_public_id = ''
         or char_length(v_public_id) > 255
         or v_public_id like '/%'
         or v_public_id like '%..%'
         or position(chr(92) in v_public_id) > 0 then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:INVALID_PUBLIC_ID:图片资源标识异常，已阻止发布';
      end if;

      if v_width_text !~ '^[0-9]+$' or v_height_text !~ '^[0-9]+$' then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:INVALID_DIMENSIONS:图片尺寸异常，请换一张图片';
      end if;

      v_width := v_width_text::integer;
      v_height := v_height_text::integer;

      if v_width <= 0
         or v_height <= 0
         or v_width > 8192
         or v_height > 8192
         or (v_width::bigint * v_height::bigint) > 24000000 then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:INVALID_DIMENSIONS:图片尺寸异常，请换一张图片';
      end if;

      if v_score_text <> '' and v_score_text !~ '^[0-9]+([.][0-9]+)?$' then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:INVALID_IMAGE:图片数据无效';
      end if;
      v_score := nullif(v_score_text, '')::numeric;

      if v_cover_url = '' then
        v_cover_url := v_url;
      end if;

      v_cloud_image_blocks := v_cloud_image_blocks || jsonb_build_array(jsonb_build_object(
        'type', 'image',
        'url', v_url,
        'publicId', v_public_id,
        'width', v_width,
        'height', v_height,
        'alt', '论坛图片'
      ));
    end loop;
  end if;

  insert into public.posts (
    content,
    title,
    body,
    author_id,
    author_username,
    status,
    image_count,
    cover_image_url
  )
  values (
    v_content,
    v_title,
    v_body,
    v_user_id,
    v_author_username,
    'approved',
    v_image_count,
    v_cover_url
  )
  returning id into v_post_id;

  if v_image_count > 0 then
    v_cloud_blocks := jsonb_build_array(jsonb_build_object(
      'type', 'text',
      'text', v_content
    )) || v_cloud_image_blocks;

    insert into public.boh_cloud_entries (
      user_id,
      entry_date,
      title,
      entry_type,
      visibility,
      content_text,
      content_blocks,
      cover_image_url,
      mood,
      source
    )
    values (
      v_user_id,
      timezone('Asia/Shanghai', now())::date,
      left('论坛：' || v_title, 120),
      case when v_body = '' then 'image' else 'mixed' end,
      'private',
      v_content,
      v_cloud_blocks,
      v_cover_url,
      '',
      'forum'
    )
    returning id into v_cloud_entry_id;

    update public.posts
       set forum_cloud_entry_id = v_cloud_entry_id
     where id = v_post_id;

    v_order := 0;
    for v_image in select value from jsonb_array_elements(v_images)
    loop
      v_url := trim(coalesce(v_image ->> 'url', ''));
      v_public_id := trim(coalesce(v_image ->> 'publicId', v_image ->> 'public_id', ''));
      v_width := trim(coalesce(v_image ->> 'width', ''))::integer;
      v_height := trim(coalesce(v_image ->> 'height', ''))::integer;
      v_format := left(lower(trim(coalesce(v_image ->> 'format', ''))), 16);
      v_score := nullif(trim(coalesce(v_image ->> 'moderationScore', '')), '')::numeric;
      v_reason := left(trim(coalesce(v_image ->> 'moderationReason', '')), 160);

      insert into public.forum_post_images (
        post_id,
        user_id,
        cloud_entry_id,
        url,
        public_id,
        width,
        height,
        format,
        moderation_status,
        moderation_source,
        moderation_score,
        moderation_reason,
        sort_order
      )
      values (
        v_post_id,
        v_user_id,
        v_cloud_entry_id,
        v_url,
        v_public_id,
        v_width,
        v_height,
        v_format,
        'approved',
        'client_nsfwjs',
        v_score,
        v_reason,
        v_order
      );

      v_order := v_order + 1;
    end loop;
  end if;

  return (
    select to_jsonb(result_row)
      from (
        select
          p.*,
          coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', i.id,
              'url', i.url,
              'publicId', i.public_id,
              'width', i.width,
              'height', i.height,
              'format', i.format,
              'sortOrder', i.sort_order
            ) order by i.sort_order, i.created_at)
              from public.forum_post_images i
             where i.post_id = p.id
               and i.moderation_status = 'approved'
          ), '[]'::jsonb) as images
        from public.posts p
        where p.id = v_post_id
      ) result_row
  );
end;
$$;

drop function if exists public.list_forum_posts(integer, integer, text, uuid, boolean, text);

create function public.list_forum_posts(
  p_page integer default 1,
  p_page_size integer default 10,
  p_sort text default 'latest',
  p_author_id uuid default null,
  p_include_author_non_approved boolean default false,
  p_search_query text default null
)
returns table (
  id uuid,
  content text,
  title text,
  body text,
  author_id uuid,
  author_username text,
  author_avatar_url text,
  created_at timestamptz,
  updated_at timestamptz,
  status text,
  comment_count bigint,
  like_count bigint,
  image_count integer,
  cover_image_url text,
  images jsonb,
  hot_score double precision,
  search_rank real,
  search_excerpt text,
  has_more boolean
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 50);
  v_fetch_size integer := v_page_size + 1;
  v_offset integer := (v_page - 1) * v_page_size;
  v_sort text := lower(trim(coalesce(p_sort, 'latest')));
  v_query text := nullif(trim(coalesce(p_search_query, '')), '');
  v_has_query boolean := v_query is not null;
begin
  if v_sort not in ('latest', 'hottest') then
    v_sort := 'latest';
  end if;

  return query
  with base_posts as (
    select
      p.id,
      p.content,
      coalesce(nullif(trim(p.title), ''), public.forum_post_title(p.content), '无标题') as title,
      coalesce(nullif(trim(p.body), ''), public.forum_post_body(p.content), '') as body,
      p.author_id,
      p.author_username,
      pr.avatar_url as author_avatar_url,
      p.created_at,
      p.updated_at,
      p.status,
      p.comment_count,
      p.like_count,
      coalesce(p.image_count, 0)::integer as image_count,
      coalesce(p.cover_image_url, '') as cover_image_url,
      case
        when coalesce(p.cover_image_url, '') <> '' then jsonb_build_array(jsonb_build_object(
          'id', p.id::text || '-cover',
          'url', p.cover_image_url,
          'publicId', '',
          'width', 0,
          'height', 0,
          'format', '',
          'sortOrder', 0
        ))
        else '[]'::jsonb
      end as images,
      p.search_vector,
      (p.like_count::double precision * 1.0)
      + (p.comment_count::double precision * 1.5)
      + greatest(0.0, 48.0 - extract(epoch from (now() - p.created_at)) / 3600.0) / 24.0 as hot_score
    from public.posts p
    left join public.profiles pr on pr.id = p.author_id
    where
      (p_author_id is null or p.author_id = p_author_id)
      and (
        p.status = 'approved'
        or (p_include_author_non_approved and p_author_id is not null and p.author_id = p_author_id)
      )
  ),
  filtered as (
    select
      bp.*,
      case
        when v_has_query then websearch_to_tsquery('simple', v_query)
        else null
      end as query_ts
    from base_posts bp
    where (not v_has_query) or (bp.search_vector @@ websearch_to_tsquery('simple', v_query))
  ),
  ranked as (
    select
      f.*,
      case when v_has_query then ts_rank_cd(f.search_vector, f.query_ts) else 0::real end as search_rank,
      case
        when v_has_query then ts_headline(
          'simple',
          coalesce(nullif(f.body, ''), f.content),
          f.query_ts,
          'MaxFragments=2, FragmentDelimiter=" … ", MaxWords=20, MinWords=8, ShortWord=2, StartSel=[[, StopSel=]]'
        )
        else null
      end as search_excerpt,
      row_number() over (
        order by
          case when v_has_query and v_sort = 'latest' then ts_rank_cd(f.search_vector, f.query_ts) end desc nulls last,
          case when v_sort = 'hottest' then f.hot_score end desc nulls last,
          f.created_at desc,
          f.id desc
      ) as row_num
    from filtered f
  ),
  paged as (
    select *
    from ranked
    where row_num > v_offset
      and row_num <= v_offset + v_fetch_size
  ),
  page_meta as (
    select (count(*) > v_page_size) as has_more
    from paged
  )
  select
    p.id,
    p.content,
    p.title,
    p.body,
    p.author_id,
    p.author_username,
    p.author_avatar_url,
    p.created_at,
    p.updated_at,
    p.status,
    p.comment_count,
    p.like_count,
    p.image_count,
    p.cover_image_url,
    p.images,
    p.hot_score,
    p.search_rank,
    p.search_excerpt,
    pm.has_more
  from paged p
  cross join page_meta pm
  where p.row_num <= v_offset + v_page_size
  order by p.row_num;
end;
$$;

revoke all on function public.create_forum_post_with_images(text, text, text, jsonb) from public;
revoke all on function public.delete_forum_post_synced_cloud_entry() from public;
revoke all on function public.list_forum_posts(integer, integer, text, uuid, boolean, text) from public;

grant execute on function public.create_forum_post_with_images(text, text, text, jsonb) to authenticated;
grant execute on function public.create_forum_post_with_images(text, text, text, jsonb) to service_role;
grant execute on function public.delete_forum_post_synced_cloud_entry() to service_role;
grant execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text) to anon;
grant execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text) to authenticated;
grant execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text) to service_role;

comment on table public.forum_post_images is '论坛帖子图片元数据。图片发布前由前端 NSFWJS 免费预筛，数据库负责限额与来源兜底。';
comment on function public.create_forum_post_with_images(text, text, text, jsonb) is '创建论坛帖子并绑定最多 3 张图片；有图时同步创建 BOH Cloud+ 私有条目并共享 Cloud 图片额度。';

notify pgrst, 'reload schema';

commit;
