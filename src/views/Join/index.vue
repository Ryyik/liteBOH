<template>
  <div class="join-page">
    <UnifiedNavbar />
    <input type="file" ref="avatarInputRef" class="hidden-file-input" accept="image/*" @change="handleAvatarFileChange">

    <main class="join-container">
      <div class="apple-style-wrapper" v-motion :initial="{ opacity: 0, y: 20 }" :enter="{ opacity: 1, y: 0 }">

        <!-- Step 1: Registration Form -->
        <div v-if="currentStep === 1" class="registration-content">
          <!-- Animated Logo Section -->
          <div class="logo-section">
            <div class="dots-container">
              <div v-for="n in 36" :key="n" class="dot"
                :style="{ '--delay': n * 0.1 + 's', '--rotate': n * 10 + 'deg' }"></div>
            </div>
            <div class="boh-logo-inner">BOH</div>
          </div>

          <h1 class="apple-title">一个账户，尽享 BOH。</h1>
          <p class="apple-subtitle">注册以在方块之家安全访问你的个人数据，参与社区讨论，并使用所有方块服务。</p>

          <form @submit.prevent="submitForm" class="apple-form">
            <div class="apple-input-group">
              <div class="input-wrapper">
                <input type="text" v-model="formData.account" placeholder="方块 ID (用户名)" class="apple-input" maxlength="20" autocomplete="off" required>
                <span class="input-suffix">必填</span>
              </div>
              <div class="input-wrapper">
                <input type="email" v-model="formData.email" placeholder="电子邮件" class="apple-input" required>
                <span class="input-suffix">必填</span>
              </div>
              <div class="input-wrapper">
                <input type="password" v-model="formData.password" placeholder="密码" class="apple-input" required>
                <span class="input-suffix">必填</span>
              </div>
              <div class="input-wrapper">
                <input type="password" v-model="formData.confirmPassword" placeholder="确认密码" class="apple-input"
                  required>
                <span class="input-suffix">必填</span>
              </div>
              <!-- Birthday Selection -->
              <div class="input-wrapper">
                <div class="birthday-selector">
                  <span class="birthday-label">生日</span>
                  <select v-model="formData.birth_month" class="date-select">
                    <option value="">选择月份</option>
                    <option v-for="month in 12" :key="month" :value="month">{{ month }}月</option>
                  </select>
                  <select v-model="formData.birth_day" class="date-select">
                    <option value="">选择日期</option>
                    <option v-for="day in 31" :key="day" :value="day">{{ day }}日</option>
                  </select>
                </div>
                <span class="input-suffix">选填</span>
              </div>
              <!-- Avatar Upload -->
              <div class="input-wrapper avatar-input-wrapper">
                <div class="avatar-selector" @click="handleAvatarClick">
                  <span class="avatar-label">头像</span>
                  <div class="avatar-preview-small">
                    <img v-if="formData.avatarPreview" :src="formData.avatarPreview" alt="avatar" class="avatar-preview-small-img"  loading="lazy" />
                    <div v-else class="avatar-placeholder-small">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" fill="#86868b"/>
                      </svg>
                    </div>
                  </div>
                  <span class="avatar-status">{{ formData.avatarPreview ? '已选择' : '点击上传' }}</span>
                </div>
                <span class="input-suffix">选填</span>
              </div>
            </div>

            <div class="anti-bot-honeypot" aria-hidden="true">
              <label for="register-website">Website</label>
              <input id="register-website" v-model="formData.website" type="text" tabindex="-1" autocomplete="off" />
            </div>

            <p v-if="passwordError" class="apple-error-text">{{ passwordError }}</p>

            <!-- Agreement Checkbox -->
            <div class="agreement-section">
              <label class="agreement-checkbox">
                <input type="checkbox" v-model="formData.agreedToTerms" required>
                <span class="agreement-text">
                  我已阅读并同意
                  <a href="#" class="agreement-link" @click.prevent="openAgreementModal('user')">用户协议</a>
                  和
                  <a href="#" class="agreement-link" @click.prevent="openAgreementModal('privacy')">隐私政策</a>
                </span>
              </label>
            </div>

            <div class="apple-action-section">
              <div v-if="altchaEnabled" class="altcha-wrap">
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
              <button type="submit" class="apple-continue-btn" :disabled="submitButtonDisabled">
                {{ submitButtonLabel }}
              </button>
              <p v-if="isSubmitCoolingDown && !isSubmitting" class="cooldown-tip">
                为保护注册接口，请在 {{ cooldownRemainingSeconds }} 秒后重试。
              </p>
            </div>
          </form>

          <!-- Privacy Info -->
          <div class="apple-privacy-info">
            <div class="privacy-icon">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path
                  d="M16 8C18.2091 8 20 6.20914 20 4C20 1.79086 18.2091 0 16 0C13.7909 0 12 1.79086 12 4C12 6.20914 13.7909 8 16 8Z"
                  fill="#0071E3" />
                <path
                  d="M16 32C20.4183 32 24 28.4183 24 24C24 19.5817 20.4183 16 16 16C11.5817 16 8 19.5817 8 24C8 28.4183 11.5817 32 16 32Z"
                  fill="#0071E3" />
              </svg>
            </div>
            <p>你的 BOH ID 账户会关联你的个人信息，包括帖子、动态、消息等数据。数据将加密存储在 BOH 云端，便于你在其他设备上访问。 <a href="#">了解数据的管理方式...</a></p>
          </div>

          <!-- Footer Links -->
          <div class="apple-footer-links">
            <router-link to="/login" class="pill-link">已有账户？</router-link>
            <a href="#" class="pill-link" @click.prevent>忘记密码</a>
            <button class="help-btn">?</button>
          </div>
        </div>

        <!-- Step 3: Success Message -->
        <div v-else-if="currentStep === 3" class="success-content-apple">
          <div class="success-icon-apple">✓</div>
          <h1 class="apple-title">注册成功</h1>
          <p class="apple-subtitle">
            欢迎加入方块之家！你的 BOH 身份 <strong>{{ formData.account }}</strong> 已创建完成，现在可以直接登录。
          </p>
          <div class="apple-action-section apple-action-stack">
            <router-link to="/login" class="apple-continue-btn">去登录</router-link>
          </div>
        </div>

      </div>
    </main>

    <!-- Avatar Crop Modal -->
    <AvatarCropModal v-model:visible="showCropModal" :image-src="cropImageSrc" :loading="isProcessingCrop"
      @confirm="handleCropConfirm" />

    <!-- 协议弹窗 -->
    <AgreementModal
      :visible="showAgreementModal"
      :title="agreementModalTitle"
      @update:visible="(val) => showAgreementModal = val"
      @close="closeAgreementModal"
    >
      <div v-html="agreementModalContent"></div>
    </AgreementModal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import UnifiedNavbar from '@/components/UnifiedNavbar/index.vue';
import AvatarCropModal from '@/components/AvatarCropModal.vue';
import AltchaWidget from '@/components/AltchaWidget.vue';
import AgreementModal from '@/components/AgreementModal.vue';
import { userAgreementContent, privacyPolicyContent } from '@/data/agreementData.js';
import { signUp } from '@/utils/api/auth-api.js';
import { supabase } from '@/utils/supabase-client.js';
import { logger } from '@/utils/logger.js';
import { getAltchaChallengeUrl, isAltchaEnabled } from '@/utils/altcha.js';
import {
  normalizeEmail,
  validateEmail,
  validatePassword,
  validateUsername,
} from '@/utils/auth-validation.js';

const currentStep = ref(1);
const isSubmitting = ref(false);
const passwordError = ref('');
const altchaEnabled = computed(() => isAltchaEnabled());
const altchaChallengeUrl = computed(() => getAltchaChallengeUrl('signup'));
const altchaWidgetRef = ref(null);
const altchaPayload = ref('');
const altchaState = ref('unverified');
const altchaError = ref('');

const AGREED_TO_TERMS_KEY = 'boh_agreed_to_terms';

// 协议弹窗状态
const showAgreementModal = ref(false);
const agreementModalType = ref('user'); // 'user' 或 'privacy'
const agreementModalTitle = computed(() => {
  return agreementModalType.value === 'user' ? '方块之家用户服务协议' : '方块之家隐私政策';
});
const agreementModalContent = computed(() => {
  return agreementModalType.value === 'user' ? userAgreementContent : privacyPolicyContent;
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

const MIN_FORM_FILL_MS = 5000;
const SUBMIT_COOLDOWN_MS = 30000;

const formData = reactive({
  account: '',
  password: '',
  confirmPassword: '',
  email: '',
  birth_month: '',
  birth_day: '',
  avatarPreview: '',
  avatarBlob: null,
  website: '',
  agreedToTerms: false
});

const avatarInputRef = ref(null);
const showCropModal = ref(false);
const cropImageSrc = ref('');
const isProcessingCrop = ref(false);
const formStartedAt = ref(Date.now());
const submitCooldownEndsAt = ref(0);
const currentTimeMs = ref(Date.now());
let submitCooldownTimer = null;
let imageCompressionLoader = null;

const isFormValid = computed(() => {
  return Boolean(
    String(formData.account || '').trim()
    && String(formData.email || '').trim()
    && formData.password
    && formData.confirmPassword
    && formData.agreedToTerms
  );
});

const cooldownRemainingSeconds = computed(() => {
  const remainingMs = submitCooldownEndsAt.value - currentTimeMs.value;
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
});

const isSubmitCoolingDown = computed(() => cooldownRemainingSeconds.value > 0);

const submitButtonDisabled = computed(() => {
  return !isFormValid.value || isSubmitting.value || isSubmitCoolingDown.value;
});

const submitButtonLabel = computed(() => {
  if (isSubmitting.value) return '正在处理...';
  if (isSubmitCoolingDown.value) return `请等待 ${cooldownRemainingSeconds.value}s`;
  return '继续';
});

const altchaStatusMessage = computed(() => {
  if (!altchaEnabled.value) return '';
  if (altchaState.value === 'verified') return '人机验证已完成。';
  if (altchaState.value === 'verifying') return '人机验证进行中...';
  if (altchaState.value === 'expired') return '人机验证已过期，请重新完成。';
  if (altchaState.value === 'error') return '人机验证加载失败，请重试。';
  return '请先完成人机验证。';
});

const clearSubmitCooldownTimer = () => {
  if (submitCooldownTimer !== null) {
    clearInterval(submitCooldownTimer);
    submitCooldownTimer = null;
  }
};

const startSubmitCooldown = () => {
  submitCooldownEndsAt.value = Date.now() + SUBMIT_COOLDOWN_MS;
  currentTimeMs.value = Date.now();
  clearSubmitCooldownTimer();
  submitCooldownTimer = setInterval(() => {
    currentTimeMs.value = Date.now();
    if (currentTimeMs.value >= submitCooldownEndsAt.value) {
      clearSubmitCooldownTimer();
    }
  }, 250);
};

const loadImageCompression = async () => {
  if (!imageCompressionLoader) {
    imageCompressionLoader = import('browser-image-compression')
      .then((module) => module.default || module)
      .catch((error) => {
        imageCompressionLoader = null;
        throw error;
      });
  }

  return imageCompressionLoader;
};

const resetAltcha = async () => {
  altchaPayload.value = '';
  altchaState.value = 'unverified';
  altchaError.value = '';
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
  passwordError.value = '';
  await resetAltcha();
};

const handleAvatarClick = () => {
  avatarInputRef.value?.click();
};

const handleAvatarFileChange = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    cropImageSrc.value = e.target.result;
    showCropModal.value = true;
  };
  reader.readAsDataURL(file);

  event.target.value = '';
};

const handleCropConfirm = async (blob) => {
  isProcessingCrop.value = true;
  try {
    const file = new File([blob], 'avatar.png', { type: 'image/png' });
    const imageCompression = await loadImageCompression();
    
    const options = {
      maxSizeMB: 0.5,
      maxWidthOrHeight: 800,
      useWebWorker: true,
    };
    const compressedFile = await imageCompression(file, options);
    
    formData.avatarBlob = compressedFile;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      formData.avatarPreview = e.target.result;
    };
    reader.readAsDataURL(compressedFile);
    
    showCropModal.value = false;
  } catch (error) {
    logger.error('join', '裁切处理失败:', error);
    alert('头像处理出错，请重试');
  } finally {
    isProcessingCrop.value = false;
  }
};

const uploadAvatarToSupabase = async (userId) => {
  if (!formData.avatarBlob) return { url: null, filePath: null };

  try {
    const timestamp = Date.now();
    const filePath = `${userId}/avatar_${timestamp}.png`;
    
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, formData.avatarBlob, {
        contentType: 'image/png',
        cacheControl: '3600'
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    return { 
      url: `${publicUrl}?t=${timestamp}`,
      filePath: filePath
    };
  } catch (error) {
    logger.error('join', '上传头像失败:', error);
    return { url: null, filePath: null };
  }
};

const deleteAvatarFromSupabase = async (filePath) => {
  if (!filePath) return;
  
  try {
    logger.info('join', '清理冗余头像文件:', filePath);
    const { error } = await supabase.storage
      .from('avatars')
      .remove([filePath]);
    
    if (error) {
      logger.warn('join', '删除头像失败（非致命错误）:', error);
    } else {
      logger.info('join', '冗余头像已清理');
    }
  } catch (error) {
    logger.warn('join', '清理头像时出错:', error);
  }
};

const submitForm = async () => {
  const normalizedAccount = String(formData.account || '').trim();
  const normalizedEmail = normalizeEmail(formData.email);
  const normalizedHoneypot = String(formData.website || '').trim();

  if (isSubmitCoolingDown.value) {
    passwordError.value = `操作过于频繁，请在 ${cooldownRemainingSeconds.value} 秒后重试。`;
    return;
  }

  if (normalizedHoneypot) {
    passwordError.value = '注册请求异常，请稍后重试。';
    return;
  }

  const filledDurationMs = Date.now() - formStartedAt.value;
  if (filledDurationMs < MIN_FORM_FILL_MS) {
    const waitSeconds = Math.max(1, Math.ceil((MIN_FORM_FILL_MS - filledDurationMs) / 1000));
    passwordError.value = `提交过快，请在 ${waitSeconds} 秒后重试。`;
    return;
  }

  const usernameValidationMessage = validateUsername(normalizedAccount);
  if (usernameValidationMessage) {
    passwordError.value = usernameValidationMessage;
    return;
  }

  const emailValidationMessage = validateEmail(normalizedEmail);
  if (emailValidationMessage) {
    passwordError.value = emailValidationMessage;
    return;
  }

  const passwordValidationMessage = validatePassword(formData.password);
  if (passwordValidationMessage) {
    passwordError.value = passwordValidationMessage;
    return;
  }
  if (formData.password !== formData.confirmPassword) {
    passwordError.value = '两次输入的密码不一致';
    return;
  }
  passwordError.value = '';

  isSubmitting.value = true;
  startSubmitCooldown();

  try {
    formData.account = normalizedAccount;
    formData.email = normalizedEmail;

    const { data, error } = await signUp(
      normalizedAccount,
      normalizedEmail,
      formData.password,
      {
        nickname: normalizedAccount,
        role: 'user',
        points: 0,
        join_date: new Date().toISOString().split('T')[0],
        birth_month: formData.birth_month ? String(formData.birth_month) : null,
        birth_day: formData.birth_day ? String(formData.birth_day) : null
      },
      altchaPayload.value
    );

    if (error) {
      let friendlyMessage = error.message;
      if (error.code === 'USERNAME_TAKEN') {
        friendlyMessage = '该方块 ID 已被注册，请更换后重试。';
      } else if (error.code === 'INVALID_USERNAME') {
        friendlyMessage = error.message || '请输入有效的方块 ID。';
      } else if (error.code === 'INVALID_EMAIL') {
        friendlyMessage = error.message || '请输入有效的邮箱地址。';
      } else if (error.code === 'INVALID_PASSWORD') {
        friendlyMessage = error.message || '密码长度至少为 6 位。';
      } else if (error.code === 'EMAIL_RATE_LIMIT' || String(error.message || '').toLowerCase().includes('rate limit')) {
        friendlyMessage = '邮件发送过于频繁，请等待 60 秒后再试。';
      } else if (
        error.code === 'CAPTCHA_FAILED'
        || error.code === 'ALTCHA_REQUIRED'
        || error.code === 'ALTCHA_FAILED'
        || error.code === 'ALTCHA_SCOPE_INVALID'
        || error.code === 'ALTCHA_SCOPE_MISMATCH'
        || error.code === 'ALTCHA_REPLAYED'
        || String(error.message || '').toLowerCase().includes('captcha')
        || String(error.message || '').toLowerCase().includes('altcha')
      ) {
        friendlyMessage = '人机验证校验失败，请重新验证后再试。';
      } else if (error.code === 'USER_ALREADY_REGISTERED' || String(error.message || '').includes('User already registered')) {
        friendlyMessage = '该邮箱已注册，请直接登录。';
      } else if (String(error.message || '').includes('Database error saving new user')) {
        friendlyMessage = '注册失败：ID 或邮箱已被注册。';
      }
      throw new Error(friendlyMessage);
    }

    if (data?.user && formData.avatarBlob) {
      const { url: avatarUrl, filePath } = await uploadAvatarToSupabase(data.user.id);
      if (avatarUrl && filePath) {
        try {
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ avatar_url: avatarUrl })
            .eq('id', data.user.id);
          
          if (updateError) {
            logger.error('join', '更新头像 URL 失败:', updateError);
            await deleteAvatarFromSupabase(filePath);
          }
        } catch (updateErr) {
          logger.error('join', '更新头像时出错:', updateErr);
          await deleteAvatarFromSupabase(filePath);
        }
      }
    }

    currentStep.value = 3;
  } catch (error) {
    logger.error('join', 'Registration failed:', error);
    if (altchaEnabled.value) await resetAltcha();
    alert(error.message || '注册出错，请稍后重试。');
  } finally {
    isSubmitting.value = false;
  }
};

onMounted(() => {
  formStartedAt.value = Date.now();

  // 读取协议勾选状态
  const agreedToTermsFlag = localStorage.getItem(AGREED_TO_TERMS_KEY);
  if (agreedToTermsFlag === '1') {
    formData.agreedToTerms = true;
  }
});

// 监听协议勾选状态变化并保存
watch(
  () => formData.agreedToTerms,
  (agreed) => {
    localStorage.setItem(AGREED_TO_TERMS_KEY, agreed ? '1' : '0');
  }
);

onUnmounted(() => {
  clearSubmitCooldownTimer();
});
</script>

<style scoped>
.join-page {
  background-color: #fcfcfc;
  /* 更干净的背景 */
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
  color: #1d1d1f;
  min-height: 100vh;
  padding-top: 80px;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
}

.hidden-file-input {
  display: none;
}

/* Avatar Upload - Inline Style */
.avatar-input-wrapper {
  display: flex;
  align-items: center;
}

.avatar-selector {
  display: flex;
  gap: 16px;
  width: 100%;
  padding-right: 60px;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s;
}

.avatar-selector:hover {
  background-color: #fcfcfc;
}

.avatar-label {
  padding: 20px 0 20px 24px;
  font-size: 17px;
  color: #000000;
  font-weight: 500;
  white-space: nowrap;
}

.avatar-preview-small {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #f5f5f7;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.avatar-selector:hover .avatar-preview-small {
  background: #e8e8ed;
}

.avatar-preview-small-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder-small {
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-status {
  font-size: 15px;
  color: #86868b;
  font-weight: 500;
  flex: 1;
  text-align: right;
}

.join-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 60px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.apple-style-wrapper {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.altcha-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 14px;
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
  max-width: 500px;
  margin-bottom: 20px;
}

.agreement-checkbox {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}

.agreement-checkbox input[type="checkbox"] {
  margin-top: 2px;
  width: 18px;
  height: 18px;
  accent-color: #0071e3;
  cursor: pointer;
  flex-shrink: 0;
}

.agreement-text {
  font-size: 14px;
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

/* Logo Section with Animated Dots */
.logo-section {
  position: relative;
  width: 180px;
  height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 40px;
}

.dots-container {
  position: absolute;
  width: 100%;
  height: 100%;
  animation: rotateContainer 60s linear infinite;
}

.dot {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 6px;
  height: 6px;
  background: #0071e3;
  border-radius: 50%;
  transform-origin: 0 75px;
  transform: translate(-50%, -50%) rotate(var(--rotate)) translateY(-75px);
  opacity: 0.5;
  animation: pulseDot 4s ease-in-out infinite alternate;
  animation-delay: var(--delay);
}

/* Colorful variations for dots */
.dot:nth-child(3n) {
  background: #ff3b30;
}

.dot:nth-child(3n+1) {
  background: #34c759;
}

.dot:nth-child(3n+2) {
  background: #5856d6;
}

@keyframes rotateContainer {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@keyframes pulseDot {
  0% {
    transform: translate(-50%, -50%) rotate(var(--rotate)) translateY(-75px) scale(1);
    opacity: 0.3;
  }

  100% {
    transform: translate(-50%, -50%) rotate(var(--rotate)) translateY(-90px) scale(1.4);
    opacity: 0.7;
  }
}

.boh-logo-inner {
  font-size: 44px;
  font-weight: 900;
  /* 醒目的粗体 */
  color: #1d1d1f;
  z-index: 2;
  letter-spacing: -0.05em;
}

/* Typography */
.apple-title {
  font-size: 42px;
  font-weight: 800;
  /* 醒目的粗体 */
  color: #1d1d1f;
  margin-bottom: 16px;
  letter-spacing: -0.03em;
  text-align: center;
}

.apple-subtitle {
  font-size: 18px;
  line-height: 1.6;
  font-weight: 400;
  color: #86868b;
  max-width: 540px;
  text-align: center;
  margin-bottom: 56px;
}

/* Form Styles */
.apple-form {
  width: 100%;
  max-width: 500px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.apple-input-group {
  width: 100%;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.04);
  /* 柔和的灰色边框 */
  border-radius: 24px;
  /* 更大的圆角 */
  overflow: hidden;
  margin-bottom: 32px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.03);
}

.input-wrapper {
  position: relative;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  /* 柔和的灰色分割线 */
}

.input-wrapper:last-child {
  border-bottom: none;
}

.apple-input {
  width: 100%;
  padding: 20px 24px;
  font-size: 17px;
  border: none;
  outline: none;
  background: transparent;
  color: #000000;
  font-weight: 500;
  transition: all 0.2s ease;
}

.apple-input:focus {
  background-color: #fcfcfc;
}

.apple-input::placeholder {
  color: #000000;
}

/* Birthday Selector Styles */
.birthday-selector {
  display: flex;
  gap: 12px;
  width: 100%;
  padding-right: 60px;
  /* 留出必填标记的空间 */
  align-items: center;
}

.birthday-label {
  padding: 20px 0 20px 24px;
  font-size: 17px;
  color: #000000;
  font-weight: 500;
  white-space: nowrap;
}

.date-select {
  flex: 1;
  padding: 20px 0;
  font-size: 17px;
  border: none;
  outline: none;
  background: transparent;
  color: #000000;
  font-weight: 500;
  appearance: none;
  background-image: url("data:image/svg+xml;charset=US-ASCII,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 5'><path fill='%23c7c7cc' d='M2 0L0 2h4zm0 5L0 3h4z'/></svg>");
  background-repeat: no-repeat;
  background-position: right 4px center;
  background-size: 10px;
  cursor: pointer;
}

.date-select:focus {
  background-color: #fcfcfc;
}

.input-suffix {
  position: absolute;
  right: 24px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 13px;
  font-weight: 600;
  color: #c7c7cc;
  pointer-events: none;
  letter-spacing: 0.05em;
}

.apple-error-text {
  color: #ff3b30;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 24px;
  background: #fff2f2;
  padding: 8px 16px;
  border-radius: 12px;
}

/* Action Section */
.apple-action-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  margin-bottom: 56px;
}

.cooldown-tip {
  margin: 0;
  text-align: center;
  font-size: 13px;
  color: #86868b;
}

.anti-bot-honeypot {
  position: absolute;
  left: -10000px;
  top: auto;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

.apple-action-stack {
  max-width: 500px;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
}

.apple-continue-btn {
  width: 100%;
  background-color: #f5f5f7;
  color: #c7c7cc;
  border: none;
  border-radius: 18px;
  /* Figma 圆角 */
  padding: 18px 32px;
  font-size: 17px;
  font-weight: 700;
  cursor: not-allowed;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  text-decoration: none;
  text-align: center;
}

.apple-continue-btn:not(:disabled) {
  background-color: #1d1d1f;
  /* 专业深色风格 */
  color: #ffffff;
  cursor: pointer;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
}

.apple-continue-btn:not(:disabled):hover {
  background-color: #000;
  transform: translateY(-4px);
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.2);
}

.apple-continue-btn:not(:disabled):active {
  transform: translateY(-2px);
}

.apple-secondary-btn {
  width: 100%;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 18px;
  background: #ffffff;
  color: #1d1d1f;
  padding: 16px 32px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.apple-secondary-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.apple-secondary-btn:not(:disabled):hover {
  background: #f5f5f7;
  transform: translateY(-2px);
}

.apple-secondary-btn:not(:disabled):active {
  transform: translateY(-1px);
}

.verification-hint {
  margin: 8px 0 0;
  font-size: 14px;
  text-align: center;
}

.verification-hint-success {
  color: #2f855a;
}

.verification-hint-error {
  color: #c53030;
}

/* Privacy Section */
.apple-privacy-info {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  max-width: 600px;
  padding: 32px;
  margin-bottom: 60px;
  background: #ffffff;
  border-radius: 24px;
  border: 1px solid rgba(0, 0, 0, 0.03);
}

.privacy-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.apple-privacy-info p {
  font-size: 13px;
  line-height: 1.6;
  font-weight: 400;
  color: #86868b;
}

.apple-privacy-info a {
  color: #1d1d1f;
  text-decoration: none;
  font-weight: 600;
  border-bottom: 1.5px solid rgba(0, 0, 0, 0.1);
}

.apple-privacy-info a:hover {
  border-bottom-color: #1d1d1f;
}

/* Footer Links */
.apple-footer-links {
  display: flex;
  align-items: center;
  gap: 16px;
}

.pill-link {
  background: #ffffff;
  color: #1d1d1f;
  padding: 10px 24px;
  border-radius: 100px;
  font-size: 14px;
  text-decoration: none;
  font-weight: 700;
  transition: all 0.2s;
  border: 1px solid rgba(0, 0, 0, 0.04);
  cursor: pointer;
}

.pill-link:hover {
  background: #f5f5f7;
  transform: translateY(-2px);
}

.help-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.04);
  color: #1d1d1f;
  font-size: 18px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.help-btn:hover {
  background: #f5f5f7;
  transform: scale(1.1);
}

/* Success Content Apple */
.success-content-apple {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 0;
}

.success-icon-apple {
  width: 96px;
  height: 96px;
  background: #34c759;
  color: #fff;
  border-radius: 32px;
  /* Squircle */
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  margin-bottom: 40px;
  box-shadow: 0 20px 40px rgba(52, 199, 89, 0.2);
}

/* Responsive */
@media (max-width: 768px) {
  .apple-title {
    font-size: 34px;
  }

  .apple-subtitle {
    font-size: 16px;
    margin-bottom: 40px;
  }

  .join-container {
    padding: 40px 20px;
  }

  .apple-input-group {
    border-radius: 20px;
  }

  .apple-input,
  .date-select {
    padding: 18px 20px;
  }

  .birthday-selector {
    padding-right: 50px;
  }

  .apple-privacy-info {
    padding: 24px;
  }
}
</style>
