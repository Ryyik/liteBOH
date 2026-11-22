/**
 * 数据管理「履约台」的后台读写（2026-11-21）
 *
 * 赠礼（user_gifts）原先没有管理员列表接口，也没有就地推进状态的动作。
 * 这两件事都走 RLS 的管理员分支，前端不能自己算地址，也不能越权改状态。
 *
 * 这里锁三件事：
 *   ① 读赠礼时地址按 gift.address_id 优先、缺省回落该用户默认地址；
 *   ② 没有地址也照样出记录（不能因为 join 不到就把人从队列里抹掉）；
 *   ③ 推进状态只允许 shipped / completed，且只写 gift_status + updated_at。
 */
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  giftsResult: { data: [], error: null },
  addressesResult: { data: [], error: null },
  updateResult: { data: { id: 'gift-1', gift_status: 'shipped' }, error: null },
  rpcResult: { data: null, error: null },
  rpcCalls: [],
  updates: [],
  addressFilters: [],
}));

vi.mock('@/utils/supabase-client.js', () => ({
  supabase: {
    rpc: async (name, params) => {
      h.rpcCalls.push([name, params]);
      return h.rpcResult;
    },
    from(table) {
      if (table === 'user_gifts') {
        return {
          select: () => ({
            order: () => ({
              limit: async () => h.giftsResult,
            }),
          }),
          update: (payload) => {
            h.updates.push(payload);
            return {
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => h.updateResult,
                }),
              }),
            };
          },
        };
      }
      if (table === 'user_addresses') {
        return {
          select: () => ({
            in: async (column, values) => {
              h.addressFilters.push([column, values]);
              return h.addressesResult;
            },
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  },
}));

const { adminCancelShopOrder, advanceUserGiftStatus, fetchAllUserGifts, fetchShopOrderMailStatus } =
  await import('../../src/utils/api/shop-orders-api.js');

const reset = () => {
  h.giftsResult = { data: [], error: null };
  h.addressesResult = { data: [], error: null };
  h.updateResult = { data: { id: 'gift-1', gift_status: 'shipped' }, error: null };
  h.rpcResult = { data: null, error: null };
  h.rpcCalls.length = 0;
  h.updates.length = 0;
  h.addressFilters.length = 0;
};

describe('fetchAllUserGifts', () => {
  it('优先使用 gift.address_id；地址查询按 user_id 批量圈定', async () => {
    reset();
    h.giftsResult = {
      data: [
        {
          id: 'gift-1',
          user_id: 'user-a',
          gift_no: 'SF001',
          gift_content: '纪念徽章',
          gift_status: 'preparing',
          address_id: 'addr-2',
          is_active: true,
          created_at: '2026-11-20T00:00:00Z',
          profile: { username: 'alice' },
        },
      ],
      error: null,
    };
    h.addressesResult = {
      data: [
        {
          id: 'addr-1',
          user_id: 'user-a',
          recipient: '默认收件人',
          phone: '111',
          region: '上海市',
          detail: '默认地址',
          is_default: true,
        },
        {
          id: 'addr-2',
          user_id: 'user-a',
          recipient: '指定收件人',
          phone: '222',
          region: '广东省',
          detail: '深圳市',
          is_default: false,
        },
      ],
      error: null,
    };

    const result = await fetchAllUserGifts();
    expect(result.error).toBeNull();
    expect(h.addressFilters).toEqual([['user_id', ['user-a']]]);
    expect(result.data[0]).toMatchObject({
      kind: 'gift',
      username: 'alice',
      shipping: {
        recipient: '指定收件人',
        phone: '222',
        address: '广东省 深圳市',
      },
      statusLabel: '准备中',
    });
  });

  it('没有 address_id 时回落该用户默认地址；完全没有地址也保留记录', async () => {
    reset();
    h.giftsResult = {
      data: [
        {
          id: 'gift-1',
          user_id: 'user-a',
          gift_content: '纪念徽章',
          gift_status: 'shipped',
          profile: { username: 'alice' },
        },
        {
          id: 'gift-2',
          user_id: 'user-b',
          gift_content: '无地址礼物',
          gift_status: 'preparing',
          profile: null,
        },
      ],
      error: null,
    };
    h.addressesResult = {
      data: [
        {
          id: 'addr-1',
          user_id: 'user-a',
          recipient: '默认收件人',
          phone: '111',
          region: '上海市',
          detail: '默认地址',
          is_default: true,
        },
      ],
      error: null,
    };

    const result = await fetchAllUserGifts();
    expect(result.data).toHaveLength(2);
    expect(result.data[0].shipping.recipient).toBe('默认收件人');
    expect(result.data[1].username).toBe('未知用户');
    expect(result.data[1].shipping.address).toBe('');
  });
});

describe('advanceUserGiftStatus', () => {
  it('shipped 只写 gift_status 与 updated_at', async () => {
    reset();
    const result = await advanceUserGiftStatus('gift-1', 'shipped');
    expect(result).toEqual({ ok: true, status: 'shipped' });
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0].gift_status).toBe('shipped');
    expect(Number.isNaN(Date.parse(h.updates[0].updated_at))).toBe(false);
  });

  it('completed 允许，取消 / 准备中 / 越级都不允许且不写库', async () => {
    reset();
    h.updateResult = { data: { id: 'gift-1', gift_status: 'completed' }, error: null };
    expect(await advanceUserGiftStatus('gift-1', 'completed')).toEqual({
      ok: true,
      status: 'completed',
    });

    for (const target of ['cancelled', 'preparing', 'refunded', '']) {
      expect((await advanceUserGiftStatus('gift-1', target)).ok).toBe(false);
    }
    expect(h.updates).toHaveLength(1);
  });

  it('RLS 过滤导致 0 行时给出权限提示', async () => {
    reset();
    h.updateResult = { data: null, error: null };
    expect(await advanceUserGiftStatus('gift-1', 'shipped')).toEqual({
      ok: false,
      message: '没有权限或礼物不存在',
    });
  });
});

describe('adminCancelShopOrder（后台取消，2026-11-21）', () => {
  it('走 RPC 而不是直接改表：服务端负责鉴权、退积分与审计', async () => {
    reset();
    h.rpcResult = {
      data: {
        ok: true,
        message: 'ORDER_CANCELLED',
        previous_status: 'preparing',
        refunded_points: 1200,
        current_points: 3400,
        mail_queued: true,
      },
      error: null,
    };

    const result = await adminCancelShopOrder('order-1', 'admin_cancel_from_workbench');

    expect(h.rpcCalls).toEqual([
      [
        'admin_cancel_shop_order',
        { p_order_id: 'order-1', p_reason: 'admin_cancel_from_workbench' },
      ],
    ]);
    expect(result).toEqual({
      ok: true,
      status: 'cancelled',
      alreadyCancelled: false,
      previousStatus: 'preparing',
      refundedPoints: 1200,
      currentPoints: 3400,
      mailQueued: true,
    });
  });

  it('服务端拒绝时把业务码翻成中文，不把原始码丢给操作者', async () => {
    reset();
    h.rpcResult = { data: { ok: false, message: 'ORDER_COMPLETED' }, error: null };
    expect(await adminCancelShopOrder('order-1')).toEqual({
      ok: false,
      message: '已完成的订单是终态，不能取消',
    });

    h.rpcResult = { data: { ok: false, message: 'NOT_ADMIN' }, error: null };
    expect((await adminCancelShopOrder('order-1')).message).toBe('仅管理员可取消订单');
  });

  it('幂等：already cancelled 仍算成功，但不自动退积分', async () => {
    reset();
    h.rpcResult = {
      data: { ok: true, message: 'ALREADY_CANCELLED', refunded_points: 0, mail_queued: false },
      error: null,
    };
    const result = await adminCancelShopOrder('order-1');
    expect(result.ok).toBe(true);
    expect(result.alreadyCancelled).toBe(true);
    expect(result.refundedPoints).toBe(0);
    expect(result.mailQueued).toBe(false);
  });

  it('空订单号不发请求；RPC 报错时给出可读文案', async () => {
    reset();
    expect((await adminCancelShopOrder('')).ok).toBe(false);
    expect(h.rpcCalls).toHaveLength(0);

    h.rpcResult = { data: null, error: { message: 'permission denied for function' } };
    const result = await adminCancelShopOrder('order-1');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('取消订单');
  });
});

describe('fetchShopOrderMailStatus（进度邮件真实投递结果，2026-11-21）', () => {
  it('sent：Brevo 已发出，把「已发出」而不是「已排队」告诉后台', async () => {
    reset();
    h.rpcResult = {
      data: {
        ok: true,
        has_record: true,
        status: 'sent',
        attempts: 1,
        last_error: null,
        sent_at: '2026-11-21T10:00:00Z',
      },
      error: null,
    };

    const result = await fetchShopOrderMailStatus('order-1');

    expect(h.rpcCalls).toEqual([['admin_shop_order_mail_status', { p_order_id: 'order-1' }]]);
    expect(result).toMatchObject({
      ok: true,
      hasRecord: true,
      status: 'sent',
      statusText: '邮件已由 Brevo 发出',
    });
  });

  it('skipped：明确说「未发送」并带出原因，不说成发送成功', async () => {
    reset();
    h.rpcResult = {
      data: {
        ok: true,
        has_record: true,
        status: 'skipped',
        attempts: 1,
        last_error: '无可用邮箱',
      },
      error: null,
    };
    const result = await fetchShopOrderMailStatus('order-1');
    expect(result.statusText).toBe('邮件未发送');
    expect(result.lastError).toBe('无可用邮箱');
  });

  it('pending：如实说是「已入队」，不承诺已投递', async () => {
    reset();
    h.rpcResult = {
      data: { ok: true, has_record: true, status: 'pending', attempts: 0 },
      error: null,
    };
    const result = await fetchShopOrderMailStatus('order-1');
    expect(result.statusText).toBe('邮件已入队，等待投递');
  });

  it('没有邮件记录 / 非管理员 / RPC 报错都降级，且不抛异常连累队列', async () => {
    reset();
    h.rpcResult = { data: { ok: true, has_record: false }, error: null };
    expect((await fetchShopOrderMailStatus('order-1')).statusText).toBe('这单还没有进度邮件');

    h.rpcResult = { data: { ok: false, message: 'NOT_ADMIN' }, error: null };
    const denied = await fetchShopOrderMailStatus('order-1');
    expect(denied.ok).toBe(false);
    expect(denied.hasRecord).toBe(false);

    h.rpcResult = { data: null, error: { message: 'function does not exist' } };
    const broken = await fetchShopOrderMailStatus('order-1');
    expect(broken.ok).toBe(false);
    expect(broken.message).toBe('邮件状态暂时查不到');

    expect((await fetchShopOrderMailStatus('')).ok).toBe(false);
  });
});
