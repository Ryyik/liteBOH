<template>
  <section ref="rootRef" class="gsh" aria-label="方块街开场">
    <!-- 场景是纯函数生成的像素画（见 halloween-scene.js），v-html 注入。
         内容全部来自本仓库模块，不含用户输入，所以不存在注入面。 -->
    <div class="gsh-scene" v-html="sceneSvg"></div>

    <div class="gsh-copy">
      <p v-if="config.eyebrow" class="gsh-eb">{{ config.eyebrow }}</p>
      <p
        v-for="(line, index) in titleLines"
        :key="`t-${index}`"
        class="gsh-title"
        :style="titleStyle"
      >{{ line }}</p>
      <div v-if="titleLines.length" class="gsh-rule" aria-hidden="true">
        <i></i><i></i><i></i>
      </div>
      <p v-if="config.subtitle" class="gsh-sub">{{ config.subtitle }}</p>
    </div>

    <!-- 主 CTA：data-gate-cta 是给首页手势用的白名单标记 ——
         .home-gate 上的 pointerdown 会跳过它，否则点按钮会被当成上滑起手。 -->
    <button
      v-if="ctaText"
      class="gsh-cta"
      type="button"
      data-gate-cta
      @click.stop="$emit('cta')"
    >
      {{ ctaText }}<span class="gsh-cta-ar">→</span>
    </button>

    <div class="gsh-hint" aria-hidden="true">
      <span>{{ hintText }}</span>
      <span class="gsh-ar">↓</span>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  buildHalloweenSceneSvg,
  SCENE_HEIGHT,
  SCENE_MIN_WIDTH,
  SCENE_MAX_WIDTH,
} from './halloween-scene.js';

/* 万圣夜开屏（活动期临时形态）
   数据来自 home_gate_config 单行表，由 /admin/gate-console 管理。
   本组件只负责「画」和「把 CTA 事件抛给宿主」，不碰路由、不碰手势 ——
   拖拽进度 --gate-p 由首页 .home 注入，这里只消费（提示的淡出用它派生）。 */

const props = defineProps({
  /** normalizeGateConfig() 的产物；缺字段一律按空处理 */
  config: { type: Object, default: () => ({}) },
});

defineEmits(['cta']);

/* ---------- 场景宽度自适应 ----------
   画布高度恒为 212 格，宽度按容器宽高比算 —— 竖屏 126、横屏会更宽。
   这样横屏不会把一张竖版画硬拉变形，也不会只剩中间一条。
   只在比例变化超过 6% 时重算：重算要重新生成两千多个 rect。 */
const aspect = ref(SCENE_MIN_WIDTH / SCENE_HEIGHT);
let resizeObserver = null;
let resizeTimer = 0;

const sceneWidth = computed(() => {
  const raw = Math.round(SCENE_HEIGHT * aspect.value);
  return Math.min(SCENE_MAX_WIDTH, Math.max(SCENE_MIN_WIDTH, raw));
});

const sceneSvg = computed(() => buildHalloweenSceneSvg({ width: sceneWidth.value }));

const rootRef = ref(null);

const measure = () => {
  const el = rootRef.value;
  if (!el) return;
  const width = el.clientWidth;
  const height = el.clientHeight;
  if (!width || !height) return;
  const next = width / height;
  if (Math.abs(next - aspect.value) / aspect.value < 0.06) return;
  aspect.value = next;
};

const scheduleMeasure = () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(measure, 160);
};

/* ---------- 文案 ---------- */
const titleLines = computed(() => {
  const raw = String(props.config?.title || '').trim();
  if (!raw) return [];
  /* 有逗号就在逗号后断行 —— 中文句子在标点处断，比按字数硬切好看得多。
     「万圣节，来方块街有惊喜」→ 两行。 */
  const comma = raw.match(/^(.{1,14}[，,])(.+)$/);
  if (comma) return [comma[1], comma[2]];
  if (raw.length <= 9) return [raw];
  const mid = Math.ceil(raw.length / 2);
  return [raw.slice(0, mid), raw.slice(mid)];
});

const titleStyle = computed(() => {
  const longest = titleLines.value.reduce((max, line) => Math.max(max, line.length), 0);
  let size = 34;
  if (longest > 6) size = 30;
  if (longest > 8) size = 26;
  if (longest > 11) size = 22;
  /* 走自定义属性而不是直接写 font-size：横屏那条媒体查询要用 min() 压一档。
     内联 font-size 的优先级只有「强制标记」能压，而本仓库对它是棘轮。 */
  return { '--gsh-title-size': `${size}px` };
});

const ctaText = computed(() => String(props.config?.cta_text || '').trim());
const hintText = computed(() => String(props.config?.hint_text || '').trim() || '或上滑进入方块街');

onMounted(() => {
  measure();
  if (typeof ResizeObserver === 'function' && rootRef.value) {
    resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(rootRef.value);
  }
});

onBeforeUnmount(() => {
  window.clearTimeout(resizeTimer);
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});
</script>

<style scoped>
.gsh {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* SVG 没画出来时的兜底底色（与场景夜空同色，不会白屏） */
  background-color: #0a0614;
  isolation: isolate;
  /* 横屏适配按「容器」而不是「视口」判断 —— 管理台的预览是竖屏手机框，
     但它待在横屏的浏览器窗口里，用 @media (orientation) 会把预览也改成横屏版式。 */
  container-type: size;
  container-name: gatescene;
}

.gsh-scene {
  position: absolute;
  inset: 0;
  /* 场景只是背景：手势必须穿到 .home-gate 上，否则跟手拖拽会断 */
  pointer-events: none;
}

.gsh-scene :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}

.gsh-copy {
  position: absolute;
  left: 26px;
  right: 26px;
  /* 顶部避让吃 --userspace-nav-h（导航栏实测高度，由首页的 ResizeObserver 写入）——
     竖屏是居中胶囊、横屏是全宽横条，写死一个值必然一头空一头盖。 */
  top: max(84px, calc(var(--userspace-nav-h, 78px) + 16px));
  pointer-events: none;
}

.gsh-eb {
  margin: 0 0 16px;
  font-size: 10px;
  letter-spacing: 0.28em;
  color: #e9a15c;
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.45);
}

.gsh-title {
  margin: 0;
  font-size: var(--gsh-title-size, 34px);
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: 0.1em;
  color: #fff1dc;
  text-shadow: 3px 3px 0 rgba(12, 4, 18, 0.62);
  word-break: break-word;
}

.gsh-rule {
  display: flex;
  gap: 4px;
  margin: 18px 0 12px;
}

.gsh-rule i {
  display: block;
  width: 6px;
  height: 6px;
  background: #e9a15c;
}

.gsh-rule i:nth-child(2) {
  opacity: 0.55;
}

.gsh-rule i:nth-child(3) {
  opacity: 0.28;
}

.gsh-sub {
  margin: 0;
  font-size: 11px;
  line-height: 1.7;
  letter-spacing: 0.06em;
  color: rgba(255, 241, 220, 0.66);
}

/* 主 CTA：切角像素按钮。clip-path 切掉四角，drop-shadow 沿切角形状走 ——
   用 box-shadow 会被 clip-path 一起裁掉。 */
.gsh-cta {
  position: absolute;
  left: 26px;
  bottom: 86px;
  height: 48px;
  padding: 0 26px;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  border: 0;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #2b1505;
  background: #ffb35c;
  clip-path: polygon(
    8px 0, calc(100% - 8px) 0, calc(100% - 8px) 4px, 100% 4px,
    100% calc(100% - 4px), calc(100% - 8px) calc(100% - 4px),
    calc(100% - 8px) 100%, 8px 100%, 8px calc(100% - 4px),
    0 calc(100% - 4px), 0 4px, 8px 4px
  );
  filter: drop-shadow(4px 4px 0 rgba(8, 2, 14, 0.55));
  transition: transform 0.12s steps(2, end);
}

.gsh-cta:active {
  transform: translate(2px, 2px);
}

.gsh-cta-ar {
  font-size: 15px;
  letter-spacing: 0;
}

.gsh-hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 40px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  letter-spacing: 0.1em;
  color: rgba(255, 241, 220, 0.58);
  pointer-events: none;
  /* 提示的淡出直接由跟手进度派生（p≈0.45 完全消失），不额外维护 JS 状态 */
  opacity: calc(1 - var(--gate-p, 0) * 2.2);
}

.gsh-ar {
  display: inline-block;
  animation: gshBreath 2s steps(2, end) infinite;
}

@keyframes gshBreath {
  0%,
  100% {
    transform: translateY(0);
    opacity: 0.55;
  }
  50% {
    transform: translateY(3px);
    opacity: 1;
  }
}

/* 横屏（按容器宽高比判定）：可用高度只有 390~430px，文案与按钮整体上收，标题降一档 */
@container gatescene (min-aspect-ratio: 1/1) {
  .gsh-copy {
    /* 横屏导航是全宽横条，同样要吃实测高度，否则小标被压进导航底下 */
    top: max(64px, calc(var(--userspace-nav-h, 60px) + 12px));
    left: 32px;
    right: auto;
    max-width: 46%;
  }

  .gsh-eb {
    margin-bottom: 10px;
  }

  .gsh-title {
    font-size: min(var(--gsh-title-size, 34px), 26px);
  }

  .gsh-rule {
    margin: 12px 0 8px;
  }

  .gsh-cta {
    left: 32px;
    bottom: 62px;
    height: 44px;
  }

  .gsh-hint {
    bottom: 26px;
    justify-content: flex-start;
    padding-left: 32px;
  }
}

/* 矮容器（横屏手机 / 分屏）：同样收一档，规则与上面一致，只是触发条件不同 */
@container gatescene (max-height: 560px) {
  .gsh-copy {
    top: max(64px, calc(var(--userspace-nav-h, 60px) + 12px));
  }

  .gsh-cta {
    bottom: 62px;
    height: 44px;
  }

  .gsh-hint {
    bottom: 26px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .gsh-ar {
    animation: none;
  }

  .gsh-cta {
    transition: none;
  }
}
</style>
