import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock supabase auth session
vi.mock('@/utils/supabase-client.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
        error: null,
      }),
    },
  },
}));

// email-service.js 在模块求值期（顶层）固化 import.meta.env.VITE_SUPABASE_URL，
// 静态 import 会被 ESM 提升到 vi.stubEnv 之前执行导致 stub 失效，
// 因此必须先 stubEnv 再动态导入，保证不依赖仓库根目录 .env 的真实值。
let sendGiftEmail;
let sendMerchandiseSettlementEmail;

beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
  const mod = await import('@/utils/email-service.js');
  sendGiftEmail = mod.sendGiftEmail;
  sendMerchandiseSettlementEmail = mod.sendMerchandiseSettlementEmail;
});

describe('email-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendGiftEmail', () => {
    it('fills default values for missing fields', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      await sendGiftEmail({});

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.templateType).toBe('gift');
      expect(body.templateParams.product).toBe('未指定');
      expect(body.templateParams.specifications).toBe('N/A');
      expect(body.templateParams.giftOptions).toBe('无');
      expect(body.templateParams.paymentMethod).toBe('无');
      expect(body.templateParams.buyerName).toBe('匿名用户');
      expect(body.templateParams.buyerRole).toBe('普通用户');
      expect(body.templateParams.isLoggedIn).toBe('否');
    });

    it('uses provided values', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      await sendGiftEmail({
        product: 'Test Product',
        specifications: 'Large',
        giftOptions: '许愿礼物',
        paymentMethod: '积分',
        paymentAmount: '100',
        deliveryMethod: '自取',
        totalPrice: '100',
        giftMessage: '测试消息',
        buyerName: 'TestUser',
        buyerRole: 'VIP',
        isLoggedIn: true,
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.templateParams.product).toBe('Test Product');
      expect(body.templateParams.specifications).toBe('Large');
      expect(body.templateParams.giftOptions).toBe('许愿礼物');
      expect(body.templateParams.paymentMethod).toBe('积分');
      expect(body.templateParams.buyerName).toBe('TestUser');
      expect(body.templateParams.buyerRole).toBe('VIP');
      expect(body.templateParams.isLoggedIn).toBe('是');
    });

    it('includes orderTime in template params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      await sendGiftEmail({ product: 'Test' });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.templateParams.orderTime).toBeTruthy();
    });

    it('throws on email send failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 502,
        json: () => Promise.resolve({ message: '邮件发送失败。' }),
      });

      await expect(sendGiftEmail({ product: 'Test' })).rejects.toThrow('邮件发送失败');
    });
  });

  describe('sendMerchandiseSettlementEmail', () => {
    it('sends only the persisted order ID for server-side order lookup', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      await sendMerchandiseSettlementEmail({
        orderId: 'ca052c3d-77c6-461b-a1e0-eae4b1b8f169',
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.templateType).toBe('merchandise_settlement');
      expect(body.templateParams).toEqual({ orderId: 'ca052c3d-77c6-461b-a1e0-eae4b1b8f169' });
    });

    it('requires a persisted order ID', async () => {
      await expect(sendMerchandiseSettlementEmail({})).rejects.toThrow('订单 ID 缺失');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
