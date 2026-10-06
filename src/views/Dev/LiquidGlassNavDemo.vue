<template>
  <main class="liquid-demo" :class="{ 'is-dark': isDark }">
    <section class="demo-toolbar" aria-label="Demo controls">
      <div>
        <p class="eyebrow">LIQUID GLASS NAV</p>
        <h1>底栏材质 Demo</h1>
        <p class="intro">向下滚动观察紧凑态，点击底栏观察展开态。</p>
      </div>
      <div class="demo-actions">
        <button
          class="control-button"
          type="button"
          :aria-pressed="isDark"
          @click="isDark = !isDark"
        >
          <Sun v-if="isDark" :size="17" aria-hidden="true" />
          <Moon v-else :size="17" aria-hidden="true" />
          <span>{{ isDark ? '亮色' : '暗色' }}</span>
        </button>
        <button
          class="control-button"
          type="button"
          :aria-pressed="forceExpanded"
          @click="forceExpanded = !forceExpanded"
        >
          <PanelBottomOpen :size="17" aria-hidden="true" />
          <span>{{ forceExpanded ? '自动收缩' : '固定展开' }}</span>
        </button>
      </div>
    </section>

    <section class="hero-surface" aria-label="Material preview">
      <div class="hero-copy">
        <span class="material-kicker">MATERIAL / 01</span>
        <h2>让内容从玻璃下面流过</h2>
        <p>底栏不再是一块固定白板，而是随背景、滚动和交互改变层次。</p>
      </div>
      <div class="floating-orbit" aria-hidden="true">
        <span class="orbit-dot orbit-dot-a"></span>
        <span class="orbit-dot orbit-dot-b"></span>
        <span class="orbit-dot orbit-dot-c"></span>
      </div>
    </section>

    <section class="content-stack" aria-label="Scrollable content">
      <article
        v-for="(item, index) in contentBlocks"
        :key="item.title"
        class="content-block"
        :class="`tone-${index + 1}`"
      >
        <div class="block-index">0{{ index + 1 }}</div>
        <div>
          <p class="block-label">{{ item.label }}</p>
          <h3>{{ item.title }}</h3>
          <p>{{ item.body }}</p>
        </div>
      </article>
    </section>

    <Transition name="compact-nav">
      <button
        v-if="isCompact && !isExpandedState"
        class="compact-nav"
        type="button"
        :aria-label="`打开${activeItem.label}导航`"
        @click="isExpanded = true"
      >
        <component :is="activeItem.icon" :size="21" :stroke-width="1.9" aria-hidden="true" />
        <ChevronUp :size="14" aria-hidden="true" />
      </button>
    </Transition>

    <Transition name="glass-nav">
      <nav
        v-if="!isCompact || isExpandedState"
        class="glass-nav"
        aria-label="Demo bottom navigation"
      >
        <div class="nav-surface">
          <div class="nav-highlight" :style="highlightStyle" aria-hidden="true"></div>
          <button
            v-for="item in navItems"
            :key="item.id"
            class="nav-item"
            :class="{ active: activeId === item.id }"
            type="button"
            @click="selectItem(item.id)"
          >
            <component
              :is="item.icon"
              :size="20"
              :stroke-width="activeId === item.id ? 2.1 : 1.8"
              aria-hidden="true"
            />
            <span>{{ item.label }}</span>
            <i v-if="item.id === 'messages'" class="notification-dot" aria-label="有未读消息"></i>
          </button>
          <button
            v-if="isExpandedState"
            class="nav-close"
            type="button"
            aria-label="收起底栏"
            @click="forceExpanded ? (forceExpanded = false) : (isExpanded = false)"
          >
            <ChevronDown :size="17" aria-hidden="true" />
          </button>
        </div>
      </nav>
    </Transition>
  </main>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  MessageCircle,
  Moon,
  PanelBottomOpen,
  Sparkles,
  Sun,
  UserRound,
} from 'lucide-vue-next';

const isDark = ref(false);
const isCompact = ref(false);
const isExpanded = ref(false);
const forceExpanded = ref(false);
const activeId = ref('community');

const navItems = [
  { id: 'community', label: '内容', icon: LayoutGrid },
  { id: 'messages', label: '消息', icon: MessageCircle },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'me', label: '我', icon: UserRound },
];

const contentBlocks = [
  {
    label: 'ADAPTIVE MATERIAL',
    title: '材质不是一张白色图片',
    body: '背景色、亮度和内容密度变化时，玻璃层保持可读性，但不切断下面的视觉信息。',
  },
  {
    label: 'SCROLL RESPONSE',
    title: '向下滚动，导航退到紧凑态',
    body: '内容获得更多空间，当前入口仍然保留，向上滚动或点击即可恢复完整导航。',
  },
  {
    label: 'CONTINUITY',
    title: '展开是同一层材质的延展',
    body: '导航和上方信息岛共享一套边界、阴影和高光，不依赖装饰渐变来连接。',
  },
  {
    label: 'SAFE AREA',
    title: '底部留白跟随设备变化',
    body: '底栏使用安全区变量，避免在带 Home Indicator 的设备上压住系统手势区域。',
  },
  {
    label: 'DETAIL',
    title: '选中态保持安静',
    body: '减少内嵌蓝色胶囊和过度缩放，把重点放在材质、对比度和触摸反馈上。',
  },
];

const activeItem = computed(
  () => navItems.find((item) => item.id === activeId.value) || navItems[0],
);
const isExpandedState = computed(() => forceExpanded.value || isExpanded.value);
const highlightStyle = computed(() => ({
  '--highlight-index': navItems.findIndex((item) => item.id === activeId.value),
}));

const selectItem = (id) => {
  activeId.value = id;
  if (!forceExpanded.value) isExpanded.value = false;
};

const handleScroll = () => {
  if (forceExpanded.value) return;
  const shouldCompact = window.scrollY > 90;
  isCompact.value = shouldCompact;
  if (!shouldCompact) isExpanded.value = false;
};

onMounted(() => window.addEventListener('scroll', handleScroll, { passive: true }));
onUnmounted(() => window.removeEventListener('scroll', handleScroll));
</script>

<style scoped>
:global(html),
:global(body) {
  background: #edf1f5;
}
:global(body) {
  margin: 0;
}

.liquid-demo {
  --demo-bg: #edf1f5;
  --demo-ink: #15202b;
  --demo-muted: #637180;
  --demo-surface: rgba(255, 255, 255, 0.62);
  --demo-surface-strong: rgba(255, 255, 255, 0.78);
  --demo-border: rgba(255, 255, 255, 0.74);
  --demo-shadow: 0 16px 44px rgba(48, 61, 77, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.78);
  min-height: 1500px;
  padding: 48px 22px 180px;
  color: var(--demo-ink);
  background: var(--demo-bg);
  transition:
    color 260ms ease,
    background-color 260ms ease;
}

.liquid-demo.is-dark {
  --demo-bg: #141a22;
  --demo-ink: #f2f5f7;
  --demo-muted: #9aa7b4;
  --demo-surface: rgba(34, 42, 52, 0.66);
  --demo-surface-strong: rgba(43, 52, 63, 0.8);
  --demo-border: rgba(255, 255, 255, 0.16);
  --demo-shadow: 0 18px 46px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.11);
}

.demo-toolbar,
.hero-surface,
.content-stack {
  width: min(920px, 100%);
  margin: 0 auto;
}
.demo-toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 28px;
}
.eyebrow,
.material-kicker,
.block-label {
  margin: 0;
  color: #54718b;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
}
.is-dark .eyebrow,
.is-dark .material-kicker,
.is-dark .block-label {
  color: #9dc5df;
}
h1,
h2,
h3,
p {
  margin-top: 0;
}
h1 {
  margin-bottom: 8px;
  font-size: clamp(30px, 5vw, 52px);
  line-height: 1.05;
}
.intro {
  margin-bottom: 0;
  color: var(--demo-muted);
  font-size: 14px;
}
.demo-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.control-button,
.nav-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 36px;
  border: 1px solid var(--demo-border);
  border-radius: 999px;
  padding: 0 12px;
  color: var(--demo-ink);
  background: var(--demo-surface);
  box-shadow: var(--demo-shadow);
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}
.control-button:hover,
.nav-close:hover {
  background: var(--demo-surface-strong);
}

.hero-surface {
  position: relative;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
  min-height: 420px;
  margin-top: 42px;
  padding: 32px;
  border: 1px solid rgba(255, 255, 255, 0.48);
  border-radius: 28px;
  background: #b9d5e5;
  box-shadow: 0 24px 70px rgba(60, 88, 108, 0.24);
}
.is-dark .hero-surface {
  background: #293d4a;
  border-color: rgba(255, 255, 255, 0.12);
}
.hero-surface::before,
.hero-surface::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}
.hero-surface::before {
  width: 360px;
  height: 360px;
  top: -120px;
  right: 12%;
  background: rgba(255, 255, 255, 0.32);
}
.hero-surface::after {
  width: 260px;
  height: 260px;
  right: -30px;
  bottom: -110px;
  background: rgba(40, 103, 139, 0.28);
}
.hero-copy {
  position: relative;
  z-index: 1;
  max-width: 440px;
}
.hero-copy h2 {
  margin: 12px 0 10px;
  font-size: clamp(28px, 5vw, 58px);
  line-height: 0.98;
}
.hero-copy p {
  max-width: 360px;
  margin-bottom: 0;
  color: rgba(21, 32, 43, 0.72);
  font-size: 15px;
  line-height: 1.55;
}
.is-dark .hero-copy p {
  color: rgba(242, 245, 247, 0.72);
}
.floating-orbit {
  position: absolute;
  top: 86px;
  right: 18%;
  width: 190px;
  height: 190px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  transform: rotate(-25deg);
}
.orbit-dot {
  position: absolute;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.68);
  box-shadow: 0 10px 20px rgba(37, 74, 95, 0.14);
}
.orbit-dot-a {
  top: 24px;
  left: 20px;
}
.orbit-dot-b {
  right: 8px;
  bottom: 38px;
  background: rgba(35, 103, 135, 0.58);
}
.orbit-dot-c {
  top: 74px;
  left: 78px;
  width: 16px;
  height: 16px;
}

.content-stack {
  display: grid;
  gap: 16px;
  margin-top: 22px;
}
.content-block {
  display: grid;
  grid-template-columns: 52px 1fr;
  gap: 18px;
  min-height: 170px;
  padding: 26px;
  border: 1px solid var(--demo-border);
  border-radius: 24px;
  background: var(--demo-surface);
  box-shadow: var(--demo-shadow);
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
}
.tone-2 {
  background: rgba(229, 213, 190, 0.68);
}
.tone-3 {
  background: rgba(202, 224, 207, 0.68);
}
.tone-4 {
  background: rgba(220, 209, 235, 0.68);
}
.tone-5 {
  background: rgba(241, 205, 196, 0.68);
}
.is-dark .tone-2,
.is-dark .tone-3,
.is-dark .tone-4,
.is-dark .tone-5 {
  background: var(--demo-surface);
}
.block-index {
  color: var(--demo-muted);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.content-block h3 {
  margin: 9px 0 8px;
  font-size: clamp(22px, 4vw, 36px);
  line-height: 1.05;
}
.content-block p:last-child {
  max-width: 560px;
  margin-bottom: 0;
  color: var(--demo-muted);
  font-size: 14px;
  line-height: 1.6;
}

.glass-nav,
.compact-nav {
  position: fixed;
  z-index: 20;
  bottom: calc(14px + env(safe-area-inset-bottom, 0px));
}
.glass-nav {
  left: 50%;
  width: min(440px, calc(100vw - 28px));
  transform: translateX(-50%);
}
.nav-surface {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 3px;
  padding: 6px;
  border: 1px solid var(--demo-border);
  border-radius: 28px;
  background: var(--demo-surface);
  box-shadow: var(--demo-shadow);
  backdrop-filter: var(--liquid-filter);
  -webkit-backdrop-filter: var(--liquid-filter);
}
.nav-highlight {
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: 6px;
  width: calc((100% - 12px - 9px) / 4);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.42);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.64),
    0 6px 18px rgba(45, 65, 82, 0.08);
  transform: translateX(calc(var(--highlight-index) * (100% + 3px)));
  transition:
    transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1),
    background-color 220ms ease;
  pointer-events: none;
}
.is-dark .nav-highlight {
  background: rgba(255, 255, 255, 0.12);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    0 6px 18px rgba(0, 0, 0, 0.12);
}
.nav-item {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  min-height: 54px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 0;
  border-radius: 22px;
  color: var(--demo-muted);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
}
.nav-item.active,
.nav-item:hover {
  color: var(--demo-ink);
}
.notification-dot {
  position: absolute;
  top: 10px;
  right: 18%;
  width: 7px;
  height: 7px;
  border: 2px solid var(--demo-surface-strong);
  border-radius: 50%;
  background: #ff453a;
}
.nav-close {
  position: absolute;
  top: -42px;
  right: 2px;
  width: 32px;
  min-height: 32px;
  padding: 0;
}
.compact-nav {
  left: 50%;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 54px;
  min-height: 48px;
  padding: 0 12px;
  border: 1px solid var(--demo-border);
  border-radius: 999px;
  color: var(--demo-ink);
  background: var(--demo-surface);
  box-shadow: var(--demo-shadow);
  transform: translateX(-50%);
  cursor: pointer;
  backdrop-filter: var(--liquid-filter);
  -webkit-backdrop-filter: var(--liquid-filter);
}

.glass-nav-enter-active,
.glass-nav-leave-active,
.compact-nav-enter-active,
.compact-nav-leave-active {
  transition:
    opacity 220ms ease,
    transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.glass-nav-enter-from,
.glass-nav-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(16px) scale(0.96);
}
.compact-nav-enter-from,
.compact-nav-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(12px) scale(0.86);
}

@media (max-width: 620px) {
  .liquid-demo {
    padding: 28px 14px 160px;
  }
  .demo-toolbar {
    display: block;
  }
  .demo-actions {
    justify-content: flex-start;
    margin-top: 18px;
  }
  .hero-surface {
    min-height: 360px;
    margin-top: 28px;
    padding: 24px;
    border-radius: 24px;
  }
  .floating-orbit {
    top: 54px;
    right: -12px;
    transform: scale(0.72) rotate(-25deg);
    transform-origin: top right;
  }
  .content-block {
    grid-template-columns: 38px 1fr;
    gap: 10px;
    padding: 20px;
  }
  .nav-item {
    min-height: 50px;
    gap: 4px;
    font-size: 11px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .liquid-demo,
  .nav-highlight,
  .glass-nav-enter-active,
  .glass-nav-leave-active,
  .compact-nav-enter-active,
  .compact-nav-leave-active {
    transition-duration: 1ms;
  }
}
</style>
