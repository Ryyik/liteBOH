<template>
  <div class="pushplus-settings">
    <div class="settings-card">
      <!-- 头部区域 -->
      <div class="card-header">
        <div class="header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
        </div>
        <div class="header-content">
          <h3 class="settings-title">离线消息推送</h3>
          <p class="settings-desc">绑定 Pushplus，离线时通过微信接收通知</p>
        </div>
      </div>

      <!-- 状态卡片 -->
      <div v-if="hasToken" class="status-card" :class="{ active: enabled }">
        <div class="status-icon">
          {{ enabled ? '✅' : '⏸️' }}
        </div>
        <div class="status-content">
          <div class="status-title">{{ enabled ? '推送服务已启用' : '推送服务已暂停' }}</div>
          <div class="status-desc">{{ enabled ? '离线时将通过微信接收消息' : '已暂停离线推送功能' }}</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" v-model="enabled" @change="toggleEnabled" :disabled="isLoading" />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <!-- 引导关注公众号 -->
      <div v-if="!hasToken" class="guide-section">
        <div class="guide-card wechat-guide">
          <div class="guide-icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z" />
            </svg>
          </div>
          <div class="guide-content">
            <h4>一键关注服务号</h4>
            <p>关注后自动收到 Token，复制即可使用</p>
          </div>
          <button type="button" class="btn-wechat" @click="showWechatGuide">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M7 11v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3a4 4 0 0 0 4-4V6a2 2 0 0 1 4 0v5"></path>
              <path d="M7 11h10"></path>
              <path d="M17 11v8a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-3a4 4 0 0 1-4-4V6a2 2 0 0 0-4 0v5">
              </path>
            </svg>
            去关注
          </button>
        </div>

        <div class="divider">
          <span>或者</span>
        </div>
      </div>

      <!-- Token 输入区域 -->
      <div class="form-section">
        <div class="form-header">
          <label class="form-label">{{ hasToken ? 'Pushplus Token' : '手动输入 Token' }}</label>
          <a href="http://www.pushplus.plus/push1.html" target="_blank" class="help-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            {{ hasToken ? '如何获取？' : '查看教程' }}
          </a>
        </div>

        <div class="input-wrapper" :class="{ 'has-token': hasToken }">
          <div class="input-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <input v-model="tokenInput" type="text" :placeholder="hasToken ? '••••••••••••••••' : '请输入你的 Pushplus Token'"
            class="form-input" :disabled="isLoading" />
          <button v-if="canUseClipboard && !hasToken" @click="pasteToken" class="btn-paste" :disabled="isLoading"
            title="从剪贴板粘贴 Token">
            粘贴
          </button>
          <button v-if="hasToken" @click="clearToken" class="btn-clear" :disabled="isLoading" title="清除配置">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <p class="input-hint">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
          Token 仅保存在你的账户中，用于发送推送消息
        </p>
      </div>

      <!-- 操作按钮 -->
      <div class="actions">
        <button @click="saveToken" class="btn-primary"
          :disabled="isLoading || !tokenInput.trim() || tokenInput.includes('****')">
          <span v-if="isLoading" class="loading-spinner"></span>
          <template v-else>
            <svg v-if="hasToken" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            {{ hasToken ? '更新 Token' : '保存并验证' }}
          </template>
        </button>

        <button v-if="hasToken && enabled" @click="testPush" class="btn-secondary" :disabled="isLoading">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path
              d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z">
            </path>
          </svg>
          发送测试消息
        </button>
      </div>

      <!-- 消息提示 -->
      <transition name="fade">
        <div v-if="message" :class="['message', messageType]">
          <div class="message-icon">
            <svg v-if="messageType === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <svg v-else-if="messageType === 'error'" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </div>
          <span>{{ message }}</span>
        </div>
      </transition>

      <!-- 功能说明 -->
      <div class="info-section">
        <div class="info-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
          </svg>
          <span>支持的通知类型</span>
        </div>
        <ul class="feature-list">
          <li>帖子被点赞</li>
          <li>收到新评论</li>
          <li>收到新印象</li>
          <li>收到站内互动通知</li>
        </ul>
      </div>
    </div>

    <transition name="fade">
      <div v-if="showClearConfirm" class="confirm-overlay" @click.self="showClearConfirm = false">
        <div class="confirm-card">
          <div class="confirm-icon">!</div>
          <h4>清除 Pushplus 配置？</h4>
          <p>清除后将无法接收离线微信推送，可随时重新绑定 Token。</p>
          <div class="confirm-actions">
            <button type="button" class="confirm-cancel" @click="showClearConfirm = false">取消</button>
            <button type="button" class="confirm-danger" @click="confirmClearToken" :disabled="isLoading">
              {{ isLoading ? '清除中...' : '确认清除' }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import {
  getPushplusSettings,
  updatePushplusToken,
  togglePushplusEnabled,
  deletePushplusToken
} from '@/utils/api/pushplus-api.js';
import { sendPushplusMessage } from '@/utils/pushplus.js';

const authStore = useAuthStore();

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
});

onUnmounted(() => {
  clearTimeout(messageTimer);
});
</script>

<style scoped>
@import './style.scoped.css';
</style>
