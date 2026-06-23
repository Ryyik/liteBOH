<script setup>
import { computed, nextTick, ref } from 'vue';
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Camera,
  Eye,
  GripVertical,
  Hash,
  Image as ImageIcon,
  MapPin,
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
  weeklyCheckinProgressPercent: { type: Number, default: 0 },
  weeklyCheckinHintText: { type: String, default: '' },
  isWeeklyCheckinLoading: { type: Boolean, default: false },
  isWeeklyCheckinSubmitting: { type: Boolean, default: false },
  forumTagOptions: { type: Array, default: () => [] },
  showPostImageSourceMenu: { type: Boolean, default: false },
  isMobileComposer: { type: Boolean, default: false },
  isHomeCatTheme: { type: Boolean, default: false }
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
  'open-draft'
]);

const postImageInputRef = ref(null);
const postCameraInputRef = ref(null);
const postContentInputRef = ref(null);
const showMobileTagMenu = ref(false);
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
const showPrecisionMenu = ref(false);
const locationSearchQuery = ref('');
const locationSearchResults = ref([]);
const isSearchingLocation = ref(false);
const showLocationSearch = ref(false);
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
  showPrecisionMenu.value = !showPrecisionMenu.value;
  if (showPrecisionMenu.value) {
    showLocationSearch.value = false;
    locationSearchQuery.value = '';
    locationSearchResults.value = [];
  }
}

function switchPrecision(precision) {
  if (!props.postLocation) return;
  const newName = precision === 'city' ? props.postLocation.cityName : props.postLocation.districtName;
  emit('update:postLocation', {
    ...props.postLocation,
    name: newName,
    precision
  });
  showPrecisionMenu.value = false;
}

function removeLocation() {
  emit('update:postLocation', null);
  locationError.value = '';
  showPrecisionMenu.value = false;
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
  showLocationSearch.value = false;
  showPrecisionMenu.value = false;
}

function cancelLocationSearch() {
  showLocationSearch.value = false;
  locationSearchQuery.value = '';
  locationSearchResults.value = [];
}

function closeLocationMenu() {
  showPrecisionMenu.value = false;
  cancelLocationSearch();
}
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
          <div v-for="(image, index) in postImages" :key="image.publicId || image.url" class="post-image-preview-item"
            :class="{
              'is-dragging': draggedImageIndex === index,
              'is-drop-target': dragOverImageIndex === index,
              'is-failed': image.uploadStatus === 'failed'
            }"
            :draggable="image.uploadStatus !== 'failed'"
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
            <span class="post-image-status-badge" :class="image.uploadStatus === 'failed' ? 'failed' : 'approved'">
              {{ image.uploadStatus === 'failed' ? '未通过' : '已检测' }}
            </span>
            <button v-if="image.uploadStatus === 'failed' && image.file" type="button" class="post-image-retry-btn"
              :disabled="isSubmitting || isUploadingPostImage" @click="emit('retry-image', image, index)">
              <RefreshCcw :size="14" :stroke-width="2.3" aria-hidden="true" />
              <span>重试</span>
            </button>
            <div v-if="image.uploadStatus !== 'failed'" class="post-image-sort-actions" aria-label="调整图片顺序">
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
            <button type="button" class="post-image-remove-btn" :disabled="isSubmitting"
              @click="emit('remove-image', image, index)">×</button>
          </div>
        </div>
        <div v-if="postImageUploadStatus || isUploadingPostImage" class="post-image-upload-status">
          <HomeCatMascot v-if="isHomeCatTheme" type="uploading" size="sm" decorative />
          <span v-if="isUploadingPostImage" class="mini-spinner"></span>
          <span>{{ postImageUploadStatus }}</span>
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
          <button type="button" class="mobile-post-tool-btn mobile-mention-tool-btn"
            aria-label="@用户" @click="replaceContentRange(String(newPost.content || '').length, String(newPost.content || '').length, '@')">
            <AtSign :size="23" :stroke-width="2" aria-hidden="true" />
          </button>
          <button type="button" class="mobile-post-tool-btn mobile-preview-tool-btn" :class="{ active: isPreviewMode }"
            :disabled="!hasPostContent" :aria-label="isPreviewMode ? '返回编辑' : '预览帖子'"
            @click="isPreviewMode = !isPreviewMode">
            <Eye :size="23" :stroke-width="2" aria-hidden="true" />
          </button>
          <div class="mobile-location-tool-wrap">
            <button type="button" class="mobile-post-tool-btn mobile-location-tool-btn"
              :class="{ active: showPrecisionMenu, 'has-location': !!postLocation }"
              :disabled="isLocating" aria-label="添加位置"
              @click="handleLocationClick">
              <span v-if="isLocating" class="mini-spinner"></span>
              <MapPin v-else :size="23" :stroke-width="2" />
            </button>
            <div v-if="showPrecisionMenu" class="mobile-location-menu">
              <template v-if="postLocation && !showLocationSearch">
                <button type="button" class="mobile-location-menu-item"
                  :class="{ active: postLocation.precision === 'city' }" @click="switchPrecision('city')">
                  城市：{{ postLocation.cityName }}
                </button>
                <button type="button" class="mobile-location-menu-item"
                  :class="{ active: postLocation.precision === 'district' }" @click="switchPrecision('district')">
                  精确：{{ postLocation.districtName }}
                </button>
                <div class="mobile-location-menu-divider"></div>
              </template>

              <template v-if="!showLocationSearch">
                <button v-if="!postLocation" type="button" class="mobile-location-menu-item" @click="handleAddLocation">
                  使用当前位置
                </button>
                <button type="button" class="mobile-location-menu-item" @click="showLocationSearch = true">
                  搜索地点
                </button>
                <div class="mobile-location-menu-divider"></div>
                <button v-if="postLocation" type="button" class="mobile-location-menu-item mobile-location-menu-remove"
                  @click="removeLocation">
                  移除位置
                </button>
                <button v-else type="button" class="mobile-location-menu-item" @click="closeLocationMenu">
                  取消
                </button>
              </template>

              <template v-else>
                <div class="mobile-location-search-input-wrap">
                  <input v-model="locationSearchQuery" type="text"
                    class="mobile-location-search-input" placeholder="搜索地点..."
                    @input="onLocationSearchInput" />
                </div>
                <div v-if="isSearchingLocation" class="mobile-location-search-status">搜索中...</div>
                <template v-if="locationSearchResults.length">
                  <button v-for="r in locationSearchResults" :key="r.lat + ',' + r.lng" type="button"
                    class="mobile-location-menu-item mobile-location-search-result-item" @click="selectSearchResult(r)">
                    {{ r.shortName }}
                  </button>
                  <div class="mobile-location-menu-divider"></div>
                </template>
                <button type="button" class="mobile-location-menu-item" @click="cancelLocationSearch">
                  取消搜索
                </button>
              </template>
            </div>
            <span v-if="locationError" class="post-location-error">{{ locationError }}</span>
          </div>
          <button type="button" class="mobile-post-tool-btn" :class="{ 'is-full': postImages.length >= maxPostImages }"
            :disabled="isUploadingPostImage || isSubmitting || postImages.length >= maxPostImages"
            :aria-label="`从相册选择图片，已添加 ${postImages.length} 张，最多 ${maxPostImages} 张`"
            @click="handleImagePickerRequest">
            <ImageIcon :size="24" :stroke-width="1.8" aria-hidden="true" />
          </button>
          <button type="button" class="mobile-post-tool-btn" :class="{ 'is-full': postImages.length >= maxPostImages }"
            :disabled="isUploadingPostImage || isSubmitting || postImages.length >= maxPostImages"
            :aria-label="`拍照添加图片，已添加 ${postImages.length} 张，最多 ${maxPostImages} 张`"
            @click="handleCameraRequest">
            <Camera :size="24" :stroke-width="1.8" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div class="editor-footer">
        <div class="editor-tools weekly-checkin-panel inline-checkin-panel">
          <div v-if="isWeeklyCheckinLoading" class="weekly-checkin-status weekly-checkin-status-skeleton"
            aria-label="正在加载周签到状态">
            <span class="checkin-skeleton-title skeleton-item"></span>
            <span class="checkin-skeleton-line skeleton-item"></span>
          </div>
          <div v-else class="weekly-checkin-status">
            <span class="tool-hint">周签到：{{ weeklyCheckinProgressText }}</span>
            <div class="checkin-progress-track" :class="{ signed: weeklyCheckinStatus.hasSignedThisWeek }"
              aria-hidden="true">
              <div class="checkin-progress-fill" :style="{ width: `${weeklyCheckinProgressPercent}%` }"></div>
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
            <button type="button" class="desktop-post-tool-btn desktop-draft-tool-btn" @click="handleDraftOpen">
              草稿
            </button>
            <button type="button" class="desktop-post-tool-btn desktop-mention-tool-btn"
              aria-label="@用户" @click="replaceContentRange(String(newPost.content || '').length, String(newPost.content || '').length, '@')">
              <AtSign :size="22" :stroke-width="2" aria-hidden="true" />
            </button>
            <button type="button" class="desktop-post-tool-btn desktop-preview-tool-btn" :class="{ active: isPreviewMode }"
              :disabled="!hasPostContent" :aria-label="isPreviewMode ? '返回编辑' : '预览帖子'"
              @click="isPreviewMode = !isPreviewMode">
              <Eye :size="22" :stroke-width="2" aria-hidden="true" />
              <span>{{ isPreviewMode ? '编辑' : '预览' }}</span>
            </button>
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
            <div class="desktop-location-tool-wrap">
              <button type="button" class="desktop-post-tool-btn desktop-location-tool-btn"
                :class="{ active: showPrecisionMenu }"
                :disabled="isLocating" aria-label="添加位置"
                @click="handleLocationClick">
                <span v-if="isLocating" class="mini-spinner"></span>
                <MapPin v-else :size="22" :stroke-width="2" />
                <span v-if="postLocation">{{ postLocation.name }}</span>
              </button>
              <div v-if="showPrecisionMenu" class="desktop-location-menu">
                <template v-if="postLocation && !showLocationSearch">
                  <button type="button" class="desktop-location-menu-item"
                    :class="{ active: postLocation.precision === 'city' }" @click="switchPrecision('city')">
                    城市：{{ postLocation.cityName }}
                  </button>
                  <button type="button" class="desktop-location-menu-item"
                    :class="{ active: postLocation.precision === 'district' }" @click="switchPrecision('district')">
                    精确：{{ postLocation.districtName }}
                  </button>
                  <div class="desktop-location-menu-divider"></div>
                </template>

                <template v-if="!showLocationSearch">
                  <button v-if="!postLocation" type="button" class="desktop-location-menu-item" @click="handleAddLocation">
                    使用当前位置
                  </button>
                  <button type="button" class="desktop-location-menu-item" @click="showLocationSearch = true">
                    搜索地点
                  </button>
                  <div class="desktop-location-menu-divider"></div>
                  <button v-if="postLocation" type="button" class="desktop-location-menu-item desktop-location-menu-remove"
                    @click="removeLocation">
                    移除位置
                  </button>
                  <button v-else type="button" class="desktop-location-menu-item" @click="closeLocationMenu">
                    取消
                  </button>
                </template>

                <template v-else>
                  <div class="desktop-location-search-input-wrap">
                    <input v-model="locationSearchQuery" type="text"
                      class="desktop-location-search-input" placeholder="搜索地点..."
                      @input="onLocationSearchInput" />
                  </div>
                  <div v-if="isSearchingLocation" class="desktop-location-search-status">搜索中...</div>
                  <template v-if="locationSearchResults.length">
                    <button v-for="r in locationSearchResults" :key="r.lat + ',' + r.lng" type="button"
                      class="desktop-location-menu-item desktop-location-search-result-item" @click="selectSearchResult(r)">
                      {{ r.shortName }}
                    </button>
                    <div class="desktop-location-menu-divider"></div>
                  </template>
                  <button type="button" class="desktop-location-menu-item" @click="cancelLocationSearch">
                    取消搜索
                  </button>
                </template>
              </div>
              <span v-if="locationError" class="post-location-error">{{ locationError }}</span>
            </div>
            <button type="button" class="desktop-post-tool-btn" :class="{ 'is-full': postImages.length >= maxPostImages }"
              :disabled="isUploadingPostImage || isSubmitting || postImages.length >= maxPostImages"
              :aria-label="`从相册选择图片，已添加 ${postImages.length} 张，最多 ${maxPostImages} 张`"
              @click="handleImagePickerRequest">
              <ImageIcon :size="23" :stroke-width="1.8" aria-hidden="true" />
              <span class="desktop-image-count">{{ postImages.length }}/{{ maxPostImages }}</span>
            </button>
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
.post-location-error {
  font-size: 11px;
  color: #ef4444;
  display: block;
  margin-top: 2px;
}

.mobile-location-tool-wrap {
  position: relative;
  display: inline-flex;
}

.desktop-location-tool-wrap {
  position: relative;
  display: inline-flex;
}

/* ---- Mobile location menu (matches mobile-tag-menu style) ---- */

.mobile-location-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 12px);
  z-index: 30;
  width: 188px;
  padding: 8px;
  border-radius: 18px;
  border: 1px solid #d8d8dc;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 44px rgba(15, 20, 25, 0.14);
  display: grid;
  gap: 6px;
}

.mobile-location-menu-item {
  min-height: 42px;
  border: none;
  border-radius: 13px;
  background: transparent;
  color: #0f1419;
  font-size: 15px;
  font-weight: 800;
  text-align: left;
  padding: 0 12px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.mobile-location-menu-item:hover {
  background: rgba(15, 20, 25, 0.06);
}

.mobile-location-menu-item.active {
  background: #0f1419;
  color: #ffffff;
}

.mobile-location-menu-divider {
  height: 1px;
  background: #d8d8dc;
  margin: 6px 0;
}

.mobile-location-menu-remove {
  color: #ef4444;
}

.mobile-location-menu-remove:hover {
  background: #fef2f2;
}

.mobile-location-tool-btn.has-location {
  background: rgba(15, 20, 25, 0.06);
}

.mobile-location-tool-btn.active {
  background: rgba(15, 20, 25, 0.08);
}

.mobile-location-search-input-wrap {
  padding: 4px 4px 0;
}

.mobile-location-search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid #d8d8dc;
  border-radius: 10px;
  font-size: 14px;
  outline: none;
  background: #f5f5f7;
  color: #0f1419;
}

.mobile-location-search-input:focus {
  border-color: #0f1419;
  background: #fff;
}

.mobile-location-search-status {
  padding: 8px 12px;
  font-size: 13px;
  color: #6e6e73;
}

/* ---- Desktop location menu (matches desktop-tag-menu style) ---- */

.desktop-location-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 10px);
  z-index: 30;
  width: 176px;
  padding: 8px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.14);
  backdrop-filter: blur(16px);
  display: grid;
  gap: 4px;
}

.desktop-location-menu-item {
  width: 100%;
  min-height: 38px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: #1d1d1f;
  cursor: pointer;
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
  text-align: left;
  padding: 0 11px;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.desktop-location-menu-item:hover {
  background: #f5f5f7;
}

.desktop-location-menu-item.active {
  background: #1d1d1f;
  color: #ffffff;
}

.desktop-location-menu-divider {
  height: 1px;
  background: rgba(0, 0, 0, 0.06);
  margin: 4px 0;
}

.desktop-location-menu-remove {
  color: #ef4444;
}

.desktop-location-menu-remove:hover {
  background: #fef2f2;
}

.desktop-location-tool-btn.active {
  background: #1d1d1f;
  color: #ffffff;
}

.desktop-location-search-input-wrap {
  padding: 4px 4px 0;
}

.desktop-location-search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid #d8d8dc;
  border-radius: 10px;
  font-size: 13px;
  outline: none;
  background: #f5f5f7;
  color: #1d1d1f;
}

.desktop-location-search-input:focus {
  border-color: #1d1d1f;
  background: #fff;
}

.desktop-location-search-status {
  padding: 8px 12px;
  font-size: 12px;
  color: #6e6e73;
}
</style>
