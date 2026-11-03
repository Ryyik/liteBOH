/**
 * 结算单的计算与预检（2026-11-03）
 *
 * 为什么抽成纯函数：确认订单页要回答四个问题 ——「买了什么 / 每件多少钱 / 总共付多少 /
 * 现在能不能付」。这四个答案一旦散在模板里，就会出现两个经典事故：
 *   ① 显示价取的是**加购时的快照**，而服务端 `create_shop_order` 按 products 表重算
 *      ⇒ 用户看到 ¥11.90、实扣 ¥13.90，且没有任何提示；
 *   ② 失效商品、库存不足、积分不够全部等「提交之后」才由 RPC 报错 ⇒ 弹一句 toast，
 *      用户还得自己回购物袋猜是哪一件出了问题。
 * 所以这里一次性把「以实时价为准 + 就地预检」定死，模板只负责画。
 *
 * ⚠️ 本文件不碰网络、不碰 UI，只吃数据吐数据 —— 单测见
 *    tests/unit/shop-checkout-summary.test.js，探针见 scripts/probes/probe-shop-checkout.mjs。
 */

/** 预检问题的语义码。前端只按码判等级，文案集中在这里，别在模板里另写一份。 */
export const CHECKOUT_ISSUE = {
  PRODUCT_MISSING: 'PRODUCT_MISSING',
  NOT_PURCHASABLE: 'NOT_PURCHASABLE',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  OVER_STOCK: 'OVER_STOCK',
  PRICE_CHANGED: 'PRICE_CHANGED',
  EMPTY_BAG: 'EMPTY_BAG',
  INSUFFICIENT_POINTS: 'INSUFFICIENT_POINTS',
  MISSING_ADDRESS: 'MISSING_ADDRESS',
};

/** 会拦住提交的问题（其余只是提醒） */
const BLOCKING = new Set([
  CHECKOUT_ISSUE.PRODUCT_MISSING,
  CHECKOUT_ISSUE.NOT_PURCHASABLE,
  CHECKOUT_ISSUE.OUT_OF_STOCK,
  CHECKOUT_ISSUE.OVER_STOCK,
  CHECKOUT_ISSUE.EMPTY_BAG,
  CHECKOUT_ISSUE.INSUFFICIENT_POINTS,
]);

const toInt = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
};
const toPoints = (value) => Math.max(0, toInt(value));
const toCents = (value) => Math.max(0, toInt(value));
const normalizeMode = (mode) => {
  const text = String(mode || 'points_only');
  return ['points_only', 'rmb_only', 'combined'].includes(text) ? text : 'points_only';
};

/** 一段文字的价格：`45 积分 + ¥6.90` / `70 积分` / `¥5.00` / `—` */
export function formatPriceText(points, cents) {
  const parts = [];
  if (toPoints(points) > 0) parts.push(`${toPoints(points)} 积分`);
  if (toCents(cents) > 0) parts.push(`¥${(toCents(cents) / 100).toFixed(2)}`);
  return parts.length ? parts.join(' + ') : '—';
}

/**
 * 一行结算明细。
 *
 * 价格口径：**只要实时商品还在，就一律用实时价**（服务端下单也是这么算的）。
 * 快照价只用于两件事：① 商品已下架时仍能显示「你当时看的价格」；② 与实时价比对，
 * 差出来了就提醒「价格已更新」。
 */
function buildLine(item, product) {
  const quantity = Math.max(1, toInt(item?.quantity) || 1);
  const snapshot = {
    mode: normalizeMode(item?.payment_mode),
    points: toPoints(item?.points_cost),
    cents: toCents(item?.rmb_price),
  };
  const live = product
    ? {
        mode: normalizeMode(product?.payment_mode),
        points: toPoints(product?.points_cost),
        cents: toCents(product?.rmb_price),
      }
    : null;
  // 实时商品优先；没实时数据就退回快照（下架商品仍要显示当时的价格）
  const price = live || snapshot;

  const unitPoints = price.mode === 'rmb_only' ? 0 : price.points;
  const unitCents = price.mode === 'points_only' ? 0 : price.cents;

  const issues = [];
  const stock = product ? toInt(product?.stock) : null;
  if (!product) {
    issues.push(CHECKOUT_ISSUE.PRODUCT_MISSING);
  } else {
    if (product.is_purchasable === false) issues.push(CHECKOUT_ISSUE.NOT_PURCHASABLE);
    if (stock !== null && stock <= 0) issues.push(CHECKOUT_ISSUE.OUT_OF_STOCK);
    else if (stock !== null && quantity > stock) issues.push(CHECKOUT_ISSUE.OVER_STOCK);
    if (live && (live.points !== snapshot.points || live.cents !== snapshot.cents)) {
      issues.push(CHECKOUT_ISSUE.PRICE_CHANGED);
    }
  }

  return {
    key: `${item?.id}-${item?.selectedSpec || ''}`,
    id: Number(item?.id) || 0,
    title: String(item?.title || '未知商品'),
    image: String(item?.image || ''),
    specLabel: String(item?.selectedSpecLabel || '默认规格'),
    quantity,
    stock,
    unitPoints,
    unitCents,
    subtotalPoints: unitPoints * quantity,
    subtotalCents: unitCents * quantity,
    priceText: formatPriceText(unitPoints, unitCents),
    subtotalText: formatPriceText(unitPoints * quantity, unitCents * quantity),
    live: Boolean(product),
    issues,
    blocking: issues.some((code) => BLOCKING.has(code)),
  };
}

const ISSUE_TEXT = {
  [CHECKOUT_ISSUE.PRODUCT_MISSING]: '已下架',
  [CHECKOUT_ISSUE.NOT_PURCHASABLE]: '暂不可兑换',
  [CHECKOUT_ISSUE.OUT_OF_STOCK]: '已售罄',
  [CHECKOUT_ISSUE.OVER_STOCK]: '超出库存',
  [CHECKOUT_ISSUE.PRICE_CHANGED]: '价格已更新',
};

/** 单行的问题标签（模板画在商品行右侧/副标题下方） */
export function lineIssueLabel(line) {
  const code = line?.issues?.[0];
  if (!code) return '';
  if (code === CHECKOUT_ISSUE.OVER_STOCK && line.stock !== null) {
    return `仅剩 ${Math.max(0, toInt(line.stock))} 件`;
  }
  return ISSUE_TEXT[code] || '';
}

/**
 * 汇总整单。
 *
 * @param {object} input
 * @param {object[]} input.bagItems   购物袋（Pinia 里的快照）
 * @param {object[]} input.products   商品表全量（实时价 / 库存 / 在售状态的真源）
 * @param {number}   input.pointsBalance 当前积分余额
 * @returns {{
 *   lines: object[], totalPoints: number, totalCents: number, totalQty: number,
 *   totalText: string, remainingPoints: number,
 *   issues: {code:string, level:'block'|'warn', message:string}[],
 *   blocking: boolean, insufficientPoints: boolean, priceChanged: boolean,
 *   removableKeys: string[], canSubmit: boolean
 * }}
 */
export function buildCheckoutSummary({
  bagItems = [],
  products = [],
  pointsBalance = 0,
  addressReady = true,
} = {}) {
  const productMap = new Map(
    (Array.isArray(products) ? products : []).map((product) => [Number(product?.id), product]),
  );
  const lines = (Array.isArray(bagItems) ? bagItems : []).map((item) =>
    buildLine(item, productMap.get(Number(item?.id)) || null),
  );

  const totalPoints = lines.reduce((sum, line) => sum + line.subtotalPoints, 0);
  const totalCents = lines.reduce((sum, line) => sum + line.subtotalCents, 0);
  const totalQty = lines.reduce((sum, line) => sum + line.quantity, 0);
  const balance = Math.max(0, toInt(pointsBalance));
  const remainingPoints = balance - totalPoints;

  const issues = [];
  if (!lines.length) {
    issues.push({ code: CHECKOUT_ISSUE.EMPTY_BAG, level: 'block', message: '购物袋是空的' });
  }

  const missing = lines.filter((line) => line.issues.includes(CHECKOUT_ISSUE.PRODUCT_MISSING));
  const unavailable = lines.filter(
    (line) =>
      line.issues.includes(CHECKOUT_ISSUE.NOT_PURCHASABLE) ||
      line.issues.includes(CHECKOUT_ISSUE.OUT_OF_STOCK),
  );
  const overStock = lines.filter((line) => line.issues.includes(CHECKOUT_ISSUE.OVER_STOCK));
  const priceChanged = lines.some((line) => line.issues.includes(CHECKOUT_ISSUE.PRICE_CHANGED));

  if (missing.length) {
    issues.push({
      code: CHECKOUT_ISSUE.PRODUCT_MISSING,
      level: 'block',
      message: `${missing.length} 件商品已下架，移除后才能提交`,
    });
  }
  if (unavailable.length) {
    issues.push({
      code: CHECKOUT_ISSUE.OUT_OF_STOCK,
      level: 'block',
      message: `${unavailable.length} 件商品已售罄或不可兑换，移除后才能提交`,
    });
  }
  if (overStock.length) {
    issues.push({
      code: CHECKOUT_ISSUE.OVER_STOCK,
      level: 'block',
      message: '有商品数量超过库存，请减少数量',
    });
  }
  const insufficientPoints = totalPoints > balance;
  if (insufficientPoints) {
    issues.push({
      code: CHECKOUT_ISSUE.INSUFFICIENT_POINTS,
      level: 'block',
      message: `积分不足：还差 ${totalPoints - balance} 积分`,
    });
  }
  if (priceChanged) {
    issues.push({
      code: CHECKOUT_ISSUE.PRICE_CHANGED,
      level: 'warn',
      message: '商品价格已更新，本页金额按最新价格计算',
    });
  }
  if (!addressReady) {
    issues.push({
      code: CHECKOUT_ISSUE.MISSING_ADDRESS,
      level: 'warn',
      message: '还没有收货地址，补一个才能提交',
    });
  }

  const blocking = issues.some((issue) => issue.level === 'block');

  return {
    lines,
    totalPoints,
    totalCents,
    totalQty,
    totalText: formatPriceText(totalPoints, totalCents),
    remainingPoints,
    issues,
    blocking,
    insufficientPoints,
    priceChanged,
    removableKeys: lines.filter((line) => line.blocking).map((line) => line.key),
    /* 提交条件：没有拦截级问题 + 地址齐全。地址在组件里是异步就绪的，
       这里只把它当输入，不在纯函数里判「选没选」。 */
    canSubmit: Boolean(lines.length) && !blocking && addressReady,
  };
}

/** 下单成功后交给结果页的支付构成文案（与 orders-api 的 priceText 同口径） */
export function buildPaymentSummary({ points = 0, cents = 0, mode = 'points_only' } = {}) {
  const normalized = normalizeMode(mode);
  const pointsText = toPoints(points) > 0 ? `${toPoints(points)} 积分` : '';
  const centsText = toCents(cents) > 0 ? `¥${(toCents(cents) / 100).toFixed(2)}` : '';
  if (normalized === 'rmb_only') return centsText || '—';
  if (normalized === 'combined') return [pointsText, centsText].filter(Boolean).join(' + ') || '—';
  return pointsText || '—';
}
