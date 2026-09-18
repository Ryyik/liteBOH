<template>
  <div class="pushplus-settings">
    <!-- 单一液态玻璃连续面板（与设置主页同一设计体系，2026-09-09） -->
    <div class="glass-settings">
      <!-- 应用内通知（Web Push）：无需第三方账号，是主通道 -->
      <section class="gs-group">
        <div class="gs-group-title">应用内通知</div>
        <div class="gs-rows">
          <div v-if="!pushLoaded" class="gs-row is-static">
            <span class="gs-icon is-blue">
              <Bell :size="16" :stroke-width="2" aria-hidden="true" />
            </span>
            <span class="gs-text">
              <span class="gs-label">正在检查当前环境…</span>
            </span>
          </div>

          <div v-else-if="!pushStatus.supported" class="gs-row is-static">
            <span class="gs-icon is-yellow">
              <BellOff :size="16" :stroke-width="2" aria-hidden="true" />
            </span>
            <span class="gs-text">
              <span class="gs-label">当前环境不可用</span>
              <span class="gs-desc">{{ pushStatus.reason }}</span>
            </span>
          </div>

          <template v-else>
            <div class="gs-row">
              <span class="gs-icon" :class="pushEnabled ? 'is-green' : 'is-blue'">
                <BellRing v-if="pushEnabled" :size="16" :stroke-width="2" aria-hidden="true" />
                <Bell v-else :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
              <span class="gs-text">
                <span class="gs-label">{{ pushEnabled ? '通知已开启' : '开启浏览器通知' }}</span>
                <span class="gs-desc">{{ pushEnabled ? '有新消息时在设备上提醒你' : pushHint }}</span>
              </span>
              <span class="gs-side">
                <SettingToggle :model-value="pushEnabled" :disabled="isPushBusy || !pushStatus.configured"
                  label="应用内通知" @update:model-value="handlePushToggle" />
              </span>
            </div>

            <div v-if="pushEnabled" class="gs-row is-static">
              <span class="gs-icon is-purple">
                <Smartphone :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
              <span class="gs-text">
                <span class="gs-label">图标角标</span>
                <span class="gs-desc">{{ pushBadgeHint }}</span>
              </span>
            </div>
          </template>

          <div v-if="pushLoaded && pushStatus.supported && pushEnabled" class="pp-form">
            <div class="gs-actions">
              <button class="gs-btn ghost" :disabled="isPushBusy" @click="testWebPush">
                <span v-if="isPushBusy" class="gs-spinner"></span>
                <template v-else>发送测试通知</template>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- 推送状态 -->
      <section class="gs-group">
        <div class="gs-group-title">推送状态</div>
        <div class="gs-rows">
          <div class="gs-row is-static">
            <span class="gs-icon is-blue">
              <Bell :size="16" :stroke-width="2" aria-hidden="true" />
            </span>
            <span class="gs-text">
              <span class="gs-label">离线消息推送</span>
              <span class="gs-desc">绑定 Pushplus，离线时通过微信接收通知</span>
            </span>
          </div>

          <div v-if="hasToken" class="gs-row">
            <span class="gs-icon" :class="enabled ? 'is-green' : 'is-yellow'">
              <BellRing v-if="enabled" :size="16" :stroke-width="2" aria-hidden="true" />
              <BellOff v-else :size="16" :stroke-width="2" aria-hidden="true" />
            </span>
            <span class="gs-text">
              <span class="gs-label">{{ enabled ? '推送服务已启用' : '推送服务已暂停' }}</span>
              <span class="gs-desc">{{ enabled ? '离线时将通过微信接收消息' : '已暂停离线推送功能' }}</span>
            </span>
            <span class="gs-side">
              <SettingToggle :model-value="enabled" :disabled="isLoading" label="离线消息推送"
                @update:model-value="handleToggleUpdate" />
            </span>
          </div>
        </div>
      </section>

      <!-- 绑定 Token -->
      <section class="gs-group">
        <div class="gs-group-title">Pushplus Token</div>
        <div class="gs-rows">
          <div v-if="!hasToken" class="gs-row">
            <span class="gs-icon is-green">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path
                  d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z" />
              </svg>
            </span>
            <span class="gs-text">
              <span class="gs-label">一键关注服务号</span>
              <span class="gs-desc">关注后自动收到 Token，复制即可使用</span>
            </span>
            <span class="gs-side">
              <button type="button" class="pp-follow-btn" @click="showWechatGuide">
                <HeartHandshake :size="15" :stroke-width="2" aria-hidden="true" />
                去关注
              </button>
            </span>
          </div>

          <div class="pp-form">
            <div class="pp-form-head">
              <label class="gs-field-label" for="pp-token-input">{{ hasToken ? '当前 Token' : '手动输入 Token' }}</label>
              <a href="http://www.pushplus.plus/push1.html" target="_blank" rel="noopener noreferrer" class="pp-help-link">
                <HelpCircle :size="14" :stroke-width="2" aria-hidden="true" />
                {{ hasToken ? '如何获取？' : '查看教程' }}
              </a>
            </div>

            <div class="gs-input-wrap" :class="{ 'has-token': hasToken }">
              <span class="gs-input-icon">
                <Lock :size="15" :stroke-width="2" aria-hidden="true" />
              </span>
              <input id="pp-token-input" v-model="tokenInput" type="text"
                :placeholder="hasToken ? '••••••••••••••••' : '请输入你的 Pushplus Token'" class="gs-input"
                :disabled="isLoading" autocomplete="off" spellcheck="false">
              <button v-if="canUseClipboard && !hasToken" class="gs-input-action" :disabled="isLoading"
                title="从剪贴板粘贴 Token" @click="pasteToken">
                粘贴
              </button>
              <button v-if="hasToken" class="gs-input-action is-clear" :disabled="isLoading" title="清除配置"
                @click="clearToken">
                清除
              </button>
            </div>

            <p class="gs-hint">
              <Shield :size="13" :stroke-width="2" aria-hidden="true" />
              Token 仅保存在你的账户中，用于发送推送消息
            </p>

            <div class="gs-actions">
              <button class="gs-btn primary" :disabled="isLoading || !tokenInput.trim() || tokenInput.includes('****')"
                @click="saveToken">
                <span v-if="isLoading" class="gs-spinner"></span>
                <template v-else>{{ hasToken ? '更新 Token' : '保存并验证' }}</template>
              </button>

              <button v-if="hasToken && enabled" class="gs-btn ghost" :disabled="isLoading" @click="testPush">
                发送测试消息
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- 支持的通知类型 -->
      <section class="gs-group">
        <div class="gs-group-title">支持的通知类型</div>
        <div class="gs-rows">
          <div v-for="item in NOTIFY_TYPES" :key="item.label" class="gs-row is-static">
            <span class="gs-icon" :class="item.tone">
              <component :is="item.icon" :size="16" :stroke-width="2" aria-hidden="true" />
            </span>
            <span class="gs-text">
              <span class="gs-label">{{ item.label }}</span>
            </span>
          </div>
        </div>
      </section>

      <!-- 消息横幅 -->
      <transition name="pp-fade">
        <section v-if="message" class="gs-group">
          <div class="pp-banner-wrap">
            <div class="gs-banner" :class="messageType">
              <CheckCircle2 v-if="messageType === 'success'" :size="16" :stroke-width="2" aria-hidden="true" />
              <AlertCircle v-else-if="messageType === 'error'" :size="16" :stroke-width="2" aria-hidden="true" />
              <Info v-else :size="16" :stroke-width="2" aria-hidden="true" />
              <span>{{ message }}</span>
            </div>
          </div>
        </section>
      </transition>
    </div>

    <!-- 清除确认弹层 -->
    <transition name="pp-fade">
      <div v-if="showClearConfirm" class="pp-confirm-overlay" @click.self="showClearConfirm = false">
        <div class="pp-confirm-card">
          <div class="pp-confirm-icon">!</div>
          <h4>清除 Pushplus 配置？</h4>
          <p>清除后将无法接收离线微信推送，可随时重新绑定 Token。</p>
          <div class="pp-confirm-actions">
            <button type="button" class="gs-btn ghost pp-confirm-btn" @click="showClearConfirm = false">取消</button>
            <button type="button" class="gs-btn danger pp-confirm-btn" :disabled="isLoading" @click="confirmClearToken">
              {{ isLoading ? '清除中...' : '确认清除' }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, markRaw } from 'vue';
import { AlertCircle, Bell, BellOff, BellRing, CheckCircle2, HelpCircle, Heart, HeartHandshake, Inbox, Info, Lock, MessageCircle, Shield, Smartphone, Sparkles } from 'lucide-vue-next';
import SettingToggle from '@/views/user-center/UserSpace/components/SettingToggle.vue';
import { useAuthStore } from '@/stores/auth';
import {
  getPushplusSettings,
  updatePushplusToken,
  togglePushplusEnabled,
  deletePushplusToken
} from '@/utils/api/pushplus-api.js';
import { sendPushplusMessage } from '@/utils/pushplus.js';
import {
  getPushStatus,
  enablePush,
  disablePush,
  sendTestPush
} from '@/utils/api/push-api.js';

const authStore = useAuthStore();

const NOTIFY_TYPES = [
  { label: '帖子被点赞', icon: markRaw(Heart), tone: 'is-red' },
  { label: '收到新评论', icon: markRaw(MessageCircle), tone: 'is-blue' },
  { label: '收到新印象', icon: markRaw(Sparkles), tone: 'is-purple' },
  { label: '收到站内互动通知', icon: markRaw(Inbox), tone: 'is-indigo' }
];

const tokenInput = ref('');
const hasToken = ref(false);
const enabled = ref(false);
const isLoading = ref(false);
const message = ref('');
const messageType = ref('');
const originalToken = ref('');
const canUseClipboard = ref(false);
const showClearConfirm = ref(false);
let messageTimer = null;

// ---------- 应用内通知（Web Push）----------
// 与 Pushplus 是两条独立通道：这条不需要任何第三方账号，权限由浏览器授予。
const isPushBusy = ref(false);
// 加载位：能力检测是同步的，但「服务端是否已配置」要等一次网络请求，
// 不加这个位首帧会把「还没查完」误画成「当前环境不可用」
const pushLoaded = ref(false);
const pushStatus = ref({
  supported: false,
  reason: '',
  configured: false,
  permission: 'default',
  enabled: false,
  endpoint: ''
});
const pushEnabled = computed(() => Boolean(pushStatus.value.enabled));

const pushHint = computed(() => {
  const status = pushStatus.value;
  if (!status.configured) return '服务端尚未开启推送功能';
  if (status.permission === 'denied') return '通知权限已被浏览器拒绝，需在网站设置里允许';
  return '有新消息时在设备上弹出提醒';
});

// 安卓拿不到数字角标（Chrome for Android 不支持 setAppBadge），如实说明，避免被当成 bug
const pushBadgeHint = computed(() => {
  const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
  if (/Android/i.test(ua)) return '安卓由系统在有用未读通知时点亮圆点，不显示数字';
  return '未读数量会显示在应用图标上';
});

const loadPushStatus = async () => {
  if (!authStore.userInfo?.id) {
    pushLoaded.value = true;
    return;
  }
  try {
    pushStatus.value = await getPushStatus(authStore.userInfo.id);
  } catch (_error) {
    // 状态读取失败不该影响设置页其它功能
  } finally {
    pushLoaded.value = true;
  }
};

const handlePushToggle = async (value) => {
  if (isPushBusy.value) return;
  const userId = authStore.userInfo?.id;
  if (!userId) {
    showMessage('请先登录', 'error');
    return;
  }

  isPushBusy.value = true;
  try {
    const result = value ? await enablePush(userId) : await disablePush(userId);
    showMessage(result.message, result.success ? 'success' : 'error');
  } finally {
    isPushBusy.value = false;
    await loadPushStatus();
  }
};

const testWebPush = async () => {
  isPushBusy.value = true;
  try {
    const result = await sendTestPush();
    showMessage(result.ok ? '测试通知已发送，请查看设备通知' : (result.message || '发送失败'), result.ok ? 'success' : 'error');
  } catch (error) {
    showMessage(error?.message || '发送失败', 'error');
  } finally {
    isPushBusy.value = false;
  }
};

const showMessage = (msg, type = 'info') => {
  message.value = msg;
  messageType.value = type;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => {
    message.value = '';
  }, 5000);
};

const showWechatGuide = () => {
  const userAgent = navigator.userAgent || '';
  const isMobile = /MicroMessenger|Android|iPhone|iPad|iPod/i.test(userAgent);
  if (isMobile) {
    window.location.href = 'weixin://dl/officialaccounts?search=Pushplus';
    showMessage('已尝试打开微信。关注 Pushplus 后复制收到的 Token，再回到这里粘贴。', 'info');
    return;
  }
  window.open('http://www.pushplus.plus/push1.html', '_blank', 'noopener,noreferrer');
  showMessage('桌面端请在打开的教程页扫码关注 Pushplus，复制收到的 Token 后粘贴到这里。', 'info');
};

const pasteToken = async () => {
  if (!navigator.clipboard?.readText) {
    showMessage('当前浏览器不支持读取剪贴板，请手动粘贴 Token', 'info');
    return;
  }
  try {
    const text = await navigator.clipboard.readText();
    const token = String(text || '').trim();
    if (!token) {
      showMessage('剪贴板里没有可用内容', 'info');
      return;
    }
    tokenInput.value = token;
    showMessage('已从剪贴板粘贴 Token', 'success');
  } catch (_error) {
    showMessage('无法读取剪贴板，请手动粘贴 Token', 'error');
  }
};

const loadSettings = async () => {
  if (!authStore.userInfo?.id) return;

  isLoading.value = true;
  try {
    const { data, error } = await getPushplusSettings(authStore.userInfo.id);
    if (error) {
      showMessage('加载设置失败：' + error.message, 'error');
      return;
    }

    originalToken.value = data.token || '';
    tokenInput.value = data.token ? maskToken(data.token) : '';
    hasToken.value = !!data.token;
    enabled.value = data.enabled;
  } finally {
    isLoading.value = false;
  }
};

const maskToken = (token) => {
  if (token.length <= 8) return token;
  return token.substring(0, 4) + '****' + token.substring(token.length - 4);
};

const saveToken = async () => {
  if (!authStore.userInfo?.id) {
    showMessage('请先登录', 'error');
    return;
  }

  const token = tokenInput.value.trim();
  if (!token || token.length < 10) {
    showMessage('请输入有效的 Token', 'error');
    return;
  }

  if (token.includes('****')) {
    showMessage('Token 未修改', 'info');
    return;
  }

  isLoading.value = true;
  try {
    const result = await updatePushplusToken(authStore.userInfo.id, token);
    if (result.success) {
      showMessage(result.message, 'success');
      hasToken.value = true;
      enabled.value = true;
      originalToken.value = token;
      tokenInput.value = maskToken(token);
    } else {
      showMessage(result.message, 'error');
    }
  } finally {
    isLoading.value = false;
  }
};

const clearToken = async () => {
  if (!authStore.userInfo?.id) return;

  showClearConfirm.value = true;
};

const confirmClearToken = async () => {
  if (!authStore.userInfo?.id) return;
  isLoading.value = true;
  try {
    const result = await deletePushplusToken(authStore.userInfo.id);
    if (result.success) {
      showMessage(result.message, 'success');
      tokenInput.value = '';
      hasToken.value = false;
      enabled.value = false;
      showClearConfirm.value = false;
    } else {
      showMessage(result.message, 'error');
    }
  } finally {
    isLoading.value = false;
  }
};

const handleToggleUpdate = (value) => {
  enabled.value = Boolean(value);
  toggleEnabled();
};

const toggleEnabled = async () => {
  if (!authStore.userInfo?.id) return;

  isLoading.value = true;
  try {
    const result = await togglePushplusEnabled(authStore.userInfo.id, enabled.value);
    if (result.success) {
      showMessage(result.message, 'success');
    } else {
      showMessage(result.message, 'error');
      enabled.value = !enabled.value;
    }
  } finally {
    isLoading.value = false;
  }
};

const testPush = async () => {
  if (!authStore.userInfo?.id) return;

  isLoading.value = true;
  try {
    const result = await sendPushplusMessage(
      originalToken.value,
      '🔔 方块之家 - 测试消息',
      '<div style="padding: 20px; text-align: center;"><h3>✅ 测试成功！</h3><p>您的离线推送功能正常工作。</p></div>',
      'html'
    );

    if (result.success) {
      showMessage('测试消息已发送，请检查微信', 'success');
    } else {
      showMessage('发送失败：' + result.message, 'error');
    }
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  canUseClipboard.value = Boolean(navigator.clipboard?.readText);
  loadSettings();
  loadPushStatus();
});

onUnmounted(() => {
  clearTimeout(messageTimer);
});
</script>

<style scoped>
@import '../../views/user-center/UserSpace/styles/settings-glass.css';

.pushplus-settings {
  width: 100%;
}

/* ---------- 表单块 ---------- */
.pp-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 18px 16px;
}

.pp-form-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pp-help-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #0071e3;
  text-decoration: none;
  transition: color 0.15s ease;
}

.pp-help-link:hover {
  color: #0051bb;
  text-decoration: underline;
}

/* 已绑定态的输入框着色 */
.gs-input-wrap.has-token {
  background: rgba(52, 199, 89, 0.08);
  border-color: rgba(52, 199, 89, 0.25);
}

.gs-input-wrap.has-token .gs-input {
  letter-spacing: 0.04em;
}

.gs-input-action.is-clear {
  background: rgba(255, 59, 48, 0.1);
  color: #e02d24;
}

.gs-input-action.is-clear:hover:not(:disabled) {
  background: rgba(255, 59, 48, 0.18);
}

/* ---------- 微信关注按钮 ---------- */
.pp-follow-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 8px 14px;
  border: 0;
  border-radius: 11px;
  background: #07c160;
  color: #fff;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease, transform 0.1s ease;
}

.pp-follow-btn:hover {
  background: #06ad56;
}

.pp-follow-btn:active {
  transform: scale(0.97);
}

/* ---------- 消息横幅 ---------- */
.pp-banner-wrap {
  padding: 14px 18px;
}

/* ---------- 确认弹层 ---------- */
.pp-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 210000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.38);
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
}

.pp-confirm-card {
  width: 100%;
  max-width: 360px;
  padding: 28px 24px 24px;
  border-radius: var(--liquid-radius-md);
  background: var(--liquid-bg-strong);
  backdrop-filter: var(--liquid-filter);
  -webkit-backdrop-filter: var(--liquid-filter);
  border: 1px solid var(--liquid-border);
  box-shadow: var(--liquid-shadow-overlay), var(--liquid-highlight);
  text-align: center;
}

.pp-confirm-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 14px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 59, 48, 0.12);
  color: #ff3b30;
  font-size: 24px;
  font-weight: 800;
}

.pp-confirm-card h4 {
  margin: 0 0 8px;
  color: var(--liquid-text-primary, #1d1d1f);
  font-size: 17px;
  font-weight: 700;
}

.pp-confirm-card p {
  margin: 0;
  color: var(--liquid-text-secondary, #6e6e73);
  font-size: 14px;
  line-height: 1.55;
}

.pp-confirm-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 22px;
}

.pp-confirm-btn {
  min-height: 42px;
  padding: 9px 14px;
  font-size: 14px;
}

/* ---------- 过渡 ---------- */
.pp-fade-enter-active,
.pp-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.pp-fade-enter-from,
.pp-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* ---------- 暗色补充 ---------- */
[data-theme="dark"] .pp-help-link {
  color: #2997ff;
}

[data-theme="dark"] .pp-help-link:hover {
  color: #66b5ff;
}

[data-theme="dark"] .gs-input-wrap.has-token {
  background: rgba(48, 209, 88, 0.1);
  border-color: rgba(48, 209, 88, 0.3);
}

[data-theme="dark"] .gs-input-action.is-clear {
  background: rgba(255, 105, 97, 0.14);
  color: #ff8b85;
}

[data-theme="dark"] .pp-confirm-icon {
  background: rgba(255, 105, 97, 0.16);
  color: #ff6961;
}

[data-theme="dark"] .pp-confirm-card h4 {
  color: #f4f6f8;
}

[data-theme="dark"] .pp-confirm-card p {
  color: #a7afba;
}

/* ---------- 手机横屏 ---------- */
@media (orientation: landscape) and (max-height: 520px) {
  .pp-form {
    padding: 10px 16px 12px;
    gap: 8px;
  }

  .pp-banner-wrap {
    padding: 10px 16px;
  }

  .pp-follow-btn {
    min-height: 32px;
    padding: 6px 12px;
    font-size: 12px;
  }
}
</style>
