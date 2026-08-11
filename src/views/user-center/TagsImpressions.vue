<template>
  <div class="tags-impressions-page" :style="{ '--user-center-nav-offset': isFromUserSpace ? '0px' : '72px', paddingTop: isFromUserSpace ? '0px' : '72px' }">
    <UserCenterPageHeader v-if="isFromUserSpace" title="标签与印象" max-width="1200px" @back="goBack" />

    <div class="content-container">
      <!-- Info Card -->
      <div class="info-card glass-card">
        <Tag class="info-icon" :size="30" :stroke-width="1.7" aria-hidden="true" />
        <div class="info-text">
          <h3>独特身份</h3>
          <p>这些内容展示了大家对您的<span class="highlight-1200">独特印象</span>。您可以在这里查看并管理这些反馈。</p>
        </div>
      </div>

      <!-- Impressions Section -->
      <div class="section-card glass-card">
        <div class="section-header">
          <h2 class="section-title">他人印象</h2>
          <span class="count-badge">{{ userImpressions.length }}</span>
        </div>

        <div v-if="state.isLoading" class="loading-state">
          <div class="spinner"></div>
          <p>同步数据中...</p>
        </div>

        <div v-else-if="userImpressions.length > 0" class="impressions-grid">
          <div v-for="imp in userImpressions" :key="imp.id" class="impression-item">
            <div class="imp-content">{{ imp.content }}</div>
            <div class="imp-footer">
              <span class="imp-author">@{{ imp.author?.username || '匿名伙伴' }}</span>
              <div class="imp-actions">
                <span class="imp-date">{{ formatSimpleDate(imp.created_at) }}</span>
                <button class="delete-btn" @click="handleDeleteImpression(imp.id)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2">
                    </path>
                  </svg>
                  <span>移除</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="empty-state">
          <MessageCircle class="empty-icon" :size="32" :stroke-width="1.7" aria-hidden="true" />
          <p>暂无他人印象</p>
          <span>让社区里的伙伴为您写下第一条印象吧！</span>
        </div>
      </div>

      <!-- Personal Tags Section (Optional/Future) -->
      <div v-if="userTags.length > 0" class="section-card glass-card">
        <div class="section-header">
          <h2 class="section-title">个人标签</h2>
        </div>
        <div class="tags-flex">
          <span v-for="(tag, index) in userTags" :key="index" class="tag-pill" :class="getTagClass(index)">
            {{ tag }}
          </span>
        </div>
      </div>
    </div>

    <!-- Unified Alert Modal -->
    <CommonAlertModal v-model:visible="alertState.visible" :type="alertState.type" :title="alertState.title"
      :message="alertState.message" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MessageCircle, Tag } from 'lucide-vue-next';
import { supabase } from '@/utils/supabase-client.js';
import { getUserImpressions, deleteUserImpression } from '@/utils/api/profile-api.js';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import CommonAlertModal from '@/components/CommonAlertModal.vue';
import { resolveSettingsBackLocation } from '@/utils/user-space-navigation.js';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import { logger } from '@/utils/logger.js';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';

const router = useRouter();
const route = useRoute();
const isFromUserSpace = computed(() => String(route.query.from || '').startsWith('userspace'));
const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);

const goBack = () => {
  router.push(resolveSettingsBackLocation(route));
};

const userImpressions = ref([]);
const userTags = ref(userInfo.value?.tags || []);

// 状态合并为单一对象
const state = reactive({
  isLoading: true,
  error: null
});

const alertState = reactive({
  visible: false,
  type: 'success',
  title: '',
  message: ''
});

const showAlert = (type, title, message) => {
  alertState.type = type;
  alertState.title = title;
  alertState.message = message;
  alertState.visible = true;
};

const fetchImpressions = async () => {
  state.isLoading = true;
  state.error = null;
  try {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      router.push('/login');
      return;
    }

    const { data, error } = await getUserImpressions(authUser.id);
    if (!error) {
      userImpressions.value = data || [];
    } else {
      state.error = error;
    }
  } catch (err) {
    logger.error('tags-impressions', '获取印象失败:', err);
    state.error = err;
  } finally {
    state.isLoading = false;
  }
};

const handleDeleteImpression = async (id) => {
  if (!await dialog.confirm({
    title: '移除印象',
    message: '确定要移除这条印象吗？',
    tone: 'danger',
    confirmText: '移除'
  })) return;

  try {
    const currentUserId = String(userInfo.value.id || '').trim();
    if (!currentUserId) {
      showAlert('error', '删除失败', '当前登录状态异常，请刷新后重试');
      return;
    }

    // 1. 本地立即删除（优化用户体验）
    const previousImpressions = [...userImpressions.value];
    userImpressions.value = userImpressions.value.filter(imp => imp.id !== id);
    showAlert('success', '删除成功', '该印象已被移除');

    // 2. 发起删除请求
    const { error } = await deleteUserImpression(id, currentUserId);

    if (error) {
      // 如果删除失败，恢复数据
      userImpressions.value = previousImpressions;
      showAlert('error', '删除失败', error.message);
      return;
    }

    // 3. 延迟静默刷新（更新缓存，3秒后执行）
    setTimeout(() => {
      fetchImpressions();
    }, 3000);
  } catch (err) {
    logger.error('tags-impressions', '删除印象异常:', err);
    showAlert('error', '删除失败', '网络错误');
  }
};

const formatSimpleDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

const getTagClass = (i) => ['tag-blue', 'tag-purple', 'tag-orange', 'tag-green'][i % 4];

onMounted(fetchImpressions);
</script>

<style scoped>
.tags-impressions-page {
  --user-center-nav-offset: 0px;
  min-height: 100vh;
  background-color: #f5f5f7;
  padding: 0 0 60px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
}

/* X-Style Header */
.x-sub-header {
  position: sticky;
  top: 72px;
  z-index: 100;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
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

.content-container {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.glass-card {
  background: white;
  border-radius: 24px;
  padding: 32px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.02);
}

.info-card {
  display: flex;
  align-items: center;
  gap: 24px;
  background: linear-gradient(135deg, #ffffff 0%, #f9f9fb 100%);
}

.info-icon {
  font-size: 40px;
  width: 80px;
  height: 80px;
  background: white;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.05);
}

.info-text h3 {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 700;
}

.info-text p {
  margin: 0;
  color: #86868b;
  line-height: 1.5;
}

.highlight-1200 {
  font-weight: 700;
  color: #1d1d1f;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.section-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
}

.count-badge {
  background: #f5f5f7;
  color: #86868b;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
}

.impressions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.impression-item {
  background: #f9f9fb;
  padding: 20px;
  border-radius: 20px;
  border: 1px solid rgba(0, 0, 0, 0.02);
  transition: all 0.2s;
}

.impression-item:hover {
  background: #f5f5f7;
  transform: translateY(-2px);
}

.imp-content {
  font-size: 16px;
  color: #1d1d1f;
  line-height: 1.6;
  margin-bottom: 16px;
}

.imp-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.imp-author {
  font-size: 14px;
  font-weight: 600;
  color: #86868b;
}

.imp-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.imp-date {
  font-size: 12px;
  color: #c7c7cc;
}

.delete-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: #ff3b30;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  transition: all 0.2s;
}

.delete-btn:hover {
  background: rgba(255, 59, 48, 0.05);
}

.loading-state {
  padding: 60px 0;
  text-align: center;
}

.spinner {
  width: 30px;
  height: 30px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #007aff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.empty-state {
  padding: 60px 0;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-state p {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 8px;
}

.empty-state span {
  color: #86868b;
  font-size: 14px;
}

.tags-flex {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.tag-pill {
  padding: 10px 20px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 600;
}

.tag-blue {
  background: #EBF5FF;
  color: #007AFF;
}

.tag-purple {
  background: #F7EFFF;
  color: #AF52DE;
}

.tag-orange {
  background: #FFF5E6;
  color: #FF9500;
}

.tag-green {
  background: #E8F9EE;
  color: #34C759;
}

@media (max-width: 768px) {
  .tags-impressions-page {
    padding-top: 56px;
  }

  .impressions-grid {
    grid-template-columns: 1fr;
  }

  .info-card {
    flex-direction: column;
    text-align: center;
    padding: 24px;
  }

  .info-icon {
    width: 64px;
    height: 64px;
    font-size: 32px;
  }
}
</style>
