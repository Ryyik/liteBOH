import { getBohAIModelStatus } from '@/utils/bohai-model-client.js';

export const AI_SEARCH_MODEL_ID = import.meta.env.VITE_FORUM_AI_SEARCH_MODEL || getBohAIModelStatus().defaultModelId;
export const POSTS_PER_PAGE = 10;
export const LIST_REPLY_PREVIEW_COUNT = 3;
export const WEEKLY_CHECKIN_REWARD_POINTS = 5;
export const FORUM_POST_IMAGE_MAX_COUNT = 6;
export const FORUM_LIST_PREVIEW_IMAGE_MAX_COUNT = 4;
export const FORUM_POST_DRAFT_PREFIX = 'boh_forum_post_draft';
export const FORUM_POST_DRAFT_VERSION_LIMIT = 5;
export const SEARCH_DEBOUNCE_MS = 350;
export const FORUM_IMAGE_UPLOAD_CONCURRENCY = 2;
export const FORUM_LIST_IMAGE_TRANSFORM_SM = 'f_auto,q_auto:good,c_fill,w_360,h_270';
export const FORUM_LIST_IMAGE_TRANSFORM_MD = 'f_auto,q_auto:good,c_fill,w_540,h_405';
export const FORUM_LIST_LQIP_TRANSFORM = 'f_auto,q_auto:low,c_fill,w_72,h_54,e_blur:1000';
export const FORUM_TAG_OPTIONS = [
  { value: 'server', label: '#服务器' },
  { value: 'activity', label: '#活动' },
  { value: 'daily', label: '#日常' },
  { value: 'question', label: '#提问' }
];
export const FORUM_TAG_MAP = Object.fromEntries(FORUM_TAG_OPTIONS.map((tag) => [tag.value, tag]));
