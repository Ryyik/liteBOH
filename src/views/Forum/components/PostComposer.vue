<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Camera,
  Eye,
  FileText,
  GripVertical,
  Hash,
  Image as ImageIcon,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  X
} from 'lucide-vue-next';
import HomeCatMascot from '@/components/HomeCatMascot.vue';

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
  weeklyCheckinStatus: { type: Object, default: () => ({}) },
  weeklyCheckinProgressText: { type: String, default: '' },
  weeklyCheckinWeekDots: { type: Array, default: () => [] },
  weeklyCheckinHintText: { type: String, default: '' },
  isWeeklyCheckinLoading: { type: Boolean, default: false },
  isWeeklyCheckinSubmitting: { type: Boolean, default: false },
  forumTagOptions: { type: Array, default: () => [] },
  showPostImageSourceMenu: { type: Boolean, default: false },
  isMobileComposer: { type: Boolean, default: false },
  isHomeCatTheme: { type: Boolean, default: false },
  autoSaveDraftLabel: { type: String, default: '' },
  editMode: { type: Boolean, default: false },
  existingImages: { type: Array, default: () => [] }
});

const emit = defineEmits([
  'submit',
  'login',
  'update:newPost',
  'update:selectedPostTag',
  'update:postLocation',
  'toggle-image-source-menu',
  'request-image-picker',
  'request-camera',
  'image-selection',
  'remove-image',
  'retry-image',
  'reorder-image',
  'clear-images',
  'weekly-checkin',
  'open-draft',
  'save-draft' // ✨ 新增：保存草稿事件
]);

const postImageInputRef = ref(null);
const postCameraInputRef = ref(null);
const postContentInputRef = ref(null);
const showMobileTagMenu = ref(false);
const showMoreMenu = ref(false);
const morePanelRef = ref(null);
const morePanelPosition = ref({ top: 100, left: 16 });
const moreButtonRect = ref(null);
const draggedImageIndex = ref(null);
const dragOverImageIndex = ref(null);
const isPreviewMode = ref(false);
const mentionQuery = ref('');
const showMentionMenu = ref(false);
const mentionStartIndex = ref(-1);
const previewImage = ref(null);

const selectedTagLabel = computed(() => (
  (props.forumTagOptions.find((tag) => tag.value === props.selectedPostTag)?.label || '')
    .replace(/^#\s*/, '')
));
const hasPostContent = computed(() => Boolean(
  String(props.newPost.title || '').trim() || String(props.newPost.content || '').trim()
));

const titleCharCount = computed(() => String(props.newPost.title || '').length);
const contentCharCount = computed(() => String(props.newPost.content || '').length);
const composerCatSeed = computed(() => [
  props.selectedPostTag,
  props.isUploadingPostImage ? 'uploading' : 'idle',
  String(props.newPost.title || '').trim().length,
  String(props.newPost.content || '').trim().length,
  props.postImages.length
].join(':'));
const isComposerCatAwake = computed(() => (
  String(props.newPost.content || '').trim().length >= 80 || props.postImages.length > 0
));
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
const currentPreviewImageUrl = computed(() => String(
  previewImage.value?.detailUrl
  || previewImage.value?.originalUrl
  || previewImage.value?.url
  || ''
).trim());
const getImageStatusLabel = (image) => {
  if (image?.uploadStatusLabel) return image.uploadStatusLabel;
  if (image?.uploadStatus === 'failed') return '未通过';
  return '已检测';
};
const getImageStatusClass = (image) => {
  if (image?.uploadStatus === 'failed') return 'failed';
  if (image?.uploadStatus && image.uploadStatus !== 'approved') return 'processing';
  return 'approved';
};
const canReorderImage = (image) => !image?.uploadStatus || image.uploadStatus === 'approved';

const updateTitle = (value) => {
  emit('update:newPost', { ...props.newPost, title: value });
};

const updateContent = (value) => {
  emit('update:newPost', { ...props.newPost, content: value });
};

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
  replaceContentRange(mentionStartIndex.value, cursor, replacement, mentionStartIndex.value + replacement.length);
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
const handleWeeklyCheckin = () => emit('weekly-checkin');
const handleDraftOpen = () => emit('open-draft');

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
  if (props.isSubmitting || props.isUploadingPostImage) return;
  const total = props.postImages.length;
  const from = Number(fromIndex);
  const to = Number(toIndex);
  if (!Number.isInteger(from) || !Number.isInteger(to)) return;
  if (from < 0 || from >= total || to < 0 || to >= total || from === to) return;
  emit('reorder-image', { fromIndex: from, toIndex: to });
};

const handleImageDragStart = (index, event) => {
  if (props.isSubmitting || props.isUploadingPostImage) {
    event?.preventDefault?.();
    return;
  }
  draggedImageIndex.value = index;
  if (event?.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  }
};

const handleImageDrop = (index, event) => {
  event?.preventDefault?.();
  const fromIndex = draggedImageIndex.value ?? Number(event?.dataTransfer?.getData('text/plain'));
  draggedImageIndex.value = null;
  dragOverImageIndex.value = null;
  requestImageReorder(fromIndex, index);
};

const handleImageDragEnd = () => {
  draggedImageIndex.value = null;
  dragOverImageIndex.value = null;
};

const handleImageDragEnter = (index) => {
  if (draggedImageIndex.value === null || draggedImageIndex.value === index) return;
  dragOverImageIndex.value = index;
};

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
      'User-Agent': 'BOHLITE/2.5 (community forum; +https://github.com/bohlite)'
    }
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
        maximumAge: 60000
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
      lng: longitude
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
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=zh&zoom=13`
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
      cityName = parts.find(p => /市$/.test(p.trim()));
    }
    if (!cityName) cityName = addr.county || addr.state || addr.country || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    // Precise location (the finest granular detected)
    const preciseName = addr.county || addr.district || addr.suburb || addr.neighbourhood || cityName;

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
  if (!q) { locationSearchResults.value = []; return; }
  if (q.length < 2) { locationSearchResults.value = []; return; }
  isSearchingLocation.value = true;
  locationSearchTimer = setTimeout(async () => {
    try {
      const res = await throttledNominatimFetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&accept-language=zh&limit=5`
      );
      if (!res.ok) { locationSearchResults.value = []; return; }
      const data = await res.json();
      locationSearchResults.value = data.map(r => {
        const parts = r.display_name.split(', ').reverse();
        return {
          name: r.display_name,
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          shortName: parts.slice(-3).join(', ')
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
  const cityName = parts.find(p => /市$/.test(p.trim())) || parts[0];
  const preciseName = parts[0];
  emit('update:postLocation', {
    name: cityName?.trim() || result.name,
    cityName: cityName?.trim() || result.name,
    districtName: preciseName?.trim() || cityName?.trim() || result.name,
    precision: 'city',
    lat: result.lat,
    lng: result.lng
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

  const isNarrowScreen = window.innerWidth <= 899;

  if (isNarrowScreen) {
    // 窄屏幕：面板从底部弹出（上拉菜单效果）
    morePanelPosition.value = {
      top: Math.max(16, window.innerHeight - panelHeight - 16),
      left: 12
    };
  } else {
    // 正常屏幕：面板在按钮上方弹出，右边缘对齐按钮右边缘
    const topPosition = rect.top - panelHeight - gap;
    const leftPosition = rect.right - panelWidth;

    morePanelPosition.value = {
      top: Math.max(16, Math.min(topPosition, window.innerHeight - panelHeight - gap)),
      left: Math.max(16, Math.min(leftPosition, window.innerWidth - panelWidth - 16))
    };
  }
}

watch(showMoreMenu, async (newVal) => {
  if (newVal) {
    await nextTick();
    updateMorePanelPosition();
    // 菜单打开时监听滚动和窗口变化以重新定位
    menuPositionUpdateHandler = () => { updateMorePanelPosition(); };
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
  <section class="post-creation-section fade-in-up" :class="{ 'mobile-composer-section': isMobileComposer }">
    <div v-if="isLoggedIn" class="editor-card glass-panel">
      <div class="editor-header">
        <div class="user-avatar">
          <img v-if="userInfo.avatarUrl" :src="userInfo.avatarUrl" alt="用户头像" class="avatar-image"  loading="lazy" />
          <span v-else>{{ userInfo.username ? userInfo.username.charAt(0).toUpperCase() : 'U' }}</span>
        </div>
        <div class="user-info-text">
          <span class="user-greeting">你好，{{ userInfo.username }}！</span>
          <span class="editor-prompt">今天想和大家分享什么？</span>
        </div>
      </div>
      <HomeCatMascot v-if="isHomeCatTheme" class="composer-theme-cat"
        :class="{ 'is-awake': isComposerCatAwake }"
        :type="isUploadingPostImage ? 'uploading' : 'decor'"
        :pool="isUploadingPostImage ? '' : 'background'"
        :seed="composerCatSeed"
        size="lg" decorative />

      <div class="input-group post-title-input-group">
        <input :value="newPost.title" type="text" :placeholder="isMobileComposer ? '标题' : '起个响亮的标题...'"
          class="post-title-input"
          @input="updateTitle($event.target.value)" />
      </div>

      <div class="input-group post-body-input-group">
        <div class="composer-body-shell">
          <textarea v-if="!isPreviewMode" ref="postContentInputRef" :value="newPost.content"
            :placeholder="isMobileComposer ? '有什么新鲜事？' : '正文内容...'"
            class="post-content-input" rows="3" @input="handleContentInput"
            @keyup="updateMentionState" @click="updateMentionState" @focus="updateMentionState"></textarea>
          <div v-else class="composer-post-preview">
            <h3 v-if="newPost.title">{{ newPost.title }}</h3>
            <p v-if="String(newPost.content || '').trim()" class="composer-preview-body">{{ newPost.content }}</p>
            <p v-else class="composer-preview-empty">正文还没有内容</p>
          </div>
          <div v-if="!isPreviewMode && contentCharCount > 0" class="composer-char-count">
            {{ contentCharCount }} 字
          </div>
          <div v-if="showMentionMenu && mentionSuggestions.length" class="composer-mention-menu">
            <button v-for="username in mentionSuggestions" :key="username" type="button"
              class="composer-mention-item" @click="insertMention(username)">
              @{{ username }}
            </button>
          </div>
        </div>
      </div>

      <div class="post-tag-selector" role="radiogroup" aria-label="帖子标签">
        <button v-for="tag in forumTagOptions" :key="tag.value" type="button"
          class="post-tag-option" :class="{ active: selectedPostTag === tag.value }" @click="handleTagSelect(tag.value)">
          {{ tag.label }}
        </button>
      </div>



      <input ref="postImageInputRef" type="file" accept="image/png,image/jpeg,image/webp" multiple
        class="post-image-input" @change="handleImageChange" />
      <input ref="postCameraInputRef" type="file" accept="image/png,image/jpeg,image/webp" capture="environment"
        class="post-image-input" @change="handleImageChange" />

      <div v-if="postImages.length > 0 || isUploadingPostImage || postImageUploadStatus" class="post-image-panel">
        <div v-if="postImages.length > 0" class="post-image-preview-grid">
          <div v-for="(image, index) in postImages" :key="image.publicId || image.uploadId || image.url" class="post-image-preview-item"
            :class="{
              'is-dragging': draggedImageIndex === index,
              'is-drop-target': dragOverImageIndex === index,
              'is-failed': image.uploadStatus === 'failed',
              'is-processing': image.uploadStatus && image.uploadStatus !== 'approved' && image.uploadStatus !== 'failed'
            }"
            :draggable="canReorderImage(image)"
            @dragstart="handleImageDragStart(index, $event)"
            @dragenter.prevent="handleImageDragEnter(index)"
            @dragover.prevent
            @drop="handleImageDrop(index, $event)"
            @dragend="handleImageDragEnd">
            <button v-if="image.url" type="button" class="post-image-preview-open"
              :aria-label="`预览第 ${index + 1} 张图片大图`" @click="openImagePreview(image)">
              <img :src="image.url" :alt="`帖子图片 ${index + 1}`" loading="lazy" decoding="async" />
            </button>
            <div v-else class="post-image-failed-placeholder">
              <ImageIcon :size="24" :stroke-width="1.8" aria-hidden="true" />
              <span>{{ image.name || '图片上传失败' }}</span>
            </div>
            <span class="post-image-drag-handle" aria-hidden="true">
              <GripVertical :size="15" :stroke-width="2" />
            </span>
            <span class="post-image-status-badge" :class="getImageStatusClass(image)">
              <span v-if="getImageStatusClass(image) === 'processing'" class="post-image-card-spinner" aria-hidden="true"></span>
              {{ getImageStatusLabel(image) }}
            </span>
            <button v-if="image.uploadStatus === 'failed' && image.file" type="button" class="post-image-retry-btn"
              :disabled="isSubmitting || isUploadingPostImage" @click="emit('retry-image', image, index)">
              <RefreshCcw :size="14" :stroke-width="2.3" aria-hidden="true" />
              <span>重试</span>
            </button>
            <div v-if="canReorderImage(image)" class="post-image-sort-actions" aria-label="调整图片顺序">
              <button type="button" class="post-image-sort-btn" :disabled="isSubmitting || isUploadingPostImage || index === 0"
                :aria-label="`将第 ${index + 1} 张图片前移`"
                @click="requestImageReorder(index, index - 1)">
                <ArrowLeft :size="15" :stroke-width="2.2" aria-hidden="true" />
              </button>
              <button type="button" class="post-image-sort-btn"
                :disabled="isSubmitting || isUploadingPostImage || index === postImages.length - 1"
                :aria-label="`将第 ${index + 1} 张图片后移`"
                @click="requestImageReorder(index, index + 1)">
                <ArrowRight :size="15" :stroke-width="2.2" aria-hidden="true" />
              </button>
            </div>
            <button type="button" class="post-image-remove-btn" :disabled="isSubmitting || isUploadingPostImage"
              @click="emit('remove-image', image, index)">×</button>
          </div>

          <!-- ✨ 新增：添加更多图片方框 -->
          <button
            v-if="postImages.length < maxPostImages"
            type="button"
            class="post-image-add-more-card"
            :disabled="isUploadingPostImage || isSubmitting"
            @click="handleImagePickerRequest"
            aria-label="添加更多图片"
          >
            <Plus :size="32" :stroke-width="1.5" aria-hidden="true" />
            <span class="add-more-label">添加图片</span>
          </button>
        </div>
        <div v-if="postImageUploadStatus || isUploadingPostImage" class="post-image-upload-status">
          <div class="post-image-upload-status-row">
            <HomeCatMascot v-if="isHomeCatTheme" type="uploading" size="sm" decorative />
            <span v-if="isUploadingPostImage" class="mini-spinner"></span>
            <span>{{ postImageUploadStatus }}</span>
          </div>
          <div v-if="isUploadingPostImage" class="post-image-upload-progress-bar">
            <div class="post-image-upload-progress-fill"></div>
          </div>
        </div>
        <button v-if="postImages.length > 0" type="button" class="post-image-clear-btn"
          :disabled="isSubmitting || isUploadingPostImage" @click="emit('clear-images', { cleanup: true })">
          清空图片
        </button>
      </div>

      <div class="mobile-post-image-toolbar">
        <div class="mobile-post-tool-group" @click.stop>
          <div class="mobile-tag-tool-wrap">
            <button type="button" class="mobile-post-tool-btn mobile-tag-tool-btn"
              :class="{ active: showMobileTagMenu }" aria-label="选择帖子标签"
              :aria-expanded="showMobileTagMenu" @click="showMobileTagMenu = !showMobileTagMenu">
              <Hash :size="23" :stroke-width="2" aria-hidden="true" />
            </button>
            <div v-if="showMobileTagMenu" class="mobile-tag-menu">
              <button v-for="tag in forumTagOptions" :key="tag.value" type="button" class="mobile-tag-menu-item"
                :class="{ active: selectedPostTag === tag.value }" @click="handleTagSelect(tag.value)">
                {{ tag.label }}
              </button>
            </div>
          </div>
          <button type="button" class="mobile-post-tool-btn mobile-preview-tool-btn" :class="{ active: isPreviewMode }"
            :disabled="!hasPostContent" :aria-label="isPreviewMode ? '返回编辑' : '预览帖子'"
            @click="isPreviewMode = !isPreviewMode">
            <Eye :size="23" :stroke-width="2" aria-hidden="true" />
          </button>
          <button type="button" class="mobile-post-tool-btn" :class="{ 'is-full': postImages.length >= maxPostImages }"
            :disabled="isUploadingPostImage || isSubmitting || postImages.length >= maxPostImages"
            :aria-label="`从相册选择图片，已添加 ${postImages.length} 张，最多 ${maxPostImages} 张`"
            @click="handleImagePickerRequest">
            <ImageIcon :size="24" :stroke-width="1.8" aria-hidden="true" />
          </button>
          <div class="mobile-more-tool-wrap">
            <button type="button" class="mobile-post-tool-btn mobile-more-tool-btn"
              :class="{ active: showMoreMenu }" aria-label="更多选项"
              :aria-expanded="showMoreMenu" @click="handleMoreButtonClick">
              <MoreHorizontal :size="23" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div v-if="postLocation" class="post-location-bar">
        <MapPin :size="14" :stroke-width="2" />
        <span class="post-location-text">{{ postLocation.name }}</span>
        <button type="button" class="post-location-bar-remove" aria-label="移除位置" @click="removeLocation">×</button>
      </div>

      <div class="editor-footer">
        <div v-if="autoSaveDraftLabel" class="auto-save-hint">{{ autoSaveDraftLabel }}</div>
        <div class="editor-tools weekly-checkin-panel inline-checkin-panel">
          <div v-if="isWeeklyCheckinLoading" class="weekly-checkin-status weekly-checkin-status-skeleton"
            aria-label="正在加载周签到状态">
            <span class="checkin-skeleton-title skeleton-item"></span>
            <span class="checkin-skeleton-line skeleton-item"></span>
          </div>
          <div v-else class="weekly-checkin-status">
            <span class="tool-hint">周签到：{{ weeklyCheckinProgressText }}</span>
            <div class="checkin-week-dots" aria-hidden="true">
              <span v-for="dot in weeklyCheckinWeekDots" :key="dot.key" class="checkin-week-dot"
                :class="{ today: dot.today, signed: dot.signed }"></span>
            </div>
            <span class="checkin-hint">{{ weeklyCheckinHintText }}</span>
          </div>
          <button class="weekly-checkin-btn" :class="{ 'is-done': weeklyCheckinStatus.hasSignedThisWeek }"
            @click="handleWeeklyCheckin"
            :disabled="isWeeklyCheckinLoading || isWeeklyCheckinSubmitting || weeklyCheckinStatus.hasSignedThisWeek">
            <span v-if="isWeeklyCheckinLoading" class="checkin-skeleton-button-label skeleton-item"></span>
            <span v-else-if="isWeeklyCheckinSubmitting">签到中...</span>
            <span v-else>{{ weeklyCheckinStatus.hasSignedThisWeek ? '本周已签到' : '每周签到' }}</span>
          </button>
        </div>
        <div class="editor-submit-group">
          <div class="desktop-post-tools" @click.stop>
            <div class="desktop-tag-tool-wrap">
              <button type="button" class="desktop-post-tool-btn desktop-tag-tool-btn"
                :class="{ active: showMobileTagMenu }" aria-label="选择帖子标签"
                :aria-expanded="showMobileTagMenu" @click="showMobileTagMenu = !showMobileTagMenu">
                <Hash :size="22" :stroke-width="2" aria-hidden="true" />
                <span>{{ selectedTagLabel }}</span>
              </button>
              <div v-if="showMobileTagMenu" class="desktop-tag-menu">
                <button v-for="tag in forumTagOptions" :key="tag.value" type="button" class="desktop-tag-menu-item"
                  :class="{ active: selectedPostTag === tag.value }" @click="handleTagSelect(tag.value)">
                  {{ tag.label }}
                </button>
              </div>
            </div>
            <button type="button" class="desktop-post-tool-btn desktop-preview-tool-btn" :class="{ active: isPreviewMode }"
              :disabled="!hasPostContent" :aria-label="isPreviewMode ? '返回编辑' : '预览帖子'"
              @click="isPreviewMode = !isPreviewMode">
              <Eye :size="22" :stroke-width="2" aria-hidden="true" />
              <span>{{ isPreviewMode ? '编辑' : '预览' }}</span>
            </button>
            <button type="button" class="desktop-post-tool-btn" :class="{ 'is-full': postImages.length >= maxPostImages }"
              :disabled="isUploadingPostImage || isSubmitting || postImages.length >= maxPostImages"
              :aria-label="`从相册选择图片，已添加 ${postImages.length} 张，最多 ${maxPostImages} 张`"
              @click="handleImagePickerRequest">
              <ImageIcon :size="23" :stroke-width="1.8" aria-hidden="true" />
              <span class="desktop-image-count">{{ postImages.length }}/{{ maxPostImages }}</span>
            </button>
            <!-- ✨ 新增：横屏保存草稿按钮 -->
            <button type="button" class="desktop-post-tool-btn desktop-save-draft-btn"
              :disabled="!hasPostContent || isSubmitting || isUploadingPostImage"
              :aria-label="`保存当前编辑内容为草稿`"
              @click="emit('save-draft')">
              <FileText :size="22" :stroke-width="2" aria-hidden="true" />
              <span>保存草稿</span>
            </button>
            <div class="desktop-more-tool-wrap">
              <button type="button" class="desktop-post-tool-btn desktop-more-tool-btn"
                :class="{ active: showMoreMenu }" aria-label="更多选项"
                :aria-expanded="showMoreMenu" @click="handleMoreButtonClick">
                <MoreHorizontal :size="22" :stroke-width="2" aria-hidden="true" />
              </button>
            </div>
          </div>
          <button class="post-btn" @click="handleSubmit"
            :disabled="isSubmitting || isUploadingPostImage || postCooldownSeconds > 0">
            <span v-if="!isSubmitting">{{ postCooldownSeconds > 0 ? `${postCooldownSeconds}s 后发布` : '发布帖子' }}</span>
            <div v-else class="mini-spinner white"></div>
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
          <div class="more-panel" @click.stop ref="morePanelRef"
            :style="{
              top: morePanelPosition.top + 'px',
              left: morePanelPosition.left + 'px'
            }">
            <div class="more-panel-header">
              <span>更多选项</span>
              <button type="button" class="more-close-btn" aria-label="关闭" @click="showMoreMenu = false">
                <X :size="18" :stroke-width="2" aria-hidden="true" />
              </button>
            </div>
            <div class="more-menu-list">
              <button type="button" class="more-menu-item" @click="handleDraftOpen(); showMoreMenu = false">
                <FileText :size="18" :stroke-width="2" aria-hidden="true" />
                <span class="more-menu-label">草稿</span>
              </button>
              <button type="button" class="more-menu-item"
                @click="replaceContentRange(String(newPost.content || '').length, String(newPost.content || '').length, '@'); showMoreMenu = false">
                <AtSign :size="18" :stroke-width="2" aria-hidden="true" />
                <span class="more-menu-label">提及用户</span>
              </button>
              <button type="button" class="more-menu-item"
                :disabled="isLocating" @click="handleLocationClick(); showMoreMenu = false">
                <span v-if="isLocating" class="mini-spinner"></span>
                <MapPin v-else :size="18" :stroke-width="2" aria-hidden="true" />
                <span class="more-menu-label">{{ postLocation ? '更换位置' : '添加位置' }}</span>
              </button>
              <button v-if="isMobileComposer" type="button" class="more-menu-item" :class="{ 'is-full': postImages.length >= maxPostImages }"
                :disabled="isUploadingPostImage || isSubmitting || postImages.length >= maxPostImages"
                @click="handleCameraRequest(); showMoreMenu = false">
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
              <button type="button" class="location-panel-close-btn" aria-label="关闭" @click="closeLocationMenu">
                <X :size="18" :stroke-width="2" />
              </button>
            </div>

            <div class="location-search-wrap">
              <input ref="locationSearchInputRef" v-model="locationSearchQuery" type="text" class="location-search-input"
                placeholder="搜索城市或地点…" @input="onLocationSearchInput" />
            </div>

            <div v-if="isSearchingLocation" class="location-panel-status">搜索中…</div>

            <div v-else-if="locationSearchResults.length" class="location-search-results">
              <button v-for="result in locationSearchResults" :key="result.lat + result.lng"
                type="button" class="location-result-item" @click="selectSearchResult(result)">
                <MapPin :size="16" :stroke-width="2" />
                <span class="location-result-name">{{ result.shortName }}</span>
              </button>
            </div>

            <div v-else class="location-default-actions">
              <button type="button" class="location-action-btn" :disabled="isLocating" @click="handleAddLocation">
                <span v-if="isLocating" class="mini-spinner"></span>
                <span v-else>使用GPS定位</span>
              </button>
            </div>

            <div v-if="postLocation" class="location-current">
              <div class="location-current-info">
                <MapPin :size="16" :stroke-width="2" />
                <span>{{ postLocation.name }}</span>
              </div>
              <button type="button" class="location-remove-btn" @click="removeLocation">移除</button>
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
            <button type="button" class="composer-image-preview-close" aria-label="关闭图片预览"
              @click="closeImagePreview">
              <X :size="22" :stroke-width="2.2" aria-hidden="true" />
            </button>
            <img :src="currentPreviewImageUrl" :alt="previewImage.name || '发布前图片预览'" decoding="async"  loading="lazy" />
            <div class="composer-image-preview-meta">
              <span>帖子图片</span>
              <strong>{{ previewImage.format ? previewImage.format.toUpperCase() : 'IMAGE' }}</strong>
            </div>
          </section>
        </div>
      </transition>
    </Teleport>
  </section>
</template>

<style scoped>
@import '../styles/composer.css';
@import '../styles/replies-responsive.css';
</style>

<style scoped>
/* ✨ 新增：添加更多图片方框样式 */
.post-image-add-more-card {
  width: 100%;
  aspect-ratio: 1 / 1; /* 正方形 */
  border: 2px dashed rgba(0, 113, 227, 0.24);
  border-radius: 16px;
  background: rgba(0, 113, 227, 0.04);
  color: #0071e3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 0;
  min-height: 0;
  box-sizing: border-box;
}

.post-image-add-more-card:hover:not(:disabled) {
  border-color: #0071e3;
  background: rgba(0, 113, 227, 0.08);
}

.post-image-add-more-card:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.add-more-label {
  font-size: 13px;
  font-weight: 600;
  color: #0071e3;
  line-height: 1.2;
}

/* ✨ 新增：横屏保存草稿按钮样式 */
.desktop-save-draft-btn {
  border-radius: 14px;
  padding: 10px 16px;
  background: rgba(0, 113, 227, 0.06);
  border: 1px solid rgba(0, 113, 227, 0.18);
  color: #0071e3;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
}

.desktop-save-draft-btn:hover:not(:disabled) {
  background: rgba(0, 113, 227, 0.12);
  border-color: rgba(0, 113, 227, 0.32);
}

.desktop-save-draft-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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
  padding: 24px;
  border-radius: 32px;
  border: 1px solid var(--glass-border, rgba(0, 0, 0, 0.05));
  background: var(--glass-bg, rgba(255, 255, 255, 0.75));
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.06);
  isolation: isolate;
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

@media (max-width: 899px) {
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
  padding: 12px 16px;
  border-radius: 32px;
  border: 1px solid var(--glass-border, rgba(0, 0, 0, 0.05));
  background: var(--glass-bg, rgba(255, 255, 255, 0.75));
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.06);
  width: 280px;
  overflow: hidden;
  contain: paint;
  isolation: isolate;
}

/* 移动端面板更宽 */
@media (max-width: 899px) {
  .more-panel {
    width: calc(100vw - 24px);
    padding: 16px;
    border-radius: 20px;
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
  transition: background-color 0.2s, color 0.2s;
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
  transition: background-color 0.2s, transform 0.2s;
}

.more-menu-item:hover {
  background: rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
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
  transition: opacity 0.2s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
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
