-- ============================================================================
-- 2026081502: 业务逻辑与数据一致性修复
-- 修复项:
--   H3: admin_revoke_grant 余额与流水记录不一致（使用实际扣减量而非原始发放量）
--   M2: enforce_account_age_check 默认值改为 true（安全优先）
--   M8: get_home_lottery / get_community_lotteries 移除读函数中的开奖副作用
--   M10: 添加 profiles(points) 索引并优化排行榜查询
-- ============================================================================

begin;

-- ============================================
-- H3: 修复 admin_revoke_grant 余额与流水一致性
-- 原 Bug: 撤销时使用 greatest(0, points - v_amount) 限制余额下限，
--         但流水 amount 固定为 -t.amount（原始发放量取反），
--         当用户已消费部分积分时，实际扣减量 < 原始发放量，流水与余额不匹配。
-- 修复: 使用 CTE 获取旧余额，计算实际扣减量写入流水。
-- ============================================

create or replace function public.admin_revoke_grant(
  p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operator uuid := auth.uid();
  v_revoked integer := 0;
  v_amount integer;
  v_remark text;
  v_result jsonb;
begin
  -- 与 2026081501 的 admin 函数保持一致的鉴权模式：
  -- service_role（auth.uid() 为 NULL）放行供 Edge Function 调用，登录用户需为管理员
  if auth.uid() is not null and not public.current_user_is_admin() then
    raise exception '仅管理员可撤销积分发放';
  end if;

  if p_batch_id is null then
    raise exception '批次 ID 不能为空';
  end if;

  -- 检查批次是否存在且未被撤销
  select amount, remark
    into v_amount, v_remark
    from public.points_transactions
   where batch_id = p_batch_id
     and reason = 'admin_grant'
   limit 1;

  if not found then
    raise exception '未找到该批次的发放记录，或已撤销';
  end if;

  -- 检查是否已撤销
  if exists (
    select 1 from public.points_transactions
     where batch_id = p_batch_id
       and reason = 'admin_revoke'
  ) then
    raise exception '该批次已撤销，不可重复撤销';
  end if;

  -- H3 修复：使用 CTE 获取旧余额，计算实际扣减量写入流水
  -- old_balances: 先锁定行（FOR UPDATE）再取余额快照，确保快照与 UPDATE 读到的是同一版本，
  --   避免 READ COMMITTED 下并发消费导致流水金额 = -(old - new) 计算错误（可能为正数）
  -- updated: 基于锁定快照执行扣减并返回新旧余额
  -- insert: 用实际扣减量（old - new）而非原始发放量写入流水
  with old_balances as (
    select p.id as user_id, p.points as old_points
      from public.profiles p
     where p.id in (
       select t.user_id
         from public.points_transactions t
        where t.batch_id = p_batch_id
          and t.reason = 'admin_grant'
     )
       for update
  ),
  updated as (
    update public.profiles p
       set points = greatest(0, ob.old_points - v_amount)
      from old_balances ob
     where p.id = ob.user_id
    returning p.id as user_id, p.points as new_points, ob.old_points
  )
  insert into public.points_transactions (user_id, amount, balance_after, reason, remark, operator_id, batch_id)
  select u.user_id,
         -(u.old_points - u.new_points),  -- 实际扣减量取反（正数=扣减，负数=补回）
         u.new_points,
         'admin_revoke',
         '撤销发放: ' || coalesce(v_remark, ''),
         v_operator,
         p_batch_id
    from updated u;

  get diagnostics v_revoked = row_count;

  v_result := jsonb_build_object(
    'ok', true,
    'revoked', v_revoked,
    'batch_id', p_batch_id,
    'amount', v_amount
  );
  return v_result;
end;
$$;

revoke all on function public.admin_revoke_grant(uuid) from public;
grant execute on function public.admin_revoke_grant(uuid) to authenticated;
grant execute on function public.admin_revoke_grant(uuid) to service_role;

-- ============================================
-- M2: enforce_account_age_check 默认值改为 true
-- 新建抽奖默认启用账号年龄校验，防止批量注册新号刷奖
-- ============================================

alter table public.lotteries
  alter column enforce_account_age_check set default true;

-- ============================================
-- M8: 从 get_home_lottery / get_community_lotteries 移除开奖副作用
-- 读函数不应触发写操作（execute_lottery_draw）。
-- 自动开奖已由 pg_cron 定时任务 execute_due_lottery_draws 覆盖（2026081407），
-- join 函数中仍有 draw_at <= now() 的即时开奖保护。
-- ============================================

create or replace function public.get_home_lottery()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lottery public.lotteries%rowtype;
  v_entry_count integer := 0;
  v_current_user_entry_id uuid := null;
  v_current_user_entry_created_at timestamp with time zone := null;
  v_current_user_entry_number integer := null;
  v_winners jsonb := '[]'::jsonb;
begin
  select *
    into v_lottery
    from public.lotteries
   where is_home_visible = true
     and status in ('open', 'drawn')
   order by
     case when status = 'open' then 0 else 1 end,
     created_at desc
   limit 1;

  if not found then
    return null;
  end if;

  -- M8 修复：移除读函数中的自动开奖触发，由 pg_cron 定时任务处理

  select count(*)
    into v_entry_count
    from public.lottery_entries
   where lottery_id = v_lottery.id;

  if v_lottery.status = 'drawn' then
    select coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'position', l.winner_position,
                 'entry_id', l.entry_id,
                 'user_id', l.user_id,
                 'username', l.username_snapshot
               )
               order by l.winner_position
             ) filter (where l.user_id is not null),
             '[]'::jsonb
           )
      into v_winners
      from public.lottery_draw_logs l
     where l.lottery_id = v_lottery.id
       and l.draw_no = (
         select max(draw_no)
           from public.lottery_draw_logs
          where lottery_id = v_lottery.id
       );
  end if;

  if auth.uid() is not null then
    select id, created_at
      into v_current_user_entry_id, v_current_user_entry_created_at
      from public.lottery_entries
     where lottery_id = v_lottery.id
       and user_id = auth.uid()
     limit 1;

    if v_current_user_entry_id is not null then
      select count(*)::integer
        into v_current_user_entry_number
        from public.lottery_entries
       where lottery_id = v_lottery.id
         and created_at <= v_current_user_entry_created_at;
    end if;
  end if;

  return jsonb_build_object(
    'id', v_lottery.id,
    'title', v_lottery.title,
    'description', v_lottery.description,
    'prize_title', v_lottery.prize_title,
    'prize_description', v_lottery.prize_description,
    'cover_image_url', v_lottery.cover_image_url,
    'status', v_lottery.status,
    'fulfillment_status', v_lottery.fulfillment_status,
    'max_entries', v_lottery.max_entries,
    'winner_count', v_lottery.winner_count,
    'entry_count', v_entry_count,
    'entry_deadline_at', v_lottery.entry_deadline_at,
    'draw_at', v_lottery.draw_at,
    'drawn_at', v_lottery.drawn_at,
    'winner_user_id', v_lottery.winner_user_id,
    'winner_username', v_lottery.winner_username,
    'winners', v_winners,
    'current_user_entry_id', v_current_user_entry_id,
    'current_user_entry_created_at', v_current_user_entry_created_at,
    'current_user_entry_number', v_current_user_entry_number,
    'enforce_account_age_check', coalesce(v_lottery.enforce_account_age_check, false),
    'created_at', v_lottery.created_at,
    'updated_at', v_lottery.updated_at
  );
end;
$$;

create or replace function public.get_community_lotteries()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lottery public.lotteries%rowtype;
  v_entry_count integer := 0;
  v_current_user_entry_id uuid := null;
  v_current_user_entry_created_at timestamp with time zone := null;
  v_current_user_entry_number integer := null;
  v_winners jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
begin
  for v_lottery in
    select *
      from public.lotteries
     where is_community_visible = true
       and status in ('open', 'drawn', 'closed')
     order by
       case when status = 'open' then 0 else 1 end,
       coalesce(draw_at, drawn_at, created_at) desc,
       created_at desc
  loop
    -- M8 修复：移除读函数中的自动开奖触发，由 pg_cron 定时任务处理

    select count(*)
      into v_entry_count
      from public.lottery_entries
     where lottery_id = v_lottery.id;

    v_current_user_entry_id := null;
    v_current_user_entry_created_at := null;
    v_current_user_entry_number := null;
    v_winners := '[]'::jsonb;

    if v_lottery.status = 'drawn' then
      select coalesce(
               jsonb_agg(
                 jsonb_build_object(
                   'position', l.winner_position,
                   'entry_id', l.entry_id,
                   'user_id', l.user_id,
                   'username', l.username_snapshot
                 )
                 order by l.winner_position
               ) filter (where l.user_id is not null),
               '[]'::jsonb
             )
        into v_winners
        from public.lottery_draw_logs l
       where l.lottery_id = v_lottery.id
         and l.draw_no = (
           select max(draw_no)
             from public.lottery_draw_logs
            where lottery_id = v_lottery.id
         );
    end if;

    if auth.uid() is not null then
      select id, created_at
        into v_current_user_entry_id, v_current_user_entry_created_at
        from public.lottery_entries
       where lottery_id = v_lottery.id
         and user_id = auth.uid()
       limit 1;

      if v_current_user_entry_id is not null then
        select count(*)::integer
          into v_current_user_entry_number
          from public.lottery_entries
         where lottery_id = v_lottery.id
           and created_at <= v_current_user_entry_created_at;
      end if;
    end if;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_lottery.id,
      'title', v_lottery.title,
      'description', v_lottery.description,
      'prize_title', v_lottery.prize_title,
      'prize_description', v_lottery.prize_description,
      'cover_image_url', v_lottery.cover_image_url,
      'status', v_lottery.status,
      'fulfillment_status', v_lottery.fulfillment_status,
      'max_entries', v_lottery.max_entries,
      'winner_count', v_lottery.winner_count,
      'entry_count', v_entry_count,
      'entry_deadline_at', v_lottery.entry_deadline_at,
      'draw_at', v_lottery.draw_at,
      'drawn_at', v_lottery.drawn_at,
      'winner_user_id', v_lottery.winner_user_id,
      'winner_username', v_lottery.winner_username,
      'winners', v_winners,
      'current_user_entry_id', v_current_user_entry_id,
      'current_user_entry_created_at', v_current_user_entry_created_at,
      'current_user_entry_number', v_current_user_entry_number,
      'enforce_account_age_check', coalesce(v_lottery.enforce_account_age_check, false),
      'created_at', v_lottery.created_at,
      'updated_at', v_lottery.updated_at
    ));
  end loop;

  return v_items;
end;
$$;

-- ============================================
-- M10: 添加 profiles(points) 索引并优化排行榜查询
-- coalesce(p.points, 0) 阻止索引使用导致全表扫描，
-- 改为 p.points > v_points（NULL 值不参与排名，语义正确）
-- ============================================

create index if not exists idx_profiles_points_desc
  on public.profiles (points desc);

create or replace function public.get_my_user_space_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text := '';
  v_points integer := 0;
  v_posts integer := 0;
  v_followers integer := 0;
  v_following integer := 0;
  v_rank integer := 0;
  v_cloud_images integer := 0;
  v_cloud_limit integer := 150;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select coalesce(p.username, ''), coalesce(p.points, 0)
    into v_username, v_points
    from public.profiles p
   where p.id = v_user_id;

  select count(*)::integer
    into v_posts
    from public.posts p
   where p.author_id = v_user_id
      or (v_username <> '' and p.author_username = v_username);

  select count(*)::integer
    into v_followers
    from public.user_follows f
   where f.following_id = v_user_id;

  select count(*)::integer
    into v_following
    from public.user_follows f
   where f.follower_id = v_user_id;

  -- M10 修复：移除 coalesce 以利用 idx_profiles_points_desc 索引
  -- NULL points 的用户不参与排名（语义正确：无积分不排名）
  select count(*)::integer + 1
    into v_rank
    from public.profiles p
   where p.points > v_points;

  select coalesce(sum(
    (select count(*)
       from jsonb_array_elements(coalesce(e.content_blocks, '[]'::jsonb)) block
      where block ->> 'type' = 'image')
  ), 0)::integer
    into v_cloud_images
    from public.boh_cloud_entries e
   where e.user_id = v_user_id;

  v_cloud_limit := public.boh_cloud_image_limit_for_user(v_user_id);

  return jsonb_build_object(
    'posts', v_posts,
    'points', v_points,
    'rank', v_rank,
    'followers', v_followers,
    'following', v_following,
    'cloud_image_used', v_cloud_images,
    'cloud_image_limit', v_cloud_limit
  );
end;
$$;

revoke all on function public.get_my_user_space_summary() from public;
grant execute on function public.get_my_user_space_summary() to authenticated;
grant execute on function public.get_my_user_space_summary() to service_role;

notify pgrst, 'reload schema';

commit;
