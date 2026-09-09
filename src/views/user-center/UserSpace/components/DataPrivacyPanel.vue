<template>
  <div class="profile-subpage-shell">
    <UserCenterPageHeader title="数据与隐私" back-label="返回设置" max-width="1200px" @back="$emit('back')" />

    <div class="profile-subpage-body">
      <!-- 液态玻璃连续面板（与设置主页同一设计体系） -->
      <div class="glass-settings">
        <section class="gs-group">
          <div class="gs-group-title">记忆与管理</div>
          <div class="gs-rows">
            <button type="button" class="gs-row" @click="$emit('navigate', 'shared-memories')">
              <span class="gs-icon is-indigo">
                <Database :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
              <span class="gs-text">
                <span class="gs-label">公共记忆管理</span>
                <span class="gs-desc">查看与管理社区公共记忆条目</span>
              </span>
              <span class="gs-side">
                <ChevronRight class="gs-chevron" :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
            </button>
            <button v-if="isAdmin" type="button" class="gs-row" @click="$emit('navigate', 'admin')">
              <span class="gs-icon is-gray">
                <Wrench :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
              <span class="gs-text">
                <span class="gs-label">后台数据管理</span>
                <span class="gs-desc">管理员数据运维工具</span>
              </span>
              <span class="gs-side">
                <ChevronRight class="gs-chevron" :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
            </button>
          </div>
        </section>

        <section class="gs-group">
          <div class="privacy-note-wrap">
            <p class="gs-note">
              隐藏在线状态与隐藏关注数据等隐私开关，可在「设置」主页的数据与隐私分组中调整。
            </p>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import '../styles/settings-glass.css';

.profile-subpage-shell {
  padding-top: 0;
}

.privacy-note-wrap {
  padding: 14px 18px 16px;
}

.privacy-note-wrap .gs-note {
  margin: 0;
}

@media (orientation: landscape) and (max-height: 520px) {
  .privacy-note-wrap {
    padding: 10px 16px 12px;
  }
}
</style>

<script setup>
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import { ChevronRight, Database, Wrench } from 'lucide-vue-next';

defineProps({
  isAdmin: { type: Boolean, default: false }
});

defineEmits(['back', 'navigate']);
</script>
