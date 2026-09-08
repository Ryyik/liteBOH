begin;

alter table public.posts
  add column if not exists post_kind text not null default 'post',
  add column if not exists source_type text,
  add column if not exists source_id text,
  add column if not exists repost_of_post_id uuid references public.posts(id) on delete set null;

alter table public.posts
  drop constraint if exists posts_post_kind_check;
alter table public.posts
  add constraint posts_post_kind_check
  check (post_kind in ('post', 'news', 'activity', 'repost'));

create unique index if not exists uniq_posts_official_source
  on public.posts (source_type, source_id)
  where source_type in ('news', 'activity') and source_id is not null;
create index if not exists idx_posts_repost_source
  on public.posts (repost_of_post_id, created_at desc)
  where repost_of_post_id is not null;

create or replace function public.enforce_forum_post_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if new.post_kind in ('news', 'activity') and new.source_type in ('news', 'activity') then
    return new;
  end if;

  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'FORUM_RATE_LIMIT:NOT_AUTHENTICATED:请先登录后再发布';
  end if;
  if new.author_id is distinct from v_user_id then
    raise exception using errcode = 'P0001', message = 'FORUM_RATE_LIMIT:AUTHOR_MISMATCH:只能以当前登录账号发布内容';
  end if;
  if public.current_user_is_admin() then
    return new;
  end if;
  if exists (select 1 from public.posts p where p.author_id = v_user_id and p.created_at >= now() - interval '30 seconds') then
    perform public.log_forum_rate_limit_event(v_user_id, 'post', 'POST_COOLDOWN', new.id);
    raise exception using errcode = 'P0001', message = 'FORUM_RATE_LIMIT:POST_COOLDOWN:发布太频繁了，请 30 秒后再试';
  end if;
  if (select count(*) from public.posts p where p.author_id = v_user_id and p.created_at >= now() - interval '10 minutes') >= 5 then
    perform public.log_forum_rate_limit_event(v_user_id, 'post', 'POST_10M_LIMIT', new.id);
    raise exception using errcode = 'P0001', message = 'FORUM_RATE_LIMIT:POST_10M_LIMIT:短时间内发布帖子较多，请稍后再试';
  end if;
  return new;
end;
$$;

create or replace function public.sync_official_forum_card()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := tg_argv[0];
  v_title text;
  v_body text;
  v_content text;
  v_date timestamptz;
begin
  if v_type = 'news' then
    v_title := new.title;
    v_body := coalesce(new.excerpt, new.content, '');
    v_content := format('【新闻】%s%s%s', v_title, chr(10), v_body);
    v_date := coalesce(new.created_at, now());
  else
    v_title := new.title;
    v_body := coalesce(new.description, '');
    v_content := format('【活动】%s%s%s', v_title, chr(10), v_body);
    v_date := coalesce(new.created_at, now());
  end if;

  insert into public.posts (
    content, title, body, author_id, author_username, status, tag, cover_image_url,
    post_kind, source_type, source_id, created_at, updated_at
  ) values (
    v_content, v_title, v_body, null, '方块之家', 'approved', 'daily',
    coalesce(new.image, ''), v_type, v_type, new.id::text, v_date, now()
  )
  on conflict (source_type, source_id) where source_type in ('news', 'activity') and source_id is not null
  do update set
    content = excluded.content,
    title = excluded.title,
    body = excluded.body,
    tag = excluded.tag,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_sync_news_forum_card on public.news;
create trigger trg_sync_news_forum_card
after insert or update of title, excerpt, content, date on public.news
for each row execute function public.sync_official_forum_card('news');

drop trigger if exists trg_sync_activity_forum_card on public.activities;
create trigger trg_sync_activity_forum_card
after insert or update of title, description, date on public.activities
for each row execute function public.sync_official_forum_card('activity');

-- Backfill published content that predates this integration. Assigning the
-- title to itself still fires the column-specific trigger without changing it.
update public.news set title = title;
update public.activities set title = title;

create or replace function public.create_forum_quote_repost(
  p_post_id uuid,
  p_commentary text
)
returns public.posts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text;
  v_source public.posts;
  v_result public.posts;
  v_commentary text := nullif(trim(coalesce(p_commentary, '')), '');
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHENTICATED:请先登录后再转发';
  end if;
  if v_commentary is null or char_length(v_commentary) > 2000 then
    raise exception using errcode = '22023', message = '转发留言不能为空且不能超过 2000 字';
  end if;

  select * into v_source
    from public.posts
   where id = p_post_id and status in ('approved', 'limited');
  if not found then
    raise exception using errcode = 'P0002', message = '原帖子不存在或暂不可见';
  end if;

  select username into v_username from public.profiles where id = v_user_id;
  insert into public.posts (
    content, title, body, author_id, author_username, status, tag,
    post_kind, repost_of_post_id
  ) values (
    v_commentary, null, v_commentary, v_user_id, coalesce(v_username, '用户'),
    'approved', coalesce(nullif(v_source.tag, ''), 'daily'), 'repost', v_source.id
  ) returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.create_forum_quote_repost(uuid, text) from public, anon;
grant execute on function public.create_forum_quote_repost(uuid, text) to authenticated;
grant execute on function public.create_forum_quote_repost(uuid, text) to service_role;

comment on column public.posts.post_kind is 'Forum content kind: post, news, activity, or repost';
comment on column public.posts.source_type is 'Official source type for synchronized cards';
comment on column public.posts.source_id is 'Official source identifier serialized as text';
comment on column public.posts.repost_of_post_id is 'Quoted source post for a user repost';

commit;
