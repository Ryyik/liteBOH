<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Camera,
  Check,
  GripVertical,
  Hash,
  Image as ImageIcon,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCcw,
  Sparkles,
  X,
} from 'lucide-vue-next';
import HomeCatMascot from '@/components/HomeCatMascot.vue';
import ImageEditModal from './ImageEditModal.vue';
import { useAutoGrowTextarea } from '@/composables/useAutoGrowTextarea.js';
import { FORUM_POST_TITLE_MAX_LENGTH } from '../forum-config.js';
import {
  useForumPostPolish,
  POLISH_SETTLE_MS,
  POLISH_EXIT_MS,
} from '../composables/useForumPostPolish.js';
import { POST_POLISH_MAX_INPUT_CHARS } from '../composables/post-polish.js';
import { useImageStripDrag } from '../composables/useImageStripDrag.js';
import { ALBUM_INTRO_MAX, ALBUM_MAX_ENTRIES, ALBUM_TITLE_MAX } from '@/utils/forum-album.js';

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
  /** 'post' 普通帖 / 'album' 影集帖（形态由入口的选择球决定，两者共用同一场发布会话）。 */
  mode: { type: String, default: 'post' },
  /** 这一篇里每张照片的文字，与 postImages 按下标对齐（结构见 utils/forum-album.js）。 */
  albumEntries: { type: Array, default: () => [] },
  /** 影集本体 `{ title, intro }`（一人一本）。title 为空 = 还没建过，本次发布负责建本。 */
  albumBook: { type: Object, default: () => ({ title: '', intro: '' }) },
  /**
   * 影集发布步骤（1 建本 / 2 选照片 / 3 写第一篇）。
   * **状态住在父层**：顶栏的「下一步」与编辑器底栏必须走同一个推进函数，
   * 否则两处各算一套，跨过校验（空名/空图）就能互相绕过。
   */
  albumStep: { type: Number, default: 1 },
});

const emit = defineEmits([
  'submit',
  'close',
  'login',
  'update:newPost',
  'update:selectedPostTag',
  'update:postLocation',
  'update:albumEntries',
  'update:albumBook',
  'update:mode',
  'album-step',
  'request-image-picker',
  'request-camera',
  'image-selection',
  'remove-image',
  'retry-image',
  'reorder-image',
  'clear-images',
  'edit-image',
]);

const isEditMode = computed(() => Boolean(props.editMode));

/* ── 影集模式 ────────────────────────────────────────────────────────────
   影集帖与普通帖共用同一个编辑器，只多一块「逐张配字」：
   一次发布 = 一篇（可含 1..10 张照片），每张照片配标题/日期/地点/一段字。
   entries 与 postImages **按下标对齐**，
   增删图由父层 syncAlbumEntriesToCount 维护，这里只负责当前选中项与写回。 */
const isAlbumMode = computed(() => props.mode === 'album');

/** 三步流程只作用于「新建影集」；编辑态（若将来复用）仍按一屏全字段渲染。 */
const isAlbumFlow = computed(() => isAlbumMode.value && !isEditMode.value);

/* 一人一本：名称 + 简介只填一次（初次创建），之后每次发布只写配文。
   `hasAlbumBook` 来自 utils/forum-album.js（单源），这里只决定显示哪一形态。 */
const albumBookTitle = computed(() => String(props.albumBook?.title || '').trim());
const albumBookIntro = computed(() => String(props.albumBook?.intro || '').trim());
const albumBookReady = computed(() => Boolean(albumBookTitle.value));

const updateAlbumIntro = (event) => {
  emit('update:albumBook', {
    title: albumBookTitle.value,
    intro: String(event?.target?.value || ''),
  });
};

/* ── 三步走（2026-11-15 用户定稿：「把创建和发布第一篇弄得很清楚」）────────
   一屏里同时出现 名称 / 简介 / 配文 / 逐张配文 时，用户看不出先后（实测反馈）。
   所以按「建本 → 选照片 → 写第一篇」拆成三步：每一步只留一件事，
   顶栏与底栏的推进都走父层的同一个函数（props.albumStep + emit('album-step')）。 */
const ALBUM_STEP_TOTAL = 3;

const albumStepNo = computed(() => {
  if (!isAlbumMode.value) return 0;
  const raw = Number(props.albumStep) || 1;
  return Math.min(ALBUM_STEP_TOTAL, Math.max(1, raw));
});

/** 已经建过本的用户不再回到第一步（floor=2），避免让人以为要再建一本。 */
const albumStepFloor = computed(() => (albumBookReady.value ? 2 : 1));

const albumDraftTitle = computed(() => String(props.newPost.title || '').trim());
const albumTitleCount = computed(() => String(props.newPost.title || '').length);

const albumSteps = computed(() => [
  {
    no: 1,
    label: '建本',
    /* 名字填好（哪怕还没落库）就打勾并显示书名：打勾却还写着「起个名字」是自相矛盾。
       不带书名号 —— 三等分的格子只有 ~65px，加《》必被截成「《波海的四…」。 */
    hint: albumDraftTitle.value || '起个名字',
    done: albumBookReady.value || Boolean(albumDraftTitle.value),
  },
  {
    no: 2,
    label: '选照片',
    hint: `${props.postImages.length}/${ALBUM_MAX_ENTRIES} 张`,
    done: props.postImages.length > 0,
  },
  {
    no: 3,
    /* 「篇」= 一次发布（用户 2026-11-15 纠正）：建过本是在往本里追加一篇 */
    label: albumBookReady.value ? '写这一篇' : '写第一篇',
    hint: props.postImages.length > 1 ? `${props.postImages.length} 张可配字` : '配文可留空',
    done: false,
  },
]);

const goAlbumStep = (no) => emit('album-step', no);

const albumNextLabel = computed(() => {
  if (albumStepNo.value === 1) return '建好，去挑照片';
  return albumBookReady.value ? '照片选好了，写这一篇' : '照片选好了，写第一篇';
});

const albumEditIndex = ref(0);

const EMPTY_ALBUM_ENTRY = { title: '', date: '', place: '', body: '' };

const albumEntryList = computed(() => {
  const list = Array.isArray(props.albumEntries) ? props.albumEntries : [];
  const count = props.postImages.length;
  return Array.from({ length: count }, (_, i) => list[i] || EMPTY_ALBUM_ENTRY);
});

const currentAlbumEntry = computed(
  () => albumEntryList.value[albumEditIndex.value] || EMPTY_ALBUM_ENTRY,
);

/* 删图/清空后选中项可能越界 —— 夹回最后一张，避免编辑到不存在的照片 */
watch(
  () => props.postImages.length,
  (count) => {
    if (albumEditIndex.value >= count) {
      albumEditIndex.value = Math.max(0, count - 1);
    }
  },
);

watch(
  () => props.mode,
  (mode) => {
    if (mode !== 'album') albumEditIndex.value = 0;
  },
);

const updateAlbumEntry = (field, value) => {
  const next = albumEntryList.value.map((entry) => ({ ...entry }));
  const target = next[albumEditIndex.value];
  if (!target) return;
  target[field] = String(value ?? '');
  emit('update:albumEntries', next);
};

const albumEntryFilled = (index) => {
  const entry = albumEntryList.value[index];
  return Boolean(entry && (entry.title || entry.body));
};

/** 第三步的大图预览：当前选中的那一张（照片是这一张的载体，字段就在它旁边写）。 */
const currentAlbumImage = computed(() => {
  const image = props.postImages[albumEditIndex.value];
  return String(image?.localPreviewUrl || image?.url || '');
});

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
  /* 影集：一次发布 = 往本里加一篇。第一次发要让人知道「这一步是在开本」，
     之后每次都是在已有的一本里追加，用词跟着变。 */
  if (isAlbumMode.value) {
    if (isPostBusy.value) return '处理中…';
    return albumBookReady.value ? '发布这一篇' : '发布第一篇';
  }
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
/**
 * 能不能拖这张图换序。
 * 上传中（uploading/processing）不让拖：管线按 index 回填结果，中途换序会错位。
 * **失败态（failed）允许拖** —— 它只是本地一条记录，换序不影响任何在途请求；
 * 之前把它排除在外，结果是「上传断流时整条胶片条都拖不动」，看起来像功能坏了。
 */
const canReorderImage = (image) =>
  !image?.uploadStatus || ['approved', 'staged', 'failed'].includes(image.uploadStatus);

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

/* ── 图片编辑器（P0，2026-11-05 定稿「流法 C」）─────────────────────────
   选图先经确认页（横滑预览 + 编辑 / 移除 / 全部确认），确认后才 emit
   image-selection 启动「压缩 → 审核 → 上传」管线 —— 编辑全部发生在上传前，
   零浪费零竞态。限额闸门在 openPostImagePicker（选图入口）已拦过一轮。
   网格缩略图带画笔角标可再编辑：产物交宿主（ForumMain → 编辑管线重启）。 */

const imageEditRequest = ref(null);

const handleImageChange = (event) => {
  const files = Array.from(event?.target?.files || []);
  if (postImageInputRef.value) postImageInputRef.value.value = '';
  if (postCameraInputRef.value) postCameraInputRef.value.value = '';
  if (!files.length) return;
  imageEditRequest.value = { mode: 'confirm', files };
};

const closeImageEditRequest = () => {
  imageEditRequest.value = null;
};

const handleImageEditConfirm = (files) => {
  imageEditRequest.value = null;
  if (Array.isArray(files) && files.length) emit('image-selection', { files });
};

/* 网格缩略图的画笔角标：再编辑 = 以编辑产物重启该图的管线（宿主收口） */
const openImageEditor = (image, index) => {
  if (isPostBusy.value || !image?.file) return;
  imageEditRequest.value = { mode: 'edit', files: [image.file], image, index };
};

const handleImageEditSave = (file) => {
  const request = imageEditRequest.value;
  imageEditRequest.value = null;
  if (!file || request?.mode !== 'edit') return;
  emit('edit-image', request.image, request.index, file);
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

/** 从「看大图」进编辑器。索引按当前数组重新求 —— 拖拽排序后旧 index 会错位。 */
const editPreviewImage = () => {
  const image = previewImage.value;
  if (!image?.file) return;
  const index = props.postImages.findIndex((item) => item === image);
  closeImagePreview();
  openImageEditor(image, index);
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

        <!-- 形态切换（帖子 / 影集）。
             竖屏的主入口是 FAB 的选择球；横屏没有 FAB（左栏「发布」直接开编辑器），
             所以这里再给一个就地切换 —— 否则横屏根本进不了影集模式。 -->
        <div v-if="!isEditMode" class="composer-mode-switch" role="tablist" aria-label="发布类型">
          <button
            type="button"
            class="composer-mode-btn"
            role="tab"
            :aria-selected="!isAlbumMode"
            @click="emit('update:mode', 'post')"
          >
            帖子
          </button>
          <button
            type="button"
            class="composer-mode-btn"
            role="tab"
            :aria-selected="isAlbumMode"
            @click="emit('update:mode', 'album')"
          >
            影集
          </button>
        </div>

        <!-- ── 影集三步走 ─────────────────────────────────────────────────
             为什么要拆：一屏里同时出现 名称 / 简介 / 配文 / 逐张配文 时，
             用户看不出先后（2026-11-15 反馈「流程不够清晰」）。
             现在每一步只留一件事，节点本身也是进度条：已完成的打勾、当前的高亮。
             步骤状态住在父层，顶栏「下一步」与底栏走同一个推进函数。 -->
        <nav v-if="isAlbumFlow" class="album-steps" role="tablist" aria-label="影集发布步骤">
          <button
            v-for="step in albumSteps"
            :key="step.no"
            type="button"
            class="album-step"
            role="tab"
            :class="{
              'is-active': albumStepNo === step.no,
              'is-done': step.done && albumStepNo !== step.no,
            }"
            :aria-selected="albumStepNo === step.no"
            :disabled="step.no < albumStepFloor || step.no > albumStepNo"
            @click="goAlbumStep(step.no)"
          >
            <span class="album-step-dot">
              <Check v-if="step.done && albumStepNo !== step.no" :size="12" :stroke-width="3" />
              <template v-else>{{ step.no }}</template>
            </span>
            <span class="album-step-copy">
              <b>{{ step.label }}</b>
              <em>{{ step.hint }}</em>
            </span>
          </button>
          <span class="album-steps-rail" aria-hidden="true"></span>
        </nav>

        <!-- 第一步 · 建本：用一本「书」把「这是个长期的东西」讲明白。
             名称必填，简介可留空；这一次填完，之后每次发布都不再问。 -->
        <section v-if="isAlbumFlow && albumStepNo === 1" class="album-panel album-panel-book">
          <div class="album-cover" :class="{ 'is-blank': !albumDraftTitle }">
            <span class="album-cover-tag">影集 · 你的第一本</span>
            <b class="album-cover-name">{{ albumDraftTitle || '还没起名' }}</b>
            <span class="album-cover-rule" aria-hidden="true"></span>
            <span class="album-cover-intro">
              {{
                String(albumBookIntro || '') || '写一句介绍，让路过的人知道这本里收着什么（可留空）'
              }}
            </span>
            <span class="album-cover-foot">建好后每次发都收进这一本，第一篇从下一步开始</span>
          </div>

          <div class="album-book-form">
            <label class="album-book-field">
              <span class="album-book-label">影集名称 <em class="is-required">必填</em></span>
              <input
                class="album-book-input"
                :value="newPost.title"
                :maxlength="ALBUM_TITLE_MAX"
                enterkeyhint="next"
                placeholder="例如：波海的四季"
                @input="updateTitle($event.target.value)"
              />
              <span
                class="album-book-count"
                :class="{ 'is-near-limit': albumTitleCount >= ALBUM_TITLE_MAX }"
                >{{ albumTitleCount }}/{{ ALBUM_TITLE_MAX }}</span
              >
            </label>
            <label class="album-book-field">
              <span class="album-book-label">简介 <em>可留空</em></span>
              <textarea
                class="album-book-intro"
                rows="2"
                :maxlength="ALBUM_INTRO_MAX"
                :value="albumBookIntro"
                placeholder="一句话说明这本影集收什么（可留空）"
                @input="updateAlbumIntro"
              ></textarea>
            </label>
            <p class="album-book-note">名字只问这一次，之后每次发布只写配文 + 照片。</p>
          </div>
        </section>

        <div v-if="!isAlbumFlow" class="input-group post-title-input-group composer-post-title">
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

        <!-- 第二步 · 选照片：空态给一张「可以点的大白纸」，不要只留一行正文框。 -->
        <section v-if="isAlbumFlow && albumStepNo === 2" class="album-panel album-panel-photos">
          <div class="album-photo-head">
            <b>挑照片</b>
            <span>这一篇 1–{{ ALBUM_MAX_ENTRIES }} 张，第一张作封面</span>
            <span class="album-photo-count" :class="{ 'is-empty': !postImages.length }">
              {{ postImages.length }}/{{ ALBUM_MAX_ENTRIES }}
            </span>
          </div>
          <div v-if="!postImages.length" class="album-photo-empty">
            <div class="album-photo-empty-art" aria-hidden="true">
              <span v-for="n in 3" :key="n" class="album-photo-empty-card"></span>
            </div>
            <p class="album-photo-empty-text">
              挑几张照片，或者现在拍一张。<br />
              第一张会作为这一篇的封面。
            </p>
            <div class="album-photo-empty-actions">
              <button
                type="button"
                class="album-photo-btn is-primary"
                :disabled="isPostBusy"
                @click="handleImagePickerRequest"
              >
                <ImageIcon :size="17" :stroke-width="2" aria-hidden="true" />
                <span>从相册选</span>
              </button>
              <button
                type="button"
                class="album-photo-btn"
                :disabled="isPostBusy"
                @click="handleCameraRequest"
              >
                <Camera :size="17" :stroke-width="2" aria-hidden="true" />
                <span>拍一张</span>
              </button>
            </div>
          </div>
          <p v-else class="album-photo-hint">
            顺序就是阅读顺序：长按卡片可以拖动调整；点右上角 × 删掉某一张。
          </p>
        </section>

        <!-- 第三步 · 写这一篇：先给一句整体配文，再逐张配字（都可留空）。 -->
        <section v-if="isAlbumFlow && albumStepNo === 3" class="album-panel album-panel-write">
          <div class="album-write-head">
            <b>{{ albumBookReady ? '写这一篇' : '写第一篇' }}</b>
            <span>
              配文可以留空，只发图也行 · 下面按 01–{{ String(postImages.length).padStart(2, '0') }}
              逐张配字
            </span>
          </div>
        </section>

        <div
          v-if="!isAlbumFlow || albumStepNo === 3"
          class="input-group post-body-input-group composer-post-body"
          :class="{ 'has-images': postImages.length > 0 }"
        >
          <div class="composer-body-shell">
            <textarea
              ref="postContentInputRef"
              :value="newPost.content"
              :placeholder="
                isAlbumMode
                  ? albumBookReady
                    ? '写点配文（可留空 · 照片必传）'
                    : '卷首的一句话（可留空 · 照片必传）'
                  : isMobileComposer
                    ? '有什么新鲜事？'
                    : '正文内容...'
              "
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

        <div v-if="!isAlbumFlow || albumStepNo === 2" class="post-image-panel">
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
                <!-- 影集模式：序号就是这一篇里的阅读顺序，必须看得见 -->
                <span v-if="isAlbumMode" class="post-image-album-no">{{
                  String(index + 1).padStart(2, '0')
                }}</span>
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
                <!-- 画笔角标：再编辑（有本地文件且不在忙态才可进；编辑会重启该图管线）。
                     放在右下角，与右上角删除钮隔 62px（108px 瓦片上），不会误触；
                     大图预览里也有一个同功能入口（两处都能进） -->
                <button
                  v-if="image.file && !isPostBusy"
                  type="button"
                  class="post-image-edit-btn"
                  :aria-label="`编辑第 ${index + 1} 张图片`"
                  @click="openImageEditor(image, index)"
                >
                  <Pencil :size="14" :stroke-width="2.4" aria-hidden="true" />
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

        <!-- 第三步 · 逐张配字：左边是这一张的照片（与最终卡片同构），右边写字段。
             照片是文字的载体 —— 只给一排 52px 缩略图 + 一堆输入框时，
             用户不知道自己正在写哪一张（2026-11-15 反馈），所以给一张大图压阵。 -->
        <div
          v-if="isAlbumMode && (isEditMode || albumStepNo === 3) && postImages.length"
          class="album-parts"
        >
          <div class="album-parts-head">
            <span class="album-parts-kicker">逐张配字</span>
            <span class="album-parts-hint">
              可选 · 每张都能写标题和一段字 · 共 {{ postImages.length }} 张
            </span>
          </div>

          <div class="album-parts-strip">
            <button
              v-for="(image, index) in postImages"
              :key="image.uploadId || image.publicId || index"
              type="button"
              class="album-part-thumb"
              :class="{
                'is-active': index === albumEditIndex,
                'is-filled': albumEntryFilled(index),
              }"
              :aria-pressed="index === albumEditIndex"
              :aria-label="`第 ${index + 1} 张`"
              @click="albumEditIndex = index"
            >
              <img :src="image.localPreviewUrl || image.url" alt="" loading="lazy" />
              <span class="album-part-no">{{ String(index + 1).padStart(2, '0') }}</span>
            </button>
          </div>

          <div class="album-part-spread">
            <div class="album-part-photo">
              <img v-if="currentAlbumImage" :src="currentAlbumImage" alt="" />
              <span class="album-part-photo-no">
                第 {{ String(albumEditIndex + 1).padStart(2, '0') }} 张
              </span>
            </div>
            <div class="album-part-fields">
              <input
                class="album-part-input album-part-title"
                :value="currentAlbumEntry.title"
                maxlength="16"
                placeholder="这一张的标题"
                aria-label="这一张的标题"
                @input="updateAlbumEntry('title', $event.target.value)"
              />
              <div class="album-part-row">
                <input
                  class="album-part-input album-part-date"
                  :value="currentAlbumEntry.date"
                  maxlength="12"
                  placeholder="日期"
                  aria-label="日期"
                  @input="updateAlbumEntry('date', $event.target.value)"
                />
                <input
                  class="album-part-input album-part-place"
                  :value="currentAlbumEntry.place"
                  maxlength="16"
                  placeholder="地点"
                  aria-label="地点"
                  @input="updateAlbumEntry('place', $event.target.value)"
                />
              </div>
              <textarea
                class="album-part-input album-part-body"
                :value="currentAlbumEntry.body"
                rows="4"
                placeholder="写这一张字…（空一行分段）"
                aria-label="这一张的正文"
                @input="updateAlbumEntry('body', $event.target.value)"
              ></textarea>
            </div>
          </div>
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
          <span v-if="isAlbumFlow" class="composer-action-tip"
            >第 {{ albumStepNo }} / {{ ALBUM_STEP_TOTAL }} 步 ·
            {{ albumSteps[albumStepNo - 1]?.label }}</span
          >
          <span v-else-if="!isEditMode" class="composer-action-tip"
            >试试智能整理，把草稿梳理得更清楚</span
          >
        </div>
        <div class="editor-submit-group">
          <div v-if="!isAlbumFlow || albumStepNo === 3" class="composer-actions" @click.stop>
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
          <!-- 影集三步走的推进器，与发布按钮**同一行**：竖屏底栏是 block 布局，
               多出一行会把发布按钮挤出视口（2026-11-15 实测截图）。
               推进器只做到「下一步」为止 —— 发布永远发生在第三步，避免在第 1 步误发。 -->
          <div class="composer-submit-row">
            <button
              v-if="isAlbumFlow && albumStepNo > albumStepFloor"
              type="button"
              class="album-step-back"
              @click="goAlbumStep(albumStepNo - 1)"
            >
              上一步
            </button>
            <button
              v-if="isAlbumFlow && albumStepNo < ALBUM_STEP_TOTAL"
              type="button"
              class="album-step-next boh-press-sm"
              :disabled="isPostBusy"
              @click="goAlbumStep(albumStepNo + 1)"
            >
              <span>{{ albumNextLabel }}</span>
              <ArrowRight :size="16" :stroke-width="2.4" aria-hidden="true" />
            </button>
            <button
              v-if="!isAlbumFlow || albumStepNo === ALBUM_STEP_TOTAL"
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
            <!-- 编辑入口从缩略图角标搬到了这里：缩略图上原来「画笔 + 删除」两个
                 小圆点只隔 12px，触屏上很难分清楚（用户反馈误触）。看大图的
                 时候顺手点编辑，动作语义也更顺 -->
            <div v-if="previewImage?.file" class="composer-image-preview-actions">
              <button
                type="button"
                class="composer-image-preview-edit"
                :disabled="isPostBusy"
                @click="editPreviewImage"
              >
                <Pencil :size="16" :stroke-width="2.2" aria-hidden="true" />
                <span>编辑</span>
              </button>
            </div>
          </section>
        </div>
      </transition>
    </Teleport>

    <!-- 图片编辑器：确认页（选图后）与单图再编辑（网格画笔角标）共用 -->
    <ImageEditModal
      :visible="Boolean(imageEditRequest)"
      :mode="imageEditRequest?.mode || 'confirm'"
      :files="imageEditRequest?.files || []"
      @close="closeImageEditRequest"
      @confirm="handleImageEditConfirm"
      @save="handleImageEditSave"
    />
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

/* ── 影集「逐张配字」编辑区 ───────────────────────────────────────────────
   版式与信息流卡片 / 阅读层同构：缩略图条选张，下面四个字段写这一张。
   颜色走 token（--liquid-*）+ 少量中性灰，暗色由 [data-theme='dark'] 改写。 */
.composer-mode-switch {
  display: inline-flex;
  /* 父级是 flex column（align-items: stretch），inline-flex 作为 flex item 也会被拉满整行
     ⇒ 胶囊会横跨卡片、看起来像一条分隔条。显式靠左收成内容宽。 */
  align-self: flex-start;
  gap: 4px;
  margin: 4px 0 14px;
  padding: 3px;
  border-radius: 999px;
  /* 2026-11-15：原来是「白底胶囊 + 白底选中 + 淡阴影」，放在纯白编辑区里
     几乎看不出选中态（用户反馈「不够清晰」）。容器改浅灰、选中态改实心深色。 */
  background: rgba(15, 23, 42, 0.05);
  border: 1px solid rgba(15, 23, 42, 0.06);
}

.composer-mode-btn {
  border: 0;
  background: none;
  padding: 6px 18px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--liquid-text-secondary, #6b6b70);
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

.composer-mode-btn[aria-selected='true'] {
  background: var(--liquid-text-primary, #1d1d1f);
  color: #ffffff;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.18);
}

[data-theme='dark'] .composer-mode-switch {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.08);
}

[data-theme='dark'] .composer-mode-btn[aria-selected='true'] {
  background: #f2f2f7;
  color: #16161e;
}

/* ── 影集三步走 ──────────────────────────────────────────────────────────
   2026-11-15：把「建本 / 选照片 / 写第一篇」从一屏塞满拆成三步。
   步骤条本身就是进度条：已完成的节点打勾，当前节点实心，未到的置灰。 */
.album-steps {
  display: flex;
  align-items: stretch;
  gap: 4px;
  /* 宽屏上别把三个节点拉成一条几米长的进度条：走到 640px 就停 */
  max-width: 640px;
  margin: 8px 0 14px;
  padding: 6px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--liquid-text-primary, #1d1d1f) 4%, transparent);
}

.album-steps-rail {
  display: none;
}

.album-step {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border: 0;
  border-radius: 10px;
  background: none;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.2s ease,
    box-shadow 0.2s ease;
}

.album-step.is-active {
  background: var(--surface-primary, #fff);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.1);
}

.album-step:disabled {
  cursor: default;
  opacity: 0.55;
}

.album-step-dot {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--liquid-text-primary, #1d1d1f) 20%, transparent);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--liquid-text-secondary, #6b6b70);
}

.album-step.is-active .album-step-dot {
  border-color: transparent;
  background: var(--liquid-text-primary, #1d1d1f);
  color: var(--surface-primary, #fff);
}

.album-step.is-done .album-step-dot {
  border-color: transparent;
  background: color-mix(in srgb, var(--apple-blue, #0071e3) 16%, transparent);
  color: var(--apple-blue, #0071e3);
}

.album-step-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.album-step-copy b {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--liquid-text-primary, #1d1d1f);
  white-space: nowrap;
}

.album-step-copy em {
  font-style: normal;
  font-size: 10.5px;
  color: var(--liquid-text-tertiary, #9a9a9f);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.album-panel {
  margin: 0 0 12px;
}

/* 第一步 · 建本：左边一本「书」（长期感的锚），右边两个字段 */
.album-panel-book {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: stretch;
}

.album-cover {
  position: relative;
  flex: 0 0 176px;
  min-height: 212px;
  padding: 16px 16px 14px 24px;
  border-radius: 5px 14px 14px 5px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  overflow: hidden;
  color: #f5f5f7;
  background: linear-gradient(152deg, #33333c 0%, #17171d 62%, #101014 100%);
  box-shadow:
    0 18px 36px -22px rgba(0, 0, 0, 0.72),
    inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

/* 书脊 + 一道斜向高光：有这两笔才像「一本」，而不是一个深色方块 */
.album-cover::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 11px;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.6), rgba(255, 255, 255, 0.07));
}

.album-cover::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(120% 78% at 100% 0%, rgba(255, 255, 255, 0.16), transparent 62%);
}

.album-cover-tag {
  font-size: 9.5px;
  letter-spacing: 0.22em;
  color: rgba(255, 255, 255, 0.6);
}

.album-cover-name {
  font-size: 21px;
  font-weight: 600;
  line-height: 1.28;
  letter-spacing: 0.02em;
  word-break: break-word;
}

.album-cover.is-blank .album-cover-name {
  color: rgba(255, 255, 255, 0.4);
}

.album-cover-rule {
  width: 26px;
  height: 1px;
  background: rgba(255, 255, 255, 0.34);
  margin: 2px 0 3px;
}

.album-cover-intro {
  font-size: 11.5px;
  line-height: 1.72;
  color: rgba(255, 255, 255, 0.72);
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.album-cover-foot {
  margin-top: auto;
  font-size: 9.5px;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.48);
}

.album-book-form {
  flex: 1 1 230px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.album-book-field {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.album-book-label {
  font-size: 10.5px;
  letter-spacing: 0.16em;
  color: var(--liquid-text-tertiary, #9a9a9f);
}

.album-book-label em {
  font-style: normal;
  letter-spacing: 0;
  margin-left: 5px;
  color: var(--liquid-text-tertiary, #9a9a9f);
}

.album-book-label em.is-required {
  color: var(--apple-blue, #0071e3);
}

.album-book-input,
.album-book-intro {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  /* 只描边在白卡上几乎看不见（实测截图），加一层极浅填充才读得出「这是个输入框」 */
  border: 1px solid color-mix(in srgb, var(--liquid-text-primary, #1d1d1f) 14%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--liquid-text-primary, #1d1d1f) 3%, transparent);
  color: var(--liquid-text-primary, #1d1d1f);
  font-size: 14px;
  line-height: 1.5;
  outline: none;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
}

.album-book-intro {
  resize: none;
  font-size: 13px;
  line-height: 1.75;
}

.album-book-input:focus,
.album-book-intro:focus {
  border-color: var(--apple-blue, #0071e3);
  background: var(--surface-primary, #fff);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--apple-blue, #0071e3) 16%, transparent);
}

.album-book-count {
  position: absolute;
  right: 10px;
  bottom: 9px;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--liquid-text-tertiary, #9a9a9f);
  pointer-events: none;
}

.album-book-count.is-near-limit {
  color: #d9480f;
}

.album-book-note {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--liquid-text-tertiary, #9a9a9f);
}

/* 第二步 · 选照片 */
.album-photo-head,
.album-write-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  margin: 2px 0 10px;
}

.album-photo-head b,
.album-write-head b {
  font-size: 14px;
  font-weight: 600;
  color: var(--liquid-text-primary, #1d1d1f);
}

.album-photo-head > span,
.album-write-head > span {
  font-size: 11.5px;
  color: var(--liquid-text-tertiary, #9a9a9f);
}

.album-photo-count {
  margin-left: auto;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  color: var(--liquid-text-secondary, #6b6b70);
  background: color-mix(in srgb, var(--liquid-text-primary, #1d1d1f) 6%, transparent);
}

.album-photo-count.is-empty {
  color: var(--apple-blue, #0071e3);
  background: color-mix(in srgb, var(--apple-blue, #0071e3) 12%, transparent);
}

.album-photo-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 16px 12px 4px;
  text-align: center;
}

/* 三张错开的白卡：不用插画也能读出「这里要放照片」 */
.album-photo-empty-art {
  position: relative;
  width: 116px;
  height: 78px;
}

.album-photo-empty-card {
  position: absolute;
  width: 58px;
  height: 72px;
  border-radius: 8px;
  border: 1px solid var(--liquid-border, rgba(15, 23, 42, 0.12));
  background: var(--surface-primary, #fff);
  box-shadow: 0 8px 16px -10px rgba(15, 23, 42, 0.4);
}

.album-photo-empty-card:nth-child(1) {
  left: 2px;
  top: 6px;
  transform: rotate(-9deg);
}

/* 两侧的卡片压一层浅灰：纯白卡贴白底只剩一条细描边，读不出「一叠纸」 */
.album-photo-empty-card:nth-child(1),
.album-photo-empty-card:nth-child(3) {
  background: color-mix(in srgb, var(--liquid-text-primary, #1d1d1f) 7%, transparent);
}

.album-photo-empty-card:nth-child(2) {
  left: 28px;
  top: 0;
  /* 中间那张必须在最上层：左右两张各压住它一半，'+' 会被盖掉（实测只剩一个点） */
  z-index: 1;
  border-color: color-mix(in srgb, var(--apple-blue, #0071e3) 34%, transparent);
}

.album-photo-empty-card:nth-child(2)::after {
  content: '+';
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 20px;
  font-weight: 300;
  color: var(--apple-blue, #0071e3);
}

.album-photo-empty-card:nth-child(3) {
  left: 54px;
  top: 6px;
  transform: rotate(9deg);
}

.album-photo-empty-text {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--liquid-text-secondary, #6b6b70);
}

.album-photo-empty-actions {
  display: flex;
  gap: 10px;
}

.album-photo-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  border: 1px solid var(--liquid-border, rgba(15, 23, 42, 0.14));
  border-radius: 999px;
  background: transparent;
  font-size: 13px;
  color: var(--liquid-text-primary, #1d1d1f);
  cursor: pointer;
}

.album-photo-btn.is-primary {
  border-color: transparent;
  background: var(--apple-blue, #0071e3);
  color: #fff;
}

.album-photo-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.album-photo-hint {
  margin: 0 0 6px;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--liquid-text-tertiary, #9a9a9f);
}

/* 第三步 · 写这一篇 */
.album-part-spread {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.album-part-photo {
  position: relative;
  flex: 0 0 168px;
  border-radius: 10px;
  overflow: hidden;
  background: #101014;
}

.album-part-photo img {
  width: 100%;
  height: 100%;
  max-height: 224px;
  object-fit: cover;
  display: block;
}

.album-part-photo-no {
  position: absolute;
  left: 8px;
  bottom: 7px;
  font-size: 9.5px;
  letter-spacing: 0.12em;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.65);
}

.album-part-spread .album-part-fields {
  flex: 1 1 auto;
  min-width: 0;
  /* 宽屏上别让输入行拉成一米长的单行：阅读与点选都会变差 */
  max-width: 520px;
}

/* 底栏推进器：只负责「下一步 / 上一步」，发布永远在第三步。
   与发布按钮同一行 —— 竖屏底栏是 block 布局，多一行会把按钮挤出去（实测）。
   ⚠️ 不要写 `width: 100%`：桌面底栏是 inline-flex，宽 100% 会和 `.composer-actions`
   抢同一段空间，动作按钮会横向溢出**盖住**「上一步」（实测：按钮在 DOM 里、屏幕上没有）。 */
.composer-submit-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 0 0 auto;
}

.composer-submit-row .post-btn {
  flex: 1 1 auto;
  min-width: 0;
  width: auto;
  margin-left: 0;
}

.album-step-back {
  flex: 0 0 auto;
  padding: 8px 10px;
  border: 0;
  background: none;
  font-size: 13px;
  color: var(--liquid-text-secondary, #6b6b70);
  cursor: pointer;
}

.album-step-next {
  flex: 1 1 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 40px;
  padding: 0 20px;
  border: 0;
  border-radius: 999px;
  background: var(--apple-blue, #0071e3);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.album-step-next:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

[data-theme='dark'] .album-steps {
  background: rgba(255, 255, 255, 0.06);
}

[data-theme='dark'] .album-step.is-active {
  background: rgba(255, 255, 255, 0.1);
  box-shadow: none;
}

[data-theme='dark'] .album-step.is-active .album-step-dot {
  background: #f2f2f7;
  color: #16161e;
}

[data-theme='dark'] .album-step-copy b,
[data-theme='dark'] .album-photo-head b,
[data-theme='dark'] .album-write-head b {
  color: #f2f2f7;
}

[data-theme='dark'] .album-book-input,
[data-theme='dark'] .album-book-intro,
[data-theme='dark'] .album-photo-empty-card {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.12);
  color: #f2f2f7;
}

[data-theme='dark'] .album-photo-btn {
  border-color: rgba(255, 255, 255, 0.16);
  color: #f2f2f7;
}

[data-theme='dark'] .album-photo-btn.is-primary {
  border-color: transparent;
  color: #fff;
}

.album-parts {
  margin-top: 18px;
  padding: 14px 12px 12px;
  border: 1px solid var(--liquid-border, rgba(15, 23, 42, 0.08));
  border-radius: 14px;
  background: var(--liquid-bg, rgba(255, 255, 255, 0.6));
}

.album-parts-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 10px;
}

.album-parts-kicker {
  font-size: 10px;
  letter-spacing: 0.18em;
  color: var(--liquid-text-tertiary, #8a8a8e);
  border: 1px solid var(--liquid-border, rgba(15, 23, 42, 0.1));
  padding: 2px 6px;
  border-radius: 4px;
}

.album-parts-hint {
  font-size: 11px;
  color: var(--liquid-text-tertiary, #8a8a8e);
}

.album-parts-strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 2px 0 8px;
  scrollbar-width: none;
}

.album-parts-strip::-webkit-scrollbar {
  display: none;
}

.album-part-thumb {
  position: relative;
  flex: 0 0 auto;
  width: 52px;
  height: 52px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  overflow: hidden;
  opacity: 0.45;
  background: none;
  cursor: pointer;
  transition:
    opacity 0.2s ease,
    border-color 0.2s ease,
    transform 0.2s ease;
}

.album-part-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.album-part-thumb[aria-pressed='true'] {
  opacity: 1;
  border-color: var(--apple-blue, #0071e3);
  transform: translateY(-1px);
}

.album-part-thumb.is-filled::after {
  content: '';
  position: absolute;
  right: 4px;
  top: 4px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--apple-blue, #0071e3);
}

.album-part-no {
  position: absolute;
  left: 4px;
  bottom: 3px;
  font-size: 8.5px;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}

.album-part-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.album-part-input {
  width: 100%;
  border: 0;
  border-bottom: 1px dashed transparent;
  background: none;
  padding: 4px 0;
  color: var(--liquid-text-primary, #1d1d1f);
  outline: none;
}

.album-part-input:focus {
  border-bottom-color: var(--liquid-border, rgba(15, 23, 42, 0.2));
}

.album-part-title {
  font-size: 16px;
  font-weight: 600;
}

.album-part-row {
  display: flex;
  gap: 10px;
}

.album-part-date {
  width: 84px;
  flex: none;
  font-size: 12px;
  color: var(--liquid-text-secondary, #6b6b70);
}

.album-part-place {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--liquid-text-secondary, #6b6b70);
}

.album-part-body {
  font-size: 13px;
  line-height: 1.85;
  resize: vertical;
  /* 4 行起步：两段 + 空行刚好不滚动。3 行时内容一超就出「半截行」，
     截图里看着像文字重叠（实测），其实是 textarea 滚到了光标处。 */
  min-height: 96px;
}

/* 影集模式下的图序角标（序号即阅读顺序，必须看得见） */
.post-image-album-no {
  position: absolute;
  left: 6px;
  top: 6px;
  z-index: 2;
  padding: 1px 5px;
  border-radius: 5px;
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #fff;
  background: rgba(0, 0, 0, 0.52);
  backdrop-filter: blur(6px);
  pointer-events: none;
}

@media (max-width: 720px) {
  /* 竖屏：照片在上、字段在下 —— 130px 的窄图旁边写字会挤成两三个字一行 */
  .album-part-spread {
    flex-direction: column;
  }

  .album-part-photo {
    flex: 0 0 auto;
    width: 100%;
    aspect-ratio: 16 / 10;
    /* 竖屏一张 16:10 的大图会把字段压到下一屏，限高保证「图 + 标题字段」同屏 */
    max-height: 150px;
  }

  .album-part-photo img {
    max-height: none;
  }

  .album-panel-book {
    gap: 12px;
  }

  /* 竖屏第一屏要能同时看见「书」和名称输入框，封面压矮一点 */
  .album-cover {
    flex: 0 0 100%;
    min-height: 150px;
  }
}

[data-theme='dark'] .album-parts {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.1);
}

[data-theme='dark'] .album-part-input {
  color: #f2f2f7;
}

[data-theme='dark'] .album-part-date,
[data-theme='dark'] .album-part-place {
  color: rgba(235, 235, 245, 0.6);
}

@media (max-width: 380px) {
  .album-part-place {
    font-size: 11.5px;
  }
}
</style>
