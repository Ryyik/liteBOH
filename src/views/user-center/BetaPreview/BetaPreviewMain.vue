<template>
  <main class="beta-preview-page" :data-theme="currentTheme">
    <div class="beta-preview-backdrop" aria-hidden="true"></div>
    <UserCenterPageHeader title="内测体验" back-label="返回设置" max-width="620px" @back="backToSettings" />

    <section class="beta-preview-content" aria-labelledby="beta-preview-title">
      <div class="beta-preview-heading">
        <span class="preview-eyebrow">BOHLITE SOFTWARE UPDATE</span>
        <h1 id="beta-preview-title">Beta Preview</h1>
        <p>切换体验会立即生效，随时可以返回。</p>
      </div>

      <!-- 横条 1：当前版本 -->
      <section class="glass-bar current-bar" aria-label="当前使用版本">
        <span class="bar-symbol" aria-hidden="true">
          <Sparkles v-if="isBeta5" :size="22" :stroke-width="1.9" />
          <span v-else class="bar-letter">B</span>
        </span>
        <span class="bar-copy">
          <strong>已使用 BOH Beta {{ isBeta5 ? '5 Preview' : '4.9.1' }}</strong>
        </span>
        <span class="live-badge" aria-hidden="true">
          <i></i>正在使用
        </span>
      </section>

      <!-- 横条 2：Beta Preview 开关 -->
      <section class="glass-bar toggle-bar" aria-label="Beta Preview 测试版体验">
        <span class="bar-copy">
          <strong class="toggle-title">Beta Preview 测试版体验</strong>
          <small>开启后即可接收 BOH Beta 5 Preview 更新</small>
        </span>
        <button
          type="button"
          class="apple-switch"
          :class="{ on: previewEnabled }"
          role="switch"
          :aria-checked="previewEnabled"
          :aria-label="previewEnabled ? '关闭 Beta Preview 测试版体验' : '开启 Beta Preview 测试版体验'"
          @click="togglePreview"
        >
          <span class="switch-knob" aria-hidden="true"></span>
        </button>
      </section>

      <!-- 开启后：版本卡片 -->
      <Transition name="card-expand">
        <section
          v-if="previewEnabled"
          class="glass-card release-card"
          :aria-label="isBeta5 ? '返回正式版' : '体验 Beta 5 Preview'"
        >
          <div :key="isBeta5 ? 'stable' : 'beta'" class="release-inner" @click="startSwitch">
            <div class="release-top">
              <span class="release-avatar" :class="{ preview: !isBeta5 }" aria-hidden="true">
                <Sparkles v-if="!isBeta5" :size="20" :stroke-width="1.9" />
                <ShieldCheck v-else :size="20" :stroke-width="1.9" />
              </span>
              <span class="release-title">
                <strong>{{ isBeta5 ? 'BOH Beta 4.9.1' : 'BOH Beta 5 Preview' }}</strong>
                <span class="version-pill" :class="{ preview: !isBeta5 }">{{ isBeta5 ? '4.9.1' : '5.0.0 Preview 1' }}</span>
              </span>
              <button
                type="button"
                class="action-button"
                :class="{ preview: !isBeta5 }"
                :disabled="isSwitching"
                @click.stop="startSwitch"
              >
                {{ isBeta5 ? '切换回正式版' : '立即体验' }}
                <ChevronRight :size="15" :stroke-width="2.4" aria-hidden="true" />
              </button>
            </div>

            <p class="release-desc">
              {{ isBeta5
                ? '正式版，恢复稳定导航与发帖流程。已发布的 Preview 带图草稿仍可继续使用。'
                : '尝鲜新的悬浮导航与带图发帖流程。你可以随时从这里返回正式版。' }}
            </p>

            <ul class="feature-list">
              <template v-if="!isBeta5">
                <li><span class="feature-icon"><PanelTopOpen :size="15" :stroke-width="1.9" aria-hidden="true" /></span>常驻悬浮圆条导航</li>
                <li><span class="feature-icon"><PanelBottomClose :size="15" :stroke-width="1.9" aria-hidden="true" /></span>下滑收起、上滑唤回的底部导航</li>
                <li><span class="feature-icon"><Send :size="15" :stroke-width="1.9" aria-hidden="true" /></span>点击发布后才处理图片的发帖流程</li>
              </template>
              <template v-else>
                <li><span class="feature-icon"><ShieldCheck :size="15" :stroke-width="1.9" aria-hidden="true" /></span>稳定的导航与发帖体验</li>
                <li><span class="feature-icon"><RotateCcw :size="15" :stroke-width="1.9" aria-hidden="true" /></span>随时可再次切换回 Beta 5 Preview</li>
              </template>
            </ul>
          </div>
        </section>
      </Transition>

      <p class="build-note">当前构建 {{ buildVersion }}，Preview 仅改变本设备上的界面体验。</p>
    </section>

    <!-- 全屏切换特效：白色像素铺满整屏，缓慢四散飘走 -->
    <div v-if="burst.length" class="particle-stage" aria-hidden="true">
      <span class="particle-dim"></span>
      <span
        v-for="p in burst"
        :key="p.id"
        class="particle"
        :class="p.shape"
        :style="{
          left: p.x + 'px',
          top: p.y + 'px',
          width: p.size + 'px',
          height: p.size + 'px',
          background: p.alpha,
          '--p-dx': p.dx + 'px',
          '--p-dy': p.dy + 'px',
          '--p-rot': p.rot + 'deg',
          '--p-dur': p.dur + 'ms',
          '--p-delay': p.delay + 'ms',
          '--p-scale': p.scale
        }"
      ></span>
    </div>
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronRight, PanelBottomClose, PanelTopOpen, RotateCcw, Send, ShieldCheck, Sparkles } from 'lucide-vue-next';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import { useAppMode } from '@/composables/useAppMode.js';
import { themeManager } from '@/utils/theme-manager.js';

const router = useRouter();
const { beta5Mode, isBeta5, setAppMode, stableMode } = useAppMode();
const currentTheme = ref(themeManager.getTheme());
const previewEnabled = ref(isBeta5.value);
// 模式与开关保持双向一致：关闭开关即退出 Beta（含切换动画），外部切换模式时同步开关状态
watch(isBeta5, (enabled) => {
  previewEnabled.value = enabled;
});
const isSwitching = ref(false);
const burst = ref([]);
let burstId = 0;
let burstTimers = [];

const buildVersion = computed(() => (
  document.querySelector('meta[name="boh-version"]')?.getAttribute('content') || '4.9.1'
));

const backToSettings = () => {
  void router.replace({ path: '/user-space', query: { tab: 'profile', view: 'settings' } });
};

// 关闭开关时若正处于 Beta 5，立即走正式切换流程退出，保证开关状态与实际模式一致
const togglePreview = () => {
  if (previewEnabled.value && isBeta5.value) {
    void startSwitch();
    return;
  }
  previewEnabled.value = !previewEnabled.value;
};

/* 全屏像素场：白色像素随机铺满整屏，朝四面八方缓慢漂移、渐隐消散 */
const spawnParticles = () => {
  const count = 96;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const list = [];
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 150 + Math.random() * 360;
    const size = 3 + Math.random() * 10;
    list.push({
      id: `${burstId}-${i}`,
      x: Math.random() * vw,
      y: vh * 0.1 + Math.random() * vh * 0.95,
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist - 70 - Math.random() * 110,
      size,
      alpha: Math.random() < 0.22 ? 'rgba(255, 255, 255, 0.72)' : 'rgba(255, 255, 255, 0.98)',
      rot: (Math.random() - 0.5) * 220,
      dur: 1700 + Math.random() * 1300,
      delay: Math.random() * 380,
      scale: (0.25 + Math.random() * 0.4).toFixed(3),
      shape: Math.random() < 0.78 ? 'square' : (Math.random() < 0.55 ? 'star' : 'dot')
    });
  }
  burst.value = list;
};

const startSwitch = async () => {
  if (isSwitching.value) return;
  const nextMode = isBeta5.value ? stableMode : beta5Mode;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion) {
    spawnParticles();
  }

  isSwitching.value = true;
  await nextTick();
  setAppMode(nextMode);

  const clearAt = reduceMotion ? 80 : 420;
  const endAt = reduceMotion ? 100 : 2300;
  burstTimers.push(
    window.setTimeout(() => {
      burst.value = [];
    }, clearAt),
    window.setTimeout(() => {
      isSwitching.value = false;
    }, endAt)
  );
};

onMounted(() => {
  window.scrollTo(0, 0);
});

onBeforeUnmount(() => {
  burstTimers.forEach((t) => window.clearTimeout(t));
  burstTimers = [];
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

/* 卡片展开过渡 */
.card-expand-enter-active { transition: opacity 260ms cubic-bezier(0.16, 1, 0.3, 1), transform 320ms cubic-bezier(0.16, 1, 0.3, 1); }
.card-expand-leave-active { transition: opacity 180ms cubic-bezier(0.16, 1, 0.3, 1), transform 220ms cubic-bezier(0.16, 1, 0.3, 1); }
.card-expand-enter-from { opacity: 0; transform: translateY(-6px) scale(0.985); }
.card-expand-leave-to { opacity: 0; transform: translateY(-4px) scale(0.99); }

/* ---------- 粒子切换特效 ---------- */
.particle-stage { position: fixed; inset: 0; z-index: 13000; pointer-events: none; overflow: hidden; }

/* 极淡的纱幕：让白色像素在浅色背景下也清晰可见 */
.particle-dim {
  position: fixed;
  inset: 0;
  background: radial-gradient(120% 120% at 50% 45%, rgba(10, 14, 22, 0.22), rgba(10, 14, 22, 0.42));
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  animation: dim-in-out 2100ms cubic-bezier(0.2, 0.65, 0.35, 1) both;
}
@keyframes dim-in-out {
  0% { opacity: 0; }
  12% { opacity: 1; }
  78% { opacity: 1; }
  100% { opacity: 0; }
}

.particle {
  position: fixed;
  transform: translate(-50%, -50%);
  opacity: 0;
  animation: particle-drift var(--p-dur) cubic-bezier(0.2, 0.6, 0.35, 1) var(--p-delay) both;
}
.particle.square { border-radius: 12%; }
.particle.star {
  clip-path: polygon(50% 0%, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0% 50%, 39% 39%);
  border-radius: 0;
}
.particle.dot { border-radius: 50%; }
@keyframes particle-drift {
  0% {
    transform: translate(-50%, -50%) translate(0, 0) rotate(0deg) scale(0.7);
    opacity: 0;
  }
  10% { opacity: 0.95; }
  100% {
    transform: translate(-50%, -50%) translate(var(--p-dx), var(--p-dy)) rotate(var(--p-rot)) scale(var(--p-scale));
    opacity: 0;
  }
}

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
  .glass-bar, .glass-card, .release-inner, .particle, .particle-dim {
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