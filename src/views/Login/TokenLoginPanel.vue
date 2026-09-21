<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { readClipboardText } from '@/utils/recovery-access.js';

// 登录页的一次性令牌登录面板（管理员代发通道的入口）。
//
// 与 /reset-password 页共用同一验证路径：verifyOtp({ type:'recovery', token_hash })。
// 验证成功后跳转 /reset-password —— 该页检测到已有会话会直接显示密码表单，
// 引导用户顺手设置新密码（也可「暂不修改，直接进入」）。令牌本身即定位用户，
// 无需邮箱参与。
const router = useRouter();
const authStore = useAuthStore();

const token = ref('');
const errorMessage = ref('');
const isVerifying = ref(false);
const pasteHint = ref('');

const submitToken = async () => {
  errorMessage.value = '';
  pasteHint.value = '';
  const tokenHash = String(token.value || '').trim();
  if (!tokenHash) {
    errorMessage.value = '请粘贴管理员签发的一次性登录令牌。';
    return;
  }

  isVerifying.value = true;
  try {
    const result = await authStore.verifyPasswordRecovery(tokenHash);
    if (!result.success) {
      errorMessage.value = result.message || '令牌无效或已过期，请联系管理员重新签发。';
      return;
    }
    token.value = '';
    await router.replace('/reset-password');
  } catch (error) {
    errorMessage.value = error?.message || '验证令牌失败，请稍后重试。';
  } finally {
    isVerifying.value = false;
  }
};

// 一键粘贴：只填充输入框，**不自动验证** —— 令牌是一次性凭证，
// 自动验证会在用户点错/剪贴板内容过期时把令牌烧掉（烧了就得请管理员重签）。
const pasteToken = async () => {
  errorMessage.value = '';
  pasteHint.value = '';
  const text = await readClipboardText();
  if (!text) {
    pasteHint.value = '无法读取剪贴板，请手动粘贴（Ctrl/Cmd + V）。';
    return;
  }
  token.value = text;
};
</script>

<template>
  <div class="token-login-panel">
    <p class="token-login-title">持有一次性登录令牌？</p>
    <p class="token-login-desc">粘贴管理员签发的令牌直接登录，建议随后设置新密码。</p>
    <div class="token-input-row">
      <input v-model="token" type="text" placeholder="粘贴一次性登录令牌"
        autocomplete="one-time-code" spellcheck="false" :disabled="isVerifying" @keyup.enter="submitToken">
      <button type="button" class="token-paste-btn" :disabled="isVerifying"
        title="从剪贴板粘贴令牌" @click="pasteToken">粘贴</button>
    </div>
    <p v-if="errorMessage" class="token-login-error">{{ errorMessage }}</p>
    <p v-else-if="pasteHint" class="token-login-hint">{{ pasteHint }}</p>
    <button type="button" class="token-login-btn" :disabled="isVerifying" @click="submitToken">
      {{ isVerifying ? '验证中...' : '验证令牌并登录' }}
    </button>
  </div>
</template>

<style scoped>
/* 样式贴合登录页的胶囊/深色视觉（.boh-login-btn 同基调），自包含避免依赖父级 scoped 样式 */
.token-login-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 14px 0 4px;
  padding: 14px;
  border: 1px dashed rgba(29, 29, 31, 0.22);
  border-radius: 14px;
  background: rgba(29, 29, 31, 0.03);
}

.token-login-title {
  font-size: 14px;
  font-weight: 700;
  color: #1d1d1f;
}

.token-login-desc {
  font-size: 12px;
  color: #6e6e73;
}

.token-input-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.token-input-row input {
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  height: 42px;
  padding: 0 14px;
  border: 1px solid rgba(29, 29, 31, 0.16);
  border-radius: 99px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  color: #1d1d1f;
  background: #ffffff;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.token-input-row input::placeholder {
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
  color: #8b9098;
}

.token-input-row input:focus {
  border-color: #0071e3;
  box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.16);
}

.token-paste-btn {
  flex-shrink: 0;
  height: 42px;
  padding: 0 16px;
  border: 1px solid rgba(29, 29, 31, 0.16);
  border-radius: 99px;
  background: #ffffff;
  color: #1d1d1f;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.token-paste-btn:hover:not(:disabled) {
  border-color: #1d1d1f;
  background: rgba(29, 29, 31, 0.04);
}

.token-paste-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.token-login-error {
  font-size: 12px;
  color: #dc2626;
}

.token-login-hint {
  font-size: 12px;
  color: #6e6e73;
}

.token-login-btn {
  height: 40px;
  border: none;
  border-radius: 99px;
  background: #1d1d1f;
  color: #ffffff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.token-login-btn:hover:not(:disabled) {
  background: #000000;
  transform: translateY(-1px);
}

.token-login-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.token-login-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
