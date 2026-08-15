-- Beta5: unlock the all-cats points card with a one-time points redemption.
begin;

create table if not exists public.points_card_cats_unlocks (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  redeemed_at timestamptz not null default now()
);

-- Users who had already selected the formerly-free skin keep their access.
insert into public.points_card_cats_unlocks (user_id)
select id
from public.profiles
where points_card_skin = 'cats'
on conflict (user_id) do nothing;

alter table public.points_card_cats_unlocks enable row level security;

drop policy if exists points_card_cats_unlocks_select_own on public.points_card_cats_unlocks;
create policy points_card_cats_unlocks_select_own on public.points_card_cats_unlocks
  for select to authenticated
  using (auth.uid() = user_id);

revoke all on table public.points_card_cats_unlocks from anon, authenticated;
grant select on table public.points_card_cats_unlocks to authenticated;
grant all on table public.points_card_cats_unlocks to service_role;

create or replace function public.enforce_points_card_cats_unlock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.points_card_skin = 'cats'
     and not exists (
       select 1
       from public.points_card_cats_unlocks
       where user_id = new.id
     ) then
    raise exception '请先兑换全员小猫积分卡面';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_enforce_points_card_cats_unlock on public.profiles;
create trigger trg_profiles_enforce_points_card_cats_unlock
  before insert or update of points_card_skin on public.profiles
  for each row
  execute function public.enforce_points_card_cats_unlock();

create or replace function public.redeem_points_card_cats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_points integer := 0;
  v_next_points integer := 0;
  v_unlocked boolean := false;
  v_cost constant integer := 3;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  select coalesce(points, 0)
    into v_current_points
    from public.profiles
   where id = v_user_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'PROFILE_NOT_FOUND');
  end if;

  select exists(
    select 1
    from public.points_card_cats_unlocks
    where user_id = v_user_id
  ) into v_unlocked;

  if v_unlocked then
    return jsonb_build_object(
      'ok', true,
      'already_unlocked', true,
      'points_deducted', 0,
      'current_points', v_current_points
    );
  end if;

  if v_current_points < v_cost then
    return jsonb_build_object(
      'ok', false,
      'message', 'INSUFFICIENT_POINTS',
      'required_points', v_cost,
      'current_points', v_current_points
    );
  end if;

  insert into public.points_card_cats_unlocks (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  update public.profiles
     set points = coalesce(points, 0) - v_cost,
         points_card_skin = 'cats'
   where id = v_user_id
   returning points into v_next_points;

  insert into public.points_transactions (user_id, amount, balance_after, reason, remark)
  values (v_user_id, -v_cost, v_next_points, 'points_card_cats', '兑换全员小猫积分卡面');

  return jsonb_build_object(
    'ok', true,
    'already_unlocked', false,
    'points_deducted', v_cost,
    'current_points', v_next_points
  );
end;
$$;

revoke all on function public.redeem_points_card_cats() from public;
grant execute on function public.redeem_points_card_cats() to authenticated;
grant execute on function public.redeem_points_card_cats() to service_role;

comment on table public.points_card_cats_unlocks is 'Beta5 全员小猫积分卡一次性兑换权益';

commit;
