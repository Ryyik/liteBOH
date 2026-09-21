<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

// 登录页的一次性 token 登录面板（管理员代发通道的入口）。
//
// 与 /reset-password 页共用同一验证路径：verifyOtp({ type:'recovery', token_hash })。
// 验证成功后跳转 /reset-password —— 该页检测到已有会话会直接显示密码表单，
// 引导用户顺手设置新密码（也可「暂不修改，直接进入」）。token 本身即定位用户，
// 无需邮箱参与。
const router = useRouter();
const authStore = useAuthStore();

const token = ref('');
const errorMessage = ref('');
const isVerifying = ref(false);

const submitToken = async () => {
  errorMessage.value = '';
  const tokenHash = String(token.value || '').trim();
  if (!tokenHash) {
    errorMessage.value = '请粘贴管理员签发的一次性登录 token。';
    return;
  }

  isVerifying.value = true;
  try {
    const result = await authStore.verifyPasswordRecovery(tokenHash);
    if (!result.success) {
      errorMessage.value = result.message || 'token 无效或已过期，请联系管理员重新签发。';
      return;
    }
    token.value = '';
    await router.replace('/reset-password');
  } catch (error) {
    errorMessage.value = error?.message || '验证 token 失败，请稍后重试。';
  } finally {
    isVerifying.value = false;
  }
};
</script>

<template>
  <div class="token-login-panel">
    <p class="token-login-title">持有一次性登录 token？</p>
    <p class="token-login-desc">粘贴管理员签发的 token 直接登录，建议随后设置新密码。</p>
    <input v-model="token" type="text" placeholder="粘贴一次性登录 token"
      autocomplete="one-time-code" spellcheck="false" :disabled="isVerifying" @keyup.enter="submitToken">
    <p v-if="errorMessage" class="token-login-error">{{ errorMessage }}</p>
    <button type="button" class="token-login-btn" :disabled="isVerifying" @click="submitToken">
      {{ isVerifying ? '验证中...' : '验证 token 并登录' }}
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

.token-login-panel input {
  box-sizing: border-box;
  width: 100%;
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

.token-login-panel input::placeholder {
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
  color: #8b9098;
}

.token-login-panel input:focus {
  border-color: #0071e3;
  box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.16);
}

.token-login-error {
  font-size: 12px;
  color: #dc2626;
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
