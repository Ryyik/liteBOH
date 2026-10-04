-- 修复评论点赞 42702：column reference "like_count" is ambiguous
--
-- 起因（2026-10-03 线上实测复现）：
--   toggle_forum_comment_like 的 RETURNS TABLE 里有一个 OUT 参数叫 like_count，
--   函数体内 `select like_count into v_count from public.comments where id = ...`
--   用的是**裸列名**。PL/pgSQL 解析时 like_count 既可指 OUT 参数、又可指
--   comments.like_count 列，于是报 42702（ambiguous），点赞整条链路失败。
--   对比：toggle_forum_like 写的是 `select p.like_count ...`（带别名限定），所以帖子点赞没事。
--
-- 修法：把列名限定成 c.like_count（只改限定，语义完全不变）。
--   已验证：同一事务里以 authenticated + jwt sub 身份调用返回 liked/4/true。

create or replace function public.toggle_forum_comment_like(p_comment_id uuid)
returns table (action text, like_count integer, is_liked boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_existing uuid;
  v_count integer;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select id into v_existing from public.comment_likes
    where comment_id = p_comment_id and user_id = v_user;

  if v_existing is not null then
    delete from public.comment_likes where id = v_existing;
  else
    insert into public.comment_likes (comment_id, user_id) values (p_comment_id, v_user);
  end if;

  -- ⚠️ 必须写 c.like_count（限定表别名）。裸写 like_count 会与 OUT 参数同名 → 42702。
  select c.like_count into v_count from public.comments c where c.id = p_comment_id;

  return query select
    case when v_existing is not null then 'unliked' else 'liked' end::text,
    coalesce(v_count, 0)::integer,
    (v_existing is null)::boolean;
end;
$$;

grant execute on function public.toggle_forum_comment_like(uuid) to authenticated;

notify pgrst, 'reload schema';
