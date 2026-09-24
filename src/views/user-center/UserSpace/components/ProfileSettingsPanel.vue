<template>
  <div key="profile-settings" class="profile-subpage-shell">
    <UserCenterPageHeader title="设置" back-label="返回我的" max-width="1200px" :show-back="showBack" @back="$emit('back')" />

    <div class="profile-subpage-body">
      <HomeCatMascot v-if="isHomeCatActive" class="settings-page-cat" pool="background"
        seed="settings-page" size="lg" decorative />

      <!-- 单一液态玻璃连续面板：分组内连续行 + 发丝线分隔（2026-09-09 重构） -->
      <div class="glass-settings">
        <!-- 账户 -->
        <section class="gs-group">
          <div class="gs-group-title">账户</div>
          <div class="gs-rows">
            <button type="button" class="gs-row" @click="copyEmail">
              <span class="gs-icon is-blue">
                <Mail :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
              <span class="gs-text">
                <span class="gs-label">绑定邮箱</span>
                <span class="gs-desc">{{ userEmail ? '用于登录与找回密码，点击复制' : '当前账号未绑定邮箱' }}</span>
              </span>
              <span class="gs-side">
                <span class="gs-value">{{ emailDisplayText }}</span>
              </span>
            </button>
          </div>
        </section>

        <!-- 外观与浏览 -->
        <section class="gs-group">
          <div class="gs-group-title">外观与浏览</div>
          <div class="gs-rows">
            <button type="button" class="gs-row" @click="$emit('open-theme')">
              <span class="gs-icon" :class="currentTheme === 'dark' ? 'is-purple' : 'is-yellow'">
                <Moon v-if="currentTheme === 'dark'" :size="16" :stroke-width="2" aria-hidden="true" />
                <Sun v-else :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
              <span class="gs-text">
                <span class="gs-label">主题设置</span>
                <span class="gs-desc">选择浅色、深色或跟随系统</span>
              </span>
              <span class="gs-side">
                <span class="gs-value">{{ themeDisplayText }}</span>
                <ChevronRight class="gs-chevron" :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
            </button>
            <button type="button" class="gs-row" @click="replayHomeGate">
              <span class="gs-icon is-blue">
                <RotateCcw :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
              <span class="gs-text">
                <span class="gs-label">重播首屏开场画</span>
                <span class="gs-desc">清除「已看过」标记，回到首屏再看一次</span>
              </span>
              <span class="gs-side">
                <ChevronRight class="gs-chevron" :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
            </button>
          </div>
        </section>

        <!-- 通用 -->
        <section class="gs-group">
          <div class="gs-group-title">通用</div>
          <div class="gs-rows">
            <button type="button" class="gs-row" @click="$emit('open-version-settings')">
              <span class="gs-icon is-blue">
                <Info :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
              <span class="gs-text">
                <span class="gs-label">版本</span>
                <span class="gs-desc">查看当前版本与 Beta 6 介绍</span>
              </span>
              <span class="gs-side">
                <span class="gs-value">Beta 6</span>
                <ChevronRight class="gs-chevron" :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
            </button>
          </div>
        </section>

        <!-- Cloud+ -->
        <section class="gs-group">
          <div class="gs-group-title">Cloud+</div>
          <div class="gs-rows">
            <button type="button" class="gs-row" @click="$emit('open-cloud', 'settings')">
              <span class="gs-icon is-teal">
                <MessagesSquare :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
              <span class="gs-text">
                <span class="gs-label">Cloud+ 页面</span>
                <span class="gs-desc">进入完整 Cloud+ 设置与管理页面</span>
              </span>
              <span class="gs-side">
                <span class="gs-value">{{ cloudPlusUsageText }}</span>
                <ChevronRight class="gs-chevron" :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
            </button>
          </div>
        </section>

        <!-- 账户与安全 -->
        <section class="gs-group">
          <div class="gs-group-title">账户与安全</div>
          <div class="gs-rows">
            <button type="button" class="gs-row" @click="$emit('open-security')">
              <span class="gs-icon is-blue">
                <Shield :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
              <span class="gs-text">
                <span class="gs-label">账户安全</span>
                <span class="gs-desc">修改密码、管理登录安全</span>
              </span>
              <span class="gs-side">
                <span class="gs-value">密码与账号</span>
                <ChevronRight class="gs-chevron" :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
            </button>
          </div>
        </section>

        <!-- 通知 -->
        <section class="gs-group">
          <div class="gs-group-title">通知</div>
          <div class="gs-rows">
            <button type="button" class="gs-row" @click="$emit('open-pushplus')">
              <span class="gs-icon is-blue">
                <Bell :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
              <span class="gs-text">
                <span class="gs-label">Pushplus 推送</span>
                <span class="gs-desc">离线时通过微信接收消息</span>
              </span>
              <span class="gs-side">
                <span class="gs-value">{{ pushplusStatusText }}</span>
                <ChevronRight class="gs-chevron" :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
            </button>
          </div>
        </section>

        <!-- 数据与隐私 -->
        <section class="gs-group">
          <div class="gs-group-title">数据与隐私</div>
          <div class="gs-rows">
            <button type="button" class="gs-row" @click="$emit('toggle-hide-online')">
              <span class="gs-icon is-indigo">
                <EyeOff :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
              <span class="gs-text">
                <span class="gs-label">隐藏在线状态</span>
                <span class="gs-desc">开启后，他人将看不到你的在线状态，你也无法查看他人的在线状态</span>
              </span>
              <span class="gs-side">
                <SettingToggle :model-value="hideOnlineStatus" label="隐藏在线状态"
                  @update:model-value="$emit('toggle-hide-online')" />
              </span>
            </button>
            <button type="button" class="gs-row" @click="$emit('toggle-hide-follow-data')">
              <span class="gs-icon is-indigo">
                <Users :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
              <span class="gs-text">
                <span class="gs-label">隐藏关注数据</span>
                <span class="gs-desc">开启后，他人在你主页看不到你的详细关注列表和粉丝列表，但仍能看到数量</span>
              </span>
              <span class="gs-side">
                <SettingToggle :model-value="hideFollowData" label="隐藏关注数据"
                  @update:model-value="$emit('toggle-hide-follow-data')" />
              </span>
            </button>
            <button type="button" class="gs-row" @click="$emit('open-data-management')">
              <span class="gs-icon is-indigo">
                <Database :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
              <span class="gs-text">
                <span class="gs-label">数据与隐私</span>
                <span class="gs-desc">公共记忆与管理工具</span>
              </span>
              <span class="gs-side">
                <span class="gs-value">{{ dataPrivacyStatusText }}</span>
                <ChevronRight class="gs-chevron" :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
            </button>
            <button type="button" class="gs-row" @click="$emit('open-data-export')">
              <span class="gs-icon is-indigo">
                <Archive :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
              <span class="gs-text">
                <span class="gs-label">导出我的数据</span>
                <span class="gs-desc">打包个人资料、帖子、云空间等为 ZIP 下载</span>
              </span>
              <span class="gs-side">
                <span class="gs-value">ZIP 打包</span>
                <ChevronRight class="gs-chevron" :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
            </button>
          </div>
        </section>

        <!-- 危险操作 -->
        <section class="gs-group gs-danger">
          <div class="gs-rows">
            <button type="button" class="gs-row" @click="$emit('logout')">
              <span class="gs-icon is-red">
                <LogOut :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
              <span class="gs-text">
                <span class="gs-label gs-label-danger">退出登录</span>
              </span>
              <span class="gs-side">
                <ChevronRight class="gs-chevron gs-chevron-danger" :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
            </button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import HomeCatMascot from '@/components/HomeCatMascot.vue';
import { Archive, Bell, ChevronRight, Database, EyeOff, Info, LogOut, Mail, MessagesSquare, Moon, RotateCcw, Shield, Sun, Users } from 'lucide-vue-next';

/* 重播首屏开场画（2026-09-24）：清除「已看过」标记并整页回首页。
   ⚠️ 标记 key 带构建指纹（boh-home-gate-passed:<build-id>，生产构建注入），必须前缀匹配清除；
   2026-09-24 晚：标记迁到 localStorage（24h 时间窗），同时兜底清一遍 sessionStorage 旧值；
   必须用 location.reload 而不是路由跳转 —— Home 组件要重新挂载才会重播开场画。 */
const replayHomeGate = () => {
  const collectPrefixKeys = (storage) => {
    const keys = [];
    try {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key && key.startsWith('boh-home-gate-passed')) keys.push(key);
      }
    } catch { /* ignore */ }
    return keys;
  };
  try {
    collectPrefixKeys(localStorage).forEach((key) => localStorage.removeItem(key));
    collectPrefixKeys(sessionStorage).forEach((key) => sessionStorage.removeItem(key));
  } catch {
    /* storage 不可用时忽略 —— reload 后开场画由既有降级链决定 */
  }
  window.location.hash = '#/';
  window.location.reload();
};
import SettingToggle from './SettingToggle.vue';

const props = defineProps({
  showBack: {
    type: Boolean,
    default: true
  },
  userEmail: {
    type: String,
    default: ''
  },
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
  'open-version-settings',
  'open-data',
  'open-data-management',
  'open-data-export',
  'logout',
  'toggle-hide-online',
  'toggle-hide-follow-data'
]);

/* ---------- 绑定邮箱（点击复制） ---------- */
const emailCopied = ref(false);
let emailCopyTimer = null;

const emailDisplayText = computed(() => {
  if (emailCopied.value) return '已复制';
  return props.userEmail || '未绑定';
});

const copyEmail = async () => {
  const email = String(props.userEmail || '').trim();
  if (!email) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(email);
    } else {
      const ta = document.createElement('textarea');
      ta.value = email;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    emailCopied.value = true;
    clearTimeout(emailCopyTimer);
    emailCopyTimer = setTimeout(() => {
      emailCopied.value = false;
    }, 1600);
  } catch (_error) {
    /* 复制失败静默：邮箱仍完整展示在值区 */
  }
};
</script>

<style scoped>
@import '../styles/settings-glass.css';

.profile-subpage-shell {
  padding-top: 0;
}

/* 猫咪彩蛋（保留） */
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
</style>
