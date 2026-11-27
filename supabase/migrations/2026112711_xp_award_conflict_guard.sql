-- 修复 ON CONFLICT DO NOTHING 无行时 v_inserted 为 NULL，IF NOT NULL 不成立导致重复发奖。

begin;

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
  v_started_at constant timestamptz := timestamptz '2026-11-27 14:52:39+00';
begin
  if v_user_id is null or p_event_id is null then
    return false;
  end if;

  if v_reason not in ('post', 'reply', 'like') then
    raise exception 'invalid experience reward reason';
  end if;

  v_amount := case v_reason
    when 'post' then 20
    when 'reply' then 10
    when 'like' then 2
  end;

  if v_reason = 'post' then
    select exists (
      select 1 from public.posts
       where id = p_event_id and author_id = v_user_id and created_at >= v_started_at
    ) into v_event_ok;
  elsif v_reason = 'reply' then
    select exists (
      select 1 from public.comments
       where id = p_event_id and author_id = v_user_id and created_at >= v_started_at
    ) into v_event_ok;
  elsif v_reason = 'like' then
    select exists (
      select 1
        from public.likes l
        join public.posts p on p.id = l.post_id
       where l.post_id = p_event_id
         and l.user_id = v_user_id
         and p.author_id <> v_user_id
         and l.created_at >= v_started_at
    ) into v_event_ok;
  end if;

  if not v_event_ok then
    return false;
  end if;

  insert into public.forum_experience_awards (user_id, reason, event_id)
  values (v_user_id, v_reason, p_event_id)
  on conflict do nothing
  returning true into v_inserted;

  if v_inserted is distinct from true then
    return false;
  end if;

  update public.profiles
     set experience = coalesce(experience, 0) + v_amount
   where id = v_user_id;

  return found;
end;
$fn$;

notify pgrst, 'reload schema';

commit;
