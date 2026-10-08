<script setup>
/**
 * 装置舞台 —— 按 kind 渲染八类机制的交互区
 *
 * 视觉改动（P0-6）：原来 `.bean-hopper` / `.voxel-kettle` 等全是 div 拼的方块，
 * 在 128px 宽的格子里必然糊成一团彩色竖条；现在改成**内联 SVG**（矢量、任意尺寸清晰、
 * 能做帧动画），风格与背景统一为像素方块语言。
 *
 * 交互约定：
 *  - oscillating / staged / texture / layer：pointerdown 起、pointerup 结束（按住型）
 *  - swirl / trace：pointerdown + pointermove 采样轨迹，pointerup 提交
 *  - timed / sequenced：点按钮投料
 */
import { computed } from 'vue';
import { Snowflake, Wind } from 'lucide-vue-next';
import { STEP_DEFINITIONS } from '@/games/cafe/core/steps.js';
import { latteGuideY } from '@/games/cafe/core/engine.js';

const props = defineProps({
  stepId: { type: String, default: null },
  state: { type: Object, required: true },
  holding: { type: Boolean, default: false },
  interactive: { type: Boolean, default: false },
  canServe: { type: Boolean, default: false },
});

const emit = defineEmits(['pointer-down', 'pointer-move', 'pointer-up', 'dose', 'vent']);

const def = computed(() => (props.stepId ? STEP_DEFINITIONS[props.stepId] : null));
const kind = computed(() => def.value?.kind || 'serve');

/** 分层机制的液面高度（%）/ 拉花进度 —— 模板里直接用 */
const layerLevel = computed(() => `${Math.min(92, props.state.levelHeight || 0)}%`);
const traceProgress = computed(() => Math.min(100, props.state.progress || 0));

/** 拉花的引导线转成 SVG path（viewBox 0 0 100 100） */
const guidePath = computed(() => {
  const points = [];
  for (let i = 0; i <= 40; i += 1) {
    const x = i / 40;
    points.push(
      `${i === 0 ? 'M' : 'L'}${(x * 100).toFixed(2)} ${(latteGuideY(x) * 100).toFixed(2)}`,
    );
  }
  return points.join(' ');
});

const trailDots = computed(() =>
  (props.state.trail || []).map((point) => ({ left: `${point.x}%`, top: `${point.y}%` })),
);

/** 读数条标签：把「当前机制要求什么」直接写出来（P0-3：金区可见可学） */
const READOUT_LABELS = {
  oscillate: '转速',
  staged: '萃取进度',
  swirl: '水量',
  texture: '进气量',
  layer: '液面',
  timed: '冰块',
  sequenced: '份量',
  trace: '融合度',
};

const readoutLabel = computed(() => READOUT_LABELS[kind.value] || '进度');

const valuePercent = computed(() => {
  if (kind.value === 'trace') return props.state.progress || 0;
  return Math.min(100, props.state.value || 0);
});

const windowStyle = computed(() => {
  if (!props.state.window) return { display: 'none' };
  const [start, end] = props.state.window;
  return { left: `${start}%`, width: `${Math.max(2, end - start)}%` };
});
</script>

<template>
  <div
    class="cafe-stage-station"
    :class="[`kind-${kind}`, { holding, interactive, 'can-serve': canServe }]"
  >
    <!-- ── 研磨：料斗 + 磨盘 + 粉柱 ── -->
    <svg v-if="kind === 'oscillate'" class="station-art" viewBox="0 0 100 100" aria-hidden="true">
      <rect class="art-wood" x="26" y="14" width="48" height="12" rx="2" />
      <rect class="art-metal" x="34" y="26" width="32" height="18" rx="2" />
      <rect class="art-glass" x="30" y="4" width="40" height="12" rx="2" />
      <g class="art-beans" :class="{ falling: holding }">
        <rect class="art-bean" x="40" y="8" width="6" height="5" rx="2" />
        <rect class="art-bean" x="50" y="6" width="6" height="5" rx="2" />
        <rect class="art-bean" x="58" y="9" width="6" height="5" rx="2" />
      </g>
      <circle
        class="art-disc"
        cx="50"
        cy="52"
        r="15"
        :style="{ transform: `rotate(${state.value * 3.6}deg)` }"
      />
      <rect class="art-metal" x="30" y="70" width="40" height="9" rx="2" />
      <rect
        class="art-grounds"
        x="42"
        y="79"
        width="16"
        height="18"
        rx="2"
        :style="{ height: `${8 + (state.value / 100) * 12}px` }"
      />
      <rect v-if="state.overheated" class="art-steam" x="44" y="58" width="4" height="8" rx="2" />
      <rect
        v-else-if="state.overheated === false && state.stable"
        class="art-ok"
        x="44"
        y="60"
        width="12"
        height="4"
        rx="1"
      />
    </svg>

    <!-- ── 萃取：压力表 + 三段刻度 + 排气阀 ── -->
    <svg v-else-if="kind === 'staged'" class="station-art" viewBox="0 0 100 100" aria-hidden="true">
      <rect class="art-metal" x="22" y="26" width="56" height="26" rx="3" />
      <rect class="art-dark" x="28" y="32" width="44" height="14" rx="2" />
      <circle class="art-gauge" cx="40" cy="39" r="7" />
      <path
        class="art-needle"
        :style="{
          transform: `rotate(${-120 + state.value * 2.4}deg)`,
          transformOrigin: '40px 39px',
        }"
        d="M40 39L40 33"
      />
      <rect class="art-stage" x="28" y="52" width="44" height="5" rx="1" />
      <rect
        class="art-fill"
        x="28"
        y="52"
        width="44"
        height="5"
        rx="1"
        :style="{ transform: `scaleX(${state.value / 100})`, transformOrigin: '28px 54.5px' }"
      />
      <rect class="art-stage" x="28" y="60" width="44" height="5" rx="1" />
      <rect
        class="art-fill"
        x="28"
        y="60"
        width="44"
        height="5"
        rx="1"
        :style="{
          transform: `scaleX(${Math.max(0, (state.value - 28) / 28)} )`,
          transformOrigin: '28px 62.5px',
        }"
      />
      <rect class="art-stage" x="28" y="68" width="44" height="5" rx="1" />
      <rect
        class="art-fill"
        x="28"
        y="68"
        width="44"
        height="5"
        rx="1"
        :style="{
          transform: `scaleX(${Math.max(0, (state.value - 56) / 38)})`,
          transformOrigin: '28px 70.5px',
        }"
      />
      <rect
        v-if="state.ventedAt >= 0"
        class="art-vented"
        x="28"
        y="78"
        width="44"
        height="4"
        rx="2"
      />
      <rect
        v-else-if="state.missedVent"
        class="art-warn"
        x="28"
        y="78"
        width="44"
        height="4"
        rx="2"
      />
    </svg>

    <!-- ── 注水 swirl / 分层 layer：水壶 + 杯 + 轨迹环 ── -->
    <svg
      v-else-if="kind === 'swirl' || kind === 'layer'"
      class="station-art"
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <circle class="art-guide" cx="50" cy="50" r="30" />
      <path
        v-if="kind === 'swirl'"
        class="art-arc"
        :style="{ strokeDashoffset: 300 - Math.min(300, state.accumulatedAngle || 0) }"
        d="M50 20 A30 30 0 1 1 49.9 20"
      />
      <g
        class="art-kettle"
        :style="{
          transform: `translate(${50 - Math.cos(state.lastAngle || 0) * 30}px, ${50 - Math.sin(state.lastAngle || 0) * 30}px)`,
        }"
      >
        <rect class="art-metal" x="-6" y="-4" width="12" height="10" rx="2" />
        <rect class="art-water" x="-2" y="6" width="4" height="12" />
      </g>
      <rect class="art-glass" x="36" y="34" width="28" height="42" rx="3" />
      <rect
        v-if="kind === 'layer'"
        class="art-milk"
        x="38"
        y="34"
        width="24"
        :style="{ height: layerLevel, top: `${100 - parseFloat(layerLevel)}%` }"
      />
    </svg>

    <!-- ── 奶泡 texture：奶缸 + 进气量 + 蒸汽棒 ── -->
    <svg
      v-else-if="kind === 'texture'"
      class="station-art"
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <rect class="art-metal" x="46" y="8" width="3" height="30" rx="1" />
      <rect
        class="art-steam"
        x="44"
        y="36"
        width="7"
        height="6"
        rx="2"
        :style="{ opacity: holding ? 1 : 0.25 }"
      />
      <rect class="art-pitcher" x="32" y="40" width="36" height="46" rx="4" />
      <rect class="art-milk" x="35" y="43" width="30" height="40" rx="3" />
      <rect
        class="art-foam"
        x="35"
        y="43"
        width="30"
        :height="Math.max(0, 40 * (1 - state.value / 100))"
        rx="3"
      />
      <rect class="art-marker" x="30" y="46" width="3" height="6" rx="1" />
      <rect class="art-marker" x="30" y="58" width="3" height="6" rx="1" />
      <rect class="art-marker" x="30" y="70" width="3" height="6" rx="1" />
    </svg>

    <!-- ── 投料timed / sequenced：瓶 + 泵 + 份量格 ── -->
    <svg
      v-else-if="kind === 'timed' || kind === 'sequenced'"
      class="station-art"
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <rect
        class="art-bottle"
        x="30"
        y="14"
        width="24"
        height="40"
        rx="4"
        :style="{ '--dose-color': def?.color || '#c8a27a' }"
      />
      <rect class="art-metal" x="24" y="54" width="36" height="8" rx="2" />
      <rect class="art-glass" x="32" y="66" width="36" height="30" rx="3" />
      <g class="art-doses">
        <rect
          v-for="n in def?.targetCount || 1"
          :key="n"
          class="art-dose"
          :class="{ filled: n <= (state.added || 0) }"
          :x="36 + (n - 1) * 10"
          y="76"
          width="7"
          height="14"
          rx="2"
        />
      </g>
      <g v-if="kind === 'timed'" class="art-ice" :class="{ melting: holding }">
        <rect
          v-for="n in state.added || 0"
          :key="`i${n}`"
          class="art-cube"
          :x="38 + n * 7"
          y="70"
          width="6"
          height="6"
          rx="1"
        />
        <rect v-if="state.added" class="art-melt" x="36" y="86" width="28" height="3" rx="1" />
      </g>
    </svg>

    <!-- ── 拉花 trace：引导心形 + 玩家轨迹 + 落点 ── -->
    <svg v-else-if="kind === 'trace'" class="station-art" viewBox="0 0 100 100" aria-hidden="true">
      <path class="art-guide-line" :d="guidePath" />
      <path
        class="art-progress-line"
        :d="guidePath"
        :style="{ strokeDashoffset: 300 - (traceProgress / 100) * 300 }"
      />
      <circle
        v-for="(dot, index) in trailDots"
        :key="index"
        class="art-trail-dot"
        :cx="dot.left"
        :cy="dot.top"
        r="1.6"
      />
      <circle class="art-cup" cx="50" cy="50" r="34" />
    </svg>

    <!-- ── 出杯态 ── -->
    <div v-else class="station-serve">
      <Snowflake :size="30" />
      <span>这一杯做完了</span>
    </div>

    <!-- ⚠️ 排气阀必须放在 <svg> **外面**。
     首版把它写在了 `<svg class="station-art">` 内部当子节点 ——
     浏览器不会在 SVG 里渲染 HTML 按钮（getBoundingClientRect 全是 0、
     Playwright 报 "element is not visible"），玩家根本点不到。
     机制本身却能正常推进（stage 变了）⇒ 这种「逻辑对、UI 死」的 bug 单测抓不到。 -->
    <button
      v-if="kind === 'staged' && state.stage === 1 && state.ventedAt < 0"
      type="button"
      class="vent-valve"
      aria-label="排气阀：按一次排出中段蒸汽"
      @pointerdown.stop.prevent="emit('vent')"
    >
      <Wind :size="13" />排气
    </button>

    <!-- 通用读数条：把「当前机制要求什么」直接画出来（P0-3：金区可见可学） -->
    <div class="station-readout" :class="`state-${state.status}`">
      <span class="readout-label">{{ readoutLabel }}</span>
      <div class="readout-track">
        <i class="readout-window" :style="windowStyle" />
        <b class="readout-value" :style="{ left: `${valuePercent}%` }" />
      </div>
      <span v-if="state.message" class="readout-message">{{ state.message }}</span>
    </div>
  </div>
</template>
