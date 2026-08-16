-- Correct the public_id suffix check and preserve Cloudinary ownership while
-- deleting a user preset, including legacy rows created before pending uploads.
begin;

create or replace function public.create_points_card_preset(
  p_image_url text,
  p_image_public_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tier_code text := 'free';
  v_capacity integer := 3;
  v_current_count integer := 0;
  v_preset public.points_card_presets;
  v_image_url text := trim(coalesce(p_image_url, ''));
  v_image_public_id text := nullif(trim(coalesce(p_image_public_id, '')), '');
  v_path text;
  v_ext text;
  v_stem text;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;
  if v_image_url = '' or char_length(v_image_url) > 2048
     or (v_image_public_id is not null and char_length(v_image_public_id) > 512) then
    return jsonb_build_object('ok', false, 'message', 'INVALID_INPUT');
  end if;

  if v_image_url !~ '^https://res[.]cloudinary[.]com/[A-Za-z0-9_-]+/image/upload/' then
    return jsonb_build_object('ok', false, 'message', 'INVALID_IMAGE_URL');
  end if;

  if v_image_public_id is not null then
    v_path := regexp_replace(v_image_url, '[?#].*$', '');
    v_ext := substring(v_path from '[.][A-Za-z0-9]{2,5}$');
    if v_ext is null then
      return jsonb_build_object('ok', false, 'message', 'INVALID_IMAGE_PUBLIC_ID');
    end if;
    v_stem := left(v_path, char_length(v_path) - char_length(v_ext));
    if right(v_stem, char_length(v_image_public_id) + 1) <> concat('/', v_image_public_id) then
      return jsonb_build_object('ok', false, 'message', 'INVALID_IMAGE_PUBLIC_ID');
    end if;
  end if;

  perform id from public.profiles where id = v_user_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'PROFILE_NOT_FOUND');
  end if;

  select tier_code, capacity
    into v_tier_code, v_capacity
    from public.points_card_preset_capacity_for_user(v_user_id);

  select count(*) into v_current_count
    from public.points_card_presets
   where user_id = v_user_id
     and purge_state = 'active';

  if v_current_count >= v_capacity then
    return jsonb_build_object(
      'ok', false,
      'message', 'PRESET_CAPACITY_REACHED',
      'tier_code', v_tier_code,
      'capacity', v_capacity,
      'current_count', v_current_count
    );
  end if;

  insert into public.points_card_presets (user_id, image_url, image_public_id, last_used_at)
  values (v_user_id, v_image_url, v_image_public_id, now())
  returning * into v_preset;

  return jsonb_build_object(
    'ok', true,
    'tier_code', v_tier_code,
    'capacity', v_capacity,
    'current_count', v_current_count + 1,
    'preset', jsonb_build_object(
      'id', v_preset.id,
      'image_url', v_preset.image_url,
      'image_public_id', v_preset.image_public_id,
      'created_at', v_preset.created_at,
      'last_used_at', v_preset.last_used_at
    )
  );
end;
$$;

create or replace function public.delete_points_card_preset(p_preset_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_preset public.points_card_presets;
  v_is_current boolean := false;
  v_cloudinary_public_id text;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  select * into v_preset
    from public.points_card_presets
   where id = p_preset_id
     and user_id = v_user_id
     and purge_state in ('active', 'failed')
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'PRESET_NOT_FOUND');
  end if;

  select points_card_skin = 'custom' and points_card_image_url = v_preset.image_url
    into v_is_current
    from public.profiles
   where id = v_user_id
   for update;

  if v_is_current then
    update public.profiles
       set points_card_skin = 'blank',
           points_card_image_url = null,
           points_card_image_public_id = null
     where id = v_user_id;
  end if;

  v_cloudinary_public_id := nullif(trim(coalesce(v_preset.image_public_id, '')), '');
  if v_cloudinary_public_id is null and v_preset.image_url ~ '^https://res[.]cloudinary[.]com/[A-Za-z0-9_-]+/image/upload/' then
    v_cloudinary_public_id := regexp_replace(
      regexp_replace(
        regexp_replace(v_preset.image_url, '^https://res[.]cloudinary[.]com/[A-Za-z0-9_-]+/image/upload/(v[0-9]+/)?', ''),
        '[?#].*$', ''
      ),
      '[.][A-Za-z0-9]{2,5}$', ''
    );
  end if;

  if v_cloudinary_public_id is not null and char_length(v_cloudinary_public_id) between 1 and 255 then
    insert into public.cloudinary_pending_uploads (
      user_id, public_id, url, resource_type, source, folder, claimed_at, deleted_at
    ) values (
      v_user_id, v_cloudinary_public_id, v_preset.image_url, 'image', 'points-card', 'boh-points-cards', now(), null
    ) on conflict (public_id) do update
      set url = excluded.url,
          claimed_at = coalesce(cloudinary_pending_uploads.claimed_at, now()),
          deleted_at = null
      where cloudinary_pending_uploads.user_id = v_user_id;
  end if;

  delete from public.points_card_presets where id = v_preset.id;

  return jsonb_build_object(
    'ok', true,
    'was_current', coalesce(v_is_current, false),
    'image_url', v_preset.image_url,
    'image_public_id', v_cloudinary_public_id
  );
end;
$$;

revoke all on function public.create_points_card_preset(text, text) from public;
revoke all on function public.delete_points_card_preset(uuid) from public;
grant execute on function public.create_points_card_preset(text, text) to authenticated;
grant execute on function public.delete_points_card_preset(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
