export const POSTS_PER_PAGE = 10;
export const LIST_REPLY_PREVIEW_COUNT = 3;
export const WEEKLY_CHECKIN_REWARD_POINTS = 5;
export const FORUM_POST_IMAGE_MAX_COUNT = 6;
/* 草稿只有一份（2026-10-26 产品定稿）：云端 `forum_post_drafts` 为准，本地只是缓存。
   多版本草稿（版本上限 / 历史列表 / 版本恢复）已整体移除，别再引入版本类常量。 */
export const FORUM_POST_DRAFT_PREFIX = 'boh_forum_post_draft';
export const SEARCH_DEBOUNCE_MS = 350;
/* 图片转换档位单源（2026-09-27）：这 5 个常量曾在 utils/api/forum-format.js（数据层，
   真正在拼 URL 的地方）和本文件各写一份 —— 改一处忘另一处是迟早的事（LQIP 那次就差点分叉）。
   现在只留数据层那份，这里做 re-export，调用方的 import 路径一行都不用改。 */
export {
  FORUM_LIST_IMAGE_TRANSFORM,
  FORUM_LIST_IMAGE_TRANSFORM_SM,
  FORUM_LIST_IMAGE_TRANSFORM_MD,
  FORUM_LIST_LQIP_TRANSFORM,
  FORUM_DETAIL_IMAGE_TRANSFORM,
} from '@/utils/api/forum-format.js';
export const FORUM_TAG_OPTIONS = [
  { value: 'server', label: '#服务器' },
  { value: 'activity', label: '#活动' },
  { value: 'daily', label: '#日常' },
  { value: 'question', label: '#提问' },
];
export const FORUM_TAG_MAP = Object.fromEntries(FORUM_TAG_OPTIONS.map((tag) => [tag.value, tag]));
