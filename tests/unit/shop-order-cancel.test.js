/**
 * 订单 / 礼物取消 + 退积分（2026-11-02）
 *
 * 这类「钱」的链路最怕两件事，测试就盯这两件：
 *   1. 前端能取消的状态，和数据库允许取消的状态**对不上**
 *      （按钮能点但 RPC 拒绝，或者反过来：RPC 允许但界面不给入口）；
 *   2. 退积分没有写流水 —— 用户看到余额涨了、账单里却没有这笔，
 *      和 2026090903 修过的「只发不收」是同一类问题。
 *
 * 所以断言分三层：迁移文件（真源）、API 层（错误翻译）、组件层（按钮门槛）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const migration = read('supabase/migrations/2026110201_order_gift_cancel_refund.sql');
const api = read('src/utils/api/shop-orders-api.js');
const panel = read('src/views/Shop/OrderPanel.vue');

describe('迁移：cancel_shop_order', () => {
  it('存在函数定义，且只对 authenticated 开放', () => {
    expect(migration).toContain('create or replace function public.cancel_shop_order');
    expect(migration).toMatch(
      /grant execute on function public\.cancel_shop_order\(uuid\) to authenticated/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.cancel_shop_order\(uuid\) from public/,
    );
  });

  it('退积分必须同时写 points_transactions（reason=shop_refund）', () => {
    expect(migration).toContain('insert into public.points_transactions');
    expect(migration).toContain("'shop_refund'");
    // 余额快照要来自 UPDATE ... RETURNING，不能再 SELECT 一次（并发下会漂）
    expect(migration).toMatch(/returning points into v_next_points/i);
  });

  it('锁行 + 幂等：已取消直接返回，不会二次加积分', () => {
    expect(migration).toMatch(/for update/i);
    expect(migration).toContain('ALREADY_CANCELLED');
  });

  it('未发货（preparing）本人可直接退款，shipped / completed 拒绝', () => {
    expect(migration).toContain("if v_order.status <> 'preparing' then");
    expect(migration).not.toContain('v_is_admin');
  });

  it('状态白名单收敛成四档：preparing / shipped / completed / cancelled', () => {
    for (const status of ['preparing', 'shipped', 'completed', 'cancelled']) {
      expect(migration).toContain(`'${status}'::text`);
    }
    expect(migration).toMatch(/drop constraint if exists shop_points_orders_status_check/);
    expect(migration).toMatch(/drop constraint if exists check_gift_status/);
  });

  it('历史值归并：pending / processing → preparing（先解约束再改数据）', () => {
    const dropIndex = migration.indexOf(
      'drop constraint if exists shop_points_orders_status_check',
    );
    const updateIndex = migration.indexOf("where status in ('pending', 'processing')");
    expect(updateIndex).toBeGreaterThan(dropIndex);
    expect(migration).toContain("where gift_status = 'processing'");
  });
});

describe('API 层：取消能力', () => {
  it('导出 cancelShopOrder / cancelGift，走 RPC 而不是直接改表', () => {
    expect(api).toContain('export async function cancelShopOrder');
    expect(api).toContain('export async function cancelGift');
    expect(api).toContain("supabase.rpc('cancel_shop_order'");
    expect(api).toContain("supabase.rpc('cancel_user_gift'");
  });

  it('RPC 失败文案可直出给用户（不暴露英文 code）', () => {
    for (const code of ['ORDER_NOT_CANCELLABLE', 'GIFT_NOT_CANCELLABLE', 'ORDER_NOT_FOUND']) {
      expect(api).toContain(code);
    }
    expect(api).toContain('订单已发货，无法自助取消');
  });

  it('礼物词表补了 cancelled，列表不会渲染英文状态', () => {
    expect(api).toMatch(/cancelled:\s*'已取消'/);
  });
});

describe('详情弹层：取消能力与数据库一致', () => {
  const detail = read('src/views/Shop/OrderDetailSheet.vue');

  it('购物订单只在 preparing（未发货）给入口', () => {
    expect(detail).toContain("const CANCELABLE_SHOP = new Set(['preparing'])");
  });

  it('礼物同样只在 preparing 给入口（已发货不可取消）', () => {
    expect(detail).toContain("const CANCELABLE_GIFT = new Set(['preparing'])");
  });

  it('时间线只有三档进度 + 取消终止态（不出现 pending / processing）', () => {
    expect(detail).toContain("key: 'preparing'");
    expect(detail).toContain("key: 'shipped'");
    expect(detail).toContain("key: 'completed'");
    expect(detail).not.toContain("key: 'pending'");
    expect(detail).not.toContain("key: 'processing'");
  });

  it('两段式确认：首次点击只进入确认态，不会直接调用取消', () => {
    expect(detail).toContain('armed');
    expect(detail).toContain('确认取消');
  });

  it('取消成功后关闭详情、刷新列表并把退款积分回显给用户', () => {
    expect(detail).toContain("emit('changed')");
    expect(detail).toContain('积分已退回');
  });

  it('列表卡带首图并可点开详情（用户口径：购物订单可以带图片、支持点开详情）', () => {
    expect(panel).toContain('order-thumb');
    expect(panel).toContain('@click="openDetail(order)"');
    expect(panel).toContain('OrderDetailSheet');
  });

  it('竖屏全屏 / 横屏弹窗：靠 orientation 媒体查询切换形态', () => {
    expect(detail).toContain('@media (orientation: landscape)');
    expect(detail).toContain('height: 100%');
  });
});
