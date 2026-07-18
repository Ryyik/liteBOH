-- Server-side BOH AI runtime guardrails.
-- Token reservations close the gap between a preflight allowance check and
-- asynchronous settlement, including concurrent tabs and streaming requests.

alter table public.bohai_model_configs
  add column if not exists min_tier text not null default 'free';

alter table public.bohai_model_configs
  drop constraint if exists bohai_model_configs_min_tier_check;

alter table public.bohai_model_configs
  add constraint bohai_model_configs_min_tier_check
  check (min_tier in ('guest', 'free', 'plus', 'pro', 'max', 'ultra'));

update public.bohai_model_configs
set min_tier = case mode_id
  when 'fast' then 'free'
  when 'pro' then 'plus'
  when 'multimodal' then 'plus'
  when 'plan' then 'pro'
  when 'agent-cluster' then 'max'
  else 'free'
end;

drop policy if exists bohai_model_configs_select_active_or_admin on public.bohai_model_configs;
drop policy if exists bohai_model_configs_admin_select on public.bohai_model_configs;
create policy bohai_model_configs_admin_select
  on public.bohai_model_configs
  for select
  using (public.current_user_is_admin());

create or replace function public.list_public_bohai_modes()
returns table(
  id uuid,
  mode_id text,
  display_name text,
  tagline text,
  description text,
  capability text,
  icon text,
  temperature numeric,
  top_p numeric,
  frequency_penalty numeric,
  max_tokens integer,
  sort_order integer
)
language sql
stable
security definer
set search_path = public
as $$
  select id, mode_id, display_name, tagline, description, capability, icon,
         temperature, top_p, frequency_penalty, max_tokens, sort_order
    from public.bohai_model_configs
   where status = 'active'
   order by sort_order asc, display_name asc;
$$;

revoke all on function public.list_public_bohai_modes() from public;
grant execute on function public.list_public_bohai_modes() to anon, authenticated, service_role;

create table if not exists public.ai_token_reservations (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  ip_address text,
  reserved_tokens integer not null check (reserved_tokens >= 0),
  status text not null default 'pending' check (status in ('pending', 'settled', 'released')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists ai_token_reservations_identity_status_idx
  on public.ai_token_reservations (user_id, ip_address, status, created_at desc);

alter table public.ai_token_reservations enable row level security;

create table if not exists public.ai_web_search_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tier text not null,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'cancelled')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists ai_web_search_log_user_created_idx
  on public.ai_web_search_log (user_id, created_at desc);

alter table public.ai_web_search_log enable row level security;

create or replace function public.reserve_ai_token_quota(
  p_reservation_id uuid,
  p_user_id uuid,
  p_ip_address text,
  p_since timestamptz,
  p_token_limit bigint,
  p_reserved_tokens integer
)
returns table(allowed boolean, used_tokens bigint, remaining_tokens bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_identity text := coalesce(p_user_id::text, 'ip:' || coalesce(p_ip_address, 'unknown'));
  v_used bigint := 0;
  v_pending bigint := 0;
  v_required integer := greatest(0, coalesce(p_reserved_tokens, 0));
begin
  perform pg_advisory_xact_lock(hashtextext('boh-ai-token:' || v_identity));

  update public.ai_token_reservations
     set status = 'released', settled_at = now()
   where status = 'pending'
     and created_at < now() - interval '10 minutes';

  select coalesce(sum(billed_tokens), 0)::bigint
    into v_used
    from public.ai_quota_log
   where created_at >= p_since
     and ((p_user_id is not null and user_id = p_user_id)
       or (p_user_id is null and p_ip_address is not null and ip_address = p_ip_address));

  select coalesce(sum(reserved_tokens), 0)::bigint
    into v_pending
    from public.ai_token_reservations
   where status = 'pending'
     and created_at >= p_since
     and ((p_user_id is not null and user_id = p_user_id)
       or (p_user_id is null and p_ip_address is not null and ip_address = p_ip_address));

  if p_token_limit <> -1 and v_used + v_pending + v_required > p_token_limit then
    return query select false, v_used, greatest(0, p_token_limit - v_used - v_pending);
    return;
  end if;

  insert into public.ai_token_reservations (id, user_id, ip_address, reserved_tokens)
  values (p_reservation_id, p_user_id, p_ip_address, v_required)
  on conflict (id) do nothing;

  return query select true, v_used, case when p_token_limit = -1 then -1 else greatest(0, p_token_limit - v_used - v_pending - v_required) end;
end;
$$;

create or replace function public.settle_ai_token_quota(
  p_reservation_id uuid,
  p_prompt_tokens integer,
  p_completion_tokens integer,
  p_total_tokens integer,
  p_model text,
  p_mode text,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.ai_token_reservations%rowtype;
begin
  select * into v_reservation
    from public.ai_token_reservations
   where id = p_reservation_id
   for update;
  if not found or v_reservation.status <> 'pending' then
    return false;
  end if;

  insert into public.ai_quota_log (
    user_id, ip_address, model, mode,
    prompt_tokens, completion_tokens, total_tokens, billed_tokens, status, created_at
  ) values (
    v_reservation.user_id, v_reservation.ip_address, left(coalesce(p_model, ''), 120), left(coalesce(p_mode, ''), 80),
    greatest(0, coalesce(p_prompt_tokens, 0)), greatest(0, coalesce(p_completion_tokens, 0)),
    greatest(0, coalesce(p_total_tokens, 0)), greatest(0, coalesce(p_total_tokens, 0)),
    left(coalesce(p_status, 'success'), 80), now()
  );

  update public.ai_token_reservations
     set status = 'settled', settled_at = now()
   where id = p_reservation_id;
  return true;
end;
$$;

create or replace function public.release_ai_token_quota(p_reservation_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.ai_token_reservations
     set status = 'released', settled_at = now()
   where id = p_reservation_id and status = 'pending'
  returning true;
$$;

create or replace function public.reserve_ai_web_search(
  p_user_id uuid,
  p_tier text,
  p_daily_limit integer,
  p_since timestamptz
)
returns table(allowed boolean, request_id uuid, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer := 0;
  v_id uuid := gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtextext('boh-ai-web:' || p_user_id::text));
  update public.ai_web_search_log
     set status = 'cancelled', settled_at = now()
   where status = 'pending' and created_at < now() - interval '2 minutes';
  select count(*) into v_used
    from public.ai_web_search_log
   where user_id = p_user_id
     and created_at >= p_since
     and status in ('pending', 'success');
  if v_used >= p_daily_limit then
    return query select false, null::uuid, 0;
    return;
  end if;
  insert into public.ai_web_search_log (id, user_id, tier, status)
  values (v_id, p_user_id, p_tier, 'pending');
  return query select true, v_id, greatest(0, p_daily_limit - v_used - 1);
end;
$$;

create or replace function public.settle_ai_web_search(p_request_id uuid, p_status text)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.ai_web_search_log
     set status = case when p_status in ('success', 'failed', 'cancelled') then p_status else 'failed' end,
         settled_at = now()
   where id = p_request_id and status = 'pending'
  returning true;
$$;

revoke all on function public.reserve_ai_token_quota(uuid, uuid, text, timestamptz, bigint, integer) from public;
revoke all on function public.settle_ai_token_quota(uuid, integer, integer, integer, text, text, text) from public;
revoke all on function public.release_ai_token_quota(uuid) from public;
revoke all on function public.reserve_ai_web_search(uuid, text, integer, timestamptz) from public;
revoke all on function public.settle_ai_web_search(uuid, text) from public;
grant execute on function public.reserve_ai_token_quota(uuid, uuid, text, timestamptz, bigint, integer) to service_role;
grant execute on function public.settle_ai_token_quota(uuid, integer, integer, integer, text, text, text) to service_role;
grant execute on function public.release_ai_token_quota(uuid) to service_role;
grant execute on function public.reserve_ai_web_search(uuid, text, integer, timestamptz) to service_role;
grant execute on function public.settle_ai_web_search(uuid, text) to service_role;
