// Re-export from sub-modules — all call-sites import from '@/utils/api/forum-api.js' unchanged.
export {
  getPosts,
  getPostsCount,
  getForumTagStats,
  getPostEngagementStats,
  createPostWithImages,
  createPost,
  getForumPostDraft,
  upsertForumPostDraft,
  deleteForumPostDraft,
  deletePost,
  getUserPosts,
  updatePost,
  retryPostModeration,
  getWeeklyCheckinStatus,
  submitWeeklyCheckin
} from './forum/post-api.js';

export {
  getComments,
  getCommentThreadReplies,
  getCommentAncestors,
  getCommentThreadPreviewsBatch,
  createComment,
  deleteComment
} from './forum/comment-api.js';

export {
  toggleLike,
  checkIfLiked,
  reportPost
} from './forum/forum-interaction-api.js';

// Preserve original re-exports
export { normalizeForumTag } from './forum-format.js';
export {
  deleteUploadedForumImage,
  getForumPostImages,
  moderateForumImage,
  preloadForumImageModeration,
  uploadApprovedForumImageQueued,
  uploadForumImage
} from './forum-images-api.js';
