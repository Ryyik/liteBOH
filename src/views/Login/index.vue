<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import AltchaWidget from '@/components/AltchaWidget.vue';
import AgreementModal from '@/components/AgreementModal.vue';
import { userAgreementContent, privacyPolicyContent } from '@/data/agreementData.js';
import DOMPurify from '@/utils/dompurify.js'; // 修复：添加 DOMPurify 防止 XSS
import { getLoginDeviceIdHash } from '@/utils/device-trust.js';
import { getAltchaChallengeUrl, isAltchaEnabled } from '@/utils/altcha.js';
import { getImageUrl } from '@/utils/asset-helper.js';
import { logger } from '@/utils/logger.js';
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

const loginButtonDisabled = computed(() => {
  return isSubmitting.value || !loginForm.agreedToTerms;
});

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
    authError.value = '';
    emailInvalid.value = false;
    passwordInvalid.value = false;
    void resetAltcha({ hide: true });
  }
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
      if (props.isModal) {
        emit('success');
        handleClose();
      } else {
        router.push('/');
      }
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

onMounted(() => {
  const rememberedFlag = localStorage.getItem(REMEMBER_ME_STORAGE_KEY);
  if (rememberedFlag === '1' || rememberedFlag === '0') {
    loginForm.rememberMe = rememberedFlag === '1';
  }

  const rememberedEmail = localStorage.getItem('boh_remember_email');
  if (rememberedEmail && loginForm.rememberMe) {
    loginForm.loginId = rememberedEmail;
  }

  // 读取协议勾选状态
  const agreedToTermsFlag = localStorage.getItem(AGREED_TO_TERMS_KEY);
  if (agreedToTermsFlag === '1') {
    loginForm.agreedToTerms = true;
  }

  if (typeof AOS !== "undefined") {
    AOS.init({
      duration: 800,
    });
  }
  document.body.classList.add("is-loaded");

  document.addEventListener('click', handleClickOutside);
  void warmLoginDeviceIdHash();
});

watch(
  () => props.show,
  async (visible) => {
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
});
</script>

<template>
  <div v-if="!isModal || show" :class="[isModal ? 'boh-login-modal-overlay' : 'login-page']"
    @click="isModal ? handleClose() : null">

    <!-- 模态框模式保持原有布局 -->
    <template v-if="isModal">
      <div class="boh-login-modal-container" @click.stop>
        <button v-if="isModal" class="boh-login-modal-close" @click="handleClose" aria-label="关闭">&times;</button>

        <div class="boh-login-modal-header">
          <div class="boh-login-logo"></div>
          <h2>方块之家</h2>
          <p>这里不只有方块。</p>
        </div>

        <div v-if="authError" class="boh-auth-error">
          {{ authError }}
        </div>

        <form class="boh-login-form" @submit.prevent="handleLogin">
          <div class="boh-form-group">
            <label for="loginId">邮箱 / 方块 ID</label>
            <div class="email-input-container">
              <input type="text" id="loginId" v-model="loginForm.loginId" placeholder="请输入邮箱或方块 ID" autocapitalize="off"
                autocorrect="off" spellcheck="false" :class="{ 'boh-invalid': emailInvalid }" @input="handleEmailInput"
                @focus="handleEmailFocus" required />
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
                placeholder="请输入你的密码" :class="{ 'boh-invalid': passwordInvalid }" required />
              <button type="button" class="boh-toggle-password" @click="togglePassword">
                {{ showPassword ? '隐藏' : '显示' }}
              </button>
            </div>
            <div class="boh-error-message">密码长度至少6位</div>
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
              <a href="/join" @click.prevent="handleRegister">注册 BOH ID</a>
            </div>
          </div>

          <button type="submit" class="boh-login-btn" :disabled="loginButtonDisabled">
            {{ isSubmitting ? '登录中...' : '登录' }}
          </button>
        </form>
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
            <div class="login-form-header">
              <h2>欢迎回来</h2>
              <p>登录你的 BOH ID</p>
            </div>

            <div v-if="authError" class="boh-auth-error">
              {{ authError }}
            </div>

            <form class="boh-login-form" @submit.prevent="handleLogin">
              <div class="boh-form-group">
                <label for="loginId">邮箱 / 方块 ID</label>
                <div class="email-input-container">
                  <input type="text" id="loginId" v-model="loginForm.loginId" placeholder="请输入邮箱或方块 ID"
                    autocapitalize="off" autocorrect="off" spellcheck="false" :class="{ 'boh-invalid': emailInvalid }"
                    @input="handleEmailInput" @focus="handleEmailFocus" required />
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
                    placeholder="请输入你的密码" :class="{ 'boh-invalid': passwordInvalid }" required />
                  <button type="button" class="boh-toggle-password" @click="togglePassword">
                    {{ showPassword ? '隐藏' : '显示' }}
                  </button>
                </div>
                <div class="boh-error-message">密码长度至少6位</div>
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
                </div>
              </div>

              <button type="submit" class="boh-login-btn" :disabled="loginButtonDisabled">
                {{ isSubmitting ? '登录中...' : '登录' }}
              </button>
            </form>

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
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.agreement-checkbox input[type="checkbox"] {
  margin-top: 2px;
  width: 16px;
  height: 16px;
  accent-color: #0071e3;
  cursor: pointer;
  flex-shrink: 0;
}

.agreement-text {
  font-size: 13px;
  line-height: 1.5;
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
  width: 16px;
  height: 16px;
  margin: 0;
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
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.login-form-section .boh-login-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
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
</style>
