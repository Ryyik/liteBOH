begin;

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

create or replace function public.get_my_boh_cloud_share_viewers(
  p_limit integer default 50
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
      select *
        from public.boh_cloud_share_viewers
       where owner_user_id = v_user_id
       order by last_viewed_at desc
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

revoke all on function public.get_my_boh_cloud_share_viewers(integer) from public;
revoke all on function public.get_shared_boh_cloud_channel_by_token(text, integer) from public;

grant execute on function public.get_my_boh_cloud_share_viewers(integer) to authenticated;
grant execute on function public.get_my_boh_cloud_share_viewers(integer) to service_role;
grant execute on function public.get_shared_boh_cloud_channel_by_token(text, integer) to anon;
grant execute on function public.get_shared_boh_cloud_channel_by_token(text, integer) to authenticated;
grant execute on function public.get_shared_boh_cloud_channel_by_token(text, integer) to service_role;

comment on table public.boh_cloud_share_viewers is 'BOH Cloud+ 共享频道访客记录。仅记录已登录且非频道主人的访客。';
comment on function public.get_my_boh_cloud_share_viewers(integer) is '读取当前用户 Cloud+ 共享频道的最近已登录访客。';

commit;
