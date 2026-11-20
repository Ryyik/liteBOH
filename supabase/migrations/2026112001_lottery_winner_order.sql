-- ============================================================================
-- 抽奖中奖自动生成商城订单（2026-11-20 用户口径「抽奖中了之后会自动出现订单」）
--
-- 背景：execute_lottery_draw 开奖后只写开奖日志 / 通知 / 保底履约记录
--   （lottery_winner_fulfillments），从不写 shop_points_orders ⇒ 数据管理面板的
--   「商城订单」看不到任何抽奖来源的单，管理员履约要另开「履约与通知」页。
--   用户侧购物袋的中奖记录是前端合成的虚拟卡（fetchMyLotteryOrders），没有
--   准备中/已寄出/已送达 的发货状态机。
--
-- 本迁移做四件事（①②③④ 必须同事务，函数与约束口径互相依赖）：
--   ① shop_points_orders 加 source（'shop' | 'lottery'）与 lottery_id 两列，
--      并加部分唯一索引 (lottery_id, user_id) —— 同一场抽奖同一中奖人最多一张
--      自动订单，重抽防重全靠它。
--   ② payment_mode 增加 'lottery' 档并重写金额自洽约束：0 元订单
--      （total_points = 0 且 rmb_total 空/0）只允许挂在 lottery 档下。
--      原三种档位口径不变；存量数据全部满足，可直接 validate。
--   ③ 新增 create_lottery_winner_order(p_lottery_id, p_lottery_title, p_user_id,
--      p_username, p_prize_title [, p_prize_description, p_image])：
--      SECURITY DEFINER，写一张 0 元 preparing 订单。中奖者联系快照取 profiles
--      的收货三件套（缺项回落电话→收件人→用户名→'待补充'，contact_type='profile'
--      与 2026110106 的「资料即收货信息」口径一致）。冲突（同人同场已有单）时
--      do update：仅当旧单是 cancelled 才复活为 preparing，已寄出/已送达不回退。
--   ④ 重写 execute_lottery_draw：普通中奖与保底中奖循环里各 perform 一次 ③；
--      重抽（p_redraw）后把「本轮未再中奖」者的 preparing 自动单作废
--      （cancelled）。⚠️ 订单写入失败**不**让开奖失败：helper 内部捕异常只
--      raise warning（开奖/通知已经成功，因为 0 元单写不进去就整体回滚，
--      会把「你中奖了」的站内信一起吞掉 —— 得不偿失）。PostgreSQL 日志里
--      搜 LOTTERY_WINNER_ORDER_FAILED 可定位漏单，人工补录。
--
-- 授权纪律（同 2026110412）：helper revoke public/anon/authenticated、只给
--   service_role —— 它是 definer 写入口，不该被客户端直接调用。
--
-- 回滚说明（手工执行，不在迁移里）：
--   drop function if exists public.create_lottery_winner_order(uuid,text,uuid,text,text,text,text);
--   -- 再从 2026100403_fix_execute_lottery_draw_fulfillment_id.sql 重建 execute_lottery_draw。
--   加的两列是 add column if not exists，回滚时不必删（旧函数不写它们）。
-- ============================================================================

begin;

-- ── ① 来源列 + 抽奖关联 + 防重索引 ─────────────────────────────────────────
alter table public.shop_points_orders
  add column if not exists source text not null default 'shop',
  add column if not exists lottery_id uuid;

comment on column public.shop_points_orders.source is
  '订单来源：shop=商城下单（create_shop_order），lottery=抽奖中奖自动生成（create_lottery_winner_order）';
comment on column public.shop_points_orders.lottery_id is
  '来源为 lottery 时指向中奖的抽奖；活动被删时置空（on delete set null），订单保留';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'shop_points_orders_source_check'
       and conrelid = 'public.shop_points_orders'::regclass
  ) then
    alter table public.shop_points_orders
      add constraint shop_points_orders_source_check
      check (source = any (array['shop'::text, 'lottery'::text]));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'shop_points_orders_lottery_id_fkey'
       and conrelid = 'public.shop_points_orders'::regclass
  ) then
    alter table public.shop_points_orders
      add constraint shop_points_orders_lottery_id_fkey
      foreign key (lottery_id) references public.lotteries (id)
      on delete set null;
  end if;
end;
$$;

create unique index if not exists uq_shop_points_orders_lottery_winner
  on public.shop_points_orders (lottery_id, user_id)
  where lottery_id is not null and source = 'lottery';

-- ── ② payment_mode 增加 lottery 档，金额口径与档位必须一起换 ────────────────
alter table public.shop_points_orders
  drop constraint shop_points_orders_payment_mode_check;

alter table public.shop_points_orders
  add constraint shop_points_orders_payment_mode_check
  check (payment_mode = any (array['points_only'::text, 'rmb_only'::text, 'combined'::text, 'lottery'::text]));

alter table public.shop_points_orders
  drop constraint shop_points_orders_payment_mode_amounts_check;

alter table public.shop_points_orders
  add constraint shop_points_orders_payment_mode_amounts_check
  check (
    case payment_mode
      when 'points_only' then total_points > 0 and coalesce(rmb_total, 0) = 0
      when 'rmb_only'    then total_points = 0 and coalesce(rmb_total, 0) > 0
      when 'combined'    then total_points > 0 and coalesce(rmb_total, 0) > 0
      when 'lottery'     then total_points = 0 and coalesce(rmb_total, 0) = 0
      else false
    end
  );

-- ── ③ 中奖订单写入 helper ──────────────────────────────────────────────────
drop function if exists public.create_lottery_winner_order(uuid, text, uuid, text, text, text, text);

create function public.create_lottery_winner_order(
  p_lottery_id uuid,
  p_lottery_title text,
  p_user_id uuid,
  p_username text,
  p_prize_title text,
  p_prize_description text default null,
  p_image text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_recipient text;
  v_phone text;
  v_address text;
  v_contact_value text;
  v_order_id uuid := gen_random_uuid();
  v_order_no text;
  v_prize_title text := coalesce(nullif(trim(coalesce(p_prize_title, '')), ''), '抽奖奖品');
begin
  /* 中奖者联系快照：开奖那一刻的资料收货信息冻在订单上，之后改资料不影响这单 */
  select nullif(trim(coalesce(shipping_recipient, '')), ''),
         nullif(trim(coalesce(shipping_phone, '')), ''),
         nullif(trim(coalesce(shipping_address, '')), '')
    into v_recipient, v_phone, v_address
    from public.profiles
   where id = p_user_id;

  v_contact_value := coalesce(v_phone, v_recipient, nullif(trim(coalesce(p_username, '')), ''), '待补充');
  if char_length(v_contact_value) > 64 then
    v_contact_value := left(v_contact_value, 64);
  end if;

  v_order_no := 'BOH-LOTTERY-'
    || to_char(now(), 'YYYYMMDDHH24MISS')
    || '-'
    || upper(substr(replace(v_order_id::text, '-', ''), 1, 8));

  /* 冲突 = 同场抽奖同一中奖人已有自动单（重抽再中）。
     仅 cancelled 复活为 preparing；已寄出/已送达不回退 —— 实物可能已经在路上。 */
  insert into public.shop_points_orders (
    id, user_id, order_no, contact_type, contact_value,
    items, total_points, points_used, rmb_total, payment_mode, status,
    shipping_recipient, shipping_phone, shipping_address,
    remark, source, lottery_id
  ) values (
    v_order_id,
    p_user_id,
    v_order_no,
    'profile',
    v_contact_value,
    jsonb_build_array(jsonb_build_object(
      'id', 0,
      'title', v_prize_title,
      'category', 'lottery',
      'description', coalesce(p_prize_description, ''),
      'image', coalesce(p_image, ''),
      'points_cost', 0,
      'stock', null,
      'quantity', 1,
      'selected_spec', '',
      'selected_spec_label', '中奖奖品'
    )),
    0,
    0,
    null,
    'lottery',
    'preparing',
    v_recipient,
    v_phone,
    v_address,
    left('抽奖「' || coalesce(p_lottery_title, '') || '」中奖奖品，开奖时自动生成', 200),
    'lottery',
    p_lottery_id
  )
  on conflict (lottery_id, user_id) where lottery_id is not null and source = 'lottery'
  do update set
    status = case when shop_points_orders.status = 'cancelled'
                  then 'preparing' else shop_points_orders.status end,
    updated_at = now()
  returning order_no into v_order_no;

  return v_order_no;
exception when others then
  /* 订单写失败不拖垮开奖：调用方（execute_lottery_draw）的中奖通知已经发出，
     整体回滚反而会把「你中奖了」一起吞掉。漏单靠 warning 日志人工补录。 */
  raise warning 'LOTTERY_WINNER_ORDER_FAILED lottery_id=% user_id=%: %',
    p_lottery_id, p_user_id, sqlerrm;
  return null;
end;
$function$;

revoke all on function public.create_lottery_winner_order(uuid, text, uuid, text, text, text, text) from public;
revoke all on function public.create_lottery_winner_order(uuid, text, uuid, text, text, text, text) from anon;
revoke all on function public.create_lottery_winner_order(uuid, text, uuid, text, text, text, text) from authenticated;
grant execute on function public.create_lottery_winner_order(uuid, text, uuid, text, text, text, text) to service_role;

-- ── ④ 重写 execute_lottery_draw：中奖循环里各生成一张订单 ───────────────────
-- 函数体整段复制自 2026100403_fix_execute_lottery_draw_fulfillment_id.sql，
-- 改动只有三处（搜索「lottery-order」定位）：
--   a) 声明区加一行注释性说明（无新变量，订单经 helper perform）；
--   b) 普通中奖循环内 perform create_lottery_winner_order(...)；
--   c) 保底中奖循环内 perform create_lottery_winner_order(...)；
--   d) 重抽路径：两轮循环结束后作废未再中奖者的 preparing 自动单。
create or replace function public.execute_lottery_draw(p_lottery_id uuid, p_force boolean DEFAULT false, p_redraw boolean DEFAULT false, p_reason text DEFAULT NULL::text)
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

      -- lottery-order (b)：普通中奖自动生成 0 元商城订单。
      -- helper 内部吞异常（失败只 raise warning），不会让开奖整体回滚。
      perform public.create_lottery_winner_order(
        p_lottery_id,
        v_lottery.title,
        v_winner.user_id,
        v_winner.username_snapshot,
        v_lottery.prize_title,
        v_lottery.prize_description,
        v_lottery.cover_image_url
      );
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

        -- lottery-order (c)：保底中奖同样生成订单（奖品 = 本档保底礼）。
        perform public.create_lottery_winner_order(
          p_lottery_id,
          v_lottery.title,
          v_pity_entry.user_id,
          v_pity_entry.username_snapshot,
          v_award_title,
          v_award_description,
          v_lottery.cover_image_url
        );
      end loop;
    end if;
  end if;

  -- lottery-order (d)：重抽后，上一轮中奖但本轮未再中奖者的 preparing 自动单作废。
  -- 只动 preparing：已寄出/已送达是既成事实，留给管理员在面板里人工处理。
  if p_redraw then
    update public.shop_points_orders
       set status = 'cancelled', updated_at = now()
     where lottery_id = p_lottery_id
       and source = 'lottery'
       and status = 'preparing'
       and not (user_id = any(v_winner_user_ids))
       and not (user_id = any(v_pity_recipient_user_ids));
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
$function$;

commit;
