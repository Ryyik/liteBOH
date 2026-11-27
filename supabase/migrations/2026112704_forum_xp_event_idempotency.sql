-- 论坛经验按真实事件幂等发放，堵住直接重复调用 RPC 自刷。

begin;

create table if not exists public.forum_experience_awards (
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('post', 'reply', 'like', 'be_liked')),
  event_id uuid not null,
  awarded_at timestamptz not null default now(),
  primary key (user_id, reason, event_id)
);

revoke all on table public.forum_experience_awards from public, anon, authenticated;
grant all on table public.forum_experience_awards to service_role;

create or replace function public.award_forum_experience(p_reason text, p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user_id uuid := auth.uid();
  v_reason text := lower(trim(coalesce(p_reason, '')));
  v_amount integer;
  v_event_ok boolean := false;
  v_inserted boolean := false;
begin
  if v_user_id is null or p_event_id is null then
    return false;
  end if;

  v_amount := case v_reason
    when 'post' then 20
    when 'reply' then 10
    when 'like' then 2
    when 'be_liked' then 5
    else 0
  end;
  if v_amount = 0 then
    raise exception 'invalid experience reward reason';
  end if;

  if v_reason = 'post' then
    select exists (
      select 1 from public.posts where id = p_event_id and author_id = v_user_id
    ) into v_event_ok;
  elsif v_reason = 'reply' then
    select exists (
      select 1 from public.comments where id = p_event_id and author_id = v_user_id
    ) into v_event_ok;
  elsif v_reason = 'like' then
    select exists (
      select 1 from public.likes where post_id = p_event_id and user_id = v_user_id
    ) into v_event_ok;
  elsif v_reason = 'be_liked' then
    select exists (
      select 1
        from public.likes l
        join public.posts p on p.id = l.post_id
       where l.id = p_event_id and p.author_id = v_user_id
    ) into v_event_ok;
  end if;

  if not v_event_ok then
    return false;
  end if;

  insert into public.forum_experience_awards (user_id, reason, event_id)
  values (v_user_id, v_reason, p_event_id)
  on conflict do nothing
  returning true into v_inserted;

  if not v_inserted then
    return false;
  end if;

  update public.profiles
     set experience = coalesce(experience, 0) + v_amount
   where id = v_user_id;

  return found;
end;
$fn$;

revoke all on function public.award_forum_experience(text, uuid) from public, anon, authenticated;
grant execute on function public.award_forum_experience(text, uuid) to authenticated, service_role;
drop function if exists public.award_forum_experience(text);

notify pgrst, 'reload schema';

commit;
