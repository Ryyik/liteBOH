-- 论坛优化：
-- 1) 将帖子标题/正文拆字段，保留 content 兼容旧数据
-- 2) 用计数触发器替代列表聚合，减轻热帖查询
-- 3) 列表 RPC 返回 has_more，修复分页边界
-- 4) 点赞改为原子 RPC
-- 5) 增加搜索向量索引

begin;

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

create index if not exists idx_posts_search_vector
  on public.posts using gin (search_vector);

create index if not exists idx_posts_status_created_at_id
  on public.posts (status, created_at desc, id desc);

create index if not exists idx_posts_author_status_created_at_id
  on public.posts (author_id, status, created_at desc, id desc);

create index if not exists idx_comments_post_parent_status_created_at_id
  on public.comments (post_id, parent_id, status, created_at asc, id asc);

update public.posts
   set title = nullif(trim(coalesce(title, public.forum_post_title(content))), ''),
       body = coalesce(nullif(trim(body), ''), public.forum_post_body(content))
 where title is null
    or body is null;

update public.posts p
   set comment_count = coalesce((
         select count(*)
           from public.comments c
          where c.post_id = p.id
            and c.status = 'approved'
       ), 0),
       like_count = coalesce((
         select count(*)
           from public.likes l
          where l.post_id = p.id
       ), 0);

create or replace function public.sync_forum_post_text_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_body text;
begin
  if tg_op = 'UPDATE' then
    if new.content is distinct from old.content
       and new.title is not distinct from old.title
       and new.body is not distinct from old.body then
      v_title := nullif(trim(public.forum_post_title(new.content)), '');
      v_body := nullif(trim(public.forum_post_body(new.content)), '');
    else
      v_title := nullif(trim(coalesce(new.title, public.forum_post_title(new.content))), '');
      v_body := nullif(trim(coalesce(new.body, public.forum_post_body(new.content))), '');
    end if;
  else
    v_title := nullif(trim(coalesce(new.title, public.forum_post_title(new.content))), '');
    v_body := nullif(trim(coalesce(new.body, public.forum_post_body(new.content))), '');
  end if;

  if v_title is null and v_body is null then
    v_title := '无标题';
    v_body := '';
  end if;

  new.title := coalesce(v_title, '无标题');
  new.body := coalesce(v_body, '');

  if tg_op = 'INSERT' then
    new.content := case
      when new.title is not null and trim(new.title) <> '' then
        '【' || new.title || '】' || E'\n' || coalesce(new.body, '')
      else
        coalesce(new.body, '')
    end;
  elsif new.content is null
     or trim(new.content) = ''
     or new.title is distinct from old.title
     or new.body is distinct from old.body then
    new.content := case
      when new.title is not null and trim(new.title) <> '' then
        '【' || new.title || '】' || E'\n' || coalesce(new.body, '')
      else
        coalesce(new.body, '')
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_forum_post_text_fields on public.posts;
create trigger trg_sync_forum_post_text_fields
  before insert or update of content, title, body on public.posts
  for each row
  execute function public.sync_forum_post_text_fields();

create or replace function public.refresh_forum_post_counters(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_post_id is null then
    return;
  end if;

  update public.posts p
     set comment_count = (
           select count(*)
             from public.comments c
            where c.post_id = p_post_id
              and c.status = 'approved'
         ),
         like_count = (
           select count(*)
             from public.likes l
            where l.post_id = p_post_id
         )
   where p.id = p_post_id;
end;
$$;

create or replace function public.sync_forum_comment_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.refresh_forum_post_counters(new.post_id);
    return null;
  end if;

  if tg_op = 'DELETE' then
    perform public.refresh_forum_post_counters(old.post_id);
    return null;
  end if;

  if old.post_id is distinct from new.post_id
     or old.status is distinct from new.status then
    perform public.refresh_forum_post_counters(old.post_id);
    perform public.refresh_forum_post_counters(new.post_id);
  end if;

  return null;
end;
$$;

create or replace function public.sync_forum_like_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.refresh_forum_post_counters(new.post_id);
    return null;
  end if;

  if tg_op = 'DELETE' then
    perform public.refresh_forum_post_counters(old.post_id);
    return null;
  end if;

  if old.post_id is distinct from new.post_id then
    perform public.refresh_forum_post_counters(old.post_id);
    perform public.refresh_forum_post_counters(new.post_id);
  end if;

  return null;
end;
$$;

drop trigger if exists trg_forum_comment_counters on public.comments;
create trigger trg_forum_comment_counters
  after insert or update or delete on public.comments
  for each row
  execute function public.sync_forum_comment_counters();

drop trigger if exists trg_forum_like_counters on public.likes;
create trigger trg_forum_like_counters
  after insert or update or delete on public.likes
  for each row
  execute function public.sync_forum_like_counters();

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

create or replace function public.toggle_forum_like(p_post_id uuid)
returns table (
  action text,
  like_count bigint,
  is_liked boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_like uuid;
  v_like_inserted uuid;
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_LIKE:NOT_AUTHENTICATED:请先登录后再点赞';
  end if;

  if not exists (
    select 1
      from public.posts p
     where p.id = p_post_id
       and (p.status = 'approved' or p.status is null)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_LIKE:POST_NOT_FOUND:帖子不存在或不可操作';
  end if;

  select l.id
    into v_existing_like
    from public.likes l
   where l.post_id = p_post_id
     and l.user_id = v_user_id
   limit 1;

  if v_existing_like is not null then
    delete from public.likes where id = v_existing_like;
    action := 'unliked';
    is_liked := false;
  else
    insert into public.likes (post_id, user_id)
    values (p_post_id, v_user_id)
    on conflict (post_id, user_id) do nothing
    returning id into v_like_inserted;

    action := 'liked';
    is_liked := true;

    if v_like_inserted is null then
      select l.id
        into v_existing_like
        from public.likes l
       where l.post_id = p_post_id
         and l.user_id = v_user_id
       limit 1;

      if v_existing_like is null then
        action := 'unliked';
        is_liked := false;
      end if;
    end if;
  end if;

  select p.like_count
    into like_count
    from public.posts p
   where p.id = p_post_id;

  like_count := coalesce(like_count, 0);
  return next;
end;
$$;

create or replace function public.list_forum_comment_thread(
  p_post_id uuid,
  p_root_comment_id uuid,
  p_page integer default 1,
  p_page_size integer default 50
)
returns table (
  id uuid,
  post_id uuid,
  author_id uuid,
  author_username text,
  content text,
  created_at timestamptz,
  status text,
  parent_id uuid,
  reply_to_username text,
  author_avatar_url text,
  has_more boolean
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_fetch_size integer := v_page_size + 1;
  v_offset integer := (v_page - 1) * v_page_size;
begin
  return query
  with recursive thread as (
    select c.*
      from public.comments c
     where c.post_id = p_post_id
       and c.parent_id = p_root_comment_id
       and c.status = 'approved'

    union all

    select child.*
      from public.comments child
      join thread parent_thread on parent_thread.id = child.parent_id
     where child.post_id = p_post_id
       and child.status = 'approved'
  ),
  ranked as (
    select
      t.*,
      row_number() over (order by t.created_at asc, t.id asc) as row_num
    from thread t
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
    p.post_id,
    p.author_id,
    p.author_username,
    p.content,
    p.created_at,
    p.status,
    p.parent_id,
    p.reply_to_username,
    pr.avatar_url as author_avatar_url,
    pm.has_more
  from paged p
  cross join page_meta pm
  left join public.profiles pr on pr.id = p.author_id
  where p.row_num <= v_offset + v_page_size
  order by p.row_num;
end;
$$;

revoke all on function public.sync_forum_post_text_fields() from public;
revoke all on function public.refresh_forum_post_counters(uuid) from public;
revoke all on function public.sync_forum_comment_counters() from public;
revoke all on function public.sync_forum_like_counters() from public;
revoke all on function public.list_forum_posts(integer, integer, text, uuid, boolean, text) from public;
revoke all on function public.toggle_forum_like(uuid) from public;
revoke all on function public.list_forum_comment_thread(uuid, uuid, integer, integer) from public;

grant execute on function public.sync_forum_post_text_fields() to authenticated;
grant execute on function public.sync_forum_post_text_fields() to service_role;
grant execute on function public.refresh_forum_post_counters(uuid) to authenticated;
grant execute on function public.refresh_forum_post_counters(uuid) to service_role;
grant execute on function public.sync_forum_comment_counters() to authenticated;
grant execute on function public.sync_forum_comment_counters() to service_role;
grant execute on function public.sync_forum_like_counters() to authenticated;
grant execute on function public.sync_forum_like_counters() to service_role;
grant execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text) to anon;
grant execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text) to authenticated;
grant execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text) to service_role;
grant execute on function public.toggle_forum_like(uuid) to authenticated;
grant execute on function public.toggle_forum_like(uuid) to service_role;
grant execute on function public.list_forum_comment_thread(uuid, uuid, integer, integer) to anon;
grant execute on function public.list_forum_comment_thread(uuid, uuid, integer, integer) to authenticated;
grant execute on function public.list_forum_comment_thread(uuid, uuid, integer, integer) to service_role;

notify pgrst, 'reload schema';

commit;
