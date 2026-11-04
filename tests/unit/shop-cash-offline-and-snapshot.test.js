import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '../helpers/source.js';

/**
 * 「现金线下人工 + 大部分地区包邮 + 订单备注 + 地址快照」的口径契约（2026-11-04 用户定档）。
 *
 * 这四条单独看都是文案/一列 SQL，合起来才是**一件事实**：
 *   · 运费（大部分地区不收邮费）⇒ 金额区不能留「与管理员核对」这种没写死的说法；
 *   · 现金人工 ⇒ 结果页/列表/详情都要出现「待付多少、谁来收」，且**不许说支付成功**；
 *   · 备注     ⇒ 确认页有入口、订单表有列、详情页能读到；
 *   · 地址快照 ⇒ 下单时落库，详情页优先读快照而不是回读 profiles。
 *
 * 之所以写成源级断言：这几处一旦被"顺手清理"掉，界面看着仍然正常 ——
 * 只有真下过一单、隔几天改了地址才会发现说不清。那种回归靠人工发现太晚。
 */

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

/* .vue 里的 HTML 注释会合法地复述"被删掉的那句"（解释为什么删），
   所以断言"不该出现的文案"之前必须先剥掉它 —— 否则改注释就误红。 */
const withoutHtmlComments = (src) => src.replace(/<!--[\s\S]*?-->/g, '');

const CHECKOUT = read('src/views/Shop/CheckoutSheet.vue');
const SUCCESS = read('src/views/Shop/ShopPaymentSuccessModal.vue');
const DETAIL = read('src/views/Shop/OrderDetailSheet.vue');
const PANEL = read('src/views/Shop/OrderPanel.vue');
const BAG = read('src/views/Shop/BagPanel.vue');
const SHOP = read('src/views/Shop/index.vue');
const PROFILE_API = read('src/utils/api/profile-api.js');
const ORDERS_API = read('src/utils/api/shop-orders-api.js');
const MIGRATION = read('supabase/migrations/2026110412_shop_order_shipping_snapshot_and_stock.sql');

describe('运费：大部分地区包邮', () => {
  it('确认页金额区写「包邮」，不再留「与管理员核对」这种没写死的说法', () => {
    expect(CHECKOUT).toContain('is-free');
    expect(CHECKOUT).toContain('大部分地区包邮');
    expect(withoutHtmlComments(CHECKOUT)).not.toContain('确认寄送方式时与管理员核对');
  });

  it('购物袋与订单详情也各有一处交代（用户在三处都会看总价）', () => {
    expect(BAG).toContain('bag-ship');
    expect(BAG).toContain('大部分地区包邮');
    expect(DETAIL).toContain('<dt>运费</dt>');
  });
});

describe('现金：线下人工收，界面必须说清待付', () => {
  it('结果页接收 cashDue，并按金额切换「待付款 / 积分已扣除」', () => {
    expect(SUCCESS).toContain('cashDue');
    expect(SUCCESS).toContain('待付款');
    expect(SUCCESS).toContain('积分已扣除');
  });

  it('含现金的单，结果页标题不再是干巴巴的「订单已提交」', () => {
    // 标题必须带条件分支：现金 > 0 时要多给一句"还差一步"
    expect(SUCCESS).toMatch(/cashDue > 0 \? '订单已提交，还差一步' : '订单已提交'/);
  });

  it('结果页永远不出现「支付成功」（现金还没到账）', () => {
    expect(withoutHtmlComments(SUCCESS)).not.toContain('支付成功');
  });

  it('订单列表与详情都标出待收金额', () => {
    expect(PANEL).toContain('cashDueText');
    expect(PANEL).toContain('待收');
    expect(DETAIL).toContain('cashDue');
    expect(DETAIL).toContain('od-note is-due');
  });

  it('待收提示在已发货 / 完成 / 取消后消失（不新造订单状态，只是展示层事实）', () => {
    for (const file of [PANEL, DETAIL]) {
      expect(file).toMatch(/\['completed', 'cancelled', 'shipped'\]/);
    }
  });

  it('下单时把现金待收金额交给结果页，而不是只传一句 paymentSummary', () => {
    expect(SHOP).toContain('cashDue: paidRmb');
    expect(SHOP).toContain(':cash-due=');
  });
});

describe('备注：确认页有入口、随订单落库、详情能读到', () => {
  it('确认页有 200 字上限的备注输入，提交时随 address 一起带出', () => {
    expect(CHECKOUT).toContain('ck-remark-input');
    expect(CHECKOUT).toContain('maxlength="200"');
    expect(CHECKOUT).toMatch(/remark: String\(remark\.value \|\| ''\)/);
  });

  it('下单请求带 remark，且前端截断到 200 字（DB 侧同约束）', () => {
    expect(PROFILE_API).toContain('remark');
    expect(PROFILE_API).toMatch(/p_remark/);
    expect(PROFILE_API).toContain('slice(0, 200)');
  });

  it('订单表有 remark 列且有长度约束', () => {
    expect(MIGRATION).toContain('add column if not exists remark text');
    expect(MIGRATION).toContain('shop_points_orders_remark_length_check');
  });
});

describe('地址快照：下单时冻结，详情优先读快照', () => {
  it('下单请求把地址作为 shipping 传到 RPC', () => {
    expect(PROFILE_API).toContain('p_shipping');
    expect(SHOP).toMatch(/shipping: \{ recipient, phone, address: fullAddress \}/);
  });

  it('三列快照 + 读回时映射成 order.shipping', () => {
    expect(MIGRATION).toContain('shipping_recipient');
    expect(MIGRATION).toContain('shipping_phone');
    expect(MIGRATION).toContain('shipping_address');
    expect(ORDERS_API).toContain('shipping_recipient');
    expect(ORDERS_API).toContain('shipping: {');
  });

  it('详情页优先用快照；历史订单才回落当前资料，并写明「当前」', () => {
    expect(DETAIL).toContain('isSnapshot: true');
    expect(DETAIL).toContain('按当前资料显示 · 此单未留下单时地址');
  });
});

describe('部署顺序：前端可以先于迁移上线', () => {
  it('下单 RPC 仍是旧签名时降级重试（否则新前端上线即下不了单）', () => {
    expect(PROFILE_API).toContain('isMissingShopOrderSignature');
    expect(PROFILE_API).toContain("supabase.rpc('create_shop_order', baseArgs)");
    expect(PROFILE_API).toContain('PGRST202');
  });

  it('订单列表查询缺列时退回旧列（42703 不能让整页订单挂掉）', () => {
    expect(ORDERS_API).toContain('SHOP_ORDER_BASE_COLUMNS');
    expect(ORDERS_API).toContain('42703');
  });
});

describe('库存：服务端真实校验与扣减', () => {
  it('库存不足要能作为业务错误返回（而不是静默超卖）', () => {
    // 迁移里抛业务码，API 层把它翻译成一句人话 —— 两处都必须在
    expect(MIGRATION).toContain('INSUFFICIENT_STOCK');
    expect(PROFILE_API).toContain('INSUFFICIENT_STOCK:');
  });

  it('读行用 for update（共享锁挡不住并发下单）', () => {
    expect(MIGRATION).toContain('for update');
    expect(stripComments(MIGRATION)).not.toContain('for share');
  });

  it('按累计数量校验：同商品多规格不能各自绕过库存', () => {
    expect(MIGRATION).toContain('v_taken');
    expect(MIGRATION).toMatch(/v_taken->>v_product_id::text/);
  });

  it('扣减发生在全部校验之后（return 不回滚，顺序错了会白扣库存）', () => {
    const code = stripComments(MIGRATION);
    const insertAt = code.indexOf('insert into public.shop_points_orders');
    const deductAt = code.indexOf('set stock = stock - v_take_qty');
    const lastReturnAt = code.lastIndexOf("'message', 'INSUFFICIENT_POINTS'");
    expect(insertAt).toBeGreaterThan(-1);
    expect(deductAt).toBeGreaterThan(insertAt);
    expect(lastReturnAt).toBeGreaterThan(-1);
    expect(deductAt).toBeGreaterThan(lastReturnAt);
  });
});
