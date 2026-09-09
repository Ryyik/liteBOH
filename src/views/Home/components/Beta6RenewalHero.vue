<template>
  <section
    class="beta6-hero"
    :data-theme="currentTheme"
    :aria-label="'BOHLITE Beta 6 焕新体验'"
  >
    <!-- 漂浮色晕：纯色圆 + blur（非渐变），玻璃后方主折射 + 页面边缘氛围 -->
    <div ref="blobsEl" class="beta6-hero-blobs" aria-hidden="true">
      <div class="beta6-hero-blob beta6-hero-blob-1"></div>
      <div class="beta6-hero-blob beta6-hero-blob-2"></div>
      <div class="beta6-hero-blob beta6-hero-blob-3"></div>
      <div class="beta6-hero-blob beta6-hero-blob-4"></div>
      <div class="beta6-hero-blob beta6-hero-blob-5"></div>
    </div>

    <!-- 毛玻璃卡：托住全部 hero 文案 -->
    <article class="beta6-hero-card">
      <p class="beta6-hero-eyebrow">BOHLITE BETA 6 · 焕新体验</p>
      <h1 class="beta6-hero-headline" aria-label="焕然一新，即刻相见。">
        <span class="beta6-hero-char" aria-hidden="true" style="--char-i: 0">焕</span><span class="beta6-hero-char" aria-hidden="true" style="--char-i: 1">然</span><span class="beta6-hero-char" aria-hidden="true" style="--char-i: 2">一</span><span class="beta6-hero-char" aria-hidden="true" style="--char-i: 3">新</span><span class="beta6-hero-char" aria-hidden="true" style="--char-i: 4">，</span><br><span class="beta6-hero-char" aria-hidden="true" style="--char-i: 5">即</span><span class="beta6-hero-char" aria-hidden="true" style="--char-i: 6">刻</span><span class="beta6-hero-char" aria-hidden="true" style="--char-i: 7">相</span><span class="beta6-hero-char" aria-hidden="true" style="--char-i: 8">见</span><span class="beta6-hero-char beta6-hero-accent" aria-hidden="true" style="--char-i: 9">。</span><span class="beta6-hero-caret" aria-hidden="true"></span>
      </h1>
      <p class="beta6-hero-sub">
        液态玻璃，全面焕新。界面轻盈了，账本透明了，社区体验也跟着连贯了。
      </p>
      <div class="beta6-hero-actions">
        <router-link class="beta6-hero-btn-primary" to="/download">立即焕新体验</router-link>
        <button
          type="button"
          class="beta6-hero-btn-ghost"
          aria-haspopup="dialog"
          @click="showDetailIsland"
        >
          了解焕新详情 <span class="beta6-hero-chev">›</span>
        </button>
      </div>
    </article>
  </section>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import themeManager from '@/utils/theme-manager.js';
import { showIsland } from '@/composables/useIsland.js';
import Beta6IslandCard from './Beta6IslandCard.vue';

defineProps({
  priority: { type: Boolean, default: false },
});

// 暗色自管理：跟随 themeManager 实际主题，暗色下覆写文字与色晕（组件内 scoped 完成）
const currentTheme = ref(themeManager.getTheme() === 'dark' ? 'dark' : 'light');
const onThemeChanged = (event) => {
  currentTheme.value = event?.detail?.theme === 'dark' ? 'dark' : 'light';
};

// —— 灵动岛：点击「了解焕新详情」唤起，顶部导航栏打字机显示焕新详情 ——
const router = useRouter();
const BETA6_DETAIL_TEXT = [
  '新设计语言，来亮眼。',
  '社区体验，更更更上一层楼。',
  '',
  '亮点，逐个看：',
  '· 液态玻璃，全面焕新，越看越顺眼。',
  '· 积分账本，笔笔透明，心里有数。',
  '· 活动沉淀成帖子，好内容永不过期。',
  '· 首页只讲一件事，专注，就是快。',
  '',
  '还有这些，样样都来劲：',
  '· 顶部灵动岛：重要动态，第一时间亮相。',
  '· 发帖流程：多图上传，一气呵成。',
  '· 用户空间：方块主页，清爽分明。',
  '· 通知中心：未读动态，一眼看清。',
  '· 深色模式：夜再深，也纯粹。',
  '· 论坛体验：越逛越顺手。',
  '',
  '下滑，看完所有亮点；或点「查看详情」，读完整发布说明。',
].join('\n');
let islandHandle = null;

const showDetailIsland = () => {
  islandHandle?.close();
  islandHandle = showIsland.custom(Beta6IslandCard, {
    text: BETA6_DETAIL_TEXT,
    onAction: () => {
      router.push('/newsroom');
      islandHandle?.close();
    },
    onClose: () => islandHandle?.close(),
  });
};

// 鼠标视差：色晕层轻微跟随（lerp 平滑，液态感）；reduced-motion 下不启用
const blobsEl = ref(null);
let parallaxTargetX = 0;
let parallaxTargetY = 0;
let parallaxX = 0;
let parallaxY = 0;
let parallaxRaf = 0;

const tickParallax = () => {
  parallaxX += (parallaxTargetX - parallaxX) * 0.06;
  parallaxY += (parallaxTargetY - parallaxY) * 0.06;
  if (blobsEl.value) {
    blobsEl.value.style.transform = `translate(${parallaxX.toFixed(2)}px, ${parallaxY.toFixed(2)}px)`;
  }
  parallaxRaf = Math.abs(parallaxTargetX - parallaxX) + Math.abs(parallaxTargetY - parallaxY) > 0.1
    ? requestAnimationFrame(tickParallax)
    : 0;
};

const onPointerMove = (event) => {
  parallaxTargetX = (event.clientX / window.innerWidth - 0.5) * 34;
  parallaxTargetY = (event.clientY / window.innerHeight - 0.5) * 26;
  if (!parallaxRaf) parallaxRaf = requestAnimationFrame(tickParallax);
};

onMounted(() => {
  window.addEventListener('theme-changed', onThemeChanged);
  if (typeof window.matchMedia === 'function'
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
  }
});

onUnmounted(() => {
  window.removeEventListener('theme-changed', onThemeChanged);
  window.removeEventListener('pointermove', onPointerMove);
  if (parallaxRaf) cancelAnimationFrame(parallaxRaf);
});
</script>

<style scoped>
/* ============================================================
   BOHLITE BETA 6 · 焕新 Hero（builtin_key: beta6-renewal）
   设计语言：液态玻璃 / 纯白背景 / 无渐变 / SF Pro 栈
   Token 与 src/styles/common/tokens.css --liquid-* 对齐
   ============================================================ */

.beta6-hero {
  /* 玻璃/文字/品牌 token 全部来自全局单一来源：
     --liquid-*（tokens.css）+ --hero-*（hero-surface.css，Hero 规范 V1） */

  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: min(86vh, 760px);
  padding: 96px max(24px, calc((100vw - 1200px) / 2)) 64px;
  background: #ffffff;
  overflow: hidden;
}

/* —— 漂浮色晕 —— */
.beta6-hero-blobs {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.beta6-hero-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(72px);
  /* 目标透明度交给变量：入场 keyframes 需要回到各自的最终透明度。
     第二轨为循环漂移：负 delay 产生相位差，各 blob 漂移节奏错开 */
  opacity: var(--blob-o, 0.4);
  animation:
    beta6-blob-in 1.1s cubic-bezier(0.22, 1, 0.36, 1) var(--blob-in-delay, 0s) backwards,
    var(--blob-drift) var(--blob-drift-dur, 16s) ease-in-out var(--blob-drift-phase, 0s) infinite alternate;
}

/* 玻璃正后方：主折射源 */
.beta6-hero-blob-1 { --blob-o: 0.5;  --blob-in-delay: 0.10s; --blob-drift: beta6-drift-1; --blob-drift-dur: 16s; width: 560px; height: 560px; background: #0071e3; top: 14%; left: 50%; margin-left: -400px; }
.beta6-hero-blob-2 { --blob-o: 0.42; --blob-in-delay: 0.25s; --blob-drift: beta6-drift-2; --blob-drift-dur: 13s; --blob-drift-phase: -3s; width: 440px; height: 440px; background: #5ac8fa; top: 6%; right: 14%; }

/* 页面边缘：氛围色晕 */
.beta6-hero-blob-3 { --blob-o: 0.32; --blob-in-delay: 0.40s; --blob-drift: beta6-drift-3; --blob-drift-dur: 18s; --blob-drift-phase: -6s; width: 380px; height: 380px; background: #ffd60a; bottom: -6%; left: 4%; }
.beta6-hero-blob-4 { --blob-o: 0.26; --blob-in-delay: 0.55s; --blob-drift: beta6-drift-2; --blob-drift-dur: 15s; --blob-drift-phase: -8s; width: 300px; height: 300px; background: #34c759; bottom: 8%; right: 6%; }
.beta6-hero-blob-5 { --blob-o: 0.24; --blob-in-delay: 0.70s; --blob-drift: beta6-drift-1; --blob-drift-dur: 20s; --blob-drift-phase: -11s; width: 260px; height: 260px; background: #ff9f0a; top: -8%; left: 22%; }

/* 色晕入场：从模糊色点晕开至目标透明度（透明度回落到各自 --blob-o） */
@keyframes beta6-blob-in {
  from { opacity: 0; transform: scale(0.72); }
  to   { opacity: var(--blob-o, 0.4); transform: scale(1); }
}

@keyframes beta6-drift-1 { from { transform: translate(0, 0) scale(1); } to { transform: translate(64px, 44px) scale(1.08); } }
@keyframes beta6-drift-2 { from { transform: translate(0, 0) scale(1); } to { transform: translate(-54px, -34px) scale(0.94); } }
@keyframes beta6-drift-3 { from { transform: translate(0, 0) scale(1); } to { transform: translate(46px, -50px) scale(1.06); } }

/* —— 毛玻璃卡 —— */
.beta6-hero-card {
  position: relative;
  width: min(880px, 100%);
  border-radius: var(--liquid-radius-lg);
  background: var(--liquid-bg);
  -webkit-backdrop-filter: var(--liquid-filter-lg);
  backdrop-filter: var(--liquid-filter-lg);
  box-shadow:
    var(--liquid-highlight),
    0 0 0 1px var(--liquid-border-hairline),
    0 0 0 4px rgba(255, 255, 255, 0.32),
    var(--liquid-shadow);
  padding: clamp(44px, 7vh, 76px) clamp(32px, 6vw, 88px);
  text-align: center;
  overflow: hidden;
  animation: beta6-hero-rise 0.85s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both;
  transition: box-shadow 0.4s ease;
}

/* sheen：入场完成后一道柔光扫过玻璃表面（纯色条 + blur，非渐变） */
.beta6-hero-card::after {
  content: '';
  position: absolute;
  top: -30%;
  bottom: -30%;
  left: 0;
  width: 36%;
  background: rgba(255, 255, 255, 0.34);
  filter: blur(30px);
  transform: translateX(-180%) skewX(-14deg);
  animation: beta6-sheen 1.5s cubic-bezier(0.4, 0, 0.2, 1) 1.9s;
  pointer-events: none;
}

@keyframes beta6-sheen {
  to { transform: translateX(440%) skewX(-14deg); }
}

.beta6-hero-card:hover {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.95),
    0 0 0 1px var(--liquid-border-hairline),
    0 0 0 4px rgba(255, 255, 255, 0.42),
    0 28px 72px rgba(15, 23, 42, 0.10);
}

/* 液态入场：squash & stretch 果冻形变，玻璃像液滴一样落定 */
@keyframes beta6-hero-rise {
  0%   { opacity: 0; transform: translateY(42px) scale(0.9, 1.1); }
  55%  { opacity: 1; transform: translateY(-5px) scale(1.035, 0.96); }
  78%  { transform: translateY(2px)  scale(0.988, 1.012); }
  100% { opacity: 1; transform: translateY(0)    scale(1); }
}

/* —— 卡内文案分层入场（backwards 填充，reduced-motion 下直接可见） —— */

/* eyebrow：淡入 + 字距从松收拢 */
.beta6-hero-eyebrow {
  animation: beta6-eyebrow-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.9s backwards;
}

@keyframes beta6-eyebrow-in {
  from { opacity: 0; letter-spacing: 0.3em; transform: translateY(12px); }
  to   { opacity: 1; letter-spacing: 0.12em; transform: translateY(0); }
}

/* headline：打字机逐字蹦出（阶跃现形，无位移），末尾光标闪烁、打完淡出 */
.beta6-hero-char {
  display: inline-block;
  animation: beta6-type-in 0.01s linear calc(0.7s + var(--char-i, 0) * 0.055s) backwards;
}

@keyframes beta6-type-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.beta6-hero-caret {
  display: inline-block;
  width: 0.085em;
  height: 0.82em;
  margin-left: 0.07em;
  border-radius: 0.03em;
  background: var(--hero-accent);
  vertical-align: -0.06em;
  animation:
    beta6-caret-in 0.01s linear 0.7s backwards,
    beta6-caret-blink 0.75s steps(2, start) 0.7s infinite,
    beta6-caret-out 0.45s ease 2.6s forwards;
}

@keyframes beta6-caret-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes beta6-caret-blink {
  50% { opacity: 0; }
}

@keyframes beta6-caret-out {
  to { opacity: 0; visibility: hidden; }
}

/* 正文 */
.beta6-hero-sub {
  animation: beta6-fade-up 0.65s cubic-bezier(0.22, 1, 0.36, 1) 1.1s backwards;
}

/* CTA 容器最后落位 */
.beta6-hero-actions {
  animation: beta6-fade-up 0.65s cubic-bezier(0.22, 1, 0.36, 1) 1.24s backwards;
}

@keyframes beta6-fade-up {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* eyebrow —— Hero 规范层 1 */
.beta6-hero-eyebrow {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--hero-accent);
  text-transform: uppercase;
  margin-bottom: 22px;
}

/* headline —— Hero 规范层 2（L 档） */
.beta6-hero-headline {
  font-size: clamp(44px, 6.5vw, 76px);
  line-height: 1.06;
  font-weight: 700;
  letter-spacing: -0.025em;
  color: var(--hero-text);
  margin-bottom: 22px;
}

.beta6-hero-accent { color: var(--hero-accent); }

/* 正文 —— Hero 规范层 3 */
.beta6-hero-sub {
  font-size: clamp(18px, 2.1vw, 22px);
  line-height: 1.5;
  font-weight: 400;
  color: var(--hero-text-secondary);
  max-width: 560px;
  margin: 0 auto 38px;
}

/* 主从双 CTA —— Hero 规范层 4 */
.beta6-hero-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 22px;
  flex-wrap: wrap;
}

.beta6-hero-btn-primary {
  display: inline-flex;
  align-items: center;
  height: 50px;
  padding: 0 30px;
  border-radius: var(--liquid-radius-pill);
  background: var(--hero-accent);
  color: #fff;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.01em;
  transition: background 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease;
  box-shadow: 0 8px 24px rgba(0, 113, 227, 0.28);
  /* 回弹入场：backwards 填充结束后不占用 transform，hover 位移照常生效 */
  animation: beta6-pop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 1.32s backwards;
}

@keyframes beta6-pop {
  from { opacity: 0; transform: scale(0.82); }
  to   { opacity: 1; transform: scale(1); }
}

.beta6-hero-btn-primary:hover {
  background: var(--hero-accent-hover);
  transform: translateY(-1px);
  box-shadow: 0 12px 32px rgba(0, 113, 227, 0.34);
}

.beta6-hero-btn-primary:active { transform: translateY(0) scale(0.98); }

.beta6-hero-btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 50px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  font-size: 17px;
  font-weight: 500;
  color: var(--hero-accent);
  transition: opacity 0.25s ease;
}

.beta6-hero-btn-ghost:hover { opacity: 0.72; }
.beta6-hero-btn-ghost .beta6-hero-chev { transition: transform 0.25s ease; }
.beta6-hero-btn-ghost:hover .beta6-hero-chev { transform: translateX(3px); }

/* ============ 暗色覆盖（Beta6 铁律：新 UI 必须有暗色覆盖） ============ */
/* 玻璃变量由 tokens.css [data-theme="dark"] 自动翻转；此处只补文字色与页面底色 */
.beta6-hero[data-theme="dark"] {
  --hero-text: #f5f5f7;
  --hero-text-secondary: #a1a1a6;
  background: #0b0b10;
}

.beta6-hero[data-theme="dark"] .beta6-hero-blob-1 { opacity: 0.34; }
.beta6-hero[data-theme="dark"] .beta6-hero-blob-2 { opacity: 0.28; }
.beta6-hero[data-theme="dark"] .beta6-hero-blob-3 { opacity: 0.2; }
.beta6-hero[data-theme="dark"] .beta6-hero-blob-4 { opacity: 0.16; }
.beta6-hero[data-theme="dark"] .beta6-hero-blob-5 { opacity: 0.14; }

.beta6-hero[data-theme="dark"] .beta6-hero-card {
  box-shadow:
    var(--liquid-highlight),
    0 0 0 1px var(--liquid-border-hairline),
    0 0 0 4px rgba(255, 255, 255, 0.05),
    var(--liquid-shadow);
}

.beta6-hero[data-theme="dark"] .beta6-hero-card::after {
  background: rgba(255, 255, 255, 0.14);
}

/* ============ 响应式 ============ */
@media (max-width: 640px) {
  .beta6-hero { min-height: min(80vh, 640px); padding: 80px 20px 48px; }
  .beta6-hero-sub { font-size: 17px; margin-bottom: 30px; }
  .beta6-hero-actions { flex-direction: column; gap: 14px; }
  .beta6-hero-btn-primary, .beta6-hero-btn-ghost { height: 48px; }
  .beta6-hero-blob-1 { margin-left: -320px; }
}

@media (prefers-reduced-motion: reduce) {
  .beta6-hero-blob,
  .beta6-hero-card,
  .beta6-hero-eyebrow,
  .beta6-hero-char,
  .beta6-hero-sub,
  .beta6-hero-actions,
  .beta6-hero-btn-primary { animation: none; }
  .beta6-hero-caret,
  .beta6-hero-card::after { display: none; }
  .beta6-hero-card,
  .beta6-hero-btn-primary,
  .beta6-hero-btn-ghost { transition: none; }
}
</style>
