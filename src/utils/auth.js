export { supabase } from './supabase-client.js';
export {
  clearRequestCache as clearAuthReadCache,
  invalidateByTags,
  normalizeDbError
} from './request-core.js';

export {
  signUp,
  resendSignupConfirmation,
  signIn,
  signInWithOAuth,
  resetPassword,
  verifyPasswordRecovery,
  updatePassword,
  deleteMyAccount,
  signOut,
  getCurrentUser,
  getAllProfiles,
  getProfilesPage,
  getUserInfo,
  getEmailByUsername
} from './api/auth-api.js';

export {
  getPosts,
  getPostsCount,
  createPost,
  getComments,
  createComment,
  toggleLike,
  checkIfLiked,
  deletePost,
  deleteComment,
  getUserPosts,
  updatePost,
  retryPostModeration,
  getWeeklyCheckinStatus,
  submitWeeklyCheckin
} from './api/forum-api.js';

export {
  getUserNotifications,
  getArchivedNotifications,
  archiveNotification,
  unarchiveNotification,
  archiveAllNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  createNotification,
  getUnreadNotificationCount,
  subscribeToNotifications,
  filterSelfActionNotifications,
  sendPushplusForNotification
} from './api/notifications-api.js';

export {
  getUserImpressions,
  addUserImpression,
  deleteUserImpression,
  getProfileByUsername,
  getPostsByUsername,
  getCommentsByUsername,
  updateProfile,
  updateProfileBio,
  updateProfileAvatar,
  createShopOrderWithPoints
} from './api/profile-api.js';

export {
  getMySubscriptions,
  subscribeWithPoints
} from './api/subscription-api.js';
