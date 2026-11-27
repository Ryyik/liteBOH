-- 收紧高风险 RPC，修复经验值发放，并收敛云分享 token-only 接口。

begin;

create or replace function public.award_forum_experience(p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user_id uuid := auth.uid();
  v_amount integer;
begin
  if v_user_id is null then
    return false;
  end if;

  v_amount := case lower(trim(coalesce(p_reason, '')))
    when 'post' then 20
    when 'reply' then 10
    when 'like' then 2
    when 'be_liked' then 5
    else 0
  end;

  if v_amount = 0 then
    raise exception 'invalid experience reward reason';
  end if;

  update public.profiles
     set experience = coalesce(experience, 0) + v_amount
   where id = v_user_id;

  return found;
end;
$fn$;

revoke all on function public.award_forum_experience(text) from public, anon, authenticated;
grant execute on function public.award_forum_experience(text) to authenticated, service_role;

drop function if exists public.increment_xp(uuid, integer);

revoke execute on function public.reserve_ai_points(uuid, uuid, text, integer, numeric)
  from authenticated, public;
revoke execute on function public.cleanup_lottery_scheduler_logs(integer)
  from anon, public;
revoke execute on function public.execute_due_lottery_draws(integer, text)
  from anon, public;
revoke execute on function public.archive_expired_completed_gifts(integer)
  from authenticated, public;
revoke execute on function public.refresh_forum_post_counters(uuid)
  from authenticated, public;
revoke execute on function public.record_lottery_join_attempt(uuid, uuid, text, text)
  from authenticated, public;
revoke execute on function public.log_forum_rate_limit_event(uuid, text, text, uuid)
  from authenticated, public;
revoke execute on function public.boh_tier_alias(text) from anon, public;
revoke execute on function public.boh_tier_rank(text) from anon, public;

drop policy if exists xmas_exchange_matches_no_client_access on public.xmas_exchange_matches;
create policy xmas_exchange_matches_no_client_access
  on public.xmas_exchange_matches
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop function if exists public.get_my_boh_cloud_share_viewers(integer, text);
drop function if exists public.upsert_my_boh_cloud_share_channel(boolean, text, text);
drop function if exists public.set_my_boh_cloud_share_description(text, text);
drop function if exists public.disable_my_boh_cloud_share_channel(text);
drop function if exists public.set_my_boh_cloud_share_visibility(text);

create or replace function public.get_my_boh_cloud_share_channel()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user_id uuid := auth.uid();
  v_channel public.boh_cloud_share_channels%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  select *
    into v_channel
    from public.boh_cloud_share_channels
   where user_id = v_user_id
     and coalesce(visibility, 'token') = 'token'
   limit 1;

  if not found then
    return public.upsert_my_boh_cloud_share_channel(false, null);
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', 'OK',
    'channel', public.build_boh_cloud_share_channel_payload(v_channel)
  );
end;
$fn$;

create or replace function public.upsert_my_boh_cloud_share_channel(
  p_regenerate boolean default false,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user_id uuid := auth.uid();
  v_channel public.boh_cloud_share_channels%rowtype;
  v_next_token text;
  v_attempt integer := 0;
  v_description text := left(coalesce(p_description, ''), 160);
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  select *
    into v_channel
    from public.boh_cloud_share_channels
   where user_id = v_user_id
     and coalesce(visibility, 'token') = 'token'
   limit 1;

  if not found then
    loop
      v_attempt := v_attempt + 1;
      if v_attempt > 8 then
        return jsonb_build_object('ok', false, 'message', 'TOKEN_GENERATION_FAILED');
      end if;

      v_next_token := public.generate_boh_cloud_share_token(16);
      begin
        insert into public.boh_cloud_share_channels (
          user_id,
          share_token,
          is_active,
          visibility,
          description
        )
        values (
          v_user_id,
          v_next_token,
          true,
          'token',
          v_description
        )
        returning * into v_channel;
        exit;
      exception
        when unique_violation then
          null;
      end;
    end loop;
  elsif p_regenerate then
    loop
      v_attempt := v_attempt + 1;
      if v_attempt > 8 then
        return jsonb_build_object('ok', false, 'message', 'TOKEN_GENERATION_FAILED');
      end if;

      v_next_token := public.generate_boh_cloud_share_token(16);
      begin
        update public.boh_cloud_share_channels
           set share_token = v_next_token,
               is_active = true,
               visibility = 'token',
               description = case when p_description is null then description else v_description end,
               updated_at = now()
         where id = v_channel.id
         returning * into v_channel;
        exit;
      exception
        when unique_violation then
          null;
      end;
    end loop;
  else
    update public.boh_cloud_share_channels
       set is_active = true,
           visibility = 'token',
           description = case when p_description is null then description else v_description end,
           updated_at = now()
     where id = v_channel.id
     returning * into v_channel;
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', 'OK',
    'channel', public.build_boh_cloud_share_channel_payload(v_channel)
  );
end;
$fn$;

create or replace function public.get_my_boh_cloud_share_viewers(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_viewers jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'viewer_user_id', v.viewer_user_id,
        'viewer_username', coalesce(nullif(p.username, ''), v.viewer_username, ''),
        'viewer_avatar_url', coalesce(nullif(p.avatar_url, ''), v.viewer_avatar_url, ''),
        'view_count', v.view_count,
        'first_viewed_at', v.first_viewed_at,
        'last_viewed_at', v.last_viewed_at
      )
      order by v.last_viewed_at desc
    ),
    '[]'::jsonb
  )
    into v_viewers
    from (
      select v.*
        from public.boh_cloud_share_viewers v
        join public.boh_cloud_share_channels c on c.id = v.channel_id
       where v.owner_user_id = v_user_id
         and coalesce(c.visibility, 'token') = 'token'
       order by v.last_viewed_at desc
       limit v_limit
    ) v
    left join public.profiles p on p.id = v.viewer_user_id;

  return jsonb_build_object(
    'ok', true,
    'message', 'OK',
    'viewers', v_viewers
  );
end;
$fn$;

create or replace function public.disable_my_boh_cloud_share_channel()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user_id uuid := auth.uid();
  v_channel public.boh_cloud_share_channels%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  update public.boh_cloud_share_channels
     set is_active = false,
         visibility = 'token',
         updated_at = now()
   where user_id = v_user_id
     and coalesce(visibility, 'token') = 'token'
   returning * into v_channel;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'CHANNEL_NOT_FOUND');
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', 'OK',
    'channel', public.build_boh_cloud_share_channel_payload(v_channel)
  );
end;
$fn$;

create or replace function public.set_my_boh_cloud_share_description(p_description text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
begin
  return public.upsert_my_boh_cloud_share_channel(false, p_description);
end;
$fn$;

revoke all on function public.get_my_boh_cloud_share_channel() from public, anon, authenticated;
revoke all on function public.get_my_boh_cloud_share_channels() from public, anon, authenticated;
revoke all on function public.get_my_boh_cloud_share_viewers(integer) from public, anon, authenticated;
revoke all on function public.upsert_my_boh_cloud_share_channel(boolean, text) from public, anon, authenticated;
revoke all on function public.disable_my_boh_cloud_share_channel() from public, anon, authenticated;
revoke all on function public.set_my_boh_cloud_share_description(text) from public, anon, authenticated;
revoke all on function public.build_boh_cloud_share_channel_payload(public.boh_cloud_share_channels) from public, anon, authenticated;
revoke all on function public.generate_boh_cloud_share_token(integer) from public, anon, authenticated;
revoke all on function public.normalize_boh_cloud_share_token(text) from public, anon, authenticated;

grant execute on function public.get_my_boh_cloud_share_channel() to authenticated, service_role;
grant execute on function public.get_my_boh_cloud_share_channels() to authenticated, service_role;
grant execute on function public.get_my_boh_cloud_share_viewers(integer) to authenticated, service_role;
grant execute on function public.upsert_my_boh_cloud_share_channel(boolean, text) to authenticated, service_role;
grant execute on function public.disable_my_boh_cloud_share_channel() to authenticated, service_role;
grant execute on function public.set_my_boh_cloud_share_description(text) to authenticated, service_role;
grant execute on function public.build_boh_cloud_share_channel_payload(public.boh_cloud_share_channels) to service_role;
grant execute on function public.generate_boh_cloud_share_token(integer) to service_role;
grant execute on function public.normalize_boh_cloud_share_token(text) to service_role;

drop function if exists public.get_my_cloud_entry_summaries(uuid, integer, date, date);
drop function if exists public.get_my_cloud_entry_summaries(uuid, integer, date, date, integer, text, text);
drop function if exists public.list_forum_posts_v2(integer, integer, text, uuid, boolean, text, text, uuid[], text);
drop function if exists public.archive_expired_completed_gifts(integer);
drop function if exists public.list_public_bohai_modes();
drop view if exists public.bohai_model_configs;

notify pgrst, 'reload schema';

commit;
