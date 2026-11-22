<template>
  <div
    v-show="visible"
    ref="wrapRef"
    class="boh-pet-block"
    :class="[
      modeClass,
      {
        'is-revealed': revealed,
        'is-dragging': dragging,
        'is-sleep': sleeping,
        'is-petting': petting,
        'is-flash': flashing,
        'is-lift': dragging,
        'is-jump': actId === 'hop',
        'is-stretch': actId === 'doze-stretch',
        'is-shake': actId === 'doze-shake',
        'is-look': actId === 'look',
      },
    ]"
    :style="wrapStyle"
    role="button"
    tabindex="0"
    aria-label="小方 · BOH AI 助手（点击开始对话，拖动移动，右键回默认位）"
    :data-pet-state="state"
    :data-pet-edge="edge || 'float'"
    @pointerenter="onEnter"
    @pointerleave="onLeave"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onCancel"
    @contextmenu.prevent="resetToDefaultEdge"
    @keydown.enter.prevent="openChat"
    @keydown.space.prevent="openChat"
  >
    <canvas ref="canvasRef" class="boh-pet-canvas" :style="canvasStyle" aria-hidden="true"></canvas>
    <span v-if="sleeping" class="boh-pet-zzz" aria-hidden="true">z</span>
  </div>
</template>

<script setup>
/**
 * BohPetBlock —— 全局挂件「小方」（2026-11-22 用户口径；P1.0 全功能版）。
 *
 * BOHAI 的具象化身：贴边探头（四向）、全屏自由拖动 + 抛掷惯性 + 边缘反弹、
 * 长按摸头、眼神跟随、导演器自主动作（boh-pet-acts.js 调度真源）、
 * BOHAI 忙闲全局同步（boh-pet-bus）、睡觉、点击唤起全站唯一 AI 岛（askDirect）。
 *
 * 交互判据（指针）：
 *   · 位移 ≤4px 且时长 <350ms ⇒ 单击 → 开对话岛
 *   · 按住 ≥350ms 且未位移 ⇒ 摸头（笑眼 ⌣ + 爆粒 + 软压扁），松手回当前状态
 *   · 位移 >4px ⇒ 拖拽（全向跟手，拿起 scale 1.06 + 阴影加深）
 *   · 松手：近边缘 ≤56px → 吸附贴边探头（四向）；屏幕中间 → 原地漂浮；带速度 → 惯性滑行
 *   · 右键（contextmenu）→ 回默认右缘位（浮空找不回时的兜底通道）
 *
 * 纪律：纯黑白恒定色（黑身白五官不随主题反转）；z 59（抽屉 45 之上 /
 * 导航 9999 与岛 10001 之下）；reduce-motion 全禁（静帧）；
 * 输入框聚焦时导演静默；页面隐藏引擎 pause（功耗纪律）。
 */

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useBohIsland } from '@/composables/useBohIsland.js';
import {
  createAvatarEngine,
  DEFAULT_STATE,
  STAGE_STATE,
} from '@/views/BOHAI/BOHAI/components/activity-avatar-engine.js';
import { petStage } from '@/utils/boh-pet-bus.js';
import { DIRECTOR_TICK_MS, pickPetAct } from '@/utils/boh-pet-acts.js';

const SIZE = 64; // 画布边长；探头宽 = SIZE/2 ⇒ 头中线落在屏幕缘（露半张脸且贴边）
const SNAP_DIST = 56; // 吸附判定：中心距边缘 ≤ 此值 → 贴边探头
const LONGPRESS_MS = 350; // 摸头长按阈值
const SLEEP_AFTER_MS = 30000; // 闲置睡眠阈值
const POS_KEY = 'boh_pet_block_pos';
const LEGACY_POS_KEY = 'boh_pet_block_y'; // 旧版单一 y 记忆（一次性迁移）

const route = useRoute();
const bohIsland = useBohIsland();

const wrapRef = ref(null);
const canvasRef = ref(null);
const state = ref(DEFAULT_STATE);
const edge = ref('right'); // null = 浮空
const pos = ref({ x: 0, y: 0 });
const revealed = ref(false);
const dragging = ref(false);
const petting = ref(false);
const sleeping = ref(false);
const flashing = ref(false);
const mood = ref(60); // 0~100：高 = 活泼动作权重高
const actId = ref(null); // 当前自主动作 id（驱动 CSS 表演类）
const homeGate = ref(false);
const portrait = ref(
  typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches,
);
const vpTick = ref(0); // 视口尺寸变化的响应式信号（geometry 依赖它重算）

const reduced = computed(
  () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
);

/* 隐藏口径与 BohIsland canOpen 同构：/ai-chat 有活动行本体；开场画层叠会错位 */
const visible = computed(() => route.name !== 'AiChat' && !homeGate.value);

/* ── 几何 ─────────────────────────────────────────────────────── */
const peekW = computed(() => Math.round((SIZE / 2) * (portrait.value ? 0.8 : 1)));
const dragBottomPad = computed(() => (portrait.value ? 120 : 16)); // 竖屏避底栏
const bottomPeekPad = computed(() => (portrait.value ? 112 : 8)); // 底缘探头的 y 偏移

const clampX = (x) => Math.min(Math.max(4, x), Math.max(4, window.innerWidth - SIZE - 4));
const clampY = (y) =>
  Math.min(Math.max(8, y), Math.max(8, window.innerHeight - dragBottomPad.value - SIZE));

const isEdge = computed(() => edge.value !== null);
const modeClass = computed(() => (edge.value ? `is-edge-${edge.value}` : 'is-floating'));

/* 包裹盒几何：拖拽/浮空 = 全尺寸；贴边 = 单边收窄（露出朝向页面内容的那一面）；
   hover（revealed）/ 摸头（petting）= 探出全身（包裹盒往视口内收一格） */
const wrapStyle = computed(() => {
  void vpTick.value; // 视口尺寸变化信号（resize 时 +1 触发重算）
  const W = window.innerWidth;
  const H = window.innerHeight;
  const full = dragging.value || !isEdge.value || revealed.value || petting.value;
  let w = SIZE;
  let h = SIZE;
  let x = pos.value.x;
  let y = pos.value.y;
  if (!full) {
    if (edge.value === 'left' || edge.value === 'right') w = peekW.value;
    else h = peekW.value;
  }
  if (full && edge.value === 'right') x = W - SIZE;
  if (full && edge.value === 'bottom') y = H - bottomPeekPad.value - SIZE;
  return {
    left: `${Math.round(x)}px`,
    top: `${Math.round(y)}px`,
    width: `${w}px`,
    height: `${h}px`,
  };
});

/* canvas 在容器内的偏移：贴边探出 = 只露「朝向页面内容」的那一面
   right 缘露左侧（canvas 0,0）/ left 缘露右侧 / top 缘露下侧 / bottom 缘露上侧 */
const canvasStyle = computed(() => {
  void vpTick.value;
  const full = dragging.value || !isEdge.value || revealed.value || petting.value;
  if (full) return { left: '0px', top: '0px' };
  if (edge.value === 'left') return { left: `${-(SIZE - peekW.value)}px`, top: '0px' };
  if (edge.value === 'top') return { left: '0px', top: `${-(SIZE - peekW.value)}px` };
  return { left: '0px', top: '0px' };
});

/* ── 位置存储（v2：{x,y}；v1 boh_pet_block_y 一次性迁移）──────────────── */
function readStoredPos() {
  /* 不变量：横向位置 x 由 (edge, y) 推导，**永不信任存储的 x** ——
     2026-11-22 用户报障根因：旧实现把「旧 edge + 页面中间的 x」一起存，
     reload 后按 stale edge 渲染出悬在半空的半脸细条。左/右缘的 x 恒等于贴边位，
     上/下缘保留存储 x（水平位置用户可自选）。y 只做钳制。 */
  const edgeX = (e) => (e === 'left' ? 0 : window.innerWidth - peekW.value);
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (
        v &&
        (v.edge === 'left' || v.edge === 'right' || v.edge === 'top' || v.edge === 'bottom')
      ) {
        const y = clampY(Number(v.y) || Math.round(window.innerHeight * 0.38));
        const x =
          v.edge === 'left'
            ? 0
            : v.edge === 'right'
              ? edgeX('right')
              : clampX(Number(v.x) || window.innerWidth / 2);
        return { pos: { x, y }, edge: v.edge };
      }
    }
    const legacy = Number(localStorage.getItem(LEGACY_POS_KEY));
    if (Number.isFinite(legacy) && legacy > 0) {
      return { pos: { x: window.innerWidth - peekW.value, y: clampY(legacy) }, edge: 'right' };
    }
  } catch {
    /* 隐私模式读不到就用默认值 */
  }
  return {
    pos: { x: window.innerWidth - peekW.value, y: Math.round(window.innerHeight * 0.38) },
    edge: 'right',
  };
}

function savePos() {
  try {
    localStorage.setItem(
      POS_KEY,
      JSON.stringify({ x: Math.round(pos.value.x), y: Math.round(pos.value.y), edge: edge.value }),
    );
  } catch {
    /* 隐私模式存不了就当会话级记忆 */
  }
}

function resetToDefaultEdge() {
  pos.value = {
    x: window.innerWidth - peekW.value,
    y: clampY(Math.round(window.innerHeight * 0.38)),
  };
  edge.value = 'right';
  savePos();
}

/* ── 指针交互 ─────────────────────────────────────────────────────── */
let engine = null;
let pressed = false;
let moved = false;
let downX = 0;
let downY = 0;
let grab = { dx: 0, dy: 0 };
let longTimer = 0;
let sleepTimer = 0;
let gatePoll = 0;

function wake() {
  if (sleeping.value) {
    sleeping.value = false;
    applyStage();
  }
  resetSleepTimer();
}

/* 睡眠排程：BOHAI 闲置 + 未交互 30s → sleeping（任意交互经 wake() 取消） */
function resetSleepTimer() {
  if (sleepTimer) clearTimeout(sleepTimer);
  sleepTimer = window.setTimeout(() => {
    if (petStage.value === '' && !revealed.value && !dragging.value && !petting.value) {
      sleeping.value = true;
      engine?.setState('sleeping');
    }
  }, SLEEP_AFTER_MS);
}

function applyStage() {
  engine?.setState(STAGE_STATE[petStage.value] || DEFAULT_STATE);
}

function openChat() {
  wake();
  const ok = bohIsland.askDirect();
  if (ok) {
    revealed.value = false; // 岛开了（岛是全局 chrome，盖在挂件之上）
  }
}

/* 惯性滑行 + 边界反弹（px/ms 速度；摩擦 0.92/帧；反弹耗损 0.6 + 反色闪一帧） */
/* 松手落位：中心距任一边缘 ≤SNAP_DIST → 吸附贴边探头（四向）；否则原地漂浮 */
function settle() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const cxp = pos.value.x + SIZE / 2;
  const cyp = pos.value.y + SIZE / 2;
  const cands = [
    { e: 'left', d: cxp, x: 0, y: clampY(cyp - SIZE / 2) },
    { e: 'right', d: W - cxp, x: W - peekW.value, y: clampY(cyp - SIZE / 2) },
    { e: 'top', d: cyp, x: clampX(cxp - SIZE / 2), y: 8 },
    {
      e: 'bottom',
      d: H - bottomPeekPad.value - cyp,
      x: clampX(cxp - SIZE / 2),
      y: H - bottomPeekPad.value - peekW.value,
    },
  ];
  cands.sort((a, b) => a.d - b.d);
  /* 松手落位（2026-11-22 口径定稿）：
     近边缘（≤SNAP_DIST）→ 吸附贴边探头（只露朝向页面内容的一半）；
     页面中间 → 原地漂浮【完整显示，不裁切】—— 半身只在边缘，中间永远是整只 */
  const best = cands[0];
  if (best.d <= SNAP_DIST) {
    edge.value = best.e;
    pos.value = { x: best.x, y: best.y };
  } else {
    edge.value = null;
    pos.value = { x: clampX(pos.value.x), y: clampY(pos.value.y) };
  }
  savePos();
}

function onEnter() {
  revealed.value = true;
  wake();
}
function onLeave() {
  revealed.value = false;
  resetSleepTimer();
}

function onDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  pressed = true;
  moved = false;
  wake();
  downX = e.clientX;
  downY = e.clientY;
  grab = { dx: e.clientX - pos.value.x, dy: e.clientY - pos.value.y };
  /* 长按摸头：350ms 未动 → 笑眼 + 爆粒（位移会取消并转拖拽） */
  if (longTimer) clearTimeout(longTimer);
  longTimer = window.setTimeout(() => {
    if (pressed && !moved) {
      petting.value = true;
      engine?.setState('done');
      engine?.burst();
      mood.value = Math.min(100, mood.value + 12);
      /* 摸头是瞬时反应：600ms 后无条件退场 —— 即使 pointerup 被浮层截走，
         也不会卡在「被长按住」的形态里（同上：丢事件防御） */
      window.setTimeout(() => {
        petting.value = false;
        applyStage();
        resetSleepTimer();
      }, 600);
    }
  }, LONGPRESS_MS);
  wrapRef.value?.setPointerCapture?.(e.pointerId);
}

function onMove(e) {
  if (!pressed) return;
  /* ⭐ 丢 pointerup 防御：移动时 buttons === 0 ⇒ 按键早已松开（pointerup 被岛/导航
     等上层浮层截走的场景）。不补这一刀，pressed 卡死 = 挂件无按键跟鼠标漂 +
     摸头态卡住（2026-11-22 用户报障「没按住却一直是长按状态、无法自由拖动」） */
  if (e.pointerType === 'mouse' && e.buttons === 0) {
    pressed = false;
    if (longTimer) clearTimeout(longTimer);
    if (petting.value) {
      petting.value = false;
      applyStage();
    }
    dragging.value = false;
    settle();
    return;
  }
  const dx = e.clientX - downX;
  const dy = e.clientY - downY;
  if (!moved && Math.hypot(dx, dy) > 4) {
    moved = true;
    if (longTimer) clearTimeout(longTimer);
    if (petting.value) {
      petting.value = false;
      applyStage();
    }
    dragging.value = true;
  }
  if (dragging.value) {
    pos.value = { x: clampX(e.clientX - grab.dx), y: clampY(e.clientY - grab.dy) };
  }
}

function onUp(e) {
  if (!pressed) return;
  pressed = false;
  if (longTimer) clearTimeout(longTimer);
  try {
    wrapRef.value?.releasePointerCapture?.(e.pointerId);
  } catch {
    /* 捕获已释放 */
  }
  if (petting.value) {
    petting.value = false;
    applyStage();
    resetSleepTimer();
    return;
  }
  if (dragging.value) {
    dragging.value = false;
    /* 松手立即落位（吸附/漂浮 + 落存储）。吸附的滑动交给 CSS left/top 过渡
       （dragging 摘掉后过渡恢复 ⇒ 200ms 滑到位）—— 惯性机器退役：
       旧「先存旧 edge + 中间 pos 再惯性」会让 reload 渲染出半脸细条（本条报障根因：
       拖拽期间 edge 从不清空，松手存下「旧 edge + 中间 pos」，reload = 悬空半脸细条，
       hover 在细条与右缘全身之间反复跳 = 狂闪，指针只碰得到细条 = 拖不动） */
    settle();
  } else {
    openChat();
    resetSleepTimer();
  }
}

function onCancel() {
  pressed = false;
  dragging.value = false;
  if (longTimer) clearTimeout(longTimer);
  settle();
}

/* 眼神跟随：全局鼠标方向（passive + 60ms 节流），仅「自由看」系状态生效 */
const onDocMouseMove = (e) => {
  if (!visible.value || dragging.value || petting.value) return;
  const now = performance.now();
  if (now - (lastMouse.at || 0) < 60) return;
  lastMouse.at = now;
  lastMouse.x = e.clientX;
  lastMouse.y = e.clientY;
  const r = wrapRef.value?.getBoundingClientRect();
  if (!r) return;
  /* 指针在小方身上/身旁（40px 内）→ 停止喂视线（2026-11-22 用户报障「hover 狂闪」：
     近距离喂视线 + 半格量化 = 五官逐帧跳位）。近看时脸保持安静，鼠标回到页面
     其他区域才恢复眼神跟随。 */
  if (
    e.clientX > r.left - 40 &&
    e.clientX < r.right + 40 &&
    e.clientY > r.top - 40 &&
    e.clientY < r.bottom + 40
  ) {
    return;
  }
  engine?.setGazeTarget?.({
    x: Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 300)),
    y: Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / 300)),
  });
};
const lastMouse = { x: 0, y: 0, at: 0 };

/* ── 导演器：自主动作调度（调度真源在 boh-pet-acts.js；mood 见上方指针段）── */
const lastAct = ref({ id: null, at: 0 });
const inputFocused = () =>
  !!document.querySelector('input:focus, textarea:focus, [contenteditable="true"]:focus');

function runAct(id) {
  actId.value = id;
  if (id === 'hop') {
    engine?.burst();
    window.setTimeout(() => {
      actId.value = null;
    }, 900);
  } else if (id === 'doze') {
    /* 打盹小剧场：半闭 → 睡 → 醒来伸懒腰 → 抖灰 */
    engine?.setState('waiting');
    window.setTimeout(() => engine?.setState('sleeping'), 900);
    window.setTimeout(() => {
      actId.value = 'doze-stretch';
      engine?.setState('idle');
    }, 2500);
    window.setTimeout(() => {
      actId.value = 'doze-shake';
    }, 3100);
    window.setTimeout(() => {
      actId.value = null;
      sleeping.value = false;
      resetSleepTimer();
    }, 3400);
  } else if (id === 'look') {
    engine?.setState('thinking');
    window.setTimeout(() => {
      actId.value = null;
      applyStage();
    }, 1200);
  }
}

let directorTimer = 0;
onMounted(() => {
  directorTimer = window.setInterval(() => {
    if (document.hidden || !visible.value) return;
    if (sleeping.value || dragging.value || petting.value || petStage.value) return;
    mood.value = Math.max(10, mood.value - 0.5); // 闲置心情缓降
    const act = pickPetAct({
      mood: mood.value,
      typing: inputFocused(),
      hidden: document.hidden,
      busy: Boolean(petStage.value),
      reduced: reduced.value,
      now: Date.now(),
      lastActId: lastAct.value.id,
      lastActAt: lastAct.value.at,
    });
    if (!act) return;
    lastAct.value = { id: act.id, at: Date.now() };
    runAct(act.id);
  }, DIRECTOR_TICK_MS);
});
onUnmounted(() => {
  if (directorTimer) clearInterval(directorTimer);
});

/* ── 生命周期 ─────────────────────────────────────────────────────── */
const mql = window.matchMedia('(max-width: 768px)');
const onMql = (e) => {
  portrait.value = e.matches;
  pos.value.y = clampY(pos.value.y);
  vpTick.value += 1;
};
const onResize = () => {
  pos.value.x = clampX(pos.value.x);
  pos.value.y = clampY(pos.value.y);
  vpTick.value += 1;
};

onMounted(() => {
  /* 初始位置：存储（v2/v1 迁移）→ 默认右缘 38vh */
  const stored = readStoredPos();
  pos.value = stored.pos;
  edge.value = stored.edge || 'right';

  engine = createAvatarEngine({
    canvas: canvasRef.value,
    size: SIZE,
    onState: (s) => {
      state.value = s;
    },
  });
  applyStage();
  if (!visible.value) engine.pause();

  if (reduced.value) {
    engine.renderStatic();
    engine.pause(); // 静帧后不进动画循环（点击唤起对话不受影响）
  }

  mql.addEventListener('change', onMql);
  window.addEventListener('resize', onResize);
  document.addEventListener('mousemove', onDocMouseMove, { passive: true });

  /* 开场画在场则隐藏（轮询 1s：开场画的出现/消失不走路由） */
  gatePoll = window.setInterval(() => {
    homeGate.value = !!document.querySelector('.home-gate');
  }, 1000);
  homeGate.value = !!document.querySelector('.home-gate');
});

watch(petStage, (s, prev) => {
  const wasBusy = Boolean(prev);
  /* BOHAI 一轮完成（busy → ''）→ 跳一下庆祝 + 心情 +8（自主动作的「主动服务」面） */
  if (wasBusy && !busy(s)) {
    mood.value = Math.min(100, mood.value + 8);
    if (visible.value && !reduced.value) runAct('hop');
  }
  if (sleeping.value && s) {
    sleeping.value = false;
    applyStage();
  } else if (!sleeping.value) {
    applyStage();
  }
});
function busy(s) {
  return Boolean(s);
}

onUnmounted(() => {
  pressed = false;
  mql.removeEventListener('change', onMql);
  window.removeEventListener('resize', onResize);
  document.removeEventListener('mousemove', onDocMouseMove);
  if (gatePoll) clearInterval(gatePoll);
  if (sleepTimer) clearTimeout(sleepTimer);
  if (longTimer) clearTimeout(longTimer);
  engine?.destroy();
  engine = null;
});
</script>

<style scoped>
/* 挂件在 App 根（脱离 .bohai-page 的 var 作用域）⇒ 尺寸/时长用字面量
     （同 activity-avatar-engine 的豁免先例）；颜色只灰阶 rgba（不写彩裸色）。 */
.boh-pet-block {
  position: fixed;
  z-index: 59; /* 层级阶梯：抽屉侧栏 45 之上、导航 9999 / BohIsland 10001 之下 */
  overflow: hidden;
  cursor: pointer;
  outline: none;
  touch-action: none;
  transition:
    left 200ms cubic-bezier(0.4, 0, 0.2, 1),
    top 200ms cubic-bezier(0.4, 0, 0.2, 1),
    width 200ms cubic-bezier(0.4, 0, 0.2, 1),
    height 200ms cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* 拿起来的手感：阴影加深；拖拽中 left/top 不做过渡（跟手要即时） */
.boh-pet-block.is-lift {
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
}
.boh-pet-block.is-dragging {
  transition:
    width 150ms cubic-bezier(0.4, 0, 0.2, 1),
    height 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
.boh-pet-block.is-dragging .boh-pet-canvas {
  transition: transform 120ms cubic-bezier(0.4, 0, 0.2, 1);
}

.boh-pet-block:focus-visible {
  box-shadow: 0 0 0 2px rgba(128, 128, 128, 0.7);
}

.boh-pet-canvas {
  position: absolute;
  display: block;
  image-rendering: pixelated;
  transition: transform 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* 摸头软压（hover / 键盘聚焦 / 长按）+ 睡觉塌一点 */
.boh-pet-block:hover .boh-pet-canvas,
.boh-pet-block:focus-visible .boh-pet-canvas {
  transform: scaleY(0.94) translateY(1px);
}
.boh-pet-block.is-sleep .boh-pet-canvas {
  transform: scaleY(0.88);
}
.boh-pet-block.is-petting .boh-pet-canvas {
  transform: scaleY(0.82) translateY(2px);
}

/* 受击/碰撞反色闪（grayscale 反相一帧） */
.boh-pet-block.is-flash .boh-pet-canvas {
  filter: invert(1);
}

/* ── 自主动作的 CSS 表演 ── */
.boh-pet-block.is-jump .boh-pet-canvas {
  animation: boh-pet-jump 0.9s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes boh-pet-jump {
  0%,
  100% {
    transform: translateY(0);
  }

  35% {
    transform: translateY(-14px) scaleY(1.06);
  }

  70% {
    transform: translateY(0) scaleY(0.92);
  }
}

.boh-pet-block.is-stretch .boh-pet-canvas {
  animation: boh-pet-stretch 0.6s ease-in-out;
}
@keyframes boh-pet-stretch {
  0%,
  100% {
    transform: scaleY(1);
  }

  50% {
    transform: scaleY(1.12) scaleX(0.94);
  }
}

.boh-pet-block.is-shake .boh-pet-canvas {
  animation: boh-pet-shake 0.24s linear;
}
@keyframes boh-pet-shake {
  0%,
  100% {
    transform: translateX(0);
  }

  25% {
    transform: translateX(-2px);
  }

  75% {
    transform: translateX(2px);
  }
}

.boh-pet-block.is-look .boh-pet-canvas {
  animation: boh-pet-look 1.2s ease-in-out;
}
@keyframes boh-pet-look {
  0%,
  100% {
    transform: translateX(0);
  }

  40% {
    transform: translateX(-4px);
  }

  70% {
    transform: translateX(4px);
  }
}

.boh-pet-zzz {
  position: absolute;
  left: 2px;
  top: 2px;
  font-size: 10px;
  font-weight: 700;
  color: rgba(29, 29, 31, 0.4);
  animation: boh-pet-zzz-float 2.4s ease-in-out infinite;
}
@keyframes boh-pet-zzz-float {
  0%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }

  50% {
    opacity: 0.8;
    transform: translateY(-2px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .boh-pet-block,
  .boh-pet-canvas,
  .boh-pet-zzz {
    transition: none;
    animation: none;
  }

  .boh-pet-block.is-flash .boh-pet-canvas {
    filter: none;
  }
}
</style>
