-- Seed the pity progress with lotteries that were already finished when the
-- pity feature was introduced. This runs once so future "do not count" events
-- remain excluded by the live draw workflow.

begin;

create table if not exists public.lottery_pity_backfill_runs (
  backfill_key text primary key,
  completed_at timestamp with time zone not null default now()
);

do $$
begin
  if exists (
    select 1
      from public.lottery_pity_backfill_runs
     where backfill_key = 'historical-progress-v1'
  ) then
    return;
  end if;

  with historical_lotteries as (
    select
      l.id,
      coalesce(l.drawn_at, l.draw_at, l.created_at) as event_at,
      (
        select max(dl.draw_no)
          from public.lottery_draw_logs dl
         where dl.lottery_id = l.id
      ) as latest_draw_no
    from public.lotteries l
    where l.status in ('drawn', 'closed')
  ),
  participations as (
    select
      e.id as entry_id,
      e.lottery_id,
      e.user_id,
      h.event_at,
      case when exists (
        select 1
          from public.lottery_draw_logs dl
         where dl.lottery_id = e.lottery_id
           and dl.draw_no = h.latest_draw_no
           and dl.user_id = e.user_id
      ) or exists (
        select 1
          from public.lottery_winner_fulfillments f
         where f.lottery_id = e.lottery_id
           and f.user_id = e.user_id
           and f.is_current = true
           and f.award_kind = 'pity_primary'
      ) then 'win' else 'loss' end as result
    from historical_lotteries h
    join public.lottery_entries e on e.lottery_id = h.id
  ),
  ordered_participations as (
    select
      p.*,
      row_number() over (
        partition by p.user_id
        order by p.event_at nulls last, p.lottery_id, p.entry_id
      ) as participation_no
    from participations p
  ),
  last_wins as (
    select
      p.user_id,
      max(p.participation_no) filter (where p.result = 'win') as participation_no
    from ordered_participations p
    group by p.user_id
  ),
  summaries as (
    select
      p.user_id,
      count(*) filter (
        where p.result = 'loss'
          and p.participation_no > coalesce(w.participation_no, 0)
      )::integer as consecutive_losses,
      (
        array_agg(p.lottery_id order by p.event_at desc nulls last, p.lottery_id desc, p.entry_id desc)
      )[1] as last_lottery_id,
      max(p.event_at) as updated_at
    from ordered_participations p
    join last_wins w on w.user_id = p.user_id
    group by p.user_id, w.participation_no
  )
  insert into public.lottery_pity_progress (
    user_id,
    consecutive_losses,
    last_lottery_id,
    updated_at
  )
  select
    s.user_id,
    least(
      greatest(coalesce(s.consecutive_losses, 0), 0),
      public.lottery_pity_threshold(public.get_user_subscription_tier(s.user_id))
    ),
    s.last_lottery_id,
    coalesce(s.updated_at, now())
  from summaries s
  where public.lottery_pity_threshold(public.get_user_subscription_tier(s.user_id)) > 0
  on conflict (user_id) do update
    set consecutive_losses = excluded.consecutive_losses,
        last_lottery_id = excluded.last_lottery_id,
        updated_at = excluded.updated_at;

  insert into public.lottery_pity_backfill_runs (backfill_key)
  values ('historical-progress-v1');
end;
$$;

comment on table public.lottery_pity_backfill_runs is
  '记录已完成的抽奖保底历史回填，防止重复将旧记录计入进度';

commit;
