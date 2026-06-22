import { describe, expect, it, vi, beforeEach } from 'vitest';

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

// Mock VITE_SUPABASE_URL
vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');

import { sendGiftEmail, sendMerchandiseSettlementEmail } from '@/utils/email-service.js';

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
    it('formats product list correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      await sendMerchandiseSettlementEmail({
        items: [
          { title: 'Item A', selectedSpecLabel: 'S', quantity: 2 },
          { title: 'Item B', selectedSpecLabel: 'M', quantity: 1 },
        ],
        totalPrice: '300',
        buyerName: 'User',
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.templateType).toBe('merchandise_settlement');
      expect(body.templateParams.specifications).toContain('Item A');
      expect(body.templateParams.specifications).toContain('x2');
      expect(body.templateParams.specifications).toContain('Item B');
    });

    it('handles empty items array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      await sendMerchandiseSettlementEmail({
        items: [],
        totalPrice: '0',
        buyerName: 'User',
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.templateParams.specifications).toBe('无商品');
    });

    it('formats contact info correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      await sendMerchandiseSettlementEmail({
        items: [],
        totalPrice: '0',
        buyerName: 'User',
        contactType: 'qq',
        contactValue: '12345678',
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.templateParams.giftMessage).toContain('QQ: 12345678');
    });

    it('shows "未提供" when no contact info', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      await sendMerchandiseSettlementEmail({
        items: [],
        totalPrice: '0',
        buyerName: 'User',
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.templateParams.giftMessage).toContain('未提供');
    });
  });
});
