<template>
  <div class="notification-settings">
    <!-- 单一液态玻璃连续面板（与设置主页同一设计体系，2026-09-09） -->
    <div class="glass-settings">
      <!-- 单卡（2026-11-10 用户口径「通知设置不要分类了」）：
           原来四段（应用内 / 邮件 / 审核 / 生日）各有组头 = 四张卡 + 26px 组距，
           一屏被切成四块；而且「应用内通知」「邮件通知」这类组名与行名重复了一遍。
           现在只有一张卡，渠道差异交给每行自己的说明文字。 -->
      <section class="gs-group">
        <div class="gs-rows">
          <!-- ① 应用内通知（Web Push）：无需第三方账号，是主通道 -->
          <div v-if="!pushLoaded" class="gs-row is-static">
            <span class="gs-icon is-blue">
              <Bell :size="16" :stroke-width="2" aria-hidden="true" />
            </span>
            <span class="gs-text">
              <span class="gs-label">正在检查当前环境…</span>
            </span>
          </div>

          <div v-else-if="!pushStatus.supported" class="gs-row is-static">
            <span class="gs-icon is-yellow">
              <BellOff :size="16" :stroke-width="2" aria-hidden="true" />
            </span>
            <span class="gs-text">
              <span class="gs-label">当前环境不可用</span>
              <span class="gs-desc">{{ pushStatus.reason }}</span>
            </span>
          </div>

          <template v-else>
            <div class="gs-row">
              <span class="gs-icon" :class="pushEnabled ? 'is-green' : 'is-blue'">
                <BellRing v-if="pushEnabled" :size="16" :stroke-width="2" aria-hidden="true" />
                <Bell v-else :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
              <span class="gs-text">
                <span class="gs-label">{{ pushEnabled ? '通知已开启' : '开启浏览器通知' }}</span>
                <span class="gs-desc">{{
                  pushEnabled ? '有新消息时在设备上提醒你' : pushHint
                }}</span>
              </span>
              <span class="gs-side">
                <SettingToggle
                  :model-value="pushEnabled"
                  :disabled="isPushBusy || !pushStatus.configured"
                  label="应用内通知"
                  @update:model-value="handlePushToggle"
                />
              </span>
            </div>

            <div v-if="pushEnabled" class="gs-row is-static">
              <span class="gs-icon is-purple">
                <Smartphone :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
              <span class="gs-text">
                <span class="gs-label">图标角标</span>
                <span class="gs-desc">{{ pushBadgeHint }}</span>
              </span>
            </div>
          </template>

          <div v-if="pushLoaded && pushStatus.supported && pushEnabled" class="pp-form">
            <div class="gs-actions">
              <button class="gs-btn ghost" :disabled="isPushBusy" @click="testWebPush">
                <span v-if="isPushBusy" class="gs-spinner"></span>
                <template v-else>发送测试通知</template>
              </button>
            </div>
          </div>

          <!-- ② 关注的人邮件通知：服务端发信到账号绑定邮箱，与上面的通道互相独立 -->
          <div class="gs-row">
            <span class="gs-icon" :class="mailEnabled ? 'is-green' : 'is-blue'">
              <Mail :size="16" :stroke-width="2" aria-hidden="true" />
            </span>
            <span class="gs-text">
              <span class="gs-label">关注的人邮件通知</span>
              <span class="gs-desc">{{
                mailEnabled
                  ? '关注的人发布新帖或评论、回复你的帖子时，发送至绑定邮箱'
                  : '开启后，关注的人发布新帖或评论、回复你的帖子都会发送邮件'
              }}</span>
            </span>
            <span class="gs-side">
              <SettingToggle
                :model-value="mailEnabled"
                :disabled="isMailBusy || !mailLoaded"
                label="关注的人邮件通知"
                @update:model-value="handleMailToggle"
              />
            </span>
          </div>

          <div v-if="mailEnabled" class="gs-row is-static">
            <span class="gs-icon is-blue">
              <Clock :size="16" :stroke-width="2" aria-hidden="true" />
            </span>
            <span class="gs-text">
              <span class="gs-label">减少打扰</span>
              <span class="gs-desc"
                >同一个人的多条消息按周期合并发送，不会每条都发；邮件带正文摘要和配图</span
              >
            </span>
          </div>

          <!-- ③ 审核结果邮件：只在「图片被复审撤下」时发 -->
          <div class="gs-row">
            <span class="gs-icon" :class="moderationMailEnabled ? 'is-green' : 'is-blue'">
              <Shield :size="16" :stroke-width="2" aria-hidden="true" />
            </span>
            <span class="gs-text">
              <span class="gs-label">审核结果邮件</span>
              <span class="gs-desc">{{
                moderationMailEnabled
                  ? '图片未通过复审被移除时，发邮件到你的绑定邮箱'
                  : '开启后，内容未通过复审会发邮件提醒（不常发生）'
              }}</span>
            </span>
            <span class="gs-side">
              <SettingToggle
                :model-value="moderationMailEnabled"
                :disabled="isModerationMailBusy || !moderationMailLoaded"
                label="审核结果邮件"
                @update:model-value="handleModerationMailToggle"
              />
            </span>
          </div>

          <!-- ④ 生日邮件：默认开启，一年只发一封 -->
          <div class="gs-row">
            <span class="gs-icon" :class="birthdayMailEnabled ? 'is-purple' : 'is-blue'">
              <Cake :size="16" :stroke-width="2" aria-hidden="true" />
            </span>
            <span class="gs-text">
              <span class="gs-label">生日邮件</span>
              <span class="gs-desc">{{ birthdayMailDesc }}</span>
            </span>
            <span class="gs-side">
              <SettingToggle
                :model-value="birthdayMailEnabled"
                :disabled="isBirthdayMailBusy || !birthdayMailLoaded"
                label="生日邮件"
                @update:model-value="handleBirthdayMailToggle"
              />
            </span>
          </div>
        </div>
      </section>

      <!-- 消息横幅 -->
      <transition name="pp-fade">
        <section v-if="message" class="gs-group">
          <div class="pp-banner-wrap">
            <div class="gs-banner" :class="messageType">
              <CheckCircle2
                v-if="messageType === 'success'"
                :size="16"
                :stroke-width="2"
                aria-hidden="true"
              />
              <AlertCircle
                v-else-if="messageType === 'error'"
                :size="16"
                :stroke-width="2"
                aria-hidden="true"
              />
              <Info v-else :size="16" :stroke-width="2" aria-hidden="true" />
              <span>{{ message }}</span>
            </div>
          </div>
        </section>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import {
  AlertCircle,
  Bell,
  BellOff,
  BellRing,
  Cake,
  CheckCircle2,
  Clock,
  Info,
  Mail,
  Shield,
  Smartphone,
} from 'lucide-vue-next';
import SettingToggle from '@/views/user-center/UserSpace/components/SettingToggle.vue';
import { useAuthStore } from '@/stores/auth';
import { getPushStatus, enablePush, disablePush, sendTestPush } from '@/utils/api/push-api.js';
import {
  getBirthdayMailEnabled,
  getFollowMailEnabled,
  getModerationMailEnabled,
  toggleBirthdayMail,
  toggleFollowMail,
  toggleModerationMail,
} from '@/utils/api/mail-notify-api.js';

const authStore = useAuthStore();

const message = ref('');
const messageType = ref('');
let messageTimer = null;

// ---------- 应用内通知（Web Push）----------
// 权限由浏览器授予，不依赖任何第三方账号。
const isPushBusy = ref(false);
// 加载位：能力检测是同步的，但「服务端是否已配置」要等一次网络请求，
// 不加这个位首帧会把「还没查完」误画成「当前环境不可用」
const pushLoaded = ref(false);
const pushStatus = ref({
  supported: false,
  reason: '',
  configured: false,
  permission: 'default',
  enabled: false,
  endpoint: '',
});
const pushEnabled = computed(() => Boolean(pushStatus.value.enabled));

const pushHint = computed(() => {
  const status = pushStatus.value;
  if (!status.configured) return '服务端尚未开启推送功能';
  if (status.permission === 'denied') return '通知权限已被浏览器拒绝，需在网站设置里允许';
  return '有新消息时在设备上弹出提醒';
});

// 安卓拿不到数字角标（Chrome for Android 不支持 setAppBadge），如实说明，避免被当成 bug
const pushBadgeHint = computed(() => {
  const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
  if (/Android/i.test(ua)) return '安卓由系统在有用未读通知时点亮圆点，不显示数字';
  return '未读数量会显示在应用图标上';
});

const loadPushStatus = async () => {
  if (!authStore.userInfo?.id) {
    pushLoaded.value = true;
    return;
  }
  try {
    // force：设置页是用户主动查看状态的地方，不能让 5 分钟缓存把「已配置」显示成「未配置」
    pushStatus.value = await getPushStatus(authStore.userInfo.id, { force: true });
  } catch (_error) {
    // 状态读取失败不该影响设置页其它功能
  } finally {
    pushLoaded.value = true;
  }
};

const handlePushToggle = async (value) => {
  if (isPushBusy.value) return;
  const userId = authStore.userInfo?.id;
  if (!userId) {
    showMessage('请先登录', 'error');
    return;
  }

  isPushBusy.value = true;
  try {
    const result = value ? await enablePush(userId) : await disablePush(userId);
    showMessage(result.message, result.success ? 'success' : 'error');
  } finally {
    isPushBusy.value = false;
    await loadPushStatus();
  }
};

const testWebPush = async () => {
  isPushBusy.value = true;
  try {
    const result = await sendTestPush();
    showMessage(
      result.ok ? '测试通知已发送，请查看设备通知' : result.message || '发送失败',
      result.ok ? 'success' : 'error',
    );
  } catch (error) {
    showMessage(error?.message || '发送失败', 'error');
  } finally {
    isPushBusy.value = false;
  }
};

// ---------- 关注的人邮件通知 ----------
// 服务端发信（Brevo）到账号绑定邮箱，不需要任何第三方账号。
// 真源是 profiles.follow_mail_enabled；服务端每次发信前都会重查，所以关掉立刻生效。
const mailEnabled = ref(false);
const mailLoaded = ref(false);
const isMailBusy = ref(false);

const loadMailSetting = async () => {
  const userId = authStore.userInfo?.id;
  if (!userId) {
    mailLoaded.value = true;
    return;
  }
  try {
    const { enabled: current } = await getFollowMailEnabled(userId);
    mailEnabled.value = current;
  } catch (_error) {
    // 读取失败不该影响设置页其它通道的显示
  } finally {
    mailLoaded.value = true;
  }
};

const handleMailToggle = async (value) => {
  if (isMailBusy.value) return;
  const userId = authStore.userInfo?.id;
  if (!userId) {
    showMessage('请先登录', 'error');
    return;
  }
  isMailBusy.value = true;
  try {
    const result = await toggleFollowMail(userId, value);
    if (result.success) mailEnabled.value = Boolean(value);
    showMessage(result.message, result.success ? 'success' : 'error');
  } finally {
    isMailBusy.value = false;
    await loadMailSetting();
  }
};

// ---------- 审核结果邮件通知 ----------
// 与上面的「关注的人邮件」是两个独立开关：一个是社交动态摘要，一个是
// 「你的内容被处置了」的账号级通知。合并会让用户为了收处置通知而被迫收摘要。
// 真源是 profiles.moderation_mail_enabled，服务端发信前重查，关掉立刻生效。
const moderationMailEnabled = ref(false);
const moderationMailLoaded = ref(false);
const isModerationMailBusy = ref(false);

const loadModerationMailSetting = async () => {
  const userId = authStore.userInfo?.id;
  if (!userId) {
    moderationMailLoaded.value = true;
    return;
  }
  try {
    const { enabled: current } = await getModerationMailEnabled(userId);
    moderationMailEnabled.value = current;
  } catch (_error) {
    // 读取失败不该影响设置页其它通道的显示
  } finally {
    moderationMailLoaded.value = true;
  }
};

const handleModerationMailToggle = async (value) => {
  if (isModerationMailBusy.value) return;
  const userId = authStore.userInfo?.id;
  if (!userId) {
    showMessage('请先登录', 'error');
    return;
  }
  isModerationMailBusy.value = true;
  try {
    const result = await toggleModerationMail(userId, value);
    if (result.success) moderationMailEnabled.value = Boolean(value);
    showMessage(result.message, result.success ? 'success' : 'error');
  } finally {
    isModerationMailBusy.value = false;
    await loadModerationMailSetting();
  }
};

// ---------- 生日邮件通知 ----------
// 默认开启（生日是用户自己在资料里填的，一年一封、不含推销），
// 但「默认开」必须配「随手能关」——否则用户想停收只能把生日删掉，
// 那会把生日墙之类的站内功能一起废掉。真源 profiles.birthday_mail_enabled。
const birthdayMailEnabled = ref(false);
const birthdayMailLoaded = ref(false);
const isBirthdayMailBusy = ref(false);
/* 读失败专用位。历史坑（2026-11-10 用户报障「开关点不动、还显示是关的」）：
   当年为了「不把失败读成 false」，失败时**只**保持 loaded=false ⇒ 开关永久置灰、
   且停在初始值 false ⇒ 表现成「点了没反应 + 明明是默认开却显示关」。
   现在改成：失败 ⇒ 按服务端默认（true）展示 + 允许操作 + 文案说明，不再留一个死开关。 */
const birthdayMailReadFailed = ref(false);

const birthdayMailDesc = computed(() => {
  if (birthdayMailReadFailed.value) {
    return '当前设置读取失败，先按默认（开启）显示；点开关会直接保存你的选择';
  }
  return birthdayMailEnabled.value
    ? '生日当天 00:00 给你发一封邮件（一年一封）'
    : '开启后，生日当天 00:00 会收到一封生日祝福邮件';
});

const loadBirthdayMailSetting = async () => {
  const userId = authStore.userInfo?.id;
  if (!userId) {
    birthdayMailLoaded.value = true;
    return;
  }
  let result;
  try {
    result = await getBirthdayMailEnabled(userId);
  } catch (_error) {
    // 读取异常与「读到了 false」是两件事，交给下面同一套处理
    result = { enabled: false, error: _error };
  }
  if (result.error) {
    birthdayMailReadFailed.value = true;
    // 服务端列默认是 true，读不到时按默认展示并放开操作——
    // 用户点一下就是明确意图，写下去即可（写入权限一直是有的）。
    birthdayMailEnabled.value = true;
    birthdayMailLoaded.value = true;
    return;
  }
  birthdayMailReadFailed.value = false;
  birthdayMailEnabled.value = Boolean(result.enabled);
  birthdayMailLoaded.value = true;
};

const handleBirthdayMailToggle = async (value) => {
  if (isBirthdayMailBusy.value) return;
  const userId = authStore.userInfo?.id;
  if (!userId) {
    showMessage('请先登录', 'error');
    return;
  }
  isBirthdayMailBusy.value = true;
  try {
    const result = await toggleBirthdayMail(userId, value);
    if (result.success) birthdayMailEnabled.value = Boolean(value);
    showMessage(result.message, result.success ? 'success' : 'error');
  } finally {
    isBirthdayMailBusy.value = false;
    await loadBirthdayMailSetting();
  }
};

const showMessage = (msg, type = 'info') => {
  message.value = msg;
  messageType.value = type;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => {
    message.value = '';
  }, 5000);
};

onMounted(() => {
  loadPushStatus();
  loadMailSetting();
  loadModerationMailSetting();
  loadBirthdayMailSetting();
});

onUnmounted(() => {
  clearTimeout(messageTimer);
});
</script>

<style scoped>
@import '../../views/user-center/UserSpace/styles/settings-glass.css';

.notification-settings {
  width: 100%;
}

/* ---------- 表单块 ---------- */
.pp-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 18px 16px;
}

/* ---------- 消息横幅 ---------- */
.pp-banner-wrap {
  padding: 14px 18px;
}

/* ---------- 过渡 ---------- */
.pp-fade-enter-active,
.pp-fade-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}

.pp-fade-enter-from,
.pp-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* ---------- 手机横屏 ---------- */
@media (orientation: landscape) and (max-height: 520px) {
  .pp-form {
    padding: 10px 16px 12px;
    gap: 8px;
  }

  .pp-banner-wrap {
    padding: 10px 16px;
  }
}
</style>
