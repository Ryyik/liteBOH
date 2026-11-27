-- 复核加固：likes 防伪造/自赞，XP 防历史重复与 be_liked 手刷，BOHAI 兼容视图收窄安全列。

begin;

drop policy if exists "Auth insert like" on public.likes;
drop policy if exists likes_insert_own on public.likes;
create policy likes_insert_own
  on public.likes
  for insert
  to anon, authenticated
  with check (
    (select auth.uid()) = user_id
    and not exists (
      select 1 from public.posts p
       where p.id = post_id and p.author_id = (select auth.uid())
    )
  );

create or replace function public.toggle_forum_like(p_post_id uuid)
returns table(action text, like_count bigint, is_liked boolean)
language plpgsql
security definer
set search_path = public
as $function$
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
    if exists (
      select 1 from public.posts p
       where p.id = p_post_id and p.author_id = v_user_id
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'FORUM_LIKE:SELF_LIKE:不能给自己的帖子点赞';
    end if;

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
$function$;

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

revoke all on table public.bolek_model_configs from anon, authenticated;
grant select (
  id, mode_id, display_name, tagline, description, provider, provider_label, model_id, api_url,
  capability, icon, temperature, top_p, frequency_penalty, max_tokens, status, sort_order,
  created_at, updated_at, min_tier, quota_multiplier
) on table public.bolek_model_configs to anon, authenticated;

drop policy if exists bohai_model_configs_public_read on public.bolek_model_configs;
create policy bohai_model_configs_public_read
  on public.bolek_model_configs
  for select
  to anon, authenticated
  using (true);

revoke all on table public.bohai_model_configs from public, anon, authenticated;
drop view if exists public.bohai_model_configs;
create view public.bohai_model_configs with (security_invoker = true) as
  select
    id, mode_id, display_name, tagline, description, provider, provider_label, model_id, api_url,
    capability, icon, temperature, top_p, frequency_penalty, max_tokens, status, sort_order,
    created_at, updated_at, min_tier, quota_multiplier
  from public.bolek_model_configs;
grant select on public.bohai_model_configs to anon, authenticated, service_role;

revoke all on function public.list_public_bohai_modes() from public, anon, authenticated;
grant execute on function public.list_public_bohai_modes() to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
