/**
 * 首屏街景（street-scene）文案 —— 单一真相源。
 *
 * 问候语与底部提示由 home_heroes 行的 greeting_text / hint_text 控制（2026-09-24 起可配），
 * 两者留空时一律回落这里的默认值，保证「未配置」与「文案可配上线前」逐字一致。
 *
 * 消费方（两处必须同口径，因此共用本模块，不得各自维护副本）：
 *   - src/views/Home/components/StreetSceneHero.vue   线上渲染
 *   - src/views/HeroConsole/index.vue                 装修台实时预览
 *
 * 占位符：{greeting} 会被替换成访问时段的问候词（早上好 / 中午好 / 下午好 / 晚上好）。
 * 模板里不写占位符即固定文案。
 */

export const DEFAULT_GREETING_TEMPLATE = '{greeting}，欢迎回到方块街';
export const DEFAULT_HINT_TEXT = '往下逛逛';
export const GREETING_PLACEHOLDER = '{greeting}';

const GREETING_PLACEHOLDER_RE = /\{greeting\}/g;

/** 时段词。阈值与改动前一致，不做调整。 */
export const resolveGreetingWord = (date = new Date()) => {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return '早上好';
  if (hour >= 11 && hour < 13) return '中午好';
  if (hour >= 13 && hour < 18) return '下午好';
  return '晚上好';
};

/**
 * 问候语：空 → 默认模板；模板中的 {greeting} 替换为时段词。
 *
 * @param {string|null|undefined} template 自定义模板（可含 {greeting}）
 * @param {Date|string} [wordOrDate] 传 Date 则内部算时段词；也可直接传已算好的时段词字符串
 *   （线上组件把时段词存在 ref 里、加载后回填，为避免二次取时间，这里允许直接传入）
 */
export const resolveGreetingText = (template, wordOrDate = new Date()) => {
  const word = typeof wordOrDate === 'string' ? wordOrDate : resolveGreetingWord(wordOrDate);
  const custom = String(template ?? '').trim();
  return (custom || DEFAULT_GREETING_TEMPLATE).replace(GREETING_PLACEHOLDER_RE, word);
};

/** 底部提示文案（「↓」箭头是组件的固定装饰，不落库、不可配） */
export const resolveHintText = (hint) => String(hint ?? '').trim() || DEFAULT_HINT_TEXT;
