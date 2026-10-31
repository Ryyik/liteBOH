<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Camera,
  GripVertical,
  Hash,
  Image as ImageIcon,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  Sparkles,
  X,
} from 'lucide-vue-next';
import HomeCatMascot from '@/components/HomeCatMascot.vue';
import { useAutoGrowTextarea } from '@/composables/useAutoGrowTextarea.js';
import { FORUM_POST_TITLE_MAX_LENGTH } from '../forum-config.js';
import {
  useForumPostPolish,
  POLISH_SETTLE_MS,
  POLISH_EXIT_MS,
} from '../composables/useForumPostPolish.js';
import { POST_POLISH_MAX_INPUT_CHARS } from '../composables/post-polish.js';
import { useImageStripDrag } from '../composables/useImageStripDrag.js';

const props = defineProps({
  isLoggedIn: { type: Boolean, default: false },
  userInfo: { type: Object, default: () => ({}) },
  newPost: { type: Object, default: () => ({ title: '', content: '' }) },
  selectedPostTag: { type: String, default: 'daily' },
  postLocation: { type: Object, default: null },
  postImages: { type: Array, default: () => [] },
  isSubmitting: { type: Boolean, default: false },
  isUploadingPostImage: { type: Boolean, default: false },
  postImageUploadStatus: { type: String, default: '' },
  postCooldownSeconds: { type: Number, default: 0 },
  maxPostImages: { type: Number, default: 6 },
  mentionUsers: { type: Array, default: () => [] },
  forumTagOptions: { type: Array, default: () => [] },
  isMobileComposer: { type: Boolean, default: false },
  isHomeCatTheme: { type: Boolean, default: false },
  editMode: { type: Boolean, default: false },
  existingImages: { type: Array, default: () => [] },
});

const emit = defineEmits([
  'submit',
  'close',
  'login',
  'update:newPost',
  'update:selectedPostTag',
  'update:postLocation',
  'request-image-picker',
  'request-camera',
  'image-selection',
  'remove-image',
  'retry-image',
  'reorder-image',
  'clear-images',
]);

const isEditMode = computed(() => Boolean(props.editMode));

/* 标题上限：与主流社区一致，防止超长标题撑破排版。
   2026-10-25 提为单源（原先是本文件局部常量）—— 「智能整理」要对模型下同一个
   上限，两处各写一份 50 迟早错位（模型按一个值生成、输入框按另一个值截断）。 */
const TITLE_MAX_LENGTH = FORUM_POST_TITLE_MAX_LENGTH;

// 标题「多字扩展」：单一真源 composables/useAutoGrowTextarea.js（2026-10-13 收敛自研
// autoResizeTitle）。上限 132px 由 composer.css 的 `.post-title-input { max-height }`
// 提供，JS 不写第二份像素值。
// ⚠️ 必须传 value：标题是 `:value` + `@input` 受控写法，父组件会主动改写
// props.newPost.title（编辑模式载入 / 草稿恢复 / 发布后清空），只绑 @input 的
// 实现在这些路径上不会收缩。
const { textareaRef: postTitleInputRef } = useAutoGrowTextarea({
  value: () => props.newPost.title,
});

const handleTitleInput = (event) => {
  const value = String(event.target.value || '').slice(0, TITLE_MAX_LENGTH);
  event.target.value = value;
  updateTitle(value);
};
/* 编辑器头部只用真实用户名，不再显示「你好，X！」的招呼句 —— 发布会话顶栏已经
   说明当前动作是「新帖」，头部重复问候只会多占一行。 */
const editorDisplayName = computed(() => props.userInfo.username || '朋友');
const editorGreetingLabel = computed(() =>
  isEditMode.value ? '编辑帖子' : editorDisplayName.value,
);
const editorPromptLabel = computed(() =>
  isEditMode.value ? '修改你的分享，记得保存～' : '今天想和大家分享什么？',
);
const submitButtonLabel = computed(() => {
  if (isEditMode.value) return isPostBusy.value ? '保存中…' : '保存修改';
  if (props.postCooldownSeconds > 0) return `${props.postCooldownSeconds}s 后发布`;
  return '发布';
});

const postImageInputRef = ref(null);
const postCameraInputRef = ref(null);

/* 正文「多字扩展」：与标题共用同一条真源（composables/useAutoGrowTextarea.js）。
   没有它时，竖屏发布会话里的长文会在 textarea 内部滚动，而外层内容层又
   因此永远没有溢出 —— 看起来像「正文框卡住不动」，动作栏虽然贴底，
   但正文没有随内容增长。上限住 CSS，JS 不写第二份像素值。 */
const { textareaRef: postContentInputRef, resize: resizePostContent } = useAutoGrowTextarea({
  value: () => props.newPost.content,
});

/* 有无图片会改正文起写区的下限（竖屏 CSS：`.has-images .post-content-input`
   34vh → 10vh，见 replies-responsive.css）。下限只由 CSS 决定，但自动增高把
   像素高度写在 inline style 上 —— 下限变小后 inline 高度**不会自己回缩**，
   实测仍是 287px，等于这条让位规则完全没生效。所以图片数变化时重算一次。 */
watch(
  () => props.postImages.length,
  () => resizePostContent(),
);

/* 标题是单行字段：Enter（非 IME 组合中）直接跳到正文，与 enterkeyhint="next" 一致。
   必须判 isComposing —— 中文输入法确认候选词的回车不能被拦。 */
const handleTitleKeydown = (event) => {
  if (event.key !== 'Enter') return;
  if (event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  postContentInputRef.value?.focus?.();
};

const showMobileTagMenu = ref(false);
const showMoreMenu = ref(false);
const morePanelRef = ref(null);
const morePanelPosition = ref({ top: 100, left: 16 });
const moreButtonRect = ref(null);
const mentionQuery = ref('');
const showMentionMenu = ref(false);
const mentionStartIndex = ref(-1);
const previewImage = ref(null);

const selectedTagLabel = computed(() =>
  (props.forumTagOptions.find((tag) => tag.value === props.selectedPostTag)?.label || '').replace(
    /^#\s*/,
    '',
  ),
);
const hasPostContent = computed(() =>
  Boolean(String(props.newPost.title || '').trim() || String(props.newPost.content || '').trim()),
);
const isPostBusy = computed(() => props.isSubmitting || props.isUploadingPostImage);

const titleCharCount = computed(() => String(props.newPost.title || '').length);
const contentCharCount = computed(() => String(props.newPost.content || '').length);
const composerCatSeed = computed(() =>
  [
    props.selectedPostTag,
    isPostBusy.value ? 'uploading' : 'idle',
    String(props.newPost.title || '').trim().length,
    String(props.newPost.content || '').trim().length,
    props.postImages.length,
  ].join(':'),
);
const isComposerCatAwake = computed(
  () => String(props.newPost.content || '').trim().length >= 80 || props.postImages.length > 0,
);
const normalizedMentionUsers = computed(() => {
  const seen = new Set();
  return props.mentionUsers
    .map((user) => String(user?.username || user?.author_username || user || '').trim())
    .filter((username) => {
      if (!username || seen.has(username)) return false;
      seen.add(username);
      return true;
    })
    .slice(0, 24);
});
const mentionSuggestions = computed(() => {
  const query = mentionQuery.value.toLowerCase();
  return normalizedMentionUsers.value
    .filter((username) => !query || username.toLowerCase().includes(query))
    .slice(0, 6);
});
const currentPreviewImageUrl = computed(() =>
  String(
    previewImage.value?.detailUrl ||
      previewImage.value?.originalUrl ||
      previewImage.value?.url ||
      '',
  ).trim(),
);
const getImageStatusLabel = (image) => {
  if (image?.uploadStatusLabel) return image.uploadStatusLabel;
  const status = String(image?.uploadStatus || '');
  if (status === 'failed') return '未通过';
  if (status === 'staged' || status === 'queued') return '排队中';
  if (status === 'optimizing') return '优化中';
  if (status === 'moderating') return '安全检测中';
  if (status === 'uploading') return '上传中';
  return '已检测';
};
const getImageStatusClass = (image) => {
  if (image?.uploadStatus === 'failed') return 'failed';
  if (image?.uploadStatus && image.uploadStatus !== 'approved') return 'processing';
  return 'approved';
};
const shouldShowImageStatus = (image) =>
  // 产品口径（2026-10-02 拍板）：选图→发布之间保持安静，不给常驻过程反馈；仅失败态显示
  // badge + 重试入口。慢/卡的场景由 ForumMain 的卡顿观察器写一次性底部状态行提示
  // （.post-image-upload-status），不走图片徽章。
  // （旧注释「进度由灵动岛展示」不实——灵动岛只在发布中出现，已删。）
  String(image?.uploadStatus || '') === 'failed';
const canReorderImage = (image) =>
  !image?.uploadStatus || ['approved', 'staged'].includes(image.uploadStatus);

const updateTitle = (value) => {
  emit('update:newPost', { ...props.newPost, title: value });
};

const updateContent = (value) => {
  emit('update:newPost', { ...props.newPost, content: value });
};

/* ── 智能整理（2026-10-26）────────────────────────────────────────────
   入口在编辑器统一动作栏的「智能整理」，
   **不经过 AI 岛**：竖屏发布会话是全屏独占层（z-index 100000，见
   styles/replies-responsive.css:529），而岛宿在导航栏（9999），在这个场景下
   既看不见也不该抢焦点。

   生成期间光效直接打在标题/正文上；生成完成后**直接替换**并给一个「撤销」，
   不弹预览、不再要求二次确认（2026-10-25 用户定稿，推翻了上一版的预览面板）。
   安全网从「先预览」换成了「可撤销」，所以撤销链的可靠性是这里的第一约束。 */
const {
  errorMessage: polishError,
  isRunning: isPolishing,
  isSettling: isPolishSettling,
  isBusy: isBusyPolishing,
  isApplied: polishApplied,
  canPolish,
  isOverLimit: isPolishOverLimit,
  polish,
  undo: undoPolish,
  dismissUndo,
} = useForumPostPolish({
  onApplied: ({ title, content }) => {
    // 应用期标记：这次写入会在下面那个 watch 里引起回调，
    // 必须让它知道「这是 AI 写的，别当成用户自己动过」（否则撤销入口刚出现就被关掉）。
    applyingPolish = true;
    emit('update:newPost', { ...props.newPost, title, content });
    nextTick(() => {
      applyingPolish = false;
    });
  },
});

/**
 * 把 JS 侧的时长**注入** CSS。
 *
 * ⚠️ 这是「同一个数只有一份」的实现方式：CSS 里写的值是兜底，真实值从这里来。
 *    两边各写一个常量是这类动效最常见的漂移点 —— 改了一处忘了另一处，
 *    症状是「文字流光还没落点就换了」（或反过来），而没有任何报错。
 */
const polishSweepStyle = computed(() => ({
  '--post-polish-settle': `${POLISH_SETTLE_MS}ms`,
  '--post-polish-exit': `${POLISH_EXIT_MS}ms`,
}));

const canStartPolish = computed(() => canPolish(props.newPost));
const polishTooLong = computed(() => isPolishOverLimit(props.newPost));

/* 超长提示只在用户**真的点了**之后才出现：一进来就挂着一条「暂不支持」是噪音。
   这里用独立 ref，不复用 status —— status 是调用状态机，塞进「被挡住」会污染它。 */
const polishBlockedNotice = ref('');

/** 应用期标记，见上方 onApplied 的注释。 */
let applyingPolish = false;

const startPolish = () => {
  polishBlockedNotice.value = '';
  if (!canStartPolish.value) {
    // 超长：明确说原因。静默截断会导致结果丢掉后半篇文章 —— 那比不给整理更糟。
    if (polishTooLong.value) {
      polishBlockedNotice.value = `正文超过 ${POST_POLISH_MAX_INPUT_CHARS} 字，暂不支持一键整理。`;
    }
    return;
  }
  polish(props.newPost);
};

const handleUndoPolish = () => {
  polishBlockedNotice.value = '';
  undoPolish();
};

// 用户自己继续编辑 ⇒ 「撤销」不再指向一次干净的替换，收起入口。
// ⚠️ 必须跳过 AI 自己那次写入（applyingPolish），否则整个撤销功能在应用瞬间就失效了。
watch(
  () => [props.newPost.title, props.newPost.content],
  () => {
    polishBlockedNotice.value = '';
    if (applyingPolish) return;
    if (polishApplied.value) dismissUndo();
  },
);

const replaceContentRange = (start, end, replacement, nextCursor = start + replacement.length) => {
  const content = String(props.newPost.content || '');
  updateContent(`${content.slice(0, start)}${replacement}${content.slice(end)}`);
  nextTick(() => {
    const input = postContentInputRef.value;
    input?.focus?.();
    input?.setSelectionRange?.(nextCursor, nextCursor);
  });
};

const updateMentionState = (event) => {
  const input = event?.target;
  const value = String(input?.value || '');
  const cursor = Number(input?.selectionStart ?? value.length);
  const beforeCursor = value.slice(0, cursor);
  const match = beforeCursor.match(/(^|\s)@([\u4e00-\u9fa5\w.-]{0,24})$/u);
  if (!match) {
    showMentionMenu.value = false;
    mentionQuery.value = '';
    mentionStartIndex.value = -1;
    return;
  }
  mentionQuery.value = match[2] || '';
  mentionStartIndex.value = cursor - mentionQuery.value.length - 1;
  showMentionMenu.value = mentionSuggestions.value.length > 0;
};

const handleContentInput = (event) => {
  updateContent(event.target.value);
  updateMentionState(event);
};

const insertMention = (username) => {
  const safeUsername = String(username || '').trim();
  if (!safeUsername || mentionStartIndex.value < 0) return;
  const content = String(props.newPost.content || '');
  const input = postContentInputRef.value;
  const cursor = Number(input?.selectionStart ?? content.length);
  const replacement = `@${safeUsername} `;
  replaceContentRange(
    mentionStartIndex.value,
    cursor,
    replacement,
    mentionStartIndex.value + replacement.length,
  );
  showMentionMenu.value = false;
  mentionQuery.value = '';
  mentionStartIndex.value = -1;
};

const handleTagSelect = (tag) => {
  emit('update:selectedPostTag', tag);
  showMobileTagMenu.value = false;
};

const handleSubmit = () => emit('submit');
const handleLogin = () => emit('login');
const handleImagePickerRequest = () => {
  emit('request-image-picker', () => postImageInputRef.value?.click?.());
};

const handleCameraRequest = () => {
  emit('request-camera', () => postCameraInputRef.value?.click?.());
};

const handleImageChange = (event) => {
  const files = Array.from(event?.target?.files || []);
  if (postImageInputRef.value) postImageInputRef.value.value = '';
  if (postCameraInputRef.value) postCameraInputRef.value.value = '';
  emit('image-selection', { files, event });
};

const requestImageReorder = (fromIndex, toIndex) => {
  if (isPostBusy.value) return;
  const total = props.postImages.length;
  const from = Number(fromIndex);
  const to = Number(toIndex);
  if (!Number.isInteger(from) || !Number.isInteger(to)) return;
  if (from < 0 || from >= total || to < 0 || to >= total || from === to) return;
  emit('reorder-image', { fromIndex: from, toIndex: to });
};

/* 图片排序（2026-10-30）：拖动的主实现搬到 useImageStripDrag ——
   HTML5 dnd（draggable/dragstart/dragover/drop）在触屏上**不触发**，
   竖屏用户此前只能点卡片左下角两个 26px 的箭头。
   现在：整张卡片是拖动热区（不再是那个小把手），触屏长按 300ms 拾起、
   鼠标移动 4px 即拖；箭头按钮仅保留在 hover 设备上（键盘可达性）。 */
const {
  stripRef: imageStripRef,
  isReordering: isImageReordering,
  handlePointerDown: handleImageStripPointerDown,
  handleStripClick: handleImageStripClick,
} = useImageStripDrag({
  canDragIndex: (index) => canReorderImage(props.postImages[index]),
  isLocked: () => isPostBusy.value,
  onReorder: requestImageReorder,
});

const openImagePreview = (image) => {
  if (!image?.url) return;
  previewImage.value = image;
};

const closeImagePreview = () => {
  previewImage.value = null;
};

const isLocating = ref(false);
const locationError = ref('');
const showLocationPanel = ref(false);
const locationSearchQuery = ref('');
const locationSearchResults = ref([]);
const isSearchingLocation = ref(false);
const locationSearchInputRef = ref(null);
let locationSearchTimer = null;

const NOMINATIM_RATE_LIMIT_MS = 1100;
let lastNominatimRequestTime = 0;
const geocodeCache = new Map();
const GEOCODE_CACHE_TTL = 10 * 60 * 1000;

async function throttledNominatimFetch(url) {
  const cacheKey = url;
  const cached = geocodeCache.get(cacheKey);
  if (cached) {
    const { result, timestamp } = cached;
    if (Date.now() - timestamp < GEOCODE_CACHE_TTL) return result.clone();
    geocodeCache.delete(cacheKey);
  }

  const now = Date.now();
  const elapsed = now - lastNominatimRequestTime;
  if (elapsed < NOMINATIM_RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, NOMINATIM_RATE_LIMIT_MS - elapsed));
  }
  lastNominatimRequestTime = Date.now();

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'BOHLITE/2.5 (community forum; +https://github.com/bohlite)',
    },
  });

  const cloned = res.clone();
  geocodeCache.set(cacheKey, { result: cloned, timestamp: Date.now() });
  return res;
}

async function handleAddLocation() {
  if (!navigator.geolocation) {
    locationError.value = '浏览器不支持定位功能';
    return;
  }
  isLocating.value = true;
  locationError.value = '';
  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000,
      });
    });
    const { latitude, longitude } = pos.coords;
    const { cityName, districtName } = await reverseGeocode(latitude, longitude);
    emit('update:postLocation', {
      name: cityName,
      cityName,
      districtName,
      precision: 'city',
      lat: latitude,
      lng: longitude,
    });
  } catch (e) {
    if (e.code === 1) {
      locationError.value = '定位权限被拒绝，请在浏览器设置中允许位置访问';
    } else if (e.code === 2) {
      locationError.value = '无法获取位置信息，请检查网络或 GPS';
    } else if (e.code === 3) {
      locationError.value = '获取位置超时，请重试';
    } else {
      locationError.value = '获取位置失败，请重试';
    }
  } finally {
    isLocating.value = false;
  }
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await throttledNominatimFetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=zh&zoom=13`,
    );
    if (!res.ok) {
      const fallback = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      return { cityName: fallback, districtName: fallback };
    }
    const data = await res.json();
    const addr = data.address || {};

    // City: try structured address, otherwise parse from display_name
    let cityName = addr.city || addr.town || null;
    if (!cityName && data.display_name) {
      const parts = data.display_name.split(', ').reverse();
      cityName = parts.find((p) => /市$/.test(p.trim()));
    }
    if (!cityName)
      cityName =
        addr.county || addr.state || addr.country || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    // Precise location (the finest granular detected)
    const preciseName =
      addr.county || addr.district || addr.suburb || addr.neighbourhood || cityName;

    return { cityName, districtName: preciseName };
  } catch {
    const fallback = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    return { cityName: fallback, districtName: fallback };
  }
}

function handleLocationClick() {
  showLocationPanel.value = true;
  locationSearchQuery.value = '';
  locationSearchResults.value = [];
  locationError.value = '';
}

function removeLocation() {
  emit('update:postLocation', null);
  locationError.value = '';
  showLocationPanel.value = false;
}

function onLocationSearchInput() {
  clearTimeout(locationSearchTimer);
  const q = locationSearchQuery.value.trim();
  if (!q) {
    locationSearchResults.value = [];
    return;
  }
  if (q.length < 2) {
    locationSearchResults.value = [];
    return;
  }
  isSearchingLocation.value = true;
  locationSearchTimer = setTimeout(async () => {
    try {
      const res = await throttledNominatimFetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&accept-language=zh&limit=5`,
      );
      if (!res.ok) {
        locationSearchResults.value = [];
        return;
      }
      const data = await res.json();
      locationSearchResults.value = data.map((r) => {
        const parts = r.display_name.split(', ').reverse();
        return {
          name: r.display_name,
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          shortName: parts.slice(-3).join(', '),
        };
      });
    } catch {
      locationSearchResults.value = [];
    } finally {
      isSearchingLocation.value = false;
    }
  }, 300);
}

function selectSearchResult(result) {
  const parts = result.name.split(', ').reverse();
  const cityName = parts.find((p) => /市$/.test(p.trim())) || parts[0];
  const preciseName = parts[0];
  emit('update:postLocation', {
    name: cityName?.trim() || result.name,
    cityName: cityName?.trim() || result.name,
    districtName: preciseName?.trim() || cityName?.trim() || result.name,
    precision: 'city',
    lat: result.lat,
    lng: result.lng,
  });
  locationSearchQuery.value = '';
  locationSearchResults.value = [];
  showLocationPanel.value = false;
}

function closeLocationMenu() {
  showLocationPanel.value = false;
  locationSearchQuery.value = '';
  locationSearchResults.value = [];
  locationError.value = '';
}

watch(showLocationPanel, (open) => {
  if (open) {
    nextTick(() => locationSearchInputRef.value?.focus());
  }
});

// 更多菜单定位逻辑
let menuPositionUpdateHandler = null;

function handleMoreButtonClick(event) {
  // 获取按钮的位置
  const btn = event.currentTarget;
  if (btn) {
    moreButtonRect.value = btn.getBoundingClientRect();
  }
  showMoreMenu.value = !showMoreMenu.value;
}

function updateMorePanelPosition() {
  if (!moreButtonRect.value) {
    morePanelPosition.value = { top: 100, left: 16 };
    return;
  }

  const rect = moreButtonRect.value;
  const gap = 8;

  const panelEl = morePanelRef.value;
  const panelHeight = panelEl ? panelEl.offsetHeight : 200;
  const panelWidth = panelEl ? panelEl.offsetWidth : 280;

  // 窄屏档（≤900，与 UserSpace 的 900 全宽档对齐，收敛原 899 孤岛）
  const isNarrowScreen = window.innerWidth <= 900;

  if (isNarrowScreen) {
    // 窄屏幕：面板从底部弹出（上拉菜单效果）
    morePanelPosition.value = {
      top: Math.max(16, window.innerHeight - panelHeight - 16),
      left: 12,
    };
  } else {
    // 正常屏幕：面板在按钮上方弹出，右边缘对齐按钮右边缘
    const topPosition = rect.top - panelHeight - gap;
    const leftPosition = rect.right - panelWidth;

    morePanelPosition.value = {
      top: Math.max(16, Math.min(topPosition, window.innerHeight - panelHeight - gap)),
      left: Math.max(16, Math.min(leftPosition, window.innerWidth - panelWidth - 16)),
    };
  }
}

watch(showMoreMenu, async (newVal) => {
  if (newVal) {
    await nextTick();
    updateMorePanelPosition();
    // 菜单打开时监听滚动和窗口变化以重新定位
    menuPositionUpdateHandler = () => {
      updateMorePanelPosition();
    };
    window.addEventListener('scroll', menuPositionUpdateHandler, { passive: true });
    window.addEventListener('resize', menuPositionUpdateHandler, { passive: true });
  } else if (menuPositionUpdateHandler) {
    window.removeEventListener('scroll', menuPositionUpdateHandler);
    window.removeEventListener('resize', menuPositionUpdateHandler);
    menuPositionUpdateHandler = null;
  }
});

onUnmounted(() => {
  clearTimeout(locationSearchTimer);
  if (menuPositionUpdateHandler) {
    window.removeEventListener('scroll', menuPositionUpdateHandler);
    window.removeEventListener('resize', menuPositionUpdateHandler);
    menuPositionUpdateHandler = null;
  }
});
</script>

<template>
  <section
    class="post-creation-section fade-in-up"
    :class="{ 'mobile-composer-section': isMobileComposer }"
  >
    <div v-if="isLoggedIn" class="editor-card glass-panel">
      <div class="composer-content-scroll">
        <div class="editor-header">
          <div class="user-avatar">
            <img
              v-if="userInfo.avatarUrl"
              :src="userInfo.avatarUrl"
              alt="用户头像"
              class="avatar-image"
              loading="lazy"
            />
            <span v-else>{{
              userInfo.username ? userInfo.username.charAt(0).toUpperCase() : 'U'
            }}</span>
          </div>
          <div class="user-info-text">
            <span class="user-greeting">
              <span class="greeting-full">{{ editorGreetingLabel }}</span>
              <span class="greeting-name">{{ editorDisplayName }}</span>
            </span>
            <span class="editor-prompt">{{ editorPromptLabel }}</span>
          </div>
          <button
            v-if="isEditMode"
            type="button"
            class="editor-close-btn"
            aria-label="关闭编辑"
            @click="emit('close')"
          >
            <X :size="20" :stroke-width="2.2" aria-hidden="true" />
          </button>
        </div>
        <HomeCatMascot
          v-if="isHomeCatTheme"
          class="composer-theme-cat"
          :class="{ 'is-awake': isComposerCatAwake }"
          :type="isPostBusy ? 'uploading' : 'decor'"
          :pool="isPostBusy ? '' : 'background'"
          :seed="composerCatSeed"
          size="lg"
          decorative
        />

        <div class="input-group post-title-input-group composer-post-title">
          <textarea
            :value="newPost.title"
            ref="postTitleInputRef"
            rows="1"
            :maxlength="TITLE_MAX_LENGTH"
            enterkeyhint="next"
            :placeholder="isEditMode ? '修改标题' : isMobileComposer ? '标题' : '起个响亮的标题...'"
            class="post-title-input"
            :class="{ 'is-polishing': isBusyPolishing }"
            :style="polishSweepStyle"
            :readonly="isBusyPolishing"
            :aria-busy="isBusyPolishing ? 'true' : 'false'"
            @keydown="handleTitleKeydown"
            @input="handleTitleInput"
          ></textarea>
          <span
            v-if="titleCharCount > 0"
            class="composer-title-count"
            :class="{ 'is-near-limit': titleCharCount >= TITLE_MAX_LENGTH }"
          >
            {{ titleCharCount }}/{{ TITLE_MAX_LENGTH }}
          </span>
        </div>

        <div
          class="input-group post-body-input-group composer-post-body"
          :class="{ 'has-images': postImages.length > 0 }"
        >
          <div class="composer-body-shell">
            <textarea
              ref="postContentInputRef"
              :value="newPost.content"
              :placeholder="isMobileComposer ? '有什么新鲜事？' : '正文内容...'"
              class="post-content-input"
              :class="{ 'is-polishing': isBusyPolishing }"
              :style="polishSweepStyle"
              :readonly="isBusyPolishing"
              :aria-busy="isBusyPolishing ? 'true' : 'false'"
              :rows="postImages.length > 0 ? 2 : 3"
              @input="handleContentInput"
              @keyup="updateMentionState"
              @click="updateMentionState"
              @focus="updateMentionState"
            ></textarea>
            <div v-if="contentCharCount > 0" class="composer-char-count">
              {{ contentCharCount }} 字
            </div>
            <div v-if="showMentionMenu && mentionSuggestions.length" class="composer-mention-menu">
              <button
                v-for="username in mentionSuggestions"
                :key="username"
                type="button"
                class="composer-mention-item"
                @click="insertMention(username)"
              >
                @{{ username }}
              </button>
            </div>
          </div>
        </div>

        <!-- 智能整理的状态行：生成中 / 收口中 / 已应用（可撤销）/ 出错 / 被挡住。
           流光直接画在标题与正文的文字上（`.is-polishing`），
           这里只承担**文案与撤销入口** —— 不再有预览面板（2026-10-25 用户定稿）。

           ⚠️「快好了」（`isPolishSettling`）这一支不能省：落点之前改写成「已整理」
              是**撒谎**（字还没换），而继续写「正在整理…」又没告诉用户已到最后一步。
              文案在这里承担「即将完成」的告知，撤销按钮则**只**在真正写回后出现。 -->
        <div
          v-if="isBusyPolishing || polishApplied || polishError || polishBlockedNotice"
          class="composer-polish-status"
          :class="{ 'is-running': isBusyPolishing, 'is-applied': polishApplied }"
          role="status"
          aria-live="polite"
        >
          <template v-if="isPolishSettling">
            <Sparkles :size="14" :stroke-width="2.2" aria-hidden="true" />
            <span>快好了，正在收尾…</span>
          </template>
          <template v-else-if="isPolishing">
            <Sparkles :size="14" :stroke-width="2.2" aria-hidden="true" />
            <span>正在智能整理…</span>
          </template>
          <template v-else-if="polishApplied">
            <Sparkles :size="14" :stroke-width="2.2" aria-hidden="true" />
            <span>已智能整理</span>
            <button type="button" class="composer-polish-undo" @click="handleUndoPolish">
              撤销
            </button>
          </template>
          <template v-else-if="polishError">
            <span class="composer-polish-error-text">{{ polishError }}</span>
          </template>
          <template v-else>
            <span class="composer-polish-error-text">{{ polishBlockedNotice }}</span>
          </template>
        </div>

        <input
          ref="postImageInputRef"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          class="post-image-input"
          @change="handleImageChange"
        />
        <input
          ref="postCameraInputRef"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          capture="environment"
          class="post-image-input"
          @change="handleImageChange"
        />

        <div class="post-image-panel">
          <!-- 一行胶片条：横向滑动看全，长按整卡拖动排序（见 useImageStripDrag）。
             指针事件绑在条带上做委托 —— 空白处按下＝横滑，卡片上按下＝可能是拖拽。
             click 走 capture 阶段，用来吞掉"长按/拖动结束后那一次 click"（否则会顺带
             打开全屏预览）。 -->
          <div
            ref="imageStripRef"
            class="post-image-preview-grid"
            :class="{ 'is-reordering': isImageReordering }"
            @pointerdown="handleImageStripPointerDown"
            @click.capture="handleImageStripClick"
          >
            <TransitionGroup name="composer-image">
              <div
                v-for="(image, index) in postImages"
                :key="image.uploadId || image.url"
                class="post-image-preview-item"
                :class="{ 'is-failed': image.uploadStatus === 'failed' }"
                :data-image-index="index"
              >
                <button
                  v-if="image.url"
                  type="button"
                  class="post-image-preview-open"
                  :aria-label="`预览第 ${index + 1} 张图片大图`"
                  @click="openImagePreview(image)"
                >
                  <img :src="image.url" :alt="`帖子图片 ${index + 1}`" decoding="async" />
                </button>
                <div v-else class="post-image-failed-placeholder">
                  <ImageIcon :size="24" :stroke-width="1.8" aria-hidden="true" />
                  <span>{{ image.name || '图片上传失败' }}</span>
                </div>
                <span class="post-image-drag-handle" aria-hidden="true">
                  <GripVertical :size="15" :stroke-width="2" />
                </span>
                <Transition name="composer-badge">
                  <span
                    v-if="shouldShowImageStatus(image)"
                    class="post-image-status-badge"
                    :class="getImageStatusClass(image)"
                  >
                    <span
                      v-if="getImageStatusClass(image) === 'processing'"
                      class="post-image-card-spinner"
                      aria-hidden="true"
                    ></span>
                    {{ getImageStatusLabel(image) }}
                  </span>
                </Transition>
                <button
                  v-if="image.uploadStatus === 'failed' && image.file"
                  type="button"
                  class="post-image-retry-btn"
                  :disabled="isPostBusy"
                  @click="emit('retry-image', image, index)"
                >
                  <RefreshCcw :size="14" :stroke-width="2.3" aria-hidden="true" />
                  <span>重试</span>
                </button>
                <div
                  v-if="canReorderImage(image)"
                  class="post-image-sort-actions"
                  aria-label="调整图片顺序"
                >
                  <button
                    type="button"
                    class="post-image-sort-btn"
                    :disabled="isPostBusy || index === 0"
                    :aria-label="`将第 ${index + 1} 张图片前移`"
                    @click="requestImageReorder(index, index - 1)"
                  >
                    <ArrowLeft :size="15" :stroke-width="2.2" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class="post-image-sort-btn"
                    :disabled="isPostBusy || index === postImages.length - 1"
                    :aria-label="`将第 ${index + 1} 张图片后移`"
                    @click="requestImageReorder(index, index + 1)"
                  >
                    <ArrowRight :size="15" :stroke-width="2.2" aria-hidden="true" />
                  </button>
                </div>
                <button
                  type="button"
                  class="post-image-remove-btn"
                  :disabled="isPostBusy"
                  @click="emit('remove-image', image, index)"
                >
                  ×
                </button>
              </div>
            </TransitionGroup>

            <!-- ✨ 新增：添加更多图片方框 -->
            <button
              v-if="postImages.length < maxPostImages"
              type="button"
              class="post-image-add-more-card"
              :disabled="isPostBusy"
              @click="handleImagePickerRequest"
              aria-label="添加更多图片"
            >
              <Plus :size="32" :stroke-width="1.5" aria-hidden="true" />
              <span class="add-more-label">添加图片</span>
            </button>
          </div>
          <div
            v-if="postImageUploadStatus || isUploadingPostImage"
            class="post-image-upload-status"
          >
            <div class="post-image-upload-status-row">
              <HomeCatMascot v-if="isHomeCatTheme" type="uploading" size="sm" decorative />
              <span v-if="isUploadingPostImage" class="mini-spinner"></span>
              <span>{{ postImageUploadStatus }}</span>
            </div>
            <div v-if="isUploadingPostImage" class="post-image-upload-progress-bar">
              <div class="post-image-upload-progress-fill"></div>
            </div>
          </div>
          <button
            v-if="postImages.length > 0"
            type="button"
            class="post-image-clear-btn"
            :disabled="isPostBusy"
            @click="emit('clear-images', { cleanup: true })"
          >
            清空图片
          </button>
        </div>

        <div v-if="postLocation" class="post-location-bar">
          <MapPin :size="14" :stroke-width="2" />
          <span class="post-location-text">{{ postLocation.name }}</span>
          <button
            type="button"
            class="post-location-bar-remove"
            aria-label="移除位置"
            @click="removeLocation"
          >
            ×
          </button>
        </div>
      </div>

      <div class="editor-footer">
        <div class="composer-action-meta">
          <span v-if="!isEditMode" class="composer-action-tip"
            >试试智能整理，把草稿梳理得更清楚</span
          >
        </div>
        <div class="editor-submit-group">
          <div class="composer-actions" @click.stop>
            <div class="composer-tag-wrap">
              <button
                type="button"
                class="composer-action-btn"
                :class="{ active: showMobileTagMenu }"
                aria-label="选择帖子标签"
                :aria-expanded="showMobileTagMenu"
                @click="showMobileTagMenu = !showMobileTagMenu"
              >
                <Hash :size="19" :stroke-width="2" aria-hidden="true" />
                <span>{{ selectedTagLabel || '标签' }}</span>
              </button>
              <div
                v-if="showMobileTagMenu"
                class="composer-tag-menu"
                role="menu"
                aria-label="选择帖子标签"
              >
                <button
                  v-for="tag in forumTagOptions"
                  :key="tag.value"
                  type="button"
                  class="composer-tag-menu-item"
                  :class="{ active: selectedPostTag === tag.value }"
                  role="menuitemradio"
                  :aria-checked="selectedPostTag === tag.value"
                  @click="handleTagSelect(tag.value)"
                >
                  {{ tag.label }}
                </button>
              </div>
            </div>
            <button
              type="button"
              class="composer-action-btn"
              :class="{ 'is-full': postImages.length >= maxPostImages }"
              :disabled="isPostBusy || postImages.length >= maxPostImages"
              :aria-label="`从相册选择图片，已添加 ${postImages.length} 张，最多 ${maxPostImages} 张`"
              @click="handleImagePickerRequest"
            >
              <ImageIcon :size="19" :stroke-width="1.8" aria-hidden="true" />
              <span>图片</span>
              <span v-if="postImages.length" class="composer-action-count">{{
                postImages.length
              }}</span>
            </button>
            <button
              type="button"
              class="composer-action-btn composer-polish-action"
              :disabled="isPostBusy || isBusyPolishing || !hasPostContent"
              :aria-label="isBusyPolishing ? '正在整理' : '智能整理标题和正文'"
              @click="startPolish"
            >
              <Sparkles :size="19" :stroke-width="2" aria-hidden="true" />
              <span>{{ isBusyPolishing ? '整理中' : '智能整理' }}</span>
            </button>
            <div v-if="!isEditMode" class="composer-more-wrap">
              <button
                type="button"
                class="composer-action-btn composer-more-btn"
                :class="{ active: showMoreMenu }"
                aria-label="更多选项"
                :aria-expanded="showMoreMenu"
                @click="handleMoreButtonClick"
              >
                <MoreHorizontal :size="19" :stroke-width="2" aria-hidden="true" />
              </button>
            </div>
          </div>
          <button
            class="post-btn boh-press-sm"
            @click="handleSubmit"
            :disabled="isPostBusy || postCooldownSeconds > 0"
            :aria-busy="isPostBusy"
          >
            <span class="post-btn-label">{{ submitButtonLabel }}</span>
            <div v-if="isSubmitting" class="mini-spinner white"></div>
            <!-- 提交中的进度弧：沿按钮边框转一圈。不放「文案替换」——
                 文字跳变是断裂，一圈弧是「正在处理」的连续信号 -->
            <span v-if="isSubmitting" class="post-btn-progress" aria-hidden="true"></span>
          </button>
        </div>
      </div>
    </div>

    <div v-else class="login-prompt-card glass-panel" @click="handleLogin">
      <div class="prompt-content">
        <div class="lock-icon">🔒</div>
        <div class="prompt-text">
          <h3>登录以参与讨论</h3>
          <p>加入社区，分享你的方块世界故事。</p>
        </div>
        <button class="login-trigger-btn">立即登录</button>
      </div>
    </div>

    <!-- 桌面端和移动端更多菜单（按钮上方弹出） -->
    <Teleport to="body">
      <transition name="slide-up-popover">
        <div v-if="showMoreMenu" class="more-overlay" @click="showMoreMenu = false">
          <div
            class="more-panel"
            @click.stop
            ref="morePanelRef"
            :style="{
              top: morePanelPosition.top + 'px',
              left: morePanelPosition.left + 'px',
            }"
          >
            <div class="more-panel-header">
              <span>更多选项</span>
              <button
                type="button"
                class="more-close-btn"
                aria-label="关闭"
                @click="showMoreMenu = false"
              >
                <X :size="18" :stroke-width="2" aria-hidden="true" />
              </button>
            </div>
            <div class="more-menu-list">
              <button
                type="button"
                class="more-menu-item"
                @click="
                  replaceContentRange(
                    String(newPost.content || '').length,
                    String(newPost.content || '').length,
                    '@',
                  );
                  showMoreMenu = false;
                "
              >
                <AtSign :size="18" :stroke-width="2" aria-hidden="true" />
                <span class="more-menu-label">提及用户</span>
              </button>
              <button
                type="button"
                class="more-menu-item"
                :disabled="isLocating"
                @click="
                  handleLocationClick();
                  showMoreMenu = false;
                "
              >
                <span v-if="isLocating" class="mini-spinner"></span>
                <MapPin v-else :size="18" :stroke-width="2" aria-hidden="true" />
                <span class="more-menu-label">{{ postLocation ? '更换位置' : '添加位置' }}</span>
              </button>
              <button
                v-if="isMobileComposer"
                type="button"
                class="more-menu-item"
                :class="{ 'is-full': postImages.length >= maxPostImages }"
                :disabled="isPostBusy || postImages.length >= maxPostImages"
                @click="
                  handleCameraRequest();
                  showMoreMenu = false;
                "
              >
                <Camera :size="18" :stroke-width="2" aria-hidden="true" />
                <span class="more-menu-label">拍照</span>
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- 位置选择面板 -->
    <Teleport to="body">
      <transition name="slide-up-popover">
        <div v-if="showLocationPanel" class="location-panel-overlay" @click="closeLocationMenu">
          <div class="location-panel" @click.stop>
            <div class="location-panel-header">
              <span>添加位置</span>
              <button
                type="button"
                class="location-panel-close-btn"
                aria-label="关闭"
                @click="closeLocationMenu"
              >
                <X :size="18" :stroke-width="2" />
              </button>
            </div>

            <div class="location-search-wrap">
              <input
                ref="locationSearchInputRef"
                v-model="locationSearchQuery"
                type="text"
                class="location-search-input"
                placeholder="搜索城市或地点…"
                @input="onLocationSearchInput"
              />
            </div>

            <div v-if="isSearchingLocation" class="location-panel-status">搜索中…</div>

            <div v-else-if="locationSearchResults.length" class="location-search-results">
              <button
                v-for="result in locationSearchResults"
                :key="result.lat + result.lng"
                type="button"
                class="location-result-item"
                @click="selectSearchResult(result)"
              >
                <MapPin :size="16" :stroke-width="2" />
                <span class="location-result-name">{{ result.shortName }}</span>
              </button>
            </div>

            <div v-else class="location-default-actions">
              <button
                type="button"
                class="location-action-btn"
                :disabled="isLocating"
                @click="handleAddLocation"
              >
                <span v-if="isLocating" class="mini-spinner"></span>
                <span v-else>使用GPS定位</span>
              </button>
            </div>

            <div v-if="postLocation" class="location-current">
              <div class="location-current-info">
                <MapPin :size="16" :stroke-width="2" />
                <span>{{ postLocation.name }}</span>
              </div>
              <button type="button" class="location-remove-btn" @click="removeLocation">
                移除
              </button>
            </div>

            <div v-if="locationError" class="location-panel-error">{{ locationError }}</div>
          </div>
        </div>
      </transition>
    </Teleport>

    <Teleport to="body">
      <transition name="fade">
        <div v-if="previewImage" class="composer-image-preview-overlay" @click="closeImagePreview">
          <section class="composer-image-preview-modal" aria-label="发布前图片预览" @click.stop>
            <button
              type="button"
              class="composer-image-preview-close"
              aria-label="关闭图片预览"
              @click="closeImagePreview"
            >
              <X :size="22" :stroke-width="2.2" aria-hidden="true" />
            </button>
            <img
              :src="currentPreviewImageUrl"
              :alt="previewImage.name || '发布前图片预览'"
              decoding="async"
              loading="lazy"
            />
            <div class="composer-image-preview-meta">
              <span>帖子图片</span>
              <strong>{{
                previewImage.format ? previewImage.format.toUpperCase() : 'IMAGE'
              }}</strong>
            </div>
          </section>
        </div>
      </transition>
    </Teleport>
  </section>
</template>

<style scoped>
/* 共享样式层：styles/*.css 按组件各自 scoped @import（架构现状，说明见 base.css 顶部）。
   本组件还被 PostDetail 页独立使用（脱离 ForumMain），因此这里的 @import 是功能性的，勿删。 */
@import '../styles/composer.css';
@import '../styles/replies-responsive.css';
</style>

<style>
/* 「智能整理」的文字流光 + 状态行 —— 非 scoped 的理由见文件头（无 @property 依赖，
   但保持与 ForumMain 的共享层一致：这些类名同时出现在 PostComposer 与
   PostDetail 的编辑弹层里，scoped 会给它们各加一套 [data-v] 前缀）。 */
@import '../styles/post-polish-sweep.css';
</style>

<style scoped>
/* 组件私有样式：仅 PostComposer 模板使用（与上一块共享层刻意分块） */
/* 图片占位入口：液态玻璃 — 统一走 --liquid-* token，主色与全站一致（iOS 蓝） */
.post-image-add-more-card {
  width: 100%;
  aspect-ratio: 1 / 1;
  border: 1px solid var(--liquid-border, rgba(255, 255, 255, 0.65));
  border-radius: 20px;
  background: var(--liquid-bg-subtle, rgba(255, 255, 255, 0.58));
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
  color: var(--apple-blue, #0071e3);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    transform 0.2s ease,
    box-shadow 0.2s ease;
  padding: 0;
  min-height: 0;
  box-sizing: border-box;
  box-shadow:
    var(--liquid-highlight-subtle, inset 0 1px 0 rgba(255, 255, 255, 0.55)),
    var(--liquid-shadow-sm, 0 8px 24px rgba(15, 23, 42, 0.06));
}

.post-image-add-more-card:hover:not(:disabled) {
  border-color: rgba(255, 255, 255, 0.85);
  background: var(--liquid-bg-strong, rgba(255, 255, 255, 0.84));
  transform: translateY(-1px);
  box-shadow:
    var(--liquid-highlight, inset 0 1px 0 rgba(255, 255, 255, 0.86)),
    0 12px 28px rgba(15, 23, 42, 0.09);
}

.post-image-add-more-card:active:not(:disabled) {
  transform: scale(0.97);
}

.post-image-add-more-card:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.add-more-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--liquid-text-tertiary, #8b9098);
  line-height: 1.2;
}

/* 位置选择面板 */
.location-panel-overlay {
  position: fixed;
  inset: 0;
  z-index: 220200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
}

.location-panel {
  width: 360px;
  max-width: calc(100vw - 32px);
  max-height: 80vh;
  overflow-y: auto;
  padding: 22px;
  border-radius: 28px;
  border: 1px solid var(--liquid-border, rgba(255, 255, 255, 0.65));
  background: var(--liquid-bg, rgba(255, 255, 255, 0.72));
  backdrop-filter: var(--liquid-filter);
  -webkit-backdrop-filter: var(--liquid-filter);
  box-shadow:
    var(--liquid-highlight, inset 0 1px 0 rgba(255, 255, 255, 0.86)),
    var(--liquid-shadow, 0 20px 60px rgba(15, 23, 42, 0.07));
  isolation: isolate;
  contain: paint;
}

.location-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 800;
  color: #1d1d1f;
}

.location-panel-close-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
  color: #6e6e73;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.2s;
}

.location-panel-close-btn:hover {
  background: rgba(0, 0, 0, 0.1);
  color: #1d1d1f;
}

.location-search-wrap {
  margin-bottom: 12px;
}

.location-search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 14px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 14px;
  font-size: 14px;
  outline: none;
  background: rgba(255, 255, 255, 0.8);
  color: #1d1d1f;
  transition: border-color 0.2s;
}

.location-search-input:focus {
  border-color: #0071e3;
}

.location-panel-status {
  padding: 12px 0;
  font-size: 13px;
  color: #86868b;
  text-align: center;
}

.location-search-results {
  display: grid;
  gap: 4px;
  max-height: 220px;
  overflow-y: auto;
}

.location-result-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: #1d1d1f;
  font-size: 14px;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.2s;
}

.location-result-item:hover {
  background: rgba(0, 0, 0, 0.05);
}

.location-result-name {
  font-weight: 600;
  line-height: 1.3;
}

.location-default-actions {
  display: grid;
  gap: 8px;
  padding: 4px 0;
}

.location-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 14px;
  background: #0071e3;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.2s;
}

.location-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.location-current {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.04);
}

.location-current-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #1d1d1f;
}

.location-remove-btn {
  border: none;
  background: none;
  color: #ef4444;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  transition: background-color 0.2s;
}

.location-remove-btn:hover {
  background: rgba(239, 68, 68, 0.1);
}

.location-panel-error {
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  font-size: 12px;
  font-weight: 600;
}

/* 编辑器位置显示条 */
.post-location-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  margin: 4px 0;
  border-radius: 10px;
  background: rgba(0, 113, 227, 0.06);
  color: #0071e3;
  font-size: 13px;
  font-weight: 600;
}

.post-location-text {
  flex: 1;
  line-height: 1.3;
}

.post-location-bar-remove {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #0071e3;
  font-size: 15px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.2s;
}
.post-location-bar-remove:hover {
  background: rgba(0, 113, 227, 0.12);
}

@media (max-width: 900px) {
  .location-panel-overlay {
    align-items: flex-end;
  }

  .location-panel {
    width: 100%;
    max-width: 100%;
    border-radius: 32px 32px 0 0;
    max-height: 70vh;
    padding: 24px 20px;
    padding-bottom: max(20px, env(safe-area-inset-bottom));
  }
}

.auto-save-hint {
  font-size: 12px;
  color: #86868b;
  font-weight: 500;
  padding: 0 4px;
  margin-right: 12px;
  white-space: nowrap;
}

/* ---- 编辑模式关闭按钮 ---- */
.editor-close-btn {
  width: 32px;
  height: 32px;
  margin-left: auto;
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
  color: #6e6e73;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background-color 0.2s,
    color 0.2s,
    transform 0.2s;
}

.editor-close-btn:hover {
  background: rgba(0, 0, 0, 0.12);
  color: #1d1d1f;
  transform: rotate(90deg);
}

/* ---- 更多菜单（横竖屏共用，按钮上方弹出） ---- */

.mobile-more-tool-wrap,
.desktop-more-tool-wrap {
  position: relative;
  display: inline-flex;
}

.more-overlay {
  position: fixed;
  inset: 0;
  z-index: 220100;
}

.more-panel {
  position: fixed;
  z-index: 220101;
  padding: 14px;
  border-radius: 28px;
  border: 1px solid var(--liquid-border, rgba(255, 255, 255, 0.65));
  background: var(--liquid-bg, rgba(255, 255, 255, 0.72));
  backdrop-filter: var(--liquid-filter);
  -webkit-backdrop-filter: var(--liquid-filter);
  box-shadow:
    var(--liquid-highlight, inset 0 1px 0 rgba(255, 255, 255, 0.86)),
    var(--liquid-shadow, 0 20px 60px rgba(15, 23, 42, 0.07));
  width: 280px;
  overflow: hidden;
  contain: paint;
  isolation: isolate;
  transform-origin: bottom right;
  animation: composer-more-panel-in 220ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}

@keyframes composer-more-panel-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* 移动端面板更宽 */
@media (max-width: 900px) {
  .more-panel {
    width: calc(100vw - 24px);
    padding: 16px;
    border-radius: 20px;
    transform-origin: bottom center;
  }

  .more-menu-list {
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }

  .more-menu-item {
    min-height: 80px;
    padding: 16px 12px;
    gap: 8px;
  }

  .more-menu-label {
    font-size: 13px;
  }
}

.more-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 800;
  color: #1d1d1f;
}

.more-close-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
  color: #6e6e73;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background-color 0.2s,
    color 0.2s;
}

.more-close-btn:hover {
  background: rgba(0, 0, 0, 0.1);
  color: #1d1d1f;
}

.more-menu-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.more-menu-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 56px;
  padding: 10px 8px;
  border: none;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.04);
  color: #1d1d1f;
  cursor: pointer;
  transition:
    background-color var(--duration-fast, 180ms) ease,
    transform 220ms var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
}

.more-menu-item:hover {
  background: rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.more-menu-item:active:not(:disabled) {
  transform: scale(0.95);
}

.more-menu-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.more-menu-item.is-full {
  color: #ff3b30;
}

.more-menu-label {
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
}

/* slide-up-popover 动画（从按钮上方弹出） */
.slide-up-popover-enter-active,
.slide-up-popover-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-up-popover-enter-from,
.slide-up-popover-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.slide-up-popover-enter-to,
.slide-up-popover-leave-from {
  opacity: 1;
  transform: translateY(0);
}
</style>
