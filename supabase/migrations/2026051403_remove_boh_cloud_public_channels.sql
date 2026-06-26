begin;

alter table public.boh_cloud_entries
  add column if not exists visibility text not null default 'private';

alter table public.boh_cloud_share_channels
  add column if not exists visibility text not null default 'token';

alter table public.boh_cloud_share_channels
  add column if not exists description text not null default '';

alter table public.boh_cloud_entries
  alter column visibility set default 'private';

alter table public.boh_cloud_share_channels
  alter column visibility set default 'token';

alter table public.boh_cloud_share_channels
  alter column description set default '';

create table if not exists public.boh_cloud_share_viewers (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.boh_cloud_share_channels(id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  viewer_user_id uuid not null references public.profiles(id) on delete cascade,
  viewer_username text not null default '',
  viewer_avatar_url text not null default '',
  view_count integer not null default 1 check (view_count >= 1),
  first_viewed_at timestamp with time zone not null default now(),
  last_viewed_at timestamp with time zone not null default now(),
  constraint boh_cloud_share_viewers_distinct_users check (owner_user_id <> viewer_user_id)
);

create unique index if not exists uq_boh_cloud_share_viewers_channel_viewer
  on public.boh_cloud_share_viewers (channel_id, viewer_user_id);

create index if not exists idx_boh_cloud_share_viewers_owner_recent
  on public.boh_cloud_share_viewers (owner_user_id, last_viewed_at desc);

alter table public.boh_cloud_share_viewers enable row level security;

drop policy if exists boh_cloud_share_viewers_select_owner on public.boh_cloud_share_viewers;
create policy boh_cloud_share_viewers_select_owner
  on public.boh_cloud_share_viewers
  for select
  to authenticated
  using (auth.uid() = owner_user_id);

grant select on table public.boh_cloud_share_viewers to authenticated;
grant all on table public.boh_cloud_share_viewers to service_role;

-- Public channels are removed, but user Cloud+ entries are preserved.
update public.boh_cloud_entries
   set visibility = 'private'
 where visibility is distinct from 'private';

delete from public.boh_cloud_share_channels
 where visibility = 'public';

update public.boh_cloud_share_channels
   set visibility = 'token',
       description = left(coalesce(description, ''), 160)
 where visibility is distinct from 'token'
    or description is null
    or char_length(coalesce(description, '')) > 160;

alter table public.boh_cloud_entries
  alter column visibility set not null;

alter table public.boh_cloud_share_channels
  alter column visibility set not null;

alter table public.boh_cloud_share_channels
  alter column description set not null;

alter table public.boh_cloud_entries
  drop constraint if exists boh_cloud_entries_visibility_chk;

alter table public.boh_cloud_entries
  add constraint boh_cloud_entries_visibility_chk
  check (visibility = 'private');

alter table public.boh_cloud_share_channels
  drop constraint if exists boh_cloud_share_channels_visibility_chk;

alter table public.boh_cloud_share_channels
  add constraint boh_cloud_share_channels_visibility_chk
  check (visibility = 'token');

alter table public.boh_cloud_share_channels
  drop constraint if exists boh_cloud_share_channels_description_len_chk;

alter table public.boh_cloud_share_channels
  add constraint boh_cloud_share_channels_description_len_chk
  check (char_length(description) <= 160);

drop function if exists public.list_public_boh_cloud_share_channels(integer, text);
drop function if exists public.get_my_boh_cloud_channel_subscriptions(integer);
drop function if exists public.get_subscribed_boh_cloud_channel_content(uuid, integer);
drop function if exists public.subscribe_public_boh_cloud_channel(uuid);
drop function if exists public.unsubscribe_public_boh_cloud_channel(uuid);
drop function if exists public.list_boh_cloud_channel_comments(uuid, integer);
drop function if exists public.create_boh_cloud_channel_comment(uuid, text, uuid);
drop function if exists public.delete_boh_cloud_channel_comment(uuid);

drop table if exists public.boh_cloud_channel_comments cascade;
drop table if exists public.boh_cloud_channel_subscriptions cascade;

drop index if exists public.idx_boh_cloud_share_channels_public;
drop index if exists public.idx_boh_cloud_entries_user_visibility_updated;

create or replace function public.build_boh_cloud_share_channel_payload(
  p_channel public.boh_cloud_share_channels
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p_channel.id,
    'user_id', p_channel.user_id,
    'share_token', p_channel.share_token,
    'is_active', p_channel.is_active,
    'visibility', coalesce(p_channel.visibility, 'token'),
    'description', coalesce(p_channel.description, ''),
    'view_count', p_channel.view_count,
    'last_viewed_at', p_channel.last_viewed_at,
    'created_at', p_channel.created_at,
    'updated_at', p_channel.updated_at
  );
$$;

drop function if exists public.upsert_my_boh_cloud_share_channel(boolean);
drop function if exists public.upsert_my_boh_cloud_share_channel(boolean, text);
drop function if exists public.upsert_my_boh_cloud_share_channel(boolean, text, text);
create or replace function public.upsert_my_boh_cloud_share_channel(
  p_regenerate boolean default false,
  p_visibility text default 'token',
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.get_my_boh_cloud_share_channel()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    return public.upsert_my_boh_cloud_share_channel(false, 'token', null);
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', 'OK',
    'channel', public.build_boh_cloud_share_channel_payload(v_channel)
  );
end;
$$;

create or replace function public.get_my_boh_cloud_share_channels()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  v_payload := public.get_my_boh_cloud_share_channel();
  if coalesce((v_payload->>'ok')::boolean, false) is false then
    return v_payload;
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', 'OK',
    'channels', jsonb_build_array(v_payload->'channel')
  );
end;
$$;

drop function if exists public.disable_my_boh_cloud_share_channel();
create or replace function public.disable_my_boh_cloud_share_channel(
  p_visibility text default 'token'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.set_my_boh_cloud_share_visibility(
  p_visibility text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.upsert_my_boh_cloud_share_channel(false, 'token', null);
end;
$$;

create or replace function public.set_my_boh_cloud_share_description(
  p_description text,
  p_visibility text default 'token'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.upsert_my_boh_cloud_share_channel(false, 'token', p_description);
end;
$$;

drop function if exists public.get_my_boh_cloud_share_viewers(integer);
drop function if exists public.get_my_boh_cloud_share_viewers(integer, text);
create or replace function public.get_my_boh_cloud_share_viewers(
  p_limit integer default 50,
  p_visibility text default 'token'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.get_shared_boh_cloud_channel_by_token(
  p_share_token text,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := public.normalize_boh_cloud_share_token(p_share_token);
  v_limit integer := greatest(1, least(coalesce(p_limit, 500), 500));
  v_channel public.boh_cloud_share_channels%rowtype;
  v_viewer_id uuid := auth.uid();
  v_viewer_username text := '';
  v_viewer_avatar_url text := '';
  v_has_viewer_profile boolean := false;
  v_owner_username text := '';
  v_owner_nickname text := '';
  v_owner_avatar_url text := '';
  v_entries jsonb := '[]'::jsonb;
begin
  if char_length(v_token) < 12 then
    return jsonb_build_object('ok', false, 'message', 'INVALID_TOKEN');
  end if;

  select c.*
    into v_channel
    from public.boh_cloud_share_channels c
   where c.share_token = v_token
     and c.is_active = true
     and coalesce(c.visibility, 'token') = 'token'
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'TOKEN_NOT_FOUND');
  end if;

  select
    coalesce(p.username, ''),
    coalesce(p.username, ''),
    coalesce(p.avatar_url, '')
    into v_owner_username, v_owner_nickname, v_owner_avatar_url
    from public.profiles p
   where p.id = v_channel.user_id
   limit 1;

  update public.boh_cloud_share_channels
     set view_count = view_count + 1,
         last_viewed_at = now()
   where id = v_channel.id;

  if v_viewer_id is not null and v_viewer_id <> v_channel.user_id then
    select coalesce(p.username, ''), coalesce(p.avatar_url, '')
      into v_viewer_username, v_viewer_avatar_url
      from public.profiles p
     where p.id = v_viewer_id
     limit 1;

    v_has_viewer_profile := found;
  end if;

  if v_has_viewer_profile then
    insert into public.boh_cloud_share_viewers (
      channel_id,
      owner_user_id,
      viewer_user_id,
      viewer_username,
      viewer_avatar_url,
      view_count,
      first_viewed_at,
      last_viewed_at
    )
    values (
      v_channel.id,
      v_channel.user_id,
      v_viewer_id,
      v_viewer_username,
      v_viewer_avatar_url,
      1,
      now(),
      now()
    )
    on conflict (channel_id, viewer_user_id)
    do update set
      viewer_username = excluded.viewer_username,
      viewer_avatar_url = excluded.viewer_avatar_url,
      view_count = public.boh_cloud_share_viewers.view_count + 1,
      last_viewed_at = now();
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'user_id', e.user_id,
        'entry_date', e.entry_date,
        'legacy_note_date', e.legacy_note_date,
        'title', e.title,
        'entry_type', e.entry_type,
        'visibility', coalesce(e.visibility, 'private'),
        'content_text', e.content_text,
        'content_blocks', e.content_blocks,
        'cover_image_url', e.cover_image_url,
        'mood', e.mood,
        'source', e.source,
        'created_at', e.created_at,
        'updated_at', e.updated_at
      )
      order by e.updated_at desc, e.created_at desc
    ),
    '[]'::jsonb
  )
    into v_entries
    from (
      select *
        from public.boh_cloud_entries
       where user_id = v_channel.user_id
       order by updated_at desc, created_at desc
       limit v_limit
    ) e;

  return jsonb_build_object(
    'ok', true,
    'message', 'OK',
    'channel', jsonb_build_object(
      'id', v_channel.id,
      'user_id', v_channel.user_id,
      'owner_username', v_owner_username,
      'owner_nickname', v_owner_nickname,
      'owner_avatar_url', v_owner_avatar_url,
      'share_token', v_channel.share_token,
      'is_active', v_channel.is_active,
      'visibility', 'token',
      'description', coalesce(v_channel.description, ''),
      'view_count', v_channel.view_count + 1,
      'last_viewed_at', now(),
      'created_at', v_channel.created_at,
      'updated_at', v_channel.updated_at
    ),
    'entries', v_entries
  );
end;
$$;

revoke all on function public.upsert_my_boh_cloud_share_channel(boolean, text, text) from public;
revoke all on function public.get_my_boh_cloud_share_channel() from public;
revoke all on function public.get_my_boh_cloud_share_channels() from public;
revoke all on function public.disable_my_boh_cloud_share_channel(text) from public;
revoke all on function public.set_my_boh_cloud_share_visibility(text) from public;
revoke all on function public.set_my_boh_cloud_share_description(text, text) from public;
revoke all on function public.get_my_boh_cloud_share_viewers(integer, text) from public;
revoke all on function public.get_shared_boh_cloud_channel_by_token(text, integer) from public;

grant execute on function public.upsert_my_boh_cloud_share_channel(boolean, text, text) to authenticated;
grant execute on function public.upsert_my_boh_cloud_share_channel(boolean, text, text) to service_role;
grant execute on function public.get_my_boh_cloud_share_channel() to authenticated;
grant execute on function public.get_my_boh_cloud_share_channel() to service_role;
grant execute on function public.get_my_boh_cloud_share_channels() to authenticated;
grant execute on function public.get_my_boh_cloud_share_channels() to service_role;
grant execute on function public.disable_my_boh_cloud_share_channel(text) to authenticated;
grant execute on function public.disable_my_boh_cloud_share_channel(text) to service_role;
grant execute on function public.set_my_boh_cloud_share_visibility(text) to authenticated;
grant execute on function public.set_my_boh_cloud_share_visibility(text) to service_role;
grant execute on function public.set_my_boh_cloud_share_description(text, text) to authenticated;
grant execute on function public.set_my_boh_cloud_share_description(text, text) to service_role;
grant execute on function public.get_my_boh_cloud_share_viewers(integer, text) to authenticated;
grant execute on function public.get_my_boh_cloud_share_viewers(integer, text) to service_role;
grant execute on function public.get_shared_boh_cloud_channel_by_token(text, integer) to anon;
grant execute on function public.get_shared_boh_cloud_channel_by_token(text, integer) to authenticated;
grant execute on function public.get_shared_boh_cloud_channel_by_token(text, integer) to service_role;

comment on column public.boh_cloud_share_channels.visibility is 'Cloud+ 频道可见性：仅支持 token 私密令牌访问。公开频道功能已卸载。';
comment on column public.boh_cloud_share_channels.description is 'Cloud+ 私密令牌频道描述，最多 160 字。';
comment on column public.boh_cloud_entries.visibility is 'Cloud+ 内容可见性：仅支持 private 私密内容。公开频道功能已卸载。';
comment on function public.get_my_boh_cloud_share_channels() is '读取当前用户的 BOH Cloud+ 私密令牌频道。公开频道功能已卸载。';
comment on function public.get_shared_boh_cloud_channel_by_token(text, integer) is '按私密访问令牌读取 BOH Cloud+ 只读共享频道。';

commit;
