-- Make the per-lottery pity seat count optional when pity is disabled.
-- Pity-enabled lotteries still require a positive count within winner_count.

begin;

alter table public.lotteries
  alter column pity_winner_count drop not null;

alter table public.lotteries
  alter column pity_winner_count set default null;

update public.lotteries
   set pity_winner_count = null
 where pity_mode = 'none';

alter table public.lotteries
  drop constraint if exists lotteries_pity_winner_count_check;

alter table public.lotteries
  add constraint lotteries_pity_winner_count_check
  check (
    (pity_mode in ('none', 'count_only') and pity_winner_count is null)
    or (
      pity_mode = 'eligible'
      and pity_winner_count is not null
      and pity_winner_count > 0
      and pity_winner_count <= winner_count
    )
  );

commit;
