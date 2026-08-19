-- A pity reward is a win for reporting and for any later history rebuild.

begin;

create or replace view public.lottery_failure_stats
with (security_invoker = true)
as
with historical_lotteries as (
  select
    l.id,
    l.title,
    coalesce(l.drawn_at, l.draw_at, l.created_at) as event_at,
    (select max(dl.draw_no) from public.lottery_draw_logs dl where dl.lottery_id = l.id) as latest_draw_no
  from public.lotteries l
  where l.status in ('drawn', 'closed')
), participants as (
  select
    e.id as entry_id,
    e.lottery_id,
    e.user_id,
    coalesce(nullif(trim(e.username_snapshot), ''), nullif(trim(p.username), ''), '未知用户') as username,
    h.title as lottery_title,
    h.event_at,
    case when exists (
      select 1 from public.lottery_draw_logs dl
      where dl.lottery_id = e.lottery_id
        and dl.draw_no = h.latest_draw_no
        and dl.user_id = e.user_id
    ) or exists (
      select 1 from public.lottery_winner_fulfillments f
      where f.lottery_id = e.lottery_id
        and f.user_id = e.user_id
        and f.is_current = true
        and f.award_kind = 'pity_primary'
    ) then 'win' else 'loss' end as result
  from historical_lotteries h
  join public.lottery_entries e on e.lottery_id = h.id
  left join public.profiles p on p.id = e.user_id
), ordered_participants as (
  select participants.*,
    row_number() over (
      partition by user_id
      order by event_at nulls last, lottery_id, entry_id
    ) as participation_no
  from participants
), user_summary as (
  select
    user_id,
    (array_agg(username order by event_at desc nulls last, lottery_id desc, entry_id desc))[1] as username,
    count(*)::integer as total_participations,
    count(*) filter (where result = 'win')::integer as win_count,
    count(*) filter (where result = 'loss')::integer as failure_count,
    max(participation_no) filter (where result = 'win') as latest_win_no,
    max(event_at) as last_participated_at,
    (array_agg(result order by event_at desc nulls last, lottery_id desc, entry_id desc))[1] as last_result,
    (array_agg(lottery_title order by event_at desc nulls last, lottery_id desc, entry_id desc))[1] as latest_lottery_title,
    (array_agg(lottery_id order by event_at desc nulls last, lottery_id desc, entry_id desc))[1] as latest_lottery_id
  from ordered_participants
  group by user_id
)
select
  s.user_id as id,
  s.user_id,
  s.username,
  s.total_participations,
  s.win_count,
  s.failure_count,
  count(p.entry_id) filter (
    where p.result = 'loss' and p.participation_no > coalesce(s.latest_win_no, 0)
  )::integer as current_failure_streak,
  round((s.failure_count::numeric / nullif(s.total_participations, 0)) * 100, 2) as failure_rate,
  case s.last_result
    when 'win' then '最近中奖'
    when 'loss' then '最近未中奖'
    else '无记录'
  end as last_result_label,
  s.last_participated_at,
  s.latest_lottery_id,
  s.latest_lottery_title
from user_summary s
join ordered_participants p on p.user_id = s.user_id
group by s.user_id, s.username, s.total_participations, s.win_count,
  s.failure_count, s.latest_win_no, s.last_result, s.last_participated_at,
  s.latest_lottery_id, s.latest_lottery_title;

grant select on public.lottery_failure_stats to authenticated, service_role;

commit;
