<script setup>
import { Reply } from 'lucide-vue-next';
import HomeCatMascot from '@/components/HomeCatMascot.vue';
import { formatSmartTime } from '@/utils/time.js';
import { getHomeCatAsset } from '@/utils/home-cat-theme.js';
import { useUserTier } from '@/composables/useUserTier.js';

const props = defineProps({
  comments: { type: Array, default: () => [] },
  isLoading: { type: Boolean, default: false },
  hasMore: { type: Boolean, default: false },
  isLoggedIn: { type: Boolean, default: false },
  currentUserId: { type: [String, Number], default: null },
  currentUserRole: { type: String, default: '' },
  postAuthorId: { type: [String, Number], default: '' },
  postCommentCount: { type: Number, default: 0 },
  isHomeCatActive: { type: Boolean, default: false },
  isReplySuccessPopping: { type: Boolean, default: false },
  activeReplyId: { type: [String, Number], default: null },
  replyToUser: { type: String, default: null },
  activeReplyQuote: { type: String, default: '' },
  replyContent: { type: String, default: '' },
  isReplySubmitting: { type: Boolean, default: false },
  replyCooldownSeconds: { type: Number, default: 0 },
  replySubmitLabel: { type: String, default: '发布' },
  childRepliesMap: { type: Object, default: () => ({}) },
  highlightedCommentId: { type: String, default: '' },
  commentSortMode: { type: String, default: 'desc' }
});

const emit = defineEmits([
  'reply',
  'submit-reply',
  'cancel-reply',
  'update:replyContent',
  'load-more-comments',
  'toggle-child-replies',
  'load-child-replies',
  'delete-comment',
  'go-to-profile',
  'change-sort-mode'
]);

const COMMENT_SORT_OPTIONS = [
  { value: 'desc', label: '最新' },
  { value: 'asc', label: '最早' }
];

const formatDate = formatSmartTime;

const { fetchUserTier, getNicknameClass } = useUserTier();
const commentTierMap = ref({});

const collectCommentAuthorIds = (comments) => {
  const ids = new Set();
  (comments || []).forEach((c) => {
    if (c?.author_id) ids.add(c.author_id);
    const children = c?.id ? getChildReplyState(c.id).items : [];
    (children || []).forEach((child) => { if (child?.author_id) ids.add(child.author_id); });
  });
  return [...ids];
};

watch(() => props.comments, async (cmts) => {
  const ids = collectCommentAuthorIds(cmts);
  await Promise.all(ids.map((id) => fetchUserTier(id)));
  const map = {};
  ids.forEach((id) => { map[id] = getNicknameClass(id); });
  commentTierMap.value = map;
}, { immediate: true, deep: true });

const getChildReplyState = (parentId) => {
  const key = String(parentId || '');
  return props.childRepliesMap[key] || {
    items: [],
    totalCount: 0,
    fullLoaded: false,
    page: 1,
    hasMore: false,
    isLoading: false,
    expanded: false
  };
};

const getVisibleChildReplies = (parentId) => {
  const state = getChildReplyState(parentId);
  if (state.expanded) {
    return state.items || [];
  }
  return (state.items || []).slice(0, 1);
};

const shouldShowExpandChildReplies = (parentId) => {
  const state = getChildReplyState(parentId);
  const total = Number(state.totalCount || 0);
  return state.isLoading || !state.fullLoaded || total > 1;
};

const getChildReplyToggleLabel = (parentId) => {
  const state = getChildReplyState(parentId);
  if (state.isLoading) return '加载中...';
  if (state.expanded) return '收起回复';
  if (!state.fullLoaded && Number(state.totalCount || 0) === 0) return '查看更多回复';
  if (!state.fullLoaded && Number(state.totalCount || 0) > 0) return '展开更多回复';
  const total = Number(state.totalCount || 0);
  if (total <= 1) return '查看更多回复';
  return '展开更多回复';
};

const shouldShowLoadMoreChildReplies = (parentId) => {
  const state = getChildReplyState(parentId);
  return Boolean(state.expanded && state.hasMore);
};

const getChildReplyLoadMoreLabel = (parentId) => {
  const state = getChildReplyState(parentId);
  return state.isLoading ? '加载中...' : '加载更多回复';
};

const onReplyInput = (event) => {
  emit('update:replyContent', event.target.value);
};
</script>

<template>
  <div class="x-side-content glass-panel">
    <transition name="fade-slide">
      <div v-if="activeReplyId" class="x-reply-box" :class="{ 'is-thread-reply': Boolean(replyToUser) }">
        <img v-if="isHomeCatActive && isReplySuccessPopping" class="detail-reply-success-cat-img"
          :src="getHomeCatAsset('success')" alt="" draggable="false"  loading="lazy" />
        <div class="reply-input-wrapper">
          <div class="reply-context-bar">
            <div class="reply-context-main">
              <span class="reply-context-label">{{ replyToUser ? '正在回复' : '写评论' }}</span>
              <span v-if="replyToUser" class="reply-context-user">@{{ replyToUser }}</span>
            </div>
            <p v-if="replyToUser && activeReplyQuote" class="reply-context-quote">{{ activeReplyQuote }}</p>
          </div>
          <textarea :value="replyContent" :placeholder="replyToUser ? `回复 @${replyToUser}...` : '写下你的想法...'"
            rows="3" class="reply-textarea-x" @input="onReplyInput"></textarea>
          <div class="reply-controls">
            <div class="btn-group">
              <button class="cancel-reply-btn"
                @click="$emit('cancel-reply')">取消</button>
              <button class="submit-reply-btn" :disabled="isReplySubmitting || replyCooldownSeconds > 0"
                @click="$emit('submit-reply')">
                {{ isReplySubmitting ? '发送中...' : replySubmitLabel }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <section class="x-comments-section">
      <div class="section-header">
        <h3 class="section-title">
          社区回复
          <span class="comment-count-badge">{{ postCommentCount }}</span>
        </h3>
        <div class="comment-sort-group">
          <button
            v-for="opt in COMMENT_SORT_OPTIONS"
            :key="opt.value"
            type="button"
            class="comment-sort-btn"
            :class="{ active: commentSortMode === opt.value }"
            :disabled="isLoading"
            @click="$emit('change-sort-mode', opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <div v-if="isLoading && comments.length === 0" class="comments-list custom-scrollbar"
        aria-hidden="true">
        <div v-for="item in 4" :key="`top-comment-loading-${item}`" class="comment-skeleton-row inline">
          <div class="detail-skeleton-block skeleton-avatar small"></div>
          <div class="comment-skeleton-body">
            <div class="detail-skeleton-block skeleton-line name"></div>
            <div class="detail-skeleton-block skeleton-line wide"></div>
            <div class="detail-skeleton-block skeleton-line medium"></div>
          </div>
        </div>
      </div>

      <div v-else-if="comments.length > 0" class="comments-list custom-scrollbar">
        <div v-for="reply in comments" :key="reply.id" :id="`comment-${reply.id}`" class="comment-item-x"
          :class="{ 'is-highlighted': highlightedCommentId === String(reply.id) }">
          <div class="comment-header">
            <div class="comment-author-info" @click="$emit('go-to-profile', reply.author_username)">
              <div class="mini-avatar">
                <img v-if="reply.author_avatar_url" :src="reply.author_avatar_url" alt="回复者头像"
                  class="avatar-image"  loading="lazy" />
                <span v-else>{{ reply.author_username?.charAt(0)?.toUpperCase?.() || 'U' }}</span>
              </div>
              <div class="author-details">
                <span class="comment-author-name" :class="commentTierMap[reply.author_id] || ''">{{ reply.author_username }}</span>
                <span class="comment-date">{{ formatDate(reply.created_at) }}</span>
                <span v-if="String(reply.author_id || '') === String(postAuthorId || '')" class="comment-author-badge">楼主</span>
              </div>
            </div>
          </div>
          <div class="comment-content">
            <p class="comment-text">{{ reply.content }}</p>
          </div>
          <div class="comment-footer-x">
            <button class="comment-reply-btn-mini"
              @click="$emit('reply', { targetId: reply.id, username: reply.author_username, content: reply.content })">
              <Reply :size="14" :stroke-width="1.8" aria-hidden="true" />
              回复
            </button>
            <button v-if="shouldShowExpandChildReplies(reply.id)" class="comment-thread-btn-mini"
              :disabled="getChildReplyState(reply.id).isLoading" @click="$emit('toggle-child-replies', reply)">
              {{ getChildReplyToggleLabel(reply.id) }}
            </button>
            <button v-if="isLoggedIn && (reply.author_id === currentUserId || currentUserRole === 'admin')"
              class="del-comment-btn-mini" aria-label="删除评论" title="删除评论" @click="$emit('delete-comment', { comment: reply, parentId: null })">删除</button>
          </div>

          <div v-if="getChildReplyState(reply.id).totalCount > 0 || getChildReplyState(reply.id).isLoading"
            class="child-replies-wrap">
            <div
              v-if="getChildReplyState(reply.id).isLoading && getVisibleChildReplies(reply.id).length === 0"
              class="child-replies-loading" aria-hidden="true">
              <div v-for="item in 2" :key="`child-reply-loading-${reply.id}-${item}`"
                class="child-reply-skeleton-row">
                <div class="detail-skeleton-block skeleton-line name"></div>
                <div class="detail-skeleton-block skeleton-line wide"></div>
              </div>
            </div>

            <div v-for="child in getVisibleChildReplies(reply.id)" :key="child.id" :id="`comment-${child.id}`"
              class="child-reply-item"
              :class="{ 'is-highlighted': highlightedCommentId === String(child.id) }">
              <div class="child-reply-head" @click="$emit('go-to-profile', child.author_username)">
                <span class="child-reply-author-wrap">
                  <span class="child-reply-author" :class="commentTierMap[child.author_id] || ''">{{ child.author_username }}</span>
                  <span v-if="String(child.author_id || '') === String(postAuthorId || '')" class="comment-author-badge compact">楼主</span>
                  <span v-if="child.reply_to_username" class="child-reply-target">
                    回复 @{{ child.reply_to_username }}
                  </span>
                </span>
                <span class="child-reply-time">{{ formatDate(child.created_at) }}</span>
              </div>
              <p class="child-reply-content">{{ child.content }}</p>
              <div class="child-reply-actions">
                <button class="comment-reply-btn-mini"
                  @click="$emit('reply', { targetId: reply.id, username: child.author_username, content: child.content })">回复</button>
                <button v-if="isLoggedIn && (child.author_id === currentUserId || currentUserRole === 'admin')"
                  class="del-comment-btn-mini" aria-label="删除回复" title="删除回复" @click="$emit('delete-comment', { comment: child, parentId: reply.id })">删除</button>
              </div>
            </div>

            <button v-if="shouldShowLoadMoreChildReplies(reply.id)" class="child-load-more-btn"
              :disabled="getChildReplyState(reply.id).isLoading"
              @click="$emit('load-child-replies', { parentId: reply.id, options: { reset: false } })">
              {{ getChildReplyLoadMoreLabel(reply.id) }}
            </button>
          </div>
        </div>

        <div v-if="hasMore" class="top-load-more-wrap">
          <button class="load-more-comments-btn" :disabled="isLoading"
            @click="$emit('load-more-comments')">
            {{ isLoading ? '加载中...' : '加载更多评论' }}
          </button>
        </div>
      </div>

      <div v-else class="no-comments-state">
        <HomeCatMascot v-if="isHomeCatActive" type="decorAlt" size="md" decorative />
        <div class="no-comments-icon">☕️</div>
        <p>暂无评论</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.x-side-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--detail-line, rgba(15, 23, 42, 0.07)) !important;
  border-radius: 26px !important;
  background: rgba(255, 255, 255, 0.64) !important;
  box-shadow: 0 18px 55px rgba(15, 23, 42, 0.045) !important;
  min-height: 0;
  overflow: hidden;
}

.x-reply-box {
  padding: 14px 18px 16px;
  border-bottom: 1px solid var(--detail-line, rgba(15, 23, 42, 0.07));
  background: rgba(255, 255, 255, 0.5);
}

.x-reply-box:focus-within {
  background: rgba(255, 255, 255, 0.78);
}

.x-reply-box.is-thread-reply {
  background: rgba(248, 251, 255, 0.72);
}

.reply-context-bar {
  margin-bottom: 8px;
  padding: 0 2px;
  border-radius: 0;
  background: transparent;
  border: none;
}

.reply-context-main {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.reply-context-label {
  font-size: 12px;
  font-weight: 800;
  color: #667085;
  letter-spacing: 0.02em;
}

.reply-context-user {
  min-width: 0;
  font-size: 13px;
  font-weight: 800;
  color: #0b64d8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reply-context-quote {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: #667085;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  overflow: hidden;
  word-break: break-word;
  padding-left: 8px;
  border-left: 2px solid rgba(15, 23, 42, 0.12);
}

.reply-textarea-x {
  width: 100%;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 14px;
  padding: 12px 13px;
  font-size: 15px;
  resize: none;
  outline: none;
  background: rgba(255, 255, 255, 0.72);
  transition: min-height 0.2s ease, border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
  min-height: 48px;
}

.reply-textarea-x:focus {
  border-color: rgba(0, 113, 227, 0.4);
  background: #fff;
  box-shadow: 0 4px 20px rgba(0, 113, 227, 0.08);
  min-height: 88px;
}

.x-comments-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 18px;
  min-height: 0;
}

.comments-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-right: 4px;
}

.comment-item-x {
  padding: 16px 2px;
  border-bottom: none;
  transition: background-color 0.2s, padding 0.2s, margin 0.2s;
}

.comment-item-x:hover {
  background: transparent;
}

.comment-item-x.is-highlighted,
.child-reply-item.is-highlighted {
  background: rgba(0, 113, 227, 0.06);
  border-radius: 12px;
  padding: 16px;
  margin: 0 -8px;
  border: 1px solid rgba(0, 113, 227, 0.1);
}

.comment-footer-x {
  display: flex;
  gap: 10px;
  margin-top: 7px;
  flex-wrap: wrap;
}

.comment-reply-btn-mini,
.comment-thread-btn-mini,
.del-comment-btn-mini {
  background: transparent;
  border: none;
  font-size: 12px;
  color: #6b7484;
  cursor: pointer;
  padding: 2px 0;
  border-radius: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.comment-reply-btn-mini:hover {
  background: transparent;
  color: #334155;
}

.comment-thread-btn-mini:hover {
  background: transparent;
  color: #0b4f90;
}

.child-load-more-btn {
  width: 100%;
  margin-top: 4px;
  border: none;
  border-radius: 10px;
  background: rgba(0, 113, 227, 0.08);
  color: #0b4f90;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.child-load-more-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.del-comment-btn-mini:hover {
  background: transparent;
  color: #f4212e;
}

.child-replies-wrap {
  position: relative;
  margin-top: 8px;
  margin-left: 16px;
  padding: 4px 0 4px 16px;
  border-left: 1px solid rgba(15, 23, 42, 0.1);
  display: flex;
  flex-direction: column;
  gap: 0;
  background: transparent;
}

.child-reply-item {
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 8px 0;
  transition: background-color 0.2s;
}

.child-reply-item:hover {
  background: transparent;
}

.child-reply-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  cursor: pointer;
}

.child-reply-author-wrap {
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.child-reply-author {
  font-size: 13px;
  font-weight: 700;
  color: #1d1d1f;
}

.comment-author-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: auto;
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: #0b64d8;
  font-size: 11px;
  font-weight: 850;
  line-height: 1;
  white-space: nowrap;
}

.comment-author-badge.compact {
  min-height: auto;
  padding: 0;
  font-size: 10px;
}

.child-reply-target {
  font-size: 12px;
  font-weight: 700;
  color: #667085;
}

.child-reply-time {
  flex-shrink: 0;
  font-size: 12px;
  color: #86868b;
}

.child-reply-content {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: #2f2f33;
  word-break: break-word;
}

.child-reply-actions {
  margin-top: 6px;
  display: flex;
  gap: 8px;
}

.child-replies-loading,
.child-empty-state {
  font-size: 12px;
  color: #86868b;
  padding: 4px 0;
}

.top-load-more-wrap,
.child-load-more-wrap {
  display: flex;
  justify-content: center;
  padding: 8px 0 2px;
}

.load-more-comments-btn {
  border: none;
  border-radius: 10px;
  background: #f2f4f8;
  color: #3b4a5a;
  font-size: 13px;
  font-weight: 700;
  padding: 8px 14px;
  cursor: pointer;
}

.load-more-comments-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.section-header {
  margin-bottom: 16px;
  padding-left: 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-title {
  font-size: 20px;
  font-weight: 800;
  color: #1d1d1f;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.comment-sort-group {
  display: flex;
  gap: 6px;
}

.comment-sort-btn {
  border: none;
  border-radius: 8px;
  background: #f5f5f7;
  color: #86868b;
  font-size: 13px;
  font-weight: 700;
  padding: 6px 12px;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.comment-sort-btn:hover:not(:disabled) {
  background: #e8e8ed;
  color: #1d1d1f;
}

.comment-sort-btn.active {
  background: #1d1d1f;
  color: #ffffff;
}

.comment-sort-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.comment-count-badge {
  background: #f5f5f7;
  color: #86868b;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  transform: translateY(1px);
}

.comment-header {
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  gap: 0;
  margin-bottom: 8px;
}

.comment-author-info {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
  min-width: 0;
}

.mini-avatar {
  width: 30px;
  height: 30px;
  background: #f5f5f7;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 14px;
  overflow: hidden;
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.comment-author-name {
  font-weight: 700;
  font-size: 14px;
  color: #1d1d1f;
  min-width: 0;
  overflow-wrap: anywhere;
}

.author-details {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  min-width: 0;
}

.author-details .comment-date::before,
.author-details .comment-author-badge::before {
  content: '·';
  margin-right: 5px;
  color: #a5adba;
  font-weight: 700;
}

.comment-date {
  font-size: 12px;
  color: #86868b;
  font-weight: 500;
}

.comment-content {
  font-size: 16px;
  line-height: 1.6;
  color: #333;
  margin-bottom: 12px;
}

.comment-text {
  font-size: 16px;
  line-height: 1.6;
  color: #333;
}

.no-comments-state {
  text-align: center;
  padding: 80px 0;
  color: #86868b;
}

.no-comments-state :deep(.home-cat-mascot) {
  display: flex;
  margin: 0 auto 10px;
}

.no-comments-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.reply-controls {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-top: 12px;
}

.btn-group {
  display: flex;
  gap: 12px;
}

.cancel-reply-btn {
  background: none;
  border: none;
  color: #86868b;
  font-weight: 600;
  cursor: pointer;
  padding: 10px 16px;
  border-radius: 10px;
  transition: all 0.2s;
}

.cancel-reply-btn:hover {
  background: #f5f5f7;
  color: #1d1d1f;
}

.submit-reply-btn {
  background: #1d1d1f;
  color: white;
  border: none;
  padding: 10px 24px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
}

.submit-reply-btn:hover:not(:disabled) {
  background: #000;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.submit-reply-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.detail-reply-success-cat-img {
  position: absolute;
  right: 20px;
  top: -32px;
  width: 54px;
  height: 54px;
  pointer-events: none;
  filter: drop-shadow(0 10px 18px rgba(124, 96, 61, 0.16));
  animation: detailReplySuccessPop 1.8s cubic-bezier(0.16, 1, 0.3, 1) both;
  z-index: 2;
}

@keyframes detailReplySuccessPop {
  0% {
    opacity: 0;
    transform: translateY(12px) scale(0.78) rotate(-4deg);
  }
  18% {
    opacity: 0.95;
  }
  58% {
    opacity: 0.95;
    transform: translateY(-8px) scale(1) rotate(3deg);
  }
  100% {
    opacity: 0;
    transform: translateY(-18px) scale(0.94) rotate(0deg);
  }
}

.detail-skeleton-block {
  position: relative;
  overflow: hidden;
  border-radius: 999px;
  background: #edf1f6;
}

.detail-skeleton-block::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.78), transparent);
  animation: skeletonShimmer 1.35s ease-in-out infinite;
}

.skeleton-avatar {
  width: 52px;
  height: 52px;
  flex: 0 0 auto;
  border-radius: 18px;
}

.skeleton-avatar.small {
  width: 38px;
  height: 38px;
  border-radius: 14px;
}

.skeleton-line {
  height: 14px;
  border-radius: 999px;
}

.skeleton-line.name {
  width: 150px;
}

.skeleton-line.wide {
  width: 82%;
}

.skeleton-line.medium {
  width: 58%;
}

.comment-skeleton-row {
  display: flex;
  gap: 14px;
  padding: 18px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.comment-skeleton-row.inline {
  padding: 18px;
}

.comment-skeleton-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.child-reply-skeleton-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.86);
}

@keyframes skeletonShimmer {
  100% {
    transform: translateX(100%);
  }
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

@media (max-width: 1024px) {
  .x-side-content {
    background: rgba(255, 255, 255, 0.66) !important;
  }

  .comments-list {
    overflow: visible;
  }
}

@media (max-width: 768px) {
  .x-comments-section {
    padding: 16px;
  }

  .x-reply-box {
    padding: 14px;
  }

  .reply-context-bar {
    padding: 9px 10px;
    border-radius: 11px;
  }

  .reply-context-main {
    align-items: flex-start;
  }

  .comment-item-x {
    padding: 16px 0;
  }

  .child-replies-wrap {
    margin-left: 8px;
    padding: 8px 0 8px 12px;
  }

  .child-reply-item {
    padding: 9px 8px;
  }

  .child-reply-head {
    align-items: flex-start;
  }

  .child-reply-time {
    font-size: 11px;
  }

  .reply-textarea-x {
    padding: 12px;
    font-size: 16px;
  }
}
</style>
