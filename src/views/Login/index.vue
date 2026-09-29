<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import AltchaWidget from '@/components/AltchaWidget.vue';
import AgreementModal from '@/components/AgreementModal.vue';
import TokenLoginPanel from './TokenLoginPanel.vue';
import { userAgreementContent, privacyPolicyContent } from '@/data/agreementData.js';
import DOMPurify from '@/utils/dompurify.js'; // 修复：添加 DOMPurify 防止 XSS
import { getLoginDeviceIdHash } from '@/utils/device-trust.js';
import { getAltchaChallengeUrl, isAltchaEnabled } from '@/utils/altcha.js';
import { getImageUrl } from '@/utils/asset-helper.js';
import { isPasskeySupported } from '@/utils/api/auth-api.js';
import { logger } from '@/utils/logger.js';
import { Fingerprint } from 'lucide-vue-next';
import { normalizeLoginId, validateEmail } from '@/utils/auth-validation.js';

const props = defineProps({
  show: {
    type: Boolean,
    default: true,
  },
  isModal: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['close', 'success']);
const router = useRouter();
const authStore = useAuthStore();
const { login, resetPassword } = authStore;
const loginHeroSrcset = [
  `${getImageUrl('@/assets/images/main1-768.webp')} 768w`,
  `${getImageUrl('@/assets/images/main1-1280.webp')} 1280w`,
  `${getImageUrl('@/assets/images/main1-1920.webp')} 1920w`,
].join(', ');

const loginForm = reactive({
  loginId: '', // 统一为 loginId，可以是 email 或 username
  password: '',
  rememberMe: true,
  agreedToTerms: false,
});

// 一次性 token 登录面板（管理员代发通道）：在两套布局的链接区各有一个入口
const tokenPanelOpen = ref(false);

const showPassword = ref(false);
const isSubmitting = ref(false);
const authError = ref('');
const emailInvalid = ref(false);
const passwordInvalid = ref(false);
const altchaEnabled = computed(() => isAltchaEnabled());
const altchaChallengeUrl = computed(() => getAltchaChallengeUrl('login'));
const altchaWidgetRef = ref(null);
const altchaPayload = ref('');
const altchaState = ref('unverified');
const altchaError = ref('');
const shouldShowAltcha = ref(false);
const loginDeviceIdHash = ref('');
const mobileFormOpen = ref(false);
const mobileSuccess = ref(false);
const mobileClosing = ref(false);
const mobileKeyboardOpen = ref(false);
let mobileSuccessTimer = null;
let mobileClosingTimer = null;

const loginButtonDisabled = computed(() => {
  return isSubmitting.value || !loginForm.agreedToTerms;
});

// 通行密钥（指纹/面容）登录入口：能力检测驱动 —— 支持的浏览器才显示，
// 微信/QQ 内置浏览器（无 WebAuthn）整按钮隐藏而非置灰，避免「点了报错」。
const passkeySupported = ref(false);
const isPasskeySubmitting = ref(false);
const passkeyError = ref('');

// 协议弹窗状态
const showAgreementModal = ref(false);
const agreementModalType = ref('user'); // 'user' 或 'privacy'
const agreementModalTitle = computed(() => {
  return agreementModalType.value === 'user' ? '方块之家用户服务协议' : '方块之家隐私政策';
});
const agreementModalContent = computed(() => {
  const rawContent =
    agreementModalType.value === 'user' ? userAgreementContent : privacyPolicyContent;
  return DOMPurify.sanitize(rawContent); // 修复：对协议内容进行 XSS 消毒
});

// 打开协议弹窗
const openAgreementModal = (type) => {
  agreementModalType.value = type;
  showAgreementModal.value = true;
};

// 关闭协议弹窗
const closeAgreementModal = () => {
  showAgreementModal.value = false;
};

const REMEMBER_ME_STORAGE_KEY = 'boh_remember_me';
const AGREED_TO_TERMS_KEY = 'boh_agreed_to_terms';
let loginDeviceIdHashPromise = null;

// 邮箱后缀相关
const showEmailSuffixes = ref(false);
const emailSuffixes = ref([
  '@qq.com',
  '@163.com',
  '@126.com',
  '@gmail.com',
  '@outlook.com',
  '@hotmail.com',
  '@sina.com',
  '@sohu.com',
  '@aliyun.com',
  '@qq.com',
]);

const warmLoginDeviceIdHash = () => {
  if (loginDeviceIdHash.value) return Promise.resolve(loginDeviceIdHash.value);
  if (loginDeviceIdHashPromise) return loginDeviceIdHashPromise;

  loginDeviceIdHashPromise = getLoginDeviceIdHash()
    .then((hash) => {
      loginDeviceIdHash.value = String(hash || '').trim();
      return loginDeviceIdHash.value;
    })
    .catch(() => {
      loginDeviceIdHash.value = '';
      return '';
    })
    .finally(() => {
      loginDeviceIdHashPromise = null;
    });

  return loginDeviceIdHashPromise;
};

const altchaStatusMessage = computed(() => {
  if (!shouldShowAltcha.value) return '';
  if (altchaState.value === 'verified') return '人机验证已完成。';
  if (altchaState.value === 'verifying') return '人机验证进行中...';
  if (altchaState.value === 'expired') return '验证已过期，请重新完成。';
  if (altchaState.value === 'error') return '人机验证加载失败，请重试。';
  return '请先完成人机验证。';
});

const resetAltcha = async ({ hide = false } = {}) => {
  altchaPayload.value = '';
  altchaState.value = 'unverified';
  altchaError.value = '';
  if (hide) {
    shouldShowAltcha.value = false;
  }
  await nextTick();
  await altchaWidgetRef.value?.reset?.();
};

const handleAltchaStateChange = (nextState) => {
  altchaState.value = String(nextState || '').trim() || 'unverified';
  if (altchaState.value === 'verified') {
    altchaError.value = '';
    return;
  }
  if (altchaState.value === 'expired') {
    altchaPayload.value = '';
    altchaError.value = '人机验证已过期，请重新完成。';
    return;
  }
  if (altchaState.value === 'error') {
    altchaPayload.value = '';
    altchaError.value = '人机验证加载失败，请点击重试。';
    return;
  }
  if (altchaState.value !== 'verifying') {
    altchaPayload.value = '';
  }
};

const handleAltchaVerified = () => {
  altchaError.value = '';
};

const handleAltchaExpired = () => {
  altchaPayload.value = '';
  altchaState.value = 'expired';
  altchaError.value = '人机验证已过期，请重新完成。';
};

const retryAltcha = async () => {
  authError.value = '';
  await resetAltcha();
};

const handleClose = () => {
  if (props.isModal) {
    emit('close');
    // 重置表单
    loginForm.loginId = '';
    loginForm.password = '';
    loginForm.rememberMe = false;
    mobileFormOpen.value = false;
    mobileSuccess.value = false;
    mobileClosing.value = false;
    if (mobileSuccessTimer) window.clearTimeout(mobileSuccessTimer);
    if (mobileClosingTimer) window.clearTimeout(mobileClosingTimer);
    mobileSuccessTimer = null;
    mobileClosingTimer = null;
    authError.value = '';
    emailInvalid.value = false;
    passwordInvalid.value = false;
    void resetAltcha({ hide: true });
  }
};

const openMobileLogin = () => {
  mobileFormOpen.value = true;
};

const updateMobileViewport = () => {
  if (typeof window === 'undefined') return;
  const viewport = window.visualViewport;
  const height = viewport?.height || window.innerHeight;
  document.documentElement.style.setProperty('--boh-visual-height', `${height}px`);
  mobileKeyboardOpen.value = Boolean(viewport && window.innerHeight - viewport.height > 120);
};

const handleMobileInputFocus = (event) => {
  mobileFormOpen.value = true;
  window.setTimeout(() => {
    event?.target?.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }, 80);
};

const finishLoginSuccess = () => {
  if (props.isModal) {
    emit('success');
    handleClose();
  } else {
    router.push('/');
  }
};

// 令牌登录成功：会话已由面板建立（面板 emit('success')），收尾统一在此处理 ——
// 弹窗模式走与 finishLoginSuccess 同款链路（emit success + handleClose，后者
// emit('close') → App 层置 showLoginModal=false 关闭弹窗并复位表单）；
// 复位令牌面板开关；两种模式都导航到 /reset-password 引导设置新密码
// （15 分钟宽限窗内免当前密码）。
// ⚠️ 弹窗的关闭链路在父级（showLoginModal 挂在 App），面板自己关不掉它。
const handleTokenLoginSuccess = () => {
  tokenPanelOpen.value = false;
  if (props.isModal) {
    emit('success');
    handleClose();
  }
  void router.replace('/reset-password');
};

const showMobileSuccess = () => {
  // Login is a frequent, functional action: acknowledge it with a quiet
  // success state, then return along the same path to the account island.
  if (mobileSuccessTimer) window.clearTimeout(mobileSuccessTimer);
  if (mobileClosingTimer) window.clearTimeout(mobileClosingTimer);
  mobileSuccess.value = true;
  mobileClosingTimer = window.setTimeout(() => {
    mobileClosing.value = true;
    mobileClosingTimer = null;
  }, 720);
  mobileSuccessTimer = window.setTimeout(() => {
    finishLoginSuccess();
    mobileSuccess.value = false;
    mobileClosing.value = false;
    mobileFormOpen.value = false;
    mobileSuccessTimer = null;
  }, 1480);
};

// 处理邮箱输入事件
const handleEmailInput = () => {
  // 当用户输入时，根据输入内容决定是否显示后缀列表
  const email = loginForm.loginId;
  if (email && !email.includes('@')) {
    showEmailSuffixes.value = true;
  } else {
    showEmailSuffixes.value = false;
  }
};

// 处理邮箱输入框获得焦点事件
const handleEmailFocus = () => {
  const email = loginForm.loginId;
  if (email && !email.includes('@')) {
    showEmailSuffixes.value = true;
  }
};

// 处理点击其他地方隐藏后缀列表
const handleClickOutside = (event) => {
  const emailInputContainer = event.target.closest('.email-input-container');
  if (!emailInputContainer) {
    showEmailSuffixes.value = false;
  }
};

// 添加邮箱后缀
const addEmailSuffix = (suffix) => {
  const email = loginForm.loginId;
  if (email && !email.includes('@')) {
    loginForm.loginId = email + suffix;
  }
  showEmailSuffixes.value = false;
};

const togglePassword = () => {
  showPassword.value = !showPassword.value;
};

const handleForgotPassword = async () => {
  const normalizedLoginId = normalizeLoginId(loginForm.loginId);
  const emailValidationMessage = validateEmail(normalizedLoginId);
  if (emailValidationMessage) {
    authError.value = '请先输入有效的邮箱地址，然后再点击“忘记密码”';
    return;
  }

  isSubmitting.value = true;
  try {
    const result = await resetPassword(normalizedLoginId);
    if (result.success) {
      alert('重置密码链接已发送至您的邮箱，请查收。');
    } else {
      authError.value = result.message;
    }
  } catch (_error) {
    authError.value = '发送重置邮件失败，请稍后再试';
  } finally {
    isSubmitting.value = false;
  }
};

const handleLogin = async () => {
  const normalizedLoginId = normalizeLoginId(loginForm.loginId);
  emailInvalid.value = !normalizedLoginId;
  if (emailInvalid.value) {
    authError.value = '请输入账号';
    return;
  }

  if (!loginForm.agreedToTerms) {
    authError.value = '请先阅读并同意用户协议和隐私政策';
    return;
  }

  passwordInvalid.value = !String(loginForm.password || '');
  if (passwordInvalid.value) {
    authError.value = '请输入密码';
    return;
  }

  isSubmitting.value = true;
  authError.value = '';

  try {
    if (!loginDeviceIdHash.value) {
      loginDeviceIdHash.value = await warmLoginDeviceIdHash();
    }

    const result = await login(normalizedLoginId, loginForm.password, loginForm.rememberMe);
    if (result.success) {
      localStorage.setItem(REMEMBER_ME_STORAGE_KEY, loginForm.rememberMe ? '1' : '0');
      showMobileSuccess();
    } else {
      authError.value = result.message || '登录失败，请重试';
      if (altchaEnabled.value && result.requireCaptcha) {
        const wasHidden = !shouldShowAltcha.value;
        shouldShowAltcha.value = true;
        if (!wasHidden || altchaPayload.value) {
          await resetAltcha();
        }
      } else if (altchaEnabled.value && shouldShowAltcha.value && altchaPayload.value) {
        await resetAltcha();
      }
    }
  } catch (error) {
    authError.value = '系统错误，请稍后再试';
    if (altchaEnabled.value && shouldShowAltcha.value && altchaPayload.value) await resetAltcha();
    logger.error('login', 'Login failed', error);
  } finally {
    isSubmitting.value = false;
  }
};

const handleRegister = () => {
  if (props.isModal) {
    handleClose();
  }
  router.push('/join');
};

// 通行密钥登录：WebAuthn 仪式由 supabase-js 托管（无需输入用户名），
// 成功后的会话采纳与封禁检查在 store 内与密码登录走同一条链。
// 失败文案由 toPasskeyLoginMessage 统一给出 —— 首次使用会引导到 设置→账户安全 注册。
const handlePasskeyLogin = async () => {
  if (isPasskeySubmitting.value) return;
  isPasskeySubmitting.value = true;
  authError.value = '';
  passkeyError.value = '';

  try {
    const result = await authStore.loginWithPasskey();
    if (result.success) {
      localStorage.setItem(REMEMBER_ME_STORAGE_KEY, '1');
      showMobileSuccess();
    } else {
      passkeyError.value = result.message || '通行密钥登录失败，请使用密码登录。';
    }
  } catch (error) {
    logger.error('login', 'Passkey login failed', error);
    passkeyError.value = '通行密钥登录失败，请使用密码登录。';
  } finally {
    isPasskeySubmitting.value = false;
  }
};

onMounted(() => {
  const rememberedFlag = localStorage.getItem(REMEMBER_ME_STORAGE_KEY);
  if (rememberedFlag === '1' || rememberedFlag === '0') {
    loginForm.rememberMe = rememberedFlag === '1';
  }

  void isPasskeySupported().then((supported) => {
    passkeySupported.value = supported;
  });

  const rememberedEmail = localStorage.getItem('boh_remember_email');
  if (rememberedEmail && loginForm.rememberMe) {
    loginForm.loginId = rememberedEmail;
  }

  // 读取协议勾选状态
  const agreedToTermsFlag = localStorage.getItem(AGREED_TO_TERMS_KEY);
  if (agreedToTermsFlag === '1') {
    loginForm.agreedToTerms = true;
  }

  // AOS（Animate On Scroll）由外部脚本按需注入，项目内未引入 —— 用 window 前缀表达「可能不存在」，
  // 也让 no-undef 不误判（typeof 对未声明标识符安全，属性访问不检查）。
  if (typeof window.AOS !== 'undefined') {
    window.AOS.init({
      duration: 800,
    });
  }
  document.body.classList.add('is-loaded');

  document.addEventListener('click', handleClickOutside);
  updateMobileViewport();
  window.visualViewport?.addEventListener('resize', updateMobileViewport);
  window.visualViewport?.addEventListener('scroll', updateMobileViewport);
  void warmLoginDeviceIdHash();
});

watch(
  () => props.show,
  async (visible) => {
    // Every opening starts at the account-choice surface. Do not let a
    // previous form state leak into the next modal instance.
    mobileFormOpen.value = false;
    mobileSuccess.value = false;
    mobileClosing.value = false;
    if (!visible) {
      if (mobileSuccessTimer) window.clearTimeout(mobileSuccessTimer);
      if (mobileClosingTimer) window.clearTimeout(mobileClosingTimer);
      mobileSuccessTimer = null;
      mobileClosingTimer = null;
    }
    if (!props.isModal || !altchaEnabled.value) return;

    if (visible) {
      if (shouldShowAltcha.value) {
        await nextTick();
        await resetAltcha();
      }
      return;
    }

    await resetAltcha();
  },
);

watch(shouldShowAltcha, async (required) => {
  if (!altchaEnabled.value) return;
  if (!required) {
    await resetAltcha();
    return;
  }
  if (props.isModal && !props.show) return;
  await nextTick();
  await resetAltcha();
});

// 监听协议勾选状态变化并保存
watch(
  () => loginForm.agreedToTerms,
  (agreed) => {
    localStorage.setItem(AGREED_TO_TERMS_KEY, agreed ? '1' : '0');
  },
);

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  window.visualViewport?.removeEventListener('resize', updateMobileViewport);
  window.visualViewport?.removeEventListener('scroll', updateMobileViewport);
  document.documentElement.style.removeProperty('--boh-visual-height');
  if (mobileSuccessTimer) window.clearTimeout(mobileSuccessTimer);
  if (mobileClosingTimer) window.clearTimeout(mobileClosingTimer);
});
</script>

<template>
  <div
    v-if="!isModal || show"
    :class="[
      isModal ? 'boh-login-modal-overlay' : 'login-page',
      {
        'mobile-form-open': mobileFormOpen,
        'mobile-login-success': mobileSuccess,
        'mobile-login-closing': mobileClosing,
        'mobile-keyboard-open': mobileKeyboardOpen,
      },
    ]"
    @click="isModal ? handleClose() : null"
  >
    <!-- 模态框模式保持原有布局 -->
    <template v-if="isModal">
      <div class="boh-login-modal-container" @click.stop>
        <button v-if="isModal" class="boh-login-modal-close" @click="handleClose" aria-label="关闭">
          &times;
        </button>

        <div v-if="mobileSuccess" class="mobile-success-state" aria-live="polite">
          <div class="boh-login-logo"></div>
          <strong>登录成功</strong>
        </div>

        <div class="boh-login-modal-header">
          <div class="boh-login-logo"></div>
          <h2>方块之家</h2>
          <p>这里不只有方块。</p>
          <div v-if="!mobileFormOpen" class="mobile-login-entry" aria-label="BOH 账户入口">
            <button type="button" class="mobile-login-primary" @click="openMobileLogin">
              <span class="mobile-login-pill-mark" aria-hidden="true"></span>
              <span>登录 BOH</span>
            </button>
            <button type="button" class="mobile-login-secondary" @click="handleRegister">
              注册 BOH 账户
            </button>
          </div>
        </div>

        <div v-if="authError && mobileFormOpen" class="boh-auth-error">
          {{ authError }}
        </div>

        <form v-if="mobileFormOpen" class="boh-login-form" @submit.prevent="handleLogin">
          <div class="boh-form-group">
            <label for="loginId">邮箱 / 方块 ID</label>
            <div class="email-input-container">
              <input
                type="text"
                id="loginId"
                v-model="loginForm.loginId"
                placeholder="请输入邮箱或方块 ID"
                autocapitalize="off"
                autocomplete="username"
                enterkeyhint="next"
                autocorrect="off"
                spellcheck="false"
                :class="{ 'boh-invalid': emailInvalid }"
                @input="handleEmailInput"
                @focus="handleEmailFocus"
                @focusin="handleMobileInputFocus"
                required
              />
              <div v-if="showEmailSuffixes && emailSuffixes.length > 0" class="email-suffixes">
                <button
                  v-for="suffix in emailSuffixes"
                  :key="suffix"
                  class="email-suffix-btn"
                  @click="addEmailSuffix(suffix)"
                >
                  {{ suffix }}
                </button>
              </div>
            </div>
            <div class="boh-error-message">请输入有效的方块 ID 或邮箱地址</div>
          </div>

          <div class="boh-form-group">
            <label for="password">密码</label>
            <div class="boh-password-wrap">
              <input
                :type="showPassword ? 'text' : 'password'"
                id="password"
                v-model="loginForm.password"
                placeholder="请输入你的密码"
                autocomplete="current-password"
                enterkeyhint="done"
                :class="{ 'boh-invalid': passwordInvalid }"
                @focus="handleMobileInputFocus"
                required
              />
              <button type="button" class="boh-toggle-password" @click="togglePassword">
                {{ showPassword ? '隐藏' : '显示' }}
              </button>
            </div>
            <div class="boh-error-message">请输入密码</div>
          </div>

          <div v-if="altchaEnabled && shouldShowAltcha" class="login-altcha-wrap">
            <AltchaWidget
              ref="altchaWidgetRef"
              v-model="altchaPayload"
              :challenge="altchaChallengeUrl"
              :disabled="isSubmitting"
              auto="onload"
              @statechange="handleAltchaStateChange"
              @verified="handleAltchaVerified"
              @expired="handleAltchaExpired"
            />
            <p class="altcha-status" :class="{ 'is-error': altchaError }">
              {{ altchaError || altchaStatusMessage }}
            </p>
            <button
              v-if="altchaError || altchaState === 'expired'"
              type="button"
              class="altcha-retry-btn"
              :disabled="isSubmitting"
              @click="retryAltcha"
            >
              {{ isSubmitting ? '请稍候...' : '重新加载人机验证' }}
            </button>
          </div>

          <!-- Agreement Checkbox -->
          <div class="agreement-section">
            <label class="agreement-checkbox">
              <input type="checkbox" v-model="loginForm.agreedToTerms" />
              <span class="agreement-text">
                我已阅读并同意
                <a href="#" class="agreement-link" @click.prevent="openAgreementModal('user')"
                  >用户协议</a
                >
                和
                <a href="#" class="agreement-link" @click.prevent="openAgreementModal('privacy')"
                  >隐私政策</a
                >
              </span>
            </label>
          </div>

          <div class="boh-form-links">
            <label class="boh-remember-me">
              <input type="checkbox" v-model="loginForm.rememberMe" />
              <span>记住我</span>
            </label>
            <div class="boh-links-group">
              <a href="#" @click.prevent="handleForgotPassword">忘记密码？</a>
              <a href="#" @click.prevent="tokenPanelOpen = !tokenPanelOpen">令牌登录</a>
              <a href="/join" @click.prevent="handleRegister">注册 BOH ID</a>
            </div>
          </div>

          <button type="submit" class="boh-login-btn" :disabled="loginButtonDisabled">
            {{ isSubmitting ? '登录中...' : '登录' }}
          </button>

          <button
            v-if="passkeySupported"
            type="button"
            class="boh-passkey-btn"
            :disabled="isPasskeySubmitting || isSubmitting"
            @click="handlePasskeyLogin"
          >
            <Fingerprint :size="16" :stroke-width="2" aria-hidden="true" />
            <span>{{ isPasskeySubmitting ? '正在验证…' : '指纹 / 面容一键登录' }}</span>
          </button>
          <p v-if="passkeyError" class="boh-passkey-error">{{ passkeyError }}</p>
        </form>

        <TokenLoginPanel v-if="tokenPanelOpen" @success="handleTokenLoginSuccess" />
      </div>
    </template>

    <!-- 页面模式：左右布局 -->
    <template v-else>
      <div class="login-split-container" @click.stop>
        <!-- 左侧图片区域 -->
        <div class="login-image-section">
          <img
            :src="getImageUrl('@/assets/images/main1-1280.webp')"
            :srcset="loginHeroSrcset"
            sizes="(max-width: 900px) 100vw, 50vw"
            alt="方块之家"
            class="login-hero-image"
            fetchpriority="high"
            decoding="async"
            width="1280"
            height="854"
          />
          <div class="login-image-overlay">
            <div class="login-brand">
              <div class="login-brand-logo"></div>
              <h1>方块之家</h1>
              <p>这里不只有方块。</p>
            </div>
          </div>
        </div>

        <!-- 右侧登录表单区域 -->
        <div class="login-form-section">
          <div class="login-form-wrapper">
            <div v-if="mobileSuccess" class="mobile-success-state" aria-live="polite">
              <div class="boh-login-logo"></div>
              <strong>登录成功</strong>
            </div>
            <div class="login-form-header">
              <div class="boh-login-logo"></div>
              <h2>欢迎回来</h2>
              <p>登录你的 BOH ID</p>
              <div v-if="!mobileFormOpen" class="mobile-login-entry" aria-label="BOH 账户入口">
                <button type="button" class="mobile-login-primary" @click="openMobileLogin">
                  <span class="mobile-login-pill-mark" aria-hidden="true"></span>
                  <span>登录 BOH</span>
                </button>
                <button type="button" class="mobile-login-secondary" @click="handleRegister">
                  注册 BOH 账户
                </button>
              </div>
            </div>

            <div v-if="authError && mobileFormOpen" class="boh-auth-error">
              {{ authError }}
            </div>

            <form v-if="mobileFormOpen" class="boh-login-form" @submit.prevent="handleLogin">
              <div class="boh-form-group">
                <label for="loginId">邮箱 / 方块 ID</label>
                <div class="email-input-container">
                  <input
                    type="text"
                    id="loginId"
                    v-model="loginForm.loginId"
                    placeholder="请输入邮箱或方块 ID"
                    autocapitalize="off"
                    autocorrect="off"
                    spellcheck="false"
                    autocomplete="username"
                    enterkeyhint="next"
                    :class="{ 'boh-invalid': emailInvalid }"
                    @input="handleEmailInput"
                    @focus="handleEmailFocus"
                    @focusin="handleMobileInputFocus"
                    required
                  />
                  <div v-if="showEmailSuffixes && emailSuffixes.length > 0" class="email-suffixes">
                    <button
                      v-for="suffix in emailSuffixes"
                      :key="suffix"
                      class="email-suffix-btn"
                      @click="addEmailSuffix(suffix)"
                    >
                      {{ suffix }}
                    </button>
                  </div>
                </div>
                <div class="boh-error-message">请输入有效的方块 ID 或邮箱地址</div>
              </div>

              <div class="boh-form-group">
                <label for="password">密码</label>
                <div class="boh-password-wrap">
                  <input
                    :type="showPassword ? 'text' : 'password'"
                    id="password"
                    v-model="loginForm.password"
                    placeholder="请输入你的密码"
                    autocomplete="current-password"
                    enterkeyhint="done"
                    :class="{ 'boh-invalid': passwordInvalid }"
                    @focus="handleMobileInputFocus"
                    required
                  />
                  <button type="button" class="boh-toggle-password" @click="togglePassword">
                    {{ showPassword ? '隐藏' : '显示' }}
                  </button>
                </div>
                <div class="boh-error-message">请输入密码</div>
              </div>

              <div v-if="altchaEnabled && shouldShowAltcha" class="login-altcha-wrap">
                <AltchaWidget
                  ref="altchaWidgetRef"
                  v-model="altchaPayload"
                  :challenge="altchaChallengeUrl"
                  :disabled="isSubmitting"
                  auto="onload"
                  @statechange="handleAltchaStateChange"
                  @verified="handleAltchaVerified"
                  @expired="handleAltchaExpired"
                />
                <p class="altcha-status" :class="{ 'is-error': altchaError }">
                  {{ altchaError || altchaStatusMessage }}
                </p>
                <button
                  v-if="altchaError || altchaState === 'expired'"
                  type="button"
                  class="altcha-retry-btn"
                  :disabled="isSubmitting"
                  @click="retryAltcha"
                >
                  {{ isSubmitting ? '请稍候...' : '重新加载人机验证' }}
                </button>
              </div>

              <!-- Agreement Checkbox -->
              <div class="agreement-section">
                <label class="agreement-checkbox">
                  <input type="checkbox" v-model="loginForm.agreedToTerms" />
                  <span class="agreement-text">
                    我已阅读并同意
                    <a href="#" class="agreement-link" @click.prevent="openAgreementModal('user')"
                      >用户协议</a
                    >
                    和
                    <a
                      href="#"
                      class="agreement-link"
                      @click.prevent="openAgreementModal('privacy')"
                      >隐私政策</a
                    >
                  </span>
                </label>
              </div>

              <div class="boh-form-links">
                <label class="boh-remember-me">
                  <input type="checkbox" v-model="loginForm.rememberMe" />
                  <span>记住我</span>
                </label>
                <div class="boh-links-group">
                  <a href="#" @click.prevent="handleForgotPassword">忘记密码？</a>
                  <a href="#" @click.prevent="tokenPanelOpen = !tokenPanelOpen">令牌登录</a>
                </div>
              </div>

              <button type="submit" class="boh-login-btn" :disabled="loginButtonDisabled">
                {{ isSubmitting ? '登录中...' : '登录' }}
              </button>

              <button
                v-if="passkeySupported"
                type="button"
                class="boh-passkey-btn"
                :disabled="isPasskeySubmitting || isSubmitting"
                @click="handlePasskeyLogin"
              >
                <Fingerprint :size="16" :stroke-width="2" aria-hidden="true" />
                <span>{{ isPasskeySubmitting ? '正在验证…' : '指纹 / 面容一键登录' }}</span>
              </button>
              <p v-if="passkeyError" class="boh-passkey-error">{{ passkeyError }}</p>
            </form>

            <TokenLoginPanel v-if="tokenPanelOpen" @success="handleTokenLoginSuccess" />

            <div class="login-footer">
              <p>还没有账号? <a href="/join" @click.prevent="handleRegister">立即注册</a></p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>

  <!-- 协议弹窗 -->
  <AgreementModal
    :visible="showAgreementModal"
    :title="agreementModalTitle"
    @update:visible="(val) => (showAgreementModal = val)"
    @close="closeAgreementModal"
  >
    <div v-html="agreementModalContent"></div>
    <!-- 已通过 DOMPurify 消毒 -->
  </AgreementModal>
</template>

<style scoped>
@import './style.scoped.css';
</style>
