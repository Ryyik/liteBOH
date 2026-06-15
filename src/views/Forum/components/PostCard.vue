<script setup>
import { nextTick } from 'vue';
import {
  Check,
  Heart,
  MessageCircle,
  Reply,
  Share2
} from 'lucide-vue-next';
import { getHomeCatAsset, getHomeCatTypeBySeed } from '@/utils/home-cat-theme.js';
import { formatSmartTime } from '@/utils/time.js';
import DOMPurify from '@/utils/dompurify.js';
import { FORUM_LIST_PREVIEW_IMAGE_MAX_COUNT } from '../forum-config.js';

const props = defineProps({
  post: { type: Object, required: true },
  index: { type: Number, required: true },
  isHomeCatActive: { type: Boolean, default: false },
  isExpanded: { type: Boolean, default: false },
  activeReplyTarget: { type: Object, default: null },
  replyContent: { type: String, default: '' },
  isReplySubmitting: { type: Boolean, default: false },
  replyCooldownSeconds: { type: Number, default: 0 },
  replySubmitLabel: { type: String, default: '回复' },
  isLikeSubmitting: { type: Boolean, default: false },
  isLikedPulsing: { type: Boolean, default: false },
  isShareCopied: { type: Boolean, default: false },
  isHighlighted: { type: Boolean, default: false },
  isReplySuccess: { type: Boolean, default: false },
  searchKeyword: { type: String, default: '' },
  isLoggedIn: { type: Boolean, default: false },
  userInfo: { type: Object, default: () => ({}) },
  loadedImageKeys: { type: Set, default: () => new Set() }
});

const emit = defineEmits([
  'click',
  'go-to-profile',
  'toggle-like',
  'toggle-replies',
  'toggle-reply-input',
  'share',
  'submit-reply',
  'delete-comment',
  'open-image-viewer',
  'update:reply-content',
  'clear-reply-target',
  'cancel-reply',
  'image-loaded',
  'lazy-image-observe',
  'more-replies'
]);

const formatDate = formatSmartTime;

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const renderSearchExcerpt = (excerpt) => {
  const escaped = escapeHtml(excerpt);
  const withMarks = escaped.replace(/\[\[([\s\S]*?)\]\]/g, '<mark>$1</mark>');
  return DOMPurify.sanitize(withMarks, {
    ALLOWED_TAGS: ['mark'],
    ALLOWED_ATTR: []
  });
};

const getPostCardCatType = (index, post) => {
  if (post?.isLiked || Number(post?.like_count || 0) >= 8) return 'like';
  return ['decorAlt', 'decor', 'theme', 'cardExtra', 'mobileGap'][Number(index) % 5];
};
const getPostCardCatVariant = (index) => `cat-variant-${Number(index) % 4}`;
const getPostCardCatSeed = (post, index, suffix = 'card') => `${post?.id || index}:${suffix}`;
const getPostCardCatSrc = (post, index) => getHomeCatAsset(getPostCardCatType(index, post));
const getPostBackgroundCatSrc = (post, index) => {
  const type = getHomeCatTypeBySeed(getPostCardCatSeed(post, index, 'bg'), 'background');
  return getHomeCatAsset(type);
};
const shouldShowPostBackgroundCat = (post, index) => {
  const raw = String(post?.id || index || '');
  let sum = 0;
  for (let i = 0; i < raw.length; i += 1) sum += raw.charCodeAt(i);
  return sum % 3 === 1;
};

const shouldShowMoreRepliesLink = (post) => {
  const previewCount = Array.isArray(post?.replies) ? post.replies.length : 0;
  return Boolean(post?.replies_has_more || Number(post?.comment_count || 0) > previewCount);
};

const getForumImageKey = (postId, imageUrl) => `${String(postId || '').trim()}:${String(imageUrl || '').trim()}`;
const isForumImageLoaded = (postId, imageUrl) => props.loadedImageKeys.has(getForumImageKey(postId, imageUrl));

const onImageLoad = (postId, imageUrl) => {
  emit('image-loaded', postId, imageUrl);
};

const onLazyImageRef = (el) => {
  if (el) nextTick(() => emit('lazy-image-observe', el));
};
</script>

<template>
  <article class="post-card-v2 glass-panel"
    :data-forum-post-id="post.id"
    :class="{
      'image-post-card-v2': post.hasImages,
      'is-expanded': isExpanded || (activeReplyTarget && activeReplyTarget.postId === post.id),
      'is-new-post': isHighlighted
    }"
    :style="{ '--post-appear-delay': `${Math.min(index, 8) * 45}ms` }"
    @click="emit('click', post.id)">
    <figure v-if="isHomeCatActive" class="post-card-theme-cat"
      :class="getPostCardCatVariant(index)" aria-hidden="true">
      <img :src="getPostCardCatSrc(post, index)" alt="" draggable="false"  loading="lazy" />
    </figure>
    <figure v-if="isHomeCatActive && shouldShowPostBackgroundCat(post, index)"
      class="post-card-background-cat" aria-hidden="true">
      <img :src="getPostBackgroundCatSrc(post, index)" alt="" draggable="false"  loading="lazy" />
    </figure>
    <div class="post-header-v2">
      <div class="post-author-section">
        <div class="post-author-avatar">
          <img v-if="post.author_avatar_url" :src="post.author_avatar_url" alt="作者头像"
            class="avatar-image"  loading="lazy" />
          <span v-else>{{ post.author_username ? post.author_username.charAt(0).toUpperCase() : 'U'
          }}</span>
        </div>
        <div class="post-author-info">
          <span class="post-author-v2" @click.stop="emit('go-to-profile', post.author_username)">@{{
            post.author_username }}</span>
          <span class="post-date-v2">{{ formatDate(post.created_at) }}</span>
        </div>
      </div>
    </div>

    <div class="post-content-v2">
      <h3 class="post-title-v2">
        {{ post.displayTitle }}
        <span v-if="post.status === 'limited'" class="post-status-pill limited">仅自己可见</span>
      </h3>
      <div v-if="post.tagLabel" class="post-card-tags">
        <span class="post-card-tag">{{ post.tagLabel }}</span>
      </div>
      <div v-if="post.hasImages" class="image-post-thumb-grid"
        :class="[
          `count-${Math.min(post.previewImages.length, FORUM_LIST_PREVIEW_IMAGE_MAX_COUNT)}`,
          { 'is-multi-image': post.hasMultipleImages }
        ]"
        :aria-label="post.hasMultipleImages ? `多图帖子，共 ${post.imageCount} 张图片` : '图片帖子'">
        <button v-for="(image, index) in post.previewImages.slice(0, FORUM_LIST_PREVIEW_IMAGE_MAX_COUNT)" :key="image.id || image.url"
          type="button"
          class="image-post-thumb-shell"
          :class="{ 'is-loaded': isForumImageLoaded(post.id, image.url) }"
          :aria-label="`查看${post.displayTitle}第 ${index + 1} 张大图`"
          @click.stop="emit('open-image-viewer', post, index)"
        >
          <img
            v-if="image.lqipUrl"
            :src="image.lqipUrl"
            :alt="`${post.displayTitle} 图片 ${index + 1}`"
            class="image-post-thumb-lqip"
            aria-hidden="true"
            decoding="async"  loading="lazy" />
          <img
            v-if="image.eager"
            :src="image.url"
            :srcset="image.srcset || undefined"
            sizes="(max-width: 420px) 160px, (max-width: 768px) 300px, 360px"
            :alt="`${post.displayTitle} 图片 ${index + 1}`"
            loading="eager"
            fetchpriority="high"
            decoding="async" class="image-post-thumb"
            :class="{ 'is-loaded': isForumImageLoaded(post.id, image.url) }"
            :width="image.width || undefined"
            :height="image.height || undefined"
            @load="onImageLoad(post.id, image.url)"
            @error="onImageLoad(post.id, image.url)" />
          <img
            v-else
            :data-lazy-src="image.url"
            :data-lazy-srcset="image.srcset || ''"
            sizes="(max-width: 420px) 160px, (max-width: 768px) 300px, 360px"
            :alt="`${post.displayTitle} 图片 ${index + 1}`"
            loading="lazy"
            fetchpriority="low"
            decoding="async" class="image-post-thumb"
            :class="{ 'is-loaded': isForumImageLoaded(post.id, image.url) }"
            :width="image.width || undefined"
            :height="image.height || undefined"
            :ref="(el) => onLazyImageRef(el)"
            @load="onImageLoad(post.id, image.url)"
            @error="onImageLoad(post.id, image.url)" />
        </button>
        <span v-if="post.hasMultipleImages" class="image-post-count-badge" aria-hidden="true">
          多图 {{ post.imageCount }}
        </span>
      </div>
      <p v-if="searchKeyword && post.search_excerpt" class="search-highlight-snippet"
        v-html="renderSearchExcerpt(post.search_excerpt)">
      </p>
      <p class="post-text-v2" :class="{ 'is-overflowing': post.isBodyOverflowLikely }">{{ post.displayBody }}</p>
    </div>

    <!-- 操作栏 -->
    <div class="post-actions-v2" @click.stop>
      <div class="actions-left-v2">
        <button class="action-item-v2 like-btn-v2" @click="emit('toggle-like', post)"
          :class="{ 'is-liked': post.isLiked, 'is-pulsing': isLikedPulsing }" :disabled="isLikeSubmitting">
          <img v-if="isHomeCatActive && isLikedPulsing" class="like-pop-cat-img"
            :src="getHomeCatAsset('like')" alt="" draggable="false"  loading="lazy" />
          <Heart class="action-svg-v2" :size="17" :stroke-width="1.8"
            :fill="post.isLiked ? 'currentColor' : 'none'" aria-hidden="true" />
          <span class="action-count-v2">{{ post.like_count || 0 }}</span>
        </button>

        <button class="action-item-v2 replies-btn-v2" @click="emit('toggle-replies', post)" aria-label="查看评论">
          <MessageCircle class="action-svg-v2" :size="17" :stroke-width="1.8" aria-hidden="true" />
          <span class="action-count-v2">{{ post.comment_count || 0 }}</span>
        </button>
      </div>

      <div class="actions-right-v2">
        <button class="action-item-v2 icon-only-action-v2 reply-btn-v2" @click="emit('toggle-reply-input', post.id)"
          aria-label="回复" title="回复">
          <Reply class="action-svg-v2" :size="17" :stroke-width="1.8" aria-hidden="true" />
        </button>
        <button class="action-item-v2 icon-only-action-v2 share-btn-v2"
          :class="{ 'is-copy-success': isShareCopied }"
          :aria-label="isShareCopied ? '链接已复制' : '分享'"
          :title="isShareCopied ? '已复制' : '分享'"
          @click="emit('share', post)">
          <Check v-if="isShareCopied" class="action-svg-v2" :size="17" :stroke-width="2"
            aria-hidden="true" />
          <Share2 v-else class="action-svg-v2" :size="17" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </div>
    </div>

    <!-- 回复输入 (支持多级回复) -->
    <transition name="fade-slide">
      <div v-if="activeReplyTarget && activeReplyTarget.postId === post.id" class="reply-input-section-v2"
        @click.stop>
        <img v-if="isHomeCatActive && isReplySuccess"
          class="reply-success-pop-cat-img" :src="getHomeCatAsset('success')" alt="" draggable="false"  loading="lazy" />
        <div v-if="activeReplyTarget.username" class="reply-target-hint">
          正在回复 <span class="target-user">@{{ activeReplyTarget.username }}</span>
          <button class="clear-target-btn"
            @click="emit('clear-reply-target', post.id)">×</button>
        </div>
        <textarea :value="replyContent"
          @input="emit('update:reply-content', $event.target.value)"
          :placeholder="activeReplyTarget.username ? `回复 @${activeReplyTarget.username}...` : '写下你的回复...'"
          class="reply-textarea-v2" rows="2"></textarea>
        <div class="reply-actions-v2">
          <button class="cancel-reply-btn-v2" @click="emit('cancel-reply')">取消</button>
          <button class="submit-reply-btn-v2" @click="emit('submit-reply', post)"
            :disabled="isReplySubmitting || replyCooldownSeconds > 0">
            {{ isReplySubmitting ? '发送中...' : replySubmitLabel }}
          </button>
        </div>
      </div>
    </transition>

    <!-- 回复列表 (优化多级显示) -->
    <transition name="expand-replies">
      <div v-if="isExpanded && post.replies && post.replies.length > 0"
        class="replies-list" @click.stop>
        <div v-for="reply in post.replies" :key="reply.id" class="reply-item-v2">
          <div class="reply-header-v2">
            <div class="reply-avatar">
              <img v-if="reply.author_avatar_url" :src="reply.author_avatar_url" alt="回复者头像"
                class="avatar-image"  loading="lazy" />
              <span v-else>{{ reply.author_username ? reply.author_username.charAt(0).toUpperCase() : 'U'
              }}</span>
            </div>
            <div class="reply-content-wrapper">
              <div class="reply-user-info">
                <span class="reply-author-v2" @click="emit('go-to-profile', reply.author_username)">{{
                  reply.author_username }}</span>
                <span v-if="reply.reply_to_username" class="reply-to-tag">
                  回复 <span class="target-name">@{{ reply.reply_to_username }}</span>
                </span>
              </div>
              <p class="reply-text-v2">{{ reply.content }}</p>
              <div class="reply-meta-v2">
                <span class="reply-date-v2">{{ formatDate(reply.created_at) }}</span>
                <button class="reply-action-btn"
                  @click="emit('toggle-reply-input', post.id, reply.parent_id || reply.id, reply.author_username, reply.content)">回复</button>
                <button v-if="isLoggedIn && (reply.author_id === userInfo.id || userInfo.role === 'admin')"
                  class="delete-comment-btn-v2" @click="emit('delete-comment', reply, post)">×</button>
              </div>
            </div>
          </div>
        </div>
        <button v-if="shouldShowMoreRepliesLink(post)" class="more-replies-link-v2"
          @click="emit('more-replies', post.id)">
          查看更多回复
        </button>
      </div>
    </transition>
  </article>
</template>

<style scoped>
.post-author-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.post-author-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: #1d1d1f;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 18px;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
  overflow: hidden;
  flex-shrink: 0;
}

.reply-avatar {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: #1d1d1f;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 15px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  flex-shrink: 0;
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

@media (max-width: 768px) {
  .post-author-avatar {
    width: 40px;
    height: 40px;
    border-radius: 12px;
  }
}
</style>

<style scoped>
@import '../styles/base.css';
@import '../styles/feed.css';
@import '../styles/replies-responsive.css';
</style>
