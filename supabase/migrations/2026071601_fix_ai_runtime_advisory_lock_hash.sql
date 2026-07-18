-- Fix BOH AI runtime reservation RPCs created in 2026071401.
-- PostgreSQL provides hashtext(text); hashtextext(text) does not exist.

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
  perform pg_advisory_xact_lock(hashtext('boh-ai-token:' || v_identity));

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

  return query
  select true,
         v_used,
         case
           when p_token_limit = -1 then -1
           else greatest(0, p_token_limit - v_used - v_pending - v_required)
         end;
end;
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
  perform pg_advisory_xact_lock(hashtext('boh-ai-web:' || p_user_id::text));

  update public.ai_web_search_log
     set status = 'cancelled', settled_at = now()
   where status = 'pending'
     and created_at < now() - interval '2 minutes';

  select count(*)
    into v_used
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

revoke all on function public.reserve_ai_token_quota(uuid, uuid, text, timestamptz, bigint, integer) from public;
revoke all on function public.reserve_ai_web_search(uuid, text, integer, timestamptz) from public;
grant execute on function public.reserve_ai_token_quota(uuid, uuid, text, timestamptz, bigint, integer) to service_role;
grant execute on function public.reserve_ai_web_search(uuid, text, integer, timestamptz) to service_role;
