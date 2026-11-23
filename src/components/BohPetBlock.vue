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
    aria-label="小方 · BOH AI 助手（单击开始对话，长按摸头，双击或右键打开菜单，可拖动）"
    :data-pet-state="state"
    :data-pet-edge="edge || 'float'"
    @pointerenter="onEnter"
    @pointerleave="onLeave"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onCancel"
    @contextmenu.prevent="openMenu"
    @keydown.enter.exact.prevent="openChat"
    @keydown.space.exact.prevent="openChat"
    @keydown.alt.enter.prevent="openMenu"
    @keydown.alt.space.prevent="openMenu"
  >
    <canvas ref="canvasRef" class="boh-pet-canvas" :style="canvasStyle" aria-hidden="true"></canvas>
    <span v-if="sleeping" class="boh-pet-zzz" aria-hidden="true">z</span>
  </div>

  <!-- 台词气泡（2026-11-23）：挂在包裹盒**外面** —— 贴边时包裹盒被裁到半张脸，
       气泡放进去会被一起裁掉。定位跟着 edge 走，始终朝页面内侧展开。 -->
  <Transition name="boh-pet-bubble">
    <div
      v-if="bubble"
      ref="bubbleRef"
      class="boh-pet-bubble"
      :class="`is-edge-${edge || 'float'}`"
      :style="bubbleStyle"
      role="status"
      aria-live="polite"
      @click.stop="dismissBubble"
    >
      {{ bubble.text }}
    </div>
  </Transition>

  <!-- 右键菜单（2026-11-23）：原先右键 = 直接回默认位，功能本身没人发现得了；
       改成菜单一次解决两件事，也让「隐藏小方」有个顺手的入口。 -->
  <Transition name="boh-pet-bubble">
    <div
      v-if="menuOpen"
      ref="menuRef"
      class="boh-pet-menu"
      :style="menuStyle"
      role="menu"
      aria-label="小方菜单"
    >
      <button type="button" role="menuitem" class="boh-pet-menu-item" @click="onMenuReset">
        回默认位置
      </button>
      <button type="button" role="menuitem" class="boh-pet-menu-item" @click="onMenuHide">
        隐藏小方
      </button>
    </div>
  </Transition>
</template>

<script setup>
/**
 * BohPetBlock —— 全局挂件「小方」（2026-11-22 用户口径；P1.0 全功能版）。
 *
 * 博莱克的具象化身：贴边探头（四向）、全屏自由拖动 + 抛掷惯性 + 边缘反弹、
 * 长按摸头、眼神跟随、导演器自主动作（boh-pet-acts.js 调度真源）、
 * 博莱克忙闲全局同步（boh-pet-bus）、睡觉、点击唤起全站唯一 AI 岛（askDirect）。
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
import { useGlobalAiPreferences } from '@/composables/useGlobalAiPreferences.js';
import {
  createAvatarEngine,
  DEFAULT_STATE,
  STAGE_STATE,
} from '@/views/Bolek/Bolek/components/activity-avatar-engine.js';
import { petStage } from '@/utils/boh-pet-bus.js';
import { DIRECTOR_TICK_MS, PET_ACTS, pickPetAct } from '@/utils/boh-pet-acts.js';
import { pickPetLine } from '@/utils/boh-pet-lines.js';
import { computeBubbleGeometry, computeMenuGeometry } from '@/utils/boh-pet-geometry.js';
import { logger } from '@/utils/logger.js';

const SIZE = 64; // 画布边长；探头宽 = SIZE/2 ⇒ 头中线落在屏幕缘（露半张脸且贴边）
const SNAP_DIST = 56; // 吸附判定：中心距边缘 ≤ 此值 → 贴边探头
const LONGPRESS_MS = 350; // 摸头长按阈值
const SLEEP_AFTER_MS = 30000; // 闲置睡眠阈值
const POS_KEY = 'boh_pet_block_pos';
const LEGACY_POS_KEY = 'boh_pet_block_y'; // 旧版单一 y 记忆（一次性迁移）

const route = useRoute();
const bohIsland = useBohIsland();
const { preferences } = useGlobalAiPreferences();

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
/* 触摸设备判定：决定「菜单怎么进」与「菜单项多高」。
   `(hover: none)` 比 UA 可靠 —— 触屏笔电/Chromebook 也能正确归类。 */
const isTouch = ref(typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches);
const vpTick = ref(0); // 视口尺寸变化的响应式信号（geometry 依赖它重算）

const reduced = computed(
  () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
);

/* 隐藏口径与 BohIsland canOpen 同构：/ai-chat 有活动行本体；开场画层叠会错位 */
const visible = computed(() => route.name !== 'AiChat' && !homeGate.value);

/* ── 几何 ─────────────────────────────────────────────────────── */
const peekW = computed(() => Math.round((SIZE / 2) * (portrait.value ? 0.8 : 1)));

/**
 * 底栏占位：**实测**玻璃底栏高度，不按屏型猜。
 *
 * 2026-11-23 横屏实测踩出来的真 bug：原来写成 `portrait ? 120 : 16`，
 * 而 portrait 判据是 `max-width: 768px` —— 横屏手机 844×390 宽度超了 768，
 * 于是走桌面值 16px，挂件拖到底部时 bottom=212 而底栏 top=93，**重叠 119px**。
 * 挂件 z-index 59 低于底栏（9999）⇒ 拖下去就消失且点不到，只能靠刷新恢复。
 *
/**
 * 导航占位（底 / 右）：**实测**导航实际停在哪一侧，不按屏型猜。
 *
 * 2026-11-23 横屏实测踩出来的真 bug：原先避让写成 `portrait ? 120 : 16`，
 * 而 portrait 判据是 `max-width:768px` —— 横屏手机 844×390 宽度超了 768，
 * 于是走桌面值 16px，挂件拖到底部就压在导航上（z 59 < 导航 1000+ ⇒
 * 拖下去直接消失、点不到，只能刷新恢复）。
 *
 * 更要紧的是：同一批 DOM（`.bottom-nav-glass`）在不同屏型下**形态完全不同** ——
 *   · 竖屏 390×844：底部横条，top=749、高 95、横跨整宽
 *   · 横屏 844×390：右侧竖排 rail，left=764、right=834、top=93、高 204
 * 只按「高度」让位是错的（横屏会误判成底部、把挂件顶到屏幕顶部压住顶部导航，
 * 实测截图确认过）。所以先判它靠哪一边，再分别给 bottom / right 让位。
 *
 * ⚠️ 不要给让位量加「按屏高的百分比上限」：横屏 rail 高 204/390 ≈ 52%，
 * 任何 35vh 之类的上限都会把避让压小。
 */
const navBottomInset = ref(0);
const navRightInset = ref(0);
const measureNavInset = () => {
  if (typeof document === 'undefined') return;
  const nav = document.querySelector('.bottom-nav-glass');
  if (!nav) {
    navBottomInset.value = 0;
    navRightInset.value = 0;
    return;
  }
  const rect = nav.getBoundingClientRect();
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  if (!rect.height || !rect.width) {
    navBottomInset.value = 0;
    navRightInset.value = 0;
    return;
  }
  /* 右侧 rail 判据：整体落在右半屏、且不是横跨整宽的底栏。
     竖排导航占宽度通常 < 25% 视口，横跨整宽的底栏 right-left ≈ vw。 */
  const isRightRail = rect.left > vw * 0.5 && rect.width < vw * 0.35;
  const isBottomBar = rect.top > vh * 0.5 && rect.width >= vw * 0.35;

  const cap = Math.max(0, vh - SIZE - 16);
  navBottomInset.value = isBottomBar ? Math.round(Math.min(vh - rect.top, cap)) : 0;
  navRightInset.value = isRightRail
    ? Math.round(Math.min(vw - rect.left, Math.max(0, vw - SIZE - 16)))
    : 0;
};
/* 没有导航时也要留一点余量（旧值），有导航则贴在上缘之内 */
const dragBottomPad = computed(() =>
  navBottomInset.value ? navBottomInset.value + 8 : portrait.value ? 120 : 16,
);
const bottomPeekPad = computed(() =>
  navBottomInset.value ? navBottomInset.value + 8 : portrait.value ? 112 : 8,
);

/* X 右界要扣掉右侧 rail（横屏）。竖屏/桌面 navRightInset=0，行为不变。 */
const clampX = (x) =>
  Math.min(Math.max(4, x), Math.max(4, window.innerWidth - navRightInset.value - SIZE - 4));
const clampY = (y) =>
  Math.min(Math.max(8, y), Math.max(8, window.innerHeight - dragBottomPad.value - SIZE));

/* 右缘吸附位：必须扣掉右侧 rail，否则横屏会吸到 rail 上（z 更低 ⇒ 拖过去就消失）。
   `- peekW` 是为了让「探头」的可见半张脸正好贴着可用右界。 */
const rightEdgeX = () => Math.max(0, window.innerWidth - navRightInset.value - peekW.value);

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
  if (full && edge.value === 'right') x = W - navRightInset.value - SIZE;
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
  const edgeX = (e) => (e === 'left' ? 0 : rightEdgeX());
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
      return { pos: { x: rightEdgeX(), y: clampY(legacy) }, edge: 'right' };
    }
  } catch {
    /* 隐私模式读不到就用默认值 */
  }
  return {
    pos: { x: rightEdgeX(), y: Math.round(window.innerHeight * 0.38) },
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
    x: rightEdgeX(),
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
/* 双击识别（触摸端的菜单入口）：单击要等这个窗口过了才敢开对话，
   否则每次双击都会先弹一次 AI 岛。250ms 是双击的常用上限。 */
let tapTimer = 0;
let lastTapAt = 0;
const DOUBLE_TAP_MS = 250;

function wake() {
  if (sleeping.value) {
    sleeping.value = false;
    applyStage();
    // 睡醒说一句（低频：10 分钟冷却，不会每次都念）
    say('wake');
  }
  resetSleepTimer();
}

/* 睡眠排程：博莱克闲置 + 未交互 30s → sleeping（任意交互经 wake() 取消） */
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
    { e: 'right', d: W - navRightInset.value - cxp, x: rightEdgeX(), y: clampY(cyp - SIZE / 2) },
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
  /* 新的一次按下要撤销上一次单击排队中的「开对话」——
     否则「点一下（等双击判定）→ 立刻按住拖动」会在拖到一半时突然弹出 AI 岛。 */
  if (tapTimer) {
    clearTimeout(tapTimer);
    tapTimer = 0;
  }
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
      /* 摸头是说一句的最好时机：用户主动、注意力正好在小方身上。
         但它说完就散，不追问、不索取回应。 */
      say('petted');
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
    // 被拖过之后抱怨一句（5 分钟冷却，拖来拖去不会一直念）
    say('dragged');
  } else {
    /* 单击 / 双击分流。双击**只在触摸端**启用：
       触摸没有右键（iOS Safari 对 div 不派发 contextmenu），长按已被摸头占用，
       双击是唯一空着的入口。桌面右键照旧，也就不必为双击让单击慢 250ms。 */
    if (!isTouch.value) {
      openChat();
      resetSleepTimer();
      return;
    }
    const now = Date.now();
    const isDoubleTap = now - lastTapAt < DOUBLE_TAP_MS;
    lastTapAt = isDoubleTap ? 0 : now;
    if (tapTimer) {
      clearTimeout(tapTimer);
      tapTimer = 0;
    }
    if (isDoubleTap) {
      openMenu();
    } else {
      // 延迟一拍再开对话：给双击一个否决窗口
      tapTimer = window.setTimeout(() => {
        tapTimer = 0;
        openChat();
      }, DOUBLE_TAP_MS);
    }
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

/* ── 台词气泡（2026-11-23）─────────────────────────────────────────
   数据与选句在 boh-pet-lines.js（纯函数、可测），这里只负责「什么时候问它要一句」
   和「怎么显示」。三条纪律：
     · 它自己说话，不转述系统消息（那会退化成带脸的弹窗）；
     · 用户输入中 / 页面隐藏 / 忙 / reduce-motion ⇒ 不问也不显示；
     · 同一场景有间隔，同一句有冷却（都在 lines 模块里判）。 */
const bubble = ref(null); // { text, duration } | null
const bubbleRef = ref(null);
let bubbleTimer = 0;
let bubbleHideTimer = 0;
let lastLineAt = 0;
let lastLineId = null;
let lastSceneAt = 0;
let lastSceneKey = '';

/**
 * 气泡定位：贴边时朝页面内侧展开；浮空时在左侧。
 * 几何计算在 boh-pet-geometry.js（纯函数、可测）—— 那里锁死了
 * 「右缘长句溢出」那条只有在窄屏才暴露的 bug，别把算法挪回组件里。
 */
const bubbleStyle = computed(() => {
  void vpTick.value;
  return computeBubbleGeometry({
    edge: edge.value,
    pos: pos.value,
    peekW: peekW.value,
    size: SIZE,
    viewport: { w: window.innerWidth, h: window.innerHeight },
  });
});

/** 说一句话。已有气泡时直接替换（不排队 —— 排队会攒出一串过期情绪）。 */
function say(scene) {
  if (!preferences.petEnabled) {
    return;
  }
  if (document.hidden) {
    return;
  }
  if (passportBusy()) {
    return;
  }
  if (inputFocused()) {
    return;
  }
  if (reduced.value) {
    return;
  }
  if (sleeping.value) {
    return;
  }
  const line = pickPetLine({
    scene,
    mood: mood.value,
    hour: new Date().getHours(),
    typing: false,
    hidden: false,
    busy: false,
    reduced: reduced.value,
    now: Date.now(),
    lastLineAt,
    lastSceneAt: lastSceneKey === scene ? lastSceneAt : 0,
    lastLineId,
  });
  if (!line) {
    logger.debug('pet', '没有可说的台词（间隔/冷却/时段）', scene);
    return;
  }
  lastLineAt = Date.now();
  lastLineId = line.id;
  lastSceneKey = scene;
  lastSceneAt = Date.now();
  bubble.value = { text: line.text, duration: line.duration };
  if (bubbleTimer) clearTimeout(bubbleTimer);
  if (bubbleHideTimer) clearTimeout(bubbleHideTimer);
  bubbleTimer = window.setTimeout(() => {
    bubble.value = null;
  }, line.duration);
}

function dismissBubble() {
  if (bubbleTimer) clearTimeout(bubbleTimer);
  bubble.value = null;
  // 点掉之后给一段安静期，别立刻又冒一句
  lastLineAt = Date.now();
}

/** 博莱克是否在忙（让它让位）。 */
function passportBusy() {
  return Boolean(petStage.value);
}

/* ── 菜单（2026-11-23）──────────────────────────────────────────────
   桌面：右键弹菜单。原先右键 = 直接回默认位，功能本身没人发现得了；
   改成菜单一次解决两件事，也让「隐藏小方」有个顺手的入口。
   触摸：**没有右键**（iOS Safari 对 div 不派发 contextmenu），
   长按已被「摸头」占用 ⇒ 双击作为菜单入口（双击不冲突：单击开对话、
   长按摸头，双击是空着的）。 */
const menuOpen = ref(false);
const menuRef = ref(null);
let menuCloseTimer = 0;

const menuStyle = computed(() => {
  void vpTick.value;
  return computeMenuGeometry({
    pos: pos.value,
    size: SIZE,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    isTouch: isTouch.value,
  });
});

function openMenu() {
  dismissBubble();
  menuOpen.value = true;
  // 点别处关闭（一次性监听，nextTick 后挂，避免被本次 contextmenu 立刻关掉）
  window.setTimeout(() => {
    document.addEventListener('pointerdown', closeMenuOnOutside, { once: true, capture: true });
  }, 0);
}
function closeMenuOnOutside(e) {
  if (menuRef.value?.contains?.(e.target)) return;
  menuOpen.value = false;
}
function closeMenu() {
  menuOpen.value = false;
  document.removeEventListener('pointerdown', closeMenuOnOutside, true);
}
function onMenuReset() {
  closeMenu();
  resetToDefaultEdge();
  say('idle');
}
function onMenuHide() {
  closeMenu();
  /* 关闭小方 = 写偏好（持久化）+ App.vue 的 v-if 立刻卸掉本组件。
     刻意不做「确认框」：它只是个挂件，重新打开的路径（设置页）写在那里就够。 */
  preferences.petEnabled = false;
}

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
  /* 台词联动（2026-11-23）：动作自带 line 场景 ⇒ 演完顺带说一句。
     doze 的 line 是 ''（睡着时冒气泡很怪），所以这里自然跳过。
     故意延后到动作收尾：先看到动作、再看到话，因果才成立 —— 反过来像字幕错误。 */
  const act = PET_ACTS.find((a) => a.id === id);
  if (act?.line) {
    window.setTimeout(() => say(act.line), act.dur);
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
  measureNavInset();
  pos.value.x = clampX(pos.value.x);
  pos.value.y = clampY(pos.value.y);
  vpTick.value += 1;
};

onMounted(() => {
  /* 底栏高度必须在读存储位置**之前**量好：
     clampY 依赖 dragBottomPad，用错值会让存下来的 y 被钳到「底栏下面」。 */
  measureNavInset();

  /* ⚠️ 但 onMounted 时底栏往往还没渲染完（它是路由级组件，可能与 App 同拍挂载）。
     实测：横屏 844×390 下这里量到 0，于是 dragBottomPad 退回 16px，
     挂件拖到底部就压在 204px 高的底栏上。两次补测覆盖「本拍没量到」的情况：
     下一帧（布局已定）+ 1.2s（懒加载的路由内容已到）。只在真的量到后才收手。 */
  requestAnimationFrame(() => {
    measureNavInset();
    pos.value.y = clampY(pos.value.y);
    vpTick.value += 1;
  });
  const navRetry = window.setTimeout(() => {
    measureNavInset();
    pos.value.y = clampY(pos.value.y);
    vpTick.value += 1;
  }, 1200);
  window.setTimeout(() => window.clearTimeout(navRetry), 3000);

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

  /* 见面招呼（2026-11-23）：等开场画落定再说，否则会被开场画盖住。
     5s 后问一次，homeGate 还在就再等 —— 用轮询而不是固定延迟，
     因为开屏时长取决于用户（要不要过门控）。 */
  let helloWaited = 0;
  const helloPoll = window.setInterval(() => {
    helloWaited += 1000;
    if (homeGate.value && helloWaited < 30000) return;
    window.clearInterval(helloPoll);
    if (!visible.value) return;
    say('hello');
  }, 1000);
});

/* 底栏是路由级组件（进出不同页面会挂载/卸载）⇒ 每次切页重新量一次，
   否则从「有底栏的页面」切到「没有底栏的页面」会留下多余避让。 */
watch(
  () => route.name,
  () => {
    measureNavInset();
    pos.value.y = clampY(pos.value.y);
    vpTick.value += 1;
  },
);

watch(petStage, (s, prev) => {
  const wasBusy = Boolean(prev);
  /* 博莱克一轮完成（busy → ''）→ 跳一下庆祝 + 心情 +8（自主动作的「主动服务」面） */
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
  if (bubbleTimer) clearTimeout(bubbleTimer);
  if (bubbleHideTimer) clearTimeout(bubbleHideTimer);
  if (menuCloseTimer) clearTimeout(menuCloseTimer);
  if (tapTimer) clearTimeout(tapTimer);
  document.removeEventListener('pointerdown', closeMenuOnOutside, true);
  engine?.destroy();
  engine = null;
});
</script>

<style scoped>
/* 挂件在 App 根（脱离 .bolek-page 的 var 作用域）⇒ 尺寸/时长用字面量
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

/* ── 台词气泡（2026-11-23）──
   贴在包裹盒外侧、不参与包裹盒的 overflow 裁剪（所以模板里它是兄弟节点）。
   恒黑白：黑底白字，与角色本体同一套语言（不随主题反转，同引擎的颜色纪律）。
   pointer-events 只在点击收起时用 —— 它不该挡住页面上的任何可交互元素。 */
.boh-pet-bubble {
  position: fixed;
  z-index: 60; /* 与挂件同层（59）之上一点点，避免被自己盖住 */
  padding: 8px 11px;
  border-radius: 10px;
  background: rgba(29, 29, 31, 0.94);
  color: #fff;
  font-size: 12px;
  line-height: 1.45;
  letter-spacing: 0.01em;
  word-break: break-word;
  cursor: pointer;
  user-select: none;
  /* 气泡本身不吃事件，只有单击收起；用 auto 而不是 none 是为了「点一下就散」 */
  pointer-events: auto;
}

.boh-pet-bubble-enter-active,
.boh-pet-bubble-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms cubic-bezier(0.34, 1.4, 0.64, 1);
}

.boh-pet-bubble-enter-from,
.boh-pet-bubble-leave-to {
  opacity: 0;
  transform: scale(0.86);
}

/* 触摸端：气泡**彻底不吃事件**。
   理由（2026-11-23）：桌面有 hover，气泡挡住什么用户看得见；手机上一块
   170×36 的浮层压在内容上，用户想点下面的东西会发现「点了没反应」，
   而它自己 3s 后就散了 —— 这是纯粹的徒手点空气。
   触摸端不提供「点击收起」（长按摸头已经是主交互），只靠定时自动散。
   字号也上调一格：12px 在 3x 屏上偏小。 */
@media (hover: none) {
  .boh-pet-bubble {
    pointer-events: none;
    font-size: 13px;
  }
}

/* ── 右键菜单（2026-11-23）── */
.boh-pet-menu {
  position: fixed;
  z-index: 61;
  padding: 4px;
  border-radius: 10px;
  background: rgba(29, 29, 31, 0.96);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.boh-pet-menu-item {
  appearance: none;
  border: 0;
  background: transparent;
  color: #fff;
  font-size: 12px;
  line-height: 1.4;
  text-align: left;
  padding: 7px 9px;
  border-radius: 7px;
  cursor: pointer;
  font-family: inherit;
  /* 触摸目标：桌面 26px 够用，但手指点不中（HIG 要求 ≥44px）。
     用 min-height 而不是加大 padding —— padding 会把桌面菜单也撑胖。 */
  min-height: 26px;
  display: flex;
  align-items: center;
}

@media (hover: none) {
  .boh-pet-menu-item {
    min-height: 44px;
    padding: 0 12px;
    font-size: 13px;
  }
}

.boh-pet-menu-item:hover,
.boh-pet-menu-item:focus-visible {
  background: rgba(255, 255, 255, 0.14);
  outline: none;
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
