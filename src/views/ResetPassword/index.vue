<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { supabase } from '@/utils/supabase-client.js';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const newPassword = ref('');
const confirmPassword = ref('');
const errorMessage = ref('');
const successMessage = ref('');
const isPreparing = ref(true);
const isSubmitting = ref(false);
const isReady = ref(false);
const LOCK_ERROR_HINT = '检测到浏览器多标签会话冲突，请先关闭其他 Block of Home 标签页，再重新点击最新重置链接。';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getErrorMessage = (errorLike) => {
  if (!errorLike) return '';
  if (typeof errorLike === 'string') return errorLike;
  if (typeof errorLike.message === 'string') return errorLike.message;
  return String(errorLike);
};

const isSessionLockError = (errorLike) => {
  const message = getErrorMessage(errorLike).toLowerCase();
  return (
    message.includes('lock broken by another request') ||
    message.includes('steal option') ||
    message.includes('navigatorlockacquiretimeout')
  );
};

const toFriendlyRecoveryError = (errorLike, fallbackMessage) => {
  if (isSessionLockError(errorLike)) {
    return LOCK_ERROR_HINT;
  }
  const message = getErrorMessage(errorLike);
  return message || fallbackMessage;
};

async function runAuthActionWithRetry(action, options = {}) {
  const retries = Number.isFinite(options.retries) ? Math.max(0, Math.trunc(options.retries)) : 3;
  const delayMs = Number.isFinite(options.delayMs) ? Math.max(80, Math.trunc(options.delayMs)) : 180;
  let lastThrownError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const result = await action();
      if (result?.error && isSessionLockError(result.error) && attempt < retries) {
        await sleep(delayMs * (attempt + 1));
        continue;
      }
      return result;
    } catch (error) {
      lastThrownError = error;
      if (isSessionLockError(error) && attempt < retries) {
        await sleep(delayMs * (attempt + 1));
        continue;
      }
      throw error;
    }
  }

  if (lastThrownError) {
    throw lastThrownError;
  }

  return {
    data: null,
    error: new Error('Auth action failed')
  };
}

function readRecoveryParams() {
  const routeQueryTokenHash = String(route.query.token_hash || '').trim();
  const routeQueryError = String(route.query.error_description || '').trim();
  const routeQueryCode = String(route.query.code || '').trim();

  let tokenHash = routeQueryTokenHash;
  let errorDescription = routeQueryError;
  let accessToken = '';
  let refreshToken = '';
  let authCode = routeQueryCode;

  const searchParams = new URLSearchParams(window.location.search || '');
  if (!tokenHash) tokenHash = String(searchParams.get('token_hash') || '').trim();
  if (!errorDescription) errorDescription = String(searchParams.get('error_description') || '').trim();
  if (!accessToken) accessToken = String(searchParams.get('access_token') || '').trim();
  if (!refreshToken) refreshToken = String(searchParams.get('refresh_token') || '').trim();
  if (!authCode) authCode = String(searchParams.get('code') || '').trim();

  const hash = String(window.location.hash || '');
  const hashSegments = hash.split('#').filter(Boolean);
  for (const segment of hashSegments) {
    const segmentText = String(segment || '').trim();
    if (!segmentText) continue;

    const queryIndex = segmentText.indexOf('?');
    const maybeQuery = queryIndex >= 0 ? segmentText.slice(queryIndex + 1) : segmentText;
    const params = new URLSearchParams(maybeQuery);
    if (!tokenHash) tokenHash = String(params.get('token_hash') || '').trim();
    if (!errorDescription) errorDescription = String(params.get('error_description') || '').trim();
    if (!accessToken) accessToken = String(params.get('access_token') || '').trim();
    if (!refreshToken) refreshToken = String(params.get('refresh_token') || '').trim();
    if (!authCode) authCode = String(params.get('code') || '').trim();
  }

  return { tokenHash, errorDescription, accessToken, refreshToken, authCode };
}

async function waitForSession(timeoutMs = 5000) {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    try {
      const { data: { session } } = await runAuthActionWithRetry(
        () => supabase.auth.getSession(),
        { retries: 1, delayMs: 120 }
      );
      if (session) return session;
    } catch (error) {
      if (!isSessionLockError(error)) {
        throw error;
      }
    }
    await sleep(250);
  }
  return null;
}

const initRecovery = async () => {
  try {
    errorMessage.value = '';
    successMessage.value = '';

    const { tokenHash, errorDescription, accessToken, refreshToken, authCode } = readRecoveryParams();
    if (errorDescription) {
      errorMessage.value = decodeURIComponent(errorDescription);
      return;
    }

    // 优先等待 Supabase 自动处理回调，减少与 SDK 内部流程并发抢锁的概率
    const existingSession = await waitForSession(1600);
    if (existingSession?.user) {
      await authStore.updateLocalState(existingSession.user, { force: true });
      isReady.value = true;
      if (typeof window !== 'undefined' && typeof window.history?.replaceState === 'function') {
        window.history.replaceState({}, document.title, `${window.location.origin}/#/reset-password`);
      }
      return;
    }

    let recoveredByLinkParams = false;
    if (accessToken && refreshToken) {
      const { error: setSessionError } = await runAuthActionWithRetry(
        () => supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        }),
        { retries: 4, delayMs: 180 }
      );
      if (setSessionError) {
        errorMessage.value = toFriendlyRecoveryError(setSessionError, '恢复会话失败，请重新申请重置链接。');
        return;
      }
      recoveredByLinkParams = true;
    } else if (authCode) {
      const { error: exchangeError } = await runAuthActionWithRetry(
        () => supabase.auth.exchangeCodeForSession(authCode),
        { retries: 4, delayMs: 180 }
      );
      if (exchangeError) {
        errorMessage.value = toFriendlyRecoveryError(exchangeError, '恢复会话失败，请重新申请重置链接。');
        return;
      }
      recoveredByLinkParams = true;
    } else if (tokenHash) {
      const verifyResult = await authStore.verifyPasswordRecovery(tokenHash);
      if (!verifyResult.success) {
        errorMessage.value = toFriendlyRecoveryError(verifyResult.message, '重置链接无效或已过期，请重新申请。');
        return;
      }
      recoveredByLinkParams = true;
    }

    const session = await waitForSession();
    if (!session?.user) {
      errorMessage.value = recoveredByLinkParams
        ? '恢复会话失败，请重新申请并点击最新的重置邮件链接。'
        : '未检测到有效的重置会话，请重新点击邮件中的链接。';
      return;
    }

    await authStore.updateLocalState(session.user, { force: true });
    isReady.value = true;
    if (typeof window !== 'undefined' && typeof window.history?.replaceState === 'function') {
      window.history.replaceState({}, document.title, `${window.location.origin}/#/reset-password`);
    }
  } catch (error) {
    errorMessage.value = toFriendlyRecoveryError(error, '初始化重置流程失败，请稍后重试。');
  } finally {
    isPreparing.value = false;
  }
};

const handleSubmit = async () => {
  errorMessage.value = '';
  successMessage.value = '';

  const password = String(newPassword.value || '');
  const confirmedPassword = String(confirmPassword.value || '');

  if (password.length < 6) {
    errorMessage.value = '新密码长度至少为 6 位。';
    return;
  }

  if (password !== confirmedPassword) {
    errorMessage.value = '两次输入的密码不一致。';
    return;
  }

  isSubmitting.value = true;
  try {
    const result = await authStore.updatePassword(password);
    if (!result.success) {
      errorMessage.value = result.message || '更新密码失败，请稍后再试。';
      return;
    }

    successMessage.value = '密码重置成功，请使用新密码重新登录。';
    await authStore.logout();

    setTimeout(() => {
      router.replace('/login');
    }, 1200);
  } finally {
    isSubmitting.value = false;
  }
};

onMounted(() => {
  void initRecovery();
});
</script>

<template>
  <div class="reset-page">
    <div class="reset-card">
      <h1>重置密码</h1>
      <p class="desc">请设置一个新的登录密码。</p>

      <p v-if="isPreparing" class="info">正在验证重置链接，请稍候...</p>
      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
      <p v-if="successMessage" class="success">{{ successMessage }}</p>

      <form v-if="isReady && !successMessage" @submit.prevent="handleSubmit">
        <label for="new-password">新密码</label>
        <input
          id="new-password"
          v-model="newPassword"
          type="password"
          autocomplete="new-password"
          placeholder="至少 6 位"
          required
        />

        <label for="confirm-password">确认新密码</label>
        <input
          id="confirm-password"
          v-model="confirmPassword"
          type="password"
          autocomplete="new-password"
          placeholder="再次输入新密码"
          required
        />

        <button type="submit" :disabled="isSubmitting">
          {{ isSubmitting ? '提交中...' : '确认修改密码' }}
        </button>
      </form>

      <button
        v-if="!isPreparing && !isReady"
        class="secondary"
        type="button"
        @click="router.replace('/login')"
      >
        返回登录
      </button>
    </div>
  </div>
</template>

<style scoped>
.reset-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: #f5f7fb;
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
}

.reset-card {
  width: 100%;
  max-width: 460px;
  background: #ffffff;
  border-radius: 14px;
  padding: 28px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

h1 {
  font-size: 26px;
  line-height: 1.2;
  color: #111827;
}

.desc {
  color: #4b5563;
  font-size: 14px;
}

form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
}

label {
  color: #1f2937;
  font-size: 14px;
  font-weight: 600;
}

input {
  width: 100%;
  height: 42px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 14px;
  outline: none;
}

input:focus {
  border-color: #0ea5e9;
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.15);
}

button {
  margin-top: 8px;
  height: 42px;
  border: 0;
  border-radius: 8px;
  color: #ffffff;
  background: #0284c7;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.secondary {
  background: #6b7280;
}

.info {
  color: #1d4ed8;
  font-size: 14px;
}

.error {
  color: #dc2626;
  font-size: 14px;
}

.success {
  color: #059669;
  font-size: 14px;
}
</style>
