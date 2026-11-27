<script setup>
import { computed } from 'vue';
import { Reply } from 'lucide-vue-next';
import { useTierMap } from '@/composables/useTierMap.js';
import HomeCatMascot from '@/components/HomeCatMascot.vue';
import { formatSmartTime } from '@/utils/time.js';
import { getHomeCatAsset } from '@/utils/home-cat-theme.js';
import { getAvatarUrl } from '@/utils/avatar.js';
import { useUserTier } from '@/composables/useUserTier.js';
import ReplyIdentityRow from '@/components/forum/ReplyIdentityRow.vue';
import ReplyComposer from '@/components/forum/ReplyComposer.vue';
import LikeButton from '@/components/forum/LikeButton.vue';

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
  // 弹窗模式：底部操作栏是唯一输入框，抑制评论流内嵌输入框
  hideComposer: { type: Boolean, default: false },
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
  'toggle-comment-like',
]);

/** 删除权限：本人或 admin（「···」入口，点击后由宿主弹确认）。 */
const canDeleteComment = (comment) =>
  Boolean(
    props.isLoggedIn &&
    comment &&
    (String(comment.author_id || '') === String(props.currentUserId || '') ||
      props.currentUserRole === 'admin'),
  );

const formatDate = formatSmartTime;

const { fetchUserTier, fetchUserTiersBatch, getNicknameClass } = useUserTier();

/* ⚠️ 定义顺序是硬约束：useTierMap 的 watch 带 immediate，在 setup 期间就会**同步**调用
   idsGetter（→ collectCommentAuthorIds → getChildReplyState）。若 getChildReplyState
   写在它下面（const 的 TDZ），setup 直接抛 ReferenceError —— dev 下 Vue 会 rethrow，
   整个评论区渲染成空白；prod 下只 console.error，表现为「等级配色不生效」。
   所以 getChildReplyState 必须先定义，别再把它挪回 useTierMap 之后。 */
const getChildReplyState = (parentId) => {
  const key = String(parentId || '');
  return (
    props.childRepliesMap[key] || {
      items: [],
      totalCount: 0,
      fullLoaded: false,
      page: 1,
      hasMore: false,
      isLoading: false,
      expanded: false,
    }
  );
};

const collectCommentAuthorIds = (comments) => {
  const ids = new Set();
  (comments || []).forEach((c) => {
    if (c?.author_id) ids.add(c.author_id);
    const children = c?.id ? getChildReplyState(c.id).items : [];
    (children || []).forEach((child) => {
      if (child?.author_id) ids.add(child.author_id);
    });
  });
  return [...ids];
};

const commentTierMap = useTierMap(
  () => collectCommentAuthorIds(props.comments),
  getNicknameClass,
  fetchUserTier,
  fetchUserTiersBatch,
);

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

// 模板专用 computed 缓存：按 reply.id 索引，避免模板内重复方法调用
const childReplyStateMap = computed(() => {
  const map = {};
  for (const reply of props.comments) {
    map[reply.id] = getChildReplyState(reply.id);
  }
  return map;
});

const visibleChildRepliesMap = computed(() => {
  const map = {};
  for (const reply of props.comments) {
    map[reply.id] = getVisibleChildReplies(reply.id);
  }
  return map;
});

const showExpandChildMap = computed(() => {
  const map = {};
  for (const reply of props.comments) {
    map[reply.id] = shouldShowExpandChildReplies(reply.id);
  }
  return map;
});

const toggleLabelMap = computed(() => {
  const map = {};
  for (const reply of props.comments) {
    map[reply.id] = getChildReplyToggleLabel(reply.id);
  }
  return map;
});

const showLoadMoreMap = computed(() => {
  const map = {};
  for (const reply of props.comments) {
    map[reply.id] = shouldShowLoadMoreChildReplies(reply.id);
  }
  return map;
});

const loadMoreLabelMap = computed(() => {
  const map = {};
  for (const reply of props.comments) {
    map[reply.id] = getChildReplyLoadMoreLabel(reply.id);
  }
  return map;
});

// 静态资源预计算，避免模板每次渲染都调用
const successCatAsset = getHomeCatAsset('success');

const isPostAuthor = (comment) =>
  String(comment?.author_id || '') === String(props.postAuthorId || '');
</script>

<template>
  <div class="x-side-content glass-panel">
    <transition name="fade-slide">
      <div
        v-if="activeReplyId && !hideComposer"
        class="x-reply-box"
        :class="{ 'is-thread-reply': Boolean(replyToUser) }"
      >
        <img
          v-if="isHomeCatActive && isReplySuccessPopping"
          class="detail-reply-success-cat-img"
          :src="successCatAsset"
          alt=""
          draggable="false"
          loading="lazy"
        />
        <div class="reply-input-wrapper">
          <div v-if="replyToUser" class="reply-context-bar">
            <div class="reply-context-main">
              <span class="reply-context-label">正在回复</span>
              <span class="reply-context-user">@{{ replyToUser }}</span>
            </div>
            <p v-if="activeReplyQuote" class="reply-context-quote">{{ activeReplyQuote }}</p>
          </div>
          <ReplyComposer
            :model-value="replyContent"
            :placeholder="replyToUser ? `回复 @${replyToUser}…` : '写下你的想法…'"
            :target-username="replyToUser || ''"
            :sending="isReplySubmitting"
            :cooldown="replyCooldownSeconds"
            :submit-label="replySubmitLabel"
            :logged-in="isLoggedIn"
            :auto-focus="true"
            :auto-focus-delay="60"
            @update:model-value="(v) => emit('update:replyContent', v)"
            @send="emit('submit-reply')"
            @clear-target="emit('cancel-reply')"
            @need-login="emit('cancel-reply')"
          />
        </div>
      </div>
    </transition>

    <section class="x-comments-section">
      <div class="section-header">
        <h3 class="section-title">
          社区回复
          <span class="comment-count-badge">{{ postCommentCount }}</span>
        </h3>
        <!-- 评论排序已按 plans/051 拍板 4 移除（只留默认序） -->
      </div>

      <div
        v-if="isLoading && comments.length === 0"
        class="comments-list custom-scrollbar"
        aria-hidden="true"
      >
        <div
          v-for="item in 4"
          :key="`top-comment-loading-${item}`"
          class="comment-skeleton-row inline"
        >
          <div class="detail-skeleton-block skeleton-avatar small"></div>
          <div class="comment-skeleton-body">
            <div class="detail-skeleton-block skeleton-line name"></div>
            <div class="detail-skeleton-block skeleton-line wide"></div>
            <div class="detail-skeleton-block skeleton-line medium"></div>
          </div>
        </div>
      </div>

      <!-- 2026-11-04 硬切审计 P0-3/P0-6：TransitionGroup 让新评论入场淡入、
           删除/刷新时其余条目 FLIP 补位；骨架⇄列表的内容侧另有 content-swap-in-fade -->
      <TransitionGroup
        v-else-if="comments.length > 0"
        tag="div"
        name="cr-fade"
        class="comments-list custom-scrollbar content-swap-in-fade"
      >
        <div
          v-for="reply in comments"
          :key="reply.id"
          :id="`comment-${reply.id}`"
          class="comment-item-x"
          :class="{ 'is-highlighted': highlightedCommentId === String(reply.id) }"
        >
          <ReplyIdentityRow
            size="md"
            :username="reply.author_username"
            :avatar-url="reply.author_avatar_url ? getAvatarUrl(reply.author_avatar_url, 'xs') : ''"
            :avatar-frame-url="reply.author_avatar_frame_url || ''"
            :author-id="reply.author_id"
            :banned="!!reply.author_is_banned"
            :time="formatDate(reply.created_at)"
            :tier-class="commentTierMap[reply.author_id] || ''"
            :badge="isPostAuthor(reply) ? '楼主' : ''"
            @go-to-profile="(u) => emit('go-to-profile', u)"
          />
          <div class="comment-content">
            <p class="comment-text">{{ reply.content }}</p>
          </div>
          <!-- 左操作 / 右删除（⋯ 点击后由宿主弹确认，不直接删） -->
          <div class="comment-foot">
            <div class="comment-actions">
              <LikeButton
                :count="Number(reply.like_count || 0)"
                :liked="!!reply.isLiked"
                :submitting="!!reply.isLikeSubmitting"
                :aria-label="reply.isLiked ? '取消点赞' : '点赞'"
                @toggle="emit('toggle-comment-like', { comment: reply })"
              />
              <button
                class="comment-reply-btn-mini"
                @click="
                  emit('reply', {
                    targetId: reply.id,
                    username: reply.author_username,
                    content: reply.content,
                    rootAuthorUsername: reply.author_username,
                  })
                "
              >
                <Reply :size="14" :stroke-width="1.8" aria-hidden="true" />
                <span class="comment-action-label">回复</span>
                <span
                  v-if="Number(childReplyStateMap[reply.id]?.totalCount || 0) > 0"
                  class="comment-reply-count"
                  >{{ childReplyStateMap[reply.id].totalCount }}</span
                >
              </button>
            </div>
            <button
              v-if="canDeleteComment(reply)"
              class="comment-more-btn"
              aria-label="删除评论"
              title="删除评论"
              @click="emit('delete-comment', { comment: reply, parentId: null })"
            >
              <span></span><span></span><span></span>
            </button>
          </div>

          <div
            v-if="
              childReplyStateMap[reply.id].totalCount > 0 || childReplyStateMap[reply.id].isLoading
            "
            class="child-replies-wrap"
          >
            <div
              v-if="
                childReplyStateMap[reply.id].isLoading &&
                visibleChildRepliesMap[reply.id].length === 0
              "
              class="child-replies-loading"
              aria-hidden="true"
            >
              <div
                v-for="item in 2"
                :key="`child-reply-loading-${reply.id}-${item}`"
                class="child-reply-skeleton-row"
              >
                <div class="detail-skeleton-block skeleton-line name"></div>
                <div class="detail-skeleton-block skeleton-line wide"></div>
              </div>
            </div>

            <!-- 2026-11-04 硬切审计 P0-6：子回复展开/追加原先瞬现，TransitionGroup 补 enter/move -->
            <TransitionGroup name="cr-fade">
              <div
                v-for="child in visibleChildRepliesMap[reply.id]"
                :key="child.id"
                :id="`comment-${child.id}`"
                class="child-reply-item"
                :class="{ 'is-highlighted': highlightedCommentId === String(child.id) }"
              >
                <ReplyIdentityRow
                  size="sm"
                  :username="child.author_username"
                  :avatar-url="
                    child.author_avatar_url ? getAvatarUrl(child.author_avatar_url, 'xs') : ''
                  "
                  :avatar-frame-url="child.author_avatar_frame_url || ''"
                  :author-id="child.author_id"
                  :banned="!!child.author_is_banned"
                  :time="formatDate(child.created_at)"
                  :reply-to="child.reply_to_username"
                  :root-author="reply.author_username"
                  :tier-class="commentTierMap[child.author_id] || ''"
                  :badge="isPostAuthor(child) ? '楼主' : ''"
                  @go-to-profile="(u) => emit('go-to-profile', u)"
                />
                <div class="comment-content">
                  <p class="child-reply-content">{{ child.content }}</p>
                </div>
                <div class="comment-foot">
                  <div class="comment-actions">
                    <LikeButton
                      :count="Number(child.like_count || 0)"
                      :liked="!!child.isLiked"
                      :submitting="!!child.isLikeSubmitting"
                      :aria-label="child.isLiked ? '取消点赞' : '点赞'"
                      @toggle="emit('toggle-comment-like', { comment: child, parentId: reply.id })"
                    />
                    <button
                      class="comment-reply-btn-mini"
                      @click="
                        emit('reply', {
                          targetId: reply.id,
                          username: child.author_username,
                          content: child.content,
                          rootAuthorUsername: reply.author_username,
                        })
                      "
                    >
                      回复
                    </button>
                  </div>
                  <button
                    v-if="canDeleteComment(child)"
                    class="comment-more-btn"
                    aria-label="删除回复"
                    title="删除回复"
                    @click="emit('delete-comment', { comment: child, parentId: reply.id })"
                  >
                    <span></span><span></span><span></span>
                  </button>
                </div>
              </div>
            </TransitionGroup>

            <button
              v-if="showExpandChildMap[reply.id]"
              class="child-expand-link"
              :disabled="childReplyStateMap[reply.id].isLoading"
              @click="emit('toggle-child-replies', reply)"
            >
              {{ toggleLabelMap[reply.id] }}
            </button>

            <button
              v-if="showLoadMoreMap[reply.id]"
              class="child-load-more-btn"
              :disabled="childReplyStateMap[reply.id].isLoading"
              @click="emit('load-child-replies', { parentId: reply.id, options: { reset: false } })"
            >
              {{ loadMoreLabelMap[reply.id] }}
            </button>
          </div>
        </div>

        <div v-if="hasMore" key="load-more" class="top-load-more-wrap">
          <button
            class="load-more-comments-btn"
            :disabled="isLoading"
            @click="emit('load-more-comments')"
          >
            {{ isLoading ? '加载中...' : '加载更多评论' }}
          </button>
        </div>

        <div
          v-if="!hasMore && comments.length > 0 && !isLoading"
          key="end-mark"
          class="comments-end-mark"
          aria-hidden="true"
        >
          - 到底啦 -
        </div>
      </TransitionGroup>

      <div v-else class="no-comments-state">
        <HomeCatMascot v-if="isHomeCatActive" type="decorAlt" size="md" decorative />
        <div class="no-comments-icon">☕️</div>
        <p>暂无评论</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* 子回复 enter/move（2026-11-04 硬切审计 P0-6）：展开/追加/收起不再瞬现瞬失。
   时长口径对齐全站 240ms；reduced-motion 由布局层的令牌归零兜不到这里，就地声明。 */
.cr-fade-enter-active,
.cr-fade-leave-active,
.cr-fade-move {
  transition:
    opacity 0.24s var(--ease-out, ease),
    transform 0.24s var(--ease-out, ease);
}

.cr-fade-enter-from,
.cr-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

/* 重复类名提特异性，稳压全局 .glass-panel（顺序无关，免 !important）
   plans/051 批 3：侧栏去玻璃壳 → 实色 --appl-card + 发丝线，圆角对齐极简内圆角 */
.x-side-content.x-side-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--appl-hairline);
  border-radius: var(--appl-radius-card);
  background: var(--appl-card);
  box-shadow: var(--appl-shadow-card);
  min-height: 0;
  overflow: hidden;
}

.x-reply-box {
  padding: 14px 18px 16px;
  border-bottom: 1px solid var(--appl-hairline);
  background: transparent;
}

.x-reply-box.is-thread-reply {
  background: color-mix(in srgb, var(--appl-blue) 4%, transparent);
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
  font-weight: 700;
  color: var(--appl-text-3);
  letter-spacing: 0.02em;
}

.reply-context-user {
  min-width: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--appl-blue);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reply-context-quote {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--appl-text-3);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  overflow: hidden;
  word-break: break-word;
  padding-left: 8px;
  border-left: 2px solid var(--appl-hairline);
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
  position: relative;
  transition:
    background-color 0.2s,
    padding 0.2s,
    margin 0.2s;
}

.comment-item-x:hover {
  background: transparent;
}

.comment-item-x.is-highlighted,
.child-reply-item.is-highlighted {
  background: color-mix(in srgb, var(--appl-blue) 6%, transparent);
  border-radius: 12px;
  padding: 16px;
  margin: 0 -8px;
  border: 1px solid color-mix(in srgb, var(--appl-blue) 10%, transparent);
}

.comment-reply-btn-mini {
  background: transparent;
  border: none;
  font-size: 12px;
  color: var(--appl-text-3);
  cursor: pointer;
  padding: 2px 0;
  border-radius: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: color var(--duration-fast, 180ms) ease;
}

.comment-reply-btn-mini:hover {
  background: transparent;
  color: var(--appl-text-1);
}

.child-load-more-btn {
  width: 100%;
  margin-top: 4px;
  border: none;
  border-radius: 10px;
  background: color-mix(in srgb, var(--appl-blue) 8%, transparent);
  color: var(--appl-blue);
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.child-load-more-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* 评论区到底标记（Threads 式） */
.comments-end-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 18px 0 6px;
  color: var(--appl-text-4);
  font-size: 12px;
  letter-spacing: 2px;
}

/* 楼中楼容器：plans/051 §0 —— 二级回复整体 29px 左缩进，不画树状连线 */
.child-replies-wrap {
  position: relative;
  margin: 6px 0 0;
  margin-left: 29px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.child-reply-item {
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 8px 0;
  transition:
    background-color 0.2s,
    opacity var(--duration-tooltip, 200ms) var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    transform var(--duration-tooltip, 200ms) var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}

/* 子回复出现时淡入上浮（2026-10-22）：@starting-style 纯 CSS 进场，
   第 2、3 项各延后 30ms 形成轻微错落；prefers-reduced-motion 下整体关掉。 */
@starting-style {
  .child-reply-item {
    opacity: 0;
    transform: translateY(-4px);
  }
}

.child-reply-item:nth-child(2) {
  transition-delay: 30ms;
}

.child-reply-item:nth-child(3) {
  transition-delay: 60ms;
}

@media (prefers-reduced-motion: reduce) {
  .child-reply-item {
    transition: background-color 0.2s;
  }
  @starting-style {
    .child-reply-item {
      opacity: 1;
      transform: none;
    }
  }
}

.child-reply-item:hover {
  background: transparent;
}

.child-reply-content {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--appl-text-2);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.child-replies-loading {
  font-size: 12px;
  color: var(--appl-text-4);
  padding: 4px 0;
}

.top-load-more-wrap {
  display: flex;
  justify-content: center;
  padding: 8px 0 2px;
}

.load-more-comments-btn {
  border: none;
  border-radius: 10px;
  background: var(--appl-subtle);
  color: var(--appl-text-2);
  font-size: 13px;
  font-weight: 600;
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
  font-weight: 700;
  color: var(--appl-text-1);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.comment-count-badge {
  background: var(--appl-subtle);
  color: var(--appl-text-3);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  transform: translateY(1px);
}

.comment-more-btn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition: background var(--duration-fast, 180ms) ease;
}

.comment-more-btn span {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--appl-text-4);
}

.comment-more-btn:hover {
  background: var(--appl-subtle);
}

/* 时间并入身份行（plans/051 §0）；左操作 / 右删除同一行 */
.comment-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 2px;
}

.comment-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 0;
}

/* 回复数只在「图标+数字」形态下有意义（弹窗态），默认隐藏。
   2026-10-22：竖屏整页保留「回复」文字标签，不该多出一个数字（否则文案变成「回复 3」）。
   弹窗态由 modal-layout.css 的 `.post-detail-page--modal :deep(.comment-reply-count)` 打开。 */
.comment-reply-count {
  display: none;
  font-variant-numeric: tabular-nums;
}

.comment-content {
  font-size: 16px;
  line-height: 1.6;
  color: var(--appl-text-2);
  margin: 4px 0 6px;
}

.comment-text {
  font-size: 16px;
  line-height: 1.6;
  color: var(--appl-text-2);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.no-comments-state {
  text-align: center;
  padding: 80px 0;
  color: var(--appl-text-4);
}

.no-comments-state :deep(.home-cat-mascot) {
  display: flex;
  margin: 0 auto 10px;
}

.no-comments-icon {
  font-size: 48px;
  margin-bottom: 16px;
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

@media (prefers-reduced-motion: reduce) {
  .detail-reply-success-cat-img {
    animation-duration: 0.01s;
  }
}

.detail-skeleton-block {
  position: relative;
  overflow: hidden;
  border-radius: 999px;
  background: var(--appl-subtle);
}

.detail-skeleton-block::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.78), transparent);
  animation: skeletonShimmer 1.35s ease-in-out infinite;
}

[data-theme='dark'] .detail-skeleton-block::after {
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08), transparent);
}

.skeleton-avatar {
  width: 52px;
  height: 52px;
  flex: 0 0 auto;
  border-radius: 18px;
}

.skeleton-avatar.small {
  width: 28px;
  height: 28px;
  border-radius: 50%;
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
  border-bottom: 1px solid var(--appl-hairline);
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
  border-radius: var(--appl-radius-inner);
  background: var(--appl-subtle);
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

  .comment-item-x {
    padding: 16px 0;
  }

  .child-reply-item {
    padding: 9px 0;
  }

  .child-replies-wrap {
    margin-left: 24px;
  }
}

/* 手机竖屏：收窄双层水平内边距把宽度让给正文，并对小字做可读性补偿 */
@media (max-width: 480px) {
  .x-comments-section {
    padding: 12px;
  }

  .comment-text {
    line-height: 1.7;
  }

  .child-reply-content {
    font-size: 15px;
    line-height: 1.6;
  }

  .comment-reply-btn-mini {
    font-size: 13px;
  }
}
</style>
