<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useUserTier } from '@/composables/useUserTier.js';
import { useTierMap } from '@/composables/useTierMap.js';
import { ImageOff, MessageCircle } from 'lucide-vue-next';
import { getHomeCatAsset } from '@/utils/home-cat-theme.js';
import {
  getPostBackgroundCatSrc,
  getPostCardCatSrc,
  getPostCardCatVariant,
  shouldShowPostBackgroundCat,
} from '@/utils/home-cat-post.js';
import { formatSmartTime } from '@/utils/time.js';
import { getAvatarUrl } from '@/utils/avatar.js';
import { getImageUrl } from '@/utils/asset-helper.js';
// getForumImageKey 与 ForumMain 的「写入标记」侧共用同一实现 —— 两边漂移会让
// 图片已加载态静默失效，故收敛到 forum-helpers.js（见该函数注释）。
import { getForumImageKey, isOfficialForumPost } from '@/utils/forum-helpers.js';
// 展开/收起时长按**实测高度**算（真源见 utils/motion.js，plans/035 §4 L4）
import { collapseDuration, expandDuration } from '@/utils/motion.js';
import ReplyIdentityRow from '@/components/forum/ReplyIdentityRow.vue';
import ReplyComposer from '@/components/forum/ReplyComposer.vue';
import LikeButton from '@/components/forum/LikeButton.vue';
import CardActionsMenu from '@/components/forum/CardActionsMenu.vue';

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
  loadedImageKeys: { type: Set, default: () => new Set() },
});

const emit = defineEmits([
  'click',
  'go-to-profile',
  'toggle-like',
  'toggle-replies',
  'toggle-reply-input',
  'share',
  'copy-link',
  'report-post',
  'delete-post',
  'submit-reply',
  'delete-comment',
  'open-image-viewer',
  'update:reply-content',
  'clear-reply-target',
  'cancel-reply',
  'need-login',
  'image-loaded',
  'lazy-image-observe',
  'load-more-images',
]);

const formatDate = formatSmartTime;

// 回复框「多字扩展」由 ReplyComposer 内部接线（useAutoGrowTextarea getter 契约），
// 本组件只在展开动作后负责把焦点交给它（「评论」按钮 = 展开 + 聚焦，plans/051 拍板 3）。
const composerRef = ref(null);

/* ── 展开动效：`:css="false"` + WAAPI（plans/035 §4 L4）──────────────────
   评论区展开时长按**实测高度**算（短评 240ms / 长评 528ms），类名只能给固定值。
   必须能**放行**：动画被 cancel（用户连点、元素被替换、页面切走）时若
   不调用 done()，Vue 会把这次过渡挂住，元素永远停在 enter 态（表现为「点不开」）。

   什么时候该播：只认「挂载之后状态被翻成展开」（2026-10-31 实测证伪了
   「setup 时的 props.isExpanded」判据：两个 <transition> 都没有 appear，初始
   渲染时 v-if 已为真 Vue 根本不调 @enter）。`post.replies` 异步到达引起的
   enter 也必须放行（那是数据到达，不是用户动作）。 */
const EASE_SOFT = 'cubic-bezier(0.32, 0.72, 0, 1)';

const settleOnce = () => {
  let settled = false;
  return (fn) => {
    if (settled) return;
    settled = true;
    fn();
  };
};

let animateRepliesEnter = false;

watch(
  () => Boolean(props.isExpanded),
  (next, prev) => {
    if (next && !prev) {
      animateRepliesEnter = true;
      // 拍板 3：icon 回复按钮已删，「评论」按钮承担展开 + 聚焦输入框。
      // focus 走 exposed 方法而不是 ReplyComposer 的 autoFocus prop ——
      // 虚拟列表滚出再滚回时卡片重挂载（isExpanded 仍为 true）不该弹键盘。
      nextTick(() => composerRef.value?.focus());
    }
  },
);

const playOnce = (el, keyframes, options, onSettled) => {
  const finish = settleOnce();
  const end = () => finish(onSettled);
  try {
    const anim = el.animate(keyframes, options);
    anim.finished.then(end, end);
  } catch {
    end();
    return;
  }
  // 兜底：finished 在个别环境下不触发时不至于把过渡挂死
  window.setTimeout(end, Number(options.duration || 0) + 120);
};

const onRepliesEnter = (el, done) => {
  if (!animateRepliesEnter) {
    done();
    return;
  }
  animateRepliesEnter = false;
  const height = Math.max(0, el.scrollHeight);
  el.style.overflow = 'hidden';
  playOnce(
    el,
    [
      { maxHeight: '0px', opacity: 0 },
      { maxHeight: `${height}px`, opacity: 1 },
    ],
    { duration: expandDuration(height), easing: EASE_SOFT },
    () => {
      // 收尾必须**无条件**清掉内联上限：内容一旦变高就会被永久裁在旧高度
      el.style.overflow = '';
      el.style.maxHeight = '';
      done();
    },
  );
};

const onRepliesLeave = (el, done) => {
  const height = Math.max(0, el.getBoundingClientRect().height);
  el.style.overflow = 'hidden';
  playOnce(
    el,
    [
      { maxHeight: `${height}px`, opacity: 1 },
      { maxHeight: '0px', opacity: 0 },
    ],
    { duration: collapseDuration(height), easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    done,
  );
};

/* ── 长帖省略号判定（2026-10-17 全面审查 P2-4，plans/051 拍板 9 原样保留）──────
   判定必须走 **scrollHeight > clientHeight**（与 CSS max-height 同一条约束源），
   别改回 ForumMain 的字数估算 —— 两套判据不同源会静默切字。
   实现：ResizeObserver 管「容器变宽/变窄、展开收起」这些盒子尺寸变化；
   watch 管「内容变了但盒子没变」的场景（RO 对 max-height 钳住的元素不触发）。
   `+1` 容差吸收亚像素舍入（zoom/缩放下 scrollHeight 可能比 clientHeight 大 1px 却没有真溢出）。 */
const bodyTextEl = ref(null);
const bodyOverflowing = ref(false);
/* 最后一行「实际文字的右端」距容器左边的像素值（CSS 变量喂给省略号伪元素）。
   0 表示没算出来 —— 此时省略号退回右下角（旧行为，不会再出错）。 */
const bodyEllipsisLeft = ref(0);
let bodyResizeObserver = null;

/**
 * 量两件事：① 是否真的溢出（scrollHeight 比 clientHeight 大）；
 * ② 溢出时**最后一行文字停在哪个 x 坐标**。
 *
 * 为什么需要 ②（2026-11-26 用户口径 18:47「省略号跟在正文截断处后面」）：
 * 旧做法把 `...` 绝对定位在 `right: 0`，于是它永远贴在行尾最右边，
 * 而正文在两三成位置就断掉了 —— 中间一长条空白，看着像省略号「飘」在那儿。
 *
 * 算法：拿第 4 行（被钳住的最后一行）的行首/行尾字符做 Range 测量。
 * 具体做法是把可见区域的**最后一个字符节点**找出来 —— 用 Range 逐行探测太贵，
 * 这里用「容器底部上方 1px 处的文本位置」近似：从末尾往前逐段测 Range 的
 * rect.bottom，找到第一段底部 ≤ 可见底线（clientHeight）的位置，取它右侧最远点。
 */
const measureBodyOverflow = () => {
  const el = bodyTextEl.value;
  if (!el) {
    bodyOverflowing.value = false;
    bodyEllipsisLeft.value = 0;
    return;
  }
  const overflowing = el.scrollHeight > el.clientHeight + 1;
  bodyOverflowing.value = overflowing;
  if (!overflowing) {
    bodyEllipsisLeft.value = 0;
    return;
  }

  const clipBottom = el.clientHeight;
  const textNode = el.firstChild;
  if (!textNode || textNode.nodeType !== 3) {
    bodyEllipsisLeft.value = 0;
    return;
  }

  const text = textNode.textContent || '';
  const range = document.createRange();
  const box = el.getBoundingClientRect();
  const leftEdge = box.left;
  /* 可见区的**绝对**底边（视口坐标）：box.top 是元素顶边，clientHeight 是钳住后的
     可见高度，两者相加才是第 4 行的底部。rects 也是视口坐标 ⇒ 同系可比。 */
  const visibleBottom = box.top + clipBottom;

  /* 从末尾往前扫，找到「最后一段仍落在可见区内」的文字，取它最右端。
     ⚠️ 两个坑（2026-11-26 实测）：
       ① 不能用「整段 rects 全部在界内」判 —— pre-wrap 下换行会把一段拆成多个
          rect，只要有一个跨行就越界，整段被误判，结果永远测不出（第一版 hasAnchor 恒 false）；
       ② 不能取「所有可见 rect 的最右端」—— 长段落上方行尾可能比末行更靠右，
          那样会得到 384/400 这种「贴着行尾」的值，等于没修。
     所以：**从末尾往前找第一个可见 rect 就停**，那就是末行真正断掉的位置。 */
  const STEP = 4;
  let anchor = 0;
  for (let end = text.length; end > 0; end -= STEP) {
    const start = Math.max(0, end - STEP);
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
    const rects = range.getClientRects();
    if (!rects.length) continue;
    /* 这一段里最靠下的 rect 就是最接近末行的；它若在可见区内，即末行 */
    let lowest = rects[0];
    for (const rect of rects) {
      if (rect.bottom > lowest.bottom) lowest = rect;
    }
    if (lowest.bottom <= visibleBottom + 1 && lowest.right > 0) {
      anchor = lowest.right;
      break;
    }
  }

  bodyEllipsisLeft.value = anchor > 0 ? Math.round(anchor - leftEdge) : 0;
};

/** 省略号定位：优先贴文字末端（+ 留一点与省略号的呼吸缝），算不出则退回右下角 */
const bodyEllipsisStyle = computed(() => {
  const left = bodyEllipsisLeft.value;
  if (!left) return {};
  return { '--ellipsis-left': `${left}px` };
});

watch(
  () => [props.post?.id, props.post?.displayBody],
  () => nextTick(measureBodyOverflow),
  { immediate: true },
);

onMounted(() => {
  if (typeof ResizeObserver === 'function' && bodyTextEl.value) {
    bodyResizeObserver = new ResizeObserver(measureBodyOverflow);
    bodyResizeObserver.observe(bodyTextEl.value);
  }
  nextTick(measureBodyOverflow);
});

onBeforeUnmount(() => {
  bodyResizeObserver?.disconnect();
  bodyResizeObserver = null;
});

// 转发帖引用框：原帖标题/摘录（原帖数据由 ForumMain ensureQuotedPostsForReposts 回源注入）
const quotedTitle = computed(() => {
  const q = props.post?.quotedPost;
  if (!q) return '';
  return (
    String(q.title || '').trim() ||
    String(q.content || '')
      .trim()
      .match(/【(.*?)】/)?.[1] ||
    ''
  );
});
const quotedBody = computed(() => {
  const q = props.post?.quotedPost;
  if (!q) return '';
  // 只显示真正的正文：纯标题原帖（body 空、content 只有【标题】行）剥空后
  // 不回退标题——标题行已展示原帖标题，回退会造成同文重复
  const raw = String(q.body || '').trim() || String(q.content || '').trim();
  const stripped = raw.replace(/【.*?】\n?/, '').trim();
  if (!stripped) return '';
  return stripped.length > 120 ? `${stripped.slice(0, 120)}…` : stripped;
});

// 官方卡判定走 forum-helpers 唯一真源（plans/051 批 2 抽出）
const isOfficialCard = computed(() => isOfficialForumPost(props.post));
const authorAvatarSrc = computed(() =>
  isOfficialCard.value
    ? getImageUrl('favicon.webp', { silent: true })
    : getAvatarUrl(props.post?.author_avatar_url, 'sm'),
);

const escapeHtml = (value) =>
  String(value || '')
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

// 卡片预览不再就地分页（plans/051 拍板 1）：超过预览量就给「查看全部」跳详情
const shouldShowMoreRepliesLink = (post) => {
  const previewCount = Array.isArray(post?.replies) ? post.replies.length : 0;
  return Boolean(post?.replies_has_more || Number(post?.comment_count || 0) > previewCount);
};

const isForumImageLoaded = (postId, imageUrl) =>
  props.loadedImageKeys.has(getForumImageKey(postId, imageUrl));

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

// 横向图片条当前页序（n/N 只读指示胶囊，plans/051 拍板 8：跳段移交 ForumImageViewer）
const stripIndex = ref(0);

// 滚动跟随：折算当前段点亮胶囊；滚近右端（或整条即可见全量时）触发补全剩余图片。
// ⚠️ 补全链是红线（plans/051 §4-5）：hiddenImageCount → load-more-images 一段不能断。
const onStripScroll = (post, event) => {
  const el = event?.target;
  if (!el) return;
  const total = Math.max(1, Number(post?.imageCount || 1));
  if (post?.hasMultipleImages) {
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

const { fetchUserTier, fetchUserTiersBatch, getNicknameClass } = useUserTier();
const authorTierClass = ref('');
const authorTierCode = ref('');

const collectReplyAuthorIds = (replies) => {
  const ids = new Set();
  (replies || []).forEach((r) => {
    if (r?.author_id) ids.add(r.author_id);
  });
  return [...ids];
};

watch(
  () => props.post?.author_id,
  async (id) => {
    if (id) {
      const tier = await fetchUserTier(id);
      authorTierClass.value = getNicknameClass(id);
      // plans/051 拍板 6：卡色 Ultra 独占，pro/max 不再上卡
      authorTierCode.value = tier === 'ultra' ? 'ultra' : '';
    } else {
      authorTierClass.value = '';
      authorTierCode.value = '';
    }
  },
  { immediate: true },
);

const replyTierMap = useTierMap(
  () => collectReplyAuthorIds(props.post?.replies),
  getNicknameClass,
  fetchUserTier,
  fetchUserTiersBatch,
);

// 引用框随原帖作者订阅层级显示卡色 —— 同拍板 6，只认 Ultra
const quotedTierCode = ref('');
const quotedNickClass = ref('');
watch(
  () => props.post?.quotedPost?.author_id,
  async (id) => {
    if (!id) {
      quotedTierCode.value = '';
      quotedNickClass.value = '';
      return;
    }
    const tier = await fetchUserTier(id);
    quotedTierCode.value = tier === 'ultra' ? 'ultra' : '';
    quotedNickClass.value = getNicknameClass(id);
  },
  { immediate: true },
);

/* ── 卡片 ⋯ 菜单（plans/051 拍板 7：低频操作收口）────────────────────── */
const canManagePost = computed(
  () =>
    props.isLoggedIn &&
    (String(props.post?.author_id || '') === String(props.userInfo?.id || '') ||
      props.userInfo?.role === 'admin'),
);
const canReportPost = computed(
  () =>
    props.isLoggedIn &&
    !!props.post?.author_id &&
    String(props.post.author_id) !== String(props.userInfo?.id || ''),
);
const actionMenuItems = computed(() => {
  const items = [
    { key: 'share', label: '分享…' },
    { key: 'copy-link', label: '复制链接' },
  ];
  if (canReportPost.value) items.push({ key: 'report', label: '举报' });
  if (canManagePost.value) items.push({ key: 'delete', label: '删除', danger: true });
  return items;
});

const onMenuSelect = (key) => {
  const post = props.post;
  if (!post) return;
  if (key === 'share') emit('share', post);
  else if (key === 'copy-link') emit('copy-link', post);
  else if (key === 'report') emit('report-post', post);
  else if (key === 'delete') emit('delete-post', post);
};

/* ── 卡内回复输入（ReplyComposer 唯一真源）────────────────────────────── */
// 目标只来自评论区行内的「回复」按钮（父级 activeReplyTarget，postId 匹配本卡才生效）
const composerTarget = computed(() => {
  const t = props.activeReplyTarget;
  if (t && String(t.postId || '') === String(props.post.id || '')) return t;
  return null;
});

const composerPlaceholder = computed(() =>
  composerTarget.value?.username ? `回复 @${composerTarget.value.username}…` : '写下你的回复…',
);

const onSubmitReply = () => {
  emit('submit-reply', props.post);
};

const onClearReplyTarget = () => {
  emit('clear-reply-target', props.post.id);
};

/* ── 删除入口（用户口径 2026-11-26）：不直接显示 ×，点击自己发的评论才浮出「删除」──
   只有本人 / admin 的评论可点出操作态；再点一次或点别的评论即收起。 */
const ownReplyActionsId = ref(null);

const isOwnReply = (reply) =>
  props.isLoggedIn &&
  (String(reply?.author_id || '') === String(props.userInfo?.id || '') ||
    props.userInfo?.role === 'admin');

const onReplyBodyClick = (reply) => {
  if (!isOwnReply(reply)) return;
  ownReplyActionsId.value = ownReplyActionsId.value === reply.id ? null : reply.id;
};
</script>

<template>
  <article
    class="post-card-v2"
    :data-forum-post-id="post.id"
    :class="{
      'image-post-card-v2': post.hasImages,
      'is-expanded': isExpanded || (activeReplyTarget && activeReplyTarget.postId === post.id),
      'is-new-post': isHighlighted,
      'tier-ultra': authorTierCode === 'ultra',
    }"
    :style="{ '--post-appear-delay': `${Math.min(index, 8) * 45}ms` }"
    @click="emit('click', post.id, $event)"
  >
    <figure
      v-if="isHomeCatActive"
      class="post-card-theme-cat"
      :class="getPostCardCatVariant(index)"
      aria-hidden="true"
    >
      <img :src="getPostCardCatSrc(post, index)" alt="" draggable="false" loading="lazy" />
    </figure>
    <figure
      v-if="isHomeCatActive && shouldShowPostBackgroundCat(post, index)"
      class="post-card-background-cat"
      aria-hidden="true"
    >
      <img :src="getPostBackgroundCatSrc(post, index)" alt="" draggable="false" loading="lazy" />
    </figure>

    <div class="post-header-v2">
      <ReplyIdentityRow
        size="lg"
        :username="post.author_username"
        :avatar-url="authorAvatarSrc"
        :avatar-frame-url="isOfficialCard ? '' : post.author_avatar_frame_url"
        :author-id="post.author_id"
        :banned="!!post.author_is_banned"
        :time="formatDate(post.created_at)"
        :tier-class="authorTierClass"
        :profile-clickable="!isOfficialCard"
        @go-to-profile="(u) => emit('go-to-profile', u)"
      />
    </div>

    <div class="post-content-v2">
      <h3 class="post-title-v2">
        <span v-if="post.post_kind === 'news'" class="post-kind-badge news">新闻</span>
        <span v-else-if="post.post_kind === 'activity'" class="post-kind-badge activity">活动</span>
        {{ post.displayTitle }}
        <span v-if="post.status === 'limited'" class="post-status-pill limited">仅自己可见</span>
      </h3>
      <!-- wrap 不滚动：n/N 只读指示胶囊锚在可视区右上角，不会随内容滚走。
           分段横条已按 plans/051 拍板 8 删除，跳段能力由 ForumImageViewer 承接。 -->
      <div v-if="post.hasImages" class="image-post-strip-wrap">
        <span v-if="post.hasMultipleImages" class="image-strip-indicator" aria-hidden="true">
          {{ stripIndex + 1 }} / {{ post.imageCount }}
        </span>
        <div
          class="image-post-strip"
          :class="{ 'is-single': post.allImages.length === 1 }"
          :aria-label="
            post.hasMultipleImages
              ? `多图帖子，共 ${post.imageCount} 张图片，可横向翻动`
              : '图片帖子'
          "
          @scroll.passive="onStripScroll(post, $event)"
        >
          <button
            v-for="(image, index) in post.allImages"
            :key="image.id || image.url"
            type="button"
            class="image-post-thumb-shell"
            :class="{
              'is-loaded': isForumImageLoaded(post.id, image.url),
              'is-failed': isImageFailed(image.url),
            }"
            :aria-label="`查看${post.displayTitle}第 ${index + 1} 张大图`"
            :disabled="isImageFailed(image.url)"
            @click.stop="emit('open-image-viewer', post, index, $event)"
          >
            <!-- 图片加载失败时显示占位图标 -->
            <div
              v-if="isImageFailed(image.url)"
              class="image-post-thumb-failed"
              aria-label="图片加载失败"
            >
              <ImageOff :size="28" :stroke-width="1.5" aria-hidden="true" />
              <span class="image-post-thumb-failed-text">图片加载失败</span>
            </div>
            <img
              v-if="image.lqipUrl && !isImageFailed(image.url)"
              :src="image.lqipUrl"
              :alt="`${post.displayTitle} 图片 ${index + 1}`"
              class="image-post-thumb-lqip"
              aria-hidden="true"
              decoding="async"
              loading="lazy"
            />
            <img
              v-if="image.eager && !isImageFailed(image.url)"
              :src="image.url"
              :srcset="image.srcset || undefined"
              sizes="(max-width: 420px) 160px, (max-width: 768px) 300px, 360px"
              :alt="`${post.displayTitle} 图片 ${index + 1}`"
              loading="eager"
              fetchpriority="high"
              decoding="async"
              class="image-post-thumb"
              :class="{ 'is-loaded': isForumImageLoaded(post.id, image.url) }"
              :width="image.width || undefined"
              :height="image.height || undefined"
              @load="onImageLoad(post.id, image.url)"
              @error="onImageError(post.id, image.url)"
            />
            <img
              v-else-if="!isImageFailed(image.url)"
              :data-lazy-src="image.url"
              :data-lazy-srcset="image.srcset || ''"
              sizes="(max-width: 420px) 160px, (max-width: 768px) 300px, 360px"
              :alt="`${post.displayTitle} 图片 ${index + 1}`"
              loading="lazy"
              decoding="async"
              class="image-post-thumb"
              :class="{ 'is-loaded': isForumImageLoaded(post.id, image.url) }"
              :width="image.width || undefined"
              :height="image.height || undefined"
              :ref="(el) => onLazyImageRef(el)"
              @load="onImageLoad(post.id, image.url)"
              @error="onImageError(post.id, image.url)"
            />
          </button>
          <!-- 末尾"+N 张"占位卡：列表数据尚未含全部图片时展示，滚近自动补全 -->
          <div v-if="post.hiddenImageCount > 0" class="image-post-strip-more" aria-hidden="true">
            <span class="image-post-strip-more-num">+{{ post.hiddenImageCount }}</span>
            <span>张</span>
          </div>
        </div>
      </div>
      <p
        v-if="searchKeyword && post.search_excerpt"
        class="search-highlight-snippet"
        v-html="renderSearchExcerpt(post.search_excerpt)"
      ></p>
      <!-- ⚠️ is-overflowing 由本组件实测 scrollHeight>clientHeight 决定（P2-4），
           别改回 ForumMain 的字数估算 —— 那套判据与 CSS 的 4 行 max-height 不同源。 -->
      <p
        ref="bodyTextEl"
        class="post-text-v2"
        :class="{ 'is-overflowing': bodyOverflowing, 'has-ellipsis-anchor': bodyEllipsisLeft > 0 }"
        :style="bodyEllipsisStyle"
      >
        {{ post.displayBody }}
      </p>
      <!-- 转发帖引用框：降阶灰底块（plans/051 §0），Ultra 独占染色，点击进原帖详情 -->
      <button
        v-if="post.quotedPost"
        type="button"
        class="quoted-post-box"
        :class="[quotedTierCode === 'ultra' ? 'tier-ultra' : '']"
        aria-label="查看被转发的原帖"
        @click.stop="emit('click', post.quotedPost.id)"
      >
        <span class="quoted-post-author" :class="quotedNickClass"
          >@{{ post.quotedPost.author_username || '方块之家' }}</span
        >
        <span v-if="quotedTitle" class="quoted-post-title">{{ quotedTitle }}</span>
        <span v-if="quotedBody" class="quoted-post-body">{{ quotedBody }}</span>
      </button>
    </div>

    <!-- 操作栏（拍板 3：赞 / 评 / ⋯ 三件，无顶部分割线靠留白分隔） -->
    <div class="post-actions-v2" @click.stop>
      <div class="actions-left-v2">
        <LikeButton
          :count="post.like_count || 0"
          :liked="!!post.isLiked"
          :pulsing="isLikedPulsing"
          :submitting="isLikeSubmitting"
          :cat-src="isHomeCatActive ? getHomeCatAsset('like') : ''"
          @toggle="emit('toggle-like', post)"
        />
        <button
          type="button"
          class="action-item-v2 replies-btn-v2"
          @click="emit('toggle-replies', post)"
          aria-label="查看评论"
        >
          <MessageCircle class="action-svg-v2" :size="17" :stroke-width="1.8" aria-hidden="true" />
          <span v-if="Number(post.comment_count || 0) > 0" class="action-count-v2">{{
            post.comment_count
          }}</span>
        </button>
      </div>
      <div class="actions-right-v2">
        <transition name="copy-hint">
          <span v-if="isShareCopied" class="copy-hint-pill" aria-live="polite">已复制</span>
        </transition>
        <CardActionsMenu :items="actionMenuItems" @select="onMenuSelect" />
      </div>
    </div>

    <!-- 评论区（拍板 1：卡片只预览，「查看全部」跳详情；输入框常驻底部） -->
    <transition :css="false" @enter="onRepliesEnter" @leave="onRepliesLeave">
      <div v-if="isExpanded" class="replies-list" @click.stop>
        <!-- home-cat 回复成功猫弹层（拍板 5：动画全保留；样式真源 feed.css .reply-success-pop-cat-img） -->
        <img
          v-if="isHomeCatActive && isReplySuccess"
          class="reply-success-pop-cat-img"
          :src="getHomeCatAsset('success')"
          alt=""
          draggable="false"
          loading="lazy"
        />
        <template v-if="post.replies && post.replies.length > 0">
          <div
            v-for="reply in post.replies"
            :key="reply.id"
            class="reply-item-v2"
            :class="{
              'is-child': !!reply.parent_id,
              'is-actions-open': ownReplyActionsId === reply.id,
            }"
            @click.stop="onReplyBodyClick(reply)"
          >
            <ReplyIdentityRow
              size="md"
              :username="reply.author_username"
              :avatar-url="
                reply.author_avatar_url ? getAvatarUrl(reply.author_avatar_url, 'xs') : ''
              "
              :avatar-frame-url="reply.author_avatar_frame_url || ''"
              :author-id="reply.author_id"
              :banned="!!reply.author_is_banned"
              :time="formatDate(reply.created_at)"
              :reply-to="reply.reply_to_username"
              :root-author="reply.parent_id ? null : reply.author_username"
              :tier-class="replyTierMap[reply.author_id] || ''"
              @go-to-profile="(u) => emit('go-to-profile', u)"
            />
            <p class="reply-text-v2">{{ reply.content }}</p>
            <div class="reply-meta-v2">
              <button
                type="button"
                class="reply-action-btn"
                @click.stop="
                  emit(
                    'toggle-reply-input',
                    post.id,
                    reply.parent_id || reply.id,
                    reply.author_username,
                    reply.content,
                    reply.parent_id ? null : reply.author_username,
                  )
                "
              >
                回复
              </button>
              <!-- 删除入口（用户口径）：点自己的评论才浮出，不是常驻 × -->
              <button
                v-if="ownReplyActionsId === reply.id"
                class="delete-comment-btn-v2"
                @click.stop="emit('delete-comment', reply, post)"
              >
                删除
              </button>
            </div>
          </div>
          <button
            v-if="shouldShowMoreRepliesLink(post)"
            type="button"
            class="more-replies-link-v2"
            @click.stop="emit('click', post.id)"
          >
            查看全部 {{ post.comment_count }} 条评论 ›
          </button>
        </template>
        <!-- 骨架占位：先展开后加载期间的即时反馈（数据回来即被真实列表替换） -->
        <div v-else-if="isRepliesLoading" class="replies-skeleton" aria-hidden="true">
          <div v-for="n in 2" :key="n" class="reply-skeleton-item">
            <span class="reply-skeleton-avatar"></span>
            <span class="reply-skeleton-body">
              <span class="reply-skeleton-line is-short"></span>
              <span class="reply-skeleton-line is-long"></span>
            </span>
          </div>
        </div>
        <p v-else class="replies-empty">还没有评论，来抢沙发</p>

        <ReplyComposer
          v-if="isLoggedIn"
          ref="composerRef"
          class="replies-composer"
          :model-value="replyContent"
          :placeholder="composerPlaceholder"
          :target-username="composerTarget?.username || ''"
          :sending="isReplySubmitting"
          :cooldown="replyCooldownSeconds"
          :submit-label="replySubmitLabel"
          @update:model-value="(v) => emit('update:reply-content', v)"
          @send="onSubmitReply"
          @clear-target="onClearReplyTarget"
        />
        <button v-else type="button" class="replies-login-hint" @click.stop="emit('need-login')">
          登录后参与讨论
        </button>
      </div>
    </transition>
  </article>
</template>

<style scoped>
/* 评论区骨架占位（先展开后加载）：与列表同构，避免展开瞬间高度塌成 0。
   灰底走 --appl-subtle token（plans/051 §3.3），浅色/深色主题都读得清。 */
.reply-skeleton-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0;
}

.reply-skeleton-item + .reply-skeleton-item {
  border-top: 1px solid var(--appl-hairline);
}

.reply-skeleton-avatar {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--appl-subtle);
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
  background: var(--appl-subtle);
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
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}
</style>

<style scoped>
/* 共享样式层：styles/*.css 按组件各自 scoped @import（架构现状，说明见 base.css 顶部） */
@import '../styles/base.css';
@import '../styles/feed.css';
@import '../styles/replies-responsive.css';
</style>
