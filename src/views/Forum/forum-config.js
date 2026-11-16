export const POSTS_PER_PAGE = 10;
export const LIST_REPLY_PREVIEW_COUNT = 3;
export const WEEKLY_CHECKIN_REWARD_POINTS = 5;
export const FORUM_POST_IMAGE_MAX_COUNT = 6;
/* 标题上限（2026-10-25 提为单源）：原先是 PostComposer.vue 里的局部常量 `TITLE_MAX_LENGTH`。
   「智能整理」要对模型下同一个上限（`composables/post-polish.js`），局部常量会让
   两处各写一份 50 —— 改一处忘另一处就是「模型按 50 生成、输入框按 64 截断」这类错位。
   与主流社区一致，防止超长标题撑破排版。 */
export const FORUM_POST_TITLE_MAX_LENGTH = 50;
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
  FORUM_UPLOAD_IMAGE_MAX_DIMENSION,
  FORUM_UPLOAD_IMAGE_OPTIMIZE_OPTIONS,
} from '@/utils/api/forum-format.js';
export const FORUM_TAG_OPTIONS = [
  { value: 'server', label: '#服务器' },
  { value: 'activity', label: '#活动' },
  { value: 'daily', label: '#日常' },
  { value: 'question', label: '#提问' },
];
export const FORUM_TAG_MAP = Object.fromEntries(FORUM_TAG_OPTIONS.map((tag) => [tag.value, tag]));

/* ============================================================
 * 首屏 feed 请求参数 —— 唯一真源（2026-11-16，A1 预发的配套）
 *
 * 为什么必须是单源：`getPosts` 最终走 `executeRead('posts.getPosts', {…})`，
 * 而 request-core 的 in-flight 去重与缓存命中**只认 params 的稳定序列化**
 * （`buildRequestKey` 按键名排序后 JSON.stringify）。所以「开场画期间预发一份」
 * 和「ForumMain 挂载后再要一份」只有**逐字一致**才是"命中在途"，差一个字段
 * 就变成"多发一笔请求" —— 那比不预发还糟。
 *
 * ⚠️ 默认值必须等于 ForumMain 首次进入时的状态（`viewMode='all'` / `sortMode='latest'`
 *    / 无搜索无标签 / 非影集 / keyset 游标首页）。它**不是**通用默认值工厂，
 *    别拿它拼筛选态请求 —— 那种情况请把对应的 reactive 值显式传进来。
 * ⚠️ `cursorMode: 'keyset'` 不是可选项：RPC 路径与直连表路径的返回结构不同，
 *    首页默认走 keyset 直连表（见 post-api 的 useCursorMode 判定）。
 * ============================================================ */
export function buildForumFeedParams({
  page = 1,
  sortMode = 'latest',
  searchQuery = '',
  tagFilter = '',
  kindFilter = '',
  albumOnly = false,
  cursor = '',
  signal,
  limit = POSTS_PER_PAGE + 1,
  includeUnapprovedForAuthor = false,
  followingUserIds,
} = {}) {
  return {
    page,
    pageSize: POSTS_PER_PAGE,
    sortMode,
    searchQuery,
    tagFilter,
    kindFilter,
    albumOnly,
    cursorMode: 'keyset',
    cursor,
    signal,
    limit,
    includeUnapprovedForAuthor,
    followingUserIds,
  };
}
