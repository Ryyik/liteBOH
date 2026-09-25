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
import {
  normalizeLoginId,
  validateEmail,
} from '@/utils/auth-validation.js';

const props = defineProps({
  show: {
    type: Boolean,
    default: true
  },
  isModal: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['close', 'success']);
const router = useRouter();
const authStore = useAuthStore();
const { login, resetPassword } = authStore;
const loginHeroSrcset = [
  `${getImageUrl('@/assets/images/main1-768.webp')} 768w`,
  `${getImageUrl('@/assets/images/main1-1280.webp')} 1280w`,
  `${getImageUrl('@/assets/images/main1-1920.webp')} 1920w`
].join(', ');

const loginForm = reactive({
  loginId: '', // 统一为 loginId，可以是 email 或 username
  password: '',
  rememberMe: true,
  agreedToTerms: false
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
  const rawContent = agreementModalType.value === 'user' ? userAgreementContent : privacyPolicyContent;
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
  '@qq.com'
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

    const result = await login(
      normalizedLoginId,
      loginForm.password,
      loginForm.rememberMe
    );
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
  if (typeof window.AOS !== "undefined") {
    window.AOS.init({
      duration: 800,
    });
  }
  document.body.classList.add("is-loaded");

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
  }
);

watch(
  shouldShowAltcha,
  async (required) => {
    if (!altchaEnabled.value) return;
    if (!required) {
      await resetAltcha();
      return;
    }
    if (props.isModal && !props.show) return;
    await nextTick();
    await resetAltcha();
  }
);

// 监听协议勾选状态变化并保存
watch(
  () => loginForm.agreedToTerms,
  (agreed) => {
    localStorage.setItem(AGREED_TO_TERMS_KEY, agreed ? '1' : '0');
  }
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
  <div v-if="!isModal || show" :class="[
    isModal ? 'boh-login-modal-overlay' : 'login-page',
    { 'mobile-form-open': mobileFormOpen, 'mobile-login-success': mobileSuccess, 'mobile-login-closing': mobileClosing, 'mobile-keyboard-open': mobileKeyboardOpen }
  ]"
    @click="isModal ? handleClose() : null">

    <!-- 模态框模式保持原有布局 -->
    <template v-if="isModal">
      <div class="boh-login-modal-container" @click.stop>
        <button v-if="isModal" class="boh-login-modal-close" @click="handleClose" aria-label="关闭">&times;</button>

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
              <input type="text" id="loginId" v-model="loginForm.loginId" placeholder="请输入邮箱或方块 ID" autocapitalize="off"
                autocomplete="username" enterkeyhint="next"
                autocorrect="off" spellcheck="false" :class="{ 'boh-invalid': emailInvalid }" @input="handleEmailInput"
                @focus="handleEmailFocus" @focusin="handleMobileInputFocus" required />
              <div v-if="showEmailSuffixes && emailSuffixes.length > 0" class="email-suffixes">
                <button v-for="suffix in emailSuffixes" :key="suffix" class="email-suffix-btn"
                  @click="addEmailSuffix(suffix)">
                  {{ suffix }}
                </button>
              </div>
            </div>
            <div class="boh-error-message">请输入有效的方块 ID 或邮箱地址</div>
          </div>

          <div class="boh-form-group">
            <label for="password">密码</label>
            <div class="boh-password-wrap">
              <input :type="showPassword ? 'text' : 'password'" id="password" v-model="loginForm.password"
                placeholder="请输入你的密码" autocomplete="current-password" enterkeyhint="done"
                :class="{ 'boh-invalid': passwordInvalid }" @focus="handleMobileInputFocus" required />
              <button type="button" class="boh-toggle-password" @click="togglePassword">
                {{ showPassword ? '隐藏' : '显示' }}
              </button>
            </div>
            <div class="boh-error-message">请输入密码</div>
          </div>

          <div v-if="altchaEnabled && shouldShowAltcha" class="login-altcha-wrap">
            <AltchaWidget ref="altchaWidgetRef" v-model="altchaPayload" :challenge="altchaChallengeUrl"
              :disabled="isSubmitting" auto="onload" @statechange="handleAltchaStateChange"
              @verified="handleAltchaVerified" @expired="handleAltchaExpired" />
            <p class="altcha-status" :class="{ 'is-error': altchaError }">
              {{ altchaError || altchaStatusMessage }}
            </p>
            <button v-if="altchaError || altchaState === 'expired'" type="button" class="altcha-retry-btn"
              :disabled="isSubmitting" @click="retryAltcha">
              {{ isSubmitting ? '请稍候...' : '重新加载人机验证' }}
            </button>
          </div>

          <!-- Agreement Checkbox -->
          <div class="agreement-section">
            <label class="agreement-checkbox">
              <input type="checkbox" v-model="loginForm.agreedToTerms">
              <span class="agreement-text">
                我已阅读并同意
                <a href="#" class="agreement-link" @click.prevent="openAgreementModal('user')">用户协议</a>
                和
                <a href="#" class="agreement-link" @click.prevent="openAgreementModal('privacy')">隐私政策</a>
              </span>
            </label>
          </div>

          <div class="boh-form-links">
            <label class="boh-remember-me">
              <input type="checkbox" v-model="loginForm.rememberMe">
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

          <button v-if="passkeySupported" type="button" class="boh-passkey-btn"
            :disabled="isPasskeySubmitting || isSubmitting" @click="handlePasskeyLogin">
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
                  <input type="text" id="loginId" v-model="loginForm.loginId" placeholder="请输入邮箱或方块 ID"
                    autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="username" enterkeyhint="next"
                    :class="{ 'boh-invalid': emailInvalid }"
                    @input="handleEmailInput" @focus="handleEmailFocus" @focusin="handleMobileInputFocus" required />
                  <div v-if="showEmailSuffixes && emailSuffixes.length > 0" class="email-suffixes">
                    <button v-for="suffix in emailSuffixes" :key="suffix" class="email-suffix-btn"
                      @click="addEmailSuffix(suffix)">
                      {{ suffix }}
                    </button>
                  </div>
                </div>
                <div class="boh-error-message">请输入有效的方块 ID 或邮箱地址</div>
              </div>

              <div class="boh-form-group">
                <label for="password">密码</label>
                <div class="boh-password-wrap">
                  <input :type="showPassword ? 'text' : 'password'" id="password" v-model="loginForm.password"
                    placeholder="请输入你的密码" autocomplete="current-password" enterkeyhint="done"
                    :class="{ 'boh-invalid': passwordInvalid }" @focus="handleMobileInputFocus" required />
                  <button type="button" class="boh-toggle-password" @click="togglePassword">
                    {{ showPassword ? '隐藏' : '显示' }}
                  </button>
                </div>
                <div class="boh-error-message">请输入密码</div>
              </div>

              <div v-if="altchaEnabled && shouldShowAltcha" class="login-altcha-wrap">
                <AltchaWidget ref="altchaWidgetRef" v-model="altchaPayload" :challenge="altchaChallengeUrl"
                  :disabled="isSubmitting" auto="onload" @statechange="handleAltchaStateChange"
                  @verified="handleAltchaVerified" @expired="handleAltchaExpired" />
                <p class="altcha-status" :class="{ 'is-error': altchaError }">
                  {{ altchaError || altchaStatusMessage }}
                </p>
                <button v-if="altchaError || altchaState === 'expired'" type="button" class="altcha-retry-btn"
                  :disabled="isSubmitting" @click="retryAltcha">
                  {{ isSubmitting ? '请稍候...' : '重新加载人机验证' }}
                </button>
              </div>

              <!-- Agreement Checkbox -->
              <div class="agreement-section">
                <label class="agreement-checkbox">
                  <input type="checkbox" v-model="loginForm.agreedToTerms">
                  <span class="agreement-text">
                    我已阅读并同意
                    <a href="#" class="agreement-link" @click.prevent="openAgreementModal('user')">用户协议</a>
                    和
                    <a href="#" class="agreement-link" @click.prevent="openAgreementModal('privacy')">隐私政策</a>
                  </span>
                </label>
              </div>

              <div class="boh-form-links">
                <label class="boh-remember-me">
                  <input type="checkbox" v-model="loginForm.rememberMe">
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

              <button v-if="passkeySupported" type="button" class="boh-passkey-btn"
                :disabled="isPasskeySubmitting || isSubmitting" @click="handlePasskeyLogin">
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
  <AgreementModal :visible="showAgreementModal" :title="agreementModalTitle"
    @update:visible="(val) => showAgreementModal = val" @close="closeAgreementModal">
    <div v-html="agreementModalContent"></div> <!-- 已通过 DOMPurify 消毒 -->
  </AgreementModal>
</template>

<style scoped>
/* 页面模式下的容器样式 */
.login-page {
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
  margin: 0;
  padding: 0;
  background: #ffffff;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 确保 modal-overlay 在 Transition 中也能正常工作 */
.boh-login-modal-overlay {
  display: flex !important;
  /* 覆盖可能被 vue transition 影响的 display */
}

.login-altcha-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 4px 0 16px;
  gap: 6px;
}

.altcha-status {
  margin: 0;
  font-size: 12px;
  color: #6e6e73;
}

.altcha-status.is-error {
  color: #d93025;
}

.altcha-retry-btn {
  border: 1px solid #d2d2d7;
  background: #fff;
  color: #1d1d1f;
  font-size: 12px;
  border-radius: 999px;
  padding: 6px 12px;
  cursor: pointer;
}

.altcha-retry-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Agreement Section */
.agreement-section {
  width: 100%;
  margin-bottom: 16px;
  padding-left: 0;
}

.agreement-checkbox {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  column-gap: 8px;
  cursor: pointer;
  user-select: none;
}

.agreement-checkbox input[type="checkbox"] {
  appearance: auto;
  -webkit-appearance: checkbox;
  display: block;
  margin: 0;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  accent-color: #0071e3;
  cursor: pointer;
  justify-self: start;
}

.agreement-text {
  display: block;
  min-width: 0;
  font-size: 13px;
  line-height: 20px;
  color: #86868b;
  font-weight: 500;
}

.agreement-link {
  color: #0071e3;
  text-decoration: none;
  font-weight: 600;
  transition: opacity 0.2s;
}

.agreement-link:hover {
  opacity: 0.8;
  text-decoration: underline;
}

/* 模态框模式下的表单链接区域 - 确保与协议勾选框左对齐 */
.boh-login-modal-container .boh-form-links {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 8px 0 16px;
  font-size: 13px;
  padding-left: 0;
  width: 100%;
}

.boh-login-modal-container .boh-remember-me {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  color: #1d1d1f;
  font-weight: 500;
}

.boh-login-modal-container .boh-remember-me input {
  appearance: auto;
  -webkit-appearance: checkbox;
  width: 16px;
  height: 16px;
  margin: 0;
  padding: 0;
  border: 0;
  accent-color: #0071e3;
  cursor: pointer;
}

.boh-login-modal-container .boh-links-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.boh-login-modal-container .boh-form-links a {
  color: #86868b;
  text-decoration: none;
  font-weight: 500;
  transition: color 0.2s;
}

.boh-login-modal-container .boh-form-links a:hover {
  color: #0071e3;
}

/* 邮箱输入容器样式 */
.email-input-container {
  position: relative;
  width: 100%;
}

/* 邮箱后缀列表样式 */
.email-suffixes {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #ffffff;
  border: 1px solid #e5e5ea;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  margin-top: 4px;
  max-height: 200px;
  overflow-y: auto;
}

/* 邮箱后缀按钮样式 */
.email-suffix-btn {
  display: block;
  width: 100%;
  padding: 10px 16px;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: #1d1d1f;
  transition: background-color 0.2s ease;
}

.email-suffix-btn:hover {
  background-color: #f2f2f7;
}

/* ===================
   左右分栏布局样式
   =================== */

.login-split-container {
  display: flex;
  width: 100%;
  min-height: 100vh;
  background: #ffffff;
}

/* 左侧图片区域 */
.login-image-section {
  flex: 1;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-hero-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

.login-image-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg,
      rgba(0, 0, 0, 0.4) 0%,
      rgba(0, 0, 0, 0.2) 50%,
      rgba(0, 0, 0, 0.3) 100%);
  display: flex;
  align-items: flex-end;
  padding: 60px;
  box-sizing: border-box;
}

.login-brand {
  color: #ffffff;
  text-align: left;
}

.login-brand-logo {
  width: 64px;
  height: 64px;
  background-image: url("@/assets/images/favicon.webp");
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3));
  margin-bottom: 24px;
}

.login-brand h1 {
  margin: 0 0 12px;
  font-size: 48px;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.1;
  text-shadow: 0 2px 20px rgba(0, 0, 0, 0.3);
}

.login-brand p {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
  opacity: 0.9;
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.2);
}

/* 右侧表单区域 */
.login-form-section {
  flex: 0 0 480px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  background: #ffffff;
  box-sizing: border-box;
}

.login-form-wrapper {
  width: 100%;
  max-width: 360px;
}

.login-form-header {
  margin-bottom: 32px;
}

.login-form-header h2 {
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 700;
  color: #1d1d1f;
  letter-spacing: -0.02em;
}

.login-form-header p {
  margin: 0;
  font-size: 15px;
  color: #86868b;
  font-weight: 500;
}

/* 页面模式下的表单样式调整 */
.login-form-section .boh-login-form .boh-form-group {
  margin-bottom: 20px;
}

.login-form-section .boh-login-form label {
  display: block;
  margin-bottom: 8px;
  color: #1d1d1f;
  font-size: 13px;
  font-weight: 600;
}

.login-form-section .boh-login-form input {
  width: 100%;
  padding: 14px 16px;
  box-sizing: border-box;
  background: #f5f5f7;
  border: 2px solid transparent;
  border-radius: 12px;
  font-size: 15px;
  color: #1d1d1f;
  font-weight: 500;
  transition: all 0.2s ease;
  outline: none;
}

.login-form-section .boh-login-form input::placeholder {
  color: #98989d;
}

.login-form-section .boh-login-form input:focus {
  background: #ffffff;
  border-color: #0071e3;
  box-shadow: 0 4px 12px rgba(0, 113, 227, 0.1);
}

.login-form-section .boh-login-form input.boh-invalid {
  background: #fff2f2;
  border-color: #ff453a;
  color: #ff453a;
}

/* 页面模式下的登录按钮 */
.login-form-section .boh-login-btn {
  width: 100%;
  padding: 16px;
  background: #1d1d1f;
  border: none;
  border-radius: 99px;
  color: #ffffff;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  margin-top: 8px;
}

.login-form-section .boh-login-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
  background: #000000;
}

.login-form-section .boh-login-btn:active {
  transform: translateY(0) scale(0.97);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.login-form-section .boh-login-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* 通行密钥（指纹/面容）次要入口 —— 两套布局共用，能力检测通过才渲染 */
.boh-passkey-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 13px;
  margin-top: 10px;
  background: rgba(0, 113, 227, 0.06);
  border: 1px solid rgba(0, 113, 227, 0.35);
  border-radius: 99px;
  color: #0071e3;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.boh-passkey-btn:hover:not(:disabled) {
  background: rgba(0, 113, 227, 0.12);
}

.boh-passkey-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.boh-passkey-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.boh-passkey-error {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #ff453a;
}

/* 页面模式下的表单链接 */
.login-form-section .boh-form-links {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 8px 0 24px;
  font-size: 13px;
}

.login-form-section .boh-remember-me {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  color: #1d1d1f;
  font-weight: 500;
}

.login-form-section .boh-remember-me input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: #1d1d1f;
  cursor: pointer;
}

.login-form-section .boh-form-links a {
  color: #86868b;
  text-decoration: none;
  font-weight: 500;
  transition: color 0.2s;
}

.login-form-section .boh-form-links a:hover {
  color: #0071e3;
}

/* 页面模式下的错误提示 */
.login-form-section .boh-auth-error {
  color: #ff453a;
  background: #fff2f2;
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  margin-bottom: 20px;
  border: 1px solid rgba(255, 69, 58, 0.1);
}

.login-form-section .boh-error-message {
  color: #ff453a;
  font-size: 12px;
  font-weight: 500;
  margin-top: 6px;
  display: none;
}

.login-form-section input.boh-invalid+.boh-error-message {
  display: block;
}

/* 页面底部注册链接 */
.login-form-section .login-footer {
  margin-top: 24px;
  text-align: center;
}

.login-form-section .login-footer p {
  color: #86868b;
  font-size: 14px;
  font-weight: 500;
  margin: 0;
}

.login-form-section .login-footer a {
  color: #0071e3;
  text-decoration: none;
  font-weight: 600;
  transition: opacity 0.2s;
}

.login-form-section .login-footer a:hover {
  opacity: 0.8;
}

/* ===================
   横屏导航衍生灵动岛
   ===================
   横屏登录不再盖住页面或使用居中弹窗。导航会先变为浮岛，表单卡片
   从导航底部沿同一条中心轴展开，保留完整的登录内容和滚动能力。
   断点与 UnifiedNavbar 的浮岛断点保持一致。
   =================== */
@media (orientation: landscape) and (min-width: 769px) {
  .boh-login-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex !important;
    align-items: flex-start;
    justify-content: center;
    padding: 0;
    background: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    overflow: hidden;
    isolation: isolate;
  }

  /* 下半岛：宽度必须与导航上半岛（.unified-nav-surface.has-login-card）同宽，
     两者拼成一整张登录岛。宽度走 --boh-login-island-width 单一源（tokens.css）——
     此处写 100% 或另写一份 min(860px,…) 都会让两个岛一宽一窄、岛形断裂。 */
  .boh-login-modal-container {
    position: relative;
    width: var(--boh-login-island-width);
    max-width: var(--boh-login-island-width);
    max-height: min(720px, calc(100dvh - 74px));
    min-height: 276px;
    /* Overlap the navigation by two pixels so two backdrop-filter surfaces
       cannot leave a sampling seam at their shared edge.
       导航上半岛：64px 高 + translateY(10px) → 底边 74px；故 72px 正好重叠 2px。 */
    margin-top: 72px;
    padding: 30px clamp(28px, 5vw, 64px) 34px;
    border: 1px solid rgba(255, 255, 255, 0.62);
    border-top: 0;
    border-radius: 0 0 30px 30px;
    background: #f7f7f5;
    box-shadow: 0 24px 70px rgba(15, 23, 42, 0.2);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    transform-origin: 50% 0;
    animation: landscapeLoginIslandIn 560ms cubic-bezier(0.16, 1, 0.3, 1) both;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(29, 29, 31, 0.18) transparent;
    z-index: 1;
  }

  .boh-login-modal-container::before {
    content: '';
    position: absolute;
    top: -1px;
    left: 50%;
    width: 112px;
    height: 4px;
    border-radius: 0 0 8px 8px;
    transform: translateX(-50%);
    background: linear-gradient(90deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.3));
    box-shadow: 0 1px 14px rgba(255, 255, 255, 0.92);
    pointer-events: none;
    display: none;
  }

  .boh-login-modal-container .boh-login-modal-header {
    width: 100%;
    min-height: 112px;
    margin: 0;
    padding: 8px 0 18px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: left;
    position: static;
  }

  .boh-login-modal-container .boh-login-logo {
    display: none;
  }

  .boh-login-modal-container .boh-login-modal-header h2 {
    display: none;
  }

  .boh-login-modal-container .boh-login-modal-header p {
    display: block;
    margin: 0;
    font-size: 15px;
    color: #86868b;
  }

  .boh-login-modal-container .boh-login-modal-header::after {
    width: 48px;
    height: 3px;
    margin: 17px 0 0;
  }

  .boh-login-modal-container .mobile-login-entry {
    position: absolute;
    top: 50%;
    right: clamp(28px, 6vw, 80px);
    display: grid;
    width: min(280px, 34%);
    margin: 0;
    gap: 14px;
    transform: translateY(-50%);
  }

  :global(html[data-theme="dark"] .boh-login-modal-container) {
    background: #1c1c1e;
  }

  .boh-login-modal-container .mobile-login-primary,
  .boh-login-modal-container .mobile-login-secondary {
    min-height: 54px;
    border: 0;
    border-radius: 99px;
    color: #fff;
    background: #1d1d1f;
    box-shadow: 0 8px 22px rgba(15, 23, 42, 0.08);
  }

  .boh-login-modal-container .mobile-login-primary:hover,
  .boh-login-modal-container .mobile-login-secondary:hover {
    background: #000;
  }

  .boh-login-modal-container > .boh-login-form {
    display: none;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: clamp(22px, 4vw, 48px);
    align-items: start;
  }

  .boh-login-modal-container > .boh-login-form .boh-form-group,
  .boh-login-modal-container > .boh-login-form .login-altcha-wrap,
  .boh-login-modal-container > .boh-login-form .agreement-section,
  .boh-login-modal-container > .boh-login-form .boh-form-links,
  .boh-login-modal-container > .boh-login-form .boh-login-btn {
    grid-column: 1 / -1;
  }

  .boh-login-modal-container > .boh-login-form .boh-form-group:nth-child(1),
  .boh-login-modal-container > .boh-login-form .boh-form-group:nth-child(2) {
    grid-column: span 1;
  }

  .boh-login-modal-container .boh-login-form .boh-form-group {
    margin-bottom: 16px;
  }

  .boh-login-modal-container .boh-login-form input {
    min-height: 58px;
    padding: 15px 18px;
    border: 1px solid rgba(29, 29, 31, 0.1);
    border-radius: 16px;
    background: #ffffff;
    color: #1d1d1f;
    /* 这个输入框的底色是无条件白，所以它必须显式声明浅色 color-scheme：
       否则暗色主题下插字符/自动填充/日期选择器会按暗色渲染在白色面板上。
       这是有意为之，不是"暗色未适配"，不要删（全局规则见 src/style.css 的 P0 段）。 */
    color-scheme: light;
    caret-color: #0071e3;
    box-shadow: inset 0 1px 2px rgba(29, 29, 31, 0.04), 0 1px 0 rgba(255, 255, 255, 0.72);
    font-size: 16px;
    line-height: 1.2;
    transition: border-color 180ms ease, box-shadow 180ms ease, background-color 180ms ease;
  }

  .boh-login-modal-container .boh-login-form input::placeholder {
    color: #8b8b93;
  }

  .boh-login-modal-container .boh-login-form input:hover {
    border-color: rgba(29, 29, 31, 0.18);
  }

  .boh-login-modal-container .boh-login-form input:focus {
    border-color: #0071e3;
    background: #ffffff;
    box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.14), inset 0 1px 2px rgba(29, 29, 31, 0.03);
  }

  .boh-login-modal-container .boh-login-form input.boh-invalid {
    border-color: #ff453a;
    background: #fffafa;
    box-shadow: 0 0 0 3px rgba(255, 69, 58, 0.1);
  }

  /* The horizontal layout's generic input rule must never leak onto
     checkboxes. Keep the control and its copy on one optical baseline. */
  .boh-login-modal-container .boh-login-form .agreement-checkbox input[type="checkbox"],
  .boh-login-modal-container .boh-login-form .boh-remember-me input[type="checkbox"] {
    appearance: auto;
    -webkit-appearance: checkbox;
    width: 16px;
    min-width: 16px;
    height: 16px;
    min-height: 16px;
    margin: 0;
    padding: 0;
    border: 0;
    box-shadow: none;
    border-radius: 3px;
    justify-self: start;
  }

  .boh-login-modal-container .boh-login-form .agreement-checkbox,
  .boh-login-modal-container .boh-login-form .boh-remember-me {
    align-items: center;
  }

  .boh-login-modal-container .boh-login-form .agreement-text {
    line-height: 20px;
  }

  .boh-login-modal-container .boh-password-wrap input {
    padding-right: 78px;
  }

  .boh-login-modal-container .boh-toggle-password {
    right: 12px;
    min-width: 52px;
    color: #6e6e76;
    font-size: 14px;
    font-weight: 650;
  }

  .boh-login-modal-container .boh-toggle-password:hover {
    color: #1d1d1f;
  }

  .boh-login-modal-container .boh-auth-error {
    margin-bottom: 18px;
  }

  .boh-login-modal-container .agreement-section {
    margin: 2px 0 10px;
  }

  .boh-login-modal-container .boh-form-links {
    margin: 4px 0 14px;
  }

  .boh-login-modal-container .boh-login-btn {
    margin-top: 0;
  }

  .boh-login-modal-close {
    top: 22px;
    right: 24px;
    width: 36px;
    height: 36px;
    background: rgba(245, 245, 247, 0.8);
    border: 1px solid rgba(29, 29, 31, 0.08);
    backdrop-filter: var(--liquid-filter-sm);
    -webkit-backdrop-filter: var(--liquid-filter-sm);
  }

  /* Beta 6 导航本身是 64px 高并下移 10px，卡片必须以其真实底边为锚点。
     宽度/上边距已在文件上方的 .boh-login-modal-container 里定义一次即可；
     此处原先的 :global() 覆盖（宽度 860、margin-top 72px）因优先级低于
     带 scoped 属性的同名规则而从未生效，已删除，避免出现第二份宽度定义。 */

  /* 点击“登录 BOH”后，仍在同一张岛卡内切换到完整表单。 */
  .boh-login-modal-overlay.mobile-form-open .boh-login-modal-container {
    display: block;
    min-height: 0;
    padding-top: 26px;
    border-radius: 0 0 30px 30px;
  }

  .mobile-form-open .boh-login-modal-container .boh-login-modal-header {
    width: auto;
    min-height: 0;
    padding: 0;
    margin-bottom: 18px;
  }

  .mobile-form-open .boh-login-modal-container .mobile-login-entry {
    display: none;
  }

  .mobile-form-open .boh-login-modal-container > .boh-login-form {
    display: grid;
  }

  .mobile-form-open .boh-login-modal-container > .boh-auth-error {
    display: block;
  }

  /* Success is a quiet material state on desktop as well. It fades in over
     the form, then the whole surface returns to the navigation island. */
  .boh-login-modal-container > .mobile-success-state {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 12px;
    color: #1d1d1f;
    background: #f7f7f5;
    animation: loginSuccessReveal 360ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  :global(html[data-theme="dark"] .boh-login-modal-container > .mobile-success-state) {
    color: #f5f5f7;
    background: #1c1c1e;
  }

  .boh-login-modal-container > .mobile-success-state .boh-login-logo {
    display: block;
    width: 64px;
    height: 64px;
    margin: 0;
  }

  .boh-login-modal-container > .mobile-success-state strong {
    font-size: 18px;
    font-weight: 700;
  }

  /* 收起（回收）：整卡缩进导航灵动岛。整卡从 860×276 收拢成 241×77 并落在
     导航胶囊那一条上（origin 50% 0 + translateY(-62px)）。

     ⚠️ 必须用 animation 而不是 transition，也不能只写 `animation: none` + transform：
     该卡的 transform / border-radius / opacity 在展开态是「入场动画
     landscapeLoginIslandIn 用 fill-mode both 停住的值」。浏览器在
     「移除动画 + 同帧改该属性」时**不会**为这次变化启动过渡 —— 属性值一帧直接
     跳到终值（实测 1440×900：加类瞬间即 matrix(0.28,0,0,0.28,0,-62)、opacity 0，
     860×276@290,72 → 241×77@600,10，中间零帧；另一条 760ms 的 transition 声明
     在这里形同虚设）。显式关键帧动画不受此限制，且优先级高于任何普通声明。 */
  .boh-login-modal-overlay.mobile-login-closing .boh-login-modal-container {
    animation: landscapeLoginIslandOut 760ms cubic-bezier(0.22, 1, 0.36, 1) both;
    pointer-events: none;
    transform-origin: 50% 0;
  }

  /* 成功浮层同理：它的透明度由 loginSuccessReveal（fill-mode both）停住，
     写 opacity: 0 + transition 同样只会闪断 */
  .boh-login-modal-overlay.mobile-login-closing .mobile-success-state {
    animation: loginSuccessFade 260ms ease both;
  }
}

/* 横屏登录岛回收：展开位 → 导航胶囊位（与 navbar 的浮岛断点同款终态） */
@keyframes landscapeLoginIslandOut {
  from {
    transform: none;
    border-radius: 0 0 30px 30px;
    opacity: 1;
  }
  to {
    transform: translateY(-62px) scale(0.28);
    border-radius: 30px;
    opacity: 0;
  }
}

/* 登录成功浮层淡出（横竖屏共用） */
@keyframes loginSuccessFade {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes landscapeLoginIslandIn {
  from {
    opacity: 0;
    filter: blur(8px);
    transform: translateY(-18px) scale(0.92);
    clip-path: inset(0 0 100% 0 round 0 0 30px 30px);
  }
  to {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0) scale(1);
    /* The top edge belongs to the navigation surface; only the lower edge
       remains rounded so the two surfaces read as one island. */
    clip-path: inset(0 round 0 0 30px 30px);
  }
}

@media (orientation: landscape) and (min-width: 769px) and (max-height: 620px) {
  .boh-login-modal-container {
    max-height: calc(100dvh - 84px);
    margin-top: 74px;
    min-height: 246px;
    padding-top: 24px;
    padding-bottom: 24px;
  }

  .boh-login-modal-container .boh-login-modal-header {
    margin-bottom: 16px;
  }

  .boh-login-modal-container .mobile-login-entry {
    right: 24px;
    width: min(260px, 36%);
  }
}

/* ===================
   响应式适配
   =================== */

@media (max-width: 900px) {
  .login-image-section {
    display: none;
  }

  .login-form-section {
    flex: 1;
    padding: 24px;
  }

  .login-form-wrapper {
    max-width: 400px;
  }
}

@media (max-width: 480px) {
  .login-form-section {
    padding: 20px;
  }

  .login-form-header h2 {
    font-size: 24px;
  }

  .login-form-section .boh-login-form input {
    padding: 12px 14px;
  }

  .login-form-section .boh-login-btn {
    padding: 14px;
  }
}

/* 移动端灵动岛式登录层 */
.mobile-login-entry,
.mobile-success-state {
  display: none;
}

/* The account-choice surface is the modal's default state at every desktop
   size. The form is only revealed after the user explicitly chooses login. */
@media (min-width: 769px) {
  .boh-login-modal-overlay:not(.mobile-form-open) .boh-login-modal-container > .boh-login-form,
  .boh-login-modal-overlay:not(.mobile-form-open) .boh-login-modal-container > .boh-auth-error {
    display: none;
  }

  .boh-login-modal-overlay:not(.mobile-form-open) .boh-login-modal-container .mobile-login-entry {
    display: grid;
  }

  .boh-login-modal-overlay:not(.mobile-form-open) .boh-login-modal-container .mobile-login-primary,
  .boh-login-modal-overlay:not(.mobile-form-open) .boh-login-modal-container .mobile-login-secondary {
    min-height: 54px;
    border: 0;
    border-radius: 999px;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .boh-login-modal-overlay:not(.mobile-form-open) .boh-login-modal-container .mobile-login-primary {
    color: #fff;
    background: #1d1d1f;
  }

  .boh-login-modal-overlay:not(.mobile-form-open) .boh-login-modal-container .mobile-login-secondary {
    color: #1d1d1f;
    background: #e8e8ed;
  }
}

@media (orientation: portrait) and (min-width: 769px) {
  .boh-login-modal-overlay:not(.mobile-form-open) .boh-login-modal-container .mobile-login-entry {
    position: static;
    width: min(100%, 320px);
    margin: 28px auto 0;
    gap: 12px;
  }
}

@media (max-width: 768px) {
  .boh-login-modal-overlay,
  .login-page {
    --mobile-safe-x: clamp(20px, 6vw, 32px);
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: block;
    overflow: hidden;
    padding: 0;
    background: #fff;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .boh-login-modal-container,
  .login-split-container {
    position: absolute;
    inset: 0;
    width: 100%;
    max-width: none;
    max-height: none;
    min-height: 100%;
    border-radius: 0;
    padding: calc(76px + env(safe-area-inset-top)) var(--mobile-safe-x) calc(28px + env(safe-area-inset-bottom));
    background: rgba(255, 255, 255, 0.84);
    box-shadow: 0 -18px 54px rgba(15, 23, 42, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.9);
    backdrop-filter: var(--liquid-filter);
    -webkit-backdrop-filter: var(--liquid-filter);
    transform-origin: 50% 0;
    transform: translateY(calc(-100% + 150px)) scaleX(0.86);
    opacity: 0.98;
    overflow-y: auto;
    transition: transform 560ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 560ms cubic-bezier(0.22, 1, 0.36, 1), padding 360ms ease, opacity 300ms ease;
  }

  .boh-login-modal-container::before,
  .login-split-container::before {
    content: '';
    position: absolute;
    top: 0;
    left: 50%;
    width: 92px;
    height: 5px;
    border-radius: 0 0 8px 8px;
    transform: translateX(-50%);
    background: linear-gradient(90deg, rgba(255,255,255,0.32), rgba(255,255,255,0.98), rgba(255,255,255,0.32));
    box-shadow: 0 1px 12px rgba(255,255,255,0.9);
    pointer-events: none;
    z-index: 4;
  }

  .boh-login-modal-overlay.mobile-form-open .boh-login-modal-container,
  .login-page.mobile-form-open .login-split-container,
  .boh-login-modal-overlay.mobile-login-success .boh-login-modal-container,
  .login-page.mobile-login-success .login-split-container {
    transform: translateY(0) scaleX(1);
    border-radius: 0;
  }

  .boh-login-modal-overlay.mobile-login-closing .boh-login-modal-container,
  .login-page.mobile-login-closing .login-split-container {
    transform: translateY(calc(-100% + 150px)) scaleX(0.86);
    border-radius: 0 0 28px 28px;
  }

  .boh-login-modal-container {
    display: flex;
    flex-direction: column;
  }

  .boh-login-modal-header,
  .login-form-header {
    margin: auto 0 0;
    padding-bottom: 26px;
    text-align: center;
  }

  .boh-login-modal-header h2,
  .login-form-header h2 {
    font-size: 30px;
    letter-spacing: -0.025em;
  }

  .boh-login-modal-header p,
  .login-form-header p {
    font-size: 15px;
  }

  .boh-login-logo {
    width: 64px;
    height: 64px;
    margin-bottom: 18px;
  }

  .mobile-login-entry {
    display: grid;
    gap: 11px;
    width: min(100%, 360px);
    margin: 30px auto 0;
  }

  .mobile-login-primary,
  .mobile-login-secondary {
    position: relative;
    min-height: 52px;
    border-radius: 99px;
    border: 0;
    font: inherit;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
  }

  .mobile-login-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: #fff;
    background: #1d1d1f;
    border: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .mobile-login-primary::after {
    display: none;
  }

  .mobile-login-pill-mark {
    display: none;
  }

  .mobile-login-secondary {
    color: #fff;
    background: #1d1d1f;
    border: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .mobile-login-primary:active,
  .mobile-login-secondary:active {
    transform: scale(0.975);
  }

  .mobile-login-primary:hover,
  .mobile-login-secondary:hover {
    transform: translateY(-2px);
    background: #000;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
  }

  .boh-login-modal-container > .boh-login-form,
  .boh-login-modal-container > .boh-auth-error,
  .login-form-section .boh-login-form,
  .login-form-section > .boh-auth-error,
  .login-form-section .login-footer {
    opacity: 0;
    transform: translateY(18px);
    pointer-events: none;
    transition: opacity 260ms ease 90ms, transform 420ms cubic-bezier(0.22, 1, 0.36, 1) 90ms;
  }

  .mobile-form-open .boh-login-modal-container > .boh-login-form,
  .mobile-form-open .boh-login-modal-container > .boh-auth-error,
  .mobile-form-open .login-form-section .boh-login-form,
  .mobile-form-open .login-form-section > .boh-auth-error,
  .mobile-form-open .login-form-section .login-footer {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  .mobile-form-open .mobile-login-entry {
    opacity: 0;
    transform: translateY(-12px);
    pointer-events: none;
    transition: opacity 220ms ease, transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
    animation: mobileIslandButtonExit 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .mobile-form-open .boh-login-modal-header,
  .mobile-form-open .login-form-header {
    animation: mobileBrandCollapse 560ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .mobile-form-open .boh-login-form .boh-form-group {
    opacity: 0;
    transform: translateY(14px);
    animation: mobileFieldEnter 460ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }

  .mobile-form-open .boh-login-form .boh-form-group:nth-child(1) { animation-delay: 120ms; }
  .mobile-form-open .boh-login-form .boh-form-group:nth-child(2) { animation-delay: 180ms; }
  .mobile-form-open .boh-login-form .boh-form-group:nth-child(3) { animation-delay: 240ms; }

  .mobile-success-state {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 12px;
    color: #1d1d1f;
    background: rgba(255,255,255,0.86);
    backdrop-filter: var(--liquid-filter);
    -webkit-backdrop-filter: var(--liquid-filter);
    animation: mobileSuccessIn 260ms ease both;
  }

  .mobile-success-state .boh-login-logo {
    margin: 0;
  }

  .mobile-success-state strong {
    font-size: 18px;
    font-weight: 700;
  }

  .mobile-login-success .mobile-success-state {
    animation: mobileSuccessIn 260ms ease both;
  }

  .boh-login-modal-close {
    top: calc(20px + env(safe-area-inset-top));
    right: var(--mobile-safe-x);
    width: 38px;
    height: 38px;
    background: rgba(255,255,255,0.68);
    border: 1px solid rgba(29,29,31,0.1);
    backdrop-filter: var(--liquid-filter-sm);
    -webkit-backdrop-filter: var(--liquid-filter-sm);
  }

  .login-image-section {
    display: none;
  }

  .login-form-section {
    display: flex;
    min-height: 100%;
    padding: 0;
  }

  .login-form-wrapper {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: none;
  }

  .login-form-section .login-form-header {
    margin-top: auto;
  }

  /* 收起态使用独立的顶部岛屿尺寸，避免整块页面被移出视口 */
  .boh-login-modal-container,
  .login-split-container {
    inset: calc(12px + env(safe-area-inset-top)) auto auto 50%;
    width: min(310px, calc(100% - 32px));
    height: 144px;
    min-height: 144px;
    padding: 18px 16px 14px;
    border-radius: 26px;
    transform: translateX(-50%) scale(0.98);
    transform-origin: 50% 0;
    overflow: hidden;
    transition: inset 560ms cubic-bezier(0.22, 1, 0.36, 1), width 560ms cubic-bezier(0.22, 1, 0.36, 1), height 560ms cubic-bezier(0.22, 1, 0.36, 1), min-height 560ms cubic-bezier(0.22, 1, 0.36, 1), transform 560ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 560ms cubic-bezier(0.22, 1, 0.36, 1), padding 360ms ease;
  }

  .boh-login-modal-container .boh-login-modal-header,
  .login-split-container .login-form-header {
    margin: 0;
    padding: 0;
  }

  .boh-login-modal-container .boh-login-modal-header > .boh-login-logo,
  .boh-login-modal-container .boh-login-modal-header > h2,
  .boh-login-modal-container .boh-login-modal-header > p,
  .login-split-container .login-form-header > h2,
  .login-split-container .login-form-header > p {
    display: none;
  }

  .boh-login-modal-container .mobile-login-entry,
  .login-split-container .mobile-login-entry {
    margin: 0;
    width: 100%;
  }

  .boh-login-modal-container .mobile-login-primary,
  .login-split-container .mobile-login-primary {
    min-height: 54px;
  }

  .boh-login-modal-container .mobile-login-secondary,
  .login-split-container .mobile-login-secondary {
    min-height: 42px;
    color: #fff;
    background: #1d1d1f;
    border: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .boh-login-modal-container .boh-login-form input,
  .login-split-container .boh-login-form input {
    color: #1d1d1f;
    background: #f5f5f7;
    border: 1px solid #e1e1e6;
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.03);
  }

  .boh-login-modal-container .boh-login-form input::placeholder,
  .login-split-container .boh-login-form input::placeholder {
    color: #8b8b93;
  }

  .boh-login-modal-container .boh-login-form input:focus,
  .login-split-container .boh-login-form input:focus {
    background: #fff;
    border-color: #0071e3;
    box-shadow: 0 0 0 3px rgba(0,113,227,0.12);
  }

  .boh-login-modal-container .boh-toggle-password,
  .login-split-container .boh-toggle-password {
    color: #6e6e76;
  }

  .boh-login-modal-container .boh-login-modal-close {
    display: none;
  }

  .login-split-container .login-form-section {
    min-height: 0;
  }

  .login-split-container .login-form-wrapper {
    min-height: 0;
  }

  .mobile-form-open .boh-login-modal-container,
  .mobile-login-success .boh-login-modal-container,
  .mobile-form-open .login-split-container,
  .mobile-login-success .login-split-container {
    inset: 0;
    width: 100%;
    height: var(--boh-visual-height, 100dvh);
    min-height: var(--boh-visual-height, 100dvh);
    padding: calc(76px + env(safe-area-inset-top)) var(--mobile-safe-x) calc(28px + env(safe-area-inset-bottom));
    border-radius: 0;
    transform: translateX(-50%) scale(1);
    overflow-y: auto;
  }

  .boh-login-modal-overlay.mobile-form-open .boh-login-modal-container,
  .boh-login-modal-overlay.mobile-login-success .boh-login-modal-container,
  .login-page.mobile-form-open .login-split-container,
  .login-page.mobile-login-success .login-split-container {
    transform: translateX(0) scale(1);
  }

  .mobile-form-open .boh-login-modal-container .boh-login-modal-header,
  .mobile-form-open .login-split-container .login-form-header {
    margin: auto 0 0;
    padding-bottom: 26px;
  }

  .mobile-form-open .boh-login-modal-container .boh-login-modal-header > .boh-login-logo,
  .mobile-form-open .boh-login-modal-container .boh-login-modal-header > h2,
  .mobile-form-open .boh-login-modal-container .boh-login-modal-header > p,
  .mobile-form-open .login-split-container .login-form-header > h2,
  .mobile-form-open .login-split-container .login-form-header > p {
    display: block;
  }

  .mobile-form-open .mobile-login-entry {
    margin: 30px auto 0;
  }

  /* 收起（回收）动画：整卡缩回顶部灵动岛并淡出。
     只动 transform / opacity / border-radius（合成器属性），不碰 inset/width/height
     这类布局属性（旧实现直接切布局尺寸 = 单帧瞬跳，也是「卡一下」的来源）；
     动画期间关掉两层叠加的 backdrop-filter，避免逐帧重算模糊。

     ⚠️ 必须用 animation，不能写成 `animation: none` + transform + transition：
     展开态这张卡的 transform / border-radius / opacity 是「入场动画
     mobileIslandAppear 用 fill-mode both 停住的值」。浏览器在「移除动画 + 同帧改
     该属性」时不会为这次变化启动过渡 —— 值一帧直接跳到终值，中间没有任何帧
     （实测 390×844：加类瞬间即 matrix(0.86,0,0,1,0,-694) / opacity 0，
     随后 720ms 静止不动，到点整块消失，观感就是「啪地闪掉」）。
     显式关键帧动画不受此限制，且优先级高于一切普通声明。 */
  .mobile-login-closing .boh-login-modal-container,
  .mobile-login-closing .login-split-container {
    animation: mobileIslandRetract 680ms cubic-bezier(0.32, 0.72, 0.28, 1) both;
    transform-origin: 50% 84px;
    pointer-events: none;
    overflow: hidden;
    will-change: transform, opacity;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  /* 成功浮层同理：它的透明度由 mobileSuccessIn（fill-mode both）停住，
     写 opacity: 0 + transition 同样只会闪断 */
  .mobile-login-closing .mobile-success-state {
    animation: loginSuccessFade 260ms ease both;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  /* 初始竖屏状态：品牌主视觉占屏，操作固定在底部 */
  .boh-login-modal-container,
  .login-split-container {
    inset: 0;
    width: 100%;
    height: var(--boh-visual-height, 100dvh);
    min-height: var(--boh-visual-height, 100dvh);
    padding: calc(28px + env(safe-area-inset-top)) var(--mobile-safe-x) calc(24px + env(safe-area-inset-bottom));
    border-radius: 0;
    transform: none;
    overflow: hidden;
    transition: opacity 420ms ease, transform 760ms cubic-bezier(0.22, 1, 0.36, 1);
    animation: mobileIslandAppear 900ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .boh-login-modal-container .boh-login-modal-header,
  .login-split-container .login-form-header {
    position: static;
    display: flex;
    flex: 1;
    min-height: 0;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    margin: 0;
    padding: 0;
  }

  .boh-login-modal-container .boh-login-modal-header > .boh-login-logo,
  .login-split-container .login-form-header > .boh-login-logo,
  .boh-login-modal-container .boh-login-modal-header > h2,
  .boh-login-modal-container .boh-login-modal-header > p,
  .login-split-container .login-form-header > h2,
  .login-split-container .login-form-header > p {
    display: block;
  }

  .boh-login-modal-container .boh-login-logo,
  .login-split-container .boh-login-logo {
    width: 112px;
    height: 112px;
    margin-bottom: 28px;
    filter: drop-shadow(0 14px 26px rgba(0,0,0,0.14));
  }

  .boh-login-modal-container .boh-login-modal-header h2,
  .login-split-container .login-form-header h2 {
    font-size: clamp(34px, 9vw, 42px);
    line-height: 1.1;
  }

  .boh-login-modal-container .mobile-login-entry,
  .login-split-container .mobile-login-entry {
    position: absolute;
    right: auto;
    bottom: calc(38px + env(safe-area-inset-bottom));
    left: 50%;
    width: min(320px, calc(100% - 24px));
    margin: 0;
    transform: translateX(-50%);
  }

  .boh-login-modal-container .mobile-login-primary,
  .login-split-container .mobile-login-primary,
  .boh-login-modal-container .mobile-login-secondary,
  .login-split-container .mobile-login-secondary {
    min-height: 54px;
    border-radius: 99px;
  }

  .boh-login-modal-container .boh-login-modal-close {
    display: flex;
  }

  .mobile-form-open .boh-login-modal-container .boh-login-modal-header,
  .mobile-form-open .login-split-container .login-form-header {
    position: relative;
    flex: 0 0 auto;
    min-height: 0;
    padding-bottom: 26px;
  }

  .mobile-form-open .boh-login-modal-container .boh-login-logo,
  .mobile-form-open .login-split-container .boh-login-logo {
    width: 64px;
    height: 64px;
    margin-bottom: 18px;
  }

  .mobile-form-open .boh-login-modal-container .mobile-login-entry,
  .mobile-form-open .login-split-container .mobile-login-entry {
    position: static;
    width: min(100%, 360px);
    margin: 30px auto 0;
    transform: none;
  }

  .mobile-form-open .boh-login-modal-container .boh-login-modal-header h2,
  .mobile-form-open .login-split-container .login-form-header h2 {
    font-size: 30px;
  }

  /* ⚠️ 这里曾有一条同名规则（transform: translateX(-50%) scale(0.32) translateY(-42vh)），
     是 2026-09-04 那版回收动画的残留。它与文件上方那条同特异性但源序更后，静默压掉后者，
     同时 translateX(-50%) 在基础盒（inset:0 / width:100%）上等于左移半个视口 →
     就算生效也是朝左上角飞出屏幕，而不是收进顶部灵动岛。已删除，回收只保留上方一处定义。 */

  .mobile-keyboard-open .boh-login-modal-container,
  .mobile-keyboard-open .login-split-container {
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }

  .mobile-keyboard-open .boh-login-modal-container .boh-login-modal-header,
  .mobile-keyboard-open .login-split-container .login-form-header {
    padding-bottom: 12px;
  }

  .mobile-keyboard-open .boh-login-modal-container .boh-login-logo,
  .mobile-keyboard-open .login-split-container .boh-login-logo {
    width: 42px;
    height: 42px;
    margin-bottom: 8px;
  }

  .mobile-keyboard-open .boh-login-modal-container .boh-login-modal-header h2,
  .mobile-keyboard-open .login-split-container .login-form-header h2 {
    font-size: 22px;
  }

  .mobile-keyboard-open .boh-login-modal-container .boh-login-modal-header p,
  .mobile-keyboard-open .login-split-container .login-form-header p,
  .mobile-keyboard-open .mobile-login-entry {
    display: none;
  }
}

@keyframes mobileIslandAppear {
  from {
    transform: translateY(-42vh) scale(0.32);
    border-radius: 30px;
    opacity: 0.82;
  }
  62% {
    transform: translateY(8px) scale(0.985);
    border-radius: 18px;
    opacity: 1;
  }
  to {
    transform: none;
    border-radius: 0;
    opacity: 1;
  }
}

/* 竖屏登录回收：整屏卡 → 顶部灵动岛带状（origin 50% 84px = 顶隙 12px + 岛半高 72px）。
   0.82 × 0.16 的非等比缩放是按 390×844 反推的收拢终态：宽 320（≈岛宽 310）
   / 高 135（≈岛高 144）；-6vh 上移后终态中心 ≈ 84px = 岛中心，与岛重合
   （等比缩放只会缩成一块方块，读不出「收进岛里」）。 */
@keyframes mobileIslandRetract {
  from {
    transform: none;
    border-radius: 0;
    opacity: 1;
  }
  to {
    transform: translateY(-6vh) scale(0.82, 0.16);
    border-radius: 64px;
    opacity: 0;
  }
}

@keyframes mobileIslandButtonExit {
  from { opacity: 1; transform: translateY(0) scale(1); }
  45% { opacity: 1; transform: translateY(-8px) scale(0.98); }
  to { opacity: 0; transform: translateY(-18px) scale(0.94); }
}

@keyframes mobileBrandCollapse {
  from { transform: translateY(0) scale(1); opacity: 1; }
  to { transform: translateY(-8px) scale(0.92); opacity: 0.82; }
}

@keyframes mobileFieldEnter {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes mobileSuccessIn {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes loginSuccessReveal {
  from { opacity: 0; transform: scale(0.985); }
  to { opacity: 1; transform: scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .boh-login-modal-container,
  .login-split-container,
  .boh-login-modal-container > .boh-login-form,
  .login-form-section .boh-login-form,
  .mobile-login-entry,
  .mobile-success-state {
    transition: opacity 180ms ease !important;
    animation: none !important;
    transform: none !important;
  }

  /* 回收态在 reduce 下退化为「只淡出」——上面的 !important 已经把 animation 与
     transform 锁死，两个回收关键帧都不会跑；这里补终值，让 close 仍是一次可见的
     渐隐而不是到点消失。（opacity 不在上面那份 !important 列表里，能正常生效；
     用 !important 会顶破 important-budget 棘轮，故不加。） */
  .mobile-login-closing .boh-login-modal-container,
  .mobile-login-closing .login-split-container,
  .mobile-login-closing .mobile-success-state {
    opacity: 0;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .boh-login-modal-container,
  .login-split-container,
  .mobile-success-state,
  .mobile-login-secondary,
  .boh-login-modal-close {
    background: #fff;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
</style>
