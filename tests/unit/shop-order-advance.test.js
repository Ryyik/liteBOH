/**
 * 管理员推进订单进度（2026-11-10）
 *
 * 背景：商城页里原本**没有任何推进入口**，只能去「数据管理 → 商城订单」改一行
 * status。现金单尤其别扭 —— 钱是线下收的，收完就该能当场落库。
 *
 * 这类改动最怕两件事，用例就盯这两件：
 *   1. 白名单被放宽（把 cancelled / preparing 也塞进来 ⇒ 绕过取消 RPC 的退积分事务，
 *      或者把订单"推"回准备中）；
 *   2. 客户端顺手自己发一封进度邮件 —— 触发器已经发了，再发就是重复。
 *
 * 顺带钉住 updated_at：这张表**没有** updated_at 自动更新触发器（线上 pg_trigger
 * 里只有进度通知那一个），不显式写就会让「最近更新」永远停在下单时间。
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const h = vi.hoisted(() => ({
  calls: [],
  result: { data: { id: 'order-1', status: 'shipped' }, error: null },
}));

vi.mock('@/utils/supabase-client.js', () => ({
  supabase: {
    from: () => {
      const query = {
        update: (payload) => {
          h.calls.push(payload);
          return query;
        },
        eq: () => query,
        select: () => query,
        maybeSingle: async () => h.result,
      };
      return query;
    },
  },
}));

const { advanceShopOrderStatus } = await import('../../src/utils/api/shop-orders-api.js');

const reset = () => {
  h.calls.length = 0;
  h.result = { data: { id: 'order-1', status: 'shipped' }, error: null };
};

describe('advanceShopOrderStatus', () => {
  it('preparing → shipped：只写 status 与 updated_at', async () => {
    reset();
    h.result = { data: { id: 'order-1', status: 'shipped' }, error: null };
    const result = await advanceShopOrderStatus('order-1', 'shipped');

    expect(result.ok).toBe(true);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].status).toBe('shipped');
    // updated_at 必须是本次写入的 ISO 时间，不能漏（表没有自动更新触发器）
    expect(Number.isNaN(Date.parse(h.calls[0].updated_at))).toBe(false);
  });

  it('shipped → completed 同样允许', async () => {
    reset();
    h.result = { data: { id: 'order-1', status: 'completed' }, error: null };
    const result = await advanceShopOrderStatus('order-1', 'completed');
    expect(result.ok).toBe(true);
    expect(h.calls[0].status).toBe('completed');
  });

  it('cancelled / preparing 不在白名单里，且一个字节都不写库', async () => {
    reset();
    for (const status of ['cancelled', 'preparing', 'pending', '']) {
      const result = await advanceShopOrderStatus('order-1', status);
      expect(result.ok).toBe(false);
    }
    expect(h.calls).toHaveLength(0);
  });

  it('缺订单 id 时直接拒绝', async () => {
    reset();
    const result = await advanceShopOrderStatus('', 'shipped');
    expect(result.ok).toBe(false);
    expect(h.calls).toHaveLength(0);
  });

  it('影响 0 行（RLS 过滤掉非管理员）翻译成「没有权限」', async () => {
    reset();
    h.result = { data: null, error: null };
    const result = await advanceShopOrderStatus('order-1', 'shipped');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('没有权限');
  });

  it('数据库报错时给出可读文案，不把原始错误抛给界面', async () => {
    reset();
    h.result = { data: null, error: { message: 'new row violates row-level security policy' } };
    const result = await advanceShopOrderStatus('order-1', 'shipped');
    expect(result.ok).toBe(false);
    expect(result.message).toBe('推进失败，请稍后再试');
  });
});

describe('边界：客户端不重复发通知', () => {
  const root = resolve(__dirname, '../..');
  const api = readFileSync(resolve(root, 'src/utils/api/shop-orders-api.js'), 'utf8');
  const sheet = readFileSync(resolve(root, 'src/views/Shop/OrderDetailSheet.vue'), 'utf8');
  const adminSheet = readFileSync(resolve(root, 'src/views/Shop/AdminOrderSheet.vue'), 'utf8');
  const index = readFileSync(resolve(root, 'src/views/Shop/index.vue'), 'utf8');

  it('API 层不引入邮件服务（进度邮件由 mail_outbox 触发器发）', () => {
    expect(api).not.toMatch(/from\s+['"]@\/utils\/email-service/);
    expect(api).not.toMatch(/sendMerchandiseSettlementEmail|sendShopOrderCancelledEmail/);
  });

  it('入口只对管理员、且只对购物订单出现', () => {
    // 允许换行/缩进变化，只要求「isAdmin + kind !== 'shop' + 取消态」三个条件都在
    expect(sheet).toMatch(/isAdmin\.value/);
    expect(sheet).toMatch(/props\.order\?\.kind\s*!==\s*['"]shop['"]/);
    expect(sheet).toMatch(/isCancelled\.value/);
  });

  it('订单管理面板复用推进 API，不自己 UPDATE / 自己发信', () => {
    expect(adminSheet).toMatch(/advanceShopOrderStatus/);
    expect(adminSheet).not.toMatch(/\.update\(/);
    expect(adminSheet).not.toMatch(/email-service/);
  });

  it('头像菜单的「订单管理」只对管理员出现', () => {
    expect(index).toMatch(/runAvatarMenu\('manage'\)/);
    // 菜单项 v-if="isAdmin"（与「编辑商品」的 canEnterInlineEdit 区分开），
    // 弹层显隐只由 adminOrdersOpen 控制
    expect(index).toMatch(/v-if="isAdmin"/);
    expect(index).toMatch(/:visible="adminOrdersOpen"/);
  });
});
