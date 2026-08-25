-- Normalize historical subscription plan aliases in both public tier RPCs.
-- Keep the returned tier vocabulary canonical: free, plus, pro, max, ultra.

begin;

create or replace function public.get_user_subscription_tier(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select case lower(trim(s.plan_code))
             when 'free' then 'free'
             when 'plus' then 'plus'
             when 'boh-ai-plus' then 'plus'
             when 'boh-plus' then 'plus'
             when 'pro' then 'pro'
             when 'boh-pro' then 'pro'
             when 'max' then 'max'
             when 'boh-max' then 'max'
             when 'ultra' then 'ultra'
             when 'boh-ultra' then 'ultra'
           end as tier
    from public.user_subscriptions s
    where s.user_id = p_user_id
      and s.status = 'active'
      and s.expires_at > now()
  )
  select coalesce(
    (select tier from ranked where tier is not null
     order by case tier when 'ultra' then 4 when 'max' then 3 when 'pro' then 2 when 'plus' then 1 else 0 end desc
     limit 1),
    ''
  );
$$;

create or replace function public.get_user_subscription_tiers(p_user_ids uuid[])
returns table(user_id uuid, tier text)
language sql
stable
security definer
set search_path = public
as $$
  with requested as (
    select requested_user_id
    from unnest(p_user_ids) as input_ids(requested_user_id)
  ),
  ranked as (
    select
      subscriptions.user_id as subscription_user_id,
      case lower(trim(subscriptions.plan_code))
        when 'free' then 'free'
        when 'plus' then 'plus'
        when 'boh-ai-plus' then 'plus'
        when 'boh-plus' then 'plus'
        when 'pro' then 'pro'
        when 'boh-pro' then 'pro'
        when 'max' then 'max'
        when 'boh-max' then 'max'
        when 'ultra' then 'ultra'
        when 'boh-ultra' then 'ultra'
      end as canonical_tier
    from public.user_subscriptions subscriptions
    where subscriptions.user_id = any(p_user_ids)
      and subscriptions.status = 'active'
      and subscriptions.expires_at > now()
  ),
  best as (
    select distinct on (ranked.subscription_user_id)
      ranked.subscription_user_id,
      ranked.canonical_tier
    from ranked
    where ranked.canonical_tier is not null
    order by ranked.subscription_user_id,
      case ranked.canonical_tier
        when 'ultra' then 4
        when 'max' then 3
        when 'pro' then 2
        when 'plus' then 1
        else 0
      end desc
  )
  select requested.requested_user_id,
         coalesce(best.canonical_tier, '')
  from requested
  left join best on best.subscription_user_id = requested.requested_user_id;
$$;

grant execute on function public.get_user_subscription_tier(uuid) to anon, authenticated;
grant execute on function public.get_user_subscription_tiers(uuid[]) to anon, authenticated;

commit;
