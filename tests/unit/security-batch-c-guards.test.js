/**
 * C 组修复（2026-11-03 外部审查 P1）—— 数据库侧守卫
 *
 * 这一批改的全是 SQL，没有 jsdom 里能跑的行为，所以盯「迁移真源里必须出现 /
 * 绝不能出现」的形态。五处最容易回退的地方：
 *
 *   1. `admin_supabase_project_status` 又被写回 `SUM(size)`（storage.objects 没这列，
 *      db-lint 会重新变红，而运行期被 EXCEPTION 吃掉 ⇒ 存储用量静默恒为 0）；
 *   2. `create_shop_order` 又在商品分支里覆盖 `v_order_payment_mode`
 *      （⇒ 混合购物车的支付模式取决于商品顺序）；
 *   3. `total_points` 约束被改回 `> 0`（⇒ 纯 RMB 商品上架即下单失败）；
 *   4. 有人「按报告 F3 的建议」给 refund 补设备过滤 —— 那会让退款匹配不到历史行；
 *   5. 触发器函数的客户端 EXECUTE 授权被重新加回去。
 *
 * ⚠️ 断言一律先剥注释：迁移里会原样引用「旧的错误写法」当反例，裸 toContain
 *    会被注释骗过（2026-10-30 踩过同款）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const stripSqlComments = (sql) => sql.replace(/--[^\n]*/g, '');

const projectStatusSql = read(
  'supabase/migrations/2026110316_fix_admin_project_status_storage_size.sql',
);
const shopSql = read('supabase/migrations/2026110317_shop_order_payment_mode.sql');
const shopSqlNoComments = stripSqlComments(shopSql);
const lotteryViewSql = read('supabase/migrations/2026110318_revoke_anon_lottery_failure_stats.sql');
const triggerSql = read('supabase/migrations/2026110319_revoke_trigger_execute_authenticated.sql');
const refundSql = read('supabase/migrations/2026110320_refund_lab_usage_flow_type_guard.sql');
const refundSqlNoComments = stripSqlComments(refundSql);

describe('admin_supabase_project_status：storage 大小取值口径', () => {
  it('不再直接 SUM(size)（该列在 storage.objects 里不存在）', () => {
    expect(stripSqlComments(projectStatusSql)).not.toMatch(/sum\s*\(\s*size\s*\)/i);
  });

  it('改从 metadata->>size 取，并对缺键/非数字兜底', () => {
    expect(projectStatusSql).toMatch(/o\.metadata ->> 'size'/);
    expect(projectStatusSql).toMatch(/~\s*'\^\[0-9\]\+\$'/);
    expect(projectStatusSql).toMatch(/::BIGINT/);
  });

  it('保持 SECURITY DEFINER + 固定 search_path + 只授 authenticated', () => {
    expect(projectStatusSql).toMatch(/security definer/);
    expect(projectStatusSql).toMatch(/set search_path = public/);
    expect(projectStatusSql).toMatch(
      /grant execute on function public\.admin_supabase_project_status\(\) to authenticated, service_role/,
    );
    expect(projectStatusSql).not.toMatch(/grant execute[^;]*to anon/i);
  });
});

describe('create_shop_order：支付模式必须与商品顺序无关', () => {
  const createFn = shopSqlNoComments.slice(
    shopSqlNoComments.indexOf('create or replace function public.create_shop_order'),
    shopSqlNoComments.indexOf('alter table public.shop_points_orders'),
  );

  it('商品分支里不再写 v_order_payment_mode（只累计金额与标志）', () => {
    // 分支内的赋值会互相覆盖，是本次 bug 的根因；允许的唯一赋值是循环后的 case。
    const assignments = createFn.match(/v_order_payment_mode\s*:=/g) || [];
    expect(assignments).toHaveLength(1);
    expect(createFn).toMatch(/v_order_payment_mode := case/);
  });

  it('定档发生在循环结束之后，且三分支齐全', () => {
    const loopEnd = createFn.indexOf('end loop;');
    const caseAt = createFn.indexOf('v_order_payment_mode := case');
    expect(loopEnd).toBeGreaterThan(-1);
    expect(caseAt).toBeGreaterThan(loopEnd);
    expect(createFn).toMatch(/when v_has_points and v_has_rmb then 'combined'/);
    expect(createFn).toMatch(/when v_has_rmb then 'rmb_only'/);
    expect(createFn).toMatch(/else 'points_only'/);
  });

  it('v_has_rmb 真的被读了（否则 db-lint 报 never read variable）', () => {
    expect(createFn).toMatch(/v_has_rmb then|and v_has_rmb/);
  });

  it('节流与存量上限没有被这一批改掉', () => {
    expect(createFn).toMatch(/check_rate_limit\('shop_order:' \|\| v_user_id::text, 5, 3600\)/);
    expect(createFn).toMatch(/if v_open_orders >= 10 then/);
  });
});

describe('shop_points_orders：约束与纯 RMB 订单兼容', () => {
  it('total_points 放开到 >= 0', () => {
    expect(shopSqlNoComments).toMatch(
      /add constraint shop_points_orders_total_points_check check \(total_points >= 0\)/,
    );
    expect(shopSqlNoComments).not.toMatch(/check \(total_points > 0\)/);
  });

  it('新增「支付模式 ↔ 金额」自洽约束，三种模式都覆盖', () => {
    expect(shopSql).toMatch(/shop_points_orders_payment_mode_amounts_check/);
    expect(shopSql).toMatch(
      /when 'points_only' then total_points > 0 and coalesce\(rmb_total, 0\) = 0/,
    );
    expect(shopSql).toMatch(
      /when 'rmb_only'\s+then total_points = 0 and coalesce\(rmb_total, 0\) > 0/,
    );
    expect(shopSql).toMatch(
      /when 'combined'\s+then total_points > 0 and coalesce\(rmb_total, 0\) > 0/,
    );
  });

  it('旧的 create_shop_order_with_points 被 drop（它插 pending，违反现状 CHECK）', () => {
    expect(shopSqlNoComments).toMatch(
      /drop function if exists public\.create_shop_order_with_points\(jsonb, text, text\)/,
    );
  });
});

describe('残留授权收口', () => {
  it('lottery_failure_stats 的 anon SELECT 被撤（security_invoker 基表重新授权后会复活）', () => {
    expect(lotteryViewSql).toMatch(/revoke all on public\.lottery_failure_stats from anon/);
    expect(lotteryViewSql).toMatch(
      /has_table_privilege\('anon', 'public\.lottery_failure_stats', 'SELECT'\)/,
    );
  });

  it('触发器函数按「authenticated 可执行」遍历收权，并做收尾断言', () => {
    expect(triggerSql).toMatch(/has_function_privilege\('authenticated', p\.oid, 'EXECUTE'\)/);
    expect(triggerSql).toMatch(/revoke execute on function %s from anon, authenticated, public/);
    expect(triggerSql).toMatch(/grant execute on function %s to service_role/);
    expect(triggerSql).toMatch(/raise exception '仍有 % 个触发器函数对客户端角色可执行/);
  });
});

describe('refund_lab_usage：只补 flow_type 守卫，不能再加设备过滤', () => {
  it('p_flow_type 为空直接 false（否则退掉「任意 flow 最近一条」）', () => {
    expect(refundSql).toMatch(/if v_flow_type is null then/);
    expect(refundSql).toMatch(/and flow_type = v_flow_type/);
  });

  it('不能出现 device_id 过滤 —— 登录态 p_device_id 恒为 null，加了会让退款匹配不到历史行', () => {
    expect(refundSqlNoComments).not.toMatch(/v_device_id is null or device_id = v_device_id/);
  });

  it('SECURITY DEFINER / search_path / 授权面保持不变', () => {
    expect(refundSqlNoComments).toMatch(/security definer/);
    expect(refundSqlNoComments).toMatch(/set search_path = public/);
    expect(refundSql).toMatch(
      /grant execute on function public\.refund_lab_usage\(uuid, text, text\) to anon, authenticated, service_role/,
    );
  });
});
