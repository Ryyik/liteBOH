begin;

-- =====================================================
-- 论坛 PostDetail N+1 查询优化
-- 1) get_comment_ancestors: 批量查询评论祖先链（替代 resolveRootCommentId 循环）
-- 2) get_comment_thread_previews: 批量查询楼中楼预览（替代 preloadChildReplyPreviews 逐条加载）
-- =====================================================

-- ---------------------------------------------------
-- 1. get_comment_ancestors
-- 给定目标评论，返回从目标到根评论的整条祖先链（含目标自身）
-- 深度上限 12，与前端循环次数一致
-- ---------------------------------------------------
create or replace function public.get_comment_ancestors(
  p_comment_id uuid,
  p_post_id uuid
)
returns table (
  id uuid,
  parent_id uuid,
  post_id uuid,
  status text,
  depth integer
)
language plpgsql
stable
set search_path = public
as $$
begin
  if p_comment_id is null or p_post_id is null then
    return;
  end if;

  return query
  with recursive chain as (
    -- 基础：目标评论自身（depth=0）
    select
      c.id,
      c.parent_id,
      c.post_id,
      coalesce(c.status, 'approved') as status,
      0 as depth
    from public.comments c
    where c.id = p_comment_id
      and c.post_id = p_post_id

    union all

    -- 递归：逐层向上找父评论
    select
      parent.id,
      parent.parent_id,
      parent.post_id,
      coalesce(parent.status, 'approved') as status,
      chain.depth + 1
    from public.comments parent
    join chain on chain.parent_id = parent.id
    where parent.post_id = p_post_id
      and chain.depth < 12
  )
  select
    chain.id,
    chain.parent_id,
    chain.post_id,
    chain.status,
    chain.depth
  from chain
  order by chain.depth asc;
end;
$$;

revoke all on function public.get_comment_ancestors(uuid, uuid) from public;
grant execute on function public.get_comment_ancestors(uuid, uuid) to anon;
grant execute on function public.get_comment_ancestors(uuid, uuid) to authenticated;
grant execute on function public.get_comment_ancestors(uuid, uuid) to service_role;

comment on function public.get_comment_ancestors(uuid, uuid) is '查询评论祖先链（从目标到根，含目标自身），深度上限 12';

-- ---------------------------------------------------
-- 2. get_comment_thread_previews
-- 给定一批顶层评论 ID，批量返回每条评论的子回复预览（最早 1 条）+ has_more
-- 返回结构与 list_forum_comment_thread 对齐，前端可复用状态写入逻辑
-- ---------------------------------------------------
create or replace function public.get_comment_thread_previews(
  p_post_id uuid,
  p_comment_ids uuid[]
)
returns table (
  root_comment_id uuid,
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
begin
  if p_post_id is null or p_comment_ids is null or array_length(p_comment_ids, 1) is null then
    return;
  end if;

  return query
  with recursive thread as (
    -- 基础：输入顶层评论的直接子回复
    -- root_id 记录所属的顶层评论 ID（即直接父 ID）
    select
      c.id,
      c.post_id,
      c.author_id,
      c.author_username,
      c.content,
      c.created_at,
      c.status,
      c.parent_id,
      c.reply_to_username,
      c.parent_id as root_id
    from public.comments c
    where c.post_id = p_post_id
      and c.parent_id = any(p_comment_ids)
      and coalesce(c.status, 'approved') = 'approved'

    union all

    -- 递归：更深层的回复继承 root_id
    select
      child.id,
      child.post_id,
      child.author_id,
      child.author_username,
      child.content,
      child.created_at,
      child.status,
      child.parent_id,
      child.reply_to_username,
      parent_thread.root_id
    from public.comments child
    join thread parent_thread on parent_thread.id = child.parent_id
    where child.post_id = p_post_id
      and coalesce(child.status, 'approved') = 'approved'
  ),
  ranked as (
    select
      t.root_id,
      t.id,
      t.post_id,
      t.author_id,
      t.author_username,
      t.content,
      t.created_at,
      t.status,
      t.parent_id,
      t.reply_to_username,
      row_number() over (partition by t.root_id order by t.created_at asc, t.id asc) as rn,
      count(*) over (partition by t.root_id) as total_count
    from thread t
  )
  select
    r.root_id as root_comment_id,
    r.id,
    r.post_id,
    r.author_id,
    r.author_username,
    r.content,
    coalesce(r.created_at, now()) as created_at,
    coalesce(r.status, 'approved') as status,
    r.parent_id,
    r.reply_to_username,
    pr.avatar_url as author_avatar_url,
    (r.total_count > 1) as has_more
  from ranked r
  left join public.profiles pr on pr.id = r.author_id
  where r.rn = 1;
end;
$$;

revoke all on function public.get_comment_thread_previews(uuid, uuid[]) from public;
grant execute on function public.get_comment_thread_previews(uuid, uuid[]) to anon;
grant execute on function public.get_comment_thread_previews(uuid, uuid[]) to authenticated;
grant execute on function public.get_comment_thread_previews(uuid, uuid[]) to service_role;

comment on function public.get_comment_thread_previews(uuid, uuid[]) is '批量查询多个顶层评论的子回复预览（每条最早 1 条 + has_more）';

notify pgrst, 'reload schema';

commit;
