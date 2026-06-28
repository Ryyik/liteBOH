<template>
  <div key="profile-settings" class="profile-subpage-shell">
    <UserCenterPageHeader title="设置" back-label="返回我的" max-width="650px" @back="$emit('back')" />

    <div class="profile-subpage-body">
      <HomeCatMascot v-if="isHomeCatActive" class="settings-page-cat" pool="background"
        seed="settings-page" size="lg" decorative />
      <div class="apple-card settings-section-card">
        <HomeCatMascot v-if="isHomeCatActive" class="settings-card-cat" pool="ambient"
          seed="settings-appearance" size="sm" decorative />
        <div class="group-header-title">外观与浏览</div>
        <div class="apple-list-group">
          <div class="apple-item clickable" @click="$emit('open-theme')">
            <div class="item-left">
              <div class="icon-wrapper" :class="currentTheme === 'dark' ? 'bg-purple' : 'bg-yellow'">
                <svg v-if="currentTheme === 'dark'" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
              </div>
              <span class="setting-label-stack">
                <span class="item-label">主题设置</span>
                <span class="item-desc">选择浅色、深色或跟随系统</span>
              </span>
            </div>
            <div class="item-right">
              <span class="text-secondary">{{ themeDisplayText }}</span>
              <span class="chevron">›</span>
            </div>
          </div>
        </div>
      </div>

      <div class="apple-card settings-section-card">
        <HomeCatMascot v-if="isHomeCatActive" class="settings-card-cat alt" pool="ambient"
          seed="settings-cloud" size="sm" decorative />
        <div class="group-header-title">Cloud+</div>
        <div class="apple-list-group">
          <div class="apple-item clickable" @click="$emit('open-cloud', 'settings')">
            <div class="item-left">
              <div class="icon-wrapper bg-teal">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path>
                  <path d="M8 9h8"></path>
                  <path d="M8 13h5"></path>
                </svg>
              </div>
              <span class="setting-label-stack">
                <span class="item-label">Cloud+ 页面</span>
                <span class="item-desc">进入完整 Cloud+ 设置与管理页面</span>
              </span>
            </div>
            <div class="item-right">
              <span class="text-secondary">{{ cloudPlusUsageText }}</span>
              <span class="chevron">›</span>
            </div>
          </div>
        </div>
      </div>

      <div class="apple-card settings-section-card">
        <div class="group-header-title">账户与安全</div>
        <div class="apple-list-group">
          <div class="apple-item clickable" @click="$emit('open-security')">
            <div class="item-left">
              <div class="icon-wrapper bg-blue">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                </svg>
              </div>
              <span class="setting-label-stack">
                <span class="item-label">账户安全</span>
                <span class="item-desc">修改密码、管理登录安全</span>
              </span>
            </div>
            <div class="item-right">
              <span class="text-secondary">密码与账号</span>
              <span class="chevron">›</span>
            </div>
          </div>
        </div>
      </div>

      <div class="apple-card settings-section-card">
        <HomeCatMascot v-if="isHomeCatActive" class="settings-card-cat" pool="ambient"
          seed="settings-notification" size="sm" decorative />
        <div class="group-header-title">通知</div>
        <div class="apple-list-group">
          <div class="apple-item clickable" @click="$emit('open-pushplus')">
            <div class="item-left">
              <div class="icon-wrapper bg-blue">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
              </div>
              <span class="setting-label-stack">
                <span class="item-label">Pushplus 推送</span>
                <span class="item-desc">离线时通过微信接收消息</span>
              </span>
            </div>
            <div class="item-right">
              <span class="text-secondary">{{ pushplusStatusText }}</span>
              <span class="chevron">›</span>
            </div>
          </div>
        </div>
      </div>

      <div class="apple-card settings-section-card">
        <div class="group-header-title">数据与隐私</div>
        <div class="apple-list-group">
          <div class="apple-item clickable" @click="$emit('toggle-hide-online')">
            <div class="item-left">
              <div class="icon-wrapper bg-indigo">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              </div>
              <span class="setting-label-stack">
                <span class="item-label">隐藏在线状态</span>
                <span class="item-desc">开启后，他人将看不到你的在线状态，你也无法查看他人的在线状态</span>
              </span>
            </div>
            <div class="item-right">
              <span :class="['toggle-switch', { enabled: hideOnlineStatus }]"></span>
            </div>
          </div>
          <div class="apple-item clickable" @click="$emit('toggle-hide-follow-data')">
            <div class="item-left">
              <div class="icon-wrapper bg-indigo">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
              </div>
              <span class="setting-label-stack">
                <span class="item-label">隐藏关注数据</span>
                <span class="item-desc">开启后，他人在你主页看不到你的详细关注列表和粉丝列表，但仍能看到数量</span>
              </span>
            </div>
            <div class="item-right">
              <span :class="['toggle-switch', { enabled: hideFollowData }]"></span>
            </div>
          </div>
          <div class="apple-item clickable" @click="$emit('open-data-management')">
            <div class="item-left">
              <div class="icon-wrapper bg-indigo">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <ellipse cx="12" cy="5" rx="8" ry="3"></ellipse>
                  <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"></path>
                  <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"></path>
                </svg>
              </div>
              <span class="setting-label-stack">
                <span class="item-label">数据与隐私</span>
                <span class="item-desc">公共记忆与管理工具</span>
              </span>
            </div>
            <div class="item-right">
              <span class="text-secondary">{{ dataPrivacyStatusText }}</span>
              <span class="chevron">›</span>
            </div>
          </div>
        </div>
      </div>

      <div class="apple-card settings-section-card danger-section-card">
        <div class="group-header-title">危险操作</div>
        <div class="apple-list-group">
          <div class="apple-item clickable" @click="$emit('logout')">
            <div class="item-left">
              <div class="icon-wrapper bg-red">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
              </div>
              <span class="item-label text-danger">退出登录</span>
            </div>
            <div class="item-right">
              <span class="chevron text-danger">›</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import HomeCatMascot from '@/components/HomeCatMascot.vue';

defineProps({
  pushplusStatusText: {
    type: String,
    default: ''
  },
  cloudPlusUsageText: {
    type: String,
    default: ''
  },
  subscriptionSummaryText: {
    type: String,
    default: ''
  },
  dataPrivacyStatusText: {
    type: String,
    default: ''
  },
  themeDisplayText: {
    type: String,
    default: ''
  },
  isHomeCatActive: {
    type: Boolean,
    default: false
  },
  currentTheme: {
    type: String,
    default: ''
  },
  hideOnlineStatus: {
    type: Boolean,
    default: false
  },
  hideFollowData: {
    type: Boolean,
    default: false
  }
});

defineEmits([
  'back',
  'open-theme',
  'open-cloud',
  'open-pushplus',
  'open-security',
  'open-data',
  'open-data-management',
  'logout',
  'toggle-hide-online',
  'toggle-hide-follow-data'
]);
</script>

<style scoped>
/* Styles are provided globally via UserSpaceMain's style imports */
</style>