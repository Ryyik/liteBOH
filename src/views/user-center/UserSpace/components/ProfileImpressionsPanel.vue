<template>
  <div key="profile-impressions" class="profile-subpage-shell">
    <UserCenterPageHeader title="我的印象" back-label="返回我的" max-width="650px" @back="$emit('back')" />

    <div class="profile-subpage-body">
      <div v-if="isImpressionsLoading" class="profile-content-empty">
        <p>正在同步印象...</p>
      </div>

      <div v-else-if="impressions.length" class="profile-impressions-grid">
        <article v-for="imp in impressions" :key="imp.id" class="profile-impression-card">
          <p>{{ imp.content }}</p>
          <div>
            <span>@{{ imp.author?.username || '匿名伙伴' }}</span>
            <button type="button" @click="$emit('delete-impression', imp.id)">移除</button>
          </div>
        </article>
      </div>

      <div v-else class="profile-content-empty">
        <h3>暂无他人印象</h3>
        <p>社区伙伴写给你的印象会显示在这里。</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';

defineProps({
  isImpressionsLoading: {
    type: Boolean,
    default: false
  },
  impressions: {
    type: Array,
    default: () => []
  }
});

defineEmits([
  'back',
  'delete-impression'
]);
</script>

<style scoped>
.profile-subpage-shell {
  padding-top: 0;
}

.profile-impressions-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.profile-impression-card {
  padding: 16px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 16px;
  background: #ffffff;
}

.profile-impression-card p {
  margin: 0;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.6;
  font-weight: 700;
}

.profile-impression-card div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
}

.profile-impression-card span {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.profile-impression-card button {
  border: 0;
  background: transparent;
  color: #ff3b30;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

:global(.user-space-page[data-theme="dark"]) .profile-impression-card {
  background: rgba(24, 24, 27, 0.92);
  border-color: rgba(255, 255, 255, 0.08);
}
</style>
