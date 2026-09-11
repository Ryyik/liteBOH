<template>
  <main class="beta-preview-page" :data-theme="currentTheme">
    <div class="beta-preview-backdrop" aria-hidden="true"></div>
    <UserCenterPageHeader title="版本" back-label="返回设置" max-width="620px" @back="backToSettings" />

    <section class="beta-preview-content" aria-labelledby="beta-preview-title">
      <div class="beta-preview-heading">
        <span class="preview-eyebrow">BOHLITE SOFTWARE</span>
        <h1 id="beta-preview-title">版本</h1>
        <p>Beta 6 已作为唯一版本发布，历史版本切换已下线。</p>
      </div>

      <!-- 横条：当前版本 -->
      <section class="glass-bar current-bar" aria-label="当前使用版本">
        <span class="bar-symbol" aria-hidden="true">
          <Sparkles :size="22" :stroke-width="1.9" />
        </span>
        <span class="bar-copy">
          <strong>已使用 BOH Beta 6</strong>
          <small>构建版本 {{ buildVersion }}</small>
        </span>
        <span class="live-badge" aria-hidden="true">
          <i></i>正在使用
        </span>
      </section>

      <section class="glass-card intro-card" aria-label="Beta 6 版本介绍">
        <div class="release-inner">
          <div class="release-top">
            <span class="release-avatar" aria-hidden="true">
              <Sparkles :size="20" :stroke-width="1.9" />
            </span>
            <span class="release-title">
              <strong>BOH Beta 6</strong>
              <span class="version-pill">默认版本</span>
            </span>
          </div>

          <p class="release-desc">
            这一版把界面与发布流程整体焕新：导航、积分、发帖与图片浏览都换成了新的统一体验。
          </p>

          <ul class="feature-list">
            <li><span class="feature-icon"><PanelTopOpen :size="15" :stroke-width="1.9" aria-hidden="true" /></span>常驻悬浮导航岛，滚动不再收纳</li>
            <li><span class="feature-icon"><PanelBottomClose :size="15" :stroke-width="1.9" aria-hidden="true" /></span>方块积分与自定义卡面（含小猫卡面）</li>
            <li><span class="feature-icon"><Send :size="15" :stroke-width="1.9" aria-hidden="true" /></span>选图即后台预处理：压缩、检测、上传一步到位</li>
            <li><span class="feature-icon"><Images :size="15" :stroke-width="1.9" aria-hidden="true" /></span>多图帖横向滚动浏览与全量大图查看</li>
          </ul>
        </div>
      </section>

      <p class="build-note">当前构建 {{ buildVersion }}。版本信息仅展示，不再提供版本切换。</p>
    </section>

  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Images, PanelBottomClose, PanelTopOpen, Send, Sparkles } from 'lucide-vue-next';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import { themeManager } from '@/utils/theme-manager.js';

const router = useRouter();
const currentTheme = ref(themeManager.getTheme());

const buildVersion = computed(() => (
  document.querySelector('meta[name="boh-version"]')?.getAttribute('content') || 'unknown'
));

const backToSettings = () => {
  void router.replace({ path: '/user-space', query: { tab: 'settings' } });
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
  backdrop-filter: var(--liquid-filter);
  -webkit-backdrop-filter: var(--liquid-filter);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.75),
    0 1px 2px rgba(16, 24, 40, 0.03),
    0 12px 32px rgba(16, 24, 40, 0.07);
}

.glass-bar + .glass-card { margin-top: 12px; }
.bar-copy { display: grid; min-width: 0; gap: 3px; flex: 1; }
.bar-copy strong { overflow: hidden; font-size: 15px; font-weight: 740; letter-spacing: -0.01em; text-overflow: ellipsis; white-space: nowrap; }
.bar-copy small { color: #68717d; font-size: 12.5px; line-height: 1.4; font-variant-numeric: tabular-nums; }

/* 当前版本横条 */
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

/* ---------- 版本介绍卡 ---------- */
.glass-card {
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.66);
  backdrop-filter: var(--liquid-filter);
  -webkit-backdrop-filter: var(--liquid-filter);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.75),
    0 1px 2px rgba(16, 24, 40, 0.03),
    0 12px 32px rgba(16, 24, 40, 0.07);
}

.intro-card {
  padding: 16px 18px 14px;
}

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
  border-radius: 50%;
  color: #fff;
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
:global([data-theme="dark"] .beta-preview-page ){ background: #101216; color: #f4f6f8; }
:global([data-theme="dark"] .beta-preview-backdrop ){
  background:
    radial-gradient(620px 430px at 12% 6%, rgba(59, 130, 246, 0.1), transparent 66%),
    radial-gradient(560px 420px at 90% 20%, rgba(147, 51, 234, 0.08), transparent 66%),
    radial-gradient(680px 520px at 50% 100%, rgba(14, 165, 233, 0.07), transparent 72%),
    #101216;
}
:global([data-theme="dark"] .glass-bar),
:global([data-theme="dark"] .glass-card ){
  border-color: rgba(255, 255, 255, 0.08);
  background: rgba(24, 26, 32, 0.46);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.2),
    0 12px 32px rgba(0, 0, 0, 0.35);
}
:global([data-theme="dark"] .bar-copy small),
:global([data-theme="dark"] .release-desc),
:global([data-theme="dark"] .beta-preview-heading p),
:global([data-theme="dark"] .build-note ){ color: #a7afba; }
:global([data-theme="dark"] .feature-list li ){ color: #e2e7ed; }
:global([data-theme="dark"] .feature-icon ){ color: #5da5ff; background: rgba(93, 165, 255, 0.12); }
:global([data-theme="dark"] .version-pill ){ color: #6ee7b7; background: rgba(16, 185, 129, 0.14); }

/* ---------- 不支持 backdrop-filter 的兜底 ---------- */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass-bar, .glass-card { background: rgba(255, 255, 255, 0.94); }
  :global([data-theme="dark"] .glass-bar),
  :global([data-theme="dark"] .glass-card ){ background: #1d2128; }
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
}
</style>
