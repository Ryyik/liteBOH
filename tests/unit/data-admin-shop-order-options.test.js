/**
 * 后台「商城订单」面板 × 线上表约束的一致性契约。
 *
 * 起因（2026-11-02 用户报障「3 笔订单一直待处理」）：后台的下拉选项与
 * shop_points_orders 的 DB CHECK 长期各写一份，漂了三处 ——
 *   · 联系方式只有 qq / vx，而结算改「资料即收货信息」后写的是 profile
 *     ⇒ 打开这类订单，下拉是空白的；
 *   · 卡片映射把联系方式写成 wechat / phone，两个值线上都不存在；
 *   · 卡片状态映射多一条 shipped，表里没有这一档，选中它保存必 400。
 * 这三处都属于「界面看起来能改、实际改不动」，所以用源码级断言把它们焊死。
 *
 * 真源：pg_constraint 的
 *   shop_points_orders_contact_type_check = qq / vx / profile
 *   shop_points_orders_status_check       = preparing / shipped / completed / cancelled
 *   （2026-11-02 用户口径「准备中，已发货，完成，取消，就这四个状态」）
 */
import { describe, expect, it } from 'vitest';
import {
  ORDER_CONTACT_TYPE_OPTIONS,
  ORDER_STATUS_OPTIONS,
} from '@/views/DataManagement/config/fields.js';
import { dataConfig } from '@/views/DataManagement/config/tables.js';
import { SAVE_STRATEGIES } from '@/views/DataManagement/config/saveStrategies.js';

const DB_CONTACT_TYPES = ['qq', 'vx', 'profile'];
const DB_ORDER_STATUSES = ['preparing', 'shipped', 'completed', 'cancelled'];

const valuesOf = (options) => options.map((item) => item.value);

describe('商城订单面板：选项必须与 DB CHECK 一致', () => {
  it('联系方式三档与表约束逐字相同（缺 profile 会让新订单在后台显示空白）', () => {
    expect(valuesOf(ORDER_CONTACT_TYPE_OPTIONS)).toEqual(DB_CONTACT_TYPES);
  });

  it('订单状态四档与表约束逐字相同（准备中 / 已发货 / 完成 / 取消）', () => {
    expect(valuesOf(ORDER_STATUS_OPTIONS)).toEqual(DB_ORDER_STATUSES);
    expect(valuesOf(ORDER_STATUS_OPTIONS)).not.toContain('pending');
    expect(valuesOf(ORDER_STATUS_OPTIONS)).not.toContain('processing');
  });

  it('卡片视图的联系方式映射只用真实值，且覆盖 profile', () => {
    const meta = dataConfig.shopOrders.cardView.meta;
    const contact = meta.find((item) => item.key === 'contact_type');
    expect(contact, '卡片视图必须保留「联系方式」一项').toBeTruthy();

    const mappingKeys = Object.keys(contact.values || {});
    expect(mappingKeys.sort()).toEqual([...DB_CONTACT_TYPES].sort());
    // 存量的 wechat / phone 是凭空写的，会把真实值映射成原样输出
    expect(mappingKeys).not.toContain('wechat');
    expect(mappingKeys).not.toContain('phone');
  });

  it('卡片视图的状态映射不得超出四档（多一个值 ⇒ 保存 400）', () => {
    const statusMetaKeys = Object.keys(dataConfig.shopOrders.cardView.statusMeta || {});
    expect(statusMetaKeys.sort()).toEqual([...DB_ORDER_STATUSES].sort());
  });

  it('保存策略接受 shipped、拒绝已废弃的 pending —— 与表约束同向', async () => {
    const shipped = await SAVE_STRATEGIES.shopOrders({ editingItem: { status: 'shipped' } });
    expect(shipped.status).toBe('shipped');

    await expect(
      SAVE_STRATEGIES.shopOrders({ editingItem: { status: 'pending' } }),
    ).rejects.toThrow(/订单状态无效/);
  });
});
