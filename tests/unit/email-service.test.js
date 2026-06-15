import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock emailjs dynamic import
const mockEmailSend = vi.fn();
vi.mock('@emailjs/browser', () => ({
  send: mockEmailSend,
}));

import { sendGiftEmail, sendMerchandiseSettlementEmail } from '@/utils/email-service.js';

describe('email-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendGiftEmail', () => {
    it('fills default values for missing fields', async () => {
      mockEmailSend.mockResolvedValue({ status: 200 });

      await sendGiftEmail({});

      expect(mockEmailSend).toHaveBeenCalledTimes(1);
      const [, , templateParams] = mockEmailSend.mock.calls[0];
      expect(templateParams.product).toBe('未指定');
      expect(templateParams.specifications).toBe('N/A');
      expect(templateParams.giftOptions).toBe('无');
      expect(templateParams.paymentMethod).toBe('无');
      expect(templateParams.buyerName).toBe('匿名用户');
      expect(templateParams.buyerRole).toBe('普通用户');
      expect(templateParams.isLoggedIn).toBe('否');
    });

    it('uses provided values', async () => {
      mockEmailSend.mockResolvedValue({ status: 200 });

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

      const [, , templateParams] = mockEmailSend.mock.calls[0];
      expect(templateParams.product).toBe('Test Product');
      expect(templateParams.specifications).toBe('Large');
      expect(templateParams.giftOptions).toBe('许愿礼物');
      expect(templateParams.paymentMethod).toBe('积分');
      expect(templateParams.buyerName).toBe('TestUser');
      expect(templateParams.buyerRole).toBe('VIP');
      expect(templateParams.isLoggedIn).toBe('是');
    });

    it('includes orderTime in template params', async () => {
      mockEmailSend.mockResolvedValue({ status: 200 });

      await sendGiftEmail({ product: 'Test' });

      const [, , templateParams] = mockEmailSend.mock.calls[0];
      expect(templateParams.orderTime).toBeTruthy();
    });

    it('throws on email send failure', async () => {
      mockEmailSend.mockRejectedValue(new Error('Send failed'));

      await expect(sendGiftEmail({ product: 'Test' })).rejects.toThrow('Send failed');
    });
  });

  describe('sendMerchandiseSettlementEmail', () => {
    it('formats product list correctly', async () => {
      mockEmailSend.mockResolvedValue({ status: 200 });

      await sendMerchandiseSettlementEmail({
        items: [
          { title: 'Item A', selectedSpecLabel: 'S', quantity: 2 },
          { title: 'Item B', selectedSpecLabel: 'M', quantity: 1 },
        ],
        totalPrice: '300',
        buyerName: 'User',
      });

      const [, , templateParams] = mockEmailSend.mock.calls[0];
      expect(templateParams.product).toBe('方块之家周边订单');
      expect(templateParams.specifications).toContain('Item A');
      expect(templateParams.specifications).toContain('x2');
      expect(templateParams.specifications).toContain('Item B');
    });

    it('handles empty items array', async () => {
      mockEmailSend.mockResolvedValue({ status: 200 });

      await sendMerchandiseSettlementEmail({
        items: [],
        totalPrice: '0',
        buyerName: 'User',
      });

      const [, , templateParams] = mockEmailSend.mock.calls[0];
      expect(templateParams.specifications).toBe('无商品');
    });

    it('formats contact info correctly', async () => {
      mockEmailSend.mockResolvedValue({ status: 200 });

      await sendMerchandiseSettlementEmail({
        items: [],
        totalPrice: '0',
        buyerName: 'User',
        contactType: 'qq',
        contactValue: '12345678',
      });

      const [, , templateParams] = mockEmailSend.mock.calls[0];
      expect(templateParams.giftMessage).toContain('QQ: 12345678');
    });

    it('shows "未提供" when no contact info', async () => {
      mockEmailSend.mockResolvedValue({ status: 200 });

      await sendMerchandiseSettlementEmail({
        items: [],
        totalPrice: '0',
        buyerName: 'User',
      });

      const [, , templateParams] = mockEmailSend.mock.calls[0];
      expect(templateParams.giftMessage).toContain('未提供');
    });
  });
});