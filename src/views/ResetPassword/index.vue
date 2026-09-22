<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { supabase } from '@/utils/supabase-client.js';
import { readClipboardText } from '@/utils/recovery-access.js';
import { PASSWORD_MIN_LENGTH, validatePassword } from '@/utils/auth-validation.js';

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

// 管理员代发的一次性登录令牌（手动粘贴通道，无邮箱参与）
const manualToken = ref('');
const manualError = ref('');
const manualPasteHint = ref('');
const isVerifyingManual = ref(false);

// 一键粘贴：只填充输入框，**不自动验证** —— 令牌是一次性凭证，
// 自动验证会在误触/剪贴板内容过期时把令牌烧掉（烧了就得请管理员重签）。
const pasteManualToken = async () => {
  manualError.value = '';
  manualPasteHint.value = '';
  const text = await readClipboardText();
  if (!text) {
    manualPasteHint.value = '无法读取剪贴板，请手动粘贴（Ctrl/Cmd + V）。';
    return;
  }
  manualToken.value = text;
};

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

// 粘贴管理员签发的一次性 token → 直接建立会话。
// 与邮件链接共用 verifyOtp({ type:'recovery', token_hash })，密码全程只有用户本人知道。
const submitManualToken = async () => {
  manualError.value = '';
  const tokenHash = String(manualToken.value || '').trim();
  if (!tokenHash) {
    manualError.value = '请粘贴管理员提供的一次性登录令牌。';
    return;
  }

  isVerifyingManual.value = true;
  try {
    const verifyResult = await authStore.verifyPasswordRecovery(tokenHash);
    if (!verifyResult.success) {
      manualError.value = toFriendlyRecoveryError(verifyResult.message, '令牌无效或已过期，请联系管理员重新签发。');
      return;
    }

    const session = await waitForSession();
    if (!session?.user) {
      manualError.value = '会话建立失败，请稍后重试。';
      return;
    }

    await authStore.updateLocalState(session.user, { force: true });
    isReady.value = true;
    manualToken.value = '';
    errorMessage.value = '';
    if (typeof window !== 'undefined' && typeof window.history?.replaceState === 'function') {
      window.history.replaceState({}, document.title, `${window.location.origin}/#/reset-password`);
    }
  } catch (error) {
    manualError.value = toFriendlyRecoveryError(error, '验证 token 失败，请稍后重试。');
  } finally {
    isVerifyingManual.value = false;
  }
};

const handleSubmit = async () => {
  errorMessage.value = '';
  successMessage.value = '';

  const password = String(newPassword.value || '');
  const confirmedPassword = String(confirmPassword.value || '');

  // 走全站唯一真源（与注册、改密同一处口径）。这里原先只判 < 6，
  // 等于给了一条绕过 8 位下限的路：注册要求 8 位，重置成 6 位即可。
  const passwordValidationMessage = validatePassword(password);
  if (passwordValidationMessage) {
    errorMessage.value = `${passwordValidationMessage}。`;
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
          :placeholder="`至少 ${PASSWORD_MIN_LENGTH} 位`"
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

        <button class="secondary skip" type="button" :disabled="isSubmitting" @click="router.replace('/')">
          暂不修改，直接进入
        </button>
      </form>

      <!-- 管理员代发令牌：手动粘贴通道（无邮箱参与，令牌本身即定位用户） -->
      <div v-if="!isPreparing && !isReady" class="manual-block">
        <p class="manual-title">持有一次性登录令牌？</p>
        <p class="manual-desc">粘贴管理员签发的令牌，验证后即可直接设置新密码。</p>
        <div class="manual-input-row">
          <input
            v-model="manualToken"
            type="text"
            class="manual-input"
            placeholder="粘贴一次性登录令牌"
            autocomplete="one-time-code"
            spellcheck="false"
            :disabled="isVerifyingManual"
            @keyup.enter="submitManualToken"
          >
          <button type="button" class="manual-paste-btn" :disabled="isVerifyingManual"
            title="从剪贴板粘贴令牌" @click="pasteManualToken">粘贴</button>
        </div>
        <p v-if="manualError" class="error">{{ manualError }}</p>
        <p v-else-if="manualPasteHint" class="paste-hint">{{ manualPasteHint }}</p>
        <button type="button" :disabled="isVerifyingManual" @click="submitManualToken">
          {{ isVerifyingManual ? '验证中...' : '验证令牌并登录' }}
        </button>
      </div>

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
/* 局部语义 token：亮色默认值，暗色在下方平铺块重定义 */
.reset-page {
  --rp-brand: #0071e3;
  --rp-brand-hover: #0077ed;
  --rp-brand-ring: rgba(0, 113, 227, 0.16);
  --rp-info: #1d4ed8;
  --rp-error: #dc2626;
  --rp-success: #059669;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  /* 光斑垫底：毛玻璃卡需要背景层次，纯 CSS 多层渐变，不加 DOM */
  background:
    radial-gradient(640px 420px at 12% 16%, rgba(0, 113, 227, 0.07), transparent 62%),
    radial-gradient(520px 400px at 88% 84%, rgba(41, 151, 255, 0.06), transparent 62%),
    #f5f7fb;
}

.reset-card {
  width: 100%;
  max-width: 460px;
  background: var(--liquid-bg-strong, rgba(255, 255, 255, 0.84));
  -webkit-backdrop-filter: var(--liquid-filter-sm);
  backdrop-filter: var(--liquid-filter-sm);
  border: 1px solid var(--liquid-border-hairline, rgba(15, 23, 42, 0.06));
  border-radius: var(--liquid-radius-md, 16px);
  padding: 28px;
  box-shadow:
    var(--liquid-highlight, inset 0 1px 0 rgba(255, 255, 255, 0.86)),
    var(--liquid-shadow-sm, 0 8px 24px rgba(15, 23, 42, 0.06));
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--liquid-text-primary, #1d1d1f);
}

h1 {
  font-size: 26px;
  line-height: 1.2;
  color: var(--liquid-text-primary, #1d1d1f);
}

.desc {
  color: var(--liquid-text-secondary, #6e6e73);
  font-size: 14px;
}

form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
}

label {
  color: var(--liquid-text-primary, #1d1d1f);
  font-size: 14px;
  font-weight: 600;
}

input {
  box-sizing: border-box;
  width: 100%;
  height: 42px;
  border: 1px solid var(--liquid-border-hairline, rgba(15, 23, 42, 0.06));
  border-radius: var(--liquid-radius-md, 16px);
  padding: 0 12px;
  font-size: 14px;
  color: var(--liquid-text-primary, #1d1d1f);
  background: var(--liquid-bg-nested, rgba(255, 255, 255, 0.42));
  outline: none;
  transition:
    border-color var(--duration-fast, 180ms) var(--ease-out),
    box-shadow var(--duration-fast, 180ms) var(--ease-out),
    background-color var(--duration-fast, 180ms) var(--ease-out);
}

input::placeholder {
  color: var(--liquid-text-tertiary, #8b9098);
}

input:focus {
  border-color: var(--rp-brand);
  box-shadow: 0 0 0 3px var(--rp-brand-ring);
}

button {
  box-sizing: border-box;
  margin-top: 8px;
  height: 42px;
  border: 0;
  border-radius: var(--liquid-radius-md, 16px);
  color: #ffffff;
  background: var(--rp-brand);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color var(--duration-fast, 180ms) var(--ease-out),
    opacity var(--duration-fast, 180ms) var(--ease-out),
    transform var(--duration-press, 160ms) var(--ease-out);
}

button:not(.secondary):hover:not(:disabled) {
  background: var(--rp-brand-hover);
}

button:not(.secondary):active:not(:disabled) {
  transform: scale(0.98);
}

button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--rp-brand-ring);
}

button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.secondary {
  background: var(--liquid-bg-nested, rgba(255, 255, 255, 0.42));
  color: var(--liquid-text-secondary, #6e6e73);
  border: 1px solid var(--liquid-border-hairline, rgba(15, 23, 42, 0.06));
}

.secondary:hover:not(:disabled) {
  background: var(--liquid-bg-subtle, rgba(255, 255, 255, 0.58));
}

.info {
  color: var(--rp-info);
  font-size: 14px;
}

/* 手动粘贴 token 通道（管理员代发）：复用输入框/按钮既有样式，仅补标题与间距 */
.manual-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
  padding-top: 14px;
  border-top: 1px solid var(--liquid-border-hairline, rgba(15, 23, 42, 0.06));
}

.manual-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--liquid-text-primary, #1d1d1f);
}

.manual-desc {
  font-size: 13px;
  color: var(--liquid-text-secondary, #6e6e73);
}

.manual-block .manual-input {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

/* 一键粘贴：输入行 flex 布局，粘贴按钮复用页面既有输入框/次级按钮视觉 */
.manual-input-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.manual-input-row .manual-input {
  flex: 1;
  min-width: 0;
}

.manual-paste-btn {
  flex-shrink: 0;
  height: 42px;
  padding: 0 16px;
  border: 1px solid var(--liquid-border-hairline, rgba(15, 23, 42, 0.06));
  border-radius: var(--liquid-radius-md, 16px);
  background: var(--liquid-bg-nested, rgba(255, 255, 255, 0.42));
  color: var(--liquid-text-primary, #1d1d1f);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 0;
  transition:
    border-color var(--duration-fast, 180ms) var(--ease-out),
    background-color var(--duration-fast, 180ms) var(--ease-out);
}

.manual-paste-btn:hover:not(:disabled) {
  border-color: var(--rp-brand);
  background: var(--liquid-bg-subtle, rgba(255, 255, 255, 0.58));
}

.manual-paste-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.paste-hint {
  color: var(--liquid-text-secondary, #6e6e73);
  font-size: 13px;
}

/* 表单内的次级动作（暂不修改直接进入） */
button.skip {
  margin-top: 0;
}

.error {
  color: var(--rp-error);
  font-size: 14px;
}

.success {
  color: var(--rp-success);
  font-size: 14px;
}

/* 暗色：平铺覆盖（themeManager 把 data-theme 挂在 html 上）。
   只覆盖本页品牌色 —— 文字类 --liquid-text-* 已由 tokens.css 暗色块统一派生，
   此处不再重复定义（原先的 #f5f5f7/#a1a1a6/#7c7c82 是从该缺口抄来的补丁） */
html[data-theme="dark"] .reset-page {
  --rp-brand: #2997ff;
  --rp-brand-hover: #4da3ff;
  --rp-brand-ring: rgba(41, 151, 255, 0.24);
  --rp-info: #8ab0ff;
  --rp-error: #ff7a7a;
  --rp-success: #38d39f;
  background:
    radial-gradient(640px 420px at 12% 16%, rgba(41, 151, 255, 0.10), transparent 62%),
    radial-gradient(520px 400px at 88% 84%, rgba(94, 92, 230, 0.08), transparent 62%),
    #0e0e14;
}
</style>
