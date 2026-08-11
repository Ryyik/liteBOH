<template>
  <div class="profile-edit-page-shell">
    <UserCenterPageHeader title="编辑资料" back-label="返回我的" max-width="1200px" @back="$emit('close')" />

    <section class="profile-edit-page-card">
      <div class="profile-edit-page-hero">
        <div class="apple-avatar-wrapper profile-edit-page-avatar clickable" @click="$emit('avatar-click')">
          <div v-if="avatarUrl" class="apple-avatar has-avatar">
            <img :src="avatarUrl" alt="头像" class="avatar-img" loading="lazy">
          </div>
          <div v-else class="apple-avatar">{{ (username || 'U').charAt(0).toUpperCase() }}</div>
          <span class="profile-edit-avatar-badge" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"
              stroke-linejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </span>
          <div class="avatar-edit-overlay">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
        </div>
        <div class="profile-edit-page-copy">
          <h3>{{ username || '我的资料' }}</h3>
          <p>更新会显示在“我的”页面顶部。</p>
          <button type="button" class="profile-edit-avatar-action" @click="$emit('avatar-click')">
            更换头像
          </button>
        </div>
      </div>

      <div class="edit-profile-form profile-edit-page-form">
        <label class="edit-profile-field">
          <span>昵称</span>
          <input :value="username" type="text" class="edit-profile-input" maxlength="20" placeholder="设置你的昵称（最多 20 字）"
            @input="$emit('update-username', $event.target.value)">
        </label>

        <label class="edit-profile-field">
          <span>个人简介</span>
          <textarea :value="bio" class="edit-profile-textarea" maxlength="160" placeholder="写一句介绍自己或当前状态的话"
            @input="$emit('update-bio', $event.target.value)"></textarea>
        </label>

        <label class="edit-profile-field">
          <span>入群时间</span>
          <div class="profile-date-selector">
            <select :value="joinYear" class="profile-date-select"
              @change="$emit('update-join-year', $event.target.value)">
              <option value="">年</option>
              <option v-for="year in joinDateYears" :key="`edit-join-year-${year}`" :value="year">{{ year }}年</option>
            </select>
            <select :value="joinMonth" class="profile-date-select"
              @change="$emit('update-join-month', $event.target.value)">
              <option value="">月</option>
              <option v-for="m in months" :key="`edit-join-month-${m}`" :value="m">{{ m }}月</option>
            </select>
            <select :value="joinDay" class="profile-date-select"
              @change="$emit('update-join-day', $event.target.value)">
              <option value="">日</option>
              <option v-for="d in daysForEditJoinDate" :key="`edit-join-day-${d}`" :value="d">{{ d }}日</option>
            </select>
          </div>
        </label>

        <div class="edit-profile-field">
          <span>生日</span>
          <div class="profile-date-selector birthday-selector compact">
            <select :value="birthMonth" class="profile-date-select"
              @change="$emit('update-birth-month', $event.target.value)">
              <option value="">月</option>
              <option v-for="m in months" :key="`edit-birth-month-${m}`" :value="m">{{ m }}月</option>
            </select>
            <select :value="birthDay" class="profile-date-select"
              @change="$emit('update-birth-day', $event.target.value)">
              <option value="">日</option>
              <option v-for="d in daysForEditProfile" :key="`edit-birth-day-${d}`" :value="d">{{ d }}日</option>
            </select>
          </div>
        </div>
      </div>
    </section>

    <div class="profile-edit-page-actions">
      <button type="button" class="profile-edit-cancel-btn" @click="$emit('close')">取消</button>
      <button type="button" class="profile-edit-save-btn" @click="$emit('save')" :disabled="isSubmittingProfileEdit">
        {{ isSubmittingProfileEdit ? '保存中...' : '保存资料' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';

defineProps({
  avatarUrl: { type: String, default: '' },
  username: { type: String, default: '' },
  bio: { type: String, default: '' },
  joinYear: { type: [String, Number], default: '' },
  joinMonth: { type: [String, Number], default: '' },
  joinDay: { type: [String, Number], default: '' },
  birthMonth: { type: [String, Number], default: '' },
  birthDay: { type: [String, Number], default: '' },
  joinDateYears: { type: Array, default: () => [] },
  months: { type: Array, default: () => [] },
  daysForEditJoinDate: { type: Array, default: () => [] },
  daysForEditProfile: { type: Array, default: () => [] },
  isSubmittingProfileEdit: { type: Boolean, default: false }
});

defineEmits(['close', 'avatar-click', 'save',
  'update-username', 'update-bio', 'update-join-year', 'update-join-month', 'update-join-day',
  'update-birth-month', 'update-birth-day'
]);
</script>

<style scoped>
.profile-edit-page-shell {
  padding-top: 0;
}

.profile-edit-avatar-badge {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #2563eb;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
  z-index: 2;
}

.profile-edit-avatar-action {
  margin-top: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #2563eb;
  background: none;
  border: 0;
  cursor: pointer;
  padding: 0;
}

.profile-edit-cancel-btn {
  border: 0;
  background: rgba(15, 23, 42, 0.06);
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 700;
  padding: 12px 24px;
  border-radius: 14px;
  cursor: pointer;
}

.profile-edit-save-btn {
  border: 0;
  background: #2563eb;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  padding: 12px 24px;
  border-radius: 14px;
  cursor: pointer;
}

.profile-edit-save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.edit-profile-input {
  width: 100%;
  min-height: 44px;
  padding: 10px 14px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 500;
  resize: none;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.edit-profile-input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.18);
}

.user-space-page[data-theme="dark"] .edit-profile-input {
  background: rgba(24, 24, 27, 0.62);
  border-color: rgba(255, 255, 255, 0.12);
}

.user-space-page[data-theme="dark"] .edit-profile-input:focus {
  border-color: #60a5fa;
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.18);
}

.user-space-page[data-theme="dark"] .profile-edit-avatar-badge {
  border-color: #181a20;
}

.user-space-page[data-theme="dark"] .profile-edit-cancel-btn {
  background: rgba(255, 255, 255, 0.1);
}
</style>
