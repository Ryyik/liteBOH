<template>
  <div class="account-security-page" :style="{ '--user-center-nav-offset': isFromUserSpace ? '0px' : '72px', paddingTop: isFromUserSpace ? '0px' : '72px' }">
    <UserCenterPageHeader v-if="isFromUserSpace" title="账户安全" max-width="1200px" @back="handleHeaderBack" />

    <div class="profile-subpage-shell">
      <div class="profile-subpage-body">
        <Transition name="security-panel" mode="out-in">
          <div v-if="activePanel === 'menu'" key="menu" class="apple-card">
            <div class="apple-list-group">
              <div class="apple-item clickable" @click="openChangePasswordPanel">
                <span class="item-left">
                  <span class="icon-wrapper bg-blue">
                    <KeyRound :size="16" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <span class="setting-label-stack">
                    <span class="item-label">修改密码</span>
                    <span class="item-desc">输入当前密码并设置新密码，更新登录凭证</span>
                  </span>
                </span>
                <span class="item-right"><span class="chevron" aria-hidden="true">›</span></span>
              </div>

              <div
                class="apple-item clickable security-danger-item"
                @click="openDeleteAccountPanel"
              >
                <span class="item-left">
                  <span class="icon-wrapper bg-red">
                    <TriangleAlert :size="16" :stroke-width="2" aria-hidden="true" />
                  </span>
                  <span class="setting-label-stack">
                    <span class="item-label text-danger">注销账号</span>
                    <span class="item-desc">高风险操作，三步确认后永久注销账号</span>
                  </span>
                </span>
                <span class="item-right"><span class="chevron text-danger" aria-hidden="true">›</span></span>
              </div>
            </div>
          </div>

          <div v-else-if="activePanel === 'password'" key="password" class="apple-card security-panel">
            <div class="panel-head">
              <h3>修改密码</h3>
              <p class="panel-desc">为安全起见，请先输入当前密码，再设置一个新的登录密码。</p>
            </div>

            <div class="form-stack">
              <label class="field-label" for="current-password">当前密码</label>
              <input
                id="current-password"
                v-model="passwordForm.currentPassword"
                type="password"
                class="security-input"
                placeholder="请输入当前密码"
                autocomplete="current-password"
                :disabled="isUpdatingPassword"
              >

              <label class="field-label" for="new-password">新密码</label>
              <input
                id="new-password"
                v-model="passwordForm.newPassword"
                type="password"
                class="security-input"
                placeholder="请输入新密码"
                autocomplete="new-password"
                :disabled="isUpdatingPassword"
              >

              <label class="field-label" for="confirm-password">确认新密码</label>
              <input
                id="confirm-password"
                v-model="passwordForm.confirmPassword"
                type="password"
                class="security-input"
                placeholder="请再次输入新密码"
                autocomplete="new-password"
                :disabled="isUpdatingPassword"
              >
            </div>

            <p class="form-help-text">建议使用至少 8 位密码，并同时包含字母与数字。</p>
            <p v-if="passwordUpdateError" class="inline-error">{{ passwordUpdateError }}</p>
            <p v-if="passwordUpdateSuccess" class="inline-success">{{ passwordUpdateSuccess }}</p>

            <div class="section-actions">
              <button class="secondary-btn" :disabled="isUpdatingPassword" @click="backToMenu">返回</button>
              <button class="primary-btn" :disabled="isUpdatingPassword" @click="submitPasswordChange">
                {{ isUpdatingPassword ? '修改中...' : '确认修改密码' }}
              </button>
            </div>
          </div>

          <div v-else key="delete" class="apple-card security-panel danger-card">
            <div class="panel-head">
              <h3>注销账号</h3>
              <p class="panel-desc">账号注销后不可恢复，系统会尝试删除你的账号资料与关联数据，请谨慎操作。</p>
            </div>

            <p class="delete-step-badge">账号注销 · 步骤 {{ deleteAccountStep }}/3</p>

            <template v-if="deleteAccountStep === 1">
              <ul class="delete-risk-list">
                <li>你的登录身份、个人资料、积分与订阅记录将无法恢复。</li>
                <li>你发布的帖子、评论、消息等内容可能会被删除或失效。</li>
                <li>注销完成后，你会立即退出当前登录状态。</li>
              </ul>

              <p class="delete-export-hint">
                建议先在「设置 → 导出我的数据」中打包下载你的数据副本，注销后将无法再导出。
                <a class="delete-export-link" href="/user-space?tab=profile&view=data-export">前往导出</a>
              </p>

              <label class="delete-check-row">
                <input v-model="deleteRiskAccepted" type="checkbox" :disabled="isDeletingAccount">
                <span>我已阅读并理解以上风险</span>
              </label>
            </template>

            <template v-else-if="deleteAccountStep === 2">
              <p class="delete-help-text">
                请输入确认口令 <strong>{{ DELETE_ACCOUNT_CONFIRM_TEXT }}</strong> 继续。
              </p>
              <input
                v-model.trim="deleteConfirmKeyword"
                type="text"
                class="delete-account-input"
                :placeholder="`请输入：${DELETE_ACCOUNT_CONFIRM_TEXT}`"
                :disabled="isDeletingAccount"
              >
            </template>

            <template v-else>
              <p class="delete-help-text">为了安全，请输入当前账号密码完成最终确认。</p>
              <p class="delete-account-email">当前账号：{{ currentEmail }}</p>
              <input
                v-model="deletePassword"
                type="password"
                class="delete-account-input"
                placeholder="请输入当前账号密码"
                autocomplete="current-password"
                :disabled="isDeletingAccount"
              >
            </template>

            <p v-if="deleteAccountError" class="inline-error danger-error">{{ deleteAccountError }}</p>

            <div class="section-actions">
              <button class="secondary-btn" :disabled="isDeletingAccount" @click="backToMenu">返回</button>
              <button
                v-if="deleteAccountStep < 3"
                class="primary-danger-btn"
                :disabled="isDeletingAccount"
                @click="goDeleteAccountNextStep"
              >
                {{ deleteAccountStep === 1 ? '继续' : '下一步' }}
              </button>
              <button
                v-else
                class="primary-danger-btn"
                :disabled="isDeletingAccount"
                @click="confirmDeleteAccount"
              >
                {{ isDeletingAccount ? '正在注销...' : '确认注销账号' }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <CommonAlertModal
      v-model:visible="alertState.visible"
      :type="alertState.type"
      :title="alertState.title"
      :message="alertState.message"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { KeyRound, TriangleAlert } from 'lucide-vue-next';
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
      deleteAccountError.value = '请先勾选“我已阅读并理解以上风险”。';
      return;
    }
    deleteAccountStep.value = 2;
    return;
  }

  if (String(deleteConfirmKeyword.value || '').trim() !== DELETE_ACCOUNT_CONFIRM_TEXT) {
    deleteAccountError.value = `请输入“${DELETE_ACCOUNT_CONFIRM_TEXT}”后继续。`;
    return;
  }

  deleteAccountStep.value = 3;
};

const confirmDeleteAccount = async () => {
  deleteAccountError.value = '';

  if (String(deleteConfirmKeyword.value || '').trim() !== DELETE_ACCOUNT_CONFIRM_TEXT) {
    deleteAccountError.value = `请输入“${DELETE_ACCOUNT_CONFIRM_TEXT}”后再确认注销。`;
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
    router.push('/login');
    return;
  }

  activePanel.value = 'menu';
  resetPasswordForm();
  resetDeleteAccountState();
});
</script>

<style scoped>
@import './style.scoped.css';
</style>
