/**
 * 概览卡封面图解析。
 *
 * 实现已收敛到 `@/utils/db-image-url.js`（DB 图片地址解析的单一真源）——
 * 原先这里有一份 `isCloudinaryImageUrl` + `resolveImage` 的内联副本，
 * 与 Newsroom / forum-format 的同名逻辑重复；重复的直接代价是
 * 活动页漏了 CDN 改写而裂图（2026-09-29）。留本模块只为保持既有导入路径不变。
 */
import { resolveDbImageUrl } from '@/utils/db-image-url.js';

// 与论坛 FORUM_LIST_IMAGE_TRANSFORM 同族（f_auto,q_auto:good,c_fill），按概览小图尺寸缩放
const CARD_IMAGE_TRANSFORM = 'f_auto,q_auto:good,c_fill,w_360,h_240';
const MODAL_IMAGE_TRANSFORM = 'f_auto,q_auto:good,c_limit,w_1600';

export const getOverviewCardImage = (imageUrl) => resolveDbImageUrl(imageUrl, CARD_IMAGE_TRANSFORM);

export const getOverviewModalImage = (imageUrl) =>
  resolveDbImageUrl(imageUrl, MODAL_IMAGE_TRANSFORM);
