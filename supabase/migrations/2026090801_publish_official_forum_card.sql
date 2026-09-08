-- 管理员「投稿到论坛」：把一条新闻/活动以官方卡形式发布到论坛信息流。
-- 背景：news/activities 的触发器（sync_official_forum_card）在 insert/update 时自动镜像官方卡，
-- 存量也已由 2026090704 回填；本 RPC 供管理后台/页面按钮显式触发：
--   - 卡已存在：不改动，返回 created = false（避免覆盖论坛侧已有的互动数据语境）
--   - 卡不存在（罕见：直接 SQL 写库未触发、触发器被禁用期间的新增等）：补建一张
-- 安全：security definer + 函数内校验管理员；不向 anon/public 授权。

begin;

create or replace function public.publish_official_forum_card(
  p_source_type text,
  p_source_id text
)
returns table (post_id uuid, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := lower(trim(coalesce(p_source_type, '')));
  v_source_id text := nullif(trim(coalesce(p_source_id, '')), '');
  v_news record;
  v_activity record;
  v_existing uuid;
  v_inserted public.posts;
begin
  if not public.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'FORBIDDEN:仅管理员可投稿官方内容';
  end if;

  if v_type not in ('news', 'activity') or v_source_id is null then
    raise exception using errcode = '22023', message = 'BAD_REQUEST:来源类型或 ID 无效';
  end if;

  -- 已有官方卡：幂等返回，不做更新（更新由源内容编辑触发器负责）
  select p.id into v_existing
    from public.posts p
   where p.source_type = v_type
     and p.source_id = v_source_id
   limit 1;
  if v_existing is not null then
    return query select v_existing, false;
    return;
  end if;

  if v_type = 'news' then
    select * into v_news from public.news where id::text = v_source_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'NOT_FOUND:新闻不存在';
    end if;
    insert into public.posts (
      content, title, body, author_id, author_username, status, tag, cover_image_url,
      post_kind, source_type, source_id, created_at, updated_at
    ) values (
      format('【新闻】%s%s%s', v_news.title, chr(10), coalesce(v_news.excerpt, v_news.content, '')),
      v_news.title,
      coalesce(v_news.excerpt, v_news.content, ''),
      null, '方块之家', 'approved', 'daily',
      coalesce(v_news.image, ''),
      'news', 'news', v_source_id,
      coalesce(v_news.created_at, now()), now()
    ) returning * into v_inserted;
  else
    select * into v_activity from public.activities where id::text = v_source_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'NOT_FOUND:活动不存在';
    end if;
    insert into public.posts (
      content, title, body, author_id, author_username, status, tag, cover_image_url,
      post_kind, source_type, source_id, created_at, updated_at
    ) values (
      format('【活动】%s%s%s', v_activity.title, chr(10), coalesce(v_activity.description, '')),
      v_activity.title,
      coalesce(v_activity.description, ''),
      null, '方块之家', 'approved', 'daily',
      coalesce(v_activity.image, ''),
      'activity', 'activity', v_source_id,
      coalesce(v_activity.created_at, now()), now()
    ) returning * into v_inserted;
  end if;

  return query select v_inserted.id, true;
end;
$$;

revoke all on function public.publish_official_forum_card(text, text) from public, anon;
grant execute on function public.publish_official_forum_card(text, text) to authenticated;
grant execute on function public.publish_official_forum_card(text, text) to service_role;

comment on function public.publish_official_forum_card(text, text) is
  '管理员投稿：把一条新闻/活动以官方卡形式发布到论坛；已存在则幂等返回 created=false。';

notify pgrst, 'reload schema';

commit;
