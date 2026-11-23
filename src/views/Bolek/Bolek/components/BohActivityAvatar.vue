<template>
  <!-- 2026-11-21 用户口径：活动行等待动画 = Grok 式角色状态机（MC 方块皮肤，纯黑白）。
       状态由 activityStage 经 STAGE_STATE 映射喂入（真源在 activity-avatar-engine.js）；
       文字不承担状态表达（Grok 的教训：三点分不清工作/卡住），保持普通文本。
       颜色恒定（黑身白五官，不随主题反转 —— 2026-11-22 口径「表情应该是白色的」）。
       reduced-motion（系统档）或「界面动效」开关（站点档）关闭时**整块退场**：
       v-if 摘掉 canvas（不是 v-show —— 摘掉后 rAF 也一起停，不留空转）。
       data-avatar-state 供探针锁「阶段 → 状态」映射（probe-bolek-search-status A4）。 -->
  <canvas
    v-if="!reduced"
    ref="canvasRef"
    class="boh-avatar"
    :data-avatar-state="state"
    aria-hidden="true"
  ></canvas>
</template>

<script setup>
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch,
} from 'vue';
import { useGlobalAiPreferences } from '@/composables/useGlobalAiPreferences.js';
import { createAvatarEngine, DEFAULT_STATE, STAGE_STATE } from './activity-avatar-engine.js';

const props = defineProps({
  /** BOH 活动阶段（activityStage），映射真源见 STAGE_STATE */
  stage: { type: String, default: '' },
});

const canvasRef = ref(null);
const state = ref(DEFAULT_STATE);
const systemReduced = ref(false);
const { preferences } = useGlobalAiPreferences();
const reduced = computed(() => systemReduced.value || preferences.animationsEnabled === false);

let engine = null;
let media = null;

const onMediaChange = () => {
  systemReduced.value = Boolean(media?.matches);
};

const mountEngine = async () => {
  await nextTick(); // v-if 翻真后这一拍 canvas 才在 DOM 里
  const el = canvasRef.value;
  if (!el || engine) return;
  engine = createAvatarEngine({
    canvas: el,
    size: 32, // 2026-11-22 用户报「看不到表情」：28px 上眼/嘴格子太小，32px + 整格表情
    onState: (s) => {
      state.value = s; // 探针经 data-avatar-state 读
    },
  });
  engine.setState(STAGE_STATE[props.stage] || DEFAULT_STATE);
};

const unmountEngine = () => {
  engine?.destroy();
  engine = null;
};

const onMediaChangeHandler = () => onMediaChange();
const onStageChange = (stage) => {
  engine?.setState(STAGE_STATE[stage] || DEFAULT_STATE);
};

onMounted(() => {
  media = window.matchMedia('(prefers-reduced-motion: reduce)');
  systemReduced.value = Boolean(media.matches);
  media.addEventListener('change', onMediaChangeHandler);
  if (!reduced.value) mountEngine();
});

watch(reduced, (next) => {
  if (next) unmountEngine();
  else mountEngine();
});

watch(
  () => props.stage,
  (stage) => onStageChange(stage),
);

/* BOH 页是 keep-alive 路由：切走时组件只是失活、不会卸载 —— 必须显式停 rAF，切回再续。
   不停的话后台每帧都在画一块看不见的 canvas（实测过的白丢电）。 */
onDeactivated(() => engine?.pause());
onActivated(() => engine?.resume());

onBeforeUnmount(() => {
  media?.removeEventListener('change', onMediaChangeHandler);
  unmountEngine();
});
</script>
