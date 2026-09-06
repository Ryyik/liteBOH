<template>
  <div class="shared-memory-page" :style="{ '--user-center-nav-offset': isFromUserSpace ? '0px' : '72px', paddingTop: isFromUserSpace ? '0px' : '72px' }">

    <div class="shared-memory-shell">
      <UserCenterPageHeader v-if="isFromUserSpace" title="公共记忆管理" max-width="1200px" @back="goBack" />

      <div class="page-description">
        <p>这里可以手动归档或删除你沉淀的 AI 公共记忆</p>
      </div>

      <div v-if="notice.visible" class="notice" :class="`type-${notice.type}`">
        {{ notice.text }}
      </div>

      <div v-if="!isLoggedIn" class="login-card">
        <LockKeyhole class="state-icon" :size="32" :stroke-width="1.7" aria-hidden="true" />
        <h3>登录后可管理公共记忆</h3>
        <p>登录后可查看、归档、删除你写入 AI 公共记忆库的内容。</p>
        <button class="primary-btn" @click="showLoginModal = true">立即登录</button>
      </div>

      <template v-else>
        <div class="toolbar">
          <div class="filter-group">
            <button
              v-for="item in statusOptions"
              :key="item.value"
              class="filter-chip"
              :class="{ active: filterStatus === item.value }"
              @click="changeFilter(item.value)"
            >
              {{ item.label }}
            </button>
          </div>
          <button class="ghost-btn" :disabled="state.isLoading" @click="refreshList">刷新</button>
        </div>

        <div v-if="state.isLoading && sharedMemories.length === 0" class="loading-state">
          <div class="loading-spinner"></div>
          <p>正在加载公共记忆...</p>
        </div>

        <div v-else-if="sharedMemories.length === 0" class="empty-state">
          <Archive class="state-icon" :size="32" :stroke-width="1.7" aria-hidden="true" />
          <h3>暂无公共记忆</h3>
          <p>你可以先去 BOH AI 开启“公共记忆”，再回来管理。</p>
          <button class="ghost-btn" @click="router.push('/ai-chat')">前往 BOH AI</button>
        </div>

        <div v-else class="memory-list">
          <article v-for="item in sharedMemories" :key="item.id" class="memory-card">
            <header class="memory-meta">
              <div class="meta-left">
                <span class="meta-status" :class="item.status">{{ item.status === 'archived' ? '已归档' : '生效中' }}</span>
                <span class="meta-source">{{ item.source === 'manual' ? '手动' : '自动沉淀' }}</span>
                <span class="meta-confidence">置信度 {{ formatConfidence(item.confidence) }}</span>
              </div>
              <span class="meta-time">{{ formatDateTime(item.updatedAt || item.createdAt) }}</span>
            </header>

            <p class="memory-content">{{ item.content }}</p>

            <div v-if="item.mood || (item.tags && item.tags.length)" class="memory-tags">
              <span v-if="item.mood" class="tag mood-tag">{{ item.mood }}</span>
              <span v-for="(tag, tagIndex) in (item.tags || [])" :key="`${item.id}-${tagIndex}`" class="tag">{{ tag }}</span>
            </div>

            <p v-if="Array.isArray(item.evidence) && item.evidence.length > 0" class="evidence-hint">
              证据片段 {{ item.evidence.length }} 条
            </p>

            <div class="memory-actions">
              <button
                class="ghost-btn"
                :disabled="isActionRunning(item.id)"
                @click="editMemory(item)"
              >
                编辑
              </button>
              <button
                v-if="item.status === 'active'"
                class="ghost-btn"
                :disabled="isActionRunning(item.id)"
                @click="archiveMemory(item)"
              >
                归档
              </button>
              <button
                v-else
                class="ghost-btn"
                :disabled="isActionRunning(item.id)"
                @click="restoreMemory(item)"
              >
                取消归档
              </button>
              <button
                class="danger-btn"
                :disabled="isActionRunning(item.id)"
                @click="removeMemory(item)"
              >
                删除
              </button>
            </div>
          </article>

          <div v-if="hasMore" class="load-more">
            <button class="ghost-btn" :disabled="state.isLoading" @click="loadMore">
              {{ state.isLoading ? '加载中...' : '加载更多' }}
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { Archive, LockKeyhole } from 'lucide-vue-next';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import { useAuthStore } from '@/stores/auth';
import {
  getMySharedAIMemories,
  updateSharedAIMemory,
  updateSharedAIMemoryStatus,
  deleteSharedAIMemory
} from '@/utils/api/treehole-api.js';
import { resolveSettingsBackLocation } from '@/utils/user-space-navigation.js';

const router = useRouter();
const route = useRoute();
const isFromUserSpace = computed(() => String(route.query.from || '').startsWith('userspace'));
const authStore = useAuthStore();
const { isLoggedIn, userInfo, showLoginModal } = storeToRefs(authStore);

const goBack = () => {
  router.push(resolveSettingsBackLocation(route));
};

const sharedMemories = ref([]);

// 状态合并为单一对象
const state = reactive({
  isLoading: false,
  error: null,
  lastFetchTime: 0 // 用于智能刷新
});

const filterStatus = ref('all');
const runningAction = reactive({
  id: '',
  type: ''
});
const pager = reactive({
  page: 1,
  pageSize: 20,
  total: 0
});

// AbortController 管理
let abortController = null;

const statusOptions = [
  { label: '生效中', value: 'active' },
  { label: '已归档', value: 'archived' },
  { label: '全部', value: 'all' }
];

const notice = reactive({
  visible: false,
  type: 'info',
  text: ''
});
let noticeTimer = null;

const hasMore = computed(() => sharedMemories.value.length < Number(pager.total || 0));

const showNotice = (text, type = 'info') => {
  notice.text = String(text || '').trim();
  notice.type = type;
  notice.visible = Boolean(notice.text);

  if (noticeTimer) {
    clearTimeout(noticeTimer);
    noticeTimer = null;
  }
  if (notice.visible) {
    noticeTimer = setTimeout(() => {
      notice.visible = false;
      noticeTimer = null;
    }, 3500);
  }
};

const formatDateTime = (value) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '未知时间';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

const formatConfidence = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0%';
  return `${Math.round(Math.max(0, Math.min(1, num)) * 100)}%`;
};

const isActionRunning = (id) => runningAction.id === id;

const fetchSharedMemories = async ({ append = false, force = false } = {}) => {
  if (!isLoggedIn.value || !userInfo.value?.id) {
    sharedMemories.value = [];
    pager.total = 0;
    return;
  }

  // 智能刷新：5秒内不重复刷新（除非强制刷新）
  const now = Date.now();
  if (!force && !append && state.lastFetchTime > 0 && (now - state.lastFetchTime) < 5000) {
    return;
  }

  // 取消之前的请求
  if (abortController) {
    abortController.abort();
  }
  abortController = new AbortController();

  state.isLoading = true;
  state.error = null;

  const result = await getMySharedAIMemories({
    userId: String(userInfo.value.id || ''),
    page: pager.page,
    pageSize: pager.pageSize,
    status: filterStatus.value
  });

  state.isLoading = false;
  state.lastFetchTime = Date.now();

  if (!result.ok) {
    state.error = result.error?.message || '读取公共记忆失败，请稍后重试。';
    showNotice(state.error, 'error');
    if (!append) {
      sharedMemories.value = [];
      pager.total = 0;
    }
    return;
  }

  const items = Array.isArray(result.data?.items) ? result.data.items : [];
  pager.total = Number(result.data?.total || 0);
  sharedMemories.value = append ? [...sharedMemories.value, ...items] : items;
};

const refreshList = async () => {
  pager.page = 1;
  await fetchSharedMemories({ append: false, force: true });
};

const changeFilter = async (nextStatus) => {
  if (filterStatus.value === nextStatus) return;
  filterStatus.value = nextStatus;
  pager.page = 1;
  await fetchSharedMemories({ append: false, force: true });
};

const loadMore = async () => {
  if (!hasMore.value || state.isLoading) return;
  pager.page += 1;
  await fetchSharedMemories({ append: true });
};

const updateStatus = async (item, nextStatus, successText) => {
  if (!item?.id || !userInfo.value?.id) return;

  // 1. 本地立即更新状态（优化用户体验）
  const previousStatus = item.status;
  item.status = nextStatus;
  showNotice(successText, 'success');

  runningAction.id = String(item.id);
  runningAction.type = 'status';

  // 2. 发起更新请求
  const result = await updateSharedAIMemoryStatus(String(userInfo.value.id || ''), String(item.id), nextStatus);

  runningAction.id = '';
  runningAction.type = '';

  if (!result.ok) {
    // 如果更新失败，恢复状态
    item.status = previousStatus;
    showNotice(result.error?.message || '更新公共记忆状态失败。', 'error');
    return;
  }

  // 3. 延迟静默刷新（3秒后执行）
  setTimeout(() => {
    fetchSharedMemories({ append: false, force: true });
  }, 3000);
};

const archiveMemory = async (item) => {
  await updateStatus(item, 'archived', '该条公共记忆已归档。');
};

const restoreMemory = async (item) => {
  await updateStatus(item, 'active', '该条公共记忆已恢复为生效中。');
};

const editMemory = async (item) => {
  if (!item?.id || !userInfo.value?.id) return;

  const original = String(item.content || '').trim();
  const input = await dialog.prompt({
    title: '编辑公共记忆',
    message: '请输入公共记忆内容（1-1200字）',
    placeholder: '1-1200 字',
    defaultValue: original
  });
  if (input === null) return;

  const nextContent = String(input || '').trim();
  if (!nextContent) {
    showNotice('公共记忆内容不能为空。', 'error');
    return;
  }
  if (nextContent.length > 1200) {
    showNotice('公共记忆内容不能超过 1200 字。', 'error');
    return;
  }
  if (nextContent === original) {
    showNotice('内容未变化，无需保存。');
    return;
  }

  // 1. 本地立即更新内容（优化用户体验）
  const previousContent = item.content;
  item.content = nextContent;
  showNotice('公共记忆已更新。', 'success');

  runningAction.id = String(item.id);
  runningAction.type = 'edit';

  // 2. 发起更新请求
  const result = await updateSharedAIMemory(String(userInfo.value.id || ''), String(item.id), {
    content: nextContent
  });

  runningAction.id = '';
  runningAction.type = '';

  if (!result.ok) {
    // 如果更新失败，恢复内容
    item.content = previousContent;
    showNotice(result.error?.message || '更新公共记忆失败。', 'error');
    return;
  }

  // 3. 延迟静默刷新（3秒后执行）
  setTimeout(() => {
    fetchSharedMemories({ append: false, force: true });
  }, 3000);
};

const removeMemory = async (item) => {
  if (!item?.id || !userInfo.value?.id) return;

  const confirmed = await dialog.confirm({
    title: '删除公共记忆',
    message: '确认删除这条公共记忆吗？删除后不可恢复。',
    tone: 'danger',
    confirmText: '删除'
  });
  if (!confirmed) return;

  // 1. 本地立即删除（优化用户体验）
  const previousMemories = [...sharedMemories.value];
  sharedMemories.value = sharedMemories.value.filter(memory => memory.id !== item.id);

  // 调整页码
  if (sharedMemories.value.length === 0 && pager.page > 1) {
    pager.page -= 1;
  }

  showNotice('公共记忆已删除。', 'success');

  runningAction.id = String(item.id);
  runningAction.type = 'delete';

  // 2. 发起删除请求
  const result = await deleteSharedAIMemory(String(userInfo.value.id || ''), String(item.id));

  runningAction.id = '';
  runningAction.type = '';

  if (!result.ok) {
    // 如果删除失败，恢复数据
    sharedMemories.value = previousMemories;
    showNotice(result.error?.message || '删除公共记忆失败。', 'error');
    return;
  }

  // 3. 延迟静默刷新（3秒后执行）
  setTimeout(() => {
    fetchSharedMemories({ append: false, force: true });
  }, 3000);
};

watch(() => userInfo.value?.id || '', async (nextId, prevId) => {
  if (nextId === prevId) return;
  pager.page = 1;
  await fetchSharedMemories({ append: false, force: true });
});

onMounted(() => {
  void fetchSharedMemories({ append: false, force: true });
});

// 组件卸载时取消请求
onUnmounted(() => {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  if (noticeTimer) {
    clearTimeout(noticeTimer);
    noticeTimer = null;
  }
});
</script>

<style scoped>
.shared-memory-page {
  --user-center-nav-offset: 0px;
  min-height: 100vh;
  background: linear-gradient(180deg, #f7f9fc 0%, #eef2f7 100%);
}

.shared-memory-shell {
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  padding: 72px 0 48px;
}

/* X-Style Header */
.x-sub-header {
  position: sticky;
  top: 72px;
  z-index: 100;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%) brightness(1.02));
  border-bottom: 1px solid #eff3f4;
}

.x-header-content {
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.x-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.x-header-title {
  font-size: 20px;
  font-weight: 800;
  color: #0f1419;
  margin: 0;
}

.page-description {
  margin-bottom: 18px;
}

.page-description p {
  margin: 0;
  color: #4f6275;
  font-size: 14px;
}

.notice {
  margin-bottom: 14px;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 14px;
}

.notice.type-info {
  background: #e8f1ff;
  color: #1c4f9b;
}

.notice.type-success {
  background: #e9f8ef;
  color: #1b7a43;
}

.notice.type-error {
  background: #fdecec;
  color: #9e2f2f;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.filter-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-chip {
  border: 1px solid #d0dae5;
  background: #fff;
  color: #3d5369;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
}

.filter-chip.active {
  border-color: #2a6edb;
  background: #eaf2ff;
  color: #1e58b6;
}

.memory-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.memory-card {
  border: 1px solid #dde5ee;
  border-radius: 14px;
  background: #fff;
  padding: 14px;
}

.memory-meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.meta-left {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.meta-status,
.meta-source,
.meta-confidence {
  font-size: 12px;
  border-radius: 999px;
  padding: 3px 8px;
  border: 1px solid #d4deea;
  color: #38516a;
  background: #f6f9fc;
}

.meta-status.active {
  border-color: #b9d5ff;
  background: #eaf3ff;
  color: #205eb9;
}

.meta-status.archived {
  border-color: #d7dce3;
  background: #f2f4f7;
  color: #6a7583;
}

.meta-time {
  color: #6a7d91;
  font-size: 12px;
  white-space: nowrap;
}

.memory-content {
  margin: 0;
  line-height: 1.7;
  color: #1f2f3f;
  white-space: pre-wrap;
}

.memory-tags {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  font-size: 12px;
  background: #eef4fb;
  color: #3f5972;
  border-radius: 999px;
  padding: 3px 8px;
}

.mood-tag {
  background: #fff2dc;
  color: #94661a;
}

.evidence-hint {
  margin: 8px 0 0;
  color: #60758b;
  font-size: 12px;
}

.memory-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.primary-btn,
.ghost-btn,
.danger-btn {
  border-radius: 10px;
  padding: 7px 12px;
  font-size: 13px;
  cursor: pointer;
}

.primary-btn {
  border: none;
  background: #2a6edb;
  color: #fff;
}

.ghost-btn {
  border: 1px solid #ced9e6;
  background: #fff;
  color: #344c65;
}

.danger-btn {
  border: 1px solid #f0c4c4;
  background: #fff5f5;
  color: #b23939;
}

.primary-btn:disabled,
.ghost-btn:disabled,
.danger-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.login-card,
.empty-state,
.loading-state {
  border: 1px dashed #cfd9e4;
  background: #fff;
  border-radius: 14px;
  padding: 28px 20px;
  text-align: center;
}

.state-icon {
  font-size: 26px;
  margin-bottom: 10px;
}

.login-card h3,
.empty-state h3 {
  margin: 0 0 8px;
  color: #1f3347;
}

.login-card p,
.empty-state p,
.loading-state p {
  margin: 0;
  color: #597086;
}

.loading-spinner {
  width: 22px;
  height: 22px;
  margin: 0 auto 10px;
  border-radius: 50%;
  border: 2px solid #d7e2ee;
  border-top-color: #2a6edb;
  animation: spin 0.9s linear infinite;
}

.load-more {
  display: flex;
  justify-content: center;
  padding-top: 6px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .shared-memory-shell {
    padding: 56px 14px 36px;
  }

  .title-wrap h1 {
    font-size: 21px;
  }

  .memory-meta {
    flex-direction: column;
    align-items: flex-start;
  }

  .meta-time {
    white-space: normal;
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar .ghost-btn {
    width: 100%;
  }
}
</style>
