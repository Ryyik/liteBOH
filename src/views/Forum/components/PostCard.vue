<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { useUserTier } from '@/composables/useUserTier.js';
import { resolveFrameForAuthor } from '@/composables/useAvatarFrame.js';
import { useTierMap } from '@/composables/useTierMap.js';
import {
  Check,
  Heart,
  ImageOff,
  MapPin,
  MessageCircle,
  Reply,
  Share2
} from 'lucide-vue-next';
import { getHomeCatAsset, getHomeCatTypeBySeed } from '@/utils/home-cat-theme.js';
import { formatSmartTime } from '@/utils/time.js';
import { getAvatarUrl } from '@/utils/avatar.js';
import { getImageUrl } from '@/utils/asset-helper.js';

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
  // 评论「先展开后加载」的进行中标记（骨架占位判据）。
  // ⚠️ 必须走 prop：post 是普通对象、不在子组件渲染依赖里，父级 triggerRef
  // 不会让本组件重渲染 → 骨架会在数据到达后残留。
  isRepliesLoading: { type: Boolean, default: false },
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
  'more-replies',
  'load-more-images'
]);

const formatDate = formatSmartTime;

// 转发帖引用框：原帖标题/摘录（原帖数据由 ForumMain ensureQuotedPostsForReposts 回源注入）
const quotedTitle = computed(() => {
  const q = props.post?.quotedPost;
  if (!q) return '';
  return String(q.title || '').trim()
    || String(q.content || '').trim().match(/【(.*?)】/)?.[1]
    || '';
});
const quotedBody = computed(() => {
  const q = props.post?.quotedPost;
  if (!q) return '';
  // 只显示真正的正文：纯标题原帖（body 空、content 只有【标题】行）剥空后
  // 不回退标题——标题行已展示原帖标题，回退会造成同文重复
  const raw = String(q.body || '').trim()
    || String(q.content || '').trim();
  const stripped = raw.replace(/【.*?】\n?/, '').trim();
  if (!stripped) return '';
  return stripped.length > 120 ? `${stripped.slice(0, 120)}…` : stripped;
});

// 官方卡（新闻/活动镜像）：author_id 为空、作者固定「方块之家」，头像用站点 logo
const OFFICIAL_AUTHOR_NAME = '方块之家';
const isOfficialCard = computed(() => {
  const p = props.post || {};
  if (p.post_kind === 'news' || p.post_kind === 'activity') return true;
  return !p.author_id && String(p.author_username || '').trim() === OFFICIAL_AUTHOR_NAME;
});
const authorAvatarSrc = computed(() => (
  isOfficialCard.value
    ? getImageUrl('favicon.webp', { silent: true })
    : getAvatarUrl(props.post?.author_avatar_url, 'sm')
));

// 头像框：官方卡不渲染；作者=自己时走本地佩戴状态，他人走数据字段（Phase 2）
const authorFrame = computed(() => (
  isOfficialCard.value
    ? null
    : resolveFrameForAuthor(props.post?.author_avatar_frame_url, props.post?.author_id)
));
const replyFrameMap = computed(() => {
  const map = new Map();
  for (const reply of (props.post?.replies || [])) {
    map.set(reply.id, resolveFrameForAuthor(reply.author_avatar_frame_url, reply.author_id));
  }
  return map;
});

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const excerptCache = new Map();
const renderSearchExcerpt = (excerpt) => {
  if (excerptCache.has(excerpt)) return excerptCache.get(excerpt);
  const escaped = escapeHtml(excerpt);
  const result = escaped.replace(/\[\[([\s\S]*?)\]\]/g, '<mark>$1</mark>');
  if (excerptCache.size > 500) excerptCache.clear();
  excerptCache.set(excerpt, result);
  return result;
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

// 记录加载失败的图片URL
const failedImageUrls = ref(new Set());

const onImageLoad = (postId, imageUrl) => {
  emit('image-loaded', postId, imageUrl);
};

const onImageError = (postId, imageUrl) => {
  failedImageUrls.value.add(imageUrl);
  emit('image-loaded', postId, imageUrl); // 仍然标记为已加载，隐藏加载动画
};

const isImageFailed = (imageUrl) => failedImageUrls.value.has(imageUrl);

const onLazyImageRef = (el) => {
  if (el) nextTick(() => emit('lazy-image-observe', el));
};

// 横向图片条当前页序（n/N 指示胶囊用）
const stripIndex = ref(0);
// 点击分段横条时若图片尚未补全，先记下目标段，等 allImages 补全后统一滚动
const pendingStripScrollIndex = ref(-1);

// 点击跳转的高亮锁定：平滑滚动期间 scroll 折算与"到底修正"会瞬时覆盖目标段，
// 锁定窗口（≥ smooth 滚动时长）内高亮恒为目标段
let stripLockIndex = -1;
let stripLockTimer = null;
const lockStripIndex = (index) => {
  stripLockIndex = index;
  stripIndex.value = index;
  if (stripLockTimer) clearTimeout(stripLockTimer);
  stripLockTimer = setTimeout(() => {
    stripLockIndex = -1;
    stripLockTimer = null;
  }, 900);
};

// 滚动跟随：更新分段横条页序；滚近右端（或整条即可见全量时）触发补全剩余图片，
// 防抖由宿主 ForumMain 的 in-flight 去重承担
const onStripScroll = (post, event) => {
  const el = event?.target;
  if (!el) return;
  if (stripLockIndex >= 0) return;
  const total = Math.max(1, Number(post?.imageCount || 1));
  if (post?.hasMultipleImages) {
    // 高亮跟随：按格折算（scrollLeft / 单张步长），但滚动上限 = 总宽 - 视口宽，
    // 视口能同时容纳多张时按格折算永远到不了末段——所以"接近最右"时强制点亮末段。
    const shell = el.querySelector('.image-post-thumb-shell');
    const gap = parseFloat(getComputedStyle(el).columnGap) || 10;
    const step = shell ? shell.offsetWidth + gap : 1;
    let nextIndex = Math.round(el.scrollLeft / step);
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 8) {
      nextIndex = total - 1;
    }
    nextIndex = Math.min(Math.max(nextIndex, 0), total - 1);
    if (nextIndex !== stripIndex.value) stripIndex.value = nextIndex;
  }
  if (!post?.hiddenImageCount) return;
  if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 90) {
    emit('load-more-images', post);
  }
};

const scrollToStripIndex = (strip, targetIndex) => {
  // 用目标 shell 的真实 offsetLeft（子项累计布局值），比 i*(w+gap) 推算更准
  const target = strip.children[targetIndex];
  if (!target) return;
  strip.scrollTo({ left: Math.max(0, target.offsetLeft - strip.clientLeft), behavior: 'smooth' });
};

// 点击分段横条跳转到对应图；目标图尚未补全时先触发补全，完成后由 watch 接力滚动
const goToStripIndex = (post, targetIndex, event) => {
  const strip = event?.currentTarget?.closest?.('.image-post-strip-wrap')?.querySelector('.image-post-strip');
  if (!strip) return;
  // 高亮锁定目标段，滚动结束（窗口到期）后恢复折算跟随
  lockStripIndex(targetIndex);
  if (post?.hiddenImageCount > 0) {
    pendingStripScrollIndex.value = targetIndex;
    emit('load-more-images', post);
    return;
  }
  scrollToStripIndex(strip, targetIndex);
};

watch(() => props.post?.allImages?.length, () => {
  const target = pendingStripScrollIndex.value;
  if (target < 0) return;
  pendingStripScrollIndex.value = -1;
  lockStripIndex(target);
  nextTick(() => {
    const strip = props.post ? document.querySelector(`[data-forum-post-id="${CSS.escape(String(props.post.id))}"] .image-post-strip`) : null;
    if (strip) scrollToStripIndex(strip, target);
  });
});

const { fetchUserTier, fetchUserTiersBatch, getNicknameClass } = useUserTier();
const authorTierClass = ref('');
const authorTierCode = ref('');

const collectReplyAuthorIds = (replies) => {
  const ids = new Set();
  (replies || []).forEach((r) => { if (r?.author_id) ids.add(r.author_id); });
  return [...ids];
};

watch(() => props.post?.author_id, async (id) => {
  if (id) {
    const tier = await fetchUserTier(id);
    authorTierClass.value = getNicknameClass(id);
    authorTierCode.value = tier;
  } else {
    authorTierClass.value = '';
    authorTierCode.value = '';
  }
}, { immediate: true });

const replyTierMap = useTierMap(
  () => collectReplyAuthorIds(props.post?.replies),
  getNicknameClass,
  fetchUserTier,
  fetchUserTiersBatch
);

// 引用框随原帖作者订阅层级显示卡色（与帖子卡片 tier 微色调同源）
const quotedTierCode = ref('');
const quotedNickClass = ref('');
watch(() => props.post?.quotedPost?.author_id, async (id) => {
  if (!id) {
    quotedTierCode.value = '';
    quotedNickClass.value = '';
    return;
  }
  const tier = await fetchUserTier(id);
  quotedTierCode.value = ['plus', 'pro', 'max', 'ultra'].includes(tier) ? tier : '';
  quotedNickClass.value = getNicknameClass(id);
}, { immediate: true });
</script>

<template>
  <article class="post-card-v2 glass-panel"
    :data-forum-post-id="post.id"
    :class="{
      'image-post-card-v2': post.hasImages,
      'is-expanded': isExpanded || (activeReplyTarget && activeReplyTarget.postId === post.id),
      'is-new-post': isHighlighted,
      'tier-plus': authorTierCode === 'plus',
      'tier-pro': authorTierCode === 'pro',
      'tier-max': authorTierCode === 'max',
      'tier-ultra': authorTierCode === 'ultra'
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
        <span class="boh-avatar-wrap">
          <div class="post-author-avatar" :class="{ 'is-official': isOfficialCard }">
            <img v-if="authorAvatarSrc" :src="authorAvatarSrc" alt="作者头像"
              class="avatar-image"  loading="lazy" />
            <span v-else>{{ post.author_username ? post.author_username.charAt(0).toUpperCase() : 'U'
            }}</span>
          </div>
          <span v-if="authorFrame" class="boh-avatar-frame"
            :style="{ '--boh-avatar-frame-url': `url(${authorFrame.url})`, '--boh-avatar-frame-scale': String(authorFrame.scale) }"
            aria-hidden="true"></span>
        </span>
        <div class="post-author-info">
          <span class="post-author-v2" :class="authorTierClass"
            @click.stop="isOfficialCard ? undefined : emit('go-to-profile', post.author_username)">@{{
            post.author_username }}</span>
          <span v-if="post.author_is_banned" class="author-banned-pill" title="该账号已被封禁">已封禁</span>
          <span class="post-date-v2">{{ formatDate(post.created_at) }}</span>
        </div>
      </div>
    </div>

    <div class="post-content-v2">
      <h3 class="post-title-v2">
        <span v-if="post.post_kind === 'news'" class="post-kind-badge news">新闻</span>
        <span v-else-if="post.post_kind === 'activity'" class="post-kind-badge activity">活动</span>
        {{ post.displayTitle }}
        <span v-if="post.status === 'limited'" class="post-status-pill limited">仅自己可见</span>
      </h3>
      <div v-if="post.tagLabel || post.location_name" class="post-card-tags">
        <span v-if="post.tagLabel" class="post-card-tag">{{ post.tagLabel }}</span>
        <span v-if="post.location_name" class="post-card-tag location-tag"><MapPin :size="12" :stroke-width="2.5" /> {{ post.location_name }}</span>
      </div>
      <!-- wrap 不滚动：n/N 指示胶囊锚在可视区右上角，不会随内容滚走 -->
      <div v-if="post.hasImages" class="image-post-strip-wrap">
        <!-- 分段横条位置指示：随滑动高亮当前段，点击可跳转到对应图 -->
        <div v-if="post.hasMultipleImages" class="image-strip-dots"
          :aria-label="`图片位置指示，共 ${post.imageCount} 张`">
          <button v-for="dotIndex in post.imageCount" :key="dotIndex" type="button"
            class="image-strip-dot" :class="{ 'is-active': stripIndex === dotIndex - 1 }"
            :aria-label="`查看第 ${dotIndex} 张图片`" :aria-current="stripIndex === dotIndex - 1"
            @click.stop="goToStripIndex(post, dotIndex - 1, $event)"></button>
        </div>
        <span v-if="post.hasMultipleImages" class="image-strip-indicator" aria-hidden="true">
          {{ stripIndex + 1 }} / {{ post.imageCount }}
        </span>
        <div class="image-post-strip"
          :class="{ 'is-single': post.allImages.length === 1 }"
          :aria-label="post.hasMultipleImages ? `多图帖子，共 ${post.imageCount} 张图片，可横向翻动` : '图片帖子'"
          @scroll.passive="onStripScroll(post, $event)">
        <button v-for="(image, index) in post.allImages" :key="image.id || image.url"
          type="button"
          class="image-post-thumb-shell"
          :class="{
            'is-loaded': isForumImageLoaded(post.id, image.url),
            'is-failed': isImageFailed(image.url)
          }"
          :aria-label="`查看${post.displayTitle}第 ${index + 1} 张大图`"
          :disabled="isImageFailed(image.url)"
          @click.stop="emit('open-image-viewer', post, index)"
        >
          <!-- 图片加载失败时显示占位图标 -->
          <div v-if="isImageFailed(image.url)" class="image-post-thumb-failed" aria-label="图片加载失败">
            <ImageOff :size="28" :stroke-width="1.5" aria-hidden="true" />
            <span class="image-post-thumb-failed-text">图片加载失败</span>
          </div>
          <img
            v-if="image.lqipUrl && !isImageFailed(image.url)"
            :src="image.lqipUrl"
            :alt="`${post.displayTitle} 图片 ${index + 1}`"
            class="image-post-thumb-lqip"
            aria-hidden="true"
            decoding="async"  loading="lazy" />
          <img
            v-if="image.eager && !isImageFailed(image.url)"
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
            @error="onImageError(post.id, image.url)" />
          <img
            v-else-if="!isImageFailed(image.url)"
            :data-lazy-src="image.url"
            :data-lazy-srcset="image.srcset || ''"
            sizes="(max-width: 420px) 160px, (max-width: 768px) 300px, 360px"
            :alt="`${post.displayTitle} 图片 ${index + 1}`"
            loading="lazy"
            decoding="async" class="image-post-thumb"
            :class="{ 'is-loaded': isForumImageLoaded(post.id, image.url) }"
            :width="image.width || undefined"
            :height="image.height || undefined"
            :ref="(el) => onLazyImageRef(el)"
            @load="onImageLoad(post.id, image.url)"
            @error="onImageError(post.id, image.url)" />
        </button>
        <!-- 末尾"+N 张"占位卡：列表数据尚未含全部图片时展示，滚近自动补全 -->
        <div v-if="post.hiddenImageCount > 0" class="image-post-strip-more" aria-hidden="true">
          <span class="image-post-strip-more-num">+{{ post.hiddenImageCount }}</span>
          <span>张</span>
        </div>
        </div>
      </div>
      <p v-if="searchKeyword && post.search_excerpt" class="search-highlight-snippet"
        v-html="renderSearchExcerpt(post.search_excerpt)">
      </p>
      <p class="post-text-v2" :class="{ 'is-overflowing': post.isBodyOverflowLikely }">{{ post.displayBody }}</p>
      <!-- 转发帖引用框：转发文字在上，原帖信息框在下，点击进原帖详情 -->
      <button v-if="post.quotedPost" type="button" class="quoted-post-box"
        :class="[quotedTierCode ? `tier-${quotedTierCode}` : '']"
        aria-label="查看被转发的原帖"
        @click.stop="emit('click', post.quotedPost.id)">
        <span class="quoted-post-author" :class="quotedNickClass">@{{ post.quotedPost.author_username || '方块之家' }}</span>
        <span v-if="quotedTitle" class="quoted-post-title">{{ quotedTitle }}</span>
        <span v-if="quotedBody" class="quoted-post-body">{{ quotedBody }}</span>
      </button>
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
            <span class="boh-avatar-wrap">
              <div class="reply-avatar">
                <img v-if="reply.author_avatar_url" :src="getAvatarUrl(reply.author_avatar_url, 'xs')" alt="回复者头像"
                  class="avatar-image"  loading="lazy" />
                <span v-else>{{ reply.author_username ? reply.author_username.charAt(0).toUpperCase() : 'U'
                }}</span>
              </div>
              <span v-if="replyFrameMap.get(reply.id)" class="boh-avatar-frame"
                :style="{ '--boh-avatar-frame-url': `url(${replyFrameMap.get(reply.id).url})`, '--boh-avatar-frame-scale': String(replyFrameMap.get(reply.id).scale) }"
                aria-hidden="true"></span>
            </span>
            <div class="reply-content-wrapper">
              <div class="reply-user-info">
                <span class="reply-author-v2" :class="replyTierMap[reply.author_id] || ''" @click="emit('go-to-profile', reply.author_username)">{{
                  reply.author_username }}</span>
                <span v-if="reply.author_is_banned" class="author-banned-pill" title="该账号已被封禁">已封禁</span>
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
      <!-- 骨架占位：先展开后加载期间的即时反馈（数据回来即被上面的真实列表替换） -->
      <div v-else-if="isExpanded && isRepliesLoading"
        class="replies-list replies-skeleton" @click.stop aria-hidden="true">
        <div v-for="n in 2" :key="n" class="reply-skeleton-item">
          <span class="reply-skeleton-avatar"></span>
          <span class="reply-skeleton-body">
            <span class="reply-skeleton-line is-short"></span>
            <span class="reply-skeleton-line is-long"></span>
          </span>
        </div>
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

.author-banned-pill {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  color: #fff;
  background: linear-gradient(135deg, #ef4444, #b91c1c);
  border-radius: 6px;
  margin-left: 6px;
  letter-spacing: 0.2px;
  vertical-align: middle;
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
  border-radius: 50%;
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

/* 评论区骨架占位（先展开后加载）：与列表同构，避免展开瞬间高度塌成 0。
   中性灰 + alpha，浅色/深色主题都读得清；自身类名自成一套，不依赖 drawers-skeletons.css。 */
.replies-skeleton {
  /* 盒子（margin/padding/边框/圆角）复用 .replies-list，骨架与真实列表同形 */
  display: block;
}

.reply-skeleton-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0;
}

.reply-skeleton-item + .reply-skeleton-item {
  border-top: 1px solid rgba(127, 140, 160, 0.14);
}

.reply-skeleton-avatar {
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(127, 140, 160, 0.18);
}

.reply-skeleton-body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
  min-width: 0;
}

.reply-skeleton-line {
  display: block;
  height: 10px;
  border-radius: 5px;
  background: rgba(127, 140, 160, 0.18);
}

.reply-skeleton-line.is-short {
  width: 32%;
}

.reply-skeleton-line.is-long {
  width: 78%;
}

@media (prefers-reduced-motion: no-preference) {
  .reply-skeleton-avatar,
  .reply-skeleton-line {
    animation: replySkeletonPulse 1.2s ease-in-out infinite;
  }
}

@keyframes replySkeletonPulse {
  0%, 100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}

@media (max-width: 768px) {
  .post-author-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
  }
}
</style>

<style scoped>
@import '../styles/base.css';
@import '../styles/feed.css';
@import '../styles/replies-responsive.css';
</style>
