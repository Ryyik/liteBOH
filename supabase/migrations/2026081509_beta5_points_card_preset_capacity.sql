-- Beta5: subscription-based custom card capacity and 90-day preset retention.
begin;

alter table public.points_card_presets
  add column if not exists last_used_at timestamptz not null default now(),
  add column if not exists purge_state text not null default 'active',
  add column if not exists purge_requested_at timestamptz null,
  add column if not exists purge_attempts integer not null default 0,
  add column if not exists last_purge_error text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'points_card_presets_purge_state_valid'
      and conrelid = 'public.points_card_presets'::regclass
  ) then
    alter table public.points_card_presets
      add constraint points_card_presets_purge_state_valid
      check (purge_state in ('active', 'pending'));
  end if;
end $$;

update public.points_card_presets
   set last_used_at = coalesce(last_used_at, created_at, now())
 where last_used_at is null;

create index if not exists idx_points_card_presets_expiry
  on public.points_card_presets (purge_state, last_used_at asc);

-- Only RPCs can add, switch, or remove a preset so capacity and last-used time
-- cannot be bypassed by a direct table request.
drop policy if exists points_card_presets_insert_own on public.points_card_presets;
drop policy if exists points_card_presets_delete_own on public.points_card_presets;
revoke insert, update, delete on table public.points_card_presets from authenticated;

create or replace function public.points_card_preset_capacity_for_user(p_user_id uuid)
returns table (tier_code text, capacity integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(nullif(public.get_user_subscription_tier(p_user_id), ''), 'free') as tier_code,
    case coalesce(nullif(public.get_user_subscription_tier(p_user_id), ''), 'free')
      when 'ultra' then 24
      when 'max' then 16
      when 'pro' then 10
      when 'plus' then 6
      else 3
    end as capacity;
$$;

create or replace function public.get_points_card_preset_quota()
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
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  select tier_code, capacity
    into v_tier_code, v_capacity
    from public.points_card_preset_capacity_for_user(v_user_id);

  select count(*) into v_current_count
    from public.points_card_presets
   where user_id = v_user_id
     and purge_state = 'active';

  return jsonb_build_object(
    'ok', true,
    'tier_code', v_tier_code,
    'capacity', v_capacity,
    'current_count', v_current_count,
    'can_add', v_current_count < v_capacity
  );
end;
$$;

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
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;
  if v_image_url = '' or char_length(v_image_url) > 2048
     or (v_image_public_id is not null and char_length(v_image_public_id) > 512) then
    return jsonb_build_object('ok', false, 'message', 'INVALID_INPUT');
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

create or replace function public.use_points_card_preset(p_preset_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_preset public.points_card_presets;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  select * into v_preset
    from public.points_card_presets
   where id = p_preset_id
     and user_id = v_user_id
     and purge_state = 'active'
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'PRESET_NOT_FOUND');
  end if;

  update public.points_card_presets
     set last_used_at = now()
   where id = v_preset.id;

  update public.profiles
     set points_card_skin = 'custom',
         points_card_image_url = v_preset.image_url,
         points_card_image_public_id = v_preset.image_public_id
   where id = v_user_id;

  return jsonb_build_object('ok', true);
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
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  select * into v_preset
    from public.points_card_presets
   where id = p_preset_id
     and user_id = v_user_id
     and purge_state = 'active'
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

  delete from public.points_card_presets where id = v_preset.id;

  return jsonb_build_object(
    'ok', true,
    'was_current', coalesce(v_is_current, false),
    'image_url', v_preset.image_url,
    'image_public_id', v_preset.image_public_id
  );
end;
$$;

create or replace function public.enforce_points_card_custom_preset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.points_card_skin = 'custom' and not exists (
    select 1 from public.points_card_presets p
     where p.user_id = new.id
       and p.image_url = new.points_card_image_url
       and p.purge_state = 'active'
  ) then
    raise exception '请选择已保存的自定义卡面';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_enforce_points_card_custom_preset on public.profiles;
create trigger trg_profiles_enforce_points_card_custom_preset
  before insert or update of points_card_skin, points_card_image_url on public.profiles
  for each row
  execute function public.enforce_points_card_custom_preset();

-- Used by a service-role scheduled Edge Function. It claims candidates first so
-- a card cannot be selected while its Cloudinary asset is being deleted.
create or replace function public.claim_expired_points_card_presets(p_limit integer default 50)
returns table (id uuid, image_url text, image_public_id text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;

  return query
  with candidates as (
    select p.id
      from public.points_card_presets p
     where p.purge_state = 'active'
       and p.last_used_at < now() - interval '90 days'
       and not exists (
         select 1 from public.profiles u
          where u.id = p.user_id
            and u.points_card_skin = 'custom'
            and u.points_card_image_url = p.image_url
       )
     order by p.last_used_at asc
     limit greatest(1, least(coalesce(p_limit, 50), 100))
     for update skip locked
  )
  update public.points_card_presets p
     set purge_state = 'pending',
         purge_requested_at = now(),
         purge_attempts = p.purge_attempts + 1,
         last_purge_error = null
    from candidates
   where p.id = candidates.id
  returning p.id, p.image_url, p.image_public_id;
end;
$$;

create or replace function public.complete_points_card_preset_purge(
  p_preset_id uuid,
  p_deleted boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;

  if p_deleted then
    delete from public.points_card_presets
     where id = p_preset_id
       and purge_state = 'pending';
  else
    update public.points_card_presets
       set purge_state = 'active',
           purge_requested_at = null,
           last_purge_error = left(coalesce(p_error, 'Cloudinary 删除失败'), 1000)
     where id = p_preset_id
       and purge_state = 'pending';
  end if;
end;
$$;

revoke all on function public.points_card_preset_capacity_for_user(uuid) from public;
revoke all on function public.get_points_card_preset_quota() from public;
revoke all on function public.create_points_card_preset(text, text) from public;
revoke all on function public.use_points_card_preset(uuid) from public;
revoke all on function public.delete_points_card_preset(uuid) from public;
revoke all on function public.claim_expired_points_card_presets(integer) from public;
revoke all on function public.complete_points_card_preset_purge(uuid, boolean, text) from public;

grant execute on function public.get_points_card_preset_quota() to authenticated;
grant execute on function public.create_points_card_preset(text, text) to authenticated;
grant execute on function public.use_points_card_preset(uuid) to authenticated;
grant execute on function public.delete_points_card_preset(uuid) to authenticated;
grant execute on function public.claim_expired_points_card_presets(integer) to service_role;
grant execute on function public.complete_points_card_preset_purge(uuid, boolean, text) to service_role;

comment on table public.points_card_presets is 'Beta5 方块积分用户自定义卡面预设，非当前卡面超过 90 天自动清理';

commit;
