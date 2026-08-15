<template>
  <div class="community-users-list birthday-users-list">
    <div v-if="isLoading && users.length === 0" class="loading-state compact">
      <div class="loading-spinner"></div>
      <p class="loading-text">正在加载最近生日...</p>
    </div>

    <div v-else-if="users.length === 0" class="empty-state glass-empty">
      <Cake class="empty-icon" :size="30" :stroke-width="1.7" aria-hidden="true" />
      <p>暂时没有伙伴设置生日。</p>
    </div>

    <button v-for="(user, index) in users" :key="`birthday-${user.id}`" type="button"
      class="user-item glass-user birthday-user-glass" :style="{ '--item-index': index }"
      @click="emit('open-profile', user.username)">
      <div class="user-avatar">
        <img v-if="user.avatar_url" :src="user.avatar_url" alt="用户头像" class="avatar-image" loading="lazy"
          decoding="async" />
        <span v-else>{{ user.username ? user.username.charAt(0).toUpperCase() : 'U' }}</span>
      </div>
      <div class="user-info">
        <span class="user-name" :class="tierMap[user.id]">@{{ user.username }}</span>
        <p class="user-bio">{{ formatBirthdayDistance(user) }}</p>
      </div>
      <div class="user-meta">
        <span class="meta-item birthday-meta">
          <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          {{ String(user.birth_month).padStart(2, '0') }}/{{ String(user.birth_day).padStart(2, '0') }}
        </span>
      </div>
    </button>
  </div>
</template>

<script setup>
import { Cake } from 'lucide-vue-next';

defineProps({
  users: {
    type: Array,
    default: () => []
  },
  isLoading: Boolean,
  tierMap: {
    type: Object,
    default: () => ({})
  },
  formatBirthdayDistance: {
    type: Function,
    required: true
  }
});

const emit = defineEmits(['open-profile']);
</script>

<style scoped>
.birthday-users-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
}

.birthday-users-list .user-item {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  grid-template-areas: 'avatar content meta';
  align-items: center;
  width: 100%;
  min-height: 72px;
  gap: 12px;
  padding: 10px 12px;
  box-sizing: border-box;
  text-align: left;
}

.birthday-users-list .user-avatar {
  grid-area: avatar;
  width: 42px;
  height: 42px;
  border-radius: 12px;
}

.birthday-users-list .user-info {
  grid-area: content;
  display: flex;
  min-width: 0;
  gap: 2px;
}

.birthday-users-list .user-name,
.birthday-users-list .user-bio {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.birthday-users-list .user-bio {
  display: block;
  margin: 0;
}

.birthday-users-list .user-meta {
  grid-area: meta;
  align-self: center;
  margin: 0;
}

.birthday-users-list .meta-item {
  white-space: nowrap;
}

@media (max-width: 480px) {
  .birthday-users-list .user-item {
    grid-template-columns: 38px minmax(0, 1fr) auto;
    min-height: 66px;
    gap: 10px;
    padding: 9px 10px;
  }

  .birthday-users-list .user-avatar {
    width: 38px;
    height: 38px;
    border-radius: 11px;
  }

  .birthday-users-list .user-name {
    font-size: 14px;
  }

  .birthday-users-list .user-bio,
  .birthday-users-list .meta-item {
    font-size: 11px;
  }
}
</style>
