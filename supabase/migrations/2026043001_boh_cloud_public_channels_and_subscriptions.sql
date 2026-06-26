begin;

alter table public.boh_cloud_share_channels
  add column if not exists visibility text not null default 'token';

alter table public.boh_cloud_share_channels
  add column if not exists description text not null default '';

alter table public.boh_cloud_entries
  add column if not exists visibility text not null default 'private';

alter table public.boh_cloud_share_channels
  drop constraint if exists boh_cloud_share_channels_user_id_key;

create unique index if not exists uq_boh_cloud_share_channels_user_visibility
  on public.boh_cloud_share_channels (user_id, visibility);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'boh_cloud_share_channels_visibility_chk'
       and conrelid = 'public.boh_cloud_share_channels'::regclass
  ) then
    alter table public.boh_cloud_share_channels
      add constraint boh_cloud_share_channels_visibility_chk
      check (visibility in ('token', 'public'));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'boh_cloud_share_channels_description_len_chk'
       and conrelid = 'public.boh_cloud_share_channels'::regclass
  ) then
    alter table public.boh_cloud_share_channels
      add constraint boh_cloud_share_channels_description_len_chk
      check (char_length(description) <= 160);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'boh_cloud_entries_visibility_chk'
       and conrelid = 'public.boh_cloud_entries'::regclass
  ) then
    alter table public.boh_cloud_entries
      add constraint boh_cloud_entries_visibility_chk
      check (visibility in ('private', 'public'));
  end if;
end;
$$;

create index if not exists idx_boh_cloud_share_channels_public
  on public.boh_cloud_share_channels (updated_at desc)
  where is_active = true and visibility = 'public';

create index if not exists idx_boh_cloud_entries_user_visibility_updated
  on public.boh_cloud_entries (user_id, visibility, updated_at desc);

create table if not exists public.boh_cloud_channel_subscriptions (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.boh_cloud_share_channels(id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  subscriber_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  constraint boh_cloud_channel_subscriptions_distinct_users check (owner_user_id <> subscriber_user_id)
);

create unique index if not exists uq_boh_cloud_channel_subscriptions_channel_subscriber
  on public.boh_cloud_channel_subscriptions (channel_id, subscriber_user_id);

create index if not exists idx_boh_cloud_channel_subscriptions_subscriber_recent
  on public.boh_cloud_channel_subscriptions (subscriber_user_id, created_at desc);

create index if not exists idx_boh_cloud_channel_subscriptions_owner_recent
  on public.boh_cloud_channel_subscriptions (owner_user_id, created_at desc);

alter table public.boh_cloud_channel_subscriptions enable row level security;

drop policy if exists boh_cloud_channel_subscriptions_select_related on public.boh_cloud_channel_subscriptions;
create policy boh_cloud_channel_subscriptions_select_related
  on public.boh_cloud_channel_subscriptions
  for select
  to authenticated
  using (auth.uid() = subscriber_user_id or auth.uid() = owner_user_id);

drop policy if exists boh_cloud_channel_subscriptions_insert_self on public.boh_cloud_channel_subscriptions;
create policy boh_cloud_channel_subscriptions_insert_self
  on public.boh_cloud_channel_subscriptions
  for insert
  to authenticated
  with check (auth.uid() = subscriber_user_id);

drop policy if exists boh_cloud_channel_subscriptions_delete_self on public.boh_cloud_channel_subscriptions;
create policy boh_cloud_channel_subscriptions_delete_self
  on public.boh_cloud_channel_subscriptions
  for delete
  to authenticated
  using (auth.uid() = subscriber_user_id);

grant select, insert, delete on table public.boh_cloud_channel_subscriptions to authenticated;
grant all on table public.boh_cloud_channel_subscriptions to service_role;

create table if not exists public.boh_cloud_channel_comments (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.boh_cloud_share_channels(id) on delete cascade,
  parent_id uuid references public.boh_cloud_channel_comments(id) on delete cascade,
  author_user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint boh_cloud_channel_comments_content_len check (char_length(trim(content)) between 1 and 800)
);

create index if not exists idx_boh_cloud_channel_comments_channel_recent
  on public.boh_cloud_channel_comments (channel_id, created_at desc);

create index if not exists idx_boh_cloud_channel_comments_parent
  on public.boh_cloud_channel_comments (parent_id, created_at asc);

alter table public.boh_cloud_channel_comments enable row level security;

drop policy if exists boh_cloud_channel_comments_select_public_related on public.boh_cloud_channel_comments;
create policy boh_cloud_channel_comments_select_public_related
  on public.boh_cloud_channel_comments
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.boh_cloud_share_channels c
       where c.id = channel_id
         and c.is_active = true
         and c.visibility = 'public'
         and (
           c.user_id = auth.uid()
           or exists (
             select 1
               from public.boh_cloud_channel_subscriptions s
              where s.channel_id = c.id
                and s.subscriber_user_id = auth.uid()
           )
         )
    )
  );

drop policy if exists boh_cloud_channel_comments_insert_self on public.boh_cloud_channel_comments;
create policy boh_cloud_channel_comments_insert_self
  on public.boh_cloud_channel_comments
  for insert
  to authenticated
  with check (
    auth.uid() = author_user_id
    and exists (
      select 1
        from public.boh_cloud_share_channels c
       where c.id = channel_id
         and c.is_active = true
         and c.visibility = 'public'
         and (
           c.user_id = auth.uid()
           or exists (
             select 1
               from public.boh_cloud_channel_subscriptions s
              where s.channel_id = c.id
                and s.subscriber_user_id = auth.uid()
           )
         )
    )
  );

drop policy if exists boh_cloud_channel_comments_update_self on public.boh_cloud_channel_comments;
create policy boh_cloud_channel_comments_update_self
  on public.boh_cloud_channel_comments
  for update
  to authenticated
  using (auth.uid() = author_user_id)
  with check (auth.uid() = author_user_id);

drop policy if exists boh_cloud_channel_comments_delete_related on public.boh_cloud_channel_comments;
create policy boh_cloud_channel_comments_delete_related
  on public.boh_cloud_channel_comments
  for delete
  to authenticated
  using (
    auth.uid() = author_user_id
    or exists (
      select 1
        from public.boh_cloud_share_channels c
       where c.id = channel_id
         and c.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on table public.boh_cloud_channel_comments to authenticated;
grant all on table public.boh_cloud_channel_comments to service_role;

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

create or replace function public.get_my_boh_cloud_share_channels()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_channels jsonb := '[]'::jsonb;
  v_visibility text;
  v_is_active boolean;
  v_next_token text;
  v_attempt integer;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  foreach v_visibility in array array['token', 'public']
  loop
    if not exists (
      select 1
        from public.boh_cloud_share_channels c
       where c.user_id = v_user_id
         and c.visibility = v_visibility
    ) then
      v_attempt := 0;
      v_is_active := v_visibility = 'token';
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
            visibility,
            description,
            created_at,
            updated_at
          )
          values (
            v_user_id,
            v_next_token,
            v_is_active,
            v_visibility,
            '',
            now(),
            now()
          );
          exit;
        exception
          when unique_violation then
            null;
        end;
      end loop;
    end if;
  end loop;

  select coalesce(
    jsonb_agg(public.build_boh_cloud_share_channel_payload(c) order by c.visibility asc),
    '[]'::jsonb
  )
    into v_channels
    from public.boh_cloud_share_channels c
   where c.user_id = v_user_id;

  return jsonb_build_object('ok', true, 'message', 'OK', 'channels', v_channels);
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
   order by
     case when visibility = 'public' and is_active then 0 else 1 end,
     case when visibility = 'token' then 0 else 1 end,
     updated_at desc
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

drop function if exists public.upsert_my_boh_cloud_share_channel(boolean);
drop function if exists public.upsert_my_boh_cloud_share_channel(boolean, text);

create or replace function public.upsert_my_boh_cloud_share_channel(
  p_regenerate boolean default false,
  p_visibility text default null,
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
  v_next_visibility text := lower(trim(coalesce(p_visibility, '')));
  v_has_description boolean := p_description is not null;
  v_next_description text := left(trim(coalesce(p_description, '')), 160);
  v_attempt integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  if v_next_visibility not in ('token', 'public') then
    v_next_visibility := 'token';
  end if;

  select *
    into v_channel
    from public.boh_cloud_share_channels
   where user_id = v_user_id
     and visibility = v_next_visibility
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
          visibility,
          description,
          created_at,
          updated_at
        )
        values (
          v_user_id,
          v_next_token,
          true,
          v_next_visibility,
          case when v_has_description then v_next_description else '' end,
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
               description = case when v_has_description then v_next_description else description end,
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
       set is_active = true,
           description = case when v_has_description then v_next_description else description end,
           updated_at = now()
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
  v_visibility text := lower(trim(coalesce(p_visibility, 'token')));
  v_channel public.boh_cloud_share_channels%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;
  if v_visibility not in ('token', 'public') then
    return jsonb_build_object('ok', false, 'message', 'INVALID_VISIBILITY');
  end if;

  update public.boh_cloud_share_channels
     set is_active = false,
         updated_at = now()
   where user_id = v_user_id
     and visibility = v_visibility
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

create or replace function public.set_my_boh_cloud_share_visibility(
  p_visibility text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_visibility text := lower(trim(coalesce(p_visibility, '')));
  v_channel public.boh_cloud_share_channels%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;
  if v_visibility not in ('token', 'public') then
    return jsonb_build_object('ok', false, 'message', 'INVALID_VISIBILITY');
  end if;

  select *
    into v_channel
    from public.boh_cloud_share_channels
   where user_id = v_user_id
     and visibility = v_visibility
   limit 1;

  if not found then
    return public.upsert_my_boh_cloud_share_channel(false, v_visibility);
  end if;

  update public.boh_cloud_share_channels
     set is_active = true,
         updated_at = now()
   where id = v_channel.id
   returning *
    into v_channel;

  return jsonb_build_object(
    'ok', true,
    'message', 'OK',
    'channel', public.build_boh_cloud_share_channel_payload(v_channel)
  );
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
declare
  v_user_id uuid := auth.uid();
  v_description text := left(trim(coalesce(p_description, '')), 160);
  v_visibility text := lower(trim(coalesce(p_visibility, 'token')));
  v_channel public.boh_cloud_share_channels%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  select *
    into v_channel
    from public.boh_cloud_share_channels
   where user_id = v_user_id
     and visibility = v_visibility
   limit 1;

  if not found then
    return public.upsert_my_boh_cloud_share_channel(false, v_visibility, v_description);
  end if;

  update public.boh_cloud_share_channels
     set description = v_description,
         updated_at = now()
   where id = v_channel.id
   returning *
    into v_channel;

  return jsonb_build_object(
    'ok', true,
    'message', 'OK',
    'channel', public.build_boh_cloud_share_channel_payload(v_channel)
  );
end;
$$;

create or replace function public.list_public_boh_cloud_share_channels(
  p_limit integer default 24,
  p_query text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 24), 60));
  v_query text := lower(trim(coalesce(p_query, '')));
  v_channels jsonb := '[]'::jsonb;
begin
  select coalesce(jsonb_agg(row_payload order by latest_entry_at desc nulls last, updated_at desc), '[]'::jsonb)
    into v_channels
    from (
      select
        c.updated_at,
        latest.latest_entry_at,
        jsonb_build_object(
          'id', c.id,
          'user_id', c.user_id,
          'owner_username', coalesce(p.username, ''),
          'owner_nickname', coalesce(p.username, ''),
          'owner_avatar_url', coalesce(p.avatar_url, ''),
          'share_token', '',
          'is_active', c.is_active,
          'visibility', c.visibility,
          'description', coalesce(c.description, ''),
          'view_count', c.view_count,
          'last_viewed_at', c.last_viewed_at,
          'created_at', c.created_at,
          'updated_at', c.updated_at,
          'entry_count', coalesce(stats.entry_count, 0),
          'subscriber_count', coalesce(subs.subscriber_count, 0),
          'cover_image_url', coalesce(latest.cover_image_url, ''),
          'latest_entry_at', latest.latest_entry_at,
          'is_subscribed', exists (
            select 1
              from public.boh_cloud_channel_subscriptions mine
             where mine.channel_id = c.id
               and mine.subscriber_user_id = v_user_id
          )
        ) as row_payload
      from public.boh_cloud_share_channels c
      join public.profiles p on p.id = c.user_id
      left join lateral (
        select count(*)::integer as entry_count
          from public.boh_cloud_entries e
         where e.user_id = c.user_id
           and e.visibility = 'public'
      ) stats on true
      left join lateral (
        select count(*)::integer as subscriber_count
          from public.boh_cloud_channel_subscriptions s
         where s.channel_id = c.id
      ) subs on true
      left join lateral (
        select e.cover_image_url, e.updated_at as latest_entry_at
          from public.boh_cloud_entries e
         where e.user_id = c.user_id
           and e.visibility = 'public'
         order by e.updated_at desc, e.created_at desc
         limit 1
      ) latest on true
      where c.is_active = true
        and c.visibility = 'public'
        and (v_user_id is null or c.user_id <> v_user_id)
        and (
          v_query = ''
          or lower(coalesce(p.username, '')) like '%' || v_query || '%'
          or lower(coalesce(c.description, '')) like '%' || v_query || '%'
        )
      order by latest.latest_entry_at desc nulls last, c.updated_at desc
      limit v_limit
    ) rows;

  return jsonb_build_object('ok', true, 'message', 'OK', 'channels', v_channels);
end;
$$;

create or replace function public.get_my_boh_cloud_channel_subscriptions(
  p_limit integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 60), 100));
  v_channels jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  select coalesce(jsonb_agg(row_payload order by subscribed_at desc), '[]'::jsonb)
    into v_channels
    from (
      select
        s.created_at as subscribed_at,
        jsonb_build_object(
          'id', c.id,
          'user_id', c.user_id,
          'owner_username', coalesce(p.username, ''),
          'owner_nickname', coalesce(p.username, ''),
          'owner_avatar_url', coalesce(p.avatar_url, ''),
          'share_token', '',
          'is_active', c.is_active,
          'visibility', c.visibility,
          'description', coalesce(c.description, ''),
          'view_count', c.view_count,
          'last_viewed_at', c.last_viewed_at,
          'created_at', c.created_at,
          'updated_at', c.updated_at,
          'entry_count', coalesce(stats.entry_count, 0),
          'subscriber_count', coalesce(subs.subscriber_count, 0),
          'cover_image_url', coalesce(latest.cover_image_url, ''),
          'latest_entry_at', latest.latest_entry_at,
          'subscribed_at', s.created_at,
          'is_subscribed', true
        ) as row_payload
      from public.boh_cloud_channel_subscriptions s
      join public.boh_cloud_share_channels c on c.id = s.channel_id
      join public.profiles p on p.id = c.user_id
      left join lateral (
        select count(*)::integer as entry_count
          from public.boh_cloud_entries e
         where e.user_id = c.user_id
           and e.visibility = 'public'
      ) stats on true
      left join lateral (
        select count(*)::integer as subscriber_count
          from public.boh_cloud_channel_subscriptions all_subs
         where all_subs.channel_id = c.id
      ) subs on true
      left join lateral (
        select e.cover_image_url, e.updated_at as latest_entry_at
          from public.boh_cloud_entries e
         where e.user_id = c.user_id
           and e.visibility = 'public'
         order by e.updated_at desc, e.created_at desc
         limit 1
      ) latest on true
      where s.subscriber_user_id = v_user_id
        and c.is_active = true
        and c.visibility = 'public'
      order by s.created_at desc
      limit v_limit
    ) rows;

  return jsonb_build_object('ok', true, 'message', 'OK', 'channels', v_channels);
end;
$$;

create or replace function public.subscribe_public_boh_cloud_channel(
  p_channel_id uuid
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

  select *
    into v_channel
    from public.boh_cloud_share_channels
   where id = p_channel_id
     and is_active = true
     and visibility = 'public'
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'CHANNEL_NOT_FOUND');
  end if;
  if v_channel.user_id = v_user_id then
    return jsonb_build_object('ok', false, 'message', 'CANNOT_SUBSCRIBE_SELF');
  end if;

  insert into public.boh_cloud_channel_subscriptions (
    channel_id,
    owner_user_id,
    subscriber_user_id
  )
  values (
    v_channel.id,
    v_channel.user_id,
    v_user_id
  )
  on conflict (channel_id, subscriber_user_id)
  do nothing;

  return jsonb_build_object('ok', true, 'message', 'OK');
end;
$$;

create or replace function public.unsubscribe_public_boh_cloud_channel(
  p_channel_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  delete from public.boh_cloud_channel_subscriptions
   where channel_id = p_channel_id
     and subscriber_user_id = v_user_id;

  return jsonb_build_object('ok', true, 'message', 'OK');
end;
$$;

create or replace function public.list_boh_cloud_channel_comments(
  p_channel_id uuid,
  p_limit integer default 80
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 80), 200));
  v_comments jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  if not exists (
    select 1
      from public.boh_cloud_share_channels c
     where c.id = p_channel_id
       and c.is_active = true
       and c.visibility = 'public'
  ) then
    return jsonb_build_object('ok', false, 'message', 'CHANNEL_NOT_FOUND');
  end if;

  if not exists (
    select 1
      from public.boh_cloud_share_channels c
     where c.id = p_channel_id
       and (
         c.user_id = v_user_id
         or exists (
           select 1
             from public.boh_cloud_channel_subscriptions s
            where s.channel_id = c.id
              and s.subscriber_user_id = v_user_id
         )
       )
  ) then
    return jsonb_build_object('ok', false, 'message', 'SUBSCRIPTION_REQUIRED');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', cm.id,
        'channel_id', cm.channel_id,
        'parent_id', cm.parent_id,
        'author_user_id', cm.author_user_id,
        'author_username', coalesce(p.username, ''),
        'author_avatar_url', coalesce(p.avatar_url, ''),
        'content', cm.content,
        'created_at', cm.created_at,
        'updated_at', cm.updated_at,
        'can_delete', cm.author_user_id = v_user_id or ch.user_id = v_user_id
      )
      order by cm.created_at asc
    ),
    '[]'::jsonb
  )
    into v_comments
    from (
      select *
        from public.boh_cloud_channel_comments
       where channel_id = p_channel_id
       order by created_at asc
       limit v_limit
    ) cm
    join public.boh_cloud_share_channels ch on ch.id = cm.channel_id
    join public.profiles p on p.id = cm.author_user_id;

  return jsonb_build_object('ok', true, 'message', 'OK', 'comments', v_comments);
end;
$$;

create or replace function public.create_boh_cloud_channel_comment(
  p_channel_id uuid,
  p_content text,
  p_parent_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_content text := left(trim(coalesce(p_content, '')), 800);
  v_channel public.boh_cloud_share_channels%rowtype;
  v_comment public.boh_cloud_channel_comments%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;
  if char_length(v_content) < 1 then
    return jsonb_build_object('ok', false, 'message', 'EMPTY_COMMENT');
  end if;

  select *
    into v_channel
    from public.boh_cloud_share_channels
   where id = p_channel_id
     and is_active = true
     and visibility = 'public'
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'CHANNEL_NOT_FOUND');
  end if;

  if v_channel.user_id <> v_user_id and not exists (
    select 1
      from public.boh_cloud_channel_subscriptions s
     where s.channel_id = v_channel.id
       and s.subscriber_user_id = v_user_id
  ) then
    return jsonb_build_object('ok', false, 'message', 'SUBSCRIPTION_REQUIRED');
  end if;

  if p_parent_id is not null and not exists (
    select 1
      from public.boh_cloud_channel_comments parent
     where parent.id = p_parent_id
       and parent.channel_id = p_channel_id
  ) then
    return jsonb_build_object('ok', false, 'message', 'COMMENT_NOT_FOUND');
  end if;

  insert into public.boh_cloud_channel_comments (
    channel_id,
    parent_id,
    author_user_id,
    content,
    created_at,
    updated_at
  )
  values (
    p_channel_id,
    p_parent_id,
    v_user_id,
    v_content,
    now(),
    now()
  )
  returning *
    into v_comment;

  return jsonb_build_object(
    'ok', true,
    'message', 'OK',
    'comment', jsonb_build_object(
      'id', v_comment.id,
      'channel_id', v_comment.channel_id,
      'parent_id', v_comment.parent_id,
      'author_user_id', v_comment.author_user_id,
      'content', v_comment.content,
      'created_at', v_comment.created_at,
      'updated_at', v_comment.updated_at
    )
  );
end;
$$;

create or replace function public.delete_boh_cloud_channel_comment(
  p_comment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  delete from public.boh_cloud_channel_comments cm
   where cm.id = p_comment_id
     and (
       cm.author_user_id = v_user_id
       or exists (
         select 1
           from public.boh_cloud_share_channels c
          where c.id = cm.channel_id
            and c.user_id = v_user_id
       )
     );

  if not found then
    return jsonb_build_object('ok', false, 'message', 'COMMENT_NOT_FOUND');
  end if;

  return jsonb_build_object('ok', true, 'message', 'OK');
end;
$$;

create or replace function public.get_subscribed_boh_cloud_channel_content(
  p_channel_id uuid,
  p_limit integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 120), 300));
  v_channel public.boh_cloud_share_channels%rowtype;
  v_owner_username text := '';
  v_owner_nickname text := '';
  v_owner_avatar_url text := '';
  v_entries jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  select *
    into v_channel
    from public.boh_cloud_share_channels
   where id = p_channel_id
     and is_active = true
     and visibility = 'public'
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'CHANNEL_NOT_FOUND');
  end if;

  if not exists (
    select 1
      from public.boh_cloud_channel_subscriptions s
     where s.channel_id = v_channel.id
       and s.subscriber_user_id = v_user_id
  ) then
    return jsonb_build_object('ok', false, 'message', 'SUBSCRIPTION_REQUIRED');
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
    v_user_id,
    coalesce((select p.username from public.profiles p where p.id = v_user_id limit 1), ''),
    coalesce((select p.avatar_url from public.profiles p where p.id = v_user_id limit 1), ''),
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
         and visibility = 'public'
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
      'share_token', '',
      'is_active', v_channel.is_active,
      'visibility', v_channel.visibility,
      'description', coalesce(v_channel.description, ''),
      'view_count', v_channel.view_count + 1,
      'last_viewed_at', now(),
      'created_at', v_channel.created_at,
      'updated_at', v_channel.updated_at,
      'is_subscribed', true
    ),
    'entries', v_entries
  );
end;
$$;

drop function if exists public.get_my_boh_cloud_share_viewers(integer);

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
  v_visibility text := lower(trim(coalesce(p_visibility, 'token')));
  v_viewers jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;
  if v_visibility not in ('token', 'public') then
    return jsonb_build_object('ok', false, 'message', 'INVALID_VISIBILITY');
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
         and c.user_id = v_user_id
         and c.visibility = v_visibility
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
  v_channel_visibility text := 'token';
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
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'TOKEN_NOT_FOUND');
  end if;

  v_channel_visibility := case when v_channel.visibility = 'public' then 'public' else 'token' end;

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
         and (
           (v_channel_visibility = 'public' and visibility = 'public')
           or (v_channel_visibility = 'token' and coalesce(visibility, 'private') = 'private')
         )
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
      'visibility', v_channel_visibility,
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
revoke all on function public.list_public_boh_cloud_share_channels(integer, text) from public;
revoke all on function public.get_my_boh_cloud_channel_subscriptions(integer) from public;
revoke all on function public.subscribe_public_boh_cloud_channel(uuid) from public;
revoke all on function public.unsubscribe_public_boh_cloud_channel(uuid) from public;
revoke all on function public.list_boh_cloud_channel_comments(uuid, integer) from public;
revoke all on function public.create_boh_cloud_channel_comment(uuid, text, uuid) from public;
revoke all on function public.delete_boh_cloud_channel_comment(uuid) from public;
revoke all on function public.get_subscribed_boh_cloud_channel_content(uuid, integer) from public;
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
grant execute on function public.list_public_boh_cloud_share_channels(integer, text) to anon;
grant execute on function public.list_public_boh_cloud_share_channels(integer, text) to authenticated;
grant execute on function public.list_public_boh_cloud_share_channels(integer, text) to service_role;
grant execute on function public.get_my_boh_cloud_channel_subscriptions(integer) to authenticated;
grant execute on function public.get_my_boh_cloud_channel_subscriptions(integer) to service_role;
grant execute on function public.subscribe_public_boh_cloud_channel(uuid) to authenticated;
grant execute on function public.subscribe_public_boh_cloud_channel(uuid) to service_role;
grant execute on function public.unsubscribe_public_boh_cloud_channel(uuid) to authenticated;
grant execute on function public.unsubscribe_public_boh_cloud_channel(uuid) to service_role;
grant execute on function public.list_boh_cloud_channel_comments(uuid, integer) to authenticated;
grant execute on function public.list_boh_cloud_channel_comments(uuid, integer) to service_role;
grant execute on function public.create_boh_cloud_channel_comment(uuid, text, uuid) to authenticated;
grant execute on function public.create_boh_cloud_channel_comment(uuid, text, uuid) to service_role;
grant execute on function public.delete_boh_cloud_channel_comment(uuid) to authenticated;
grant execute on function public.delete_boh_cloud_channel_comment(uuid) to service_role;
grant execute on function public.get_subscribed_boh_cloud_channel_content(uuid, integer) to authenticated;
grant execute on function public.get_subscribed_boh_cloud_channel_content(uuid, integer) to service_role;
grant execute on function public.get_my_boh_cloud_share_viewers(integer, text) to authenticated;
grant execute on function public.get_my_boh_cloud_share_viewers(integer, text) to service_role;
grant execute on function public.get_shared_boh_cloud_channel_by_token(text, integer) to anon;
grant execute on function public.get_shared_boh_cloud_channel_by_token(text, integer) to authenticated;
grant execute on function public.get_shared_boh_cloud_channel_by_token(text, integer) to service_role;

comment on column public.boh_cloud_share_channels.visibility is 'Cloud+ 频道可见性：token 仅令牌访问，public 公开出现在社区订阅频道。';
comment on column public.boh_cloud_share_channels.description is 'Cloud+ 公开频道描述，最多 160 字。';
comment on column public.boh_cloud_entries.visibility is 'Cloud+ 内容可见性：private 仅自己和令牌频道，public 进入公开频道。';
comment on table public.boh_cloud_channel_subscriptions is '用户订阅的公开 BOH Cloud+ 频道。';
comment on table public.boh_cloud_channel_comments is '公开 BOH Cloud+ 频道留言与回复。';
comment on function public.get_subscribed_boh_cloud_channel_content(uuid, integer) is '读取已订阅的公开 BOH Cloud+ 频道内容；未订阅用户不能读取内容。';
comment on function public.get_my_boh_cloud_share_viewers(integer, text) is '读取当前用户指定 Cloud+ 频道的最近已登录访问记录。';
comment on function public.get_shared_boh_cloud_channel_by_token(text, integer) is '按访问令牌读取 BOH Cloud+ 频道内容；私密令牌仅返回 private 内容，公开频道令牌仅返回 public 内容。';

commit;
