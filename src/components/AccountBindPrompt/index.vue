<script setup>
/**
 * AccountBindPrompt —— 账户绑定引导（底部弹窗）
 *
 * 触发条件（全部满足才弹）：
 *   已登录 + 浏览器支持通行密钥 + **尚未注册过通行密钥** + 用户没点过「不再提醒」
 *   + 本次会话没弹过 —— 即用户说的「没做 passkey 时首次进入网页提示一次」。
 *
 * ⚠️ 三个硬约束（它们直接决定了本组件为什么长这样，改动前务必读完）：
 *
 *   1. **权限请求必须由用户手势触发**。`Notification.requestPermission()` 与 WebAuthn
 *      仪式都要求用户激活（transient activation）。因此本弹窗只负责「讲清楚」，
 *      所有请求一律落在按钮的 click 里 —— 绝不能进页面就自动调：
 *      Chrome 对无手势的权限请求会降级处理，一旦被判定 blocked，用户几乎无法再开启。
 *
 *   2. **iOS 未「添加到主屏幕」时 Notification API 根本不存在**。那种情况下给按钮
 *      点了也没反应（`requestPermission()` 静默失败），所以那一项改渲染
 *      「添加到主屏幕」的图文步骤，而不是一个失效的开关。
 *
 *   3. **通行密钥与通知不串到一个请求里**。WebAuthn 要等指纹/面容验证，耗时不固定，
 *      常常超出浏览器给的瞬时激活窗口 —— 串行时后一个请求会因激活过期而失败。
 *      故：主按钮按「先通知（浏览器权限框，快）→ 后通行密钥（等生物识别，慢）」
 *      的顺序各做一次，且**每项独立捕获错误、独立可重试**，一项失败不牵连另一项。
 *
 * 关闭语义：
 *   全部完成 → 延时自动关闭；「稍后再说」→ 本次会话不再弹；「不再提醒」→ 永久。
 */
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useAuthStore } from "@/stores/auth";
import { logger } from "@/utils/logger.js";
import GlassPillButton from "@/components/ui/GlassPillButton.vue";
import { Bell, Check, KeyRound, Share } from "lucide-vue-next";
import {
  canRegisterPasskey,
  isPasskeySupported,
  listPasskeys,
  registerPasskey,
  toPasskeyRegisterMessage,
} from "@/utils/api/auth-api.js";
import {
  enablePush,
  getPushCapability,
  getPushStatus,
  isIosLike,
  isStandaloneMode,
} from "@/utils/api/push-api.js";

/** 点「不再提醒」后的持久标记（永久生效，直到用户清除站点数据） */
const DISMISS_KEY = "boh_bind_prompt_dismissed";
/** 本次会话已展示标记：避免同一标签页里刷新 / 路由切换反复弹 */
const SESSION_KEY = "boh_bind_prompt_shown";
/** 首屏加载完再判定，别和路由 chunk 抢主线程 */
const DEFER_MS = 900;
/** 全部完成后的停留时间（让用户看见「已开启」再收起来） */
const AUTO_CLOSE_MS = 1300;

/** 通知项的四种形态 */
const PUSH_KIND = {
  LOADING: "loading",
  READY: "ready",
  NEEDS_INSTALL: "needs-install",
  UNSUPPORTED: "unsupported",
  DONE: "done",
};

const authStore = useAuthStore();

const visible = ref(false);
const passkeyDone = ref(false);
const passkeyBusy = ref(false);
const passkeyError = ref("");
const pushKind = ref(PUSH_KIND.LOADING);
const pushBusy = ref(false);
const pushError = ref("");

let deferId = 0;
let autoCloseId = 0;
let stopWatch = null;

const userId = computed(() => String(authStore.userInfo?.id || ""));
/** 两项都涉及用户激活，并发毫无意义，所以进行中互斥 */
const anyBusy = computed(() => passkeyBusy.value || pushBusy.value);
const pushSettled = computed(() => pushKind.value === PUSH_KIND.DONE
  || pushKind.value === PUSH_KIND.UNSUPPORTED);
const allDone = computed(() => passkeyDone.value && pushSettled.value);
const canEnableAll = computed(() => {
  if (allDone.value) return false;
  // 通知状态还在解析时不显示主按钮：此刻点「一键开启」实际只会开通行密钥，文案会误导
  if (pushKind.value === PUSH_KIND.LOADING) return false;
  return pushKind.value === PUSH_KIND.READY || !passkeyDone.value;
});

/**
 * 主按钮文案。只有一项可做时必须点名那一项 ——
 * 例如 iOS 未添加到主屏幕时，通知项在弹窗内根本无法完成，此时若仍写「一键开启」，
 * 用户会以为点了就能收到通知，实际只开了通行密钥。
 */
const enableAllLabel = computed(() => {
  const pushActionable = pushKind.value === PUSH_KIND.READY;
  const passkeyActionable = !passkeyDone.value;
  if (pushActionable && passkeyActionable) return "一键开启";
  if (pushActionable) return "开启消息通知";
  if (passkeyActionable) return "开启通行密钥";
  return "一键开启";
});

/** 安全读写 storage：隐私模式 / 禁用 storage 时不能抛错打断引导 */
const readFlag = (storage, key) => {
  try {
    return window[storage]?.getItem(key) === "1";
  } catch (_error) {
    return false;
  }
};
const writeFlag = (storage, key) => {
  try {
    window[storage]?.setItem(key, "1");
  } catch (_error) {
    /* 忽略 */
  }
};

/**
 * 自测活口：URL 里带 `bindPrompt=1` 时强制弹出，绕过「已注册 / 已略过 / 本会话弹过」。
 *
 * 为什么需要它：本引导的触发条件恰恰是「**尚未**注册通行密钥」——
 * 所以已经注册过的人（包括开发者自己）永远看不到它，改完 UI 无从复查。
 * 用法：`/#/forum?bindPrompt=1` 或首页 `/?bindPrompt=1#/`。
 */
const isForced = () => {
  if (typeof window === "undefined") return false;
  const raw = `${window.location.search}${window.location.hash}`;
  return /[?&]bindPrompt=1(?:&|$)/.test(raw);
};

/** 是否该弹：核心条件是「还没做过通行密钥」 */
const shouldPrompt = async () => {
  if (typeof window === "undefined" || !userId.value) return false;
  if (isForced()) return true;
  if (readFlag("localStorage", DISMISS_KEY)) return false;
  if (readFlag("sessionStorage", SESSION_KEY)) return false;
  if (!(await isPasskeySupported())) return false;
  // client 上没有注册方法（supabase-js 版本过旧，或浏览器缓存了升级前的依赖产物）时，
  // 引导毫无意义，只会把「registerPasskey is not a function」甩在用户脸上 —— 直接不弹
  if (!canRegisterPasskey()) {
    logger.warn("account-bind-prompt", "当前运行的 supabase-js 不含 registerPasskey，跳过引导");
    return false;
  }

  const { data, error } = await listPasskeys();
  if (error) {
    // 查询失败（例如 GoTrue 未启用 passkeys）时宁可不弹，也不要凭猜测打扰用户
    logger.warn("account-bind-prompt", "读取通行密钥列表失败，跳过引导", error);
    return false;
  }
  return !(Array.isArray(data) && data.length > 0);
};

/** 解析通知项该显示哪种形态（顺序要紧：先判 iOS 未安装，再判浏览器能力） */
const resolvePushKind = async () => {
  if (isIosLike() && !isStandaloneMode()) {
    pushKind.value = PUSH_KIND.NEEDS_INSTALL;
    return;
  }
  if (!getPushCapability().supported) {
    pushKind.value = PUSH_KIND.UNSUPPORTED;
    return;
  }
  const status = await getPushStatus(userId.value);
  pushKind.value = status.enabled ? PUSH_KIND.DONE : PUSH_KIND.READY;
};

const maybeAutoClose = () => {
  window.clearTimeout(autoCloseId);
  if (!allDone.value) return;
  autoCloseId = window.setTimeout(() => {
    visible.value = false;
  }, AUTO_CLOSE_MS);
};

const registerPasskeyNow = async () => {
  if (passkeyBusy.value || passkeyDone.value) return;
  passkeyBusy.value = true;
  passkeyError.value = "";
  try {
    // 必须由 click 直接触发到这里：中间的 await 越少，瞬时激活越稳
    const { error } = await registerPasskey();
    if (error) {
      passkeyError.value = toPasskeyRegisterMessage(error);
      return;
    }
    passkeyDone.value = true;
    maybeAutoClose();
  } catch (error) {
    logger.error("account-bind-prompt", "注册通行密钥失败", error);
    passkeyError.value = error?.message || "开启失败，请稍后重试";
  } finally {
    passkeyBusy.value = false;
  }
};

const enablePushNow = async () => {
  if (pushBusy.value || pushKind.value !== PUSH_KIND.READY) return;
  pushBusy.value = true;
  pushError.value = "";
  try {
    const result = await enablePush(userId.value);
    if (!result.success) {
      pushError.value = result.message || "开启失败，请稍后重试";
      // 权限被拒后不再反复弹同一个失败态，交给用户下次主动开启
      return;
    }
    pushKind.value = PUSH_KIND.DONE;
    maybeAutoClose();
  } catch (error) {
    logger.error("account-bind-prompt", "开启通知失败", error);
    pushError.value = error?.message || "开启失败，请稍后重试";
  } finally {
    pushBusy.value = false;
  }
};

/**
 * 一键开启。
 * ⚠️ 顺序刻意如此（先通知后通行密钥）：反过来的话，通知权限框会落在 WebAuthn 仪式之后，
 *    那时用户的瞬时激活多半已过期，`requestPermission()` 会被浏览器静默忽略。
 */
const enableAll = async () => {
  if (anyBusy.value) return;
  if (pushKind.value === PUSH_KIND.READY) await enablePushNow();
  if (!passkeyDone.value) await registerPasskeyNow();
};

const close = () => {
  visible.value = false;
};

const snooze = () => {
  // 本次会话标记在打开时已写入，这里只需收起
  close();
};

const dismissForever = () => {
  writeFlag("localStorage", DISMISS_KEY);
  close();
};

/** 判定并展示（幂等：已展示 / 已标记过会直接返回） */
const openIfNeeded = async () => {
  if (visible.value || !userId.value) return;
  try {
    if (!(await shouldPrompt())) return;
  } catch (error) {
    logger.warn("account-bind-prompt", "引导条件判定失败", error);
    return;
  }
  // 先落会话标记再显示，避免同一时刻被并发调用重复弹
  writeFlag("sessionStorage", SESSION_KEY);
  visible.value = true;
  await resolvePushKind();
};

onMounted(() => {
  deferId = window.setTimeout(() => {
    void openIfNeeded();
  }, DEFER_MS);
  // 登录弹窗里登录成功后也要再判定一次（首次进站时可能还没登录）
  stopWatch = watch(userId, (id) => {
    if (id) void openIfNeeded();
  });
});

onUnmounted(() => {
  window.clearTimeout(deferId);
  window.clearTimeout(autoCloseId);
  if (stopWatch) stopWatch();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="bind-prompt">
      <div
        v-if="visible"
        class="bind-prompt-overlay liquid-glass liquid-glass--overlay"
        @click.self="close"
      >
        <section
          class="bind-prompt-sheet liquid-glass"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bind-prompt-title"
        >
          <header class="bind-prompt-head">
            <h2 id="bind-prompt-title" class="bind-prompt-title">让登录更快，消息不漏</h2>
            <p class="bind-prompt-sub">两项都开启：登录免密，消息直达。</p>
          </header>

          <ul class="bind-prompt-list">
            <li class="bind-prompt-item">
              <span class="bind-prompt-icon" aria-hidden="true"><KeyRound :size="18" /></span>
              <div class="bind-prompt-body">
                <p class="bind-prompt-name">
                  通行密钥
                  <span v-if="passkeyDone" class="bind-prompt-tag">已开启</span>
                </p>
                <p class="bind-prompt-desc">用指纹或面容登录，不用记密码。</p>
                <p v-if="passkeyError" class="bind-prompt-error">{{ passkeyError }}</p>
              </div>
              <span v-if="passkeyDone" class="bind-prompt-check" aria-label="已完成">
                <Check :size="18" />
              </span>
              <GlassPillButton
                v-else
                tone="soft"
                :disabled="anyBusy"
                @click="registerPasskeyNow"
              >
                <span v-if="passkeyBusy" class="bind-spinner" aria-hidden="true"></span>
                {{ passkeyBusy ? "处理中…" : (passkeyError ? "重试" : "开启") }}
              </GlassPillButton>
            </li>

            <li class="bind-prompt-item">
              <span class="bind-prompt-icon" aria-hidden="true"><Bell :size="18" /></span>
              <div class="bind-prompt-body">
                <p class="bind-prompt-name">
                  消息通知
                  <span v-if="pushKind === 'done'" class="bind-prompt-tag">已开启</span>
                </p>

                <template v-if="pushKind === 'needs-install'">
                  <p class="bind-prompt-desc">
                    iPhone 需要先添加到主屏幕，才能收到通知。
                  </p>
                  <ol class="bind-prompt-steps">
                    <li><Share :size="14" aria-hidden="true" /> 点 Safari 底部中间的「分享」按钮</li>
                    <li>在菜单里选「添加到主屏幕」</li>
                    <li>回到主屏幕，从这个图标打开并开启通知</li>
                  </ol>
                </template>
                <p v-else-if="pushKind === 'unsupported'" class="bind-prompt-desc">
                  当前浏览器无法接收系统通知，消息中心里的内容不受影响。
                </p>
                <p v-else class="bind-prompt-desc">
                  有人点赞评论时，随时提醒你。
                </p>

                <p v-if="pushError" class="bind-prompt-error">{{ pushError }}</p>
              </div>
              <span v-if="pushKind === 'done'" class="bind-prompt-check" aria-label="已完成">
                <Check :size="18" />
              </span>
              <GlassPillButton
                v-else-if="pushKind === 'ready' || pushKind === 'loading'"
                tone="soft"
                :disabled="anyBusy || pushKind === 'loading'"
                @click="enablePushNow"
              >
                <span
                  v-if="pushBusy || pushKind === 'loading'"
                  class="bind-spinner"
                  aria-hidden="true"
                ></span>
                {{ pushKind === "loading"
                  ? "检查中…"
                  : (pushBusy ? "处理中…" : (pushError ? "重试" : "开启")) }}
              </GlassPillButton>
            </li>
          </ul>

          <footer class="bind-prompt-foot">
            <GlassPillButton v-if="canEnableAll" :disabled="anyBusy" @click="enableAll">
              <span v-if="anyBusy" class="bind-spinner" aria-hidden="true"></span>
              {{ anyBusy ? "处理中…" : enableAllLabel }}
            </GlassPillButton>
            <div class="bind-prompt-links">
              <button type="button" class="bind-prompt-link" @click="snooze">稍后再说</button>
              <button type="button" class="bind-prompt-link" @click="dismissForever">不再提醒</button>
            </div>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 文本色以局部变量暴露：暗色只在本文件一处覆写，不散落到每条规则里
   （与 GlassPillButton 的材质变量同一模式）。
   背景/边框/模糊全部由 .liquid-glass 类与 --liquid-* token 提供，
   这里**不写 backdrop-filter** —— check:liquid-glass 门禁禁止重复定义玻璃材质。 */
.bind-prompt-overlay {
  position: fixed;
  inset: 0;
  /* 压在导航（9999 / 10001）与通用弹窗（10000）之上 */
  z-index: 10002;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.bind-prompt-sheet {
  --bp-text: #1f2937;
  --bp-text-weak: #6b7280;
  --bp-line: rgba(17, 24, 39, 0.08);
  --bp-hint-bg: rgba(17, 24, 39, 0.04);
  width: 100%;
  max-width: 460px;
  margin: 0 12px max(12px, env(safe-area-inset-bottom));
  padding: 20px 18px 14px;
  border-radius: 22px;
  color: var(--bp-text);
}

/* ⚠️ 暗色变量覆写**不放在 scoped 里**。
   踩过：写成 `:global([data-theme="dark"]) .bind-prompt-sheet` 时被 scoped 压住不生效
   —— 实测深色主题下标题与两项名称取到的仍是亮色值，在深背景上几乎不可见。
   改由文件末尾的非 scoped <style> 块承接（与项目 themes/*.css 的既有做法一致）。 */

.bind-prompt-head {
  padding: 0 2px 14px;
}

.bind-prompt-title {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0.2px;
}

.bind-prompt-sub {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--bp-text-weak);
}

.bind-prompt-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.bind-prompt-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border-radius: 16px;
  background: var(--bp-hint-bg);
}

.bind-prompt-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: var(--bp-line);
  color: var(--bp-text);
}

.bind-prompt-body {
  flex: 1 1 auto;
  min-width: 0;
}

.bind-prompt-name {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 3px;
  font-size: 14px;
  font-weight: 700;
}

.bind-prompt-tag {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--bp-line);
  font-size: 11px;
  font-weight: 600;
  color: var(--bp-text-weak);
}

.bind-prompt-desc {
  margin: 0;
  /* 12px：右侧还有「开启」按钮占位，这个字号能让中文描述在 390px 小屏上不被挤成多行 */
  font-size: 12px;
  line-height: 1.55;
  color: var(--bp-text-weak);
}

.bind-prompt-steps {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--bp-text-weak);
}

.bind-prompt-steps li {
  display: flex;
  align-items: center;
  gap: 5px;
}

.bind-prompt-error {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #b42318;
}

:global([data-theme="dark"]) .bind-prompt-error {
  color: #f97066;
}

.bind-prompt-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  color: #12b76a;
}

.bind-prompt-foot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-top: 14px;
}

.bind-prompt-foot :deep(.glass-pill-btn) {
  width: 100%;
  justify-content: center;
}

.bind-prompt-links {
  display: flex;
  gap: 16px;
  padding: 4px 0 2px;
}

.bind-prompt-link {
  padding: 4px 6px;
  border: none;
  background: none;
  font: inherit;
  font-size: 12.5px;
  color: var(--bp-text-weak);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.bind-prompt-link:hover {
  color: var(--bp-text);
}

/* ============================================
   动效
   三条意图：入场有节奏（两项依次浮现，让「两件事都要做」被看见）、
   完成有反馈（勾选弹出，明确「成了」）、离场有方向（向下滑走，
   与「收起底部弹窗」的物理直觉一致）。
   全部只动 transform / opacity —— 不触发布局重排，移动端不掉帧。
   ============================================ */
.bind-prompt-enter-active,
.bind-prompt-leave-active {
  transition: opacity var(--duration-slow, 360ms) var(--ease-out, ease-out);
}

.bind-prompt-enter-active .bind-prompt-sheet {
  transition: transform var(--duration-slow, 360ms) var(--ease-emphasized, ease-out);
}

.bind-prompt-leave-active .bind-prompt-sheet {
  transition: transform var(--duration-base, 240ms) var(--ease-in-out, ease-in);
}

.bind-prompt-enter-from,
.bind-prompt-leave-to {
  opacity: 0;
}

.bind-prompt-enter-from .bind-prompt-sheet {
  transform: translateY(16%);
}

.bind-prompt-leave-to .bind-prompt-sheet {
  transform: translateY(24%);
}

/* 两项依次浮现 */
.bind-prompt-item {
  animation: bind-item-in var(--duration-slow, 360ms) var(--ease-out, ease-out) both;
}

.bind-prompt-item:nth-child(1) {
  animation-delay: 70ms;
}

.bind-prompt-item:nth-child(2) {
  animation-delay: 150ms;
}

/* 完成后勾选弹出 */
.bind-prompt-check {
  animation: bind-check-pop 320ms var(--ease-emphasized, ease-out) both;
}

/* 按钮内的等待指示：这一步要等权限框或生物识别，等待感必须被表达出来 */
.bind-spinner {
  display: inline-block;
  width: 13px;
  height: 13px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: bind-spin 680ms linear infinite;
}

@keyframes bind-item-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes bind-check-pop {
  0% {
    opacity: 0;
    transform: scale(0.5);
  }

  62% {
    opacity: 1;
    transform: scale(1.14);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes bind-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bind-prompt-enter-active,
  .bind-prompt-leave-active,
  .bind-prompt-enter-active .bind-prompt-sheet,
  .bind-prompt-leave-active .bind-prompt-sheet {
    transition: none;
  }

  .bind-prompt-enter-from .bind-prompt-sheet,
  .bind-prompt-leave-to .bind-prompt-sheet {
    transform: none;
  }

  .bind-prompt-item,
  .bind-prompt-check {
    animation: none;
  }

  /* 加载指示保留但放慢：它是「正在进行」的必要语义，不能一起抹掉 */
  .bind-spinner {
    animation-duration: 1.6s;
  }
}
</style>

<style>
/* ============================================
   非 scoped 块：只承担「组件变量的暗色覆写」
   为什么单独开一块：scoped 会给选择器追加 [data-v-xxx]，`:global(...)` 与它组合后
   在特异性上压不过亮色定义 —— 实测深色下标题/项名取到亮色值，在深背景上不可见。
   这里与项目 themes/*.css 的既有写法保持一致（`[data-theme="dark"] .容器 .子元素`），
   并用 `bind-prompt-` 前缀隔离，不会波及其它界面。
   ============================================ */
[data-theme="dark"] .bind-prompt-sheet {
  --bp-text: #f3f4f6;
  --bp-text-weak: #a1a1aa;
  --bp-line: rgba(255, 255, 255, 0.1);
  --bp-hint-bg: rgba(255, 255, 255, 0.06);

  /* 子组件 GlassPillButton 的材质值。
     必须由这里给：它把材质暴露成局部变量、暗色原本靠 forum-dark.css 覆盖，
     而那个文件是**动态 import**（只在论坛页加载）—— 于是全局组件在其它深色页面
     会拿到亮色 fallback，表现为「深底 + 近黑字」，按钮文字几乎看不见。
     值对齐 forum-dark.css 的既有取值，避免两个地方给出不同的暗色。 */
  --glass-pill-bg: rgba(40, 40, 52, 0.84);
  --glass-pill-bg-hover: rgba(52, 52, 66, 0.92);
  --glass-pill-border: rgba(255, 255, 255, 0.14);
  --glass-pill-text: #f3f4f6;
  --glass-pill-soft-bg: rgba(255, 255, 255, 0.1);
  --glass-pill-soft-border: rgba(255, 255, 255, 0.14);
}

[data-theme="dark"] .bind-prompt-error {
  color: #f97066;
}
</style>
