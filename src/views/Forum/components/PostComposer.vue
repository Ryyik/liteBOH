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
  RefreshCcw,
  X
} from 'lucide-vue-next';

const props = defineProps({
  isLoggedIn: { type: Boolean, default: false },
  userInfo: { type: Object, default: () => ({}) },
  newPost: { type: Object, default: () => ({ title: '', content: '' }) },
  selectedPostTag: { type: String, default: 'daily' },
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
  isMobileComposer: { type: Boolean, default: false }
});

const emit = defineEmits([
  'submit',
  'login',
  'update:newPost',
  'update:selectedPostTag',
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
</script>

<template>
  <section class="post-creation-section fade-in-up" :class="{ 'mobile-composer-section': isMobileComposer }">
    <div v-if="isLoggedIn" class="editor-card glass-panel">
      <div class="editor-header">
        <div class="user-avatar">
          <img v-if="userInfo.avatarUrl" :src="userInfo.avatarUrl" alt="用户头像" class="avatar-image" />
          <span v-else>{{ userInfo.username ? userInfo.username.charAt(0).toUpperCase() : 'U' }}</span>
        </div>
        <div class="user-info-text">
          <span class="user-greeting">你好，{{ userInfo.username }}！</span>
          <span class="editor-prompt">今天想和大家分享什么？</span>
        </div>
      </div>

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
              <span>{{ selectedTagLabel }}</span>
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
            <img :src="currentPreviewImageUrl" :alt="previewImage.name || '发布前图片预览'" decoding="async" />
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

<style scoped src="../style.scoped.css"></style>
