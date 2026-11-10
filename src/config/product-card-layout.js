/**
 * 商品卡片形态（`products.card_layout`）—— 单一真源。
 *
 * 三档对齐 iOS 小组件的尺寸档：
 *   · small  —— 两列小卡（密排，适合一屏扫很多件）← 默认档（2026-11-10 用户口径：新建默认小卡）
 *   · banner —— 一行一个横幅（图左文右，96px 方图）
 *   · large  —— 通栏大图（16:9 封面在上、文案在下，适合主推单品）
 *
 * 为什么只做「档位 + 行内顺序」而不做自由坐标：商城是响应式的（竖屏 2 列 / 横屏
 * 3 列），自由摆放的 x/y 一换视口就全乱；档位 + `sort_order` 才能三端稳定复现。
 *
 * 后台表单、数据管理、前台渲染都从这里取值，别在各自文件里再写一份字面量。
 */
export const PRODUCT_CARD_LAYOUT = Object.freeze({
  SMALL: 'small',
  BANNER: 'banner',
  LARGE: 'large',
});

/**
 * 默认档位（新建商品 / 脏值回落共用这一处）。
 *
 * 2026-11-10 首批上线时默认是 banner，用户随后改口径为「默认新建都是小卡」。
 * DB 侧同步改成 `default 'small'`（迁移 2026111004）—— 代码与列默认值必须是
 * 同一个值，否则「后台新增」和「前端插入」出来的商品形态会不一样。
 */
export const DEFAULT_CARD_LAYOUT = PRODUCT_CARD_LAYOUT.SMALL;

export const PRODUCT_CARD_LAYOUT_OPTIONS = Object.freeze([
  { value: PRODUCT_CARD_LAYOUT.SMALL, label: '小卡（两列密排）' },
  { value: PRODUCT_CARD_LAYOUT.BANNER, label: '横幅（一行一个）' },
  { value: PRODUCT_CARD_LAYOUT.LARGE, label: '大图（通栏封面）' },
]);

const VALID_LAYOUTS = new Set(PRODUCT_CARD_LAYOUT_OPTIONS.map((item) => item.value));

/** 库里没有该列、值是脏数据、或为 null 时一律回落到 DEFAULT_CARD_LAYOUT（小卡） */
export const normalizeCardLayout = (value) => {
  const safe = String(value ?? '').trim();
  return VALID_LAYOUTS.has(safe) ? safe : DEFAULT_CARD_LAYOUT;
};

/** 编辑态「尺寸」胶囊点击一次循环到的下一档（small → banner → large → small） */
export const nextCardLayout = (value) => {
  const index = PRODUCT_CARD_LAYOUT_OPTIONS.findIndex(
    (item) => item.value === normalizeCardLayout(value),
  );
  return PRODUCT_CARD_LAYOUT_OPTIONS[(index + 1) % PRODUCT_CARD_LAYOUT_OPTIONS.length].value;
};

/** 胶囊上显示的短标签 */
export const cardLayoutLabel = (value) =>
  ({ small: '小卡', banner: '横幅', large: '大图' })[normalizeCardLayout(value)];
