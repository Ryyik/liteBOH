<template>
  <div class="settings-page account-security-page"
    :style="{ '--user-center-nav-offset': isFromUserSpace ? '0px' : '72px', paddingTop: isFromUserSpace ? '0px' : '72px' }">
    <UserCenterPageHeader v-if="isFromUserSpace" title="账户安全" max-width="680px" @back="handleHeaderBack" />

    <div class="settings-page-container">
      <Transition name="security-panel" mode="out-in">
        <!-- 菜单 -->
        <div v-if="activePanel === 'menu'" key="menu" class="glass-settings">
          <section class="gs-group">
            <div class="gs-group-title">账户</div>
            <div class="gs-rows">
              <div class="gs-row is-static">
                <span class="gs-icon is-blue">
                  <Mail :size="16" :stroke-width="2" aria-hidden="true" />
                </span>
                <span class="gs-text">
                  <span class="gs-label">绑定邮箱</span>
                  <span class="gs-desc">用于登录与找回密码</span>
                </span>
                <span class="gs-side">
                  <span class="gs-value">{{ emailValue }}</span>
                </span>
              </div>
            </div>
          </section>

          <section class="gs-group">
            <div class="gs-group-title">安全</div>
            <div class="gs-rows">
              <button type="button" class="gs-row" @click="openChangePasswordPanel">
                <span class="gs-icon is-blue">
                  <KeyRound :size="16" :stroke-width="2" aria-hidden="true" />
                </span>
                <span class="gs-text">
                  <span class="gs-label">修改密码</span>
                  <span class="gs-desc">输入当前密码并设置新密码，更新登录凭证</span>
                </span>
                <span class="gs-side">
                  <ChevronRight class="gs-chevron" :size="16" :stroke-width="2" aria-hidden="true" />
                </span>
              </button>

              <button type="button" class="gs-row" @click="openDeleteAccountPanel">
                <span class="gs-icon is-red">
                  <TriangleAlert :size="16" :stroke-width="2" aria-hidden="true" />
                </span>
                <span class="gs-text">
                  <span class="gs-label gs-label-danger">注销账号</span>
                  <span class="gs-desc">高风险操作，三步确认后永久注销账号</span>
                </span>
                <span class="gs-side">
                  <ChevronRight class="gs-chevron gs-chevron-danger" :size="16" :stroke-width="2" aria-hidden="true" />
                </span>
              </button>
            </div>
          </section>
        </div>

        <!-- 修改密码 -->
        <div v-else-if="activePanel === 'password'" key="password" class="glass-settings">
          <section class="gs-group">
            <div class="gs-rows">
              <div class="gs-row is-static">
                <span class="gs-icon is-blue">
                  <KeyRound :size="16" :stroke-width="2" aria-hidden="true" />
                </span>
                <span class="gs-text">
                  <span class="gs-label">修改密码</span>
                  <span class="gs-desc">为安全起见，请先输入当前密码，再设置一个新的登录密码。</span>
                </span>
              </div>
            </div>
          </section>

          <section class="gs-group">
            <div class="sec-form">
              <label class="gs-field-label" for="current-password">当前密码</label>
              <div class="gs-input-wrap">
                <span class="gs-input-icon">
                  <Lock :size="15" :stroke-width="2" aria-hidden="true" />
                </span>
                <input id="current-password" v-model="passwordForm.currentPassword" type="password" class="gs-input"
                  placeholder="请输入当前密码" autocomplete="current-password" :disabled="isUpdatingPassword">
              </div>

              <label class="gs-field-label" for="new-password">新密码</label>
              <div class="gs-input-wrap">
                <span class="gs-input-icon">
                  <KeyRound :size="15" :stroke-width="2" aria-hidden="true" />
                </span>
                <input id="new-password" v-model="passwordForm.newPassword" type="password" class="gs-input"
                  placeholder="请输入新密码" autocomplete="new-password" :disabled="isUpdatingPassword">
              </div>

              <label class="gs-field-label" for="confirm-password">确认新密码</label>
              <div class="gs-input-wrap">
                <span class="gs-input-icon">
                  <ShieldCheck :size="15" :stroke-width="2" aria-hidden="true" />
                </span>
                <input id="confirm-password" v-model="passwordForm.confirmPassword" type="password" class="gs-input"
                  placeholder="请再次输入新密码" autocomplete="new-password" :disabled="isUpdatingPassword">
              </div>

              <p class="gs-hint">
                <Info :size="13" :stroke-width="2" aria-hidden="true" />
                建议使用至少 8 位密码，并同时包含字母与数字。
              </p>

              <div v-if="passwordUpdateError" class="gs-banner error">
                <AlertCircle :size="16" :stroke-width="2" aria-hidden="true" />
                <span>{{ passwordUpdateError }}</span>
              </div>
              <div v-if="passwordUpdateSuccess" class="gs-banner success">
                <CheckCircle2 :size="16" :stroke-width="2" aria-hidden="true" />
                <span>{{ passwordUpdateSuccess }}</span>
              </div>

              <div class="gs-actions sec-actions">
                <button class="gs-btn ghost" :disabled="isUpdatingPassword" @click="backToMenu">返回</button>
                <button class="gs-btn primary" :disabled="isUpdatingPassword" @click="submitPasswordChange">
                  {{ isUpdatingPassword ? '修改中...' : '确认修改密码' }}
                </button>
              </div>
            </div>
          </section>
        </div>

        <!-- 注销账号 -->
        <div v-else key="delete" class="glass-settings">
          <section class="gs-group">
            <div class="gs-rows">
              <div class="gs-row is-static">
                <span class="gs-icon is-red">
                  <TriangleAlert :size="16" :stroke-width="2" aria-hidden="true" />
                </span>
                <span class="gs-text">
                  <span class="gs-label gs-label-danger">注销账号</span>
                  <span class="gs-desc">账号注销后不可恢复，系统会尝试删除你的账号资料与关联数据，请谨慎操作。</span>
                </span>
              </div>
            </div>
          </section>

          <section class="gs-group">
            <div class="sec-form">
              <p class="sec-step-badge">账号注销 · 步骤 {{ deleteAccountStep }}/3</p>

              <template v-if="deleteAccountStep === 1">
                <ul class="sec-risk-list">
                  <li>你的登录身份、个人资料、积分与订阅记录将无法恢复。</li>
                  <li>你发布的帖子、评论、消息等内容可能会被删除或失效。</li>
                  <li>注销完成后，你会立即退出当前登录状态。</li>
                </ul>

                <p class="sec-export-hint">
                  建议先在「设置 → 导出我的数据」中打包下载你的数据副本，注销后将无法再导出。
                  <router-link :to="{ path: '/user-space', query: { tab: 'settings', view: 'data-export' } }"
                    class="sec-export-link">前往导出</router-link>
                </p>

                <label class="sec-check-row">
                  <input v-model="deleteRiskAccepted" type="checkbox" :disabled="isDeletingAccount">
                  <span>我已阅读并理解以上风险</span>
                </label>
              </template>

              <template v-else-if="deleteAccountStep === 2">
                <p class="sec-help-text">
                  请输入确认口令 <strong>{{ DELETE_ACCOUNT_CONFIRM_TEXT }}</strong> 继续。
                </p>
                <div class="gs-input-wrap">
                  <span class="gs-input-icon">
                    <Keyboard :size="15" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <input v-model.trim="deleteConfirmKeyword" type="text" class="gs-input"
                    :placeholder="`请输入：${DELETE_ACCOUNT_CONFIRM_TEXT}`" :disabled="isDeletingAccount">
                </div>
              </template>

              <template v-else>
                <p class="sec-help-text">为了安全，请输入当前账号密码完成最终确认。</p>
                <p class="sec-account-line">当前账号：{{ currentEmail }}</p>
                <div class="gs-input-wrap">
                  <span class="gs-input-icon">
                    <Lock :size="15" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <input v-model="deletePassword" type="password" class="gs-input" placeholder="请输入当前账号密码"
                    autocomplete="current-password" :disabled="isDeletingAccount">
                </div>
              </template>

              <div v-if="deleteAccountError" class="gs-banner error">
                <AlertCircle :size="16" :stroke-width="2" aria-hidden="true" />
                <span>{{ deleteAccountError }}</span>
              </div>

              <div class="gs-actions sec-actions">
                <button class="gs-btn ghost" :disabled="isDeletingAccount" @click="backToMenu">返回</button>
                <button v-if="deleteAccountStep < 3" class="gs-btn danger" :disabled="isDeletingAccount"
                  @click="goDeleteAccountNextStep">
                  {{ deleteAccountStep === 1 ? '继续' : '下一步' }}
                </button>
                <button v-else class="gs-btn danger" :disabled="isDeletingAccount" @click="confirmDeleteAccount">
                  {{ isDeletingAccount ? '正在注销...' : '确认注销账号' }}
                </button>
              </div>
            </div>
          </section>
        </div>
      </Transition>
    </div>

    <CommonAlertModal v-model:visible="alertState.visible" :type="alertState.type" :title="alertState.title"
      :message="alertState.message" />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { AlertCircle, CheckCircle2, ChevronRight, Info, KeyRound, Keyboard, Lock, Mail, ShieldCheck, TriangleAlert } from 'lucide-vue-next';
import CommonAlertModal from '@/components/CommonAlertModal.vue';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import { useAuthStore } from '@/stores/auth';
import { resolveSettingsBackLocation } from '@/utils/user-space-navigation.js';
import { logger } from '@/utils/logger.js';

const DELETE_ACCOUNT_CONFIRM_TEXT = '确认注销';

const router = useRouter();
const route = useRoute();
const isFromUserSpace = computed(() => String(route.query.from || '').startsWith('userspace'));
const authStore = useAuthStore();
const { isLoggedIn, userInfo } = storeToRefs(authStore);

const activePanel = ref('menu');

const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
});
const isUpdatingPassword = ref(false);
const passwordUpdateError = ref('');
const passwordUpdateSuccess = ref('');

const deleteAccountStep = ref(1);
const deleteRiskAccepted = ref(false);
const deleteConfirmKeyword = ref('');
const deletePassword = ref('');
const deleteAccountError = ref('');
const isDeletingAccount = ref(false);

const alertState = reactive({
  visible: false,
  type: 'success',
  title: '',
  message: ''
});

const currentEmail = computed(() => userInfo.value?.email || '未读取到邮箱');
const emailValue = computed(() => userInfo.value?.email || '未绑定');

const showAlert = (type, title, message) => {
  alertState.type = type;
  alertState.title = title;
  alertState.message = message;
  alertState.visible = true;
};

const goBack = () => {
  router.push(resolveSettingsBackLocation(route));
};

const handleHeaderBack = () => {
  if (activePanel.value !== 'menu') {
    backToMenu();
    return;
  }
  goBack();
};

const backToMenu = () => {
  if (isDeletingAccount.value || isUpdatingPassword.value) return;
  activePanel.value = 'menu';
};

const resetPasswordForm = () => {
  passwordForm.currentPassword = '';
  passwordForm.newPassword = '';
  passwordForm.confirmPassword = '';
  passwordUpdateError.value = '';
  passwordUpdateSuccess.value = '';
  isUpdatingPassword.value = false;
};

const openChangePasswordPanel = () => {
  resetPasswordForm();
  activePanel.value = 'password';
};

const openDeleteAccountPanel = () => {
  resetDeleteAccountState();
  activePanel.value = 'delete';
};

const validateNewPassword = () => {
  const currentPassword = String(passwordForm.currentPassword || '');
  const newPassword = String(passwordForm.newPassword || '');
  const confirmPassword = String(passwordForm.confirmPassword || '');

  if (currentPassword.length < 6) {
    return '请输入当前密码（至少 6 位）。';
  }
  if (newPassword.length < 8) {
    return '新密码至少需要 8 位。';
  }
  if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    return '新密码需同时包含字母和数字。';
  }
  if (newPassword !== confirmPassword) {
    return '两次输入的新密码不一致。';
  }
  if (newPassword === currentPassword) {
    return '新密码不能与当前密码相同。';
  }
  return '';
};

const submitPasswordChange = async () => {
  passwordUpdateError.value = '';
  passwordUpdateSuccess.value = '';

  const validationMessage = validateNewPassword();
  if (validationMessage) {
    passwordUpdateError.value = validationMessage;
    return;
  }

  isUpdatingPassword.value = true;
  try {
    const result = await authStore.updatePassword(
      passwordForm.newPassword,
      passwordForm.currentPassword
    );

    if (!result?.success) {
      passwordUpdateError.value = result?.message || '密码修改失败，请稍后重试。';
      return;
    }

    passwordUpdateSuccess.value = '密码修改成功，下次登录请使用新密码。';
    passwordForm.currentPassword = '';
    passwordForm.newPassword = '';
    passwordForm.confirmPassword = '';
  } catch (error) {
    passwordUpdateError.value = error?.message || '密码修改失败，请稍后再试。';
  } finally {
    isUpdatingPassword.value = false;
  }
};

const resetDeleteAccountState = () => {
  deleteAccountStep.value = 1;
  deleteRiskAccepted.value = false;
  deleteConfirmKeyword.value = '';
  deletePassword.value = '';
  deleteAccountError.value = '';
  isDeletingAccount.value = false;
};

const goDeleteAccountNextStep = () => {
  deleteAccountError.value = '';

  if (deleteAccountStep.value === 1) {
    if (!deleteRiskAccepted.value) {
      deleteAccountError.value = '请先勾选"我已阅读并理解以上风险"。';
      return;
    }
    deleteAccountStep.value = 2;
    return;
  }

  if (String(deleteConfirmKeyword.value || '').trim() !== DELETE_ACCOUNT_CONFIRM_TEXT) {
    deleteAccountError.value = `请输入"${DELETE_ACCOUNT_CONFIRM_TEXT}"后继续。`;
    return;
  }

  deleteAccountStep.value = 3;
};

const confirmDeleteAccount = async () => {
  deleteAccountError.value = '';

  if (String(deleteConfirmKeyword.value || '').trim() !== DELETE_ACCOUNT_CONFIRM_TEXT) {
    deleteAccountError.value = `请输入"${DELETE_ACCOUNT_CONFIRM_TEXT}"后再确认注销。`;
    deleteAccountStep.value = 2;
    return;
  }

  const safePassword = String(deletePassword.value || '');
  if (safePassword.length < 6) {
    deleteAccountError.value = '请输入当前账号密码（至少 6 位）。';
    return;
  }

  isDeletingAccount.value = true;
  try {
    const result = await authStore.deleteAccount(safePassword);
    if (!result?.success) {
      deleteAccountError.value = result?.message || '注销失败，请稍后重试。';
      return;
    }

    resetDeleteAccountState();
    showAlert('success', '账号已注销', '账号已删除并退出登录。');
    setTimeout(() => {
      router.push('/');
    }, 400);
  } catch (error) {
    logger.error('account-security', '账号注销失败:', error);
    deleteAccountError.value = error?.message || '注销失败，请稍后再试。';
  } finally {
    isDeletingAccount.value = false;
  }
};

onMounted(async () => {
  if (!isLoggedIn.value) {
    authStore.showLoginModal = true;
    return;
  }

  activePanel.value = 'menu';
  resetPasswordForm();
  resetDeleteAccountState();
});
</script>

<style scoped>
@import '../UserSpace/styles/settings-glass.css';

.account-security-page .settings-page-container {
  padding-bottom: 60px;
}

/* ---------- 表单块 ---------- */
.sec-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 18px 16px;
}

.sec-actions {
  margin-top: 6px;
}

.sec-actions .gs-btn {
  flex: 1;
}

/* ---------- 注销流程 ---------- */
.sec-step-badge {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  margin: 0 0 2px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 59, 48, 0.1);
  color: #ff3b30;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.sec-risk-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 12px 14px 12px 32px;
  border-radius: 12px;
  background: rgba(255, 59, 48, 0.05);
  border: 1px solid rgba(255, 59, 48, 0.12);
}

.sec-risk-list li {
  font-size: 13px;
  line-height: 1.55;
  color: var(--liquid-text-secondary, #6e6e73);
  list-style: disc;
}

.sec-export-hint {
  margin: 0;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--liquid-text-secondary, #6e6e73);
  background: rgba(0, 113, 227, 0.06);
  border: 1px solid rgba(0, 113, 227, 0.12);
}

.sec-export-link {
  color: #0071e3;
  font-weight: 600;
  text-decoration: none;
  margin-left: 4px;
}

.sec-export-link:hover {
  text-decoration: underline;
}

.sec-check-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--liquid-text-primary, #1d1d1f);
  cursor: pointer;
}

.sec-check-row input {
  width: 16px;
  height: 16px;
  accent-color: #ff3b30;
}

.sec-help-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--liquid-text-secondary, #6e6e73);
}

.sec-help-text strong {
  color: #0071e3;
  font-weight: 700;
}

.sec-account-line {
  margin: 0;
  font-size: 12px;
  color: var(--liquid-text-tertiary, #8b9098);
  word-break: break-all;
}

/* ---------- 面板切换动画 ---------- */
.security-panel-enter-active,
.security-panel-leave-active {
  transition: opacity 200ms var(--ease-out, ease-out), transform 200ms var(--ease-out, ease-out);
}

.security-panel-enter-from,
.security-panel-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* ---------- 暗色补充 ---------- */
[data-theme="dark"] .sec-step-badge {
  background: rgba(255, 105, 97, 0.14);
  color: #ff6961;
}

[data-theme="dark"] .sec-check-row {
  color: #f4f6f8;
}

[data-theme="dark"] .sec-help-text {
  color: #a7afba;
}

[data-theme="dark"] .sec-account-line {
  color: #8b9098;
}

[data-theme="dark"] .sec-risk-list li {
  color: #a7afba;
}

[data-theme="dark"] .sec-export-hint {
  color: #a7afba;
}

[data-theme="dark"] .sec-risk-list {
  background: rgba(255, 105, 97, 0.08);
  border-color: rgba(255, 105, 97, 0.16);
}

[data-theme="dark"] .sec-export-hint {
  background: rgba(41, 151, 255, 0.08);
  border-color: rgba(41, 151, 255, 0.14);
}

[data-theme="dark"] .sec-export-link,
[data-theme="dark"] .sec-help-text strong {
  color: #2997ff;
}

/* ---------- 手机横屏 ---------- */
@media (orientation: landscape) and (max-height: 520px) {
  .sec-form {
    padding: 10px 16px 12px;
    gap: 8px;
  }
}
</style>
