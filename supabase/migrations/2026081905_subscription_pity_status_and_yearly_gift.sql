-- Make member lottery pity progress visible and record the annual member gift
-- on the server so it cannot depend on client-supplied subscription metadata.

begin;

create or replace function public.get_my_lottery_pity_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tier text := 'free';
  v_threshold integer := 0;
  v_losses integer := 0;
  v_last_lottery_id uuid := null;
  v_updated_at timestamp with time zone := null;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  v_tier := coalesce(nullif(public.get_user_subscription_tier(v_user_id), ''), 'free');
  v_threshold := public.lottery_pity_threshold(v_tier);

  select consecutive_losses, last_lottery_id, updated_at
    into v_losses, v_last_lottery_id, v_updated_at
    from public.lottery_pity_progress
   where user_id = v_user_id;

  v_losses := greatest(coalesce(v_losses, 0), 0);

  return jsonb_build_object(
    'ok', true,
    'tier_code', v_tier,
    'eligible', v_threshold > 0,
    'consecutive_losses', v_losses,
    'threshold', v_threshold,
    'remaining_losses', case when v_threshold > 0 then greatest(v_threshold - v_losses, 0) else null end,
    'is_due', v_threshold > 0 and v_losses >= v_threshold,
    'last_lottery_id', v_last_lottery_id,
    'updated_at', v_updated_at
  );
end;
$$;

revoke all on function public.get_my_lottery_pity_status() from public;
grant execute on function public.get_my_lottery_pity_status() to authenticated, service_role;

create or replace function public.apply_yearly_membership_gift()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.billing_cycle = 'yearly'
     and lower(trim(new.plan_code)) in ('plus', 'pro', 'max', 'ultra') then
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'yearly_gift', jsonb_build_object(
        'code', 'annual-member-badge',
        'label', '年度会员纪念徽章',
        'granted_at', now()
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_user_subscriptions_yearly_membership_gift on public.user_subscriptions;
create trigger trg_user_subscriptions_yearly_membership_gift
before insert on public.user_subscriptions
for each row execute function public.apply_yearly_membership_gift();

update public.user_subscriptions
   set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
     'yearly_gift', jsonb_build_object(
       'code', 'annual-member-badge',
       'label', '年度会员纪念徽章',
       'granted_at', now()
     )
   )
 where billing_cycle = 'yearly'
   and lower(trim(plan_code)) in ('plus', 'pro', 'max', 'ultra')
   and not (coalesce(metadata, '{}'::jsonb) ? 'yearly_gift');

commit;
