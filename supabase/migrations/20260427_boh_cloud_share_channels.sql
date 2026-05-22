begin;

create table if not exists public.boh_cloud_share_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  share_token text not null unique,
  is_active boolean not null default true,
  view_count integer not null default 0 check (view_count >= 0),
  last_viewed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint boh_cloud_share_channels_token_len check (char_length(share_token) between 12 and 24),
  constraint boh_cloud_share_channels_token_fmt check (share_token ~ '^[A-Z0-9]+$')
);

create index if not exists idx_boh_cloud_share_channels_active_token
  on public.boh_cloud_share_channels (share_token)
  where is_active = true;

create index if not exists idx_boh_cloud_share_channels_user_active
  on public.boh_cloud_share_channels (user_id, is_active);

alter table public.boh_cloud_share_channels enable row level security;

drop policy if exists boh_cloud_share_channels_select_own on public.boh_cloud_share_channels;
create policy boh_cloud_share_channels_select_own
  on public.boh_cloud_share_channels
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists boh_cloud_share_channels_insert_own on public.boh_cloud_share_channels;
create policy boh_cloud_share_channels_insert_own
  on public.boh_cloud_share_channels
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists boh_cloud_share_channels_update_own on public.boh_cloud_share_channels;
create policy boh_cloud_share_channels_update_own
  on public.boh_cloud_share_channels
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists boh_cloud_share_channels_delete_own on public.boh_cloud_share_channels;
create policy boh_cloud_share_channels_delete_own
  on public.boh_cloud_share_channels
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.boh_cloud_share_channels to authenticated;
grant all on table public.boh_cloud_share_channels to service_role;

create or replace function public.normalize_boh_cloud_share_token(p_token text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(p_token, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function public.generate_boh_cloud_share_token(p_length integer default 16)
returns text
language plpgsql
volatile
as $$
declare
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_target_len integer := greatest(12, least(coalesce(p_length, 16), 24));
  v_result text := '';
  v_index integer;
begin
  for v_index in 1..v_target_len loop
    v_result := v_result || substr(v_chars, 1 + floor(random() * length(v_chars))::integer, 1);
  end loop;
  return v_result;
end;
$$;

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
    'view_count', p_channel.view_count,
    'last_viewed_at', p_channel.last_viewed_at,
    'created_at', p_channel.created_at,
    'updated_at', p_channel.updated_at
  );
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
   limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'message', 'EMPTY', 'channel', null);
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', 'OK',
    'channel', public.build_boh_cloud_share_channel_payload(v_channel)
  );
end;
$$;

create or replace function public.upsert_my_boh_cloud_share_channel(
  p_regenerate boolean default false
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
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  select *
    into v_channel
    from public.boh_cloud_share_channels
   where user_id = v_user_id
   limit 1;

  if not found then
    loop
      v_attempt := v_attempt + 1;
      if v_attempt > 8 then
        return jsonb_build_object('ok', false, 'message', 'TOKEN_GENERATION_FAILED');
      end if;

      begin
        v_next_token := public.generate_boh_cloud_share_token(16);
        insert into public.boh_cloud_share_channels (
          user_id,
          share_token,
          is_active,
          created_at,
          updated_at
        )
        values (
          v_user_id,
          v_next_token,
          true,
          now(),
          now()
        )
        returning *
          into v_channel;
        exit;
      exception
        when unique_violation then
          null;
      end;
    end loop;
  elsif p_regenerate or not v_channel.is_active or coalesce(v_channel.share_token, '') = '' then
    loop
      v_attempt := v_attempt + 1;
      if v_attempt > 8 then
        return jsonb_build_object('ok', false, 'message', 'TOKEN_GENERATION_FAILED');
      end if;

      begin
        v_next_token := public.generate_boh_cloud_share_token(16);
        update public.boh_cloud_share_channels
           set share_token = v_next_token,
               is_active = true,
               updated_at = now()
         where id = v_channel.id
         returning *
          into v_channel;
        exit;
      exception
        when unique_violation then
          null;
      end;
    end loop;
  else
    update public.boh_cloud_share_channels
       set is_active = true
     where id = v_channel.id
     returning *
      into v_channel;
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', 'OK',
    'channel', public.build_boh_cloud_share_channel_payload(v_channel)
  );
end;
$$;

create or replace function public.disable_my_boh_cloud_share_channel()
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
         updated_at = now()
   where user_id = v_user_id
   returning *
    into v_channel;

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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'user_id', e.user_id,
        'entry_date', e.entry_date,
        'legacy_note_date', e.legacy_note_date,
        'title', e.title,
        'entry_type', e.entry_type,
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
      'view_count', v_channel.view_count + 1,
      'last_viewed_at', now(),
      'created_at', v_channel.created_at,
      'updated_at', v_channel.updated_at
    ),
    'entries', v_entries
  );
end;
$$;

revoke all on function public.normalize_boh_cloud_share_token(text) from public;
revoke all on function public.generate_boh_cloud_share_token(integer) from public;
revoke all on function public.build_boh_cloud_share_channel_payload(public.boh_cloud_share_channels) from public;
revoke all on function public.get_my_boh_cloud_share_channel() from public;
revoke all on function public.upsert_my_boh_cloud_share_channel(boolean) from public;
revoke all on function public.disable_my_boh_cloud_share_channel() from public;
revoke all on function public.get_shared_boh_cloud_channel_by_token(text, integer) from public;

grant execute on function public.normalize_boh_cloud_share_token(text) to authenticated;
grant execute on function public.generate_boh_cloud_share_token(integer) to service_role;
grant execute on function public.build_boh_cloud_share_channel_payload(public.boh_cloud_share_channels) to service_role;
grant execute on function public.get_my_boh_cloud_share_channel() to authenticated;
grant execute on function public.get_my_boh_cloud_share_channel() to service_role;
grant execute on function public.upsert_my_boh_cloud_share_channel(boolean) to authenticated;
grant execute on function public.upsert_my_boh_cloud_share_channel(boolean) to service_role;
grant execute on function public.disable_my_boh_cloud_share_channel() to authenticated;
grant execute on function public.disable_my_boh_cloud_share_channel() to service_role;
grant execute on function public.get_shared_boh_cloud_channel_by_token(text, integer) to anon;
grant execute on function public.get_shared_boh_cloud_channel_by_token(text, integer) to authenticated;
grant execute on function public.get_shared_boh_cloud_channel_by_token(text, integer) to service_role;

comment on table public.boh_cloud_share_channels is 'BOH Cloud+ 共享频道令牌表，用户可通过令牌向他人开放只读访问。';
comment on column public.boh_cloud_share_channels.share_token is '共享频道访问令牌，由系统自动生成。';

commit;
