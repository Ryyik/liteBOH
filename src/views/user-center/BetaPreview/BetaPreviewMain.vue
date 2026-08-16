<template>
  <main class="beta-preview-page" :data-theme="currentTheme">
    <div class="beta-preview-backdrop" aria-hidden="true"></div>
    <UserCenterPageHeader title="版本与回退" back-label="返回设置" max-width="620px" @back="backToSettings" />

    <section class="beta-preview-content" aria-labelledby="beta-preview-title">
      <div class="beta-preview-heading">
        <span class="preview-eyebrow">BOHLITE SOFTWARE</span>
        <h1 id="beta-preview-title">版本与回退</h1>
        <p>Beta 5 已作为默认版本发布；需要旧流程时可暂时回退。</p>
      </div>

      <!-- 横条 1：当前版本 -->
      <section class="glass-bar current-bar" aria-label="当前使用版本">
        <span class="bar-symbol" aria-hidden="true">
          <Sparkles v-if="isBeta5" :size="22" :stroke-width="1.9" />
          <RotateCcw v-else :size="21" :stroke-width="1.9" />
        </span>
        <span class="bar-copy">
          <strong>已使用 {{ isBeta5 ? 'BOH Beta 5' : 'BOH 4.9.1 兼容模式' }}</strong>
        </span>
        <span class="live-badge" aria-hidden="true">
          <i></i>正在使用
        </span>
      </section>

      <section class="glass-bar toggle-bar" aria-label="4.9.1 兼容模式">
        <span class="bar-copy">
          <strong class="toggle-title">4.9.1 兼容模式</strong>
          <small>{{ isBeta5 ? '默认使用 Beta 5；仅在需要旧版流程时开启。' : '已启用旧版流程，可随时恢复 Beta 5。' }}</small>
        </span>
        <button
          type="button"
          class="apple-switch"
          :class="{ on: !isBeta5 }"
          role="switch"
          :aria-checked="!isBeta5"
          :aria-label="isBeta5 ? '开启 4.9.1 兼容模式' : '关闭 4.9.1 兼容模式并恢复 Beta 5'"
          @click="toggleCompatibilityMode"
        >
          <span class="switch-knob" aria-hidden="true"></span>
        </button>
      </section>

      <section class="glass-card release-card" :aria-label="isBeta5 ? '回退到 4.9.1 兼容模式' : '恢复 BOH Beta 5'">
          <div :key="isBeta5 ? 'beta5' : 'stable'" class="release-inner">
            <div class="release-top">
              <span class="release-avatar" :class="{ preview: isBeta5 }" aria-hidden="true">
                <RotateCcw v-if="isBeta5" :size="20" :stroke-width="1.9" />
                <Sparkles v-else :size="20" :stroke-width="1.9" />
              </span>
              <span class="release-title">
                <strong>{{ isBeta5 ? '需要使用旧版流程？' : '恢复 BOH Beta 5' }}</strong>
                <span class="version-pill" :class="{ preview: isBeta5 }">{{ isBeta5 ? '4.9.1 兼容模式' : '默认版本' }}</span>
              </span>
              <button
                type="button"
                class="action-button"
                :class="{ preview: isBeta5 }"
                @click="toggleCompatibilityMode"
              >
                {{ isBeta5 ? '回退' : '恢复' }}
                <ChevronRight :size="15" :stroke-width="2.4" aria-hidden="true" />
              </button>
            </div>

            <p class="release-desc">
              {{ isBeta5
                ? 'Beta 5 是当前默认版本。回退仅用于临时恢复旧导航、旧积分页和旧图片发布流程。'
                : '你正在使用临时兼容模式。4.9.1 相关界面将在后续版本中移除。' }}
            </p>

            <ul class="feature-list">
              <template v-if="isBeta5">
                <li><span class="feature-icon"><PanelTopOpen :size="15" :stroke-width="1.9" aria-hidden="true" /></span>常驻悬浮圆条导航</li>
                <li><span class="feature-icon"><PanelBottomClose :size="15" :stroke-width="1.9" aria-hidden="true" /></span>方块积分与礼物订单记录</li>
                <li><span class="feature-icon"><Send :size="15" :stroke-width="1.9" aria-hidden="true" /></span>点击发布后才处理图片的发帖流程</li>
              </template>
              <template v-else>
                <li><span class="feature-icon"><ShieldCheck :size="15" :stroke-width="1.9" aria-hidden="true" /></span>滚动收纳式导航与原积分页</li>
                <li><span class="feature-icon"><RotateCcw :size="15" :stroke-width="1.9" aria-hidden="true" /></span>可随时恢复 Beta 5 默认体验</li>
              </template>
            </ul>
          </div>
      </section>

      <p class="build-note">当前构建 {{ buildVersion }}。版本选择仅影响本设备，4.9.1 兼容模式将在后续版本中移除。</p>
    </section>

  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronRight, PanelBottomClose, PanelTopOpen, RotateCcw, Send, ShieldCheck, Sparkles } from 'lucide-vue-next';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import { useAppMode } from '@/composables/useAppMode.js';
import { themeManager } from '@/utils/theme-manager.js';

const router = useRouter();
const { beta5Mode, isBeta5, setAppMode, stableMode } = useAppMode();
const currentTheme = ref(themeManager.getTheme());

const buildVersion = computed(() => (
  document.querySelector('meta[name="boh-version"]')?.getAttribute('content') || '4.9.1'
));

const backToSettings = () => {
  void router.replace({ path: '/user-space', query: { tab: 'profile', view: 'settings' } });
};

const toggleCompatibilityMode = () => {
  setAppMode(isBeta5.value ? stableMode : beta5Mode);
};

onMounted(() => {
  window.scrollTo(0, 0);
});

</script>

<style scoped>
.beta-preview-page {
  position: relative;
  width: 100vw;
  min-width: 100vw;
  max-width: 100vw;
  min-height: 100dvh;
  --user-center-nav-offset: 0px;
  background: #f5f6f8;
  color: #111214;
  overflow-x: clip;
  isolation: isolate;
}

.beta-preview-backdrop {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(620px 430px at 12% 6%, rgba(37, 99, 235, 0.11), transparent 66%),
    radial-gradient(560px 420px at 90% 20%, rgba(168, 85, 247, 0.09), transparent 66%),
    radial-gradient(680px 520px at 50% 100%, rgba(14, 165, 233, 0.09), transparent 72%),
    #f5f6f8;
}

.beta-preview-content {
  position: relative;
  z-index: 1;
  width: min(100% - 36px, 560px);
  margin: 0 auto;
  padding: 12px 0 56px;
}

/* ---------- 顶部标题 ---------- */
.beta-preview-heading { margin-bottom: 26px; text-align: center; }
.preview-eyebrow { color: #68717d; font-size: 11px; font-weight: 800; letter-spacing: .08em; }
.beta-preview-heading h1 { margin: 6px 0 8px; font-size: clamp(28px, 5vw, 40px); line-height: 1.08; letter-spacing: -0.02em; }
.beta-preview-heading p { margin: 0; color: #5c6470; font-size: 14px; line-height: 1.5; }

/* ---------- 毛玻璃横条 ---------- */
.glass-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 15px 18px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.62);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.75),
    0 1px 2px rgba(16, 24, 40, 0.03),
    0 12px 32px rgba(16, 24, 40, 0.07);
}

.glass-bar + .glass-bar { margin-top: 12px; }
.bar-copy { display: grid; min-width: 0; gap: 3px; flex: 1; }
.bar-copy strong { overflow: hidden; font-size: 15px; font-weight: 740; letter-spacing: -0.01em; text-overflow: ellipsis; white-space: nowrap; }
.bar-copy small { color: #68717d; font-size: 12.5px; line-height: 1.4; }

/* 横条 1：当前版本 */
.current-bar { margin-top: 12px; }
.bar-symbol {
  display: grid;
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 13px;
  color: #fff;
  background: linear-gradient(160deg, #6aa7ff, #0b5bd3);
  box-shadow: 0 5px 14px rgba(11, 91, 211, 0.26), inset 0 1px 0 rgba(255, 255, 255, 0.35);
}
.bar-letter { font-size: 21px; font-weight: 800; letter-spacing: -0.02em; }
.live-badge {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  color: #168443;
  background: rgba(22, 163, 74, 0.12);
  font-size: 11px;
  font-weight: 760;
  letter-spacing: 0.02em;
}
.live-badge i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18);
  animation: live-pulse 2.2s var(--ease-out, ease-out) infinite;
}
@keyframes live-pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18); }
  50% { box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.05); }
}

/* 横条 2：开关 */
.toggle-title { line-height: 1.3; }
.apple-switch {
  position: relative;
  flex: 0 0 auto;
  width: 52px;
  height: 31px;
  border: 0;
  border-radius: 999px;
  background: rgba(120, 128, 140, 0.35);
  cursor: pointer;
  transition: background-color 220ms var(--ease-out, ease-out) 40ms;
  padding: 0;
}
.apple-switch .switch-knob {
  position: absolute;
  top: 2.5px;
  left: 2.5px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.22), 0 0 1px rgba(0, 0, 0, 0.1);
  transition: transform 240ms var(--ease-out, ease-out), width 160ms var(--ease-out, ease-out);
}
.apple-switch.on { background: #34c759; }
.apple-switch.on .switch-knob { transform: translateX(21px); }
.apple-switch:active .switch-knob { width: 31px; }
.apple-switch.on:active .switch-knob { transform: translateX(16px); }
.apple-switch:focus-visible { outline: 2px solid #1677ff; outline-offset: 3px; }

/* ---------- 版本卡片 ---------- */
.glass-card {
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.66);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.75),
    0 1px 2px rgba(16, 24, 40, 0.03),
    0 12px 32px rgba(16, 24, 40, 0.07);
}

.release-card {
  margin-top: 12px;
  padding: 16px 18px 14px;
  cursor: pointer;
  transition: border-color 220ms var(--ease-out, ease-out), box-shadow 220ms var(--ease-out, ease-out);
}
.release-card:hover { border-color: rgba(22, 119, 255, 0.32); }
.release-card:active { transform: scale(0.995); }
.release-card:focus-visible { outline: 2px solid #1677ff; outline-offset: 2px; }

.release-inner { animation: release-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both; }
@keyframes release-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.release-top { display: flex; align-items: center; gap: 12px; }
.release-avatar {
  display: grid;
  flex: 0 0 auto;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 14px;
  color: #fff;
  background: linear-gradient(160deg, #5f6b7a, #2e3641);
  box-shadow: 0 5px 14px rgba(30, 38, 50, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.25);
}
.release-avatar.preview {
  background: linear-gradient(160deg, #6aa7ff, #0b5bd3);
  box-shadow: 0 5px 14px rgba(11, 91, 211, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.35);
}
.release-title { display: grid; min-width: 0; gap: 3px; flex: 1; }
.release-title strong { overflow: hidden; font-size: 15.5px; font-weight: 760; letter-spacing: -0.01em; text-overflow: ellipsis; white-space: nowrap; }
.version-pill {
  width: fit-content;
  padding: 2px 8px;
  border-radius: 999px;
  color: #168443;
  background: rgba(22, 163, 74, 0.12);
  font-size: 11px;
  font-weight: 740;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.version-pill.preview {
  color: #075ac7;
  background: rgba(22, 119, 255, 0.12);
}

.action-button {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 3px;
  min-height: 36px;
  padding: 0 15px;
  border: 0;
  border-radius: 12px;
  color: #fff;
  background: linear-gradient(160deg, #4e9fff, #0b63e0);
  font-size: 13px;
  font-weight: 740;
  cursor: pointer;
  box-shadow: 0 5px 14px rgba(11, 91, 211, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.3);
  transition: transform 160ms var(--ease-out, ease-out), box-shadow 160ms var(--ease-out, ease-out), filter 160ms var(--ease-out, ease-out);
}
.action-button.preview {
  background: linear-gradient(160deg, #34c76f, #1d9550);
  box-shadow: 0 5px 14px rgba(29, 149, 80, 0.26), inset 0 1px 0 rgba(255, 255, 255, 0.3);
}
.action-button:hover { filter: brightness(1.06); box-shadow: 0 8px 20px rgba(11, 91, 211, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.3); }
.action-button.preview:hover { box-shadow: 0 8px 20px rgba(29, 149, 80, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.3); }
.action-button:active { transform: scale(0.95); }
.action-button:disabled { opacity: 0.55; cursor: default; }

.release-desc { margin: 12px 0 4px; color: #5c6470; font-size: 13px; line-height: 1.55; }
.feature-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.feature-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #30353d;
  font-size: 13px;
  font-weight: 600;
}
.feature-icon {
  display: grid;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 9px;
  color: #1677ff;
  background: rgba(22, 119, 255, 0.1);
}

.build-note { margin: 16px 8px 0; color: #7a828d; font-size: 12px; line-height: 1.5; }

/* ---------- 暗色模式 ---------- */
:global([data-theme="dark"]) .beta-preview-page { background: #101216; color: #f4f6f8; }
:global([data-theme="dark"]) .beta-preview-backdrop {
  background:
    radial-gradient(620px 430px at 12% 6%, rgba(59, 130, 246, 0.1), transparent 66%),
    radial-gradient(560px 420px at 90% 20%, rgba(147, 51, 234, 0.08), transparent 66%),
    radial-gradient(680px 520px at 50% 100%, rgba(14, 165, 233, 0.07), transparent 72%),
    #101216;
}
:global([data-theme="dark"]) .glass-bar,
:global([data-theme="dark"]) .glass-card {
  border-color: rgba(255, 255, 255, 0.08);
  background: rgba(24, 26, 32, 0.46);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.2),
    0 12px 32px rgba(0, 0, 0, 0.35);
}
:global([data-theme="dark"]) .bar-copy small,
:global([data-theme="dark"]) .release-desc,
:global([data-theme="dark"]) .beta-preview-heading p,
:global([data-theme="dark"]) .build-note { color: #a7afba; }
:global([data-theme="dark"]) .feature-list li { color: #e2e7ed; }
:global([data-theme="dark"]) .feature-icon { color: #5da5ff; background: rgba(93, 165, 255, 0.12); }
:global([data-theme="dark"]) .apple-switch { background: rgba(255, 255, 255, 0.22); }
:global([data-theme="dark"]) .apple-switch.on { background: #30d158; }
:global([data-theme="dark"]) .release-card:hover { border-color: rgba(93, 165, 255, 0.4); }
:global([data-theme="dark"]) .version-pill { color: #6ee7b7; background: rgba(16, 185, 129, 0.14); }
:global([data-theme="dark"]) .version-pill.preview { color: #93c5fd; background: rgba(59, 130, 246, 0.14); }

/* ---------- 不支持 backdrop-filter 的兜底 ---------- */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass-bar, .glass-card { background: rgba(255, 255, 255, 0.94); }
  :global([data-theme="dark"]) .glass-bar,
  :global([data-theme="dark"]) .glass-card { background: #1d2128; }
}

@media (prefers-reduced-motion: reduce) {
  .glass-bar, .glass-card, .release-inner {
    animation: none;
    transition-duration: 1ms;
  }
  .live-badge i { animation: none; }
}

@media (max-width: 520px) {
  .beta-preview-content { width: min(100% - 28px, 560px); }
  .beta-preview-heading { text-align: left; }
  .beta-preview-heading p { max-width: 100%; }
  .glass-bar, .glass-card { border-radius: 16px; }
  .current-bar { padding: 13px 14px; }
  .bar-symbol { width: 40px; height: 40px; border-radius: 12px; }
  .toggle-bar { padding: 13px 14px; }
  .release-top { flex-wrap: wrap; }
  .release-avatar { width: 42px; height: 42px; border-radius: 13px; }
  .action-button { margin-left: auto; }
  .release-desc { margin-top: 10px; }
}
</style>
