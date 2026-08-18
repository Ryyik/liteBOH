-- Count losses by default for new activities without granting a pity winner.
-- Existing activities remain outside pity unless they were already eligible.

begin;

alter table public.lotteries
  drop constraint if exists lotteries_pity_mode_check;

alter table public.lotteries
  add constraint lotteries_pity_mode_check
  check (pity_mode in ('none', 'count_only', 'eligible'));

alter table public.lotteries
  alter column pity_mode set default 'count_only';

commit;
