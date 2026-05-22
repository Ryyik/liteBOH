<template>
  <section class="creator-shows-section">
    <div class="creator-shows-container">
      <header class="creator-shows-header">
        <div class="creator-shows-header-text">
          <span class="creator-shows-label">CREATOR HUB</span>
          <h2 class="creator-shows-title">创作者节目投稿</h2>
          <p class="creator-shows-subtitle">认证创作者可直接发布节目，并附带社交平台视频链接。</p>
          <p v-if="canPublishShow" class="creator-shows-bound-tip">
            已绑定平台：{{ boundPlatformSummary || '暂无可发布平台，请先去资料页绑定。' }}
          </p>
        </div>

        <div class="creator-shows-actions">
          <button v-if="canPublishShow" type="button" class="creator-btn creator-btn-primary" @click="openPublishModal">
            发布节目
          </button>
          <router-link v-else-if="!isLoggedIn" to="/login" class="creator-btn creator-btn-secondary">
            登录后发布
          </router-link>
          <router-link v-else :to="profileRoute" class="creator-btn creator-btn-secondary">
            去资料页认证
          </router-link>
        </div>
      </header>

      <div v-if="loading" class="creator-shows-empty">
        正在加载创作者节目...
      </div>
      <div v-else-if="loadErrorMessage" class="creator-shows-empty">
        {{ loadErrorMessage }}
      </div>
      <div v-else-if="creatorShows.length === 0" class="creator-shows-empty">
        暂无创作者投稿节目，快来发布第一条吧。
      </div>
      <div v-else class="creator-shows-grid">
        <article v-for="show in creatorShows" :key="show.id" class="creator-show-card">
          <div class="creator-show-top">
            <span class="creator-show-platform">{{ show.videoPlatformLabel }}</span>
            <div class="creator-show-meta-actions">
              <span class="creator-show-time">{{ formatShowDate(show.createdAt) }}</span>
              <button
                v-if="isOwnShow(show)"
                type="button"
                class="creator-show-delete-btn"
                :disabled="deletingShowId === show.id"
                @click="handleDeleteShow(show)"
              >
                {{ deletingShowId === show.id ? '删除中...' : '删除' }}
              </button>
            </div>
          </div>
          <h3 class="creator-show-title">{{ show.title }}</h3>
          <p class="creator-show-description">{{ show.description }}</p>
          <div class="creator-show-footer">
            <span class="creator-show-author">@{{ show.authorUsername }}</span>
            <a :href="show.videoUrl" target="_blank" rel="noopener noreferrer" class="creator-show-link">
              观看视频
            </a>
          </div>
        </article>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showPublishModal" class="creator-modal-overlay" @click.self="closePublishModal">
          <div class="creator-modal-card">
            <header class="creator-modal-header">
              <h3>发布创作者节目</h3>
              <button type="button" class="creator-modal-close" @click="closePublishModal">×</button>
            </header>

            <div class="creator-modal-body custom-scrollbar">
              <label class="creator-form-field">
                <span>节目标题</span>
                <input
                  v-model.trim="publishForm.title"
                  type="text"
                  maxlength="80"
                  placeholder="示例：方块街 商业街更新实录"
                >
              </label>

              <label class="creator-form-field">
                <span>节目简介</span>
                <textarea
                  v-model.trim="publishForm.description"
                  rows="4"
                  maxlength="320"
                  placeholder="简要描述本期节目亮点和内容。"
                ></textarea>
              </label>

              <label class="creator-form-field">
                <span>发布平台</span>
                <select v-model="publishForm.creatorPlatform">
                  <option v-for="platform in publishablePlatforms" :key="platform.key" :value="platform.key">
                    {{ platform.label }}
                  </option>
                </select>
              </label>

              <label class="creator-form-field">
                <span>视频链接</span>
                <input
                  v-model.trim="publishForm.videoUrl"
                  type="url"
                  maxlength="500"
                  placeholder="请粘贴完整视频链接"
                >
              </label>

              <p v-if="selectedPlatformBinding" class="creator-binding-tip">
                当前平台绑定账号 ID：{{ selectedPlatformBinding }}
              </p>
              <p v-else class="creator-binding-tip warning">
                你尚未绑定该平台账号，请先到资料页完成绑定。
              </p>
            </div>

            <footer class="creator-modal-footer">
              <button type="button" class="creator-btn creator-btn-secondary" @click="closePublishModal">
                取消
              </button>
              <button
                type="button"
                class="creator-btn creator-btn-primary"
                :disabled="submitting"
                @click="handlePublishShow"
              >
                {{ submitting ? '发布中...' : '确认发布' }}
              </button>
            </footer>
          </div>
        </div>
      </Transition>
    </Teleport>

    <CommonAlertModal
      v-model:visible="alertState.visible"
      :type="alertState.type"
      :title="alertState.title"
      :message="alertState.message"
    />
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import CommonAlertModal from '@/components/CommonAlertModal.vue';
import {
  CREATOR_SHOW_PLATFORMS,
  createCreatorShow,
  deleteCreatorShow,
  getCreatorShows
} from '@/utils/api/shows-api.js';

const authStore = useAuthStore();
const { isLoggedIn, userInfo } = storeToRefs(authStore);

const loading = ref(false);
const submitting = ref(false);
const creatorShows = ref([]);
const showPublishModal = ref(false);
const loadErrorMessage = ref('');
const deletingShowId = ref('');

const publishForm = reactive({
  title: '',
  description: '',
  creatorPlatform: 'bilibili',
  videoUrl: ''
});

const alertState = reactive({
  visible: false,
  type: 'success',
  title: '',
  message: ''
});

const platformMap = CREATOR_SHOW_PLATFORMS.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {});

const normalizeCreatorPlatformIds = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const normalized = {};
  for (const item of CREATOR_SHOW_PLATFORMS) {
    const value = raw[item.key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    normalized[item.key] = trimmed.slice(0, 64);
  }
  return normalized;
};

const boundCreatorIds = computed(() => normalizeCreatorPlatformIds(userInfo.value?.creatorPlatformIds));
const currentUserId = computed(() => String(userInfo.value?.id || '').trim());

const canPublishShow = computed(() => {
  return Boolean(isLoggedIn.value && userInfo.value?.isBohCreator);
});

const publishablePlatforms = computed(() => {
  const ids = boundCreatorIds.value;
  return CREATOR_SHOW_PLATFORMS.filter((platform) => Boolean(ids[platform.key]));
});

const selectedPlatformBinding = computed(() => {
  return boundCreatorIds.value[publishForm.creatorPlatform] || '';
});

const profileRoute = computed(() => {
  const username = String(userInfo.value?.username || '').trim();
  return username ? `/profile/${encodeURIComponent(username)}` : '/user-space';
});

const boundPlatformSummary = computed(() => {
  const ids = boundCreatorIds.value;
  return Object.keys(ids)
    .map((key) => `${platformMap[key]?.label || key}(${ids[key]})`)
    .join(' / ');
});

const showAlert = (type, title, message) => {
  alertState.type = type;
  alertState.title = title;
  alertState.message = message;
  alertState.visible = true;
};

const isOwnShow = (show) => {
  const authorId = String(show?.authorId || '').trim();
  return Boolean(authorId && currentUserId.value && authorId === currentUserId.value);
};

const formatShowDate = (dateValue) => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const resetPublishForm = () => {
  publishForm.title = '';
  publishForm.description = '';
  publishForm.videoUrl = '';

  const firstPlatform = publishablePlatforms.value[0]?.key;
  publishForm.creatorPlatform = firstPlatform || 'bilibili';
};

const openPublishModal = () => {
  if (!isLoggedIn.value) {
    showAlert('info', '请先登录', '登录后才能发布节目');
    return;
  }

  if (!canPublishShow.value) {
    showAlert('info', '需要创作者认证', '请先在个人资料中完成 BOH 创作者认证');
    return;
  }

  if (publishablePlatforms.value.length === 0) {
    showAlert('warning', '暂不可发布', '请先在资料页绑定至少一个创作平台账号 ID');
    return;
  }

  resetPublishForm();
  showPublishModal.value = true;
};

const closePublishModal = () => {
  showPublishModal.value = false;
};

const loadCreatorShows = async () => {
  loading.value = true;
  loadErrorMessage.value = '';
  try {
    const { ok, data, error } = await getCreatorShows({ limit: 18 });
    if (!ok || error) {
      creatorShows.value = [];
      loadErrorMessage.value = error?.message || '节目列表暂时不可用，请稍后刷新重试。';
      return;
    }
    creatorShows.value = Array.isArray(data) ? data : [];
  } catch (error) {
    creatorShows.value = [];
    loadErrorMessage.value = error?.message || '节目列表暂时不可用，请稍后刷新重试。';
  } finally {
    loading.value = false;
  }
};

const handlePublishShow = async () => {
  if (!canPublishShow.value) {
    showAlert('error', '发布失败', '当前账号未完成创作者认证');
    return;
  }
  if (!selectedPlatformBinding.value) {
    showAlert('error', '发布失败', '请选择已绑定账号的平台后再发布');
    return;
  }

  submitting.value = true;
  try {
    const result = await createCreatorShow(
      {
        title: publishForm.title,
        description: publishForm.description,
        creatorPlatform: publishForm.creatorPlatform,
        videoUrl: publishForm.videoUrl
      },
      {
        userId: userInfo.value?.id,
        username: userInfo.value?.username
      }
    );

    if (!result.ok) {
      showAlert('error', '发布失败', result.error?.message || '请稍后重试');
      return;
    }

    const inserted = result.data;
    if (inserted?.id) {
      creatorShows.value = [inserted, ...creatorShows.value.filter((item) => item.id !== inserted.id)].slice(0, 30);
    }

    showAlert('success', '发布成功', '节目已发布到节目页');
    closePublishModal();
  } catch (error) {
    showAlert('error', '发布失败', error?.message || '请稍后重试');
  } finally {
    submitting.value = false;
  }
};

const handleDeleteShow = async (show) => {
  const showId = String(show?.id || '').trim();
  if (!showId) return;

  if (!isOwnShow(show)) {
    showAlert('error', '无权限删除', '只能删除你自己发布的节目');
    return;
  }

  const title = String(show?.title || '').trim() || '未命名节目';
  const confirmed = window.confirm(`确认删除节目「${title}」吗？删除后不可恢复。`);
  if (!confirmed) return;

  deletingShowId.value = showId;
  try {
    const result = await deleteCreatorShow(showId, { userId: currentUserId.value });
    if (!result.ok) {
      showAlert('error', '删除失败', result.error?.message || '请稍后重试');
      return;
    }

    creatorShows.value = creatorShows.value.filter((item) => item.id !== showId);
    showAlert('success', '删除成功', '节目已从页面移除');
  } catch (error) {
    showAlert('error', '删除失败', error?.message || '请稍后重试');
  } finally {
    if (deletingShowId.value === showId) {
      deletingShowId.value = '';
    }
  }
};

onMounted(() => {
  void loadCreatorShows();
});
</script>

<style scoped src="./style.scoped.css"></style>
