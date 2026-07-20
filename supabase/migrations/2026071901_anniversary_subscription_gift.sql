begin;

create table if not exists public.anniversary_subscription_claims (
  id uuid primary key default gen_random_uuid(),
  campaign_code text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  granted_plan_code text not null,
  granted_plan_name text not null,
  subscription_id uuid null references public.user_subscriptions (id) on delete set null,
  started_at timestamp with time zone not null,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone not null default now(),
  unique (campaign_code, user_id)
);

alter table public.anniversary_subscription_claims enable row level security;

drop policy if exists anniversary_subscription_claims_select_own
  on public.anniversary_subscription_claims;
create policy anniversary_subscription_claims_select_own
  on public.anniversary_subscription_claims
  for select
  to authenticated
  using (auth.uid() = user_id);

grant select on table public.anniversary_subscription_claims to authenticated;
grant all on table public.anniversary_subscription_claims to service_role;

create or replace function public.claim_boh_eighth_anniversary_subscription(
  p_prefer_current_tier boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_code constant text := 'boh-8th-anniversary-2026';
  v_user_id uuid := auth.uid();
  v_now timestamp with time zone := now();
  v_current_plan_code text := '';
  v_current_plan_rank integer := 0;
  v_target_plan_code text := 'max';
  v_target_plan_name text := 'Max';
  v_latest_expire timestamp with time zone;
  v_started_at timestamp with time zone;
  v_expires_at timestamp with time zone;
  v_claim_id uuid;
  v_subscription_id uuid;
  v_existing_claim record;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  -- Serialize claims for this account so concurrent clicks cannot create two grants.
  perform pg_advisory_xact_lock(hashtextextended(v_campaign_code || ':' || v_user_id::text, 0));

  select granted_plan_code, granted_plan_name, subscription_id, started_at, expires_at
    into v_existing_claim
    from public.anniversary_subscription_claims
   where campaign_code = v_campaign_code
     and user_id = v_user_id;

  if found then
    return jsonb_build_object(
      'ok', false,
      'message', 'ALREADY_CLAIMED',
      'already_claimed', true,
      'plan_code', v_existing_claim.granted_plan_code,
      'plan_name', v_existing_claim.granted_plan_name,
      'subscription_id', v_existing_claim.subscription_id,
      'started_at', v_existing_claim.started_at,
      'expires_at', v_existing_claim.expires_at
    );
  end if;

  select normalized.plan_code, normalized.plan_rank
    into v_current_plan_code, v_current_plan_rank
    from (
      select
        case
          when lower(plan_code) in ('ultra', 'boh-ultra') then 'ultra'
          when lower(plan_code) in ('max', 'boh-max') then 'max'
          when lower(plan_code) in ('pro', 'boh-pro') then 'pro'
          when lower(plan_code) in ('plus', 'boh-ai-plus', 'boh-plus') then 'plus'
          else 'free'
        end as plan_code,
        case
          when lower(plan_code) in ('ultra', 'boh-ultra') then 4
          when lower(plan_code) in ('max', 'boh-max') then 3
          when lower(plan_code) in ('pro', 'boh-pro') then 2
          when lower(plan_code) in ('plus', 'boh-ai-plus', 'boh-plus') then 1
          else 0
        end as plan_rank
      from public.user_subscriptions
      where user_id = v_user_id
        and status = 'active'
        and expires_at > v_now
      order by plan_rank desc, expires_at desc
      limit 1
    ) normalized;

  if coalesce(p_prefer_current_tier, true) and coalesce(v_current_plan_rank, 0) > 3 then
    v_target_plan_code := v_current_plan_code;
    v_target_plan_name := case v_current_plan_code when 'ultra' then 'Ultra' else 'Max' end;
  end if;

  select max(expires_at)
    into v_latest_expire
    from public.user_subscriptions
   where user_id = v_user_id
     and status = 'active'
     and expires_at > v_now
     and case
       when v_target_plan_code = 'ultra' then lower(plan_code) in ('ultra', 'boh-ultra')
       else lower(plan_code) in ('max', 'boh-max')
     end;

  v_started_at := greatest(v_now, coalesce(v_latest_expire, v_now));
  v_expires_at := v_started_at + interval '1 month';

  insert into public.anniversary_subscription_claims (
    campaign_code,
    user_id,
    granted_plan_code,
    granted_plan_name,
    started_at,
    expires_at
  ) values (
    v_campaign_code,
    v_user_id,
    v_target_plan_code,
    v_target_plan_name,
    v_started_at,
    v_expires_at
  )
  returning id into v_claim_id;

  update public.user_subscriptions
     set status = 'expired', updated_at = v_now
   where user_id = v_user_id
     and status = 'active'
     and expires_at <= v_now;

  insert into public.user_subscriptions (
    user_id,
    plan_code,
    plan_name,
    billing_cycle,
    points_cost,
    duration_months,
    started_at,
    expires_at,
    status,
    metadata
  ) values (
    v_user_id,
    v_target_plan_code,
    v_target_plan_name,
    'monthly',
    0,
    1,
    v_started_at,
    v_expires_at,
    'active',
    jsonb_build_object(
      'source', 'home/anniversary-letter',
      'campaign_code', v_campaign_code,
      'gift', true
    )
  )
  returning id into v_subscription_id;

  update public.anniversary_subscription_claims
     set subscription_id = v_subscription_id
   where id = v_claim_id;

  return jsonb_build_object(
    'ok', true,
    'message', 'CLAIM_SUCCESS',
    'already_claimed', false,
    'plan_code', v_target_plan_code,
    'plan_name', v_target_plan_name,
    'subscription_id', v_subscription_id,
    'started_at', v_started_at,
    'expires_at', v_expires_at
  );
end;
$$;

revoke all on function public.claim_boh_eighth_anniversary_subscription(boolean) from public;
revoke execute on function public.claim_boh_eighth_anniversary_subscription(boolean) from anon;
grant execute on function public.claim_boh_eighth_anniversary_subscription(boolean) to authenticated;
grant execute on function public.claim_boh_eighth_anniversary_subscription(boolean) to service_role;

commit;
