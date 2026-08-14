-- Community lottery list performance:
-- aggregate the visible list in sets instead of issuing several queries per lottery.

create or replace function public.get_community_lotteries()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_due_lottery_id uuid;
  v_items jsonb;
begin
  -- Keep the existing read-time draw fallback for installations without pg_cron.
  for v_due_lottery_id in
    select id
      from public.lotteries
     where is_community_visible = true
       and status = 'open'
       and draw_at is not null
       and draw_at <= now()
  loop
    begin
      perform public.execute_lottery_draw(v_due_lottery_id, false, false, null);
    exception
      when others then
        perform public.record_lottery_auto_draw_failure(
          v_due_lottery_id,
          concat(coalesce(sqlstate, 'AUTO_DRAW_FAILED'), ' ', coalesce(sqlerrm, '自动开奖失败'))
        );
    end;
  end loop;

  with visible_lotteries as (
    select l.*
      from public.lotteries l
     where l.is_community_visible = true
       and l.status in ('open', 'drawn', 'closed')
  ),
  entry_stats as (
    select e.lottery_id,
           count(*)::integer as entry_count
      from public.lottery_entries e
      join visible_lotteries l on l.id = e.lottery_id
     group by e.lottery_id
  ),
  current_entries as (
    select distinct on (e.lottery_id)
           e.lottery_id,
           e.id,
           e.created_at
      from public.lottery_entries e
      join visible_lotteries l on l.id = e.lottery_id
     where e.user_id = auth.uid()
     order by e.lottery_id, e.created_at, e.id
  ),
  current_entry_numbers as (
    select c.lottery_id,
           count(e.id)::integer as entry_number
      from current_entries c
      join public.lottery_entries e
        on e.lottery_id = c.lottery_id
       and e.created_at <= c.created_at
     group by c.lottery_id
  ),
  latest_draws as (
    select d.lottery_id,
           max(d.draw_no) as draw_no
      from public.lottery_draw_logs d
      join visible_lotteries l on l.id = d.lottery_id and l.status = 'drawn'
     group by d.lottery_id
  ),
  winner_lists as (
    select d.lottery_id,
           jsonb_agg(
             jsonb_build_object(
               'position', d.winner_position,
               'entry_id', d.entry_id,
               'user_id', d.user_id,
               'username', d.username_snapshot
             ) order by d.winner_position
           ) filter (where d.user_id is not null) as winners
      from public.lottery_draw_logs d
      join latest_draws ld
        on ld.lottery_id = d.lottery_id
       and ld.draw_no = d.draw_no
     group by d.lottery_id
  )
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', l.id,
               'title', l.title,
               'description', l.description,
               'prize_title', l.prize_title,
               'prize_description', l.prize_description,
               'cover_image_url', l.cover_image_url,
               'status', l.status,
               'fulfillment_status', l.fulfillment_status,
               'max_entries', l.max_entries,
               'winner_count', l.winner_count,
               'entry_count', coalesce(es.entry_count, 0),
               'entry_deadline_at', l.entry_deadline_at,
               'draw_at', l.draw_at,
               'drawn_at', l.drawn_at,
               'winner_user_id', l.winner_user_id,
               'winner_username', l.winner_username,
               'winners', coalesce(wl.winners, '[]'::jsonb),
               'current_user_entry_id', ce.id,
               'current_user_entry_created_at', ce.created_at,
               'current_user_entry_number', cen.entry_number,
               'enforce_account_age_check', coalesce(l.enforce_account_age_check, false),
               'created_at', l.created_at,
               'updated_at', l.updated_at
             )
             order by
               case when l.status = 'open' then 0 else 1 end,
               coalesce(l.draw_at, l.drawn_at, l.created_at) desc,
               l.created_at desc
           ),
           '[]'::jsonb
         )
    into v_items
    from visible_lotteries l
    left join entry_stats es on es.lottery_id = l.id
    left join current_entries ce on ce.lottery_id = l.id
    left join current_entry_numbers cen on cen.lottery_id = l.id
    left join winner_lists wl on wl.lottery_id = l.id;

  return v_items;
end;
$$;

-- Supports the visible-list filter before it joins entries and draw logs.
create index if not exists idx_lotteries_community_visible_status_created
  on public.lotteries (status, created_at desc)
  where is_community_visible = true;
