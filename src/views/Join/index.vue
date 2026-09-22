<template>
  <div class="join-page" :style="pageStyle">
    <input ref="avatarInputRef" type="file" class="join-file" accept="image/*" @change="handleAvatarFileChange">

    <div class="join-stage">
      <div class="join-card liquid-glass">
        <aside class="join-aside">
          <img
            class="join-hero"
            :src="heroUrl"
            :srcset="heroSrcset"
            sizes="(max-width: 900px) 100vw, 42vw"
            alt="方块之家"
            width="1280"
            height="854"
            fetchpriority="high"
            decoding="async"
          >
          <div class="join-hero-scrim" aria-hidden="true"></div>
          <div class="join-panel">
            <div class="join-brand">
              <span class="join-brand-mark">BOH</span>
              <span class="join-brand-name">方块之家</span>
            </div>
            <div class="join-aside-copy">
              <h1>{{ asideCopy.title }}</h1>
              <p>{{ asideCopy.desc }}</p>
            </div>
            <div class="join-stats">
              <div><b>12.8 万</b><i>已发布方块</i></div>
              <div><b>8 年</b><i>社区在营</i></div>
              <div><b>3 步</b><i>平均 40 秒</i></div>
            </div>
            <p class="join-aside-privacy">你的资料全程加密传输，只有你能修改。我们不会把你的邮箱卖给任何人。</p>
          </div>
        </aside>

        <main ref="mainRef" class="join-main">
          <template v-if="!isDone">
            <div class="join-inner">
              <div class="join-progress">
                <div class="join-progress-dots">
                  <template v-for="n in 3" :key="n">
                    <span
                      class="join-dot"
                      :class="{ 'is-done': n < currentStep, 'is-now': n === currentStep }"
                      :data-dot="n"
                    ></span>
                    <span v-if="n < 3" class="join-link" :class="{ 'is-done': n < currentStep }"></span>
                  </template>
                </div>
                <div class="join-progress-text">第 {{ currentStep }} 步 / 共 3 步</div>
              </div>

              <div v-if="alerts.length" class="join-alerts" role="alert">
                <p>还有几处需要处理</p>
                <ul>
                  <li v-for="(item, i) in alerts" :key="i">
                    <button type="button" @click="focusField(item.field)">· {{ item.text }}</button>
                  </li>
                </ul>
              </div>

              <form autocomplete="on" novalidate @submit.prevent="handleNext">
                <div ref="viewportRef" class="join-viewport" :style="{ height: viewportHeight + 'px' }">
                  <section
                    class="join-step"
                    :class="{ 'is-active': currentStep === 1 }"
                    :inert="currentStep !== 1 || undefined"
                    aria-label="账号信息"
                  >
                    <h2>账号信息</h2>
                    <p class="join-lead">这两项是你以后登录和找回密码的凭据，请用能长期使用的信息。</p>

                    <div class="join-fld" :class="fieldClass('account')" data-field="account">
                      <label class="join-label" for="joinAccount">方块 ID<span class="join-tag join-tag-req">必填</span></label>
                      <div class="join-ctrl">
                        <input
                          id="joinAccount"
                          v-model="formData.account"
                          type="text"
                          name="username"
                          autocomplete="username"
                          placeholder="例如 bohai_2026"
                          maxlength="20"
                          aria-describedby="joinMsgAccount joinHintAccount"
                          :aria-invalid="!!fieldMsg.account || accountState === 'err'"
                          @input="onAccountInput"
                          @blur="onAccountBlur"
                        >
                        <span v-if="accountState" class="join-state" :class="'is-' + accountState">{{ accountStateText }}</span>
                      </div>
                      <div v-if="accountSuggestions.length" class="join-suggest">
                        <span>已被占用，试试：</span>
                        <button
                          v-for="s in accountSuggestions"
                          :key="s"
                          type="button"
                          @click="applySuggestion(s)"
                        >{{ s }}</button>
                      </div>
                      <p id="joinMsgAccount" class="join-msg">{{ fieldMsg.account }}</p>
                      <p id="joinHintAccount" class="join-hint">3–20 个字符，支持中英文、数字、下划线和连字符</p>
                    </div>

                    <div class="join-fld" :class="fieldClass('email')" data-field="email">
                      <label class="join-label" for="joinEmail">电子邮件<span class="join-tag join-tag-req">必填</span></label>
                      <div class="join-ctrl">
                        <input
                          id="joinEmail"
                          v-model="formData.email"
                          type="email"
                          name="email"
                          autocomplete="email"
                          placeholder="you@example.com"
                          aria-describedby="joinMsgEmail joinHintEmail"
                          :aria-invalid="!!fieldMsg.email"
                          @input="clearFieldError('email')"
                          @blur="validateEmailField"
                        >
                        <span v-if="!fieldMsg.email && formData.email" class="join-state is-ok">可用</span>
                      </div>
                      <p id="joinMsgEmail" class="join-msg">{{ fieldMsg.email }}</p>
                      <p id="joinHintEmail" class="join-hint">用于登录与找回密码，不会出现在你的公开主页上。</p>
                    </div>
                  </section>

                  <section
                    class="join-step"
                    :class="{ 'is-active': currentStep === 2 }"
                    :inert="currentStep !== 2 || undefined"
                    aria-label="设置密码"
                  >
                    <h2>设置密码</h2>
                    <p class="join-lead">密码是找回账户的唯一凭据。这一步只有一项，设好就可以进入 BOH 了。</p>

                    <div class="join-fld" :class="fieldClass('password')" data-field="password">
                      <label class="join-label" for="joinPassword">密码<span class="join-tag join-tag-req">必填</span></label>
                      <div class="join-ctrl">
                        <input
                          id="joinPassword"
                          v-model="formData.password"
                          :type="showPassword ? 'text' : 'password'"
                          name="password"
                          autocomplete="new-password"
                          placeholder="至少 8 位"
                          aria-describedby="joinMsgPassword joinPwRules"
                          :aria-invalid="!!fieldMsg.password"
                          @input="onPasswordInput"
                        >
                        <button type="button" class="join-toggle" @click="showPassword = !showPassword">
                          {{ showPassword ? '隐藏' : '显示' }}
                        </button>
                      </div>
                      <div class="join-meter" :data-level="passwordLevel"><i></i><i></i><i></i></div>
                      <div class="join-meter-label">强度：{{ passwordLevelText }}</div>
                      <ul id="joinPwRules" class="join-rules">
                        <li v-for="rule in passwordRules" :key="rule.key" :class="{ 'is-hit': rule.hit }">{{ rule.label }}</li>
                      </ul>
                      <p id="joinMsgPassword" class="join-msg">{{ fieldMsg.password }}</p>
                    </div>
                  </section>

                  <section
                    class="join-step"
                    :class="{ 'is-active': currentStep === 3 }"
                    :inert="currentStep !== 3 || undefined"
                    aria-label="完善资料"
                  >
                    <h2>完善资料</h2>
                    <p class="join-lead">这几项都可以留空，之后在用户中心随时能补。</p>

                    <div class="join-fld" :class="fieldClass('birth')" data-field="birth">
                      <label class="join-label" for="joinBirthMonth">生日<span class="join-tag join-tag-opt">选填</span></label>
                      <div class="join-birth">
                        <select
                          id="joinBirthMonth"
                          v-model="formData.birth_month"
                          autocomplete="bday-month"
                          aria-label="出生月份"
                          @change="onBirthMonthChange"
                        >
                          <option value="">选择月份</option>
                          <option v-for="m in 12" :key="m" :value="String(m)">{{ m }} 月</option>
                        </select>
                        <select v-model="formData.birth_day" autocomplete="bday-day" aria-label="出生日期">
                          <option value="">选择日期</option>
                          <option v-for="d in birthDayCount" :key="d" :value="String(d)">{{ d }} 日</option>
                        </select>
                      </div>
                      <p class="join-msg" :class="{ 'is-warn-on': !!fieldMsg.birth }">{{ fieldMsg.birth }}</p>
                      <p class="join-hint">只用于生日祝福，不会公开展示。</p>
                    </div>

                    <div class="join-fld" data-field="avatar">
                      <span class="join-label">头像<span class="join-tag join-tag-opt">选填</span></span>
                      <div class="join-avatar-row">
                        <div class="join-avatar-drop">
                          <img v-if="formData.avatarPreview" :src="formData.avatarPreview" alt="头像预览" loading="lazy">
                          <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" fill="currentColor"/>
                          </svg>
                        </div>
                        <div class="join-avatar-side">
                          <div class="join-avatar-btns">
                            <button type="button" class="join-mini" @click="handleAvatarClick">选择图片</button>
                            <button v-if="formData.avatarPreview" type="button" class="join-mini" @click="clearAvatar">移除</button>
                          </div>
                          <p class="join-hint">选好后会弹出裁切框，拖动即可定圆心。</p>
                        </div>
                      </div>
                      <p class="join-msg">{{ avatarError }}</p>
                    </div>

                    <div v-if="passkeySupported" class="join-fld" data-field="passkey">
                      <span class="join-label">本机快速登录<span class="join-tag join-tag-opt">选填</span></span>
                      <label class="join-switch-row">
                        <input
                          v-model="passkeyOptIn"
                          type="checkbox"
                          class="join-switch-input"
                          role="switch"
                          aria-describedby="joinPasskeyHint"
                        >
                        <span class="join-switch-track" aria-hidden="true"><span class="join-switch-knob"></span></span>
                        <span class="join-switch-copy">
                          <span class="join-switch-title">在这台设备上添加通行密钥</span>
                          <span class="join-switch-desc">下次登录不用输密码，直接用指纹 / 面容。密钥只保存在本机，BOH 只拿到公钥。</span>
                        </span>
                      </label>
                      <p id="joinPasskeyHint" class="join-hint">注册完成后会让你确认一次。也可以稍后在 设置 → 账户安全 添加或删除。</p>
                    </div>

                    <div v-if="altchaEnabled" class="join-altcha">
                      <button v-if="!altchaMounted" type="button" class="join-altcha-idle" @click="altchaMounted = true">
                        <span class="join-altcha-cb" aria-hidden="true"></span>
                        <span>我不是机器人</span>
                        <span class="join-altcha-brand">ALTCHA</span>
                      </button>
                      <template v-else>
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
                        <p class="join-altcha-status" :class="{ 'is-error': !!altchaError }">
                          {{ altchaError || altchaStatusMessage }}
                        </p>
                        <button
                          v-if="altchaError || altchaState === 'expired'"
                          type="button"
                          class="join-mini"
                          :disabled="isSubmitting"
                          @click="retryAltcha"
                        >重新加载人机验证</button>
                      </template>
                    </div>
                  </section>
                </div>

                <div class="join-actions">
                  <button v-if="currentStep > 1" type="button" class="join-btn join-btn-ghost" @click="goBack">上一步</button>
                  <button type="submit" class="join-btn join-btn-primary" :disabled="isSubmitting">{{ nextLabel }}</button>
                  <button v-if="currentStep === 3" type="button" class="join-btn join-btn-ghost" :disabled="isSubmitting" @click="handleSkip">稍后完善</button>
                </div>
              </form>
            </div>

            <div ref="termsRef" class="join-terms" :class="{ 'is-invalid': termsInvalid }">
              <div class="join-terms-inner">
                <label>
                  <input v-model="formData.agreedToTerms" type="checkbox" @change="onAgreeChange">
                  <span class="join-terms-text">
                    我已阅读并同意
                    <a href="#" @click.prevent="openAgreementModal('user')">用户服务协议</a>
                    和
                    <a href="#" @click.prevent="openAgreementModal('privacy')">隐私政策</a>
                  </span>
                </label>
                <p class="join-terms-note">{{ termsNote }}</p>
              </div>
            </div>
          </template>

          <div v-else class="join-done">
            <div class="join-done-mark" aria-hidden="true"></div>
            <template v-if="signupNeedsEmailConfirmation">
              <h2>注册成功，还差一步</h2>
              <p>验证邮件已发送至 <strong>{{ formData.email }}</strong>，请查收并点击邮件里的确认链接，然后回来登录。</p>
              <div class="join-done-actions">
                <button
                  type="button"
                  class="join-btn join-btn-ghost"
                  :disabled="isResending || resendRemainingSeconds > 0"
                  @click="handleResendConfirmation"
                >
                  {{ isResending ? '正在重发…' : (resendRemainingSeconds > 0 ? `重新发送（${resendRemainingSeconds}s）` : '没收到？重新发送验证邮件') }}
                </button>
                <router-link to="/login" class="join-btn join-btn-primary">去登录</router-link>
              </div>
              <p v-if="resendStatus === 'sent'" class="join-resend-note is-ok">已重新发送，请查收（注意垃圾箱）。</p>
              <p v-else-if="resendStatus === 'error'" class="join-resend-note is-err">{{ resendErrorMessage }}</p>
              <p v-if="passkeySupported" class="join-passkey-deferred">
                邮箱验证完成后，可以在这台设备上添加通行密钥，之后免密码登录（设置 → 账户安全）。
              </p>
            </template>
            <template v-else>
              <h2>注册成功</h2>
              <p>欢迎加入方块之家！你的 BOH 身份 <strong>{{ formData.account }}</strong> 已创建完成，现在可以直接登录。</p>

              <div v-if="showPasskeyCard" class="join-passkey-card">
                <div class="join-passkey-head">
                  <span class="join-passkey-ico" aria-hidden="true"></span>
                  <div>
                    <strong class="join-passkey-title">为这台设备添加通行密钥</strong>
                    <p class="join-passkey-desc">这样下次登录不用输密码 —— 直接用指纹 / 面容。密钥只保存在本机，BOH 拿不到你的指纹数据。</p>
                  </div>
                </div>
                <div v-if="passkeyState !== 'ok'" class="join-passkey-actions">
                  <button type="button" class="join-btn join-btn-primary" :disabled="passkeyState === 'running'" @click="addPasskey">
                    {{ passkeyState === 'running' ? '请在设备上完成验证…' : (passkeyState === 'error' ? '重试' : '用指纹 / 面容添加') }}
                  </button>
                  <button type="button" class="join-btn join-btn-ghost" :disabled="passkeyState === 'running'" @click="showPasskeyCard = false">以后再说</button>
                </div>
                <div v-else class="join-passkey-ok" aria-live="polite">
                  <span class="join-tick" aria-hidden="true"></span><span>已添加，下次可以直接用指纹 / 面容登录。</span>
                </div>
                <p class="join-passkey-state" aria-live="polite">{{ passkeyError }}</p>
              </div>

              <div class="join-done-actions">
                <router-link to="/login" class="join-btn join-btn-primary">去登录</router-link>
              </div>
            </template>
          </div>
        </main>
      </div>
    </div>

    <AvatarCropModal
      v-model:visible="showCropModal"
      :image-src="cropImageSrc"
      :loading="isProcessingCrop"
      @confirm="handleCropConfirm"
    />

    <AgreementModal
      :visible="showAgreementModal"
      :title="agreementModalTitle"
      @update:visible="(val) => (showAgreementModal = val)"
      @close="closeAgreementModal"
    >
      <div v-html="agreementModalContent"></div>
    </AgreementModal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import AvatarCropModal from '@/components/AvatarCropModal.vue';
import AltchaWidget from '@/components/AltchaWidget.vue';
import AgreementModal from '@/components/AgreementModal.vue';
import { userAgreementContent, privacyPolicyContent } from '@/data/agreementData.js';
import DOMPurify from '@/utils/dompurify.js';
import {
  signUp,
  resendSignupConfirmation,
  isUsernameAvailable,
  isPasskeySupported,
  registerPasskey,
  toPasskeyRegisterMessage,
} from '@/utils/api/auth-api.js';
import { supabase } from '@/utils/supabase-client.js';
import { logger } from '@/utils/logger.js';
import { getAltchaChallengeUrl, isAltchaEnabled } from '@/utils/altcha.js';
import { getImageUrl } from '@/utils/asset-helper.js';
import {
  normalizeEmail,
  validateEmail,
  validatePassword,
  validateUsername,
} from '@/utils/auth-validation.js';

/* ============================================================
   三步向导
   ————————————————————————————————————————————————————————————
   分步只是**前端分段收集**：提交语义没变，最后仍是一次 signUp()。
   三条外部硬约束决定了这个形态：
     1. registerPasskey() 是 authenticated API —— 必须有会话，
        所以仪式只能放在「注册已拿到 session」之后；
     2. WebAuthn create() 需要瞬时用户激活（≈5s）——
        提交点隔着一次网络往返，所以不顺手做，由完成页一个明确按钮触发；
     3. 生日只收月 / 日 —— profiles 只有 birth_month / birth_day，
        没有 birth_year（加年份需要一次迁移）。
   ============================================================ */

const heroUrl = getImageUrl('@/assets/images/main1-1280.webp');
const heroSrcset = [
  `${getImageUrl('@/assets/images/main1-768.webp')} 768w`,
  `${getImageUrl('@/assets/images/main1-1280.webp')} 1280w`,
  `${getImageUrl('@/assets/images/main1-1920.webp')} 1920w`,
].join(', ');
// 同一张主图兼作页面底 —— 玻璃要有可模糊的内容；URL 相同所以只下载一次。
// --join-nav-h：全局 .unified-nav 是 fixed 的，页面必须自己让位；
// 写死高度会在导航改版后静默压住卡片，所以挂载时实测一次（带 ResizeObserver 跟随）。
const navOffset = ref(78);
const pageStyle = computed(() => ({
  '--join-hero': `url("${heroUrl}")`,
  '--join-nav-h': `${navOffset.value}px`,
}));

const currentStep = ref(1);
const isDone = ref(false);
const isSubmitting = ref(false);
const showPassword = ref(false);
const alerts = ref([]);
const fieldMsg = reactive({ account: '', email: '', password: '', birth: '' });

const STEP_COPY = {
  1: { title: '创建你的 BOH ID', desc: '一个账户，通行社区、商城与 AI。先设定身份与联系方式，共三步。' },
  2: { title: '设置一个安全的密码', desc: '这一步只有一项。8 位以上、字母数字混合，最稳。' },
  3: { title: '完善资料，或直接跳过', desc: '生日、头像、通行密钥都能留空，之后在用户中心随时能补。' },
};
// 完成页也要有话说 —— 否则左栏会一直停在「完善资料，或直接跳过」（步骤号提交后不再变）
const DONE_COPY = {
  title: '欢迎加入方块之家',
  desc: '从这儿开始：逛逛社区、发布你的第一块方块，或者找 BOH AI 聊两句。',
};
const asideCopy = computed(() => (
  isDone.value ? DONE_COPY : (STEP_COPY[currentStep.value] || STEP_COPY[1])
));

const formData = reactive({
  account: '',
  email: '',
  password: '',
  birth_month: '',
  birth_day: '',
  avatarPreview: '',
  avatarBlob: null,
  website: '', // honeypot
  agreedToTerms: false,
});

const nextLabel = computed(() => {
  if (isSubmitting.value) return '正在处理…';
  return currentStep.value === 3 ? '创建账户' : '下一步';
});

/* ---------------- 滑屏高度：ResizeObserver 兜住「内容变高被裁掉」 ---------------- */
const viewportRef = ref(null);
const viewportHeight = ref(320);
let heightObserver = null;

const syncHeight = () => {
  const el = viewportRef.value;
  if (!el) return;
  const active = el.querySelector('.join-step.is-active');
  if (!active) return;
  const h = active.offsetHeight;
  // 只在真的变了才写，避免 ResizeObserver 自激
  if (h > 0 && Math.abs(h - viewportHeight.value) > 1) viewportHeight.value = h;
};

/* ---------------- 字段态 ---------------- */
const accountState = ref(''); // '' | checking | ok | err
const accountSuggestions = ref([]);
const avatarError = ref('');

const fieldClass = (name) => ({
  'is-invalid': ['account', 'email', 'password', 'birth'].includes(name) && !!fieldMsg[name],
  'is-valid':
    (name === 'account' && accountState.value === 'ok')
    || (name === 'email' && !fieldMsg.email && !!formData.email),
});
const accountStateText = computed(() => ({
  checking: '检查中…',
  ok: '可用',
  err: '不可用',
}[accountState.value] || ''));

const clearFieldError = (name) => {
  fieldMsg[name] = '';
  alerts.value = alerts.value.filter((a) => a.field !== name);
};

let accountTimer = null;
let accountSeq = 0;
const ACCOUNT_DEBOUNCE_MS = 420;

const suggestNames = (raw) => {
  const base = String(raw || '').trim().replace(/[_\-.]+$/, '') || 'boh';
  const year = new Date().getFullYear();
  const out = [];
  [base + '_' + year, base + '_boh', base + '2'].forEach((s) => {
    const clean = s.replace(/[^A-Za-z0-9_\-\u4e00-\u9fa5]/g, '').slice(0, 20);
    if (clean.length >= 3 && !out.includes(clean)) out.push(clean);
  });
  return out;
};

const checkAccountAvailability = async (immediate = false) => {
  if (accountTimer) window.clearTimeout(accountTimer);
  const value = String(formData.account || '').trim();
  accountSuggestions.value = [];
  if (!value) {
    accountState.value = '';
    clearFieldError('account');
    return;
  }
  const basic = validateUsername(value);
  if (basic) {
    // 格式 / 保留词：同步给结论，不必走网络
    accountState.value = 'err';
    fieldMsg.account = basic;
    return;
  }
  accountState.value = 'checking';
  clearFieldError('account');
  const mySeq = ++accountSeq;
  accountTimer = window.setTimeout(async () => {
    const { ok, available } = await isUsernameAvailable(value);
    // 竞态护栏：期间又输入过就丢弃这次结果
    if (mySeq !== accountSeq) return;
    if (String(formData.account || '').trim() !== value) return;
    if (!ok) {
      // 查询失败既不冒充「可用」也不冒充「不可用」—— 交给提交时兜底
      accountState.value = '';
      return;
    }
    if (available) {
      accountState.value = 'ok';
      fieldMsg.account = '';
      return;
    }
    accountState.value = 'err';
    fieldMsg.account = '这个方块 ID 已经有人用了，换一个或者点下面的候选。';
    accountSuggestions.value = suggestNames(value);
  }, immediate ? 0 : ACCOUNT_DEBOUNCE_MS);
};

const onAccountInput = () => {
  alerts.value = alerts.value.filter((a) => a.field !== 'account');
  void checkAccountAvailability();
};
const onAccountBlur = () => {
  const value = String(formData.account || '').trim();
  if (value && !validateUsername(value)) void checkAccountAvailability(true);
};
const applySuggestion = (name) => {
  formData.account = name;
  void checkAccountAvailability(true);
};

const validateEmailField = () => {
  const value = String(formData.email || '').trim();
  if (!value) {
    clearFieldError('email');
    return;
  }
  fieldMsg.email = validateEmail(value);
  if (!fieldMsg.email) alerts.value = alerts.value.filter((a) => a.field !== 'email');
};

/* ---------------- 密码 ---------------- */
const PW_RULES = [
  { key: 'len', label: '至少 8 个字符', test: (v) => v.length >= 8 },
  { key: 'mix', label: '包含字母和数字', test: (v) => /[A-Za-z]/.test(v) && /\d/.test(v) },
  { key: 'case', label: '同时有大小写字母', test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
  { key: 'sym', label: '包含一个符号', test: (v) => /[^A-Za-z0-9]/.test(v) },
];
const passwordRules = computed(() => PW_RULES.map((r) => ({
  key: r.key,
  label: r.label,
  hit: r.test(formData.password || ''),
})));
const passwordLevel = computed(() => {
  const value = formData.password || '';
  if (!value) return 0;
  const hit = PW_RULES.filter((r) => r.test(value)).length;
  if (value.length >= 12 && hit >= 3) return 3;
  return Math.max(1, Math.min(3, hit));
});
const passwordLevelText = computed(() => ['待评估', '弱', '中', '强'][passwordLevel.value]);
const onPasswordInput = () => {
  alerts.value = alerts.value.filter((a) => a.field !== 'password');
  const value = formData.password || '';
  fieldMsg.password = value ? validatePassword(value) : '';
};

/* ---------------- 生日（只有月 / 日 —— 库表没有 birth_year） ---------------- */
const birthDayCount = ref(31);
const refreshBirthDays = () => {
  const month = Number(formData.birth_month) || 0;
  // 用闰年算上限，让 2 月 29 日的生日可选
  birthDayCount.value = month ? new Date(2024, month, 0).getDate() : 31;
  if (Number(formData.birth_day) > birthDayCount.value) formData.birth_day = '';
};
const onBirthMonthChange = () => {
  refreshBirthDays();
  clearFieldError('birth');
};

/* ---------------- 人机验证：点击后才挂载，不再「进页面即解题」 ---------------- */
const altchaEnabled = computed(() => isAltchaEnabled());
const altchaChallengeUrl = computed(() => getAltchaChallengeUrl('signup'));
const altchaMounted = ref(false);
const altchaWidgetRef = ref(null);
const altchaPayload = ref('');
const altchaState = ref('unverified');
const altchaError = ref('');

const altchaStatusMessage = computed(() => {
  if (!altchaEnabled.value) return '';
  if (altchaState.value === 'verified') return '人机验证已完成。';
  if (altchaState.value === 'verifying') return '人机验证进行中…';
  if (altchaState.value === 'expired') return '人机验证已过期，请重新完成。';
  if (altchaState.value === 'error') return '人机验证加载失败，请重试。';
  return '请先完成人机验证。';
});
const resetAltcha = async ({ unmount = false } = {}) => {
  altchaPayload.value = '';
  altchaState.value = 'unverified';
  altchaError.value = '';
  if (unmount) altchaMounted.value = false;
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
  if (altchaState.value !== 'verifying') altchaPayload.value = '';
};
const handleAltchaVerified = () => { altchaError.value = ''; };
const handleAltchaExpired = () => {
  altchaPayload.value = '';
  altchaState.value = 'expired';
  altchaError.value = '人机验证已过期，请重新完成。';
};
const retryAltcha = async () => { await resetAltcha(); };

/* ---------------- 通行密钥 ---------------- */
const passkeySupported = ref(false);
const passkeyOptIn = ref(false);
const passkeyState = ref('idle'); // idle | running | ok | error
const passkeyError = ref('');
const showPasskeyCard = ref(false);

const addPasskey = async () => {
  if (passkeyState.value === 'running' || passkeyState.value === 'ok') return;
  passkeyState.value = 'running';
  passkeyError.value = '';
  try {
    const { error } = await registerPasskey();
    if (error) {
      passkeyState.value = 'error';
      passkeyError.value = toPasskeyRegisterMessage(error);
      return;
    }
    passkeyState.value = 'ok';
  } catch (error) {
    logger.warn('join', '通行密钥注册失败:', error);
    passkeyState.value = 'error';
    passkeyError.value = '通行密钥注册失败，请稍后再试。';
  }
};

/* ---------------- 头像 ---------------- */
const avatarInputRef = ref(null);
const showCropModal = ref(false);
const cropImageSrc = ref('');
const isProcessingCrop = ref(false);
let imageCompressionLoader = null;

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
const handleAvatarClick = () => avatarInputRef.value?.click();
const handleAvatarFileChange = (event) => {
  const file = event.target.files?.[0];
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
  avatarError.value = '';
  try {
    const file = new File([blob], 'avatar.png', { type: 'image/png' });
    const imageCompression = await loadImageCompression();
    const compressedFile = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 800, useWebWorker: true });
    formData.avatarBlob = compressedFile;
    const reader = new FileReader();
    reader.onload = (e) => { formData.avatarPreview = e.target.result; };
    reader.readAsDataURL(compressedFile);
    showCropModal.value = false;
  } catch (error) {
    logger.error('join', '裁切处理失败:', error);
    avatarError.value = '头像处理出错，请重试。';
  } finally {
    isProcessingCrop.value = false;
  }
};
const clearAvatar = () => {
  formData.avatarBlob = null;
  formData.avatarPreview = '';
};

const uploadAvatarToSupabase = async (userId) => {
  if (!formData.avatarBlob) return { url: null, filePath: null };
  try {
    const timestamp = Date.now();
    const filePath = `${userId}/avatar_${timestamp}.png`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, formData.avatarBlob, { contentType: 'image/png', cacheControl: '3600' });
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
    return { url: `${publicUrl}?t=${timestamp}`, filePath };
  } catch (error) {
    logger.error('join', '上传头像失败:', error);
    return { url: null, filePath: null };
  }
};
const deleteAvatarFromSupabase = async (filePath) => {
  if (!filePath) return;
  try {
    const { error } = await supabase.storage.from('avatars').remove([filePath]);
    if (error) logger.warn('join', '删除头像失败（非致命）:', error);
  } catch (error) {
    logger.warn('join', '清理头像时出错:', error);
  }
};

/* ---------------- 协议（不再写 localStorage，避免与登录页互相影响） ---------------- */
const showAgreementModal = ref(false);
const agreementModalType = ref('user');
const termsInvalid = ref(false);
const TERMS_NOTE = '本次勾选只对当前这次注册有效，不会被带到其它页面。';
const termsNote = ref(TERMS_NOTE);
const agreementModalTitle = computed(() => (
  agreementModalType.value === 'user' ? '方块之家用户服务协议' : '方块之家隐私政策'
));
const agreementModalContent = computed(() => DOMPurify.sanitize(
  agreementModalType.value === 'user' ? userAgreementContent : privacyPolicyContent
));
const openAgreementModal = (type) => {
  agreementModalType.value = type;
  showAgreementModal.value = true;
};
const closeAgreementModal = () => { showAgreementModal.value = false; };
const onAgreeChange = () => {
  if (formData.agreedToTerms) {
    termsInvalid.value = false;
    termsNote.value = TERMS_NOTE;
  }
};

/* ---------------- 完成页 / 重发验证邮件 ---------------- */
const signupNeedsEmailConfirmation = ref(false);
const isResending = ref(false);
const resendStatus = ref('');
const resendErrorMessage = ref('');
const RESEND_COOLDOWN_MS = 60 * 1000;
const resendRemainingSeconds = ref(0);
let resendCooldownTimer = null;

const clearResendCooldownTimer = () => {
  if (resendCooldownTimer !== null) {
    clearInterval(resendCooldownTimer);
    resendCooldownTimer = null;
  }
};
const startResendCooldown = () => {
  const endsAt = Date.now() + RESEND_COOLDOWN_MS;
  resendRemainingSeconds.value = Math.ceil(RESEND_COOLDOWN_MS / 1000);
  clearResendCooldownTimer();
  resendCooldownTimer = setInterval(() => {
    resendRemainingSeconds.value = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    if (resendRemainingSeconds.value <= 0) clearResendCooldownTimer();
  }, 250);
};
const handleResendConfirmation = async () => {
  if (isResending.value || resendRemainingSeconds.value > 0) return;
  isResending.value = true;
  resendStatus.value = '';
  resendErrorMessage.value = '';
  try {
    const { ok, error } = await resendSignupConfirmation(formData.email);
    if (!ok) {
      const raw = String(error?.message || '');
      resendStatus.value = 'error';
      resendErrorMessage.value = /rate limit/i.test(raw)
        ? '发送过于频繁，请等待一分钟后再试。'
        : (raw || '重发失败，请稍后再试。');
      return;
    }
    resendStatus.value = 'sent';
    startResendCooldown();
  } catch (err) {
    logger.warn('join', '重发验证邮件失败', err);
    resendStatus.value = 'error';
    resendErrorMessage.value = '重发失败，请稍后再试。';
  } finally {
    isResending.value = false;
  }
};

/* ---------------- 步骤导航 ---------------- */
const mainRef = ref(null);
const termsRef = ref(null);

const focusField = (name) => {
  document
    .querySelector(`.join-fld[data-field="${name}"] input, .join-fld[data-field="${name}"] select`)
    ?.focus();
};
const goStep = (next) => {
  const target = Math.min(3, Math.max(1, next));
  if (target === currentStep.value) return;
  currentStep.value = target;
  mainRef.value?.scrollTo({ top: 0, behavior: 'smooth' });
  nextTick(() => {
    syncHeight();
    document
      .querySelector('.join-step.is-active input, .join-step.is-active select')
      ?.focus({ preventScroll: true });
  });
};
const goBack = () => {
  alerts.value = [];
  goStep(currentStep.value - 1);
};

const validateStep = (step) => {
  const errs = [];
  if (step === 1) {
    const account = String(formData.account || '').trim();
    const accountMsg = validateUsername(account);
    if (accountMsg) {
      accountState.value = 'err';
      fieldMsg.account = accountMsg;
      errs.push({ field: 'account', text: `方块 ID：${accountMsg}` });
    }
    const emailMsg = validateEmail(String(formData.email || '').trim());
    if (emailMsg) {
      fieldMsg.email = emailMsg;
      errs.push({ field: 'email', text: `电子邮件：${emailMsg}` });
    }
  }
  if (step === 2) {
    const passwordMsg = validatePassword(formData.password);
    if (passwordMsg) {
      fieldMsg.password = passwordMsg;
      errs.push({ field: 'password', text: `密码：${passwordMsg}` });
    }
  }
  if (step === 3) {
    // 生日是选填：填一半就整项跳过 —— 给软提示，不做硬拦截
    const month = String(formData.birth_month || '');
    const day = String(formData.birth_day || '');
    fieldMsg.birth = (month || day) && !(month && day)
      ? '月日没填全，这项会先跳过（之后可在用户中心补）。'
      : '';
  }
  return errs;
};
const validateAll = () => [...validateStep(1), ...validateStep(2), ...validateStep(3)];

const handleNext = async () => {
  if (isSubmitting.value) return;
  if (currentStep.value < 3) {
    const errs = validateStep(currentStep.value);
    if (errs.length) {
      alerts.value = errs;
      // ID 出错时顺手刷一次字段态与候选（防抖可能还没跑完就被点了提交）。
      // ⚠️ 必须判断「有值」：checkAccountAvailability 在空值时会把字段错误
      //    和摘要一起清掉（它认为空值等于「还没填，不用报错」），
      //    于是空提交时 ID 的错误会被自己刚刚设的校验擦掉。
      if (String(formData.account || '').trim() && errs.some((e) => e.field === 'account')) {
        void checkAccountAvailability(true);
      }
      return;
    }
    alerts.value = [];
    goStep(currentStep.value + 1);
    return;
  }
  await submitForm();
};

const handleSkip = async () => {
  if (isSubmitting.value) return;
  formData.birth_month = '';
  formData.birth_day = '';
  clearAvatar();
  refreshBirthDays();
  await submitForm();
};

/* ---------------- 提交 ---------------- */
const submitForm = async () => {
  const normalizedAccount = String(formData.account || '').trim();
  const normalizedEmail = normalizeEmail(formData.email);

  if (String(formData.website || '').trim()) {
    // honeypot 命中：不告诉脚本哪里露了馅
    alerts.value = [{ field: 'account', text: '注册请求异常，请稍后重试。' }];
    return;
  }

  const allErrors = validateAll();
  if (allErrors.length) {
    const firstField = allErrors[0].field;
    const targetStep = (firstField === 'account' || firstField === 'email') ? 1 : (firstField === 'password' ? 2 : 3);
    if (targetStep !== currentStep.value) goStep(targetStep);
    alerts.value = allErrors;
    return;
  }

  if (!formData.agreedToTerms) {
    // 不禁用主按钮：点了才告诉用户差什么
    termsInvalid.value = true;
    termsNote.value = '需要先勾选协议才能创建账户。';
    alerts.value = [{ field: 'account', text: '协议：请勾选用户服务协议和隐私政策' }];
    termsRef.value?.scrollIntoView({ block: 'nearest' });
    termsRef.value?.querySelector('input[type="checkbox"]')?.focus();
    return;
  }

  alerts.value = [];
  isSubmitting.value = true;

  try {
    formData.account = normalizedAccount;
    formData.email = normalizedEmail;

    const { data, error } = await signUp(
      normalizedAccount,
      normalizedEmail,
      formData.password,
      {
        birth_month: formData.birth_month ? String(formData.birth_month) : null,
        birth_day: formData.birth_day ? String(formData.birth_day) : null,
      },
      altchaPayload.value
    );

    if (error) {
      let friendly = error.message;
      if (error.code === 'USERNAME_TAKEN') friendly = '该方块 ID 已被注册，请更换后重试。';
      else if (error.code === 'USER_ALREADY_REGISTERED') friendly = '该邮箱已注册，请直接登录。';
      else if (error.code === 'EMAIL_RATE_LIMIT' || /rate limit/i.test(String(error.message || ''))) friendly = '邮件发送过于频繁，请等待 60 秒后再试。';
      else if (/captcha|altcha/i.test(`${error.code || ''} ${error.message || ''}`)) friendly = '人机验证校验失败，请重新验证后再试。';
      else if (/Database error saving new user/i.test(String(error.message || ''))) friendly = '注册失败：ID 或邮箱已被注册。';
      // 能认出是哪个字段，就回到那一步并把错误定位到字段上
      const stepForCode = {
        USERNAME_TAKEN: 1,
        INVALID_USERNAME: 1,
        INVALID_EMAIL: 1,
        USER_ALREADY_REGISTERED: 1,
        INVALID_PASSWORD: 2,
      };
      const backStep = stepForCode[error.code];
      if (backStep && backStep !== currentStep.value) goStep(backStep);
      alerts.value = [{ field: backStep === 2 ? 'password' : 'account', text: friendly }];
      throw new Error(friendly);
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

    // 邮箱验证分流：无 session 时注册后无法立刻注册通行密钥（authenticated API），
    // 所以只决定完成页给「卡片」还是给「延后提示」，绝不给点了必然失败的按钮。
    signupNeedsEmailConfirmation.value = !data?.session;
    if (signupNeedsEmailConfirmation.value) startResendCooldown();

    showPasskeyCard.value = Boolean(data?.session) && passkeyOptIn.value && passkeySupported.value;
    passkeyState.value = 'idle';
    passkeyError.value = '';

    isDone.value = true;
    await nextTick();
    mainRef.value?.scrollTo({ top: 0 });
  } catch (error) {
    logger.error('join', 'Registration failed:', error);
    if (altchaEnabled.value && altchaMounted.value) await resetAltcha();
  } finally {
    isSubmitting.value = false;
  }
};

/* ---------------- 生命周期 ---------------- */
let navObserver = null;
const measureNav = () => {
  const nav = document.querySelector('.unified-nav');
  const h = nav ? Math.round(nav.getBoundingClientRect().height) : 0;
  const next = h > 0 ? h : 0;
  if (next !== navOffset.value) navOffset.value = next;
};

onMounted(() => {
  refreshBirthDays();
  void isPasskeySupported().then((supported) => { passkeySupported.value = supported; });

  measureNav();
  const nav = document.querySelector('.unified-nav');
  if (nav) {
    navObserver = new ResizeObserver(measureNav);
    navObserver.observe(nav);
  }

  heightObserver = new ResizeObserver(() => syncHeight());
  document.querySelectorAll('.join-step').forEach((el) => heightObserver.observe(el));
  window.addEventListener('resize', syncHeight);
  nextTick(syncHeight);
});

onUnmounted(() => {
  heightObserver?.disconnect();
  heightObserver = null;
  navObserver?.disconnect();
  navObserver = null;
  window.removeEventListener('resize', syncHeight);
  if (accountTimer) window.clearTimeout(accountTimer);
  clearResendCooldownTimer();
});

watch(currentStep, () => { nextTick(syncHeight); });
</script>

<style scoped>
/* ============================================================
   材质：只保留外卡一层活跃模糊（liquid-glass 类），其余面全部
   backdrop-filter:none + 半透明填充 —— 对齐 liquid-glass.css 的
   「one active blur layer」。颜色全部派生自 tokens.css 的 --liquid-*，
   所以暗色自动跟随，本文件不写任何暗色覆盖。
   ⚠️ 不要在这里裸写 backdrop-filter: blur(>=14px) —— check:liquid-glass 会 fail。
   ============================================================ */
.join-page {
  --j-accent: #0071e3;
  --j-accent-soft: rgba(0, 113, 227, 0.09);
  --j-err: #c8102e;
  --j-err-soft: rgba(200, 16, 46, 0.08);
  --j-ok: #0f7b57;
  --j-warn: #a15c07;
  /* 提示文字用 secondary：项目 --liquid-text-tertiary 在浅色底只有约 3.1:1，不到 AA */
  --j-ink: var(--liquid-text-primary, #1d1d1f);
  --j-ink-2: var(--liquid-text-secondary, #6e6e73);
  --j-ink-3: var(--liquid-text-secondary, #6e6e73);
  --j-line: rgba(15, 23, 42, 0.12);
  --j-line-2: var(--liquid-border-hairline, rgba(15, 23, 42, 0.06));
  --j-radius-input: 13px;
  --j-radius-btn: 14px;
  --j-ring: 0 0 0 3px rgba(0, 113, 227, 0.3);

  min-height: 100vh;
  /* .unified-nav 是 fixed 的，必须自己让位（高度实测，见 navOffset） */
  padding: calc(var(--join-nav-h, 78px) + 18px) 20px 24px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--j-ink);
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', 'Microsoft YaHei', sans-serif;
  -webkit-font-smoothing: antialiased;
  /* 玻璃要有可模糊的内容：同一张主图 + 项目自带的 overlay 材质当遮罩。
     overlay 在暗色下自动变深，所以这一层不需要额外的暗色规则。 */
  background-color: var(--liquid-bg-overlay, #f8fafc);
  background-image: linear-gradient(var(--liquid-bg-overlay, rgba(248, 250, 252, 0.62)), var(--liquid-bg-overlay, rgba(248, 250, 252, 0.62))), var(--join-hero, none);
  background-size: cover, cover;
  background-position: center, center 42%;
  background-repeat: no-repeat, no-repeat;
}

.join-file { display: none; }
.join-stage { width: 100%; max-width: 1180px; display: flex; justify-content: center; }

.join-card {
  width: 100%;
  height: clamp(560px, calc(100vh - var(--join-nav-h, 78px) - 78px), 820px);
  border-radius: var(--liquid-radius-lg, 28px);
  overflow: hidden;
  position: relative;
  display: grid;
  grid-template-columns: 42% 58%;
}

/* ---------------- 左栏：侧边图片 + 品牌面板 ---------------- */
.join-aside { position: relative; overflow: hidden; display: flex; flex-direction: column; padding: 34px 30px; }
.join-hero { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center; }
.join-hero-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.28) 50%, rgba(0, 0, 0, 0.44) 100%);
}
/* 嵌套面：显式不叠模糊；用 --liquid-bg-strong 保证面板上的文字有足够对比度 */
.join-panel {
  position: relative;
  z-index: 2;
  margin: auto 0;
  padding: 22px 22px 20px;
  border-radius: var(--liquid-radius-md, 16px);
  background: var(--liquid-bg-strong, rgba(255, 255, 255, 0.84));
  border: 1px solid var(--liquid-border, rgba(255, 255, 255, 0.65));
  box-shadow: var(--liquid-highlight-subtle, inset 0 1px 0 rgba(255, 255, 255, 0.55)), var(--liquid-shadow-sm, 0 8px 24px rgba(15, 23, 42, 0.06));
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
.join-brand { display: flex; align-items: center; gap: 11px; }
.join-brand-mark {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--j-accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}
.join-brand-name { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
.join-aside-copy { margin-top: 26px; }
.join-aside-copy h1 { margin: 0 0 12px; font-size: 29px; line-height: 1.24; font-weight: 700; letter-spacing: -0.028em; }
.join-aside-copy p { margin: 0; font-size: 13.5px; line-height: 1.62; color: var(--j-ink-2); }
.join-stats { margin-top: 24px; display: flex; gap: 22px; }
.join-stats b { display: block; font-size: 16px; font-weight: 600; letter-spacing: -0.01em; }
.join-stats i { display: block; font-style: normal; font-size: 11px; color: var(--j-ink-3); margin-top: 3px; }
.join-aside-privacy {
  margin: 20px 0 0;
  padding-top: 16px;
  border-top: 1px solid var(--j-line-2);
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--j-ink-3);
}

/* ---------------- 右栏 ---------------- */
.join-main { display: flex; flex-direction: column; min-height: 0; overflow-y: auto; overflow-x: hidden; }
.join-inner {
  width: 100%;
  max-width: 412px;
  margin: 0 auto;
  padding: 30px 40px 0;
  display: flex;
  flex-direction: column;
  flex: 1 0 auto;
}

.join-progress { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
.join-progress-dots { display: flex; align-items: center; }
.join-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--j-line); transition: background 0.3s, transform 0.3s; }
.join-dot.is-done { background: var(--j-accent); opacity: 0.45; }
.join-dot.is-now { background: var(--j-accent); transform: scale(1.35); }
.join-link { width: 26px; height: 1.5px; background: var(--j-line); transition: background 0.3s; }
.join-link.is-done { background: var(--j-accent); opacity: 0.45; }
.join-progress-text { margin-left: auto; font-size: 12px; color: var(--j-ink-2); font-variant-numeric: tabular-nums; }

.join-alerts {
  margin-bottom: 16px;
  padding: 11px 13px;
  border: 1px solid var(--j-err);
  border-radius: var(--j-radius-input);
  background: var(--j-err-soft);
}
.join-alerts p { margin: 0 0 6px; font-size: 12px; font-weight: 600; color: var(--j-err); }
.join-alerts ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.join-alerts button {
  border: 0;
  background: transparent;
  padding: 0;
  font: inherit;
  font-size: 12px;
  color: var(--j-err);
  text-align: left;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.join-viewport { position: relative; overflow: hidden; transition: height 0.34s cubic-bezier(0.32, 0.72, 0, 1); }
.join-step {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  opacity: 0;
  pointer-events: none;
  transform: translateX(20px);
  transition: opacity 0.32s ease, transform 0.32s cubic-bezier(0.32, 0.72, 0, 1);
}
.join-step.is-active { opacity: 1; pointer-events: auto; transform: none; }
.join-step h2 { margin: 0 0 6px; font-size: 20px; font-weight: 600; letter-spacing: -0.02em; }
.join-lead { margin: 0 0 22px; font-size: 13px; line-height: 1.6; color: var(--j-ink-2); }

/* ---------------- 字段 ---------------- */
.join-fld { margin-bottom: 18px; }
.join-label { display: flex; align-items: baseline; gap: 7px; font-size: 12.5px; font-weight: 600; margin-bottom: 7px; }
.join-tag { font-size: 10.5px; font-weight: 500; padding: 2px 6px; border-radius: 5px; }
.join-tag-req { color: var(--j-err); background: var(--j-err-soft); }
.join-tag-opt { color: var(--j-ink-2); background: var(--liquid-bg-nested, rgba(15, 23, 42, 0.05)); }
.join-ctrl { position: relative; display: flex; align-items: center; }
.join-ctrl input,
.join-birth select {
  width: 100%;
  font: inherit;
  font-size: 14.5px;
  color: var(--j-ink);
  background: var(--liquid-bg-nested, rgba(255, 255, 255, 0.42));
  border: 1px solid var(--j-line);
  border-radius: var(--j-radius-input);
  padding: 12px 13px;
  transition: border-color 0.16s, box-shadow 0.16s, background 0.16s;
}
.join-ctrl input::placeholder { color: var(--j-ink-3); }
.join-ctrl input:focus,
.join-birth select:focus { outline: none; border-color: var(--j-accent); box-shadow: var(--j-ring); }
.join-fld.is-invalid .join-ctrl input,
.join-fld.is-invalid .join-birth select { border-color: var(--j-err); }
.join-fld.is-valid .join-ctrl input { border-color: var(--j-ok); }
.join-state { position: absolute; right: 12px; font-size: 11.5px; font-weight: 500; pointer-events: none; }
.join-state.is-checking { color: var(--j-ink-3); }
.join-state.is-ok { color: var(--j-ok); }
.join-state.is-err { color: var(--j-err); }
.join-toggle {
  position: absolute;
  right: 6px;
  border: 0;
  background: transparent;
  color: var(--j-accent);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  padding: 7px 9px;
  border-radius: 7px;
  cursor: pointer;
}
.join-toggle:hover { background: var(--j-accent-soft); }
.join-msg { margin: 6px 0 0; font-size: 11.5px; line-height: 1.5; color: var(--j-err); }
.join-msg:empty { display: none; }
.join-msg.is-warn-on { color: var(--j-warn); }
.join-hint { margin: 6px 0 0; font-size: 11.5px; line-height: 1.55; color: var(--j-ink-3); }
.join-suggest { margin: 9px 0 0; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.join-suggest span { font-size: 11.5px; color: var(--j-ink-2); }
.join-suggest button {
  border: 1px solid var(--j-line);
  background: var(--liquid-bg-nested, rgba(255, 255, 255, 0.42));
  color: var(--j-ink);
  font: inherit;
  font-size: 12px;
  padding: 5px 10px;
  border-radius: 999px;
  cursor: pointer;
}
.join-suggest button:hover { border-color: var(--j-accent); color: var(--j-accent); }

.join-meter { display: flex; gap: 5px; margin-top: 9px; }
.join-meter i { flex: 1; height: 4px; border-radius: 2px; background: var(--j-line); transition: background 0.3s; }
.join-meter[data-level='1'] i:nth-child(-n + 1) { background: var(--j-err); }
.join-meter[data-level='2'] i:nth-child(-n + 2) { background: var(--j-warn); }
.join-meter[data-level='3'] i { background: var(--j-ok); }
.join-meter-label { font-size: 11.5px; color: var(--j-ink-3); margin-top: 6px; }
.join-rules { list-style: none; margin: 11px 0 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 5px 12px; }
.join-rules li { font-size: 11.5px; color: var(--j-ink-3); display: flex; align-items: center; gap: 6px; transition: color 0.2s; }
.join-rules li::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: var(--j-line); flex: none; }
.join-rules li.is-hit { color: var(--j-ok); }
.join-rules li.is-hit::before { background: var(--j-ok); }

.join-birth { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }

.join-avatar-row { display: flex; align-items: center; gap: 15px; }
.join-avatar-drop {
  width: 66px;
  height: 66px;
  flex: none;
  border-radius: 50%;
  overflow: hidden;
  background: var(--liquid-bg-nested, rgba(255, 255, 255, 0.42));
  border: 1px solid var(--j-line);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--j-ink-3);
}
.join-avatar-drop img { width: 100%; height: 100%; object-fit: cover; }
.join-avatar-side { display: flex; flex-direction: column; align-items: flex-start; gap: 7px; }
.join-avatar-btns { display: flex; gap: 7px; }
.join-mini {
  border: 1px solid var(--j-line);
  background: var(--liquid-bg-nested, rgba(255, 255, 255, 0.42));
  color: var(--j-ink);
  font: inherit;
  font-size: 12.5px;
  padding: 7px 13px;
  border-radius: 9px;
  cursor: pointer;
}
.join-mini:hover { border-color: var(--j-accent); color: var(--j-accent); }
.join-mini:disabled { opacity: 0.5; cursor: not-allowed; }

/* 开关：原生 checkbox + role=switch，保留键盘与读屏语义 */
.join-switch-row {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  cursor: pointer;
  padding: 14px 15px;
  border: 1px solid var(--j-line);
  border-radius: var(--j-radius-input);
  background: var(--liquid-bg-nested, rgba(255, 255, 255, 0.42));
}
.join-switch-input {
  position: absolute;
  left: 15px;
  top: 16px;
  width: 38px;
  height: 22px;
  margin: 0;
  opacity: 0;
  cursor: pointer;
  z-index: 2;
}
.join-switch-track {
  width: 38px;
  height: 22px;
  border-radius: 999px;
  background: var(--j-line);
  position: relative;
  flex: none;
  transition: background 0.2s;
}
.join-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.28);
  transition: transform 0.2s cubic-bezier(0.32, 0.72, 0, 1);
}
.join-switch-input:checked + .join-switch-track { background: var(--j-accent); }
.join-switch-input:checked + .join-switch-track .join-switch-knob { transform: translateX(16px); }
.join-switch-input:focus-visible + .join-switch-track { box-shadow: var(--j-ring); }
.join-switch-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.join-switch-title { font-size: 13px; font-weight: 600; }
.join-switch-desc { font-size: 11.5px; line-height: 1.55; color: var(--j-ink-3); }

.join-altcha { margin-top: 4px; display: flex; flex-direction: column; align-items: center; gap: 7px; }
.join-altcha-idle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  border: 1px solid var(--j-line);
  border-radius: var(--j-radius-input);
  padding: 11px 13px;
  background: var(--liquid-bg-nested, rgba(255, 255, 255, 0.42));
  font: inherit;
  font-size: 13px;
  color: var(--j-ink);
}
.join-altcha-idle:hover { border-color: var(--j-accent); }
.join-altcha-cb { width: 15px; height: 15px; border-radius: 4px; border: 1.5px solid var(--j-ink-3); flex: none; }
.join-altcha-brand { margin-left: auto; font-size: 10.5px; color: var(--j-ink-3); letter-spacing: 0.04em; }
.join-altcha-status { margin: 0; font-size: 12px; color: var(--j-ink-3); }
.join-altcha-status.is-error { color: var(--j-err); }

/* ---------------- 动作 ---------------- */
.join-actions { display: flex; gap: 10px; padding: 24px 0 4px; }
.join-btn {
  font: inherit;
  font-size: 14.5px;
  font-weight: 600;
  border-radius: var(--j-radius-btn);
  padding: 13px 20px;
  cursor: pointer;
  transition: transform 0.16s, background 0.16s, color 0.16s, border-color 0.16s, opacity 0.16s;
  text-align: center;
  text-decoration: none;
  display: block;
  box-sizing: border-box;
}
.join-btn-primary { flex: 1; border: 0; background: var(--j-accent); color: #fff; }
.join-btn-primary:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.06); }
.join-btn-ghost { flex: none; border: 1px solid var(--j-line); background: transparent; color: var(--j-ink); }
.join-btn-ghost:hover:not(:disabled) { border-color: var(--j-ink-3); }
.join-btn:disabled { opacity: 0.55; cursor: not-allowed; }

.join-terms {
  position: sticky;
  bottom: 0;
  margin-top: auto;
  padding: 13px 40px 16px;
  background: var(--liquid-bg-strong, rgba(255, 255, 255, 0.84));
  border-top: 1px solid var(--j-line-2);
}
.join-terms-inner { max-width: 412px; margin: 0 auto; display: flex; flex-direction: column; gap: 8px; }
.join-terms label { display: flex; align-items: flex-start; gap: 9px; cursor: pointer; user-select: none; }
.join-terms input { width: 17px; height: 17px; margin: 1px 0 0; accent-color: var(--j-accent); flex: none; cursor: pointer; }
.join-terms-text { font-size: 11.5px; line-height: 1.55; color: var(--j-ink-2); }
.join-terms a { color: var(--j-accent); text-decoration: none; font-weight: 500; }
.join-terms a:hover { text-decoration: underline; }
.join-terms-note { margin: 0; font-size: 10.5px; color: var(--j-ink-3); }
.join-terms.is-invalid .join-terms-text { color: var(--j-err); }

/* ---------------- 完成页 ---------------- */
.join-done {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 56px 40px;
  margin: auto 0;
  max-width: 440px;
  align-self: center;
}
.join-done-mark { width: 64px; height: 64px; border-radius: 20px; background: var(--j-ok); position: relative; flex: none; margin-bottom: 22px; }
.join-done-mark::after {
  content: '';
  position: absolute;
  left: 23px;
  top: 14px;
  width: 14px;
  height: 26px;
  border: solid #fff;
  border-width: 0 3px 3px 0;
  transform: rotate(45deg);
}
.join-done h2 { margin: 0 0 10px; font-size: 23px; font-weight: 600; letter-spacing: -0.02em; }
.join-done p { margin: 0 0 6px; font-size: 13.5px; line-height: 1.66; color: var(--j-ink-2); }
.join-done p strong { color: var(--j-ink); font-weight: 600; }
.join-done-actions { margin-top: 26px; display: flex; flex-direction: column; gap: 9px; width: 100%; }
.join-done-actions .join-btn { width: 100%; font-size: 14px; }
.join-resend-note { font-size: 11.5px; margin-top: 8px; }
.join-resend-note.is-ok { color: var(--j-ok); }
.join-resend-note.is-err { color: var(--j-err); }
.join-passkey-deferred { margin-top: 18px; font-size: 11.5px; line-height: 1.6; color: var(--j-ink-3); }

.join-passkey-card {
  margin-top: 22px;
  width: 100%;
  text-align: left;
  padding: 16px;
  border: 1px solid var(--j-line);
  border-radius: var(--j-radius-input);
  background: var(--liquid-bg-nested, rgba(255, 255, 255, 0.42));
}
.join-passkey-head { display: flex; gap: 11px; align-items: flex-start; }
.join-passkey-ico { width: 30px; height: 30px; border-radius: 9px; background: var(--j-accent-soft); flex: none; position: relative; }
.join-passkey-ico::after {
  content: '';
  position: absolute;
  left: 9px;
  top: 7px;
  width: 12px;
  height: 14px;
  border-radius: 6px 6px 3px 3px;
  border: 1.8px solid var(--j-accent);
  border-bottom-width: 3px;
}
.join-passkey-title { font-size: 13.5px; font-weight: 600; display: block; margin-bottom: 4px; }
.join-passkey-desc { margin: 0; font-size: 11.5px; line-height: 1.6; color: var(--j-ink-2); }
.join-passkey-actions { display: flex; gap: 8px; margin-top: 14px; }
.join-passkey-actions .join-btn { padding: 11px 16px; font-size: 13px; border-radius: 11px; }
.join-passkey-actions .join-btn-primary { flex: 1; }
.join-passkey-ok { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 600; color: var(--j-ok); margin-top: 14px; }
.join-tick { width: 16px; height: 16px; border-radius: 5px; background: var(--j-ok); position: relative; flex: none; }
.join-tick::after {
  content: '';
  position: absolute;
  left: 5.5px;
  top: 2px;
  width: 3px;
  height: 7px;
  border: solid #fff;
  border-width: 0 1.6px 1.6px 0;
  transform: rotate(45deg);
}
.join-passkey-state { margin: 11px 0 0; font-size: 11.5px; line-height: 1.55; color: var(--j-err); }
.join-passkey-state:empty { display: none; }

/* ---------------- 响应式 ---------------- */
@media (max-width: 900px) {
  .join-page { padding: var(--join-nav-h, 78px) 0 0; align-items: stretch; }
  .join-stage { max-width: none; }
  .join-card {
    /* 固定成「刚好一屏」：内部 .join-main 自己滚，协议条 sticky 在卡片底部，
       这样协议条永远在视野里（min-height 会让卡片长出 5~6px 把协议条挤到折线以下） */
    height: calc(100vh - var(--join-nav-h, 78px));
    border-radius: 0;
    border-left: 0;
    border-right: 0;
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
  .join-aside { padding: 18px 20px 16px; }
  .join-hero { object-position: center 38%; }
  /* 移动端内层落平：保留可读底色，但不叠模糊、不加阴影 */
  .join-panel { margin: 0; padding: 14px 15px; box-shadow: none; border-radius: 14px; }
  .join-hero-scrim { background: linear-gradient(180deg, rgba(0, 0, 0, 0.42) 0%, rgba(0, 0, 0, 0.58) 100%); }
  .join-brand-name,
  .join-aside-privacy { display: none; }
  .join-aside-copy { margin-top: 14px; }
  .join-aside-copy h1 { font-size: 20px; margin-bottom: 6px; }
  .join-aside-copy p { font-size: 12.5px; }
  .join-stats { display: none; }
  .join-inner { padding: 22px 20px 0; max-width: none; }
  .join-terms { padding: 12px 20px 15px; }
  .join-terms-inner { max-width: none; }
  .join-done { padding: 40px 20px; max-width: none; }
  .join-step h2 { font-size: 18px; }
}

@media (prefers-reduced-motion: reduce) {
  .join-viewport,
  .join-step,
  .join-dot,
  .join-switch-knob { transition: none; }
}
</style>
