-- 评论点赞：comment_likes 账本 + comments.like_count 计数列 + toggle RPC
-- 设计跟随帖子点赞既有模式（likes 表 + toggle_forum_like RPC）：
--   1) comment_likes append-only 账本，PK(comment_id, user_id) 防重复
--   2) comments.like_count 由触发器原子维护（security definer 绕过 comments 的 update RLS）
--   3) toggle_forum_comment_like 返回 {action, like_count, is_liked}，未登录显式报错

create table if not exists public.comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);

alter table public.comment_likes enable row level security;

create policy "comment_likes_select_authenticated" on public.comment_likes
  for select to authenticated using (true);

create policy "comment_likes_insert_own" on public.comment_likes
  for insert to authenticated with check (user_id = auth.uid());

create policy "comment_likes_delete_own" on public.comment_likes
  for delete to authenticated using (user_id = auth.uid());

grant select on public.comment_likes to anon, authenticated;
grant insert, delete on public.comment_likes to authenticated;

alter table public.comments add column if not exists like_count integer not null default 0;

create or replace function public.boh_comment_like_count_delta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') then
    update public.comments set like_count = like_count + 1 where id = new.comment_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.comments set like_count = greatest(0, like_count - 1) where id = old.comment_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_comment_likes_count on public.comment_likes;
create trigger trg_comment_likes_count
after insert or delete on public.comment_likes
for each row execute function public.boh_comment_like_count_delta();

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

  select like_count into v_count from public.comments where id = p_comment_id;

  return query select
    case when v_existing is not null then 'unliked' else 'liked' end::text,
    coalesce(v_count, 0)::integer,
    (v_existing is null)::boolean;
end;
$$;

grant execute on function public.toggle_forum_comment_like(uuid) to authenticated;

notify pgrst, 'reload schema';
