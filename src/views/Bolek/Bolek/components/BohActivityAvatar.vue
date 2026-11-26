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
import {
  createAvatarEngine,
  AVATAR_STATES,
  DEFAULT_STATE,
  STAGE_STATE,
} from './activity-avatar-engine.js';

const props = defineProps({
  /** BOH 活动阶段（activityStage），映射真源见 STAGE_STATE */
  stage: { type: String, default: '' },
  /**
   * 画布边长（px）。默认 32 = 活动行实尺。
   *
   * ⚠️ 这里给的是 **canvas 边长**，不是「方块头看起来多大」—— 引擎里
   * `R = size * 0.42`、方块头 `S = R * 1.8`，头只占画布 65% 左右，
   * 四周留白是给浮空位移与破裂粒子的。想在版面上呈现 N px 的头，
   * 传 `size ≈ N / 0.65`（登录页 96px 的头 ⇒ size 148）。
   */
  size: { type: Number, default: 32 },
  /** 固定状态（不跟随 stage）：登录页这类没有 BOH 阶段机的宿主用它钉住表情 */
  fixedState: { type: String, default: '' },
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

/** 状态真源优先级：fixedState（宿主钉死）> STAGE_STATE 映射 > idle */
const resolveState = (stage) => {
  if (props.fixedState && AVATAR_STATES[props.fixedState]) return props.fixedState;
  return STAGE_STATE[stage] || DEFAULT_STATE;
};

const mountEngine = async () => {
  await nextTick(); // v-if 翻真后这一拍 canvas 才在 DOM 里
  const el = canvasRef.value;
  if (!el || engine) return;
  engine = createAvatarEngine({
    canvas: el,
    size: props.size, // 2026-11-22 用户报「看不到表情」：28px 上眼/嘴格子太小，32px + 整格表情
    onState: (s) => {
      state.value = s; // 探针经 data-avatar-state 读
    },
  });
  engine.setState(resolveState(props.stage));
};

const unmountEngine = () => {
  engine?.destroy();
  engine = null;
};

const onMediaChangeHandler = () => onMediaChange();
const onStageChange = (stage) => {
  engine?.setState(resolveState(stage));
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

/* size 变化要重建引擎 —— canvas 的 width/height 是引擎在构造时一次性写死的，
   改 CSS 尺寸只会把已有像素拉伸（方块头会糊成马赛克而不是变大）。
   登录页在不同断点传不同 size（桌面 148 / 窄屏 116），必须走重建。 */
watch(
  () => props.size,
  () => {
    unmountEngine();
    if (!reduced.value) mountEngine();
  },
);

watch(
  () => props.fixedState,
  (fs) => {
    if (fs) engine?.setState(resolveState(props.stage));
  },
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
