<template>
  <section
    ref="rootRef"
    class="street-hero"
    :class="{ 'is-media-less': !mediaVisible, 'on-brand': !hasStreetImage }"
    aria-label="方块街开场"
  >
    <!-- 品牌兜底层（2026-09-24 起为「默认首屏」形态）：纯白底 + 居中红 logo。
         没配街景图、或街景图加载失败时启用；配了图则完全不渲染，整层让位给照片。
         ⚠️ 这个 img 才是**当前真实的 LCP 元素**（home_heroes 的 image_portrait /
         landscape 全为 NULL，线上首屏一直走这条兜底）。
         2026-11-16 补 fetchpriority="high"：（1）它是 LCP，1.6 Mbps 下实测被排进
         Low 队列、6 KB 的图要 1.3–1.6 s；（2）utils/image-optimizer.js 会给所有
         「没有 fetchpriority=high」的 img 自动加 loading="lazy"，这条豁免等于顺带
         关掉那个降级。慢网实测 LCP 4.2 s → 见 docs 同名方案的 Phase 0 复测。 -->
    <div v-if="!hasStreetImage" class="street-hero-brand" aria-hidden="true">
      <img
        class="street-hero-brand-logo"
        :src="BRAND_LOGO_SRC"
        alt=""
        width="512"
        height="512"
        fetchpriority="high"
        decoding="async"
        @error="onBrandLogoError"
      />
    </div>

    <!-- 双构图：竖屏 1170x2532 / 横屏 2560x1440，按 orientation 切换。
         完全离开视口后卸载 <img>（IO 驱动），滚回顶部再挂载 —— 浏览器内存缓存即时恢复。
         这是 LCP 元素：fetchpriority=high + width/height 防 CLS。 -->
    <div v-if="hasStreetImage" class="street-hero-media">
      <img
        v-if="mediaVisible"
        class="street-hero-img"
        :src="orientedSrc"
        :width="activeWidth"
        :height="activeHeight"
        alt=""
        fetchpriority="high"
        decoding="async"
        @error="onImageError"
      />
    </div>

    <!-- 浅 scrim：只在问候（上 22%）与提示（下 18%）两带渐晕，中段完全透明。
         仅照片形态渲染 —— 品牌兜底是纯白底，黑色渐晕会变成灰带。 -->
    <div v-if="hasStreetImage" class="street-hero-scrim" aria-hidden="true"></div>

    <div class="street-hero-content">
      <p class="street-hero-greeting">{{ greetingText }}</p>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { getCloudinaryTransformedUrl } from '@/utils/cloudinary-client.js';
import { resolveGreetingText, resolveGreetingWord } from '@/utils/street-scene-copy.js';

/* 首屏街景开场画（任务 A）
   规格来源：docs/reports/2026-09/2026-09-22-首页改版实施交付说明.md §2
   - 高度 100svh（必须 svh：防移动端地址栏抖动）
   - 普通文档流，随滚动自然滚出、不回归 —— 无 sticky / 无视差 / 无滚动劫持
   - 降级链：本方向构图图 → 项目品牌图 main1-* → 纯暖色底 + 问候（永不白屏）
   - 文字可读性：问候/提示两带浅 scrim + 文字阴影，对比度 ≥ 4.5:1
   - 全部动效包 prefers-reduced-motion */

const props = defineProps({
  /** street-scene 行的双图字段；无生效行时传 null */
  hero: { type: Object, default: null },
});

const rootRef = ref(null);
const isPortrait = ref(true);
// 两个正交状态，必须分开：图全挂了（永久）vs 滚出视口（可恢复）
const imageUnavailable = ref(false);
const isOffscreen = ref(false);
const mediaVisible = computed(() => !imageUnavailable.value && !isOffscreen.value);

// —— 方向单源：matchMedia 驱动，避免 resize 里手算宽高比 ——
let orientationQuery = null;
const onOrientationChange = (event) => {
  isPortrait.value = event.matches;
};
const setupOrientation = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  orientationQuery = window.matchMedia('(orientation: portrait)');
  isPortrait.value = orientationQuery.matches;
  if (typeof orientationQuery.addEventListener === 'function') {
    orientationQuery.addEventListener('change', onOrientationChange);
  } else if (typeof orientationQuery.addListener === 'function') {
    // 旧 Safari 兜底
    orientationQuery.addListener(onOrientationChange);
  }
};

// —— 品牌兜底（默认首屏形态）：页面底色底 + 居中红 logo + 主文字色 ——
// 用 icon-512-transparent.png 而不是 PWA 的 icon-512.png：后者四角是不透明白
// （实测像素 alpha=255），暗色首屏会变成一块白方块（2026-11-02 用户截图报障）。
// 透明版由前者去掉「与画布边界连通」的纯白生成，苹果内部浅色高光没动；
// 浅色下页面底色本就是白，渲染结果与用白底版完全一致。
// 像素图放大靠 image-rendering: pixelated 保持棱角，不做位图多档 —— 一张 512 到处够用。
const BRAND_LOGO_SRC = '/icons/icon-512-transparent.png';

// hero 档位：c_limit 只压不裁（裁切交给 object-fit: cover），w_1440 覆盖到 1440 CSS 1x /
// 720 CSS 2x；2560px 横屏原图从这里下到 CDN 压缩档。当前 home_heroes 的
// image_portrait/landscape 全为 NULL（2026-10-05 实测，首屏走品牌兜底），配置后自动生效。
const HERO_IMAGE_TRANSFORM = 'f_auto,q_auto:good,c_limit,w_1440';

const orientedSrc = computed(() => {
  const raw = String(
    (isPortrait.value ? props.hero?.image_portrait : props.hero?.image_landscape) || '',
  ).trim();
  return raw ? getCloudinaryTransformedUrl(raw, HERO_IMAGE_TRANSFORM) : '';
});

// 本方向配了街景图且没加载失败 → 照片形态；否则进入品牌兜底（白底 + logo + 黑字）。
// 街景图挂掉不再二次降级到品牌位图 —— 品牌兜底本身就是无外部依赖的 DOM+CSS，不会挂。
const streetSceneFailed = ref(false);
const hasStreetImage = computed(() => Boolean(orientedSrc.value) && !streetSceneFailed.value);

// width/height 只用于防 CLS 的固有比例声明；实际铺满靠 object-fit: cover
const activeWidth = computed(() => (isPortrait.value ? 1170 : 2560));
const activeHeight = computed(() => (isPortrait.value ? 2532 : 1440));

const onImageError = () => {
  // 街景图挂了 → 整体切到品牌兜底（白底 + logo），不再尝试位图二级兜底
  streetSceneFailed.value = true;
};

const onBrandLogoError = () => {
  // 理论上本地静态资源不会走到这里；真发生了就退到纯暖色底（永不白屏的最后防线）
  imageUnavailable.value = true;
};

// —— 时段问候 ——
// 2026-11-14：默认文案已改为固定句「这里不只有方块」（不随时段变），
// 但自定义模板仍可写 {greeting} 占位符，所以时段词继续保留。
// 时段词实现只在 utils/street-scene-copy.js 一处（此处不得另立副本）。
const greetingWord = ref('');
/* 问候语由 street-scene 行的 greeting_text 控制（2026-09-24 起可配）。
   留空一律回落默认值。口径与装修台实时预览共用 utils/street-scene-copy.js —— 勿在此另立副本。
   时段词沿用 greetingWord（onMounted 回填，避免首帧取时间的抖动）。 */
const greetingText = computed(() =>
  resolveGreetingText(props.hero?.greeting_text, greetingWord.value),
);

// —— IO：完全离开视口后卸载图片解码，滚回恢复 ——
let io = null;
const setupObserver = () => {
  if (typeof window === 'undefined' || !window.IntersectionObserver || !rootRef.value) return;
  io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        // threshold 0 + rootMargin 0：ratio 为 0 即「完全不可见」
        isOffscreen.value = entry.intersectionRatio === 0;
      });
    },
    { threshold: 0, rootMargin: '0px' },
  );
  io.observe(rootRef.value);
};

onMounted(() => {
  greetingWord.value = resolveGreetingWord();
  setupOrientation();
  setupObserver();
});

onBeforeUnmount(() => {
  if (orientationQuery) {
    if (typeof orientationQuery.removeEventListener === 'function') {
      orientationQuery.removeEventListener('change', onOrientationChange);
    } else if (typeof orientationQuery.removeListener === 'function') {
      orientationQuery.removeListener(onOrientationChange);
    }
  }
  orientationQuery = null;
  if (io) {
    io.disconnect();
    io = null;
  }
});
</script>

<style scoped>
.street-hero {
  /* 全站统一系统栈（不引入 web 字体，零 FOUT / 零 CLS） */
  --street-hero-font:
    -apple-system, 'PingFang SC', 'HarmonyOS Sans SC', 'MiSans', 'Microsoft YaHei', sans-serif;
  --street-hero-scrim-max: 0.25;
  --street-hero-warm-bg: #f3ece2;

  position: relative;
  width: 100%;
  height: 100svh;
  /* 480px 只兜「超矮视口」这一种情况；横屏手机视口常常只有 390~430px 高，
     用同一个下限会把开场画撑出视口、底部提示被裁掉 —— 横屏单独放开（见下）。 */
  min-height: 480px;
  overflow: hidden;
  background-color: var(--street-hero-warm-bg);
  font-family: var(--street-hero-font);
  isolation: isolate;
}

.street-hero-media {
  position: absolute;
  inset: 0;
  background-color: var(--street-hero-warm-bg);
}

.street-hero-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

.street-hero-scrim {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(
      to bottom,
      rgba(0, 0, 0, var(--street-hero-scrim-max)) 0%,
      rgba(0, 0, 0, calc(var(--street-hero-scrim-max) * 0.5)) 12%,
      rgba(0, 0, 0, 0) 22%
    ),
    linear-gradient(
      to top,
      rgba(0, 0, 0, var(--street-hero-scrim-max)) 0%,
      rgba(0, 0, 0, calc(var(--street-hero-scrim-max) * 0.5)) 10%,
      rgba(0, 0, 0, 0) 18%
    );
}

.street-hero-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  /* 顶部避让吃 --userspace-nav-h（导航栏实测高度，由 Home 的 ResizeObserver 写入；
     拿不到时回退 78px）——竖屏是居中胶囊、横屏是全宽横条，写死必然一头空一头盖。
     底部留白给右下角「跳过」按钮留出安全空间。 */
  padding: max(84px, calc(var(--userspace-nav-h, 78px) + 16px)) clamp(20px, 5vw, 56px)
    clamp(72px, 17svh, 152px);
  pointer-events: none;
}

.street-hero-greeting {
  align-self: flex-start;
  margin: 0;
  max-width: min(100%, 22ch);
  font-size: clamp(28px, 4.4vw, 34px);
  font-weight: 600;
  line-height: 1.32;
  letter-spacing: 0.02em;
  color: #ffffff;
  text-shadow:
    0 1px 12px rgba(0, 0, 0, 0.45),
    0 1px 3px rgba(0, 0, 0, 0.3);
}

.street-hero:not(.on-brand) .street-hero-greeting {
  animation: streetHeroGreetingIn 760ms 120ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)) both;
}

@keyframes streetHeroGreetingIn {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ---------- 品牌兜底（默认首屏形态，2026-09-24） ----------
   纯白底 + 居中红 logo + 黑字。像素 logo 放大用 pixelated 保棱角；
   尺寸用 svh 而非 vw —— 横竖屏切换时 logo 永远完整居中、不溢出不变形。 */
.street-hero.on-brand {
  /* 2026-10-22 暗色修复：这里是「无街景图」时的整块兜底底色，原来硬编码 #ffffff。
     暗色主题下横屏首页顶部会露出一整片纯白（用户截图报障）。
     改走页面底色 token —— 浅色解析仍是 #fff（渲染结果与原来一致），暗色自动跟随。 */
  background-color: var(--boh-page-bg, #ffffff);
}

.street-hero-brand {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 2026-10-22 暗色修复：原来硬编码 #ffffff，暗色主题下这块「无街景图兜底背景」
     会变成一整片纯白，横屏首页顶部看起来像漏了一块白。
     改走页面底色 token —— 浅色仍是 #fff（与原来完全一致），暗色自动跟随。 */
  background-color: var(--boh-page-bg, #ffffff);
}

.street-hero-brand-logo {
  width: auto;
  height: clamp(132px, 24svh, 240px);
  max-width: 56vw;
  object-fit: contain;
  image-rendering: pixelated;
  animation: streetHeroLogoIn 640ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)) both;
}

@keyframes streetHeroLogoIn {
  from {
    opacity: 0;
    transform: scale(0.94);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* 白底态：文字翻转为暖黑、去阴影；整组文案做一次轻入场。
   文字与底色都从同一套 --boh-* token 派生，暗色下不会一半翻黑、一半留在浅色。 */
.street-hero.on-brand .street-hero-greeting {
  color: var(--boh-text-primary, #17130e);
  text-shadow: none;
}

.street-hero.on-brand .street-hero-content {
  animation: streetHeroCopyIn 520ms 140ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)) both;
}

@keyframes streetHeroCopyIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* ---------- 横屏 / 矮视口适配（2026-09-24） ----------
   横屏时可用高度常被压到 390~430px：
   · min-height 放开，否则开场画被撑出视口；
   · 上下留白改按 svh 收；
   · 问候语收窄到半屏内（横屏一行太长会横跨整屏、压住主体构图）。 */
@media (orientation: landscape), (max-height: 560px) {
  .street-hero {
    min-height: 0;
  }

  .street-hero-content {
    /* 横屏导航是全宽横条（比竖屏胶囊矮但更宽），同样按实测高度避让 */
    padding: max(64px, calc(var(--userspace-nav-h, 60px) + 12px)) clamp(28px, 4vw, 64px)
      max(44px, 15svh);
  }

  .street-hero-greeting {
    max-width: min(52%, 24ch);
    font-size: clamp(19px, 2.4vw, 26px);
  }

  /* 横屏可用高度小，logo 按高度约束收一档，始终完整居中 */
  .street-hero-brand-logo {
    height: clamp(96px, 32svh, 176px);
  }
}

@media (prefers-reduced-motion: reduce) {
  /* 照片形态的分层入场一并砍掉：reduce 用户不该看到「逐渐显现」 */
  .street-hero:not(.on-brand) .street-hero-greeting {
    animation: none;
  }
  .street-hero-brand-logo,
  .street-hero.on-brand .street-hero-content {
    animation: none;
  }
}
</style>
