-- ============================================
-- 合并版 get_community_lotteries：无副作用 + 集合聚合 + 返回保底字段
-- ============================================
--
-- 背景（2026-11-16，用户报障「新建的抽奖在周边抽奖页不显示」时顺带查出）：
--
--   `2026081402_community_lottery_list_performance.sql` 把这个函数改成了 CTE 聚合版
--   （一次扫表算出 entry_count / 我的报名 / 报名序号 / 中奖名单），
--   **但次日**的 `2026081502_business_logic_fixes.sql`（M8：移除读函数里的开奖副作用）
--   用 `create or replace` 按**旧的循环版**整体重写了一遍 —— 聚合优化被静默覆盖。
--
--   后果不是数据错，是「仓库里留着一份看起来已优化的 migration，但任何环境全量重放
--   得到的都是 N 条抽奖 = 4N 次查询的循环版」。线上当前就是循环版（9 条抽奖 ≈ 36 次
--   库内查询），和 migrations 全量重放结果一致 ⇒ **不是漂移**，是覆盖。
--
--   这类「后一条 migration 把前一条优化整段吃掉」不会报错、不会让任何门禁变红，
--   所以本迁移把三件事写进**同一份函数定义**，谁再 replace 都得一起带上：
--     1. 无写副作用：不调 execute_lottery_draw / record_lottery_auto_draw_failure，
--        到期开奖交给 pg_cron 的 execute_due_lottery_draws（同 2026081502 的结论）。
--     2. 集合聚合取数：entry_stats / current_entries / current_entry_numbers /
--        latest_draws + winner_lists 各一次，不再 per-lottery 循环。
--     3. 返回体补上 pity_* 六个字段：聚合版从来没带过它们，前端一直在
--        `src/utils/api/lottery-api.js` 的 enrich 里多发一次 select 兜底。
--        这里补上之后那次补请求不再触发（前端兜底**保留**：老客户端与回滚仍成立）。
--
-- 返回契约其余字段与旧版逐一对齐；`pity_mode` 用 coalesce 收口成 'none'，
-- 否则前端 `!item.pity_mode` 仍会判定需要 enrich（见 normalizeLottery）。
--
-- ✅ 已 apply（2026-11-16 15:36，Management API 单事务执行）。应用后实测：
--   · `pg_get_functiondef` 里 `for v_lottery in` 已消失，`winner_lists` 与 `pity_mode` 都在
--     ⇒ 聚合版真的生效，不是又被人覆盖回去；
--   · anon 调 `get_community_lotteries`：9 条、29 个字段，每条都带 `pity_mode` 与 `entry_count`，
--     drawn 样本 winners=1 ⇒ 前端 `lottery-api.js` 的 pity enrich 不再触发；
--   · `scripts/regression/rpc-regression-check.sql`：抽奖三函数（get_home_lottery /
--     get_community_lotteries / join_community_lottery）全 PASS。唯一 FAIL 是既有的
--     `create_shop_order_with_points` 缺失，与本次无关；
--   · `check:db-advisors` 三项持平（searchPathMutable 0 / rlsDisabled 0 / rlsNoPolicy 5）；
--   · `check:db-lint` 本机拿不到 lint 结果（降级跳过）—— **这条还没验，有环境时补跑**。
--
-- 以后再改这个函数，仍然要跑：db-lint（能跑时）+ rpc-regression-check + 报名探针。
-- ============================================

begin;

create or replace function public.get_community_lotteries()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items jsonb;
begin
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
    /* distinct on 取「第一次报名」：旧循环版的 `limit 1` 没有 order by，
       同一用户重复报名时返回哪条是不确定的。 */
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
               /* 保底字段：与前端 normalizeLottery 一一对应，别删其中任何一个 ——
                  少一个就会退回「多一次 select 兜底」的老路（且不报错）。 */
               'pity_mode', coalesce(nullif(btrim(l.pity_mode), ''), 'none'),
               'pity_winner_count', l.pity_winner_count,
               'pity_reward_title', coalesce(l.pity_reward_title, ''),
               'pity_reward_description', coalesce(l.pity_reward_description, ''),
               'pity_overflow_reward_title', coalesce(l.pity_overflow_reward_title, ''),
               'pity_overflow_reward_description', coalesce(l.pity_overflow_reward_description, ''),
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

/* 列表过滤先于 entries / draw_logs 的 join，部分索引保住这条路径。
   2026081402 已建过同名索引，这里 `if not exists` 只是让本文件自包含。 */
create index if not exists idx_lotteries_community_visible_status_created
  on public.lotteries (status, created_at desc)
  where is_community_visible = true;

commit;
