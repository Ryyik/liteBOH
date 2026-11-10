/**
 * 商品定价：解析 / 归一 / 校验 —— 单一真源。
 *
 * 为什么单独成模块：定价是**三列联动**（`payment_mode` + `points_cost` +
 * `rmb_price` + 受约束的 `is_purchasable`），DB 上有两条 CHECK 逐条校验：
 *   · `chk_products_points_required`：纯积分时 points_cost>0 或 is_purchasable=false
 *   · `chk_products_rmb_required`：纯现金/混合时 rmb_price>0 或 is_purchasable=false
 * 前端如果各写一份判据，最先漂移的就是「0 价能不能勾允许购买」——
 * 用户看到的是保存时弹一句英文约束名。校验口径与 DB 同源，只在此处定义。
 *
 * 单位口径（重要，别再混）：`rmb_price` 存**分**（整数），界面上输入的是**元**。
 */

/** 三档支付方式；value 必须与 DB 的 check 白名单一致 */
export const PAYMENT_MODE_OPTIONS = Object.freeze([
  { value: 'points_only', label: '纯积分', hint: '只用积分兑换' },
  { value: 'rmb_only', label: '纯现金', hint: '只用人民币购买' },
  { value: 'combined', label: '积分 + 现金', hint: '两者都要付' },
]);

const VALID_MODES = new Set(PAYMENT_MODE_OPTIONS.map((item) => item.value));

/** 脏值 / 空值回落纯积分（与 DB 列默认值 `'points_only'` 同一口径） */
export const normalizePaymentMode = (value) => {
  const safe = String(value ?? '').trim();
  return VALID_MODES.has(safe) ? safe : 'points_only';
};

export const paymentModeLabel = (value) =>
  PAYMENT_MODE_OPTIONS.find((item) => item.value === normalizePaymentMode(value))?.label ||
  '纯积分';

/** 积分必须是 ≥0 的整数；非数字/空 → 0（不是 null，DB 列是 NOT NULL） */
export const parsePointsCost = (value) => {
  const points = Number(value);
  return Number.isFinite(points) && points > 0 ? Math.round(points) : 0;
};

/**
 * 界面上填的「元」→ 库里存的「分」。
 *
 * 空串 / 非数字 → null（表示没填），而不是 0：DB 里 `rmb_price = 0` 与 `null`
 * 在 `chk_products_rmb_required` 眼里同样是「没有价」，但 null 才是「未定价」的
 * 正确语义，商品详情里也据此显示「暂无报价」而不是「¥0.00」。
 */
export const parseRmbYuanToCents = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const yuan = Number(value);
  if (!Number.isFinite(yuan) || yuan <= 0) return null;
  return Math.round(yuan * 100);
};

/** 库里的「分」→ 界面上显示的「元」字符串（配合 input 用） */
export const centsToYuanInput = (cents) => {
  const value = Number(cents);
  if (!Number.isFinite(value) || value <= 0) return '';
  return (value / 100).toFixed(2).replace(/\.00$/, '');
};

/**
 * 由面板输入构造待写库的 patch（四个字段一次写完）。
 *
 * 入参 `rmbYuan` 是**界面上的元**（用户填什么就是什么），内部转成分。
 * **清掉不属于当前模式的价**：切成纯积分时把 rmb_price 置 null、切成纯现金时把
 * points_cost 归 0。不清的话卡片上会出现「纯积分 ¥9.90」——前台按
 * `formatPriceDisplay` 只要 >0 就显示，跟模式无关，看着就像价算错了。
 */
export const buildPricePatch = ({ mode, points, rmbYuan, purchasable }) => {
  const safeMode = normalizePaymentMode(mode);
  const pointsCost = safeMode === 'rmb_only' ? 0 : parsePointsCost(points);
  const rmbPrice = safeMode === 'points_only' ? null : parseRmbYuanToCents(rmbYuan);
  return {
    payment_mode: safeMode,
    points_cost: pointsCost,
    rmb_price: rmbPrice,
    is_purchasable: Boolean(purchasable),
  };
};

/**
 * 校验 patch。返回错误文案，空串表示通过。
 *
 * 与 DB 的两条 CHECK 完全同源，但**多一条更严的**：混合模式下要求两边都有价。
 * DB 不管「混合但积分价 0」，可前台的 `isProductExchangeable` 会判成不可购买 ——
 * 那样商品在库里「可购买」、在页面上点不动，矛盾要靠人肉猜。这里提前拦住。
 */
export const validatePricePatch = (patch) => {
  const mode = normalizePaymentMode(patch?.payment_mode);
  const points = parsePointsCost(patch?.points_cost);
  const rmb = Number(patch?.rmb_price) > 0 ? Number(patch.rmb_price) : 0;
  const purchasable = patch?.is_purchasable === true;

  if (mode === 'points_only' && points <= 0) {
    return purchasable ? '纯积分商品的积分价必须大于 0；否则请关掉「允许购买」。' : '';
  }
  if (mode === 'rmb_only' && rmb <= 0) {
    return purchasable ? '纯现金商品的现金价必须大于 0；否则请关掉「允许购买」。' : '';
  }
  if (mode === 'combined') {
    if (purchasable && points <= 0) return '「积分 + 现金」需要同时填积分价，否则用户无法下单。';
    if (purchasable && rmb <= 0) return '「积分 + 现金」需要同时填现金价，否则用户无法下单。';
  }
  return '';
};

/** 前台展示用：「200 积分 + ¥9.90」；没有任何价时为「暂无报价」 */
export const formatPriceDisplay = (product) => {
  const points = parsePointsCost(product?.points_cost);
  const cents = Number(product?.rmb_price);
  const parts = [];
  if (points > 0) parts.push(`${points} 积分`);
  if (Number.isFinite(cents) && cents > 0) parts.push(`¥${(cents / 100).toFixed(2)}`);
  return parts.length ? parts.join(' + ') : '暂无报价';
};
