-- Internal bookkeeping tables must never be reachable through the client API.
-- _rate_limits is accessed by SECURITY DEFINER functions; the pity backfill
-- marker is only used during migrations and has no runtime client consumer.
begin;

alter table if exists public._rate_limits enable row level security;
alter table if exists public.lottery_pity_backfill_runs enable row level security;

revoke all on table public._rate_limits from public, anon, authenticated;
revoke all on table public.lottery_pity_backfill_runs from public, anon, authenticated;

grant all on table public._rate_limits to service_role;
grant all on table public.lottery_pity_backfill_runs to service_role;

commit;
