begin;

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

revoke all on function public.get_shared_boh_cloud_channel_by_token(text, integer) from public;
grant execute on function public.get_shared_boh_cloud_channel_by_token(text, integer) to anon;
grant execute on function public.get_shared_boh_cloud_channel_by_token(text, integer) to authenticated;
grant execute on function public.get_shared_boh_cloud_channel_by_token(text, integer) to service_role;

comment on function public.get_shared_boh_cloud_channel_by_token(text, integer) is '按访问令牌读取 BOH Cloud+ 只读共享频道。使用 profiles.username 作为展示名，避免引用不存在的 nickname 字段。';

commit;
