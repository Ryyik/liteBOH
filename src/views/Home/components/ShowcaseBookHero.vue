<template>
  <section
    class="showcase-hero"
    :class="[hero.variant || 'light', { 'is-portrait': isPortrait, 'is-preview': Boolean(previewDevice), 'is-character-ring': isRingMode }]"
    :aria-label="hero.aria_label || hero.title"
  >
    <!-- 氛围光斑（radial gradient，不用 blur filter） -->
    <div class="showcase-ambient showcase-ambient-a" aria-hidden="true"></div>
    <div class="showcase-ambient showcase-ambient-b" aria-hidden="true"></div>
    <div class="showcase-ambient showcase-ambient-c" aria-hidden="true"></div>

    <!-- 飘落像素落叶粒子 -->
    <div v-if="particlesEnabled" class="showcase-particles" aria-hidden="true">
      <span
        v-for="leaf in leaves"
        :key="leaf.id"
        class="showcase-leaf-fall"
        :style="leaf.fallStyle"
      >
        <span class="showcase-leaf-sway" :style="leaf.swayStyle"></span>
      </span>
    </div>

    <!-- 文案区 -->
    <div class="showcase-content">
      <div class="showcase-eyebrow-row">
        <span v-if="hero.eyebrow" class="showcase-eyebrow">{{ hero.eyebrow }}</span>
        <span v-if="badgeText" class="showcase-badge">
          <Leaf :size="13" :stroke-width="2.2" aria-hidden="true" />
          {{ badgeText }}
        </span>
      </div>
      <h1 class="showcase-title" v-html="sanitizedTitle"></h1>
      <p v-if="hero.subtitle" class="showcase-subtitle">{{ hero.subtitle }}</p>
      <div v-if="resolvedLinks.length" class="showcase-actions">
        <template v-for="(link, i) in resolvedLinks" :key="`showcase-link-${i}`">
          <router-link
            v-if="link.to"
            :to="link.to"
            class="showcase-button"
            :class="`is-${link.type || 'secondary'}`"
          >{{ link.text }}</router-link>
          <a
            v-else-if="link.href"
            :href="link.href"
            class="showcase-button"
            :class="`is-${link.type || 'secondary'}`"
            target="_blank"
            rel="noopener noreferrer"
          >{{ link.text }}</a>
          <button
            v-else
            type="button"
            class="showcase-button"
            :class="`is-${link.type || 'secondary'}`"
            @click="link.onClick && link.onClick()"
          >{{ link.text }}</button>
        </template>
      </div>
    </div>

    <!-- 舞台：中央立体书 + 人物环绕 -->
    <div class="showcase-stage">
      <div class="showcase-ground" aria-hidden="true"></div>

      <!-- 环绕人物（书本后方两侧错落） -->
      <div class="showcase-cast" aria-hidden="false">
        <div
          v-for="(char, i) in stageCharacters"
          :key="`${char.key || char.src || i}-${i}`"
          class="showcase-character"
          :class="[`is-${char.side}`, `is-depth-${char.depth}`]"
          :style="characterStyle(char, i)"
        >
          <img
            :src="char.resolvedSrc"
            :alt="char.name ? `${char.name} 立绘` : ''"
            class="showcase-character-image"
            :loading="priority && i < 2 ? 'eager' : 'lazy'"
            decoding="async"
            draggable="false"
          >
          <span class="showcase-character-shadow" aria-hidden="true"></span>
        </div>
      </div>

      <!-- 立体书 -->
      <div class="showcase-book-position">
        <div class="showcase-book-tilt">
          <div class="showcase-book-float">
            <div class="showcase-book">
              <div class="book-pages" aria-hidden="true"></div>
              <div class="book-cover">
                <img
                  v-if="coverSrc"
                  :src="coverSrc"
                  :alt="coverAlt"
                  class="book-cover-image"
                  :loading="priority ? 'eager' : 'lazy'"
                  decoding="async"
                  draggable="false"
                >
                <div v-else class="book-cover-fallback" aria-hidden="true">
                  <span class="book-cover-series">设定集</span>
                  <span class="book-cover-name">{{ hero.title }}</span>
                </div>
                <span class="book-spine" aria-hidden="true"></span>
                <span class="book-gloss" aria-hidden="true"></span>
              </div>
            </div>
          </div>
        </div>
        <div class="showcase-book-shadow" aria-hidden="true"></div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Leaf } from 'lucide-vue-next';
import DOMPurify from '@/utils/dompurify.js';
import { getCloudinaryTransformedUrl } from '@/utils/cloudinary-client.js';
import { SKIN_LIBRARY, resolveSkinAsset } from '@/data/skinLibrary.js';

const props = defineProps({
  hero: { type: Object, required: true },
  previewDevice: { type: String, default: '' },
  priority: { type: Boolean, default: false }
});

const emit = defineEmits(['link-click']);

// 真实视口方向监听（管理台预览时优先使用 previewDevice）
const viewportIsPortrait = ref(false);
const syncViewportOrientation = () => {
  viewportIsPortrait.value = window.matchMedia('(orientation: portrait)').matches;
};
onMounted(() => {
  syncViewportOrientation();
  window.addEventListener('resize', syncViewportOrientation);
});
onBeforeUnmount(() => window.removeEventListener('resize', syncViewportOrientation));

const config = computed(() => props.hero.showcase_config || {});
// 群像环模式判定：优先读 showcase_config.layout === 'ring'，
// 兼容历史数据回退到标题「方块设定集」，避免运营改名后环布局静默失效
const isRingMode = computed(() => config.value.layout === 'ring' || props.hero.title === '方块设定集');
const badgeText = computed(() => (config.value.badge_text || '').trim());
const particlesEnabled = computed(() => config.value.particles !== false && !isRingMode.value);
const coverSrc = computed(() => {
  const src = config.value.cover_src || '';
  return src ? getCloudinaryTransformedUrl(src, 'f_auto,q_auto:good,w_720') : '';
});
const coverAlt = computed(() => config.value.cover_alt || `${props.hero.title} 书封`);

const sanitizedTitle = computed(() => DOMPurify.sanitize(props.hero.title, {
  ALLOWED_TAGS: ['br', 'b', 'strong', 'em', 'i', 'span'],
  ALLOWED_ATTR: ['class']
}));

const resolveLinks = (links) => {
  if (!Array.isArray(links)) return [];
  return links.map((link) => ({
    ...link,
    onClick: link.onClick ? () => emit('link-click', link.onClick) : undefined
  }));
};
const resolvedLinks = computed(() => resolveLinks(props.hero.links));

const isPortrait = computed(() => props.previewDevice
  ? props.previewDevice === 'mobile'
  : viewportIsPortrait.value);

const normalizeCharacter = (raw, index) => {
  const cfg = raw || {};
  const depth = [1, 2, 3].includes(Number(cfg.depth)) ? Number(cfg.depth) : 2;
  return {
    key: cfg.key || '',
    resolvedSrc: resolveSkinAsset(cfg.key, cfg.src || ''),
    name: cfg.name || '',
    side: cfg.side === 'right' ? 'right' : 'left',
    depth,
    scale: Math.max(0.6, Math.min(1.4, Number(cfg.scale) || 1)),
    mobileHidden: Boolean(cfg.mobile_hidden),
    order: index
  };
};

const allCharacters = computed(() => {
  const configured = Array.isArray(config.value.characters) ? config.value.characters : [];
  if (!isRingMode.value) return configured.map(normalizeCharacter);

  // 设定集首屏始终展示完整经典角色群像；数据库中的配置仍可覆盖同 key 的站位与缩放。
  const overrides = new Map(configured.map((item) => [item?.key, item]));
  // 设定集展示基础角色，每位角色只保留一个主皮肤，避免同一人物的换装重复出现。
  const primaryKeys = new Set([
    'baicheng_style', 'baiye_style', 'chengzi_style', 'eleven_style', 'end_style',
    'fivege_style2', 'hamburger_style', 'pufferfish_style', 'ryyik_style',
    'Slkeswdr_style', 'teacher-ding_style', 'thoik_style', 'xiaoniu_style', 'yufuqu_style',
    'train/91_poisoner_style'
  ]);
  const classicCharacters = SKIN_LIBRARY.filter((item) => primaryKeys.has(item.key));
  // 环绕顺序：数据库配置的 characters 声明顺序优先，未配置的角色按皮肤库顺序补在后面。
  const configOrder = new Map();
  configured.forEach((item, i) => {
    if (item?.key && !configOrder.has(item.key)) configOrder.set(item.key, i);
  });
  const orderedCharacters = classicCharacters
    .map((item, libIndex) => ({ item, libIndex }))
    .sort((a, b) => {
      const rankA = configOrder.has(a.item.key) ? configOrder.get(a.item.key) : configOrder.size + a.libIndex;
      const rankB = configOrder.has(b.item.key) ? configOrder.get(b.item.key) : configOrder.size + b.libIndex;
      return rankA - rankB;
    });
  return orderedCharacters.map(({ item }, index) => normalizeCharacter({
    key: item.key,
    name: item.name,
    side: index % 2 === 0 ? 'left' : 'right',
    depth: [1, 2, 3][index % 3],
    scale: 0.9 + (index % 4) * 0.06,
    mobile_hidden: index > 7,
    ...overrides.get(item.key)
  }, index));
});

// 竖屏按设备策略筛选角色；设定集保留完整群像。
const stageCharacters = computed(() => {
  let list = allCharacters.value.filter((c) => c.resolvedSrc);
  if (isPortrait.value) {
    // 设定集竖屏需要完整群像，所有角色都参与布局；其他 showcase 沿用移动端精简策略。
    if (!isRingMode.value) list = list.filter((c) => !c.mobileHidden);
    const maxPerSide = isRingMode.value ? 99 : 2;
    const pick = (side) => list.filter((c) => c.side === side).slice(0, maxPerSide);
    list = [...pick('left'), ...pick('right')].slice(0, maxPerSide * 2);
  }
  // 同侧按 depth 降序排（前景靠近书），计算错落偏移
  const sideCounters = { left: 0, right: 0 };
  return list.map((char) => {
    const sideIndex = sideCounters[char.side]++;
    return { ...char, sideIndex };
  });
});

const DEPTH_SCALE = { 1: 1, 2: 0.86, 3: 0.74 };
const DEPTH_OFFSET = { 1: 128, 2: 216, 3: 302 };

// ========== 群像环：透明留白自动归一化 + 显式宽度 ==========
// 1) 部分立绘 webp 自带大片透明留白：用 canvas 扫 alpha 包围盒测「实际内容高度占比」，
//    按比例放大归一化，替代旧版 1.55 / 2.35 / 2.1 等手工补偿。
// 2) 容器是 absolute 只设 left，shrink-to-fit 的可用宽度 = 舞台宽 - left，
//    右侧角色会被挤压变形（配合全局 img max-width:100% 尤其严重）。
//    因此按图片实测宽高比显式计算容器宽度，绕开自动收缩。
const MANUAL_ASSET_SCALE = {
  'train/91_poisoner_style': 2.35,
  'teacher-ding_style': 2.1
};
const CONTENT_TARGET_RATIO = 0.88;
const FALLBACK_ASPECT = 0.583;
const ratioCache = new Map();
const charMetrics = ref(new Map());

const measureContentRatio = (src) => {
  if (!src || ratioCache.has(src)) return Promise.resolve(ratioCache.get(src) ?? null);
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const aspect = img.naturalWidth > 0 && img.naturalHeight > 0
        ? img.naturalWidth / img.naturalHeight
        : FALLBACK_ASPECT;
      let ratio = 1;
      try {
        const w = Math.min(img.naturalWidth, 320);
        const h = Math.max(1, Math.round(img.naturalHeight * (w / img.naturalWidth)));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        let top = h;
        let bottom = -1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * 4 + 3] > 12) {
              if (y < top) top = y;
              bottom = y;
              break;
            }
          }
        }
        ratio = bottom > top ? (bottom - top + 1) / h : 1;
      } catch {
        ratio = 1;
      }
      const metrics = { ratio, aspect };
      ratioCache.set(src, metrics);
      resolve(metrics);
    };
    img.onerror = () => {
      const metrics = { ratio: 1, aspect: FALLBACK_ASPECT };
      ratioCache.set(src, metrics);
      resolve(metrics);
    };
    img.src = src;
  });
};

watch(
  () => stageCharacters.value.map((c) => c.resolvedSrc).join('|'),
  (joined) => {
    joined.split('|').filter(Boolean).forEach((src) => {
      measureContentRatio(src).then((metrics) => {
        if (!charMetrics.value.has(src)) {
          charMetrics.value = new Map(charMetrics.value).set(src, metrics);
        }
      });
    });
  },
  { immediate: true }
);

const characterStyle = (char, index) => {
  // 环形模式（设定集群像）：坐标由 JS 单点计算，横竖屏只切换椭圆参数；
  // 角度用 char.order（经典名单固定序号），旋转屏幕时角色方位稳定不跳变。
  if (isRingMode.value) {
    const count = Math.max(allCharacters.value.length, 1);
    const angle = -Math.PI / 2 + (char.order / count) * Math.PI * 2;
    const portrait = isPortrait.value;
    const rx = portrait ? 46 : 43;
    const ry = portrait ? 17 : 35;
    const cy = portrait ? 44 : 52;
    const metrics = charMetrics.value.get(char.resolvedSrc);
    const fit = metrics?.ratio
      ? Math.min(3, Math.max(0.85, CONTENT_TARGET_RATIO / metrics.ratio))
      : (MANUAL_ASSET_SCALE[char.key] || 1);
    const depthFactor = { 1: 1.05, 2: 1, 3: 0.94 }[char.depth] || 1;
    const scale = Math.min(3.2, fit * char.scale * depthFactor);
    return {
      '--ring-x': `${(50 + Math.cos(angle) * rx).toFixed(2)}%`,
      '--ring-y': `${(cy + Math.sin(angle) * ry).toFixed(2)}%`,
      '--ring-scale': scale.toFixed(3),
      '--ring-aspect': (metrics?.aspect || FALLBACK_ASPECT).toFixed(4),
      '--char-delay': `${260 + index * 95}ms`,
      zIndex: 20 + Math.round(Math.sin(angle) * 10)
    };
  }
  // 书本舞台模式：两侧错落（原有逻辑不变）
  const direction = char.side === 'left' ? -1 : 1;
  const offset = DEPTH_OFFSET[char.depth] + char.sideIndex * 92;
  const scale = DEPTH_SCALE[char.depth] * char.scale;
  const delay = 260 + index * 95;
  return {
    '--char-offset': `${Math.round(direction * offset)}px`,
    '--char-scale': scale.toFixed(3),
    '--char-delay': `${delay}ms`,
    zIndex: char.depth === 1 ? 30 : char.depth === 2 ? 18 : 8
  };
};

// 像素落叶：索引决定参数（确定性，避免每次重渲染闪变）
const LEAF_COLORS = ['#d97742', '#c2603e', '#e0a458', '#a86b3d', '#b3543a'];
const leaves = computed(() => Array.from({ length: 14 }, (_, i) => {
  const hash = (i * 2654435761) % 1000;
  const size = 6 + (hash % 6);
  return {
    id: i,
    fallStyle: {
      left: `${(hash * 37 % 96) + 2}%`,
      width: `${size}px`,
      height: `${size}px`,
      animationDuration: `${9 + (hash % 80) / 10}s`,
      animationDelay: `${-(hash % 90)}s`
    },
    swayStyle: {
      background: LEAF_COLORS[i % LEAF_COLORS.length],
      animationDuration: `${2.6 + (hash % 20) / 10}s`,
      animationDelay: `${-(hash % 26) / 10}s`
    }
  };
}));
</script>

<style scoped>
/* ========== 基础与配色 ========== */
.showcase-hero {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: clamp(620px, var(--hero-preview-height, 78svh), 900px);
  overflow: hidden;
  padding: clamp(56px, 7vw, 96px) clamp(22px, 6vw, 88px) 0;
  color: var(--showcase-text);
  text-align: center;
}

.showcase-hero.light {
  --showcase-text: #2c241a;
  --showcase-text-muted: rgba(78, 62, 44, 0.78);
  --showcase-badge-bg: rgba(217, 119, 66, 0.14);
  --showcase-badge-border: rgba(194, 96, 62, 0.32);
  --showcase-badge-text: #9c4a26;
  --showcase-primary-bg: #3d2c1c;
  --showcase-primary-text: #fdf8f0;
  --showcase-secondary-bg: rgba(255, 252, 246, 0.72);
  --showcase-secondary-border: rgba(120, 92, 60, 0.32);
  --showcase-ground: rgba(140, 96, 52, 0.20);
  background: #fff;
}

.showcase-hero.dark {
  --showcase-text: #f6ede0;
  --showcase-text-muted: rgba(240, 224, 202, 0.72);
  --showcase-badge-bg: rgba(224, 164, 88, 0.16);
  --showcase-badge-border: rgba(224, 164, 88, 0.4);
  --showcase-badge-text: #f0c188;
  --showcase-primary-bg: #f5e7d2;
  --showcase-primary-text: #241a10;
  --showcase-secondary-bg: rgba(38, 28, 18, 0.5);
  --showcase-secondary-border: rgba(240, 214, 176, 0.32);
  --showcase-ground: rgba(0, 0, 0, 0.5);
  background:
    radial-gradient(120% 90% at 50% 0%, #221a12 0%, #1c1510 46%, #16100b 100%);
}

/* 设定集首屏使用纯白画布，让角色群像和标题成为唯一主视觉。 */
.showcase-hero.is-character-ring {
  --ring-base-h: clamp(150px, 18vw, 236px);
  min-height: clamp(650px, 84svh, 900px);
  padding-top: clamp(64px, 8vw, 104px);
  --showcase-text: #2c241a;
  --showcase-text-muted: rgba(78, 62, 44, 0.78);
  --showcase-badge-bg: rgba(217, 119, 66, 0.14);
  --showcase-badge-border: rgba(194, 96, 62, 0.32);
  --showcase-badge-text: #9c4a26;
  --showcase-primary-bg: #3d2c1c;
  --showcase-primary-text: #fdf8f0;
  --showcase-secondary-bg: rgba(255, 255, 255, 0.8);
  --showcase-secondary-border: rgba(120, 92, 60, 0.32);
  --showcase-ground: rgba(140, 96, 52, 0.2);
  background: #fff;
}
.showcase-hero.is-character-ring .showcase-content {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 40;
  width: min(560px, calc(100% - 40px));
  padding: 34px 28px 30px;
  border: 1px solid rgba(44, 36, 26, .12);
  border-radius: 22px;
  background: rgba(255, 255, 255, .9);
  box-shadow: none;
  transform: translate(-50%, -50%);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.showcase-hero.is-character-ring .showcase-stage {
  position: absolute;
  inset: 0;
  width: 100%;
  max-width: 1240px;
  height: 100%;
  margin: 0 auto;
}
.showcase-hero.is-character-ring .showcase-ground {
  display: none;
}
.showcase-hero.is-character-ring .showcase-ambient,
.showcase-hero.is-character-ring .showcase-character-shadow {
  display: none;
}
.showcase-hero.is-character-ring .showcase-book-position {
  display: none;
}
/* 群像环角色：坐标与缩放全部来自 JS 计算的 CSS 变量，横竖屏共用同一条规则。
   宽度 = 基准高 × 缩放 × 图片实测宽高比，显式声明以绕开 absolute shrink-to-fit
   对右侧角色的可用宽度挤压；配合 img max-width:none 防止全局规则把图压扁。 */
.showcase-hero.is-character-ring .showcase-cast .showcase-character {
  bottom: auto;
  left: var(--ring-x);
  top: var(--ring-y);
  height: calc(var(--ring-base-h) * var(--ring-scale, 1));
  width: calc(var(--ring-base-h) * var(--ring-scale, 1) * var(--ring-aspect, 0.583));
  transform: translate(-50%, -50%);
}
.showcase-hero.is-character-ring .showcase-cast .showcase-character-image {
  max-width: none;
}
.showcase-hero.is-character-ring.is-portrait {
  --ring-base-h: 136px;
}
.showcase-hero.is-character-ring .showcase-character-image {
  animation-name: showcaseRingCharacterIn;
}
.showcase-hero.is-character-ring .showcase-character {
  filter: none;
}
.showcase-hero.is-character-ring .showcase-character-image,
.showcase-hero.is-character-ring .showcase-character.is-depth-2 .showcase-character-image,
.showcase-hero.is-character-ring .showcase-character.is-depth-3 .showcase-character-image {
  filter: none;
}
@keyframes showcaseRingCharacterIn {
  from { opacity: 0; transform: translateY(22px) scale(.78); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ========== 氛围光斑 ========== */
.showcase-ambient {
  position: absolute;
  z-index: -1;
  border-radius: 50%;
  pointer-events: none;
}
.showcase-ambient-a {
  top: -18%;
  left: 8%;
  width: 44vw;
  height: 44vw;
  background: radial-gradient(circle, rgba(224, 138, 74, 0.16), transparent 68%);
}
.showcase-ambient-b {
  top: 4%;
  right: 2%;
  width: 36vw;
  height: 36vw;
  background: radial-gradient(circle, rgba(194, 96, 62, 0.12), transparent 66%);
}
.showcase-ambient-c {
  bottom: -12%;
  left: 24%;
  width: 40vw;
  height: 32vw;
  background: radial-gradient(circle, rgba(224, 164, 88, 0.1), transparent 70%);
}
.dark .showcase-ambient-a { background: radial-gradient(circle, rgba(255, 164, 74, 0.12), transparent 68%); }
.dark .showcase-ambient-b { background: radial-gradient(circle, rgba(214, 108, 60, 0.1), transparent 66%); }
.dark .showcase-ambient-c { background: radial-gradient(circle, rgba(255, 196, 110, 0.07), transparent 70%); }

/* ========== 飘落像素落叶 ========== */
.showcase-particles {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}
.showcase-leaf-fall {
  position: absolute;
  top: -6%;
  animation-name: showcaseLeafFall;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
.showcase-leaf-sway {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 2px;
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.12);
  animation-name: showcaseLeafSway;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  animation-direction: alternate;
}
@keyframes showcaseLeafFall {
  from { transform: translateY(-4vh) rotate(0deg); }
  to { transform: translateY(112vh) rotate(320deg); }
}
@keyframes showcaseLeafSway {
  from { transform: translateX(-16px) rotate(-28deg); }
  to { transform: translateX(16px) rotate(24deg); }
}
/* 预览容器内按容器高度落尘 */
.showcase-hero.is-preview .showcase-leaf-fall { animation-name: showcaseLeafFallPreview; }
@keyframes showcaseLeafFallPreview {
  from { transform: translateY(-10px) rotate(0deg); }
  to { transform: translateY(920px) rotate(320deg); }
}

/* ========== 文案区 ========== */
.showcase-content {
  position: relative;
  z-index: 40;
  width: min(100%, 860px);
}
.showcase-eyebrow-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.showcase-eyebrow {
  font-size: clamp(13px, 1.4vw, 16px);
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--showcase-text-muted);
}
.showcase-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border: 1px solid var(--showcase-badge-border);
  border-radius: 980px;
  background: var(--showcase-badge-bg);
  color: var(--showcase-badge-text);
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
.showcase-title {
  margin: 14px 0 0;
  font-size: clamp(42px, 5.4vw, 76px);
  font-weight: 750;
  line-height: 1.04;
  letter-spacing: -0.01em;
  text-wrap: balance;
  white-space: pre-line;
}
.showcase-subtitle {
  max-width: 640px;
  margin: 14px auto 0;
  color: var(--showcase-text-muted);
  font-size: clamp(15px, 1.8vw, 20px);
  font-weight: 450;
  line-height: 1.5;
}
.showcase-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-top: 24px;
}
.showcase-button {
  display: inline-flex;
  min-height: 46px;
  align-items: center;
  justify-content: center;
  padding: 0 24px;
  border: 1px solid var(--showcase-secondary-border);
  border-radius: 980px;
  color: var(--showcase-text);
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  line-height: 1;
  text-decoration: none;
  cursor: pointer;
  background: var(--showcase-secondary-bg);
  transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1), background-color 260ms ease, border-color 260ms ease;
}
.showcase-button.is-primary {
  border-color: transparent;
  color: var(--showcase-primary-text);
  background: var(--showcase-primary-bg);
  box-shadow: 0 12px 30px rgba(88, 58, 28, 0.22);
}
@media (hover: hover) {
  .showcase-button:hover { transform: translateY(-2px); }
  .showcase-button.is-primary:hover { filter: brightness(1.08); }
}
.showcase-button:active { transform: scale(0.97); }
.showcase-button:focus-visible {
  outline: 3px solid rgba(194, 96, 62, 0.7);
  outline-offset: 3px;
}

/* ========== 舞台 ========== */
.showcase-stage {
  position: relative;
  z-index: 1;
  flex: 1;
  width: 100%;
  max-width: 1180px;
  height: clamp(340px, calc(var(--hero-preview-height, 78svh) * 0.42), 520px);
  margin-top: clamp(8px, 1.6vw, 20px);
}
.showcase-ground {
  position: absolute;
  bottom: 2%;
  left: 50%;
  width: min(78%, 900px);
  height: 14px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(50% 50% at 50% 50%, var(--showcase-ground), transparent 72%);
}

/* 人物 */
.showcase-character {
  position: absolute;
  bottom: 4%;
  left: calc(50% + var(--char-offset, 0px));
  height: calc(58% * var(--char-scale, 1));
  transform: translateX(-50%);
}
.showcase-character-image {
  position: relative;
  display: block;
  height: 100%;
  width: auto;
  object-fit: contain;
  object-position: bottom center;
  animation: showcaseCharacterIn 0.85s cubic-bezier(0.34, 1.4, 0.44, 1) both;
  animation-delay: var(--char-delay, 300ms);
}
.showcase-character-shadow {
  position: absolute;
  bottom: -6px;
  left: 50%;
  width: 62%;
  height: 9px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(50% 50% at 50% 50%, var(--showcase-ground), transparent 74%);
}
.showcase-character.is-depth-2 .showcase-character-image { filter: brightness(0.96) saturate(0.95); }
.showcase-character.is-depth-3 .showcase-character-image {
  filter: brightness(0.87) saturate(0.9) blur(0.7px);
}
.showcase-character.is-depth-3 .showcase-character-shadow { opacity: 0.6; }
@keyframes showcaseCharacterIn {
  0% { opacity: 0; transform: translateY(30px) scale(calc(var(--char-scale, 1) * 0.72)); filter: blur(5px); }
  62% { opacity: 1; transform: translateY(-7px) scale(calc(var(--char-scale, 1) * 1.03)); filter: blur(0); }
  100% { opacity: 1; transform: translateY(0) scale(var(--char-scale, 1)); }
}

/* 立体书 */
.showcase-book-position {
  position: absolute;
  bottom: 3%;
  left: 50%;
  z-index: 24;
  height: 66%;
  transform: translateX(-50%);
  perspective: 1200px;
}
.showcase-book-tilt {
  height: 100%;
  transition: transform 480ms cubic-bezier(0.16, 1, 0.3, 1);
}
@media (hover: hover) {
  .showcase-hero:hover .showcase-book-tilt { transform: rotateY(4deg); }
}
.showcase-book-float {
  height: 100%;
  animation: showcaseBookFloat 6.5s ease-in-out infinite;
}
@keyframes showcaseBookFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-9px); }
}
.showcase-book {
  position: relative;
  height: 100%;
  aspect-ratio: 5 / 7.2;
  transform-style: preserve-3d;
  transform: rotateY(-16deg);
}
.book-pages {
  position: absolute;
  inset: 2.5% -9px 2% 8px;
  transform: translateZ(3px);
  border-radius: 4px 10px 10px 4px;
  background: repeating-linear-gradient(90deg, #f6efdd 0 3px, #e6dcc2 3px 5px);
  box-shadow: inset -2px 0 6px rgba(120, 92, 52, 0.28);
}
.book-cover {
  position: absolute;
  inset: 0;
  overflow: hidden;
  transform: translateZ(16px);
  border-radius: 7px 12px 12px 7px;
  background: linear-gradient(150deg, #e8945a, #c2603e 58%, #9c4a26);
  box-shadow:
    0 24px 46px rgba(74, 46, 20, 0.34),
    inset 0 1px 0 rgba(255, 255, 255, 0.32);
}
.book-cover-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
}
.book-cover-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  height: 100%;
  padding: 12%;
  color: #fdf6ea;
}
.book-cover-series {
  padding: 4px 12px;
  border: 1px solid rgba(253, 246, 234, 0.55);
  border-radius: 980px;
  font-size: clamp(10px, 1vw, 13px);
  font-weight: 600;
  letter-spacing: 0.32em;
  text-indent: 0.32em;
}
.book-cover-name {
  font-size: clamp(20px, 2.4vw, 34px);
  font-weight: 750;
  line-height: 1.24;
  text-wrap: balance;
}
.book-spine {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 13%;
  background: linear-gradient(90deg, rgba(30, 16, 6, 0.38), rgba(30, 16, 6, 0.06) 62%, transparent);
  pointer-events: none;
}
.book-gloss {
  position: absolute;
  inset: 0;
  background: linear-gradient(112deg, transparent 34%, rgba(255, 255, 255, 0.2) 46%, transparent 58%);
  pointer-events: none;
}
.showcase-book-shadow {
  position: absolute;
  bottom: -12px;
  left: 50%;
  width: 118%;
  height: 22px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(50% 50% at 50% 50%, var(--showcase-ground), transparent 72%);
  animation: showcaseBookShadowBreath 6.5s ease-in-out infinite;
}
@keyframes showcaseBookShadowBreath {
  0%, 100% { transform: translateX(-50%) scale(1); opacity: 1; }
  50% { transform: translateX(-50%) scale(0.92); opacity: 0.82; }
}

/* ========== 入场序列 ========== */
.showcase-eyebrow-row,
.showcase-title,
.showcase-subtitle,
.showcase-actions {
  animation: showcaseContentReveal 0.9s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.showcase-title { animation-delay: 80ms; }
.showcase-subtitle { animation-delay: 150ms; }
.showcase-actions { animation-delay: 220ms; }
@keyframes showcaseContentReveal {
  from { opacity: 0; transform: translateY(24px); filter: blur(6px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}

/* ========== 竖屏 / 移动端 ========== */
.showcase-hero.is-portrait {
  min-height: min(760px, calc(var(--hero-preview-height, 100svh) - 54px));
  padding: 48px 20px 0;
}

@media (max-width: 768px) {
  .showcase-hero.is-character-ring {
    --ring-base-h: 136px;
    min-height: min(820px, calc(100svh - 54px));
  }
  .showcase-hero.is-character-ring .showcase-content {
    top: auto;
    bottom: 4%;
    padding: 28px 18px 24px;
    transform: translateX(-50%);
  }
}
.showcase-hero.is-portrait .showcase-title { font-size: 38px; }
.showcase-hero.is-portrait .showcase-subtitle { font-size: 16px; }
.showcase-hero.is-portrait .showcase-stage {
  height: clamp(300px, calc(var(--hero-preview-height, 92svh) * 0.36), 400px);
}
.showcase-hero.is-portrait .showcase-character {
  height: calc(52% * var(--char-scale, 1));
}
@media (orientation: portrait) {
  /* 通用竖屏 stage 高度规则不能覆盖群像舞台，否则百分比坐标会被压缩到顶部。 */
  .showcase-hero.is-character-ring .showcase-stage {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
  }
  .showcase-hero.is-character-ring .showcase-content {
    top: auto;
    bottom: 4%;
    width: min(92%, 430px);
    transform: translateX(-50%);
  }
  .showcase-hero.is-character-ring .showcase-ground { bottom: 8%; }
}
@media (max-width: 768px) {
  .showcase-hero { padding: 48px 20px 0; }
  .showcase-title { font-size: 38px; }
  .showcase-subtitle { font-size: 16px; }
  .showcase-stage {
    height: clamp(300px, calc(var(--hero-preview-height, 92svh) * 0.36), 400px);
  }
  .showcase-character { height: calc(52% * var(--char-scale, 1)); }
  .showcase-ambient-c { display: none; }
}

/* ========== 管理台预览 ========== */
.showcase-hero.is-preview {
  padding: clamp(48px, 6cqw, 96px) clamp(20px, 5cqw, 88px) 0;
}
.showcase-hero.is-preview .showcase-title { font-size: clamp(42px, 5.4cqw, 76px); }
.showcase-hero.is-preview .showcase-subtitle { font-size: clamp(15px, 1.8cqw, 20px); }
.showcase-hero.is-preview .showcase-eyebrow { font-size: clamp(13px, 1.4cqw, 16px); }
.showcase-hero.is-preview .showcase-stage {
  height: clamp(340px, calc(var(--hero-preview-height, 900px) * 0.42), 520px);
}
.showcase-hero.is-preview.is-portrait .showcase-stage {
  height: clamp(300px, calc(var(--hero-preview-height, 844px) * 0.36), 400px);
}

/* ========== 无障碍：减少动态 ========== */
@media (prefers-reduced-motion: reduce) {
  .showcase-leaf-fall,
  .showcase-leaf-sway,
  .showcase-character-image,
  .showcase-book-float,
  .showcase-book-shadow,
  .showcase-eyebrow-row,
  .showcase-title,
  .showcase-subtitle,
  .showcase-actions { animation: none; }
  .showcase-button,
  .showcase-book-tilt { transition: none; }
}
</style>
