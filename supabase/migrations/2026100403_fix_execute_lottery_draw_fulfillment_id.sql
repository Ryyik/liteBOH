-- 2026100403: 修复 execute_lottery_draw 的运行期 42703（抽奖开奖写通知任务失败）
--
-- 发现方式：supabase db lint --linked --level warning
--   public.execute_lottery_draw [error]
--   column "fulfillment_id" of relation "lottery_notification_jobs" does not exist (42703)
--
-- 根因：函数往 lottery_notification_jobs 的 insert 列清单里写了 fulfillment_id，
--   但这一列**只存在于 public.lottery_admin_audit_logs**（2026081406_lottery_operations_and_retention.sql:72
--   加的 `fulfillment_id uuid null references public.lottery_winner_fulfillments(id)`）。
--   lottery_notification_jobs 建表于 2026052001:50，此后所有迁移都没给它加过这一列。
--   ⇒ 疑似 2026081904:491 的 insert 列清单从审计日志那条复制而来。
--
-- 影响：走「保底中奖」分支时整个 execute_lottery_draw 事务失败 ⇒ 开奖不可用。
--
-- 修法：从该 insert 的列清单与 values 里去掉 fulfillment_id（**不动表结构**）。
--   保留上面 `returning id into v_fulfillment_id` 的写法（那条写的是
--   lottery_winner_fulfillments，是另一张表，本身没问题）。
--
-- 幂等：create or replace，签名不变。

CREATE OR REPLACE FUNCTION public.execute_lottery_draw(p_lottery_id uuid, p_force boolean DEFAULT false, p_redraw boolean DEFAULT false, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lottery public.lotteries%rowtype;
  v_winner public.lottery_entries%rowtype;
  v_first_winner public.lottery_entries%rowtype;
  v_entry public.lottery_entries%rowtype;
  v_pity_entry record;
  v_entry_count integer := 0;
  v_draw_no integer := 1;
  v_previous_draw_no integer := null;
  v_previous_winner_count integer := 0;
  v_winner_limit integer := 0;
  v_actual_winner_count integer := 0;
  v_pity_due_count integer := 0;
  v_pity_primary_limit integer := 0;
  v_pity_primary_count integer := 0;
  v_pity_overflow_count integer := 0;
  v_pity_position integer := 0;
  v_winners jsonb := '[]'::jsonb;
  v_candidate_hash text := null;
  v_notification_id uuid := null;
  v_fulfillment_id uuid := null;
  v_notification_content text := '';
  v_reason text := nullif(trim(coalesce(p_reason, case when p_redraw then 'redraw' else 'initial_draw' end)), '');
  v_error_message text := '';
  v_winner_user_ids uuid[] := '{}'::uuid[];
  v_pity_recipient_user_ids uuid[] := '{}'::uuid[];
  v_tier_code text := 'free';
  v_pity_threshold integer := 0;
  v_streak_before integer := 0;
  v_streak_after integer := 0;
  v_pity_result text := 'loss';
  v_award_kind text := 'pity_primary';
  v_award_title text := '';
  v_award_description text := '';
begin
  if p_force and not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可手动开奖');
  end if;

  if p_redraw and not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可重抽');
  end if;

  select * into v_lottery
    from public.lotteries
   where id = p_lottery_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', '抽奖不存在');
  end if;

  if v_lottery.status = 'drawn' and not p_redraw then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_DRAWN', 'message', '抽奖已经开奖', 'winner_user_id', v_lottery.winner_user_id, 'winner_username', v_lottery.winner_username);
  end if;

  if v_lottery.status not in ('open', 'drawn') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPEN', 'message', '当前抽奖不在开放状态');
  end if;

  if p_redraw and v_lottery.pity_mode <> 'none' then
    return jsonb_build_object('ok', false, 'code', 'PITY_REDRAW_UNSUPPORTED', 'message', '计入保底的抽奖不支持重抽，请关闭后重新创建活动');
  end if;

  if not p_force and not p_redraw and (v_lottery.draw_at is null or v_lottery.draw_at > now()) then
    return jsonb_build_object('ok', true, 'code', 'NOT_DUE', 'message', '尚未到开奖时间');
  end if;

  -- Pity progress is shared by every event, so serialize pity draws to avoid
  -- giving the same due participant a reward in concurrent events.
  if v_lottery.pity_mode <> 'none' then
    perform pg_advisory_xact_lock(hashtext('lottery_pity_progress_v3'));
  end if;

  update public.lotteries
     set draw_attempted_at = now(), draw_failed_at = null, draw_failure_message = null
   where id = p_lottery_id;

  select count(*)::integer,
         md5(coalesce(string_agg(e.id::text || ':' || e.user_id::text, ',' order by e.created_at, e.id), ''))
    into v_entry_count, v_candidate_hash
    from public.lottery_entries e
   where e.lottery_id = p_lottery_id;

  select max(draw_no) into v_previous_draw_no
    from public.lottery_draw_logs
   where lottery_id = p_lottery_id;

  if v_previous_draw_no is not null then
    select count(*) into v_previous_winner_count
      from public.lottery_draw_logs
     where lottery_id = p_lottery_id and draw_no = v_previous_draw_no and user_id is not null;
  end if;

  select coalesce(max(draw_no), 0) + 1 into v_draw_no
    from public.lottery_draw_logs
   where lottery_id = p_lottery_id;

  if v_entry_count > 0 then
    v_winner_limit := least(greatest(coalesce(v_lottery.winner_count, 1), 1), v_entry_count);

    -- The normal pool is always drawn first and never loses seats to pity.
    for v_winner in
      with eligible_entries as (
        select e.*
          from public.lottery_entries e
         where e.lottery_id = p_lottery_id
           and (
             not p_redraw
             or v_previous_draw_no is null
             or v_previous_winner_count = 0
             or v_entry_count <= v_previous_winner_count
             or (v_entry_count - v_previous_winner_count) < v_winner_limit
             or not exists (
               select 1 from public.lottery_draw_logs l
                where l.lottery_id = p_lottery_id
                  and l.draw_no = v_previous_draw_no
                  and l.user_id = e.user_id
             )
           )
      )
      select * from eligible_entries order by random() limit v_winner_limit
    loop
      v_actual_winner_count := v_actual_winner_count + 1;
      v_winner_user_ids := array_append(v_winner_user_ids, v_winner.user_id);

      if v_actual_winner_count = 1 then
        v_first_winner := v_winner;
      end if;

      v_winners := v_winners || jsonb_build_array(jsonb_build_object(
        'position', v_actual_winner_count,
        'entry_id', v_winner.id,
        'user_id', v_winner.user_id,
        'username', v_winner.username_snapshot,
        'pity', false
      ));

      insert into public.lottery_draw_logs (
        lottery_id, draw_no, entry_id, user_id, username_snapshot, winner_position, drawn_by, reason
      ) values (
        p_lottery_id, v_draw_no, v_winner.id, v_winner.user_id, v_winner.username_snapshot,
        v_actual_winner_count, auth.uid(), v_reason
      );

      v_notification_content := concat('你在「', v_lottery.title, '」中中奖啦！奖品：', v_lottery.prize_title);
      insert into public.lottery_notification_jobs (
        lottery_id, draw_no, winner_position, user_id, type, content, status
      ) values (
        p_lottery_id, v_draw_no, v_actual_winner_count, v_winner.user_id, 'lottery_win', v_notification_content, 'pending'
      ) on conflict (lottery_id, draw_no, winner_position, type) do nothing;

      begin
        insert into public.notifications (recipient_id, sender_id, type, status, content)
        values (v_winner.user_id, auth.uid(), 'lottery_win', 'unread', v_notification_content)
        returning id into v_notification_id;

        update public.lottery_notification_jobs
           set status = 'sent', notification_id = v_notification_id, attempt_count = attempt_count + 1, updated_at = now()
         where lottery_id = p_lottery_id and draw_no = v_draw_no
           and winner_position = v_actual_winner_count and type = 'lottery_win';
      exception when others then
        update public.lottery_notification_jobs
           set status = 'failed', attempt_count = attempt_count + 1,
               last_error = left(coalesce(sqlerrm, '通知发送失败'), 500), updated_at = now()
         where lottery_id = p_lottery_id and draw_no = v_draw_no
           and winner_position = v_actual_winner_count and type = 'lottery_win';
      end;
    end loop;

    -- Due users who already won the normal prize are fulfilled by that prize.
    -- Every remaining due user receives either the primary pity reward or the
    -- fixed overflow reward; no cap can fail the draw.
    if v_lottery.pity_mode = 'eligible' then
      v_pity_primary_limit := least(greatest(ceil(v_winner_limit::numeric * 0.2)::integer, 1), 5);

      for v_pity_entry in
        select e.id as entry_id, e.user_id, e.username_snapshot, e.created_at,
               p.consecutive_losses, p.updated_at as progress_updated_at
          from public.lottery_entries e
          join public.lottery_pity_progress p on p.user_id = e.user_id
         where e.lottery_id = p_lottery_id
           and p.consecutive_losses >= public.lottery_pity_threshold(public.get_user_subscription_tier(e.user_id))
           and public.lottery_pity_threshold(public.get_user_subscription_tier(e.user_id)) > 0
           and not (e.user_id = any(v_winner_user_ids))
         order by p.consecutive_losses desc, p.updated_at asc, e.created_at asc, e.id asc
      loop
        v_pity_due_count := v_pity_due_count + 1;
        v_pity_position := v_pity_position + 1;
        v_pity_recipient_user_ids := array_append(v_pity_recipient_user_ids, v_pity_entry.user_id);

        if v_pity_primary_count < v_pity_primary_limit then
          v_award_kind := 'pity_primary';
          v_award_title := v_lottery.pity_reward_title;
          v_award_description := v_lottery.pity_reward_description;
          v_pity_primary_count := v_pity_primary_count + 1;
        else
          v_award_kind := 'pity_overflow';
          v_award_title := v_lottery.pity_overflow_reward_title;
          v_award_description := v_lottery.pity_overflow_reward_description;
          v_pity_overflow_count := v_pity_overflow_count + 1;
        end if;

        insert into public.lottery_winner_fulfillments (
          lottery_id, draw_no, winner_position, entry_id, user_id, username_snapshot,
          award_kind, award_title, award_description, status, is_current, created_by, updated_by
        ) values (
          p_lottery_id, v_draw_no, v_pity_position, v_pity_entry.entry_id, v_pity_entry.user_id, v_pity_entry.username_snapshot,
          v_award_kind, v_award_title, v_award_description, 'pending_contact', true, auth.uid(), auth.uid()
        ) returning id into v_fulfillment_id;

        v_notification_content := concat('你在「', v_lottery.title, '」中获得保底礼：', v_award_title);
        -- ⚠️ 这里**不能**带 fulfillment_id：public.lottery_notification_jobs 没有这一列。
        -- 该列只存在于 public.lottery_admin_audit_logs（2026081406:72 加的）。
        -- 2026081904:491 的 insert 列清单疑似从审计日志那条复制而来 ⇒ 运行期 42703。
        insert into public.lottery_notification_jobs (
          lottery_id, draw_no, winner_position, user_id, type, content, status
        ) values (
          p_lottery_id, v_draw_no, v_pity_position, v_pity_entry.user_id,
          concat('lottery_', v_award_kind), v_notification_content, 'pending'
        ) on conflict (lottery_id, draw_no, winner_position, type) do nothing;

        begin
          insert into public.notifications (recipient_id, sender_id, type, status, content)
          values (v_pity_entry.user_id, auth.uid(), 'lottery_win', 'unread', v_notification_content)
          returning id into v_notification_id;

          update public.lottery_notification_jobs
             set status = 'sent', notification_id = v_notification_id, attempt_count = attempt_count + 1, updated_at = now()
           where lottery_id = p_lottery_id and draw_no = v_draw_no
             and winner_position = v_pity_position and type = concat('lottery_', v_award_kind);
        exception when others then
          update public.lottery_notification_jobs
             set status = 'failed', attempt_count = attempt_count + 1,
                 last_error = left(coalesce(sqlerrm, '通知发送失败'), 500), updated_at = now()
           where lottery_id = p_lottery_id and draw_no = v_draw_no
             and winner_position = v_pity_position and type = concat('lottery_', v_award_kind);
        end;
      end loop;
    end if;
  end if;

  if not p_redraw and v_lottery.pity_mode <> 'none' then
    for v_entry in
      select e.* from public.lottery_entries e where e.lottery_id = p_lottery_id
    loop
      v_tier_code := coalesce(nullif(public.get_user_subscription_tier(v_entry.user_id), ''), 'free');
      v_pity_threshold := public.lottery_pity_threshold(v_tier_code);
      if v_pity_threshold <= 0 then
        continue;
      end if;

      select consecutive_losses into v_streak_before
        from public.lottery_pity_progress
       where user_id = v_entry.user_id
       for update;
      if not found then
        v_streak_before := 0;
      end if;

      if v_entry.user_id = any(v_winner_user_ids) then
        v_streak_after := 0;
        v_pity_result := 'random_win';
      elsif v_entry.user_id = any(v_pity_recipient_user_ids) then
        v_streak_after := 0;
        v_pity_result := 'pity_win';
      else
        v_streak_after := least(v_streak_before + 1, v_pity_threshold);
        v_pity_result := 'loss';
      end if;

      insert into public.lottery_pity_progress (user_id, consecutive_losses, last_lottery_id, updated_at)
      values (v_entry.user_id, v_streak_after, p_lottery_id, now())
      on conflict (user_id) do update set
        consecutive_losses = excluded.consecutive_losses,
        last_lottery_id = excluded.last_lottery_id,
        updated_at = excluded.updated_at;

      insert into public.lottery_pity_events (
        lottery_id, user_id, entry_id, tier_code, result, streak_before, streak_after
      ) values (
        p_lottery_id, v_entry.user_id, v_entry.id, v_tier_code, v_pity_result, v_streak_before, v_streak_after
      ) on conflict (lottery_id, user_id) do nothing;
    end loop;
  end if;

  update public.lotteries
     set status = 'drawn', drawn_at = now(), draw_attempted_at = coalesce(draw_attempted_at, now()),
         draw_failed_at = null, draw_failure_message = null, draw_entry_count_snapshot = v_entry_count,
         draw_candidate_hash = v_candidate_hash,
         draw_algorithm_version = case when v_lottery.pity_mode = 'eligible' then 'postgres_order_by_random_v1_dynamic_pity_v3' else 'postgres_order_by_random_v1' end,
         winner_entry_id = case when v_actual_winner_count > 0 then v_first_winner.id else null end,
         winner_user_id = case when v_actual_winner_count > 0 then v_first_winner.user_id else null end,
         winner_username = case when v_actual_winner_count > 0 then v_first_winner.username_snapshot else null end,
         fulfillment_status = 'pending_contact',
         updated_by = case when p_force then auth.uid() else updated_by end
   where id = p_lottery_id
   returning * into v_lottery;

  if v_actual_winner_count = 0 then
    insert into public.lottery_draw_logs (
      lottery_id, draw_no, entry_id, user_id, username_snapshot, winner_position, drawn_by, reason
    ) values (p_lottery_id, v_draw_no, null, null, null, 1, auth.uid(), v_reason);
  end if;

  return jsonb_build_object(
    'ok', true, 'code', 'DRAWN', 'message', '开奖完成', 'entry_count', v_entry_count,
    'draw_no', v_draw_no, 'winner_count', v_lottery.winner_count,
    'actual_winner_count', v_actual_winner_count, 'pity_mode', v_lottery.pity_mode,
    'pity_due_count', v_pity_due_count, 'pity_primary_limit', v_pity_primary_limit,
    'pity_primary_count', v_pity_primary_count, 'pity_overflow_count', v_pity_overflow_count,
    'candidate_hash', v_candidate_hash, 'algorithm_version', v_lottery.draw_algorithm_version,
    'winners', v_winners, 'winner_user_id', v_lottery.winner_user_id,
    'winner_username', v_lottery.winner_username, 'drawn_at', v_lottery.drawn_at
  );
exception when others then
  v_error_message := left(concat(coalesce(sqlstate, 'DRAW_FAILED'), ' ', coalesce(sqlerrm, '开奖失败')), 500);
  update public.lotteries
     set draw_failed_at = now(), draw_failure_message = v_error_message,
         draw_attempted_at = coalesce(draw_attempted_at, now())
   where id = p_lottery_id;
  return jsonb_build_object('ok', false, 'code', coalesce(sqlstate, 'DRAW_FAILED'), 'message', v_error_message);
end;
$function$
