<script setup>
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import { getImageUrl } from '@/utils/asset-helper.js';
import {
  animateMorph,
  canMorph,
  captureOrigin,
  clearOrigin,
  insetFromRect,
  insetOpen,
  peekOrigin,
} from '@/utils/motion-origin.js';
import { motionEase, motionMs, motionNum } from '@/utils/motion.js';
import { playCollapseMorph } from '@/utils/morph-layer.js';
import { mountPageSnapshot } from '@/utils/page-snapshot.js';
import { markDetailReturning } from '@/utils/detail-return-flag.js';
import { resolveFrameForAuthor } from '@/composables/useAvatarFrame.js';
import { Check, Heart, Image as ImageIcon, MessageCircle, Share2 } from 'lucide-vue-next';
import UserCenterPageHeader from '../../components/UserCenterPageHeader.vue';
import CommentThread from './components/CommentThread.vue';
import ImageViewer from './components/ImageViewer.vue';
import PostComposer from '../Forum/components/PostComposer.vue';
import {
  getComments,
  createComment,
  getCommentThreadReplies,
  getCommentAncestors,
  getCommentThreadPreviewsBatch,
  toggleLike,
  reportPost,
  checkIfLiked,
  toggleCommentLike,
  getLikedCommentIds,
  deletePost,
  deleteComment,
  getPostEngagementStats,
  getForumPostImages,
  updatePost,
  updateForumPostImages,
  markForumImagesPendingRecheck,
  enqueueForumImageRecheck,
} from '../../utils/api/forum-api.js';
import { uploadForumImage } from '../../utils/api/forum-images-api.js';
import DOMPurify from '@/utils/dompurify.js';
import { NEWS_SANITIZE_OPTIONS } from '../Newsroom/news-shared.js';
import { FORUM_POST_IMAGE_MAX_COUNT, FORUM_TAG_OPTIONS } from '../Forum/forum-config.js';
import {
  normalizeForumTag,
  normalizeForumImage,
  resolveStoredCoverUrl,
} from '../../utils/api/forum-format.js';
import { supabase } from '../../utils/supabase-client.js';
import { formatSmartTime } from '../../utils/time.js';
import { logger } from '@/utils/logger.js';
// 展示口径的标题/正文（单源；别名保持调用点不变）
import {
  extractDisplayPostBody as extractPostBody,
  extractDisplayPostTitle as extractPostTitle,
} from '@/utils/forum-post-format.js';
import CommonAlertModal from '../../components/CommonAlertModal.vue';
import HomeCatMascot from '@/components/HomeCatMascot.vue';
import {
  getForumReturnKeyFromQuery,
  isSafePostDetailHistoryReturn,
} from '@/utils/forum-return-state.js';
import { clearForumFeedSnapshots } from '@/utils/forum-feed-cache.js';
import { isForumPortraitComposer, onForumPortraitComposerChange } from '@/utils/forum-viewport.js';
import { getHomeCatAsset, isHomeCatTheme } from '@/utils/home-cat-theme.js';
import { themeManager } from '@/utils/theme-manager.js';
import { buildReplyDraft, shouldShowReplyTarget } from '@/utils/forum-helpers.js';
import { useUserTier } from '@/composables/useUserTier.js';
import { isFollowing, followUser, unfollowUser } from '../../utils/api/profile-api.js';
import { isNarrowDetailViewport, onNarrowDetailChange } from '@/utils/forum-viewport.js';
import { useAutoGrowTextarea } from '@/composables/useAutoGrowTextarea.js';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { isLoggedIn, showLoginModal } = storeToRefs(authStore);
const { userInfo } = authStore;

// 弹窗模式（横屏）：宿主 PostDetailModal 传入帖子 id；整页模式仍取路由参数。
const props = defineProps({
  postIdOverride: { type: [String, Number], default: '' },
  modalMode: { type: Boolean, default: false },
});
const emit = defineEmits(['close', 'open-post', 'media-ratio']);

const postId = computed(() => String(props.postIdOverride || route.params.id || ''));

// ✨ 移除：emit定义（改为全局事件）
// const emit = defineEmits(['island-message']);

const post = ref(null);
// 官方镜像卡（新闻/活动）回源正文：posts.content 只存【标题】+摘要，
// 完整原文在 news.content（富文本）/ activities.description（纯文本段落）
const officialContent = ref({ type: '', html: '', paragraphs: [] });
// 转发帖引用的原帖（repost_of_post_id 回源），渲染引用框
const quotedPost = ref(null);
// 官方卡（新闻/活动镜像）：作者「方块之家」无账号，头像用站点 logo
const OFFICIAL_AUTHOR_NAME = '方块之家';
const isOfficialCard = computed(() => {
  const p = post.value || {};
  if (p.post_kind === 'news' || p.post_kind === 'activity') return true;
  return !p.author_id && String(p.author_username || '').trim() === OFFICIAL_AUTHOR_NAME;
});
const authorAvatarSrc = computed(() =>
  isOfficialCard.value && !post.value?.author_avatar_url
    ? getImageUrl('favicon.webp', { silent: true })
    : post.value?.author_avatar_url || '',
);
const authorFrame = computed(() =>
  isOfficialCard.value
    ? null
    : resolveFrameForAuthor(post.value?.author_avatar_frame_url, post.value?.author_id),
);
const isLoading = ref(true);

/* ── 入场形变：从列表卡片长成详情（plans/035 §L2 / §16）──────────────
   为什么是「容器形变 + 内容淡入」而不是纯 FLIP：详情取数是异步的，
   首帧只有骨架；等数据到了再算终态矩形，才能保证起点落在卡片上。
   形变期间内容 opacity 从 0 起（offset 0.45 到 1）—— 非等比缩放下文字
   会被拉伸，但那几帧它本来就看不见。

   ⚠️ 形变目标是 `.detail-container`，**绝不能**包到 `.post-detail-page` 上：
   页根里的底栏是 `position: fixed`，祖先一旦带 transform，包含块就被换成
   那个祖先（规范行为），底栏会被一起缩放、推飞。这是仓库里踩过的坑。
   返程（playCollapseMorph）克隆的也是同一个盒子，进出两边同一口径。 */
/* 入场形变的目标：骨架屏与正文的共同祖先（见 playDetailEntryMorph 的注释）。
   它不含 fixed 后代，所以带 transform 不会换掉底栏的包含块；返程收缩克隆的
   也是它 —— 进出必须同一个盒子，否则会出现「进去从 y=0 张开、出来只从 y=80 收起」。 */
const detailContainerRef = ref(null);
/* 入口那张卡的矩形，留给返程用（plans/035 §L3）。
   `clearOrigin` 会把 map 里的条目删掉（避免被下一次导航复用），所以这里必须留一份，
   否则返回时「回哪去」这件事就没了依据。 */
let entryOriginRect = null;

/* ── 入场形变：从列表卡片「推开」成整页（plans/035 §L4 P2 / §16）─────────
   ⚠️ 形变**必须发生在导航那一刻**，不能等数据。旧实现挂在 `watch(isLoading)`
   上，顺序变成「骨架屏整页闪一下 → 数据到了才演形变」，观感就是
   「一闪而过，然后内容才出来」，完全不符合「从列表弹出」。

   现在形变目标是 `.detail-container`（骨架屏与正文都在它里面），所以：
     t=0    卡片位置的一扇窗口开始张开
     ~160ms 骨架屏在已经张开的窗口里淡入（用户看到的顺序：界面 → 骨架屏）
     数据到达 正文在窗口里淡入，**不再演第二次形变**

   ⚠️ 只能挂 `.detail-container`，不能挂 `.post-detail-page`：底栏
   `.pd-actionbar--page` 是页根的兄弟节点且 `position: fixed`，祖先一旦带
   transform，包含块会被换掉（仓库踩过的事故）。`.detail-container` 里没有
   fixed 后代，安全。

   ⚠️ 2026-10-31 改口径：**不再是 FLIP 矩形变形**。旧做法把卡片 370×104 直接
   缩放到 390×800（sx≈0.95 / sy≈0.13），动画中途是一块被纵向拉长七倍的矩形，
   观感是「橡皮筋扯长」而不是「从这一格打开」。现在改成两层：
     · 窗口：`clip-path: inset()` 从卡片矩形长到全屏 —— 内容**全程不缩放**；
     · 纵深：内容从 `--morph-depth`(1.12) 收回到 1，以卡片中心为原点。
   窗口面积连续变化，不存在旧版「几何跑完内容还没亮」的时钟错位，
   所以时长可以按标准档（460ms）给，不必再为「一闪而过」退回慢速档。 */
const playDetailEntryMorph = async () => {
  // 弹窗态由 PostDetailModal 对**面板**做形变；这里再动就是两层形变
  if (props.modalMode) return;
  const el = detailContainerRef.value;
  if (!el || !canMorph()) return;
  const key = `post-detail:${postId.value}`;
  const source = peekOrigin(key);
  if (!source) return;
  clearOrigin(key);
  entryOriginRect = { ...source };
  /* ⚠️ 这里**不许**再插 `await nextTick()`（2026-10-31 三次报障）：
     插了以后「挂载 → 首帧绘制」之间没有任何裁剪，实测 open-150 那一帧是
     **全屏大小的骨架**（整页未裁、也没有窗口和投影），读起来就是闪一下。
     onMounted 里 DOM 已插入，`getBoundingClientRect` 直接可量（一次同步回流，
     代价远小于闪一帧）。函数体在第一个 `await` 之前全部同步执行。 */
  const box = el.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const target = { left: box.left, top: box.top, width: box.width, height: box.height };
  const win = insetFromRect(source, target, { radius: source.radius || 16 });
  // 卡片已经盖满目标（同尺寸 / 无位移）就没必要演一遍，否则是一次无意义的「抽搐」
  if (!win) return;

  const duration = motionMs('--motion-morph-in', 460);
  const easing = motionEase('--ease-morph');
  const depth = motionNum('--morph-depth', 1.12);
  // `detailPageRoot` 在下方声明（第 238 行左右），这里只在 onMounted 之后才被调用，
  // 早已初始化完成 —— 不是 TDZ 隐患，但别把它挪到模块顶层同步执行。
  const rootEl = detailPageRoot.value;

  /* 先把「窗口」定住，再谈动画：clipPath 与 veil 必须在**同一帧**落 DOM，
     否则第一帧看到的是全尺寸页面。 */
  rootEl?.classList.add('is-morph-veil');
  el.style.clipPath = win.value;

  /* 纵深挂在 `.detail-content`（`.detail-container` 的唯一子元素）上。
     原点取**卡片中心**（相对 content 的坐标系）：用默认的 50% 50% 会让放大
     从页面中心发散，跟「从这一格推开」的方向正好相反。 */
  const inner = el.firstElementChild;
  const ox = source.left + source.width / 2 - box.left;
  const oy = source.top + source.height / 2 - box.top;
  if (inner && depth > 1.001) {
    const origin = `${ox.toFixed(1)}px ${oy.toFixed(1)}px`;
    void animateMorph(
      inner,
      [
        { transform: `scale(${depth.toFixed(3)})`, transformOrigin: origin },
        { transform: 'scale(1)', transformOrigin: origin },
      ],
      { duration, easing },
    );
  }

  /* 窗口要**看得见**，不能是一块白底上的白窗口（2026-10-31 修「打开闪屏」）：
     `is-morph-veil` 只在这一段存在：页根铺一层极淡压暗 + 给 `.detail-container`
     垫页底/投影，于是「一小扇详情窗口在放大」这一步才有边界可看
     （CSS 见 style.scoped.css 末尾）。veil 与 clipPath 已在上面同步落好了。 */
  try {
    await animateMorph(el, [{ clipPath: win.value }, { clipPath: insetOpen(0) }], {
      duration,
      easing,
    });
  } finally {
    el.style.clipPath = '';
    /* ⚠️ 只摘 veil，**绝不能**连 `is-morph-entry` 一起摘：`animation` 规则被移除
       又加回来时动画会从 0 重新创建，摘掉那一刻整页会再淡入一次 —— 这正是
       「还是会有那种页面被重新挂载一样的闪」（2026-10-31 二次报障）。 */
    rootEl?.classList.remove('is-morph-veil');
  }
};

const isReplySubmitting = ref(false);
const isLikeSubmitting = ref(false);
const isReportSubmitting = ref(false);
const isPostMenuOpen = ref(false);
const isLikePulsing = ref(false);
const isReplySuccessPopping = ref(false);
const isShareCopied = ref(false);
const loadedDetailImageKeys = ref(new Set());
// ✨ 新增：图片加载失败跟踪
const failedDetailImageKeys = ref(new Set());
const isDetailImageViewerOpen = ref(false);
const replyContent = ref('');
const activeReplyId = ref(null); // 当前正在回复的对象ID (postId 或 commentId)
const replyToUser = ref(null); // 当前正在回复的用户名
const activeReplyQuote = ref('');
const cooldownNow = ref(Date.now());
const replyCooldownUntil = ref(0);
const detailImageIndex = ref(0);
// 弹窗模式（小红书式布局）：作者关注态 + 底部操作栏输入框引用
const isFollowingAuthor = ref(false);
const isFollowSubmitting = ref(false);
// 底部评论输入框（弹窗形态与整页 fixed 底栏共用同一个 ref：两者互斥，同时只有一个在 DOM 里）。
// 2026-10-01：由单行 `<input>` 改为自动增高 `<textarea>` —— 详情页是全站唯一还能写多行
// 评论的地方，单行框会把换行吃掉。高度真源 = CSS 的 max-height，见 modal-layout.css。
const { textareaRef: modalReplyField, resetHeight: resetReplyFieldHeight } = useAutoGrowTextarea({
  value: replyContent,
});
const detailPageRoot = ref(null);
// 窄屏（≤1024）：竖屏 Threads 式排版（身份条/媒体贴边/底栏横排）
const isNarrowDetail = ref(isNarrowDetailViewport());
let narrowDetailOff = null;
const currentTheme = ref(themeManager.getTheme());
const isAnniversaryMcTheme = computed(() => currentTheme.value === 'anniversary-mc');
let cooldownTimer = null;
let detailFetchSeq = 0;
let likePulseTimer = null;
let replySuccessTimer = null;
let shareCopiedTimer = null;

// 编辑功能相关（复用发帖 PostComposer 的全屏/弹窗编辑 UI）
const isEditingPost = ref(false);
const editNewPost = ref({ title: '', content: '' });
const editSelectedPostTag = ref('daily');
const editPostImages = ref([]);
const editRemovedExistingIds = ref(new Set());
const isEditSubmitting = ref(false);
const isEditUploadingPostImage = ref(false);
const editImageUploadStatus = ref('');
// 竖屏编辑器形态：单源判据（与论坛的竖屏发布排版同源），变化由订阅驱动
const isEditPortrait = ref(typeof window !== 'undefined' ? isForumPortraitComposer() : false);

/**
 * 竖屏「聚焦即展开」：底栏回复框被点击聚焦后，展开成舒适的多行输入视图
 * （输入框独占一行 + 抬高最小高度 + 点赞/评论/分享组让位），发送成功后还原。
 * 判据用 isEditPortrait（= isForumPortraitComposer，竖屏 ≤1024px）⇒ 桌面/横屏不受影响；
 * CSS 侧不再写第二份媒体查询，只消费 `.pd-actionbar.is-expanded`。
 */
const isReplyExpanded = ref(false);
let releaseEditPortraitWatch = null;
const isReportModalOpen = ref(false);
const reportForm = ref({
  reason: 'other',
  detail: '',
});
const reportReasons = [
  { value: 'spam', label: '垃圾广告', description: '重复刷屏、广告推广或无关内容' },
  { value: 'harass', label: '骚扰攻击', description: '辱骂、人身攻击、恶意挑衅' },
  { value: 'porn', label: '不适内容', description: '色情、血腥或其他不宜展示内容' },
  { value: 'false', label: '虚假误导', description: '造谣、误导或冒充他人' },
  { value: 'other', label: '其他问题', description: '无法归类，但需要管理员查看' },
];

const topComments = ref([]);
const topCommentsPage = ref(1);
const hasMoreTopComments = ref(false);
const isTopCommentsLoading = ref(false);
const childRepliesMap = ref({});
const highlightedCommentId = ref('');

const { fetchUserTier, getNicknameClass } = useUserTier();
const authorTierClass = ref('');
const authorTierCode = ref('');
watch(
  () => post.value?.author_id,
  async (id) => {
    if (id) {
      const tier = await fetchUserTier(id);
      authorTierClass.value = getNicknameClass(id);
      authorTierCode.value = tier;
    } else {
      authorTierClass.value = '';
      authorTierCode.value = '';
    }
  },
  { immediate: true },
);
const commentSortMode = ref('desc');

const TOP_LEVEL_PAGE_SIZE = 20;
const CHILD_REPLY_PAGE_SIZE = 5;
const isHomeCatActive = computed(() => isHomeCatTheme(currentTheme.value));
const confirmMascotSrc = computed(() => {
  if (!confirmState.value.show) return '';
  const confirmText = String(confirmState.value.confirmText || '');
  const title = String(confirmState.value.title || '');
  return confirmText.includes('删除') || title.includes('删除') ? getHomeCatAsset('delete') : '';
});
const modalMascotSrc = computed(() => {
  if (!isHomeCatActive.value || !modalState.value.show) return '';
  if (modalState.value.type === 'success') return getHomeCatAsset('success');
  if (modalState.value.type === 'error' || modalState.value.type === 'warning')
    return getHomeCatAsset('failed');
  return getHomeCatAsset('decor');
});

// 内容折叠相关
const isExpanded = ref(false);
const CONTENT_LIMIT = 500;
/* 标题/正文提取：单源在 `@/utils/forum-post-format.js`（2026-10-30 P2-3 收口）。
   那是**展示口径**（宽松），与写库用的锚定契约 `splitForumPostContent` 故意不同。 */

const isContentLong = computed(() => {
  if (!post.value) return false;
  const bodyText = extractPostBody(post.value);
  return bodyText.length > CONTENT_LIMIT;
});

const displayContent = computed(() => {
  if (!post.value) return '';
  const bodyText = extractPostBody(post.value);
  if (!isContentLong.value || isExpanded.value) return bodyText;
  return bodyText.substring(0, CONTENT_LIMIT) + '...';
});
const postTitle = computed(() =>
  post.value?.post_kind === 'repost' && !String(post.value?.title || '').trim()
    ? '转发动态'
    : extractPostTitle(post.value),
);
// 被转发的原帖摘录（引用框用）
const quotedTitle = computed(() => {
  const q = quotedPost.value;
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
  const q = quotedPost.value;
  if (!q) return '';
  // 只显示真正的正文：纯标题原帖剥空后不回退标题（标题行已展示，避免同文重复）
  const raw = String(q.body || '').trim() || String(q.content || '').trim();
  const stripped = raw.replace(/【.*?】\n?/, '').trim();
  if (!stripped) return '';
  return stripped.length > 160 ? `${stripped.slice(0, 160)}…` : stripped;
});
const goToQuotedPost = () => {
  const id = quotedPost.value?.id;
  if (!id) return;
  // 弹窗模式：原位切换弹窗内容（replace 历史条目）；整页模式：路由跳转。
  if (props.modalMode) {
    emit('open-post', id);
    return;
  }
  router.push(`/forum/post/${id}`);
};
// 引用框随原帖作者订阅层级显示卡色
const quotedTierCode = ref('');
const quotedNickClass = ref('');
watch(
  () => quotedPost.value?.author_id,
  async (id) => {
    if (!id) {
      quotedTierCode.value = '';
      quotedNickClass.value = '';
      return;
    }
    const tier = await fetchUserTier(id);
    quotedTierCode.value = ['plus', 'pro', 'max', 'ultra'].includes(tier) ? tier : '';
    quotedNickClass.value = getNicknameClass(id);
  },
  { immediate: true },
);
const canManagePost = computed(() =>
  Boolean(
    isLoggedIn.value &&
    post.value &&
    (String(post.value.author_id || '') === String(userInfo.id || '') || userInfo.role === 'admin'),
  ),
);
const canReportPost = computed(() =>
  Boolean(
    post.value &&
    (!isLoggedIn.value || String(post.value.author_id || '') !== String(userInfo.id || '')),
  ),
);
const shouldShowPostMenu = computed(() =>
  Boolean(post.value && (canManagePost.value || canReportPost.value)),
);
const detailImages = computed(() =>
  Array.isArray(post.value?.images) ? post.value.images.filter((image) => image?.url) : [],
);
const currentDetailImage = computed(() => detailImages.value[detailImageIndex.value] || null);
const detailImageKey = computed(() =>
  String(
    currentDetailImage.value?.url ||
      currentDetailImage.value?.detailUrl ||
      currentDetailImage.value?.originalUrl ||
      '',
  ).trim(),
);
const hasMultipleDetailImages = computed(() => detailImages.value.length > 1);

/* ── 媒体比例上报（2026-10-22 左栏自适应）────────────────────────────────
   用途：弹窗宿主按当前图片的宽高比调整「媒体列宽 + 面板总宽」。
   为什么要上报而不是让宿主自己算：图片列表只有这里知道（弹窗内还会切图）。

   数据来源两级，先便宜后准确：
   ① 优先用 DB 里的 width/height（forum_post_images 表就有，实测覆盖率 100% 的量级），
      好处是**图片还没下载完就能定布局**，不会先按错比例闪一下再跳；
   ② DB 没有时才退回 naturalWidth/naturalHeight（图片 onload 后由下面 watch 补发）。
   比例做安全夹紧：0.3 ~ 3.0。极端长图/全景图否则会把面板撑到不可用。 */
const MIN_MEDIA_RATIO = 0.3;
const MAX_MEDIA_RATIO = 3;
const clampMediaRatio = (ratio) => {
  const n = Number(ratio);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(MAX_MEDIA_RATIO, Math.max(MIN_MEDIA_RATIO, n));
};

const currentMediaRatio = computed(() => {
  const img = currentDetailImage.value;
  if (!img) return null;
  const fromDb = clampMediaRatio(Number(img.width) / Number(img.height));
  if (fromDb) return fromDb;
  const loaded = loadedMediaRatio.value; // 由 onload 写入
  return clampMediaRatio(loaded);
});

// 图片实际加载后量到的比例（只在 DB 缺 width/height 时才会被用到）
const loadedMediaRatio = ref(null);

// 当前图变了 ⇒ 清掉上一张量到的比例，避免拿旧值定新图
watch(detailImageKey, () => {
  loadedMediaRatio.value = null;
  emitMediaRatio();
});

const emitMediaRatio = () => {
  if (!props.modalMode) return;
  emit('media-ratio', currentMediaRatio.value);
};

// DB 数据到位 / 切图 / 图片加载完成 —— 任一变化都把比例同步给宿主
watch(currentMediaRatio, (ratio) => {
  if (props.modalMode) emit('media-ratio', ratio);
});
onMounted(() => {
  // 首帧可能已经拿到 DB 宽高（fetch 快于 mount），补发一次
  emitMediaRatio();
});

// 图片 onload：量真实尺寸，作为 DB 缺值时的兜底
const captureMediaRatio = (event) => {
  const el = event?.target;
  if (!el?.naturalWidth || !el?.naturalHeight) return;
  const r = clampMediaRatio(el.naturalWidth / el.naturalHeight);
  if (r && r !== loadedMediaRatio.value) {
    loadedMediaRatio.value = r;
    if (props.modalMode) emit('media-ratio', r);
  }
};

const toggleExpand = () => {
  isExpanded.value = !isExpanded.value;
};

const goToDetailImage = (index) => {
  const total = detailImages.value.length;
  if (!total) {
    detailImageIndex.value = 0;
    return;
  }
  detailImageIndex.value = Math.min(Math.max(Number(index || 0), 0), total - 1);
};

const showPrevDetailImage = () => {
  const total = detailImages.value.length;
  if (total <= 1) return;
  detailImageIndex.value = (detailImageIndex.value - 1 + total) % total;
};

const showNextDetailImage = () => {
  const total = detailImages.value.length;
  if (total <= 1) return;
  detailImageIndex.value = (detailImageIndex.value + 1) % total;
};

const openDetailImageViewer = (index = detailImageIndex.value, event) => {
  if (!detailImages.value.length) return;
  goToDetailImage(index);
  // 采集「从哪张图点开的」：大图关闭时要缩回这张图本身（plans/035 §L4）
  captureOrigin(`detail-image:${detailImageKey.value}`, event?.currentTarget, { radius: 12 });
  isDetailImageViewerOpen.value = true;
};

const closeDetailImageViewer = () => {
  isDetailImageViewerOpen.value = false;
};

/**
 * 详情页键盘操作：← / → 切换图片（2026-10-22）
 * Esc 关闭弹窗由 usePostDetailModal 的全局 keydown 负责，这里只管图片切换（不重复接管 Esc）。
 *
 * 三条必须避开的坑：
 * ① 焦点在输入框 / textarea / contenteditable 里时不能抢方向键 ——
 *    评论框里按左右是移光标，抢走就没法编辑了。
 * ② 大图查看器（ImageViewer）打开时它自己有键盘处理，这里必须让位，
 *    否则一次按键会把底下那张也翻掉，关掉查看器后位置莫名其妙变了。
 * ③ 带修饰键（⌘/Ctrl/Alt/Shift）的组合不接管，那是浏览器/系统的快捷键。
 * 另外只在本页真正处于"详情可见"状态时响应：弹窗态要求 isOpen，
 * 整页态没有弹窗覆盖，两者任一成立即可。
 */
const isEditableTarget = (el) => {
  if (!el) return false;
  const tag = String(el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return Boolean(el.isContentEditable);
};

const handleDetailKeydown = (event) => {
  if (event.defaultPrevented) return;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  if (isEditableTarget(event.target)) return;
  if (isDetailImageViewerOpen.value) return;
  if (detailImages.value.length <= 1) return;
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    showPrevDetailImage();
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    showNextDetailImage();
  }
};

const triggerLikePulse = () => {
  isLikePulsing.value = true;
  if (likePulseTimer) clearTimeout(likePulseTimer);
  likePulseTimer = setTimeout(() => {
    isLikePulsing.value = false;
    likePulseTimer = null;
  }, 1900);
};

const triggerReplySuccessPop = () => {
  isReplySuccessPopping.value = true;
  if (replySuccessTimer) clearTimeout(replySuccessTimer);
  replySuccessTimer = setTimeout(() => {
    isReplySuccessPopping.value = false;
    replySuccessTimer = null;
  }, 1800);
};

const showShareCopiedState = () => {
  isShareCopied.value = true;
  if (shareCopiedTimer) clearTimeout(shareCopiedTimer);
  shareCopiedTimer = setTimeout(() => {
    isShareCopied.value = false;
    shareCopiedTimer = null;
  }, 1500);
};

const handleThemeChange = (theme) => {
  currentTheme.value = theme;
};

const markDetailImageLoaded = (key = detailImageKey.value) => {
  const safeKey = String(key || '').trim();
  if (!safeKey) return;
  loadedDetailImageKeys.value = new Set([...loadedDetailImageKeys.value, safeKey]);
};

const isDetailImageLoaded = (key = detailImageKey.value) =>
  loadedDetailImageKeys.value.has(String(key || '').trim());

// ✨ 新增：图片加载失败处理函数
const markDetailImageFailed = (key = detailImageKey.value) => {
  const safeKey = String(key || '').trim();
  if (!safeKey) return;
  failedDetailImageKeys.value = new Set([...failedDetailImageKeys.value, safeKey]);
  logger.warn('post-detail', '图片加载失败:', { key: safeKey });
};

const isDetailImageFailed = (key = detailImageKey.value) =>
  failedDetailImageKeys.value.has(String(key || '').trim());

const closePostMenu = () => {
  isPostMenuOpen.value = false;
};

const togglePostMenu = () => {
  isPostMenuOpen.value = !isPostMenuOpen.value;
};

const handleDocumentClick = () => {
  closePostMenu();
};

// 弹窗状态
const modalState = ref({
  show: false,
  type: 'success',
  title: '',
  message: '',
});
const confirmState = ref({
  show: false,
  title: '',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  resolve: null,
});

const showModal = (type, title, message) => {
  modalState.value = { show: true, type, title, message };
};

const closeConfirm = (confirmed = false) => {
  const resolver = confirmState.value.resolve;
  confirmState.value = {
    show: false,
    title: '',
    message: '',
    confirmText: '确定',
    cancelText: '取消',
    resolve: null,
  };
  if (typeof resolver === 'function') {
    resolver(Boolean(confirmed));
  }
};

const requestConfirm = ({ title, message, confirmText = '确定', cancelText = '取消' }) =>
  new Promise((resolve) => {
    confirmState.value = {
      show: true,
      title,
      message,
      confirmText,
      cancelText,
      resolve,
    };
  });

const goToProfile = (usernameVal) => {
  const safeUsername = String(usernameVal || '').trim();
  if (!safeUsername) return;
  // 弹窗模式：先关弹窗（不消费历史条目，后退落整页详情兜底），再跳主页。
  if (props.modalMode) {
    emit('close', { restoreHistory: false });
  }
  router.push(`/profile/${encodeURIComponent(safeUsername)}?from=post-detail`);
};

// ─── 弹窗模式（小红书式布局）：媒体区条件 + 作者关注 ───
// 只认正文图（forum_post_images）：cover fallback 不撑起媒体列，
// 否则「无正文图但有封面字段」的帖会出现空白媒体列（用户视角的无图帖应单栏全宽）
const hasMedia = computed(() => detailImages.value.some((image) => !image?.isCoverFallback));

const canFollowAuthor = computed(() =>
  Boolean(
    (props.modalMode || isNarrowDetail.value) &&
    isLoggedIn.value &&
    !isOfficialCard.value &&
    post.value?.author_id &&
    String(post.value.author_id) !== String(userInfo.id || ''),
  ),
);

const refreshFollowState = async () => {
  if (!canFollowAuthor.value) {
    isFollowingAuthor.value = false;
    return;
  }
  const result = await isFollowing(userInfo.id, post.value.author_id);
  isFollowingAuthor.value = Boolean(result?.data);
};

const handleFollowToggle = async () => {
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }
  if (!canFollowAuthor.value || isFollowSubmitting.value) return;
  isFollowSubmitting.value = true;
  try {
    const authorId = post.value.author_id;
    const wasFollowing = isFollowingAuthor.value;
    const result = wasFollowing
      ? await unfollowUser(userInfo.id, authorId)
      : await followUser(userInfo.id, authorId);
    if (!result?.ok) {
      showModal('error', '操作失败', result?.error?.message || '请稍后重试');
      return;
    }
    isFollowingAuthor.value = !wasFollowing;
  } catch (error) {
    logger.error('post-detail', '关注操作失败:', error);
    showModal('error', '操作失败', '请稍后重试');
  } finally {
    isFollowSubmitting.value = false;
  }
};

watch(
  () => ({ modal: props.modalMode, author: post.value?.author_id }),
  () => {
    void refreshFollowState();
  },
);

// 底部操作栏作为回复输入唯一入口：聚焦即视为主帖回复（弹窗与整页共用）
const focusModalReply = () => {
  if (!modalReplyField.value) return;
  if (isLoggedIn.value && !activeReplyId.value) {
    activeReplyId.value = post.value?.id || null;
  }
  // 竖屏：聚焦即展开（桌面/横屏保持单行紧凑态）
  if (isEditPortrait.value) isReplyExpanded.value = true;
  nextTick(() => {
    modalReplyField.value?.focus?.();
  });
};

// 整页 fixed 底栏的键盘适配：键盘弹出时以 --pd-dock-inset 抬升到底部可视区上沿（iOS Safari 必需）
// ⚠️ 这是「连续跟随视觉视口」的 dock 语义（无阈值、resize+scroll 逐帧贴上沿），
// 与 composables/useKeyboardInset.js 的「阈值化 --kb-inset（容器收缩类修复）」语义不同，勿互相替代。
let dockViewportHandler = null;
const updatePageDockInset = () => {
  if (props.modalMode) return;
  const rootEl = detailPageRoot.value;
  const vv = window.visualViewport;
  if (!rootEl || !vv) return;
  const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  rootEl.style.setProperty('--pd-dock-inset', `${inset}px`);
};

const handleModalCommentClick = () => {
  // 评论按钮：聚焦底栏输入框；若正在回复某条评论则保留上下文
  focusModalReply();
};

// 底栏输入框回车提交（IME 组合中的回车不触发；Shift+Enter 换行）
// 输入框 2026-10-01 起是多行 textarea，所以「Enter = 发送」这条约定必须由这里兜住：
// 不拦的话浏览器默认行为是在框内插一个换行，用户以为发出去了其实没发。
const onModalReplyEnter = (event) => {
  if (event?.isComposing) return;
  if (event?.shiftKey) return;
  event?.preventDefault?.();
  submitReply();
};

// 输入完成自动收回：内容已被清空（发送成功 / 取消回复）时把高度还原成单行。
// 有内容时不收 —— 把用户刚写完的多行文字藏起来是坏行为。
const handleReplyFieldBlur = () => {
  if (String(replyContent.value || '').trim()) return;
  // 空态失焦 = 用户点开又没写（或刚发送完）⇒ 一并还原展开态
  isReplyExpanded.value = false;
  resetReplyFieldHeight();
};

const emitProfileSync = ({ userId, username, reason }) => {
  window.dispatchEvent(
    new CustomEvent('boh_profile_sync', {
      detail: {
        userId: userId || null,
        username: username || null,
        reason: reason || 'forum_update',
        at: Date.now(),
      },
    }),
  );
};

const formatDate = formatSmartTime;

const getCurrentUserId = () => (isLoggedIn.value ? userInfo.id : null);

const getCooldownSeconds = (until) =>
  Math.max(0, Math.ceil((Number(until || 0) - cooldownNow.value) / 1000));

const replyCooldownSeconds = computed(() => getCooldownSeconds(replyCooldownUntil.value));

const replySubmitLabel = computed(() =>
  replyCooldownSeconds.value > 0 ? `${replyCooldownSeconds.value}s 后发布` : '发布',
);

const ensureCooldownTimer = () => {
  if (cooldownTimer) return;
  cooldownTimer = setInterval(() => {
    cooldownNow.value = Date.now();
    if (replyCooldownSeconds.value <= 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
  }, 1000);
};

const startReplyCooldown = (seconds) => {
  replyCooldownUntil.value = Date.now() + Math.max(1, Number(seconds || 10)) * 1000;
  cooldownNow.value = Date.now();
  ensureCooldownTimer();
};

const applyRateLimitCooldown = (error) => {
  if (error?.code !== 'FORUM_RATE_LIMIT') return false;
  const ruleCode = String(error.details || '').trim();
  startReplyCooldown(ruleCode === 'COMMENT_10M_LIMIT' ? 30 : 10);
  return true;
};

const resetCommentState = () => {
  topComments.value = [];
  topCommentsPage.value = 1;
  hasMoreTopComments.value = false;
  childRepliesMap.value = {};
  highlightedCommentId.value = '';
};

const dispatchPostUpdated = () => {
  if (!post.value?.id) return;
  window.dispatchEvent(
    new CustomEvent('boh:forum-post-updated', {
      detail: { postId: post.value.id, post: post.value },
    }),
  );
};

const refreshPostStats = async () => {
  if (!post.value?.id) return;
  const statsRes = await getPostEngagementStats(post.value.id);
  if (statsRes.ok) {
    post.value.comment_count = Number(statsRes.data?.commentCount || 0);
    post.value.like_count = Number(statsRes.data?.likeCount || 0);
    // 弹窗模式下列表原地挂载，靠事件同步卡片计数
    dispatchPostUpdated();
  }
};

// ─── 评论点赞（comment_likes + toggle_forum_comment_like） ───
const markItemsLikeState = (items, likedIds) =>
  (items || []).map((item) =>
    toIdKey(item.id) && likedIds.has(toIdKey(item.id)) && !item.isLiked
      ? { ...item, isLiked: true }
      : item,
  );

const hydrateCommentLikeState = async () => {
  if (!isLoggedIn.value || !getCurrentUserId()) return;
  const childItems = Object.values(childRepliesMap.value).flatMap((state) => state?.items || []);
  const ids = [...topComments.value, ...childItems].map((item) => toIdKey(item.id)).filter(Boolean);
  if (!ids.length) return;
  const likedIds = await getLikedCommentIds(ids, getCurrentUserId());
  topComments.value = markItemsLikeState(topComments.value, likedIds);
  const nextMap = {};
  for (const [key, state] of Object.entries(childRepliesMap.value)) {
    nextMap[key] = { ...state, items: markItemsLikeState(state?.items || [], likedIds) };
  }
  childRepliesMap.value = nextMap;
};

const handleToggleCommentLike = async ({ comment, parentId } = {}) => {
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }
  if (!comment?.id || comment.isLikeSubmitting) return;

  const applyLikePatch = (item) =>
    toIdKey(item.id) === toIdKey(comment.id) ? { ...item, ...comment._likePatch } : item;

  // 乐观更新（本地翻转），失败回滚
  const optimistic = {
    isLiked: !comment.isLiked,
    like_count: Math.max(0, Number(comment.like_count || 0) + (comment.isLiked ? -1 : 1)),
    isLikeSubmitting: true,
  };
  comment._likePatch = optimistic;
  topComments.value = topComments.value.map(applyLikePatch);
  if (parentId) {
    const state = getChildReplyState(parentId);
    patchChildReplyState(parentId, { items: (state.items || []).map(applyLikePatch) });
  }

  try {
    const result = await toggleCommentLike(comment.id, getCurrentUserId());
    const finalPatch = result?.ok
      ? {
          isLiked: Boolean(result.data?.isLiked),
          like_count: Number(result.data?.likeCount ?? optimistic.like_count),
          isLikeSubmitting: false,
        }
      : {
          isLiked: comment.isLiked,
          like_count: Number(comment.like_count || 0),
          isLikeSubmitting: false,
        };
    comment._likePatch = finalPatch;
    topComments.value = topComments.value.map(applyLikePatch);
    if (parentId) {
      const state = getChildReplyState(parentId);
      patchChildReplyState(parentId, { items: (state.items || []).map(applyLikePatch) });
    }
    if (!result?.ok) {
      showModal('error', '操作失败', result?.error?.message || '请稍后重试');
    }
  } catch (error) {
    logger.error('post-detail', '评论点赞失败:', error);
    comment._likePatch = {
      isLiked: comment.isLiked,
      like_count: Number(comment.like_count || 0),
      isLikeSubmitting: false,
    };
    topComments.value = topComments.value.map(applyLikePatch);
    if (parentId) {
      const state = getChildReplyState(parentId);
      patchChildReplyState(parentId, { items: (state.items || []).map(applyLikePatch) });
    }
    showModal('error', '操作失败', '请稍后重试');
  } finally {
    delete comment._likePatch;
  }
};

const loadTopComments = async ({ reset = false } = {}) => {
  if (!post.value?.id) return;
  if (isTopCommentsLoading.value) return;
  if (!reset && !hasMoreTopComments.value) return;

  isTopCommentsLoading.value = true;
  const pageToLoad = reset ? 1 : topCommentsPage.value;

  try {
    const result = await getComments(post.value.id, getCurrentUserId(), {
      topLevelOnly: true,
      page: pageToLoad,
      pageSize: TOP_LEVEL_PAGE_SIZE,
      order: commentSortMode.value,
    });

    const incoming = Array.isArray(result?.data) ? result.data : [];
    if (reset) {
      topComments.value = incoming;
      childRepliesMap.value = {};
      await preloadChildReplyPreviews(incoming);
    } else {
      const existing = new Set(topComments.value.map((item) => item.id));
      const merged = incoming.filter((item) => !existing.has(item.id));
      topComments.value = [...topComments.value, ...merged];
      await preloadChildReplyPreviews(merged);
    }

    hasMoreTopComments.value = Boolean(result?.hasMore);
    topCommentsPage.value = pageToLoad + 1;
    void hydrateCommentLikeState();
  } catch (error) {
    logger.error('post-detail', '加载顶层评论失败:', error);
  } finally {
    isTopCommentsLoading.value = false;
  }
};

const toIdKey = (value) => String(value || '').trim();

const getChildReplyState = (parentId) => {
  const key = String(parentId || '');
  return (
    childRepliesMap.value[key] || {
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

const patchChildReplyState = (parentId, patch) => {
  const key = String(parentId || '');
  const current = getChildReplyState(key);
  childRepliesMap.value = {
    ...childRepliesMap.value,
    [key]: {
      ...current,
      ...patch,
    },
  };
};

const loadChildReplyPreview = async (parentId) => {
  if (!post.value?.id || !parentId) return;
  const rootId = toIdKey(parentId);
  const state = getChildReplyState(rootId);
  if (state.isLoading || state.fullLoaded || Number(state.totalCount || 0) > 0) return;

  patchChildReplyState(rootId, { isLoading: true });
  try {
    const { data, error, hasMore } = await getCommentThreadReplies(
      post.value.id,
      rootId,
      getCurrentUserId(),
      {
        page: 1,
        pageSize: 1,
      },
    );

    if (error) throw error;
    const previewRows = Array.isArray(data) ? data.slice(0, 1) : [];

    patchChildReplyState(rootId, {
      items: previewRows,
      totalCount: previewRows.length,
      fullLoaded: !Boolean(hasMore),
      hasMore: Boolean(hasMore),
      page: 1,
      isLoading: false,
      expanded: false,
    });
  } catch (error) {
    logger.error('post-detail', '加载楼中楼预览失败:', error);
    patchChildReplyState(rootId, { isLoading: false, fullLoaded: true });
  }
};

const preloadChildReplyPreviews = async (comments = []) => {
  const safeComments = Array.isArray(comments) ? comments : [];
  if (safeComments.length === 0) return;

  const commentIds = safeComments.map((c) => c?.id).filter(Boolean);
  if (commentIds.length === 0) return;

  const postId = String(post.value?.id || '').trim();
  if (!postId) return;

  // RPC 路径：批量获取所有顶层评论的子回复预览
  try {
    const result = await getCommentThreadPreviewsBatch(postId, commentIds);
    if (!result?.error && !result?.fallback && Array.isArray(result?.data)) {
      const previewMap = new Map();
      for (const row of result.data) {
        if (row?.root_comment_id) {
          previewMap.set(String(row.root_comment_id), row);
        }
      }

      for (const id of commentIds) {
        const rootId = toIdKey(id);
        const state = getChildReplyState(rootId);
        if (state.isLoading || state.fullLoaded || Number(state.totalCount || 0) > 0) continue;

        const preview = previewMap.get(String(id));
        if (preview) {
          const previewRows = [preview];
          patchChildReplyState(rootId, {
            items: previewRows,
            totalCount: previewRows.length,
            fullLoaded: !Boolean(preview.has_more),
            hasMore: Boolean(preview.has_more),
            page: 1,
            isLoading: false,
            expanded: false,
          });
        } else {
          patchChildReplyState(rootId, {
            items: [],
            totalCount: 0,
            fullLoaded: true,
            hasMore: false,
            page: 1,
            isLoading: false,
            expanded: false,
          });
        }
      }
      return;
    }
  } catch (err) {
    logger.warn('post-detail', 'get_comment_thread_previews RPC 失败，降级到逐条加载', err);
  }

  // Fallback：原逐条并行加载（RPC 失败或不存在时降级）
  await Promise.allSettled(
    safeComments
      .filter((comment) => comment?.id)
      .map((comment) => loadChildReplyPreview(comment.id)),
  );
};

const loadChildReplies = async (parentId, { reset = false, expand = false } = {}) => {
  if (!post.value?.id || !parentId) return;
  const rootId = toIdKey(parentId);
  const state = getChildReplyState(rootId);
  if (state.isLoading) return;
  if (!reset && state.fullLoaded) return;
  patchChildReplyState(rootId, { isLoading: true });

  try {
    const { data, error, hasMore } = await getCommentThreadReplies(
      post.value.id,
      rootId,
      getCurrentUserId(),
      {
        page: reset ? 1 : state.page,
        pageSize: CHILD_REPLY_PAGE_SIZE,
      },
    );

    if (error) throw error;

    const incoming = Array.isArray(data) ? data : [];
    const existingItems = reset ? [] : state.items || [];
    const existingIds = new Set(existingItems.map((item) => String(item.id)));
    const threadReplies = [
      ...existingItems,
      ...incoming.filter((item) => !existingIds.has(String(item.id))),
    ];

    patchChildReplyState(rootId, {
      items: threadReplies,
      totalCount: threadReplies.length,
      fullLoaded: !Boolean(hasMore),
      hasMore: Boolean(hasMore),
      page: (reset ? 1 : state.page) + 1,
      isLoading: false,
      expanded: Boolean(expand || state.expanded) && threadReplies.length > 0,
    });
    void hydrateCommentLikeState();
  } catch (error) {
    logger.error('post-detail', '加载楼中楼评论失败:', error);
    patchChildReplyState(rootId, { isLoading: false });
  }
};

const toggleChildReplies = async (parentComment) => {
  if (!parentComment?.id) return;
  const state = getChildReplyState(parentComment.id);
  const hasLoadedPreview = Number(state.totalCount || 0) > 0;

  if (state.expanded) {
    patchChildReplyState(parentComment.id, { expanded: false });
    return;
  }

  if (!hasLoadedPreview && !state.fullLoaded) {
    await loadChildReplies(parentComment.id, { reset: true, expand: true });
    return;
  }

  if (hasLoadedPreview && !state.fullLoaded) {
    await loadChildReplies(parentComment.id, { reset: true, expand: true });
    return;
  }

  const nextState = getChildReplyState(parentComment.id);
  patchChildReplyState(parentComment.id, {
    expanded: Number(nextState.totalCount || 0) > 1,
    totalCount: Number(nextState.totalCount || 0),
  });
};

const scrollToComment = async (commentId) => {
  await nextTick();
  const el = document.getElementById(`comment-${commentId}`);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  highlightedCommentId.value = String(commentId || '');
  window.setTimeout(() => {
    if (highlightedCommentId.value === String(commentId || '')) {
      highlightedCommentId.value = '';
    }
  }, 2200);
  return true;
};

const ensureTopCommentLoaded = async (targetCommentId) => {
  const targetId = String(targetCommentId || '').trim();
  if (!targetId) return false;
  if (topComments.value.some((item) => String(item.id) === targetId)) return true;

  while (hasMoreTopComments.value) {
    await loadTopComments({ reset: false });
    if (topComments.value.some((item) => String(item.id) === targetId)) return true;
  }

  return false;
};

const ensureChildCommentLoaded = async (parentId, targetCommentId) => {
  const targetId = String(targetCommentId || '').trim();
  if (!targetId) return false;

  let state = getChildReplyState(parentId);
  if (!state.fullLoaded) {
    await loadChildReplies(parentId, { reset: true });
    state = getChildReplyState(parentId);
  }

  if ((state.items || []).some((item) => String(item.id) === targetId)) {
    return true;
  }

  while (state.hasMore) {
    await loadChildReplies(parentId, { reset: false });
    state = getChildReplyState(parentId);
    if ((state.items || []).some((item) => String(item.id) === targetId)) {
      return true;
    }
  }

  return false;
};

const resolveRootCommentId = async (comment) => {
  const commentId = String(comment?.id || '').trim();
  const postId = String(post.value?.id || '').trim();

  // RPC 路径：一次性获取祖先链
  if (commentId && postId) {
    try {
      const result = await getCommentAncestors(commentId, postId);
      if (
        !result?.error &&
        !result?.fallback &&
        Array.isArray(result?.data) &&
        result.data.length > 0
      ) {
        const ancestors = result.data;
        for (const ancestor of ancestors) {
          const depth = Number(ancestor?.depth ?? 0);
          if (depth === 0) continue;

          const status = String(ancestor?.status || 'approved')
            .trim()
            .toLowerCase();
          if (status !== 'approved') {
            return String(ancestor?.id || '').trim();
          }
          if (!ancestor?.parent_id) {
            return String(ancestor?.id || '').trim();
          }
        }
        const last = ancestors[ancestors.length - 1];
        return String(last?.parent_id || last?.id || '').trim();
      }
    } catch (err) {
      logger.warn('post-detail', 'get_comment_ancestors RPC 失败，降级到循环查询', err);
    }
  }

  // Fallback：原循环逻辑（RPC 失败或不存在时降级）
  let current = comment;
  const visited = new Set();

  for (let depth = 0; depth < 12; depth += 1) {
    const currentId = String(current?.id || '').trim();
    const parentId = String(current?.parent_id || '').trim();
    if (!currentId || !parentId || visited.has(currentId)) {
      return currentId;
    }

    visited.add(currentId);
    const { data: parentComment, error } = await supabase
      .from('comments')
      .select('id, parent_id, post_id, status')
      .eq('id', parentId)
      .eq('post_id', post.value.id)
      .single();

    const parentStatus = String(parentComment?.status || 'approved')
      .trim()
      .toLowerCase();
    if (error || !parentComment || parentStatus !== 'approved') {
      return parentId;
    }

    if (!parentComment.parent_id) {
      return parentComment.id;
    }
    current = parentComment;
  }

  return String(current?.parent_id || current?.id || '').trim();
};

const handleCommentDeepLink = async () => {
  // 弹窗模式无 URL query 深链，跳过
  if (props.modalMode) return;
  const targetCommentId = String(route.query.comment || '').trim();
  if (!targetCommentId || !post.value?.id) return;

  const { data: targetComment, error } = await supabase
    .from('comments')
    .select('id, parent_id, post_id, status')
    .eq('id', targetCommentId)
    .eq('post_id', post.value.id)
    .single();

  const targetStatus = String(targetComment?.status || 'approved')
    .trim()
    .toLowerCase();
  if (error || !targetComment || targetStatus !== 'approved') {
    return;
  }

  if (!targetComment.parent_id) {
    const loaded = await ensureTopCommentLoaded(targetComment.id);
    if (loaded) {
      await scrollToComment(targetComment.id);
    }
    return;
  }

  const rootCommentId = await resolveRootCommentId(targetComment);
  const parentLoaded = await ensureTopCommentLoaded(rootCommentId);
  if (!parentLoaded) return;

  patchChildReplyState(rootCommentId, { expanded: true });
  const childLoaded = await ensureChildCommentLoaded(rootCommentId, targetComment.id);
  if (childLoaded) {
    await scrollToComment(targetComment.id);
  }
};

// 官方卡（新闻/活动镜像）的图只存在 posts.cover_image_url（forum_post_images 表无行），
// 且老数据封面是 `@/assets/...` Vite 资源引用，须经 resolveStoredCoverUrl 解析（与列表页同链路）
const buildCoverFallbackImage = (postData) => {
  const rawCoverUrl = resolveStoredCoverUrl(
    postData?.cover_image_url || postData?.coverImageUrl || '',
  );
  if (!rawCoverUrl) return null;
  const fallbackImage = normalizeForumImage(
    {
      id: `${String(postData?.id || 'post').trim()}-cover-fallback`,
      url: rawCoverUrl,
      width: Number(postData?.cover_image_width || postData?.coverImageWidth || 0),
      height: Number(postData?.cover_image_height || postData?.coverImageHeight || 0),
      sortOrder: 0,
    },
    { variant: 'detail' },
  );
  // 标记 fallback 来源：hasMedia（弹窗媒体列）只认正文图，cover 不撑起媒体列
  return fallbackImage ? { ...fallbackImage, isCoverFallback: true } : null;
};

// ===== 官方镜像卡正文回源 =====
// 论坛官方卡是新闻/活动的镜像帖，posts.content 只带摘要；
// 详情页按 source_type + source_id 回原表取完整正文（缺 source_id 的旧卡按标题兜底，
// 与 Forum 的 hydrateOfficialPostKinds 同口径）。
const OFFICIAL_SOURCE_SELECTS = {
  news: 'id, title, content, image',
  activity: 'id, title, description, image',
};

const fetchOfficialSourceRow = async (sourceType, sourceId, title) => {
  const table = sourceType === 'news' ? 'news' : 'activities';
  const select = OFFICIAL_SOURCE_SELECTS[sourceType];
  const safeSourceId = String(sourceId || '').trim();
  if (safeSourceId) {
    const { data } = await supabase.from(table).select(select).eq('id', safeSourceId).maybeSingle();
    if (data) return data;
  }
  const safeTitle = String(title || '').trim();
  if (safeTitle && safeTitle !== '无标题') {
    const { data } = await supabase
      .from(table)
      .select(select)
      .eq('title', safeTitle)
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }
  return null;
};

const hydrateOfficialSourceContent = async (requestSeq, postRow) => {
  try {
    const sourceType =
      String(postRow?.source_type || '')
        .trim()
        .toLowerCase() ||
      String(postRow?.post_kind || '')
        .trim()
        .toLowerCase();
    if (sourceType !== 'news' && sourceType !== 'activity') return;
    const row = await fetchOfficialSourceRow(
      sourceType,
      postRow?.source_id,
      extractPostTitle(postRow),
    );
    if (requestSeq !== detailFetchSeq || !row) return;
    if (sourceType === 'news') {
      officialContent.value = {
        type: 'news',
        html: DOMPurify.sanitize(String(row.content || ''), NEWS_SANITIZE_OPTIONS),
        paragraphs: [],
      };
    } else {
      officialContent.value = {
        type: 'activity',
        html: '',
        paragraphs: String(row.description || '')
          .split(/\r?\n+/)
          .map((part) => part.trim())
          .filter(Boolean),
      };
    }

    // 官方卡封面回源：镜像帖缺 cover_image_url（或解析失败）时详情页图区为空，
    // 用原表 image 补上（老数据是 @/assets 引用，须先解析成打包 URL）
    const currentPost = post.value;
    if (
      currentPost &&
      requestSeq === detailFetchSeq &&
      !(Array.isArray(currentPost.images) && currentPost.images.length)
    ) {
      const rawCover = resolveStoredCoverUrl(row.image || '');
      if (rawCover) {
        currentPost.images = [
          normalizeForumImage(
            {
              id: `${String(currentPost.id || 'post').trim()}-official-cover`,
              url: rawCover,
              sortOrder: 0,
            },
            { variant: 'detail' },
          ),
        ];
        detailImageIndex.value = 0;
      }
    }
  } catch (error) {
    // 回源失败降级为摘要展示，不打断详情页
    logger.error('post-detail', '官方卡正文回源失败:', error);
  }
};

const fetchPostDetail = async () => {
  const requestSeq = ++detailFetchSeq;
  isLoading.value = true;
  officialContent.value = { type: '', html: '', paragraphs: [] };
  quotedPost.value = null;
  try {
    const currentUserId = getCurrentUserId();
    const isAdmin = Boolean(isLoggedIn.value && userInfo.role === 'admin');

    let query = supabase
      .from('posts')
      .select(
        `
        *,
        author:author_id(avatar_url, avatar_frame_url)
      `,
      )
      .eq('id', postId.value);

    if (!isAdmin) {
      const safeCurrentUserId = String(currentUserId || '').trim();
      const statusFilter = safeCurrentUserId
        ? `status.is.null,status.eq.approved,and(status.eq.limited,author_id.eq.${safeCurrentUserId}),and(status.eq.rejected,author_id.eq.${safeCurrentUserId})`
        : 'status.is.null,status.eq.approved';
      query = query.or(statusFilter);
    }

    const { data, error } = await query.single();

    if (error) throw error;

    if (data) {
      const [isLiked, imagesRes] = await Promise.all([
        currentUserId ? checkIfLiked(data.id, currentUserId) : Promise.resolve(false),
        getForumPostImages(data.id),
      ]);

      if (requestSeq !== detailFetchSeq) return;

      // 图片：优先取 forum_post_images 表行；为空（官方卡新闻/活动）时用封面兜底，
      // 避免列表有图、详情无图的不一致
      const fetchedImages = imagesRes.ok ? imagesRes.data : [];
      const coverFallback = fetchedImages.length ? null : buildCoverFallbackImage(data);

      post.value = {
        ...data,
        isLiked,
        comment_count: Number(data.comment_count || 0),
        like_count: Number(data.like_count || 0),
        author_avatar_url: data.author?.avatar_url,
        author_avatar_frame_url: data.author?.avatar_frame_url || null,
        images: coverFallback ? [coverFallback] : fetchedImages,
      };
      detailImageIndex.value = 0;
      isLoading.value = false;

      // 官方镜像卡：后台回源完整正文（不阻塞首屏，失败降级为摘要）
      void hydrateOfficialSourceContent(requestSeq, post.value);

      // 转发帖：回源被引用的原帖（引用框展示）
      if (data.post_kind === 'repost' && data.repost_of_post_id) {
        const quotedId = String(data.repost_of_post_id);
        void (async () => {
          try {
            const { data: quotedRow } = await supabase
              .from('posts')
              .select('id, title, body, content, author_id, author_username, created_at')
              .eq('id', quotedId)
              .maybeSingle();
            if (requestSeq !== detailFetchSeq || !quotedRow) return;
            quotedPost.value = quotedRow;
          } catch (error) {
            logger.warn('post-detail', '转发原帖回源失败（引用框降级隐藏）', error);
          }
        })();
      }

      resetCommentState();
      void (async () => {
        await loadTopComments({ reset: true });
        if (requestSeq !== detailFetchSeq) return;
        await handleCommentDeepLink();
      })();
    }
  } catch (err) {
    if (requestSeq !== detailFetchSeq) return;
    logger.error('post-detail', '获取帖子详情失败:', err);
    post.value = null;
  } finally {
    if (requestSeq === detailFetchSeq && isLoading.value) {
      isLoading.value = false;
    }
  }
};

onMounted(() => {
  currentTheme.value = themeManager.getTheme();
  themeManager.addListener(handleThemeChange);
  /* 页根的 `pd-page-enter` 是 260ms 且 `fill: backwards`（从 opacity 0 起）——
     晚一帧再关就等于白闪一帧，所以这里**同步**挂 `is-morph-entry`，不等任何
     `nextTick`。没有入口矩形（深链 / 刷新直接进）就不挂，保留原有整页淡入。
     ⚠️ 这个类**永久不摘**，理由见 style.scoped.css 末尾那段注释。 */
  if (!props.modalMode) {
    const hasOrigin = Boolean(peekOrigin(`post-detail:${postId.value}`));
    if (hasOrigin) detailPageRoot.value?.classList.add('is-morph-entry');
  }
  /* 入场形变在**导航那一刻**起跑（不等数据），而且必须**同步**跑：
     函数体在第一个 `await` 之前会把 clipPath / veil 落到 DOM 上，
     晚一帧就等于把「全尺寸骨架」闪一下（实测 open-150 那一帧）。 */
  void playDetailEntryMorph();
  fetchPostDetail();
  document.addEventListener('click', handleDocumentClick);
  releaseEditPortraitWatch = onForumPortraitComposerChange((matches) => {
    isEditPortrait.value = matches;
  });
  if (typeof window !== 'undefined' && window.visualViewport) {
    dockViewportHandler = updatePageDockInset;
    window.visualViewport.addEventListener('resize', dockViewportHandler);
    window.visualViewport.addEventListener('scroll', dockViewportHandler);
    updatePageDockInset();
  }
  narrowDetailOff = onNarrowDetailChange((matches) => {
    isNarrowDetail.value = matches;
  });
  isNarrowDetail.value = isNarrowDetailViewport();
  window.addEventListener('keydown', handleDetailKeydown);
});

/* ── 竖屏整页版**离场**过渡（2026-10-22） ─────────────────────────────
   进场上一条 CSS animation 已解决（元素插入即播，不依赖父级挂类）。
   离场是另一码事：Vue 卸载节点后元素就没了，CSS 无从播放，必须先把导航
   **推迟一帧再放行**。

   为什么不给 App.vue 加路由级 <Transition>：那里已有实测结论 ——
   过渡类名从未被加上（MutationObserver + rAF 两种独立探测一致），
   所以只能在本组件内部用导航守卫解决。

   机制：onBeforeRouteLeave 返回 Promise，等动画跑完再 resolve。
   · 覆盖全部退出路径：goBack 的 router.back()、两处 router.replace()，
     以及浏览器后退按钮 —— 它们都要过路由守卫，这是唯一收口点；
   · `let leaving = false` 防重入：守卫在 promise 期间若被再次触发
     （用户连点后退），必须直接放行，否则会形成等待自己的死锁；
   · 只在该组件是**整页版**（非弹窗）时启用 —— 弹窗由 .pd-modal-* 过渡负责，
     叠加会导致两套动画同时跑；
   · 留出 --pd-leave-ms 给 CSS 与 JS 共享时长，避免两处写死不一致；
   · prefers-reduced-motion 直接放行，不做无意义的等待。 */
/* 能承载「入口那张卡」的列表宿主路由名：首页 `/` 与用户中心 `/user-space`。
   返程收缩只对这两个目的地生效 —— 去引用帖（PostDetail）或作者主页（UserProfile）
   时没有卡片可落，照旧收缩会折到一个不存在的位置。 */
const LIST_ROUTE_NAMES = new Set(['Home', 'UserSpace']);

let leaving = false;
onBeforeRouteLeave((to) => {
  if (props.modalMode) return true; // 弹窗态：由 PostDetailModal 的过渡接管
  if (typeof window === 'undefined') return true;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
  if (leaving) return true; // 防重入：已在离场中，不要再等一轮

  const rootEl = detailPageRoot.value;
  if (!rootEl) return true;

  leaving = true;
  /* 返程收缩（plans/035 §L3）：此刻目标卡片还不存在（列表已被卸载、返回要重新挂载
     并还原滚动），所以只能把正文卡**克隆**出去收缩 —— 克隆在 body 下，页面卸载不影响它。
     与下面的整页淡出并行：页面壳（页头/底栏）淡掉，正文卡由克隆接住一路收成卡片。
     没有入口矩形（深链/刷新直接进的详情）就什么都不做，保持原有淡出。

     ⚠️ **只对「回列表」生效**。详情页不只往列表走：点引用帖会 push 另一条 PostDetail，
     点作者会去 UserProfile —— 那些目的地根本没有「入口那张卡」，照旧收缩就是
     「这一页折进了一个不存在的位置」。判据是目的路由是不是列表宿主（首页 / 用户中心）。 */
  if (entryOriginRect && LIST_ROUTE_NAMES.has(String(to?.name || ''))) {
    /* 克隆的**必须是 `.detail-container`**，与入场窗口的终点同一个盒子 ——
       入场是「这个盒子从卡片矩形张开」，返程是「这个盒子收回到卡片矩形」，
       两边同一口径才不会出现「进去时从 y=0 张开、出来时只从 y=80 收起」的错位。

       以前克隆的是正文卡 `.x-post-card`，它同时带 `.glass-panel`，在页面上靠
       `.post-detail-page .x-post-card { background: transparent; border-radius: 0 }`
       覆盖成「无底直角」；克隆挂到 body 下后祖先选择器不再命中，于是整块塌成
       白玻璃（rgba(255,255,255,.8) + 24px 圆角 + 阴影）—— 这就是用户看到的
       「返回时一块异常白色区块」。现在由 morph-layer 建一层页面根的样式上下文壳，
       并显式垫上页面底色，观感才回到「这一页被收进那一格」。 */
    const ghostSource = detailContainerRef.value;
    const pageBg = getComputedStyle(rootEl).backgroundColor;
    /* 先把「刚才那张列表」的快照铺到最底下（点击时就采好的，见 page-snapshot.js）：
       返回时列表是**重新挂载**的，实测 400ms 时 feed 里 0 张卡、1–2s 才换成真卡片。
       这段时间正好和收缩重叠，不盖就是「窗口在缩、背后一片白」。
       垫层会自己盯着真列表 —— 卡片一出现就摘掉，交接看不出来。 */
    mountPageSnapshot();
    if (ghostSource) {
      void playCollapseMorph(ghostSource, entryOriginRect, {
        duration: motionMs('--motion-morph-out', 340),
        context: rootEl,
        backdrop: pageBg,
      });
    }

    /* 返回列表期间，列表绝不能重播自己的入场动画（2026-10-31 修「关闭闪屏」）。
       病灶：列表组件是重新挂载的，`.post-card-v2` 每次都从 `opacity: 0` 播
       forumPostCardEnter（420ms + 最多 360ms 交错延迟），而这 300ms 正好是
       克隆窗口收缩、背后**应该**已经露出卡片的那段时间 —— 两者撞上就是「白底上
       一扇窗口在缩，缩完才闪出一批卡片」。
       做法：在 `<html>` 上挂一次性标记，列表侧 CSS 命中后跳过入场（见
       `Forum/styles/feed.css` 与 `UserSpace/styles/shell-community.css`）。
       ⚠️ **自摘时刻的起算点是「列表挂载」而不是这里**（原来是 900ms 硬定时器，
       实测会 re-seek 回动画中间帧 → 用户报的「列表整个像刷新了一样抖了一下」）。
       细节与实测数据见 `utils/detail-return-flag.js` 文件头。 */
    markDetailReturning();
  }
  rootEl.classList.add('is-page-leaving');
  return new Promise((resolve) => {
    const done = () => {
      rootEl.classList.remove('is-page-leaving');
      leaving = false;
      resolve(true);
    };
    // 兜底超时：即便 transitionend 因元素被隐藏/reduced-motion 等原因没触发，
    // 也绝不能把用户卡在详情页里（宁可动画不完整，也不能导航失效）。
    const timer = setTimeout(done, 320);
    rootEl.addEventListener(
      'animationend',
      () => {
        clearTimeout(timer);
        done();
      },
      { once: true },
    );
  });
});

onUnmounted(() => {
  themeManager.removeListener(handleThemeChange);
  document.removeEventListener('click', handleDocumentClick);
  window.removeEventListener('keydown', handleDetailKeydown);
  releaseEditPortraitWatch?.();
  releaseEditPortraitWatch = null;
  if (dockViewportHandler && window.visualViewport) {
    window.visualViewport.removeEventListener('resize', dockViewportHandler);
    window.visualViewport.removeEventListener('scroll', dockViewportHandler);
  }
  dockViewportHandler = null;
  if (narrowDetailOff) {
    narrowDetailOff();
    narrowDetailOff = null;
  }
  if (cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
  if (likePulseTimer) {
    clearTimeout(likePulseTimer);
    likePulseTimer = null;
  }
  if (replySuccessTimer) {
    clearTimeout(replySuccessTimer);
    replySuccessTimer = null;
  }
  if (shareCopiedTimer) {
    clearTimeout(shareCopiedTimer);
    shareCopiedTimer = null;
  }
  closeConfirm(false);
});

const resetDetailViewState = () => {
  post.value = null;
  officialContent.value = { type: '', html: '', paragraphs: [] };
  quotedPost.value = null;
  activeReplyId.value = null;
  replyToUser.value = null;
  activeReplyQuote.value = '';
  replyContent.value = '';
  isExpanded.value = false;
  isLikePulsing.value = false;
  isReplySuccessPopping.value = false;
  isShareCopied.value = false;
  isDetailImageViewerOpen.value = false;
  closePostMenu();
  detailImageIndex.value = 0;
  resetCommentState();
  resetEditState();
};

// 激活帖子 id：整页模式跟路由参数，弹窗模式跟宿主传入的 override。
const activePostIdSource = computed(() =>
  props.modalMode ? props.postIdOverride : route.params.id,
);

watch(activePostIdSource, () => {
  resetDetailViewState();
  fetchPostDetail();
});

watch(
  () => detailImages.value.length,
  (total) => {
    if (detailImageIndex.value >= total) {
      detailImageIndex.value = Math.max(0, total - 1);
    }
  },
);

watch(
  () => route.query.comment,
  async () => {
    if (props.modalMode) return;
    if (!post.value?.id || isLoading.value) return;
    await handleCommentDeepLink();
  },
);

const handleToggleLike = async () => {
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }
  if (!post.value?.id) return;
  if (isLikeSubmitting.value) return;

  isLikeSubmitting.value = true;
  try {
    const { action, data, error } = await toggleLike(post.value.id, userInfo.id);

    if (error) {
      logger.error('post-detail', '点赞失败:', error);
      return;
    }

    const nextIsLiked = typeof data?.isLiked === 'boolean' ? data.isLiked : action === 'liked';

    if (action === 'liked') {
      post.value.like_count = Number(data?.likeCount ?? Number(post.value.like_count || 0) + 1);
      post.value.isLiked = nextIsLiked;
    } else if (action === 'unliked') {
      post.value.like_count = Number.isFinite(Number(data?.likeCount))
        ? Number(data.likeCount)
        : Math.max(0, Number(post.value.like_count || 0) - 1);
      post.value.isLiked = nextIsLiked;
    }
    triggerLikePulse();

    emitProfileSync({
      userId: post.value.author_id,
      username: post.value.author_username,
      reason: action === 'liked' ? 'post_liked' : 'post_unliked',
    });
  } catch (error) {
    logger.error('post-detail', '点赞异常:', error);
  } finally {
    setTimeout(() => {
      isLikeSubmitting.value = false;
    }, 300);
  }
};

const toggleReplyInput = (
  targetId = null,
  username = null,
  _quotedContent = '',
  rootAuthorUsername = null,
) => {
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }

  const replyTargetId = targetId || post.value.id;
  if (activeReplyId.value === replyTargetId) {
    activeReplyId.value = null;
    replyToUser.value = null;
    activeReplyQuote.value = '';
    replyContent.value = '';
    // 取消回复 = 还原单行紧凑态（弹窗模式随后会把焦点放回底栏，届时按聚焦规则再展开）
    isReplyExpanded.value = false;
    // 弹窗模式：取消回复后焦点回到底栏
    if (props.modalMode) focusModalReply();
  } else {
    activeReplyId.value = replyTargetId;
    replyToUser.value = username;
    activeReplyQuote.value = '';
    // 直接回复楼层根评论（发出这条评论的人）时不预填 @ —— 从属关系已由楼层表达；
    // 只有回复楼里其他子评论时才预填 @ 指明对象（与标签显示同一判据）。
    replyContent.value = shouldShowReplyTarget(username, rootAuthorUsername)
      ? buildReplyDraft(username)
      : '';

    // 弹窗模式：底栏是唯一输入框，聚焦并把上下文同步到底栏
    if (props.modalMode) {
      focusModalReply();
      return;
    }

    setTimeout(() => {
      const element = document.querySelector('.x-reply-box, .reply-section');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const textarea = element.querySelector('textarea');
        if (textarea) textarea.focus();
      }
    }, 100);
  }
};

const submitReply = async () => {
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }

  // 检查用户禁言状态
  if (userInfo.isMuted) {
    // 判断禁言是否有效：永久禁言或临时禁言未过期
    const isPermanentMute = !userInfo.mutedUntil;
    const isTempMuteActive = userInfo.mutedUntil && new Date(userInfo.mutedUntil) > new Date();

    if (isPermanentMute || isTempMuteActive) {
      let muteMessage = '您已被禁言，无法发表评论。';
      if (userInfo.muteReason) {
        muteMessage += ` 原因：${userInfo.muteReason}`;
      }
      if (userInfo.mutedUntil) {
        const expiryDate = new Date(userInfo.mutedUntil);
        muteMessage += ` 解禁时间：${expiryDate.toLocaleDateString('zh-CN')}`;
      } else {
        muteMessage += '（永久禁言）';
      }
      showModal('warning', '禁言提示', muteMessage);
      return;
    }
    // 临时禁言已过期，允许操作
  }

  if (isReplySubmitting.value) return;
  if (replyCooldownSeconds.value > 0) {
    showModal('warning', '回复太频繁', `请 ${replyCooldownSeconds.value} 秒后再试`);
    return;
  }

  if (!replyContent.value.trim()) {
    showModal('warning', '提示', '回复内容不能为空');
    return;
  }

  isReplySubmitting.value = true;
  try {
    const commentStatus = 'approved';
    const isReplyToComment = activeReplyId.value !== post.value.id;
    const parentId = isReplyToComment ? activeReplyId.value : null;
    const replyToUsername = isReplyToComment ? replyToUser.value : null;

    const rawReplyContent = replyContent.value.trim();

    const { error } = await createComment(
      post.value.id,
      rawReplyContent,
      userInfo.id,
      userInfo.username,
      commentStatus,
      parentId,
      replyToUsername,
    );

    if (error) throw error;
    replyContent.value = '';
    activeReplyId.value = null;
    replyToUser.value = null;
    activeReplyQuote.value = '';
    // 发送成功 ⇒ 还原原始（单行紧凑）状态
    isReplyExpanded.value = false;

    if (parentId) {
      patchChildReplyState(parentId, { expanded: true });
      await loadChildReplies(parentId, { reset: true });
    } else {
      await loadTopComments({ reset: true });
    }

    await refreshPostStats();

    triggerReplySuccessPop();
    showModal('success', '回复成功', '您的回复已发布');
    emitProfileSync({
      userId: userInfo.id,
      username: userInfo.username,
      reason: 'comment_created',
    });
  } catch (error) {
    logger.error('post-detail', '回复失败:', error);
    applyRateLimitCooldown(error);
    showModal('error', '发送失败', error?.message || '请稍后重试');
  } finally {
    setTimeout(() => {
      isReplySubmitting.value = false;
    }, 300);
  }
};

const handleDeletePost = async () => {
  closePostMenu();
  const confirmed = await requestConfirm({
    title: '删除帖子',
    message: '帖子和评论将一并删除，且无法恢复，确定继续吗？',
    confirmText: '删除',
  });
  if (!confirmed) return;

  try {
    const { success, error } = await deletePost(post.value.id, userInfo.id, userInfo.role);
    if (!success) {
      showModal('error', '删除失败', error || '请稍后重试');
      return;
    }

    emitProfileSync({
      userId: post.value.author_id,
      username: post.value.author_username,
      reason: 'post_deleted',
    });
    clearForumFeedSnapshots();
    window.dispatchEvent(
      new CustomEvent('boh:forum-post-deleted', {
        detail: { postId: post.value.id },
      }),
    );
    goBack();
  } catch (error) {
    logger.error('post-detail', '删除失败:', error);
    showModal('error', '删除失败', error?.message || '请稍后重试');
  }
};

const handleReportPost = async () => {
  closePostMenu();
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }
  if (!post.value?.id || isReportSubmitting.value) return;
  if (String(post.value.author_id || '') === String(userInfo.id || '')) {
    showModal('warning', '无法举报', '不能举报自己的帖子');
    return;
  }

  reportForm.value = { reason: 'other', detail: '' };
  isReportModalOpen.value = true;
};

const closeReportModal = () => {
  if (isReportSubmitting.value) return;
  isReportModalOpen.value = false;
  reportForm.value = { reason: 'other', detail: '' };
};

const submitReportPost = async () => {
  if (!post.value?.id || isReportSubmitting.value) return;
  const reason = String(reportForm.value.reason || 'other').trim() || 'other';
  const detail = String(reportForm.value.detail || '').trim();

  isReportSubmitting.value = true;
  try {
    const result = await reportPost(post.value.id, reason, detail);
    if (!result.ok) {
      showModal('error', '举报失败', result.error?.message || '请稍后重试');
      return;
    }

    if (result.data?.limited) {
      isReportModalOpen.value = false;
      showModal(
        'success',
        '举报已提交',
        result.data?.message || '该帖子已因多人举报暂时设为仅作者可见',
      );
      // goBack 在弹窗模式下等价于关闭弹窗
      goBack();
      return;
    }

    isReportModalOpen.value = false;
    showModal('success', '举报已提交', result.data?.message || '感谢你的反馈，我们会继续核查');
  } catch (error) {
    showModal('error', '举报失败', error?.message || '请稍后重试');
  } finally {
    isReportSubmitting.value = false;
  }
};

const startEditPost = () => {
  closePostMenu();
  if (!post.value) return;
  const title = extractPostTitle(post.value);
  const body = extractPostBody(post.value);
  editNewPost.value = { title, content: body };
  editSelectedPostTag.value = normalizeForumTag(post.value.tag) || 'daily';
  // 已有图片（detailImages 来自 getForumPostImages，已 normalize）
  editPostImages.value = detailImages.value.map((image) => ({
    ...image,
    isExisting: true,
    uploadStatus: 'approved',
    sortOrder: image.sortOrder,
  }));
  editRemovedExistingIds.value = new Set();
  editImageUploadStatus.value = '';
  isEditUploadingPostImage.value = false;
  // 打开编辑时同步一次最新判据（订阅已实时维护，这里防御性刷新）
  isEditPortrait.value = isForumPortraitComposer();
  isEditingPost.value = true;
};

const hasEditUnsavedChanges = () => {
  if (!post.value) return false;
  if (String(editNewPost.value.title || '') !== extractPostTitle(post.value)) return true;
  if (String(editNewPost.value.content || '') !== extractPostBody(post.value)) return true;
  if (editPostImages.value.length !== detailImages.value.length) return true;
  if (editRemovedExistingIds.value.size > 0) return true;
  if (editPostImages.value.some((image) => image?.file || image?.uploadId)) return true;
  return false;
};

const resetEditState = () => {
  isEditingPost.value = false;
  editNewPost.value = { title: '', content: '' };
  editSelectedPostTag.value = 'daily';
  editPostImages.value = [];
  editRemovedExistingIds.value = new Set();
  editImageUploadStatus.value = '';
  isEditUploadingPostImage.value = false;
};

const cancelEditPost = async () => {
  if (isEditSubmitting.value) return;
  if (hasEditUnsavedChanges()) {
    const confirmed = await requestConfirm({
      title: '放弃修改',
      message: '当前修改尚未保存，确定放弃吗？',
      confirmText: '放弃修改',
      cancelText: '继续编辑',
    });
    if (!confirmed) return;
  }
  resetEditState();
};

const handleEditImageSelection = async ({ files, event } = {}) => {
  const fileList = Array.from(files || event?.target?.files || []);
  if (!fileList.length || isEditSubmitting.value) return;
  const remaining = Math.max(0, FORUM_POST_IMAGE_MAX_COUNT - editPostImages.value.length);
  if (remaining <= 0) {
    showModal('warning', '图片已满', `每个帖子最多 ${FORUM_POST_IMAGE_MAX_COUNT} 张图片`);
    return;
  }
  const selectedFiles = fileList.slice(0, remaining);
  for (const file of selectedFiles) {
    await enqueueEditImageUpload(file);
  }
};

const enqueueEditImageUpload = async (file) => {
  const uploadId = `edit-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let localPreviewUrl = '';
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      localPreviewUrl = URL.createObjectURL(file);
    } catch {
      /* ignore */
    }
  }
  const pending = {
    id: uploadId,
    uploadId,
    name: String(file?.name || '图片').trim(),
    file,
    url: localPreviewUrl,
    localPreviewUrl,
    uploadStatus: 'uploading',
    uploadStatusLabel: '上传中',
    sortOrder: editPostImages.value.length,
  };
  editPostImages.value = [...editPostImages.value, pending];
  isEditUploadingPostImage.value = true;
  editImageUploadStatus.value = '正在检测并上传图片…';
  try {
    const result = await uploadForumImage(file);
    const index = editPostImages.value.findIndex((image) => image.uploadId === uploadId);
    if (index < 0) return;
    const next = [...editPostImages.value];
    if (result.ok && result.data) {
      next[index] = {
        ...result.data,
        uploadId,
        uploadStatus: 'approved',
        uploadStatusLabel: '',
        sortOrder: index,
      };
    } else {
      next[index] = {
        ...pending,
        uploadStatus: 'failed',
        uploadStatusLabel: '未通过',
        uploadError: result.error?.message || '图片上传失败',
      };
    }
    editPostImages.value = next;
  } finally {
    isEditUploadingPostImage.value = false;
    editImageUploadStatus.value = '';
  }
};

const handleEditRemoveImage = (image, index) => {
  if (isEditSubmitting.value) return;
  if (image?.isExisting && image?.id) {
    editRemovedExistingIds.value = new Set([...editRemovedExistingIds.value, String(image.id)]);
  }
  if (image?.localPreviewUrl && typeof URL !== 'undefined') {
    try {
      URL.revokeObjectURL(image.localPreviewUrl);
    } catch {
      /* ignore */
    }
  }
  editPostImages.value = editPostImages.value
    .filter((_, itemIndex) => itemIndex !== index)
    .map((item, itemIndex) => ({ ...item, sortOrder: itemIndex }));
};

const handleEditReorderImage = ({ fromIndex, toIndex } = {}) => {
  const from = Number(fromIndex);
  const to = Number(toIndex);
  const total = editPostImages.value.length;
  if (!Number.isInteger(from) || !Number.isInteger(to)) return;
  if (from < 0 || from >= total || to < 0 || to >= total || from === to) return;
  const images = [...editPostImages.value];
  const [moved] = images.splice(from, 1);
  images.splice(to, 0, moved);
  editPostImages.value = images.map((item, itemIndex) => ({ ...item, sortOrder: itemIndex }));
};

const handleEditClearImages = () => {
  if (isEditSubmitting.value) return;
  editPostImages.value.forEach((image) => {
    if (image?.isExisting && image?.id) {
      editRemovedExistingIds.value = new Set([...editRemovedExistingIds.value, String(image.id)]);
    }
  });
  editPostImages.value = [];
};

const submitEditPost = async () => {
  if (isEditSubmitting.value) return;

  const title = String(editNewPost.value.title || '').trim();
  const body = String(editNewPost.value.content || '').trim();
  if (!title || !body) {
    showModal('warning', '提示', '请填写标题和正文');
    return;
  }
  if (editPostImages.value.some((image) => image.uploadStatus === 'uploading')) {
    showModal('warning', '提示', '图片还在上传中，请稍候再保存');
    return;
  }
  if (editPostImages.value.some((image) => image.uploadStatus === 'failed')) {
    showModal('warning', '提示', '有图片上传失败，请移除后重试或换一张图片');
    return;
  }

  isEditSubmitting.value = true;
  try {
    const { success, error } = await updatePost(
      post.value.id,
      body,
      userInfo.id,
      userInfo.role,
      title,
    );
    if (!success) {
      showModal('error', '保存失败', error || '请稍后重试');
      return;
    }

    // 图片集合：保留图传 id，新图传上传完成的元数据
    const imagesPayload = editPostImages.value.map((image) => {
      if (image?.isExisting && image?.id) {
        return { id: String(image.id) };
      }
      return {
        url: image?.originalUrl || image?.url || '',
        publicId: image?.publicId || '',
        width: Number(image?.width || 0),
        height: Number(image?.height || 0),
        format: image?.format || '',
        moderationStatus: 'approved',
        moderationScore: image?.moderationScore || 0,
        moderationReason: image?.moderationReason || '',
      };
    });
    const imgResult = await updateForumPostImages(post.value.id, imagesPayload);
    if (!imgResult.ok) {
      logger.warn('post-detail', '帖子图片同步失败', imgResult.error);
    }

    // 编辑时新加的图若撞上「云端不可达 + 本地模型未就绪」，同样是放行 + 待复审。
    // best-effort：失败只意味着这轮没复审，不该让用户看到保存失败。
    const recheckPublicIds = editPostImages.value
      .filter((image) => image?.needsRecheck && !image?.isExisting)
      .map((image) => String(image?.publicId || '').trim())
      .filter(Boolean);
    if (recheckPublicIds.length > 0) {
      void (async () => {
        await markForumImagesPendingRecheck(post.value.id, recheckPublicIds);
        await enqueueForumImageRecheck(post.value.id, 30);
      })().catch((err) => logger.warn('post-detail', '图片复审入队失败', err));
    }

    // 标签回写（updatePost 不处理 tag）
    const currentTag = normalizeForumTag(post.value.tag);
    if (editSelectedPostTag.value && editSelectedPostTag.value !== currentTag) {
      const { error: tagError } = await supabase
        .from('posts')
        .update({ tag: editSelectedPostTag.value })
        .eq('id', post.value.id)
        .eq('author_id', userInfo.id);
      if (tagError) {
        logger.warn('post-detail', '帖子标签回写失败', tagError);
      }
    }

    emitProfileSync({
      userId: post.value.author_id,
      username: post.value.author_username,
      reason: 'post_updated',
    });
    clearForumFeedSnapshots();
    dispatchPostUpdated();
    resetEditState();
    showModal(
      'success',
      '保存成功',
      imgResult.ok ? '帖子已更新' : '帖子已更新，但图片同步失败，请稍后重试',
    );
    await fetchPostDetail();
  } catch (error) {
    logger.error('post-detail', '编辑帖子失败', error);
    showModal('error', '保存失败', error?.message || '请稍后重试');
  } finally {
    isEditSubmitting.value = false;
  }
};

const getQueryString = (value) => {
  if (Array.isArray(value)) {
    return String(value[0] || '').trim();
  }
  return String(value || '').trim();
};

const createForumHomeLocation = (query = {}) => ({
  path: '/user-space',
  query: {
    tab: 'community',
    ...query,
  },
});

const goBack = () => {
  // 弹窗模式：返回 = 关闭弹窗（宿主消费打开时压入的历史条目）
  if (props.modalMode) {
    emit('close', { restoreHistory: true });
    return;
  }
  const source = getQueryString(route.query.from);
  const returnKey = getForumReturnKeyFromQuery(
    route.query,
    source === 'forum' ? 'forum' : 'user-space',
  );
  const historyBack =
    typeof window !== 'undefined' ? getQueryString(window.history.state?.back) : '';

  if (isSafePostDetailHistoryReturn(historyBack, source)) {
    router.back();
    return;
  }

  if (source === 'user-space') {
    router.replace(
      createForumHomeLocation({
        tab: getQueryString(route.query.tab) || 'posts',
        restore: '1',
        returnKey,
      }),
    );
    return;
  }

  if (source === 'forum') {
    router.replace(
      createForumHomeLocation({
        restore: '1',
        returnKey,
      }),
    );
    return;
  }

  if (source === 'profile') {
    const sourceUsername = getQueryString(route.query.username);
    const origin = getQueryString(route.query.origin);
    if (sourceUsername) {
      const url = origin
        ? `/profile/${encodeURIComponent(sourceUsername)}?from=${encodeURIComponent(origin)}`
        : `/profile/${encodeURIComponent(sourceUsername)}`;
      router.replace(url);
      return;
    }
  }

  router.replace(createForumHomeLocation());
};

const sharePost = async () => {
  // 弹窗模式：pushState 已把地址栏同步为详情 URL，但仍显式构造，保证分享语义稳定
  const shareUrl =
    props.modalMode && post.value?.id
      ? `${window.location.origin}${window.location.pathname}#/forum/post/${post.value.id}`
      : window.location.href;
  const shareContent = `【${post.value.author_username}的帖子】${shareUrl}`;
  try {
    await navigator.clipboard.writeText(shareContent);
    showShareCopiedState();
    // 此路由没有公共顶部导航栏；保留事件供嵌入式宿主承接。
    window.dispatchEvent(
      new CustomEvent('boh_global_nav_status', {
        detail: {
          title: '分享链接已复制到剪贴板',
          icon: 'success',
          catSticker: 'success',
          actionLabel: '知道了',
          at: Date.now(),
        },
      }),
    );
  } catch (error) {
    logger.error('post-detail', '复制分享链接失败:', error);
    showModal('error', '复制失败', '当前环境不支持自动复制，请手动复制地址栏链接');
  }
};

const handleDeleteComment = async (comment, parentId = null) => {
  if (!comment?.id) return;
  const confirmed = await requestConfirm({
    title: '删除评论',
    message: '这条评论删除后无法恢复，确定继续吗？',
    confirmText: '删除',
  });
  if (!confirmed) return;

  try {
    const { success, error } = await deleteComment(comment.id, userInfo.id, userInfo.role);
    if (!success) {
      showModal('error', '删除失败', error || '请稍后重试');
      return;
    }

    emitProfileSync({
      userId: comment.author_id,
      username: comment.author_username,
      reason: 'comment_deleted',
    });

    if (parentId) {
      await loadChildReplies(parentId, { reset: true });
    } else {
      await loadTopComments({ reset: true });
    }
    await refreshPostStats();
  } catch (error) {
    logger.error('post-detail', '删除评论失败:', error);
    showModal('error', '删除失败', error?.message || '请稍后重试');
  }
};

const handleChangeCommentSortMode = async (mode) => {
  const normalizedMode = String(mode || '')
    .trim()
    .toLowerCase();
  if (normalizedMode !== 'asc' && normalizedMode !== 'desc') return;
  if (commentSortMode.value === normalizedMode) return;
  commentSortMode.value = normalizedMode;
  await loadTopComments({ reset: true });
};
</script>

<template>
  <div
    ref="detailPageRoot"
    class="post-detail-page"
    :class="{ 'post-detail-page--modal': modalMode }"
    :data-theme="currentTheme"
    :data-anniversary-skin="isAnniversaryMcTheme ? 'active' : 'off'"
  >
    <!-- 整页页头：宽屏用通用页头；窄屏（竖屏 Threads 式）用作者身份条 -->
    <UserCenterPageHeader
      v-if="!modalMode && !isNarrowDetail"
      title="帖子详情"
      max-width="1400px"
      @back="goBack"
    />
    <div v-else-if="!modalMode" class="pd-author-bar">
      <button type="button" class="pd-author-bar-back" aria-label="返回" @click="goBack">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M15 5l-7 7 7 7"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <template v-if="post">
        <div
          class="pd-author-bar-identity"
          @click="isOfficialCard ? undefined : goToProfile(post.author_username)"
        >
          <span class="boh-avatar-wrap pd-author-bar-avatar">
            <div class="author-avatar" :class="{ 'is-official': isOfficialCard }">
              <img
                v-if="authorAvatarSrc"
                :src="authorAvatarSrc"
                alt="作者头像"
                class="avatar-image"
                loading="lazy"
              />
              <span v-else>{{ post.author_username?.charAt(0)?.toUpperCase?.() || 'U' }}</span>
            </div>
            <span
              v-if="authorFrame"
              class="boh-avatar-frame"
              :style="{
                '--boh-avatar-frame-url': `url(${authorFrame.url})`,
                '--boh-avatar-frame-scale': String(authorFrame.scale),
              }"
              aria-hidden="true"
            ></span>
          </span>
          <span class="pd-author-bar-text">
            <span class="pd-author-bar-name" :class="authorTierClass">{{
              post.author_username
            }}</span>
            <!-- 窄屏内容区作者行被精简（.author-meta 隐藏），发帖时间只能在这里露头 -->
            <span class="pd-author-bar-time">{{ formatDate(post.created_at) }}</span>
            <span v-if="post.edited_at" class="pd-author-bar-edited"
              >已编辑 {{ formatDate(post.edited_at) }}</span
            >
          </span>
        </div>
        <button
          v-if="canFollowAuthor"
          type="button"
          class="pd-author-bar-follow"
          :class="{ 'is-following': isFollowingAuthor }"
          :disabled="isFollowSubmitting"
          @click="handleFollowToggle"
        >
          {{ isFollowingAuthor ? '已关注' : '关注' }}
        </button>
      </template>
      <span v-else class="pd-author-bar-name pd-author-bar-name--loading">加载中…</span>
    </div>

    <div ref="detailContainerRef" class="detail-container">
      <main class="detail-content fade-in-up" style="animation-delay: 0.1s">
        <div v-if="isLoading" class="post-detail-skeleton" aria-hidden="true">
          <div class="post-skeleton-main glass-panel">
            <HomeCatMascot
              v-if="isHomeCatActive"
              class="detail-skeleton-thinking-cat"
              pool="state"
              seed="detail-skeleton-thinking"
              size="md"
              decorative
            />
            <div class="post-skeleton-header">
              <div class="detail-skeleton-block skeleton-avatar"></div>
              <div class="post-skeleton-author">
                <div class="detail-skeleton-block skeleton-line name"></div>
                <div class="detail-skeleton-block skeleton-line time"></div>
              </div>
            </div>
            <div class="detail-skeleton-block skeleton-title"></div>
            <div class="detail-skeleton-block skeleton-line full"></div>
            <div class="detail-skeleton-block skeleton-line wide"></div>
            <div class="detail-skeleton-block skeleton-line medium"></div>
            <div class="post-skeleton-actions">
              <div class="detail-skeleton-block skeleton-pill"></div>
              <div class="detail-skeleton-block skeleton-pill"></div>
              <div class="detail-skeleton-block skeleton-pill short"></div>
            </div>
          </div>
          <div class="comments-skeleton-side glass-panel">
            <div class="detail-skeleton-block comments-skeleton-heading"></div>
            <div
              v-for="item in 4"
              :key="`detail-comment-skeleton-${item}`"
              class="comment-skeleton-row"
            >
              <div class="detail-skeleton-block skeleton-avatar small"></div>
              <div class="comment-skeleton-body">
                <div class="detail-skeleton-block skeleton-line name"></div>
                <div class="detail-skeleton-block skeleton-line wide"></div>
                <div class="detail-skeleton-block skeleton-line medium"></div>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="!post" class="empty-state glass-panel">
          <div class="empty-icon">🏜️</div>
          <h3>帖子已失效</h3>
          <p>抱歉，该帖子可能已被作者删除或链接有误。</p>
          <button @click="goBack" class="home-btn">
            {{ modalMode ? '关闭' : '返回方块社区' }}
          </button>
        </div>

        <div
          v-else-if="modalMode"
          class="pd-modal-body"
          :class="{ 'pd-modal-body--has-media': hasMedia }"
        >
          <div v-if="hasMedia" class="pd-modal-media">
            <div class="pd-media-stage-wrap">
              <transition name="detail-image-fade" mode="out-in">
                <button
                  :key="detailImageKey"
                  type="button"
                  class="pd-media-stage"
                  :class="{
                    'is-loaded': isDetailImageLoaded(detailImageKey),
                    'is-failed': isDetailImageFailed(detailImageKey),
                  }"
                  :aria-label="`查看${postTitle}第 ${detailImageIndex + 1} 张大图`"
                  @click="openDetailImageViewer(detailImageIndex, $event)"
                >
                  <div
                    v-if="isDetailImageFailed(detailImageKey)"
                    class="post-detail-image-failed-placeholder"
                  >
                    <ImageIcon :size="48" :stroke-width="1.5" aria-hidden="true" />
                    <span class="failed-text">图片加载失败</span>
                  </div>
                  <img
                    v-else
                    :src="currentDetailImage.url"
                    :alt="`${postTitle} 图片 ${detailImageIndex + 1}`"
                    loading="eager"
                    decoding="async"
                    fetchpriority="high"
                    class="pd-media-img"
                    :class="{ 'is-loaded': isDetailImageLoaded(detailImageKey) }"
                    :width="currentDetailImage.width || undefined"
                    :height="currentDetailImage.height || undefined"
                    @load="
                      markDetailImageLoaded(detailImageKey);
                      captureMediaRatio($event);
                    "
                    @error="markDetailImageFailed(detailImageKey)"
                  />
                </button>
              </transition>
              <button
                v-if="hasMultipleDetailImages"
                type="button"
                class="pd-media-nav prev"
                aria-label="上一张图片"
                @click.stop="showPrevDetailImage"
              >
                ‹
              </button>
              <button
                v-if="hasMultipleDetailImages"
                type="button"
                class="pd-media-nav next"
                aria-label="下一张图片"
                @click.stop="showNextDetailImage"
              >
                ›
              </button>
              <div
                v-if="hasMultipleDetailImages"
                class="pd-media-dots"
                :aria-label="`共 ${detailImages.length} 张图片，当前第 ${detailImageIndex + 1} 张`"
              >
                <button
                  v-for="(image, index) in detailImages"
                  :key="image.id || image.url || index"
                  type="button"
                  class="pd-media-dot"
                  :class="{ active: index === detailImageIndex }"
                  :aria-label="`查看第 ${index + 1} 张图片`"
                  @click.stop="goToDetailImage(index)"
                ></button>
              </div>
            </div>
          </div>

          <div class="pd-modal-info">
            <div class="pd-author-row">
              <div
                class="author-section"
                @click="isOfficialCard ? undefined : goToProfile(post.author_username)"
              >
                <span class="boh-avatar-wrap">
                  <div class="author-avatar" :class="{ 'is-official': isOfficialCard }">
                    <img
                      v-if="authorAvatarSrc"
                      :src="authorAvatarSrc"
                      alt="作者头像"
                      class="avatar-image"
                      loading="lazy"
                    />
                    <span v-else>{{
                      post.author_username?.charAt(0)?.toUpperCase?.() || 'U'
                    }}</span>
                  </div>
                  <span
                    v-if="authorFrame"
                    class="boh-avatar-frame"
                    :style="{
                      '--boh-avatar-frame-url': `url(${authorFrame.url})`,
                      '--boh-avatar-frame-scale': String(authorFrame.scale),
                    }"
                    aria-hidden="true"
                  ></span>
                </span>
                <div class="author-meta">
                  <span class="author-name" :class="authorTierClass"
                    >@{{ post.author_username }}</span
                  >
                  <span class="post-time">{{ formatDate(post.created_at) }}</span>
                  <span v-if="post.edited_at" class="post-edited-tag"
                    >已编辑 {{ formatDate(post.edited_at) }}</span
                  >
                  <span v-if="post.location_name" class="post-location-tag"
                    >📍 {{ post.location_name }}</span
                  >
                </div>
              </div>
              <button
                v-if="canFollowAuthor"
                type="button"
                class="pd-follow-btn"
                :class="{ 'is-following': isFollowingAuthor }"
                :disabled="isFollowSubmitting"
                @click.stop="handleFollowToggle"
              >
                {{ isFollowingAuthor ? '已关注' : '关注' }}
              </button>
              <div v-if="shouldShowPostMenu" class="post-menu-wrap" @click.stop>
                <button
                  type="button"
                  class="post-menu-trigger"
                  :class="{ active: isPostMenuOpen }"
                  aria-label="帖子操作"
                  :aria-expanded="isPostMenuOpen ? 'true' : 'false'"
                  @click="togglePostMenu"
                >
                  <span></span>
                  <span></span>
                  <span></span>
                </button>
                <transition name="post-menu">
                  <div v-if="isPostMenuOpen" class="post-menu-panel">
                    <button
                      v-if="canManagePost"
                      type="button"
                      class="post-menu-item"
                      @click="startEditPost"
                    >
                      <span class="post-menu-icon">✎</span>
                      <span>编辑</span>
                    </button>
                    <button
                      v-if="canManagePost"
                      type="button"
                      class="post-menu-item danger"
                      @click="handleDeletePost"
                    >
                      <span class="post-menu-icon">×</span>
                      <span>删除</span>
                    </button>
                    <button
                      v-if="canReportPost"
                      type="button"
                      class="post-menu-item warning"
                      :disabled="isReportSubmitting"
                      @click="handleReportPost"
                    >
                      <span class="post-menu-icon">!</span>
                      <span>{{ isReportSubmitting ? '提交中' : '举报' }}</span>
                    </button>
                  </div>
                </transition>
              </div>
            </div>

            <div class="pd-info-scroll">
              <h2 class="pd-title">
                {{ postTitle }}
                <span v-if="post.status === 'limited'" class="post-status-pill limited"
                  >仅自己可见</span
                >
              </h2>

              <div class="content-wrapper">
                <div
                  v-if="officialContent.type === 'news' && officialContent.html"
                  class="official-rich-content"
                  aria-label="新闻完整内容"
                >
                  <!-- eslint-disable-next-line vue/no-v-html -->
                  <div v-html="officialContent.html"></div>
                </div>
                <div
                  v-else-if="
                    officialContent.type === 'activity' && officialContent.paragraphs.length
                  "
                  class="official-paragraph-content"
                  aria-label="活动完整介绍"
                >
                  <p v-for="(para, paraIndex) in officialContent.paragraphs" :key="paraIndex">
                    {{ para }}
                  </p>
                </div>
                <template v-else>
                  <p class="content-text">{{ displayContent }}</p>
                  <button v-if="isContentLong" class="expand-btn" @click="toggleExpand">
                    {{ isExpanded ? '收起全文' : '展开全文' }}
                  </button>
                </template>
              </div>

              <button
                v-if="quotedPost"
                type="button"
                class="quoted-post-box"
                :class="[quotedTierCode ? `tier-${quotedTierCode}` : '']"
                aria-label="查看被转发的原帖"
                @click="goToQuotedPost"
              >
                <span class="quoted-post-author" :class="quotedNickClass"
                  >@{{ quotedPost.author_username || '方块之家' }}</span
                >
                <span v-if="quotedTitle" class="quoted-post-title">{{ quotedTitle }}</span>
                <span v-if="quotedBody" class="quoted-post-body">{{ quotedBody }}</span>
              </button>

              <div class="pd-comments-head">共 {{ post.comment_count }} 条评论</div>
              <CommentThread
                class="pd-comment-thread"
                :hide-composer="true"
                :comments="topComments"
                :is-loading="isTopCommentsLoading"
                :has-more="hasMoreTopComments"
                :is-logged-in="isLoggedIn"
                :current-user-id="userInfo.id"
                :current-user-role="userInfo.role"
                :post-author-id="post.author_id"
                :post-comment-count="post.comment_count"
                :is-home-cat-active="isHomeCatActive"
                :is-reply-success-popping="isReplySuccessPopping"
                :active-reply-id="activeReplyId"
                :reply-to-user="replyToUser"
                :active-reply-quote="activeReplyQuote"
                :reply-content="replyContent"
                :is-reply-submitting="isReplySubmitting"
                :reply-cooldown-seconds="replyCooldownSeconds"
                :reply-submit-label="replySubmitLabel"
                :child-replies-map="childRepliesMap"
                :highlighted-comment-id="highlightedCommentId"
                :comment-sort-mode="commentSortMode"
                @reply="
                  ({ targetId, username, content, rootAuthorUsername }) =>
                    toggleReplyInput(targetId, username, content, rootAuthorUsername)
                "
                @submit-reply="submitReply"
                @cancel-reply="
                  activeReplyId = null;
                  replyToUser = null;
                  activeReplyQuote = '';
                  replyContent = '';
                "
                @update:reply-content="replyContent = $event"
                @load-more-comments="loadTopComments({ reset: false })"
                @toggle-child-replies="toggleChildReplies"
                @load-child-replies="({ parentId, options }) => loadChildReplies(parentId, options)"
                @delete-comment="({ comment, parentId }) => handleDeleteComment(comment, parentId)"
                @go-to-profile="goToProfile"
                @change-sort-mode="handleChangeCommentSortMode"
                @toggle-comment-like="handleToggleCommentLike"
              />
            </div>

            <div class="pd-actionbar" :class="{ 'is-expanded': isReplyExpanded }">
              <textarea
                v-if="isLoggedIn"
                ref="modalReplyField"
                v-model="replyContent"
                rows="1"
                class="pd-reply-input"
                :placeholder="replyToUser ? `回复 @${replyToUser}` : '说点什么'"
                maxlength="2000"
                enterkeyhint="send"
                autocapitalize="off"
                @focus="focusModalReply"
                @keydown.enter="onModalReplyEnter"
                @blur="handleReplyFieldBlur"
              ></textarea>
              <button
                v-else
                type="button"
                class="pd-reply-input pd-reply-input--guest"
                @click="showLoginModal = true"
              >
                说点什么...
              </button>
              <button
                type="button"
                class="pd-reply-send"
                v-if="isLoggedIn"
                :disabled="isReplySubmitting || replyCooldownSeconds > 0 || !replyContent.trim()"
                @click="submitReply"
              >
                {{ isReplySubmitting ? '发送中' : '发送' }}
              </button>
              <div class="pd-action-group">
                <button
                  class="pd-action-btn"
                  :class="{ 'is-liked': post.isLiked }"
                  :disabled="isLikeSubmitting"
                  :aria-label="post.isLiked ? '取消点赞' : '点赞'"
                  @click="handleToggleLike"
                >
                  <Heart
                    class="action-svg"
                    :size="20"
                    :stroke-width="1.8"
                    :fill="post.isLiked ? 'currentColor' : 'none'"
                    aria-hidden="true"
                  />
                  <span class="pd-action-count">{{ post.like_count }}</span>
                </button>
                <button class="pd-action-btn" aria-label="写评论" @click="handleModalCommentClick">
                  <MessageCircle
                    class="action-svg"
                    :size="20"
                    :stroke-width="1.8"
                    aria-hidden="true"
                  />
                  <span class="pd-action-count">{{ post.comment_count }}</span>
                </button>
                <button
                  class="pd-action-btn"
                  :class="{ 'is-copy-success': isShareCopied }"
                  aria-label="分享"
                  @click="sharePost"
                >
                  <Check
                    v-if="isShareCopied"
                    class="action-svg"
                    :size="20"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                  <Share2
                    v-else
                    class="action-svg"
                    :size="20"
                    :stroke-width="1.8"
                    aria-hidden="true"
                  />
                  <span class="pd-action-count">{{ isShareCopied ? '已复制' : '分享' }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="post-x-layout">
          <div class="x-main-column">
            <article
              class="x-post-card glass-panel"
              :class="{
                'tier-plus': authorTierCode === 'plus',
                'tier-pro': authorTierCode === 'pro',
                'tier-max': authorTierCode === 'max',
                'tier-ultra': authorTierCode === 'ultra',
              }"
            >
              <!-- 媒体前置（图片在上文字在下）：整页模式 carousel 提为卡片直接子级，
                   竖屏断点 order:-1 置顶贴边，横屏断点 order:3 保持「作者→正文→图片」原状 -->
              <div v-if="detailImages.length" class="post-detail-image-carousel x-post-card-media">
                <div class="post-detail-image-stage">
                  <transition name="detail-image-fade" mode="out-in">
                    <button
                      :key="detailImageKey"
                      type="button"
                      class="post-detail-image-link"
                      :class="{
                        'is-loaded': isDetailImageLoaded(detailImageKey),
                        'is-failed': isDetailImageFailed(detailImageKey),
                      }"
                      :aria-label="`查看${postTitle}第 ${detailImageIndex + 1} 张大图`"
                      @click="openDetailImageViewer(detailImageIndex, $event)"
                    >
                      <!-- ✨ 新增：图片加载失败时显示占位符 -->
                      <div
                        v-if="isDetailImageFailed(detailImageKey)"
                        class="post-detail-image-failed-placeholder"
                      >
                        <ImageIcon :size="48" :stroke-width="1.5" aria-hidden="true" />
                        <span class="failed-text">图片加载失败</span>
                      </div>
                      <!-- 正常图片渲染 -->
                      <img
                        v-else
                        :src="currentDetailImage.url"
                        :alt="`${postTitle} 图片 ${detailImageIndex + 1}`"
                        loading="eager"
                        decoding="async"
                        fetchpriority="high"
                        class="post-detail-image"
                        :class="{ 'is-loaded': isDetailImageLoaded(detailImageKey) }"
                        :width="currentDetailImage.width || undefined"
                        :height="currentDetailImage.height || undefined"
                        @load="markDetailImageLoaded(detailImageKey)"
                        @error="markDetailImageFailed(detailImageKey)"
                      />
                    </button>
                  </transition>
                  <button
                    v-if="hasMultipleDetailImages"
                    type="button"
                    class="post-detail-image-nav prev"
                    aria-label="上一张图片"
                    @click.stop="showPrevDetailImage"
                  >
                    ‹
                  </button>
                  <button
                    v-if="hasMultipleDetailImages"
                    type="button"
                    class="post-detail-image-nav next"
                    aria-label="下一张图片"
                    @click.stop="showNextDetailImage"
                  >
                    ›
                  </button>
                </div>
                <div
                  v-if="hasMultipleDetailImages"
                  class="post-detail-image-dots"
                  :aria-label="`共 ${detailImages.length} 张图片，当前第 ${detailImageIndex + 1} 张`"
                >
                  <button
                    v-for="(image, index) in detailImages"
                    :key="image.id || image.url || index"
                    type="button"
                    class="post-detail-image-dot"
                    :class="{ active: index === detailImageIndex }"
                    :aria-label="`查看第 ${index + 1} 张图片`"
                    @click.stop="goToDetailImage(index)"
                  ></button>
                </div>
              </div>
              <HomeCatMascot
                v-if="isHomeCatActive"
                class="detail-post-decor-cat"
                pool="card"
                :seed="`${post.id}:detail`"
                size="md"
                decorative
              />
              <div class="post-header">
                <div
                  class="author-section"
                  @click="isOfficialCard ? undefined : goToProfile(post.author_username)"
                >
                  <span class="boh-avatar-wrap">
                    <div class="author-avatar" :class="{ 'is-official': isOfficialCard }">
                      <img
                        v-if="authorAvatarSrc"
                        :src="authorAvatarSrc"
                        alt="作者头像"
                        class="avatar-image"
                        loading="lazy"
                      />
                      <span v-else>{{
                        post.author_username?.charAt(0)?.toUpperCase?.() || 'U'
                      }}</span>
                    </div>
                    <span
                      v-if="authorFrame"
                      class="boh-avatar-frame"
                      :style="{
                        '--boh-avatar-frame-url': `url(${authorFrame.url})`,
                        '--boh-avatar-frame-scale': String(authorFrame.scale),
                      }"
                      aria-hidden="true"
                    ></span>
                  </span>
                  <div class="author-meta">
                    <span class="author-name" :class="authorTierClass"
                      >@{{ post.author_username }}</span
                    >
                    <span class="post-time">{{ formatDate(post.created_at) }}</span>
                    <span v-if="post.edited_at" class="post-edited-tag"
                      >已编辑 {{ formatDate(post.edited_at) }}</span
                    >
                    <span v-if="post.location_name" class="post-location-tag"
                      >📍 {{ post.location_name }}</span
                    >
                  </div>
                </div>
                <div v-if="shouldShowPostMenu" class="post-menu-wrap" @click.stop>
                  <button
                    type="button"
                    class="post-menu-trigger"
                    :class="{ active: isPostMenuOpen }"
                    aria-label="帖子操作"
                    :aria-expanded="isPostMenuOpen ? 'true' : 'false'"
                    @click="togglePostMenu"
                  >
                    <span></span>
                    <span></span>
                    <span></span>
                  </button>
                  <transition name="post-menu">
                    <div v-if="isPostMenuOpen" class="post-menu-panel">
                      <button
                        v-if="canManagePost"
                        type="button"
                        class="post-menu-item"
                        @click="startEditPost"
                      >
                        <span class="post-menu-icon">✎</span>
                        <span>编辑</span>
                      </button>
                      <button
                        v-if="canManagePost"
                        type="button"
                        class="post-menu-item danger"
                        @click="handleDeletePost"
                      >
                        <span class="post-menu-icon">×</span>
                        <span>删除</span>
                      </button>
                      <button
                        v-if="canReportPost"
                        type="button"
                        class="post-menu-item warning"
                        :disabled="isReportSubmitting"
                        @click="handleReportPost"
                      >
                        <span class="post-menu-icon">!</span>
                        <span>{{ isReportSubmitting ? '提交中' : '举报' }}</span>
                      </button>
                    </div>
                  </transition>
                </div>
              </div>

              <div class="post-body">
                <h2 class="post-detail-title">
                  {{ postTitle }}
                  <span v-if="post.status === 'limited'" class="post-status-pill limited"
                    >仅自己可见</span
                  >
                </h2>
                <div class="content-wrapper">
                  <!-- 官方镜像卡（新闻/活动）：回源后渲染完整原文（新闻=富文本 / 活动=段落）；
                       回源前与失败时降级为普通摘要展示 -->
                  <div
                    v-if="officialContent.type === 'news' && officialContent.html"
                    class="official-rich-content"
                    aria-label="新闻完整内容"
                  >
                    <!-- eslint-disable-next-line vue/no-v-html -->
                    <div v-html="officialContent.html"></div>
                  </div>
                  <div
                    v-else-if="
                      officialContent.type === 'activity' && officialContent.paragraphs.length
                    "
                    class="official-paragraph-content"
                    aria-label="活动完整介绍"
                  >
                    <p v-for="(para, paraIndex) in officialContent.paragraphs" :key="paraIndex">
                      {{ para }}
                    </p>
                  </div>
                  <template v-else>
                    <p class="content-text">{{ displayContent }}</p>
                    <button v-if="isContentLong" class="expand-btn" @click="toggleExpand">
                      {{ isExpanded ? '收起全文' : '展开全文' }}
                    </button>
                  </template>
                </div>
                <!-- 转发帖引用框：点击进入被转发的原帖 -->
                <button
                  v-if="quotedPost"
                  type="button"
                  class="quoted-post-box"
                  :class="[quotedTierCode ? `tier-${quotedTierCode}` : '']"
                  aria-label="查看被转发的原帖"
                  @click="goToQuotedPost"
                >
                  <span class="quoted-post-author" :class="quotedNickClass"
                    >@{{ quotedPost.author_username || '方块之家' }}</span
                  >
                  <span v-if="quotedTitle" class="quoted-post-title">{{ quotedTitle }}</span>
                  <span v-if="quotedBody" class="quoted-post-body">{{ quotedBody }}</span>
                </button>
              </div>
            </article>
          </div>

          <div class="x-side-column">
            <div class="pd-comments-head pd-comments-head--page">
              共 {{ post.comment_count }} 条评论
            </div>
            <CommentThread
              :hide-composer="true"
              :comments="topComments"
              :is-loading="isTopCommentsLoading"
              :has-more="hasMoreTopComments"
              :is-logged-in="isLoggedIn"
              :current-user-id="userInfo.id"
              :current-user-role="userInfo.role"
              :post-author-id="post.author_id"
              :post-comment-count="post.comment_count"
              :is-home-cat-active="isHomeCatActive"
              :is-reply-success-popping="isReplySuccessPopping"
              :active-reply-id="activeReplyId"
              :reply-to-user="replyToUser"
              :active-reply-quote="activeReplyQuote"
              :reply-content="replyContent"
              :is-reply-submitting="isReplySubmitting"
              :reply-cooldown-seconds="replyCooldownSeconds"
              :reply-submit-label="replySubmitLabel"
              :child-replies-map="childRepliesMap"
              :highlighted-comment-id="highlightedCommentId"
              :comment-sort-mode="commentSortMode"
              @reply="
                ({ targetId, username, content, rootAuthorUsername }) =>
                  toggleReplyInput(targetId, username, content, rootAuthorUsername)
              "
              @submit-reply="submitReply"
              @cancel-reply="
                activeReplyId = null;
                replyToUser = null;
                activeReplyQuote = '';
                replyContent = '';
              "
              @update:reply-content="replyContent = $event"
              @load-more-comments="loadTopComments({ reset: false })"
              @toggle-child-replies="toggleChildReplies"
              @load-child-replies="({ parentId, options }) => loadChildReplies(parentId, options)"
              @delete-comment="({ comment, parentId }) => handleDeleteComment(comment, parentId)"
              @go-to-profile="goToProfile"
              @change-sort-mode="handleChangeCommentSortMode"
              @toggle-comment-like="handleToggleCommentLike"
            />
          </div>
        </div>
      </main>
    </div>

    <!-- 整页模式底部固定操作栏（Threads/小红书式）：输入 + 点赞/评论/分享，卡内动作栏已移除 -->
    <div
      v-if="!modalMode && post"
      class="pd-actionbar pd-actionbar--page"
      :class="{ 'is-expanded': isReplyExpanded }"
    >
      <textarea
        v-if="isLoggedIn"
        ref="modalReplyField"
        v-model="replyContent"
        rows="1"
        class="pd-reply-input"
        :placeholder="replyToUser ? `回复 @${replyToUser}` : '说点什么'"
        maxlength="2000"
        enterkeyhint="send"
        autocapitalize="off"
        @focus="focusModalReply"
        @keydown.enter="onModalReplyEnter"
        @blur="handleReplyFieldBlur"
      ></textarea>
      <button
        v-else
        type="button"
        class="pd-reply-input pd-reply-input--guest"
        @click="showLoginModal = true"
      >
        说点什么...
      </button>
      <button
        type="button"
        class="pd-reply-send"
        v-if="isLoggedIn"
        :disabled="isReplySubmitting || replyCooldownSeconds > 0 || !replyContent.trim()"
        @click="submitReply"
      >
        {{ isReplySubmitting ? '发送中' : '发送' }}
      </button>
      <div class="pd-action-group">
        <button
          class="pd-action-btn"
          :class="{ 'is-liked': post.isLiked }"
          :disabled="isLikeSubmitting"
          :aria-label="post.isLiked ? '取消点赞' : '点赞'"
          @click="handleToggleLike"
        >
          <Heart
            class="action-svg"
            :size="20"
            :stroke-width="1.8"
            :fill="post.isLiked ? 'currentColor' : 'none'"
            aria-hidden="true"
          />
          <span class="pd-action-count">{{ post.like_count }}</span>
        </button>
        <button class="pd-action-btn" aria-label="写评论" @click="handleModalCommentClick">
          <MessageCircle class="action-svg" :size="20" :stroke-width="1.8" aria-hidden="true" />
          <span class="pd-action-count">{{ post.comment_count }}</span>
        </button>
        <button
          class="pd-action-btn"
          :class="{ 'is-copy-success': isShareCopied }"
          aria-label="分享"
          @click="sharePost"
        >
          <Check
            v-if="isShareCopied"
            class="action-svg"
            :size="20"
            :stroke-width="2"
            aria-hidden="true"
          />
          <Share2 v-else class="action-svg" :size="20" :stroke-width="1.8" aria-hidden="true" />
          <span class="pd-action-count">{{ isShareCopied ? '已复制' : '分享' }}</span>
        </button>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="detail-confirm-fade">
        <div
          v-if="confirmState.show"
          class="detail-confirm-overlay"
          @click.self="closeConfirm(false)"
        >
          <div
            class="detail-confirm-modal"
            role="dialog"
            aria-modal="true"
            :aria-label="confirmState.title"
          >
            <img
              v-if="confirmMascotSrc"
              class="detail-confirm-cat-img"
              :src="confirmMascotSrc"
              alt=""
              draggable="false"
              loading="lazy"
            />
            <h3>{{ confirmState.title }}</h3>
            <p>{{ confirmState.message }}</p>
            <div class="detail-confirm-actions">
              <button
                type="button"
                class="detail-confirm-btn secondary"
                @click="closeConfirm(false)"
              >
                {{ confirmState.cancelText }}
              </button>
              <button type="button" class="detail-confirm-btn danger" @click="closeConfirm(true)">
                {{ confirmState.confirmText }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <CommonAlertModal
      v-model:visible="modalState.show"
      :type="modalState.type"
      :title="modalState.title"
      :message="modalState.message"
      :mascot-src="modalMascotSrc"
      mascot-alt="方块小窝提示小猫"
    />

    <!-- 编辑帖子：竖屏全屏毛玻璃 / 横屏居中弹窗，复用发帖 UI -->
    <Teleport to="body">
      <Transition name="edit-composer-fade">
        <div
          v-if="isEditingPost"
          class="post-edit-overlay"
          :class="{ 'is-portrait': isEditPortrait }"
          @click.self="cancelEditPost"
        >
          <div class="post-edit-shell" :class="{ 'is-portrait': isEditPortrait }">
            <!-- 竖屏顶栏：移动端布局下 PostComposer 内部 footer 会被 CSS 隐藏，发布按钮由这里承担 -->
            <header v-if="isEditPortrait" class="post-edit-bar">
              <button
                type="button"
                class="post-edit-bar-back"
                :disabled="isEditSubmitting"
                @click="cancelEditPost"
              >
                取消
              </button>
              <span class="post-edit-bar-title">编辑帖子</span>
              <button
                type="button"
                class="post-edit-bar-submit"
                :disabled="isEditSubmitting || isEditUploadingPostImage"
                @click="submitEditPost"
              >
                {{ isEditSubmitting ? '保存中…' : '保存' }}
              </button>
            </header>
            <div class="post-edit-scroll" :class="{ 'is-portrait': isEditPortrait }">
              <PostComposer
                edit-mode
                :user-info="userInfo"
                :is-logged-in="isLoggedIn"
                v-model:new-post="editNewPost"
                v-model:selected-post-tag="editSelectedPostTag"
                :post-images="editPostImages"
                :is-submitting="isEditSubmitting"
                :is-uploading-post-image="isEditUploadingPostImage"
                :post-image-upload-status="editImageUploadStatus"
                :forum-tag-options="FORUM_TAG_OPTIONS"
                :max-post-images="FORUM_POST_IMAGE_MAX_COUNT"
                :is-home-cat-theme="isHomeCatActive"
                :is-mobile-composer="isEditPortrait"
                @submit="submitEditPost"
                @close="cancelEditPost"
                @image-selection="handleEditImageSelection"
                @remove-image="handleEditRemoveImage"
                @reorder-image="handleEditReorderImage"
                @clear-images="handleEditClearImages"
              />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 举报模态框 -->
    <div v-if="isReportModalOpen" class="modal-overlay" @click.self="closeReportModal">
      <div
        class="report-modal glass-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
      >
        <div class="modal-header report-modal-header">
          <div>
            <h3 id="report-modal-title">举报帖子</h3>
            <p class="report-modal-subtitle">
              选择最接近的问题类型，管理员会结合帖子内容一起查看。
            </p>
          </div>
          <button class="close-btn" :disabled="isReportSubmitting" @click="closeReportModal">
            ×
          </button>
        </div>

        <div class="report-reason-grid">
          <button
            v-for="reason in reportReasons"
            :key="reason.value"
            type="button"
            class="report-reason-option"
            :class="{ selected: reportForm.reason === reason.value }"
            :disabled="isReportSubmitting"
            @click="reportForm.reason = reason.value"
          >
            <span class="report-reason-label">{{ reason.label }}</span>
            <span class="report-reason-description">{{ reason.description }}</span>
          </button>
        </div>

        <label class="report-detail-field">
          <span>补充说明</span>
          <textarea
            v-model="reportForm.detail"
            class="report-detail-textarea"
            rows="4"
            maxlength="500"
            placeholder="可以补充具体问题、相关上下文或希望管理员注意的地方（选填）"
            :disabled="isReportSubmitting"
          ></textarea>
          <small>{{ reportForm.detail.length }}/500</small>
        </label>

        <div class="modal-footer report-modal-footer">
          <button class="cancel-btn" :disabled="isReportSubmitting" @click="closeReportModal">
            取消
          </button>
          <button
            class="submit-btn report-submit-btn"
            :disabled="isReportSubmitting"
            @click="submitReportPost"
          >
            {{ isReportSubmitting ? '提交中...' : '提交举报' }}
          </button>
        </div>
      </div>
    </div>

    <ImageViewer
      :visible="isDetailImageViewerOpen"
      :images="detailImages"
      :current-index="detailImageIndex"
      :post-title="postTitle"
      :current-image="currentDetailImage"
      :image-key="detailImageKey"
      @close="closeDetailImageViewer"
      @navigate-prev="showPrevDetailImage"
      @navigate-next="showNextDetailImage"
      @go-to-index="goToDetailImage"
    />
  </div>
</template>

<style scoped>
@import './style.scoped.css';
@import './modal-layout.css';
</style>

<style scoped>
.post-location-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #059669;
  background: #ecfdf5;
  padding: 2px 8px;
  border-radius: 6px;
  margin-top: 4px;
}

/* ---- 编辑帖子：竖屏全屏毛玻璃 / 横屏居中弹窗 ---- */
.post-edit-overlay {
  position: fixed;
  inset: 0;
  z-index: 220300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  background: rgba(0, 0, 0, 0.38);
  backdrop-filter: var(--liquid-filter);
  -webkit-backdrop-filter: var(--liquid-filter);
}

.post-edit-overlay.is-portrait {
  padding: 0;
  align-items: stretch;
}

.post-edit-shell {
  width: 100%;
  max-width: 720px;
  max-height: 88vh;
  overflow-y: auto;
  padding: 24px;
  border-radius: 32px;
  border: 1px solid var(--glass-border, rgba(0, 0, 0, 0.06));
  background: var(--glass-bg, rgba(255, 255, 255, 0.8));
  backdrop-filter: var(--liquid-filter);
  -webkit-backdrop-filter: var(--liquid-filter);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.18);
  isolation: isolate;
}

.post-edit-shell.is-portrait {
  max-width: 100%;
  max-height: 100%;
  height: 100%;
  border-radius: 0;
  border-left: none;
  border-right: none;
  border-top: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 竖屏顶栏：移动端布局下 PostComposer footer 被隐藏，保存按钮由此承担 */
.post-edit-bar {
  flex-shrink: 0;
  height: calc(58px + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) 16px 0;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 12px;
  align-items: center;
  background: rgba(255, 255, 255, 0.32);
  backdrop-filter: var(--liquid-filter);
  -webkit-backdrop-filter: var(--liquid-filter);
  border-bottom: 1px solid rgba(15, 20, 25, 0.06);
}

.post-edit-bar-title {
  font-size: 16px;
  font-weight: 800;
  color: #1d1d1f;
  text-align: center;
  letter-spacing: 0;
}

.post-edit-bar-back {
  justify-self: start;
  border: none;
  background: transparent;
  color: #1d1d1f;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  padding: 8px 2px;
  line-height: 1;
}

.post-edit-bar-back:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.post-edit-bar-submit {
  position: relative;
  justify-self: end;
  min-width: 74px;
  height: 40px;
  border: none;
  border-radius: 999px;
  background: #1d1d1f;
  color: #ffffff;
  font-size: 15px;
  font-weight: 800;
  padding: 0 18px;
  cursor: pointer;
  transition:
    transform 0.2s,
    opacity 0.2s,
    background-color 0.2s;
}

.post-edit-bar-submit:active:not(:disabled) {
  transform: scale(0.96);
}

.post-edit-bar-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.post-edit-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.post-edit-scroll.is-portrait {
  padding: 16px;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
}

/* 竖屏全屏时 PostComposer 头部关闭按钮与顶栏"取消"重复，隐藏 */
.post-edit-shell.is-portrait :deep(.editor-close-btn) {
  display: none;
}

/* 编辑层内嵌发帖卡片：去掉重复玻璃与入场动画 */
.post-edit-shell :deep(.post-creation-section) {
  opacity: 1;
  transform: none;
  animation: none;
}

.post-edit-shell :deep(.editor-card) {
  background: transparent;
  border: none;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  padding: 0;
}

/* 过渡动画 */
.edit-composer-fade-enter-active,
.edit-composer-fade-leave-active {
  transition: opacity 0.28s ease;
}

.edit-composer-fade-enter-active .post-edit-shell,
.edit-composer-fade-leave-active .post-edit-shell {
  transition: transform 0.34s cubic-bezier(0.16, 1, 0.3, 1);
}

.edit-composer-fade-enter-from,
.edit-composer-fade-leave-to {
  opacity: 0;
}

.edit-composer-fade-enter-from .post-edit-shell,
.edit-composer-fade-leave-to .post-edit-shell {
  transform: translateY(24px) scale(0.98);
}

.edit-composer-fade-enter-to .post-edit-shell,
.edit-composer-fade-leave-from .post-edit-shell {
  transform: translateY(0) scale(1);
}

/* ---- 弹窗模式（横屏 PostDetailModal 宿主内）：小红书式布局，样式单源见 modal-layout.css（@import 在首个 style 块，须位于所有规则之前） ---- */
</style>
