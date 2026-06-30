<template>
  <Teleport to="body">
    <Transition name="glass-fade">
      <div v-if="show" class="glass-modal-overlay" @click.self="$emit('close')">
        <div class="glass-modal-container follow-list-modal">
          <div class="modal-header">
            <div class="modal-header-left">
              <button class="close-btn" @click="$emit('close')">&times;</button>
              <h3>{{ title }}</h3>
            </div>
          </div>
          <div class="modal-body custom-scrollbar">
            <div v-if="loading" class="follow-list-loading">
              <div class="loading-spinner"></div>
              <p>加载中...</p>
            </div>
            <div v-else-if="users.length === 0" class="follow-list-empty">
              <p>{{ emptyText }}</p>
            </div>
            <div v-else class="follow-list">
              <div v-for="user in users" :key="user.id" class="follow-list-item" @click="goToProfile(user.username)">
                <div class="follow-list-avatar">
                  <img v-if="user.avatar_url" :src="user.avatar_url" :alt="user.username" loading="lazy" />
                  <span v-else>{{ user.username?.charAt(0)?.toUpperCase?.() || '?' }}</span>
                </div>
                <div class="follow-list-info">
                  <span class="follow-list-name">{{ user.username }}</span>
                  <span class="follow-list-meta">{{ formatDate(user.followed_at) }} 关注</span>
                </div>
                <button
                  v-if="showUnfollow"
                  class="follow-list-unfollow-btn"
                  :disabled="user._unfollowing"
                  @click.stop="handleUnfollow(user)"
                >{{ user._unfollowing ? '取消中...' : '取消关注' }}</button>
              </div>
            </div>
            <div v-if="hasMore" class="follow-list-load-more">
              <button class="load-more-btn" :disabled="loadingMore" @click="$emit('load-more')">
                {{ loadingMore ? '加载中...' : '加载更多' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { useRouter } from 'vue-router';

defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: '' },
  users: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  loadingMore: { type: Boolean, default: false },
  hasMore: { type: Boolean, default: false },
  emptyText: { type: String, default: '暂无数据' },
  showUnfollow: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'load-more', 'unfollow']);
const handleUnfollow = (user) => {
  emit('unfollow', user);
};
const router = useRouter();

const goToProfile = (username) => {
  if (!username) return;
  emit('close');
  router.push(`/profile/${encodeURIComponent(username)}?from=profile`);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
};
</script>

<style scoped>
.follow-list-modal {
  width: 420px;
  max-width: 90vw;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 32px;
  overflow: hidden;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.15);
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  flex-shrink: 0;
}

.modal-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-header-left h3 {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
}

.close-btn {
  font-size: 24px;
  background: none;
  border: none;
  cursor: pointer;
  color: #86868b;
  padding: 0 4px;
  line-height: 1;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.follow-list-loading,
.follow-list-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  color: #86868b;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 3px solid #e5e5ea;
  border-top-color: #007aff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.follow-list-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  cursor: pointer;
  transition: background 0.15s;
}

.follow-list-item:hover {
  background: #f5f5f7;
}

.follow-list-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #f0f0f2;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 16px;
  overflow: hidden;
  flex-shrink: 0;
}

.follow-list-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.follow-list-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.follow-list-name {
  font-weight: 600;
  font-size: 15px;
  color: #1d1d1f;
}

.follow-list-meta {
  font-size: 12px;
  color: #86868b;
}

.follow-list-load-more {
  padding: 16px 24px;
  display: flex;
  justify-content: center;
}

.load-more-btn {
  padding: 8px 20px;
  border-radius: 100px;
  border: 1px solid #cfd9de;
  background: white;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  color: #007aff;
  transition: background 0.2s;
}

.load-more-btn:hover {
  background: #f5f5f7;
}

.load-more-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.follow-list-unfollow-btn {
  margin-left: auto;
  flex-shrink: 0;
  padding: 4px 12px;
  border-radius: 100px;
  border: 1px solid #cfd9de;
  background: white;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  color: #e34c26;
  transition: background 0.2s, border-color 0.2s;
  white-space: nowrap;
}

.follow-list-unfollow-btn:hover {
  background: #fff0ed;
  border-color: #e34c26;
}

.follow-list-unfollow-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
