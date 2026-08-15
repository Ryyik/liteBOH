<template>
  <div key="profile-settings" class="profile-subpage-shell">
    <UserCenterPageHeader title="设置" back-label="返回我的" max-width="1200px" @back="$emit('back')" />

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
                <Moon v-if="currentTheme === 'dark'" :size="16" :stroke-width="2" aria-hidden="true" />
                <Sun v-else :size="16" :stroke-width="2" aria-hidden="true" />
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
        <div class="group-header-title">内测体验</div>
        <div class="apple-list-group">
          <div class="apple-item clickable" @click="$emit('open-beta-preview')">
            <div class="item-left">
              <div class="icon-wrapper bg-blue">
                <FlaskConical :size="16" :stroke-width="2" aria-hidden="true" />
              </div>
              <span class="setting-label-stack">
                <span class="item-label">Beta 5 预览版</span>
                <span class="item-desc">尝鲜新功能，可随时返回正式版</span>
              </span>
            </div>
            <div class="item-right">
              <span class="text-secondary">Preview</span>
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
                <MessagesSquare :size="16" :stroke-width="2" aria-hidden="true" />
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
                <Shield :size="16" :stroke-width="2" aria-hidden="true" />
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
                <Bell :size="16" :stroke-width="2" aria-hidden="true" />
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
                <EyeOff :size="16" :stroke-width="2" aria-hidden="true" />
              </div>
              <span class="setting-label-stack">
                <span class="item-label">隐藏在线状态</span>
                <span class="item-desc">开启后，他人将看不到你的在线状态，你也无法查看他人的在线状态</span>
              </span>
            </div>
            <div class="item-right">
              <SettingToggle :model-value="hideOnlineStatus" label="隐藏在线状态"
                @update:model-value="$emit('toggle-hide-online')" />
            </div>
          </div>
          <div class="apple-item clickable" @click="$emit('toggle-hide-follow-data')">
            <div class="item-left">
              <div class="icon-wrapper bg-indigo">
                <Users :size="16" :stroke-width="2" aria-hidden="true" />
              </div>
              <span class="setting-label-stack">
                <span class="item-label">隐藏关注数据</span>
                <span class="item-desc">开启后，他人在你主页看不到你的详细关注列表和粉丝列表，但仍能看到数量</span>
              </span>
            </div>
            <div class="item-right">
              <SettingToggle :model-value="hideFollowData" label="隐藏关注数据"
                @update:model-value="$emit('toggle-hide-follow-data')" />
            </div>
          </div>
          <div class="apple-item clickable" @click="$emit('open-data-management')">
            <div class="item-left">
              <div class="icon-wrapper bg-indigo">
                <Database :size="16" :stroke-width="2" aria-hidden="true" />
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
                <LogOut :size="16" :stroke-width="2" aria-hidden="true" />
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
import { Bell, Database, EyeOff, FlaskConical, LogOut, MessagesSquare, Moon, Shield, Sun, Users } from 'lucide-vue-next';
import SettingToggle from './SettingToggle.vue';

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
  'open-beta-preview',
  'open-data',
  'open-data-management',
  'logout',
  'toggle-hide-online',
  'toggle-hide-follow-data'
]);
</script>

<style scoped>
.profile-subpage-shell {
  padding-top: 0;
}

.settings-section-card {
  overflow: hidden;
  position: relative;
}

.settings-page-cat {
  position: absolute;
  right: 18px;
  top: -8px;
  width: 106px;
  height: 88px;
  opacity: 0.18;
  transform: rotate(7deg);
  pointer-events: none;
  z-index: 0;
}

.settings-card-cat {
  position: absolute;
  right: 16px;
  bottom: 10px;
  width: 52px;
  height: 44px;
  opacity: 0.24;
  transform: rotate(5deg);
  pointer-events: none;
}

.settings-card-cat.alt {
  top: 10px;
  bottom: auto;
  opacity: 0.28;
  transform: rotate(-5deg);
}

.settings-section-card > :not(.settings-card-cat) {
  position: relative;
  z-index: 1;
}

.setting-label-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.group-header-title {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 800;
  padding: 16px 16px 10px;
}

.danger-section-card {
  border: 1px solid rgba(255, 59, 48, 0.2);
}
</style>
