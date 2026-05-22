<script setup>
import { computed, ref } from 'vue';
import { Camera, Hash, Image as ImageIcon } from 'lucide-vue-next';

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
  'clear-images',
  'weekly-checkin',
  'open-draft'
]);

const postImageInputRef = ref(null);
const postCameraInputRef = ref(null);
const showMobileTagMenu = ref(false);

const selectedTagLabel = computed(() => (
  (props.forumTagOptions.find((tag) => tag.value === props.selectedPostTag)?.label || '')
    .replace(/^#\s*/, '')
));

const updateTitle = (value) => {
  emit('update:newPost', { ...props.newPost, title: value });
};

const updateContent = (value) => {
  emit('update:newPost', { ...props.newPost, content: value });
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
        <textarea :value="newPost.content" :placeholder="isMobileComposer ? '有什么新鲜事？' : '正文内容...'"
          class="post-content-input" rows="3" @input="updateContent($event.target.value)"></textarea>
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
          <div v-for="(image, index) in postImages" :key="image.publicId || image.url" class="post-image-preview-item">
            <img :src="image.url" :alt="`帖子图片 ${index + 1}`" loading="lazy" decoding="async" />
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
          <button type="button" class="mobile-post-tool-btn" :class="{ 'is-full': postImages.length >= 3 }"
            :disabled="isUploadingPostImage || isSubmitting || postImages.length >= 3"
            :aria-label="`从相册选择图片，已添加 ${postImages.length} 张，最多 3 张`"
            @click="handleImagePickerRequest">
            <ImageIcon :size="24" :stroke-width="1.8" aria-hidden="true" />
          </button>
          <button type="button" class="mobile-post-tool-btn" :class="{ 'is-full': postImages.length >= 3 }"
            :disabled="isUploadingPostImage || isSubmitting || postImages.length >= 3"
            :aria-label="`拍照添加图片，已添加 ${postImages.length} 张，最多 3 张`"
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
            <button type="button" class="desktop-post-tool-btn" :class="{ 'is-full': postImages.length >= 3 }"
              :disabled="isUploadingPostImage || isSubmitting || postImages.length >= 3"
              :aria-label="`从相册选择图片，已添加 ${postImages.length} 张，最多 3 张`"
              @click="handleImagePickerRequest">
              <ImageIcon :size="23" :stroke-width="1.8" aria-hidden="true" />
              <span class="desktop-image-count">{{ postImages.length }}/3</span>
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
  </section>
</template>

<style scoped src="../style.scoped.css"></style>
