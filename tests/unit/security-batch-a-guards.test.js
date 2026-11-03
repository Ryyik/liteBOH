/**
 * A 组安全修复（2026-11-03）—— 数据库侧的「守卫测试」
 *
 * 这批改动全在 SQL 里，没有可在 jsdom 里跑的行为，所以测试盯的是
 * 「迁移真源里必须出现 / 绝不能出现」的形态。三条最容易回退的地方：
 *
 *   1. refund_lab_usage 被改回 SECURITY INVOKER（→ 又永远删不到行）；
 *   2. 它的 WHERE 退回 `p_user_id is null or user_id = p_user_id`
 *      （→ 任意人凭 device_id 删别人的记录）；
 *   3. 节流被挪到参数校验之后，或者干脆只剩注释没有调用。
 *
 * ⚠️ 断言用「调用形态」的正则而不是裸 toContain：
 *    迁移里大段注释会解释这些函数，裸 toContain 会被注释骗过。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

/* 迁移的注释里会原样引用「旧的错误写法」当反例，裸断言会被注释骗过
 * （2026-10-30 踩过同款：toContain 命中注释导致假红/假绿）。
 * 「不能出现」类断言一律先剥注释。
 */
const stripSqlComments = (sql) => sql.replace(/--[^\n]*/g, '');

const refundMigration = read('supabase/migrations/2026110310_refund_lab_usage_definer.sql');
const refundSql = stripSqlComments(refundMigration);
const impressionMigration = read('supabase/migrations/2026110311_user_impressions_approved_only.sql');
const rateLimitMigration = read('supabase/migrations/2026110312_shop_order_rate_limit.sql');
const profileApi = read('src/utils/api/profile-api.js');
const ordersApi = read('src/utils/api/shop-orders-api.js');

describe('refund_lab_usage：从「永远删不到行」到「能退且不越权」', () => {
  it('改成 SECURITY DEFINER 并固定 search_path（否则 RLS 继续拦死 DELETE）', () => {
    expect(refundSql).toMatch(/security definer/);
    expect(refundSql).toMatch(/set search_path = public/);
    expect(refundSql).not.toMatch(/security invoker/);
  });

  it('登录用户只能退自己的（uid 不匹配直接 false）', () => {
    expect(refundMigration).toMatch(/v_uid is null or v_uid <> p_user_id/);
  });

  it('匿名通道收窄到 user_id is null 的记录，且登录用户不许借用', () => {
    expect(refundMigration).toMatch(/user_id is null and device_id = v_device_id/);
    expect(refundMigration).toMatch(/p_user_id is null and v_uid is not null/);
  });

  it('旧的越权谓词不能回来', () => {
    // 旧写法：p_user_id 为空时匹配任意 user_id 的记录
    expect(refundSql).not.toMatch(/\(p_user_id is null or user_id = p_user_id\)/);
  });

  it('授权面保持：匿名设备仍可退（lab 允许未登录试用）', () => {
    expect(refundMigration).toMatch(
      /grant execute on function public\.refund_lab_usage\(uuid, text, text\) to anon, authenticated, service_role/,
    );
  });
});

describe('user_impressions：审核未通过的内容不对外可读', () => {
  it('公开读策略带 moderation_status 过滤', () => {
    expect(impressionMigration).toMatch(/using \(moderation_status = 'approved'\)/);
  });

  it('不能退回 qual = true', () => {
    expect(impressionMigration).not.toMatch(/using \(true\)/);
    expect(impressionMigration).not.toMatch(/using \(moderation_status is not null\)/);
  });

  it('作者/被评价人仍能看自己的记录（self 策略不动）', () => {
    // 迁移只 drop 那一条公开策略，不能顺手动到 select_own
    expect(impressionMigration).toMatch(/drop policy if exists "Impressions are viewable by everyone"/);
    expect(impressionMigration).not.toMatch(/drop policy if exists "user_impressions_select_own"/);
  });
});

describe('下单 / 取消：节流与存量上限', () => {
  it('create_shop_order 调 check_rate_limit（5 单/小时，按 user_id 计）', () => {
    expect(rateLimitMigration).toMatch(
      /from public\.check_rate_limit\('shop_order:' \|\| v_user_id::text, 5, 3600\)/,
    );
  });

  it('cancel_shop_order 也节流（20 次/小时）', () => {
    expect(rateLimitMigration).toMatch(
      /from public\.check_rate_limit\('shop_cancel:' \|\| v_user_id::text, 20, 3600\)/,
    );
  });

  it('未完成订单上限 10，按 status = preparing 计', () => {
    expect(rateLimitMigration).toMatch(/and status = 'preparing'/);
    expect(rateLimitMigration).toMatch(/if v_open_orders >= 10 then/);
  });

  it('节流检查排在 auth 判空之后（避免用 null 做键）', () => {
    const createFn = rateLimitMigration.slice(
      rateLimitMigration.indexOf('create or replace function public.create_shop_order'),
      rateLimitMigration.indexOf('create or replace function public.cancel_shop_order'),
    );
    const authIndex = createFn.indexOf("if v_user_id is null then");
    const rateIndex = createFn.indexOf('check_rate_limit');
    expect(authIndex).toBeGreaterThan(-1);
    expect(rateIndex).toBeGreaterThan(authIndex);
  });

  it('两个新拒绝码在前端都有中文文案（否则用户看到 RATE_LIMITED）', () => {
    expect(profileApi).toContain('RATE_LIMITED:');
    expect(profileApi).toContain('TOO_MANY_OPEN_ORDERS:');
    expect(ordersApi).toContain('RATE_LIMITED:');
  });
});
