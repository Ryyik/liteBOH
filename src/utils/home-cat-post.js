/**
 * 帖子卡片的「猫装饰」呈现策略。
 *
 * 为什么单独成模块：这 6 个函数原本在 `views/Forum/components/PostCard.vue` 与
 * `views/Profile/ProfileMain.vue` 各存一份，且 **逐字节相同**（2026-09-29 用 `diff` 实测，
 * 不是「看起来一样」）。两边都只是从 `home-cat-theme.js` 取资产再做一层映射。
 * 名字相同、实现相同 → 合并零风险；反过来，任何一次只改一边，都会让
 * 「论坛里的帖子卡」和「个人主页里的帖子卡」长得不一样 —— 而这种分叉不会报错。
 *
 * 职责边界：本模块只管「第 N 张卡该用哪只猫、背景猫什么时候出现」；
 * 资产注册表与按 seed 取型在 `home-cat-theme.js`。
 */

import { getHomeCatAsset, getHomeCatTypeBySeed } from './home-cat-theme.js';

/** 第 index 张卡用哪一类猫：已点赞或赞数 ≥8 用 `like`，否则按 index 轮转。 */
export const getPostCardCatType = (index, post) => {
  if (post?.isLiked || Number(post?.like_count || 0) >= 8) return 'like';
  return ['decorAlt', 'decor', 'theme', 'cardExtra', 'mobileGap'][Number(index) % 5];
};

/** 卡片装饰猫的 CSS 变体类名（4 档循环，供错位/翻转等样式使用）。 */
export const getPostCardCatVariant = (index) => `cat-variant-${Number(index) % 4}`;

/** 猫资产的稳定 seed：同一帖子每次渲染必须取到同一只猫。 */
export const getPostCardCatSeed = (post, index, suffix = 'card') =>
  `${post?.id || index}:${suffix}`;

/** 卡片装饰猫的图片地址。 */
export const getPostCardCatSrc = (post, index) => getHomeCatAsset(getPostCardCatType(index, post));

/** 背景装饰猫的图片地址（与卡片猫走不同池子，避免同一张卡出现两只同样的猫）。 */
export const getPostBackgroundCatSrc = (post, index) => {
  const type = getHomeCatTypeBySeed(getPostCardCatSeed(post, index, 'bg'), 'background');
  return getHomeCatAsset(type);
};

/** 背景猫只出现在约 1/3 的卡片上（对 id 做字符和取模），避免列表过于花哨。 */
export const shouldShowPostBackgroundCat = (post, index) => {
  const raw = String(post?.id || index || '');
  let sum = 0;
  for (let i = 0; i < raw.length; i += 1) sum += raw.charCodeAt(i);
  return sum % 3 === 1;
};
