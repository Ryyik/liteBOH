<script setup>
/**
 * 云上咖啡店 —— 主视图（plans/026 重构版）
 *
 * 与旧版的差异（每条都对应 plans/026 的实测发现）：
 *  P0-1 本文件不再塞数据表/引擎/存档/音效，全部在 src/games/cafe/ 下。
 *  P0-2 八类机制各自不同的核心动作（原来是 11 步共用一条进度条规则）。
 *  P0-3 四档判定，Fail 扣 15 耐心并清连击。
 *  P0-4 猫救场品质 68、清连击、每局封顶 2 次，且认真做收益更高。
 *  P0-5 布局改成 CSS Grid（竖屏四行 / 桌面三栏），**不再用 transform: scale 硬缩**。
 *       旧版 5 个 media query 各写一套绝对定位坐标，谁也不让谁，
 *       竖屏面板占屏 59.7%、字号压到 7px，桌面中部却是 300px 空洞。
 *  P0-6 装置改内联 SVG，背景分层视差。
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  Coffee,
  Gauge,
  Heart,
  House,
  Milk,
  Pause,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-vue-next';

import { CUSTOMERS, MEMORIES, getCustomer } from '@/games/cafe/data/people.js';
import {
  DRINKS,
  GRADES,
  MAX_CONCURRENT_ORDERS,
  ROUND_SECONDS,
  STEP_DEFINITIONS,
} from '@/games/cafe/core/steps.js';
import {
  applyStepResult,
  averageOf,
  canRescue,
  collectExpiredOrders,
  createOrder,
  createStats,
  getCurrentStepId,
  getDrink,
  isOrderComplete,
  mergeSettlement,
  nextStepFeedback,
  resetOrderSerial,
  settleCatRescue,
  settleNormalServe,
  applyPatienceDecay,
} from '@/games/cafe/core/round.js';
import {
  createStepState,
  doseOnce,
  latteGuideY,
  sampleSwirl,
  sampleTrace,
  stepCommit,
  stepTick,
} from '@/games/cafe/core/engine.js';
import {
  CAT_AFFINITY_CAP,
  CAT_HELP_COST,
  CAT_PET_COOLDOWN_MS,
  MAX_CAT_RESCUES,
  tryPetCat,
  tryPlayWithCat,
} from '@/games/cafe/systems/cat.js';
import {
  persistRound,
  persistWalletAndUpgrades,
  readBestScore,
  readUpgrades,
  readWallet,
} from '@/games/cafe/systems/persistence.js';
import { playSfx } from '@/games/cafe/audio/sfx.js';
import { createPausableTaskScheduler } from '@/utils/pausable-task-scheduler.js';
import {
  getAnniversaryCafeResultTitle,
  getAnniversaryCafeStars,
} from '@/utils/anniversary-cafe-result.js';
import StationPanel from './StationPanel.vue';
import { BACKDROP_URL, memoryUrl, skinUrl } from './images.js';
import './style.scoped.css';

const ICONS = { Coffee, Gauge, Heart, House, Milk, Send, Sparkles, Trash2 };
const stepIcon = (id) => ICONS[STEP_DEFINITIONS[id]?.icon] || Coffee;

const router = useRouter();
const taskScheduler = createPausableTaskScheduler();

// ─────────────────────────── 局内状态 ───────────────────────────
const phase = ref('intro');
const timeLeft = ref(ROUND_SECONDS);
const orders = ref([]);
const activeOrderId = ref(null);
const isPaused = ref(false);
const showMenu = ref(false);
const showExitConfirm = ref(false);
const exitTarget = ref('intro');
const pauseReason = ref('');
const soundEnabled = ref(true);
const stats = ref(createStats());

const machineHeat = ref(0);
const steamCleanliness = ref(100);
const counterCleanliness = ref(100);
const maintenanceLock = ref('');

const catAffinity = ref(0);
const catMood = ref('idle');
const catMessage = ref('');
const catSpot = ref(1);
const hearts = ref([]);

const wallet = ref(0);
const upgrades = ref({ grinder: 0, machine: 0, steam: 0 });
const bestScore = ref(0);

const discoveredMemories = ref([]);
const activeMemoryId = ref(null);
const memoryMessage = ref(null);

const pointer = ref(null);
const holding = ref(false);
/**
 * 每一步的运行时状态：**按订单隔离**（`{ [orderId]: { [stepId]: state } }`）。
 *
 * ⚠️ 2026-10-08 修「有概率长按没反应」：原来是**全局单例** `{ [stepId]: state }`，
 * 三个订单共用一份。于是 A 单失败的 `status:'failed'` 会污染 B 单，
 * 而 `canInteract()` 见到 failed 直接 return false ⇒
 * 玩家切单后长按**完全没有任何反应**。
 * 「有概率」正是因为取决于「哪一单先失败」和「玩家有没有切单」。
 */
const stepStates = ref({});

const pauseResumeButton = ref(null);
const exitCancelButton = ref(null);

const order = computed(() => orders.value.find((item) => item.id === activeOrderId.value) || null);
const drink = computed(() => getDrink(order.value));
const currentStepId = computed(() => getCurrentStepId(order.value));
const currentStep = computed(() =>
  currentStepId.value ? STEP_DEFINITIONS[currentStepId.value] : null,
);
const canServe = computed(() => (order.value ? isOrderComplete(order.value) : false));
const currentQuality = computed(() => averageOf(order.value?.stepQualities || []));
const queueCount = computed(() => orders.value.filter((item) => !item.isResolving).length);
const progress = computed(() => ((ROUND_SECONDS - timeLeft.value) / ROUND_SECONDS) * 100);
const stepState = computed(() => {
  const oid = activeOrderId.value;
  const sid = currentStepId.value;
  return oid && sid ? stepStates.value[oid]?.[sid] || null : null;
});
/** 需要指针交互的机制（timed/sequenced 走按钮，不进拖拽区） */
const interactiveStation = computed(
  () => Boolean(currentStep.value) && !['timed', 'sequenced'].includes(currentStep.value.kind),
);
/**
 * 「店里正忙」= 有一单处在制作流程中（还没到可出杯）。
 *
 * ⚠️ 判据不能只看 holding（正在按住）：
 * 2026-10-08 端到端探针抓到 —— 开局没人按按钮时 holding=false，
 * 于是摸猫/逗猫可用，玩家可以在「第一杯还没开始做」时白嫖亲密度，
 * P0-4① 的反白嫖约束形同虚设（实测 7a/7b 转红）。
 * 正确口径：**有订单在进行中且未完成**就算占用，让亲密度只能靠
 * 「等单做完的空档」或「发现回忆」获取。
 */
const anyStepInProgress = computed(() => {
  if (holding.value) return true;
  return orders.value.some(
    (item) => !item.isResolving && item.stepIndex < getDrink(item).steps.length,
  );
});
const catHelpReady = computed(() =>
  canRescue({
    affinity: catAffinity.value,
    phase: phase.value,
    paused: isPaused.value,
    resolving: Boolean(order.value?.isResolving),
    rescuesUsed: stats.value.rescuesUsed,
  }),
);
const catPositionStyle = computed(() => ({ '--cat-spot': `${43 + catSpot.value * 18}%` }));
const averageQuality = computed(() =>
  stats.value.served ? Math.round(stats.value.totalQuality / stats.value.served) : 0,
);
const resultTitle = computed(() =>
  getAnniversaryCafeResultTitle(stats.value.served, averageQuality.value),
);
const stars = computed(() => getAnniversaryCafeStars(stats.value.served, averageQuality.value));
const upgradeCatalog = computed(() => [
  {
    id: 'grinder',
    name: '钻石磨豆机',
    description: '研磨目标区更宽',
    level: upgrades.value.grinder,
    cost: 120 + upgrades.value.grinder * 90,
  },
  {
    id: 'machine',
    name: '双锅炉咖啡机',
    description: '萃取更稳且更耐用',
    level: upgrades.value.machine,
    cost: 150 + upgrades.value.machine * 110,
  },
  {
    id: 'steam',
    name: '强力蒸汽棒',
    description: '奶泡更稳且更耐用',
    level: upgrades.value.steam,
    cost: 130 + upgrades.value.steam * 100,
  },
]);

const customerList = computed(() =>
  CUSTOMERS.map((item) => ({ ...item, image: skinUrl(item.imageKey) })),
);
const memoryList = computed(() =>
  MEMORIES.map((item) => ({ ...item, image: memoryUrl(item.assetKey) })),
);
const activeMemory = computed(
  () => memoryList.value.find((m) => m.id === activeMemoryId.value) || null,
);
const currentCustomer = computed(() => {
  if (!order.value) return customerList.value[0];
  return {
    ...getCustomer(order.value.customerIndex),
    image: skinUrl(getCustomer(order.value.customerIndex).imageKey),
  };
});

// ─────────────────────────── 计时器句柄 ───────────────────────────
let gameTimer = null;
let catTimer = null;
let arrivalTimer = null;
let rafId = 0;
let lastFrameAt = 0;
let heartId = 0;
let customerCursor = -1;
let roundDeadline = 0;
let lastGameTickAt = 0;
let lastFocusedElement = null;
let exitWasPaused = false;
let lastPetAt = 0;
let lastPlayAt = 0;
let pendingTask = null;
let pausedAt = 0;

// ─────────────────────────── 音效与反馈 ───────────────────────────
function sfx(kind) {
  playSfx(kind, soundEnabled.value);
}

function ensureStepState(stepId) {
  if (!stepId) return null;
  const oid = activeOrderId.value;
  if (!oid) return null;
  if (!stepStates.value[oid]?.[stepId]) {
    const upgradeKey = STEP_DEFINITIONS[stepId].upgradeKey;
    const upgradeBonus = upgradeKey ? (upgrades.value[upgradeKey] || 0) * 1.4 : 0;
    stepStates.value = {
      ...stepStates.value,
      [oid]: {
        ...(stepStates.value[oid] || {}),
        [stepId]: createStepState(stepId, {
          served: stats.value.served,
          upgradeBonus,
          previousHeight: order.value?.layerHeights?.previous || 0,
        }),
      },
    };
  }
  return stepStates.value[oid]?.[stepId] || null;
}

function patchStepState(stepId, next, orderId = activeOrderId.value) {
  if (!orderId) return;
  stepStates.value = {
    ...stepStates.value,
    [orderId]: { ...(stepStates.value[orderId] || {}), [stepId]: next },
  };
}

function setOrderField(key, value) {
  const target = orders.value.find((item) => item.id === activeOrderId.value);
  if (target) target[key] = value;
}

// ─────────────────────────── 记忆与猫 ───────────────────────────
function selectNextMemory() {
  const rest = memoryList.value.filter((m) => !discoveredMemories.value.some((d) => d.id === m.id));
  activeMemoryId.value = rest.length ? rest[Math.floor(Math.random() * rest.length)].id : null;
}

function closeMemory() {
  taskScheduler.cancel(pendingTask);
  pendingTask = null;
  memoryMessage.value = null;
  if (phase.value === 'playing') selectNextMemory();
}

function discoverMemory(memory) {
  if (!memory || memoryMessage.value) return;
  if (!discoveredMemories.value.some((item) => item.id === memory.id)) {
    discoveredMemories.value.push(memory);
    catAffinity.value = Math.min(CAT_AFFINITY_CAP, catAffinity.value + 1);
  }
  activeMemoryId.value = null;
  memoryMessage.value = memory;
  sfx('success');
  pendingTask = taskScheduler.schedule(closeMemory, 4200);
}

function spawnHeart() {
  const id = (heartId += 1);
  hearts.value.push({ id, left: 42 + Math.random() * 16 });
  taskScheduler.schedule(() => {
    hearts.value = hearts.value.filter((heart) => heart.id !== id);
  }, 1100);
}

function petCat() {
  if (phase.value !== 'playing') return;
  const result = tryPetCat({
    affinity: catAffinity.value,
    nowMs: Date.now(),
    lastPetAt,
    anyStepInProgress: anyStepInProgress.value,
    paused: isPaused.value,
  });
  if (!result.ok) return;
  lastPetAt = Date.now();
  catAffinity.value = result.affinity;
  catMood.value = 'happy';
  catMessage.value = '喵~';
  spawnHeart();
  sfx('purr');
  taskScheduler.schedule(() => {
    if (catMood.value === 'happy') catMood.value = 'idle';
    catMessage.value = '';
  }, 1200);
}

function playWithCat() {
  if (phase.value !== 'playing') return;
  const result = tryPlayWithCat({
    affinity: catAffinity.value,
    nowMs: Date.now(),
    lastPlayAt,
    catMood: catMood.value,
    anyStepInProgress: anyStepInProgress.value,
    paused: isPaused.value,
  });
  if (!result.ok) return;
  lastPlayAt = Date.now();
  catMood.value = 'chase';
  catMessage.value = '抓到了！';
  catAffinity.value = result.affinity;
  catSpot.value = (catSpot.value + 1) % 3;
  sfx('tap');
  taskScheduler.schedule(() => {
    catMood.value = 'happy';
    catMessage.value = '';
  }, 1300);
}

function askCatForHelp() {
  if (!catHelpReady.value) return;
  const target = order.value;
  if (!target) return;
  catAffinity.value -= CAT_HELP_COST;
  catMood.value = 'help';
  catMessage.value = '这杯交给我！';
  const settlement = settleCatRescue(target, stats.value, stats.value.rescuesUsed);
  if (!settlement) return;
  stats.value = mergeSettlement(stats.value, settlement);
  target.feedback = `小满稳稳送出了 ${drink.value.name}（品质 ${settlement.quality}）`;
  target.feedbackTone = settlement.comboBroken ? 'neutral' : 'success';
  counterCleanliness.value = Math.max(0, counterCleanliness.value - 11);
  cancelPointer();
  target.isResolving = true;
  sfx('success');
  taskScheduler.schedule(() => {
    removeOrder(target.id);
    catMood.value = 'idle';
    catMessage.value = '';
    if (activeOrderId.value === target.id) activeOrderId.value = nextActiveId();
  }, 650);
}

// ─────────────────────────── 订单流转 ───────────────────────────
function nextActiveId(excludeId = null) {
  return orders.value.find((item) => item.id !== excludeId && !item.isResolving)?.id || null;
}

function addOrder() {
  if (orders.value.length >= MAX_CONCURRENT_ORDERS) return null;
  customerCursor = (customerCursor + 1) % CUSTOMERS.length;
  const previousDrinkId = orders.value.at(-1)?.drinkId || null;
  const created = createOrder({
    customers: CUSTOMERS,
    nextCustomerIndex: customerCursor,
    previousDrinkId,
  });
  orders.value.push(created);
  if (!activeOrderId.value) activeOrderId.value = created.id;
  sfx('tap');
  return created;
}

function selectOrder(orderId) {
  if (orderId === activeOrderId.value) return;
  cancelPointer();
  holding.value = false;
  activeOrderId.value = orderId;
  // 不需要清 stepStates —— 它已按订单隔离（切单不会串状态）
  sfx('tap');
}

function removeOrder(orderId) {
  const wasActive = activeOrderId.value === orderId;
  orders.value = orders.value.filter((item) => item.id !== orderId);
  //订单没了，它的步骤状态也一起清掉（否则 orderId 复用时会拿到旧状态）
  if (stepStates.value[orderId]) {
    const perOrder = { ...stepStates.value };
    delete perOrder[orderId];
    stepStates.value = perOrder;
  }
  if (wasActive) activeOrderId.value = nextActiveId(orderId);
  if (phase.value === 'playing') taskScheduler.schedule(() => addOrder(), 1200);
}

function loseOrder(orderId) {
  const lost = orders.value.find((item) => item.id === orderId);
  if (!lost || lost.isResolving) return;
  lost.isResolving = true;
  stats.value = { ...stats.value, missed: stats.value.missed + 1, combo: 0 };
  lost.feedback = `${getCustomer(lost.customerIndex).name} 没能等到这杯咖啡`;
  lost.feedbackTone = 'error';
  sfx('error');
  if (activeOrderId.value === orderId) activeOrderId.value = nextActiveId(orderId);
  taskScheduler.schedule(() => removeOrder(orderId), 650);
}

// ─────────────────────────── 设备 ───────────────────────────
function serviceEquipment(kind) {
  if (maintenanceLock.value || anyStepInProgress.value) return;
  maintenanceLock.value = kind;
  cancelPointer();
  sfx('machine');
  taskScheduler.schedule(
    () => {
      if (kind === 'machine') machineHeat.value = Math.max(0, machineHeat.value - 42);
      if (kind === 'steam') steamCleanliness.value = 100;
      if (kind === 'counter') counterCleanliness.value = 100;
      maintenanceLock.value = '';
      const label =
        kind === 'machine'
          ? '排压完成，咖啡机已经降温'
          : kind === 'steam'
            ? '蒸汽棒清洁完成'
            : '操作台已经擦干净';
      if (order.value) setOrderField('feedback', label);
      sfx('success');
    },
    kind === 'machine' ? 1200 : 900,
  );
}

// ─────────────────────────── 指针与机制交互 ───────────────────────────
function localPoint(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  };
}

function cancelPointer() {
  pointer.value = null;
  holding.value = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

function canInteract() {
  if (isPaused.value || order.value?.isResolving || maintenanceLock.value) return false;
  if (stepState.value?.status === 'settled' || stepState.value?.status === 'failed') return false;
  return true;
}

function onStationDown(event) {
  const stepId = currentStepId.value;
  const def = STEP_DEFINITIONS[stepId];
  if (!def || !canInteract()) return;
  if (def.kind === 'timed' || def.kind === 'sequenced') return;
  if (def.kind === 'staged' && machineHeat.value >= 88) {
    setOrderField('feedback', '咖啡机过热，需要排压降温');
    sfx('error');
    return;
  }
  if (def.kind === 'texture' && steamCleanliness.value < 24) {
    setOrderField('feedback', '蒸汽棒需要先清洁和排气');
    sfx('error');
    return;
  }
  event.currentTarget.setPointerCapture?.(event.pointerId);
  pointer.value = { id: event.pointerId, orderId: activeOrderId.value, stepId, def };
  holding.value = true;
  const state = ensureStepState(stepId);
  patchStepState(stepId, { ...state, status: 'holding', startedAt: Date.now() });
  const base = stepStates.value[activeOrderId.value]?.[stepId];
  if (def.kind === 'swirl' && base)
    patchStepState(stepId, { ...base, accumulatedAngle: 0, wobble: 0, lastAngle: null });
  if (def.kind === 'trace' && base)
    patchStepState(stepId, { ...base, progress: 0, deviation: 0, trail: [], endOffset: null });
  lastFrameAt = 0;
  sfx('machine');
  // ⚠️ **所有**按住型机制都要起rAF。
  // 旧写法只给 swirl/trace 起了循环，oscillate/staged/texture/layer 从不推进 ——
  // 表现是：按住 1.6 秒读数条纹丝不动（value 恒 0），松手时 commitStep 拿
  // 未推进的 state 去判定，却仍判成「完成」，端到端探针里呈现为
  // 「1c 通过（步进前进）但 1b 转红（读数不动）」的自相矛盾结果。
  rafId = requestAnimationFrame(frameLoop);
}

/**
 * 采样型机制（swirl / trace）的坐标归一化。
 *
 * ⚠️ 必须**正方形归一化**，不能用捕获层的宽高各自归一化。
 * 事件来自 `.gesture-capture`（实测 504×132，宽高比 3.8:1），
 * 而引导线画在 SVG 里是1:1 的正方形坐标系（viewBox 0 0 100 100）。
 * 直接用 (clientX-left)/width、(clientY-top)/height 会把 y 压缩 3.8 倍
 * ⇒ 点位与引导线永远对不上，端到端探针实测「progress 到 98 但判定失败」。
 *
 * 正确做法：以捕获层中心为原点，取**较短边**为半径做归一化，
 * 这样「屏幕上的正方形」与「SVG 的正方形」一一对应。
 */
function localSquarePoint(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  const size = Math.min(rect.width, rect.height);
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left - (rect.width - size) / 2) / size + 0.5)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top - (rect.height - size) / 2) / size + 0.5)),
  };
}

function onStationMove(event) {
  const gesture = pointer.value;
  if (!gesture || event.pointerId !== gesture.id) return;
  const state = stepStates.value[gesture.orderId]?.[gesture.stepId];
  if (!state) return;
  const isSampling = gesture.def.kind === 'swirl' || gesture.def.kind === 'trace';
  const point = isSampling ? localSquarePoint(event) : localPoint(event);
  if (gesture.def.kind === 'swirl')
    patchStepState(gesture.stepId, sampleSwirl(state, point), gesture.orderId);
  else if (gesture.def.kind === 'trace')
    patchStepState(gesture.stepId, sampleTrace(state, point, latteGuideY), gesture.orderId);
}

function onStationUp(event) {
  const gesture = pointer.value;
  if (!gesture || (event?.pointerId != null && event.pointerId !== gesture.id)) return;
  const state = stepStates.value[gesture.orderId]?.[gesture.stepId];
  cancelPointer();
  if (!state) return;
  commitStep(gesture.stepId, state, gesture.orderId);
}

/** 按住型机制（oscillate/staged/texture/layer）的每帧推进 */
function frameLoop(timestamp) {
  const gesture = pointer.value;
  if (!gesture || !holding.value) return;
  const state = stepStates.value[gesture.orderId]?.[gesture.stepId];
  if (!state) return;
  if (!lastFrameAt) lastFrameAt = timestamp;
  const delta = Math.min(0.05, (timestamp - lastFrameAt) / 1000);
  lastFrameAt = timestamp;
  // swirl / trace 是**采样型**：状态由 pointermove 的 sampleSwirl / sampleTrace 更新，
  // 不能用时间推进（否则会凭空累积）。这里只维持循环，实际更新交给 move 事件。
  const isSampling = gesture.def.kind === 'swirl' || gesture.def.kind === 'trace';
  const next = isSampling
    ? state
    : stepTick(gesture.def, state, delta, { served: stats.value.served });
  if (!isSampling) patchStepState(gesture.stepId, next, gesture.orderId);
  if (gesture.def.kind === 'oscillate' && next.stable) {
    commitStep(gesture.stepId, next, gesture.orderId);
    return;
  }
  if (gesture.def.kind === 'staged' && next.status === 'exhausted') {
    // 撞到 100 = 过萃，必须停下等玩家看到结果，不能继续涨
    commitStep(gesture.stepId, next, gesture.orderId);
    return;
  }
  rafId = requestAnimationFrame(frameLoop);
}

function ventExtractor() {
  const stepId = currentStepId.value;
  if (STEP_DEFINITIONS[stepId]?.kind !== 'staged') return;
  const state = ensureStepState(stepId);
  patchStepState(stepId, { ...state, ventedAt: state.value });
  sfx('pump');
}

function doseIngredient() {
  const stepId = currentStepId.value;
  const def = STEP_DEFINITIONS[stepId];
  if (!def || (def.kind !== 'timed' && def.kind !== 'sequenced') || !canInteract()) return;
  const state = ensureStepState(stepId);
  const next = doseOnce(def, state, Date.now());
  patchStepState(stepId, next);
  sfx('pump');
  // ⚠️ 投够数必须**立刻提交**。旧实现只patch 状态等玩家再点一次，
  // 端到端探针表现为「点了 2~3 次投料，done 计数纹丝不动」——
  // 因为 doseOnce 把最后一次的 status 设成 'holding'（等提交），
  // 而投料类没有 pointerup 路径，state 就永远卡在 holding。
  if (next.added >= def.targetCount) commitStep(stepId, next);
}

function resetCurrentStep() {
  const stepId = currentStepId.value;
  if (!stepId || canServe.value) return;
  cancelPointer();
  patchStepState(stepId, createStepState(stepId, { served: stats.value.served }));
  setOrderField('feedback', `已重置「${STEP_DEFINITIONS[stepId].name}」`);
  sfx('tap');
}

/**
 * 提交一步：唯一判定入口（P0-3四档惩罚在这里落地）
 */
function commitStep(stepId, state, orderId = activeOrderId.value) {
  const def = STEP_DEFINITIONS[stepId];
  const env = {
    melted:
      def.kind === 'timed' && order.value?.meltStartedAt
        ? Date.now() - order.value.meltStartedAt > (order.value.meltMs || def.meltMs)
        : false,
    elapsedMs: order.value?.meltStartedAt ? Date.now() - order.value.meltStartedAt : 0,
  };
  const result = stepCommit(def, state, env);
  patchStepState(stepId, result, orderId);

  if (result.grade === 'fail') {
    // P0-3：Fail 扣 15 耐心并清连击（旧实现只扣 8 且不清连击）
    stats.value = { ...stats.value, combo: 0 };
    sfx('error');
  } else if (result.grade === 'fair') {
    stats.value = { ...stats.value, combo: 0 };
    sfx('error');
  } else {
    sfx(result.grade === 'perfect' ? 'perfect' : 'success');
  }

  const target = orders.value.find((item) => item.id === orderId);
  if (!target) return;
  const updated = applyStepResult(target, result, stepId);
  orders.value = orders.value.map((item) => (item.id === updated.id ? updated : item));

  if (def.id === 'staged' && result.grade !== 'fail')
    machineHeat.value = Math.min(
      100,
      machineHeat.value + Math.max(12, 25 - upgrades.value.machine * 4),
    );
  if (def.id === 'texture' && result.grade !== 'fail')
    steamCleanliness.value = Math.max(
      0,
      steamCleanliness.value - Math.max(14, 29 - upgrades.value.steam * 3),
    );

  // ⚠️ 失败时**不能**写「下一步：xxx」—— 步骤没推进（applyStepResult 里 fail 不 +1），
  // 那样写等于告诉玩家「已经进入下一步」，而按钮其实还停在原地。
  // 2026-10-08 实测症状：长按没稳住后反馈永久停在
  // 「没能稳住转速 · 下一步：萃取浓缩」，玩家以为按钮坏了。
  if (result.grade === 'fail') {
    setOrderField('feedback', `${result.message} · 这一步要重做`);
    setOrderField('feedbackTone', 'error');
    // 关键：把状态复位，否则 canInteract() 见到 'failed' 会让长按彻底无反应。
    // 给一个短的「看清失败提示」的窗口再自动复位。
    taskScheduler.schedule(() => {
      const current = stepStates.value[orderId]?.[stepId];
      if (current?.status !== 'failed') return;
      // 直接删掉，让下次 ensureStepState 重建一个干净的 idle 状态
      const perOrder = { ...(stepStates.value[orderId] || {}) };
      delete perOrder[stepId];
      stepStates.value = { ...stepStates.value, [orderId]: perOrder };
    }, 900);
    return;
  }

  const followUp = nextStepFeedback(updated);
  setOrderField('feedback', `${result.message} · ${followUp.text}`);
  setOrderField('feedbackTone', followUp.tone);
  // 冰化倒计时：这一步做完就停表
  if (def.kind === 'timed' && updated.meltStartedAt === 0) updated.meltStartedAt = Date.now();

  // 下一步若是冰块，重新起倒计时
  const nextStepId =
    updated.stepIndex < drink.value.steps.length ? drink.value.steps[updated.stepIndex] : null;
  if (nextStepId === 'ice') {
    taskScheduler.schedule(() => {
      const target = orders.value.find((item) => item.id === updated.id);
      if (target && target.meltStartedAt === 0) target.meltStartedAt = Date.now();
    }, 400);
  }
}

function serveDrink() {
  if (phase.value !== 'playing' || isPaused.value || !order.value) return;
  if (!canServe.value) {
    setOrderField('patience', Math.max(5, (order.value.patience || 100) - 4));
    setOrderField('feedback', `还没有完成「${currentStep.value?.name}」`);
    sfx('error');
    return;
  }
  if (counterCleanliness.value < 16) {
    setOrderField('feedback', '操作台需要先清洁才能出杯');
    sfx('error');
    return;
  }
  const settlement = settleNormalServe(order.value, stats.value);
  if (!settlement) return;
  stats.value = mergeSettlement(stats.value, settlement);
  setOrderField('feedback', `出杯完成 · 品质 ${settlement.quality} · +${settlement.coinsDelta}`);
  setOrderField('feedbackTone', 'success');
  counterCleanliness.value = Math.max(0, counterCleanliness.value - 11);
  order.value.isResolving = true;
  sfx('success');
  taskScheduler.schedule(() => removeOrder(order.value.id), 650);
}

// ─────────────────────────── 一局生命周期 ───────────────────────────
function clearTimers() {
  window.clearInterval(gameTimer);
  window.clearInterval(catTimer);
  window.clearInterval(arrivalTimer);
  taskScheduler.clear();
  gameTimer = null;
  catTimer = null;
  arrivalTimer = null;
  pendingTask = null;
  cancelPointer();
}

function startGame() {
  clearTimers();
  taskScheduler.resume();
  resetOrderSerial();
  phase.value = 'playing';
  showMenu.value = false;
  showExitConfirm.value = false;
  isPaused.value = false;
  pauseReason.value = '';
  timeLeft.value = ROUND_SECONDS;
  stats.value = createStats();
  orders.value = [];
  activeOrderId.value = null;
  stepStates.value = {};
  customerCursor = -1;
  catAffinity.value = 0;
  catMood.value = 'idle';
  catMessage.value = '';
  hearts.value = [];
  discoveredMemories.value = [];
  memoryMessage.value = null;
  machineHeat.value = 0;
  steamCleanliness.value = 100;
  counterCleanliness.value = 100;
  maintenanceLock.value = '';
  lastPetAt = 0;
  lastPlayAt = 0;
  selectNextMemory();
  addOrder();
  addOrder();
  addOrder();
  sfx('success');

  const startedAt = Date.now();
  roundDeadline = startedAt + ROUND_SECONDS * 1000;
  lastGameTickAt = startedAt;

  gameTimer = window.setInterval(() => {
    if (isPaused.value || phase.value !== 'playing') return;
    const now = Date.now();
    const elapsed = Math.max(0, (now - lastGameTickAt) / 1000);
    lastGameTickAt = now;
    timeLeft.value = Math.max(0, Math.ceil((roundDeadline - now) / 1000));
    machineHeat.value = Math.max(
      0,
      machineHeat.value - (2.5 + upgrades.value.machine * 0.35) * elapsed,
    );
    orders.value = applyPatienceDecay(orders.value, elapsed, stats.value.served);
    collectExpiredOrders(orders.value, elapsed, stats.value.served).forEach(loseOrder);
    if (timeLeft.value <= 0) finishGame();
  }, 1000);

  arrivalTimer = window.setInterval(() => {
    if (!isPaused.value && phase.value === 'playing') addOrder();
  }, 10500);

  catTimer = window.setInterval(() => {
    if (isPaused.value || phase.value !== 'playing' || catMood.value === 'chase') return;
    catSpot.value = Math.floor(Math.random() * 3);
    catMood.value = Math.random() > 0.7 ? 'sleep' : 'walk';
    catMessage.value = catMood.value === 'sleep' ? '呼噜…' : '';
    taskScheduler.schedule(() => {
      if (catMood.value !== 'chase') catMood.value = 'idle';
    }, 1800);
  }, 5600);
}

function finishGame() {
  if (phase.value !== 'playing') return;
  phase.value = 'result';
  showMenu.value = false;
  isPaused.value = false;
  clearTimers();
  bestScore.value = Math.max(bestScore.value, stats.value.coins);
  wallet.value += stats.value.coins;
  persistRound({ bestScore: bestScore.value, wallet: wallet.value, upgrades: upgrades.value });
  sfx('success');
}

function purchaseUpgrade(item) {
  if (wallet.value < item.cost || item.level >= 3) return;
  wallet.value -= item.cost;
  upgrades.value = { ...upgrades.value, [item.id]: item.level + 1 };
  persistWalletAndUpgrades({ wallet: wallet.value, upgrades: upgrades.value });
  sfx('success');
}

/**
 * 暂停/恢复（单一实现）。
 * ⚠️ 恢复时要把 roundDeadline 顺延暂停时长，否则「暂停 30 秒回来只剩 30 秒」——
 * 这是原实现的关键修正点，暂停时计时器真的停摆（taskScheduler.pause），所以要手动补。
 */
function togglePause() {
  if (phase.value !== 'playing') return;
  if (isPaused.value) {
    const resumedAt = Date.now();
    roundDeadline += Math.max(0, resumedAt - pausedAt);
    lastGameTickAt = resumedAt;
    isPaused.value = false;
    pauseReason.value = '';
    taskScheduler.resume();
    nextTick(() => lastFocusedElement?.focus?.());
  } else {
    pausedAt = Date.now();
    isPaused.value = true;
    pauseReason.value = '';
    lastFocusedElement = document.activeElement;
    cancelPointer();
    taskScheduler.pause();
    nextTick(() => pauseResumeButton.value?.focus());
  }
  sfx('tap');
}

function requestExit(target) {
  if (phase.value !== 'playing') {
    if (target === 'home') router.push('/');
    else returnToIntro();
    return;
  }
  exitTarget.value = target;
  exitWasPaused = isPaused.value;
  if (!isPaused.value) togglePause();
  showExitConfirm.value = true;
  nextTick(() => exitCancelButton.value?.focus());
}

function cancelExit() {
  showExitConfirm.value = false;
  if (!exitWasPaused && isPaused.value) togglePause();
  else nextTick(() => pauseResumeButton.value?.focus());
}

function confirmExit() {
  const target = exitTarget.value;
  showExitConfirm.value = false;
  if (target === 'home') {
    clearTimers();
    router.push('/');
    return;
  }
  returnToIntro();
}

function returnToIntro() {
  clearTimers();
  taskScheduler.resume();
  phase.value = 'intro';
  showMenu.value = false;
  showExitConfirm.value = false;
  memoryMessage.value = null;
  activeMemoryId.value = null;
  orders.value = [];
  activeOrderId.value = null;
  isPaused.value = false;
  pauseReason.value = '';
}

function handleGlobalKeydown(event) {
  if (event.key !== 'Escape') return;
  if (showExitConfirm.value) return cancelExit();
  if (showMenu.value) {
    showMenu.value = false;
    return;
  }
  if (isPaused.value) togglePause();
}

function handleVisibilityChange() {
  if (document.hidden && phase.value === 'playing' && !isPaused.value) {
    pausedAt = Date.now();
    isPaused.value = true;
    pauseReason.value = '切换页面时已自动暂停';
    cancelPointer();
    taskScheduler.pause();
  }
}

onMounted(() => {
  document.documentElement.classList.add('anniversary-cafe-open');
  document.addEventListener('keydown', handleGlobalKeydown);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  bestScore.value = readBestScore();
  wallet.value = readWallet();
  upgrades.value = readUpgrades();
  /**
   * 开发期调试钩子（仅 `import.meta.env.DEV`，生产构建里不存在）。
   * 用途：让探针能直接指定开局配方 —— 否则 8 款咖啡里只有 4 款含 `pour`，
   * 随机开局下端到端探针有相当概率跑不到拉花/分层这些机制
   * （实测 switchToKind 找 24 轮都遇不到 trace）。
   * 用法：window.__cafeDebug.forceDrink('latte')
   */
  if (import.meta.env.DEV) {
    window.__cafeDebug = {
      forceDrink: (drinkId) => {
        const drink = DRINKS.find((item) => item.id === drinkId) || DRINKS[0];
        const target = order.value;
        if (!target) return false;
        target.drinkId = drink.id;
        target.stepIndex = 0;
        target.stepQualities = [];
        target.grades = [];
        target.layerHeights = {};
        target.feedback = `先完成「${STEP_DEFINITIONS[drink.steps[0]].name}」`;
        stepStates.value = {};
        return true;
      },
      setStep: (stepId) => {
        const target = order.value;
        if (!target || !STEP_DEFINITIONS[stepId]) return false;
        const drink = DRINKS.find((item) => item.steps.includes(stepId));
        if (drink) target.drinkId = drink.id;
        target.stepIndex = Math.max(0, (drink?.steps || []).indexOf(stepId));
        target.stepQualities = [];
        target.grades = [];
        target.layerHeights = {};
        stepStates.value = {};
        return true;
      },
      list: () => ({ drink: order.value?.drinkId, step: getCurrentStepId(order.value) }),
    };
  }
});

onUnmounted(() => {
  clearTimers();
  document.removeEventListener('keydown', handleGlobalKeydown);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  document.documentElement.classList.remove('anniversary-cafe-open');
  if (typeof window !== 'undefined') delete window.__cafeDebug;
});
</script>

<template>
  <main class="cafe-game" :style="{ '--cafe-image': `url(${BACKDROP_URL})` }">
    <div class="cafe-backdrop" aria-hidden="true"></div>
    <div class="cafe-shade" aria-hidden="true"></div>

    <!-- ═══ 顶栏：整页栅格的第一行，不再 absolute 浮在内容之上 ═══
         旧版 top-bar 是 absolute + .cafe-stage 用 padding-top 顶开，
         两套定位互不知情 ⇒ 实测重叠 24180px²。这里改成同一个 grid 的独立行。 -->
    <header class="top-bar" :inert="isPaused || showExitConfirm">
      <div class="top-row">
        <button
          type="button"
          class="brand-lockup"
          aria-label="返回开场"
          @click="requestExit('intro')"
        >
          <span class="brand-mark">BOH</span>
          <span class="brand-text"><strong>云上咖啡店</strong><small>八周年营业日</small></span>
        </button>

        <div v-if="phase === 'playing'" class="day-progress" aria-label="营业时间进度">
          <span class="day-label">营业中</span>
          <div class="day-track"><i :style="{ transform: `scaleX(${progress / 100})` }"></i></div>
          <strong class="day-time">{{ timeLeft }}s</strong>
        </div>

        <div v-if="phase === 'playing'" class="hud" aria-label="营业数据" aria-live="polite">
          <div>
            <small>营业额</small><strong>¥{{ stats.coins }}</strong>
          </div>
          <div>
            <small>已出杯</small><strong>{{ stats.served }}</strong>
          </div>
          <div :class="{ active: stats.combo > 1 }">
            <small>连杯</small><strong>× {{ stats.combo }}</strong>
          </div>
        </div>

        <div class="bar-actions">
          <button
            type="button"
            class="icon-button"
            aria-label="返回网站首页"
            @click="requestExit('home')"
          >
            <House :size="17" />
          </button>
          <button
            type="button"
            class="icon-button"
            :aria-label="soundEnabled ? '关闭音效' : '打开音效'"
            @click="soundEnabled = !soundEnabled"
          >
            <Volume2 v-if="soundEnabled" :size="17" /><VolumeX v-else :size="17" />
          </button>
          <button
            v-if="phase === 'playing'"
            type="button"
            class="icon-button"
            :aria-label="isPaused ? '继续营业' : '暂停营业'"
            @click="togglePause"
          >
            <Play v-if="isPaused" :size="17" /><Pause v-else :size="17" />
          </button>
        </div>
      </div>
    </header>

    <!-- ═══ 游戏区 ═══ -->
    <section
      v-if="phase === 'playing'"
      class="cafe-stage"
      :class="{ paused: isPaused }"
      :inert="isPaused || showExitConfirm"
    >
      <!-- 订单条：横向滚动的单行胶囊（旧版是三列卡，每列 123px 挤 5 行字） -->
      <nav class="order-strip" aria-label="待制作订单">
        <span class="strip-label">ORDER QUEUE</span>
        <div class="strip-track">
          <button
            v-for="queuedOrder in orders"
            :key="queuedOrder.id"
            type="button"
            class="order-pill"
            :class="{
              active: queuedOrder.id === activeOrderId,
              resolving: queuedOrder.isResolving,
              warning: queuedOrder.patience < 35,
            }"
            :disabled="queuedOrder.isResolving"
            @click="selectOrder(queuedOrder.id)"
          >
            <img :src="skinUrl(getCustomer(queuedOrder.customerIndex).imageKey)" alt="" />
            <span class="pill-text">
              <b>{{ getCustomer(queuedOrder.customerIndex).name }}</b>
              <small>{{ getDrink(queuedOrder).name }}</small>
            </span>
            <span class="pill-patience"
              ><i :style="{ transform: `scaleX(${queuedOrder.patience / 100})` }"></i
            ></span>
          </button>
          <span v-if="queueCount === 0" class="strip-empty">暂时没有等待的客人</span>
        </div>
        <strong class="strip-count">{{ queueCount }} / {{ MAX_CONCURRENT_ORDERS }}</strong>
      </nav>

      <!-- 舞台：顾客 + 猫（桌面三栏的中间栏，竖屏占 1fr） -->
      <div class="stage-floor">
        <div v-if="order" class="customer-zone" :key="order.id">
          <img
            class="mc-customer"
            :src="currentCustomer.image"
            :alt="`${currentCustomer.name} 的Minecraft 皮肤角色`"
          />
          <div class="speech-ticket">
            <div class="ticket-topline">
              <span>{{ currentCustomer.name }}</span>
              <span class="patience-dot" :class="{ warning: order.patience < 35 }"></span>
            </div>
            <strong>{{ drink.name }}</strong>
            <small>{{ currentCustomer.note }}</small>
            <div class="patience-track" aria-label="顾客耐心">
              <i :style="{ transform: `scaleX(${order.patience / 100})` }"></i>
            </div>
          </div>
        </div>

        <div class="cat-zone" :style="catPositionStyle">
          <TransitionGroup name="heart-rise">
            <Heart
              v-for="heart in hearts"
              :key="heart.id"
              class="cat-heart"
              :style="{ left: `${heart.left}%` }"
              :size="18"
              fill="currentColor"
            />
          </TransitionGroup>
          <span v-if="catMessage" class="cat-bubble">{{ catMessage }}</span>
          <button
            type="button"
            class="voxel-cat"
            :class="`mood-${catMood}`"
            :aria-label="`摸摸小满（冷却 ${CAT_PET_COOLDOWN_MS / 1000} 秒，${anyStepInProgress ? '制作中不能摸' : '可摸'}）`"
            :disabled="anyStepInProgress"
            @pointerdown="petCat"
          >
            <span class="cat-tail"></span><span class="cat-body"></span
            ><span class="cat-chest"></span>
            <span class="cat-head"
              ><i class="ear left"></i><i class="ear right"></i><i class="eye left"></i
              ><i class="eye right"></i><i class="nose"></i
            ></span>
            <span class="cat-paw left"></span><span class="cat-paw right"></span>
          </button>
          <div class="cat-controls">
            <button
              type="button"
              class="toy-button"
              :disabled="anyStepInProgress || catMood === 'chase'"
              @click="playWithCat"
            >
              <span aria-hidden="true"></span>逗猫
            </button>
            <button
              type="button"
              class="help-button"
              :disabled="!catHelpReady"
              @click="askCatForHelp"
            >
              <Heart :size="13" :fill="catHelpReady ? 'currentColor' : 'none'" />
              {{ catHelpReady ? '小满救场' : `${catAffinity}/${CAT_HELP_COST}` }}
              <small>本局剩 {{ MAX_CAT_RESCUES - stats.rescuesUsed }} 次</small>
            </button>
          </div>
        </div>

        <!-- 设备条：舞台右栏。⚠️ 必须在 .stage-floor 内部——
             放在外面时它和 .workbench 同占 grid-area: bench，实测重叠 15459px²。 -->
        <aside class="equipment-bar" aria-label="设备状态">
          <header>
            <span>EQUIPMENT</span><strong>{{ maintenanceLock ? '维护中' : '设备' }}</strong>
          </header>
          <button
            type="button"
            :class="{ danger: machineHeat >= 72 }"
            :disabled="Boolean(maintenanceLock)"
            @click="serviceEquipment('machine')"
          >
            <Gauge :size="14" />
            <span class="eq-text"
              ><b>锅炉</b><i><em :style="{ transform: `scaleX(${machineHeat / 100})` }"></em></i
            ></span>
            <strong>{{ Math.round(machineHeat) }}%</strong>
          </button>
          <button
            type="button"
            :class="{ danger: steamCleanliness <= 38 }"
            :disabled="Boolean(maintenanceLock)"
            @click="serviceEquipment('steam')"
          >
            <Milk :size="14" />
            <span class="eq-text"
              ><b>蒸汽</b
              ><i><em :style="{ transform: `scaleX(${steamCleanliness / 100})` }"></em></i
            ></span>
            <strong>{{ Math.round(steamCleanliness) }}%</strong>
          </button>
          <button
            type="button"
            :class="{ danger: counterCleanliness <= 32 }"
            :disabled="Boolean(maintenanceLock)"
            @click="serviceEquipment('counter')"
          >
            <Sparkles :size="14" />
            <span class="eq-text"
              ><b>台面</b
              ><i><em :style="{ transform: `scaleX(${counterCleanliness / 100})` }"></em></i
            ></span>
            <strong>{{ Math.round(counterCleanliness) }}%</strong>
          </button>
        </aside>
      </div>

      <button
        v-if="activeMemory"
        type="button"
        class="memory-poster"
        :aria-label="`查看方块之家回忆：${activeMemory.title}`"
        @click="discoverMemory(activeMemory)"
      >
        <img :src="activeMemory.image" :alt="activeMemory.title" />
        <span>{{ activeMemory.year }}</span>
      </button>

      <Transition name="memory-pop">
        <aside v-if="memoryMessage" class="memory-reveal" role="status">
          <img :src="memoryMessage.image" :alt="memoryMessage.title" />
          <div>
            <small>BOH MEMORY · {{ memoryMessage.year }}</small
            ><strong>{{ memoryMessage.title }}</strong>
            <p>{{ memoryMessage.detail }}</p>
          </div>
          <button type="button" aria-label="收起回忆" @click="closeMemory"><X :size="15" /></button>
        </aside>
      </Transition>

      <!-- 操作台：横贯全宽，装置在左、控制区在右 -->
      <section v-if="order" class="workbench" aria-label="咖啡制作台">
        <header class="ticket-rail">
          <button
            type="button"
            class="menu-toggle"
            aria-controls="cafe-menu-sheet"
            :aria-expanded="showMenu"
            @click="showMenu = !showMenu"
          >
            <Coffee :size="15" /><span>{{ drink.name }}</span>
          </button>
          <ol class="process-steps">
            <li
              v-for="(stepId, index) in drink.steps"
              :key="stepId"
              :class="{
                done: index < order.stepIndex,
                active: index === order.stepIndex && !canServe,
              }"
            >
              <component :is="stepIcon(stepId)" :size="13" />
              <span>{{ STEP_DEFINITIONS[stepId]?.short }}</span>
              <b v-if="index < order.stepIndex" :class="`grade-${order.grades[index]}`">{{
                order.grades[index] === 'perfect' ? '★' : order.stepQualities[index]
              }}</b>
            </li>
          </ol>
          <div class="quality-readout">
            <small>本杯品质</small><strong>{{ currentQuality || '--' }}</strong>
          </div>
        </header>

        <div class="machine-deck">
          <StationPanel
            class="deck-station"
            :step-id="currentStepId"
            :state="stepState || createStepState(currentStepId || 'serve')"
            :holding="holding"
            :interactive="
              Boolean(currentStep) && !['timed', 'sequenced'].includes(currentStep?.kind)
            "
            :can-serve="canServe"
            @pointer-down="onStationDown"
            @pointer-move="onStationMove"
            @pointer-up="onStationUp"
            @dose="doseIngredient"
            @vent="ventExtractor"
          />

          <div
            v-if="interactiveStation"
            class="gesture-capture"
            :class="`capture-${currentStep.kind}`"
            @pointerdown="onStationDown"
            @pointermove="onStationMove"
            @pointerup="onStationUp"
            @pointercancel="onStationUp"
          ></div>

          <div class="control-bay">
            <div class="control-heading">
              <span
                >STEP {{ Math.min(order.stepIndex + 1, drink.steps.length) }} /
                {{ drink.steps.length }}</span
              >
              <strong>{{ canServe ? '制作完成' : currentStep?.name }}</strong>
              <small>{{ canServe ? '检查品质并交给顾客' : currentStep?.instruction }}</small>
            </div>

            <p class="feedback" :class="order.feedbackTone" role="status">{{ order.feedback }}</p>

            <div class="grade-legend" aria-label="判定档位说明">
              <span v-for="g in ['perfect', 'good', 'fair', 'fail']" :key="g" :class="`lg-${g}`">{{
                GRADES[g].label
              }}</span>
              <small>失误会清连击并扣{{ GRADES.fail.patiencePenalty }} 耐心</small>
            </div>

            <div class="machine-actions">
              <button
                v-if="!canServe"
                type="button"
                class="reset-button"
                :disabled="stepState?.status === 'settled'"
                aria-label="重置当前步骤"
                @click="resetCurrentStep"
              >
                <Trash2 :size="17" />
              </button>
              <button
                v-if="currentStep && ['timed', 'sequenced'].includes(currentStep.kind)"
                type="button"
                class="machine-button"
                @click="doseIngredient"
              >
                <Sparkles :size="17" />{{ currentStep.action }}
              </button>
              <button
                v-else-if="currentStep?.kind === 'staged'"
                type="button"
                class="machine-button"
                :class="{ running: holding }"
                @pointerdown="onStationDown"
                @pointerup="onStationUp"
                @pointercancel="onStationUp"
              >
                <Gauge :size="17" />{{ holding ? '收萃' : currentStep.action }}
              </button>
              <button v-else-if="canServe" type="button" class="serve-button" @click="serveDrink">
                <Send :size="18" />出杯给 {{ currentCustomer.name }}
              </button>
              <button
                v-else-if="currentStep"
                type="button"
                class="machine-button hold-button"
                :class="{ running: holding }"
                @pointerdown="onStationDown"
                @pointerup="onStationUp"
                @pointercancel="onStationUp"
              >
                <component :is="stepIcon(currentStepId)" :size="17" />{{
                  holding ? '松手提交' : currentStep.action
                }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <Transition name="menu-pop">
        <aside v-if="showMenu" id="cafe-menu-sheet" class="menu-sheet" aria-label="完整菜单">
          <div class="menu-sheet-head">
            <div><small>MENU / 今日菜单</small><strong>云上咖啡</strong></div>
            <button
              type="button"
              class="icon-button"
              aria-label="关闭菜单"
              @click="showMenu = false"
            >
              <X :size="17" />
            </button>
          </div>
          <div v-for="menuDrink in DRINKS" :key="menuDrink.id" class="menu-line">
            <span :style="{ '--drink-color': menuDrink.color }"></span>
            <strong>{{ menuDrink.name }}</strong>
            <small>{{
              menuDrink.steps.map((step) => STEP_DEFINITIONS[step].short).join(' → ')
            }}</small>
            <b>¥{{ menuDrink.price }}</b>
          </div>
        </aside>
      </Transition>
    </section>

    <!-- ═══ 开场 ═══ -->
    <section v-if="phase === 'intro'" class="opening-panel">
      <p class="opening-kicker">BLOCK OF HOME · 8TH ANNIVERSARY</p>
      <h1>亲手做一杯<br />云上的咖啡。</h1>
      <p class="opening-copy">
        每一步都是不同的手艺：稳住转速、中途排气、绕圈注水、找准进气时机、分层不能混、拉花跟着线走。
        三位客人同时在等 —— 而认真做一杯，永远比让小满救场更划算。
      </p>
      <div class="opening-meta">
        <span
          ><strong>{{ ROUND_SECONDS }}</strong> 秒营业</span
        ><span
          ><strong>{{ MAX_CONCURRENT_ORDERS }}</strong> 单并行</span
        ><span
          ><strong>{{ DRINKS.length }}</strong> 款咖啡</span
        >
      </div>
      <button type="button" class="start-button" @click="startGame">
        <Play :size="18" fill="currentColor" />开始营业
      </button>
      <p v-if="bestScore" class="best-score">历史最佳营业额 ¥{{ bestScore }}</p>
    </section>

    <!-- ═══ 打烊 ═══ -->
    <section v-if="phase === 'result'" class="result-panel">
      <p class="opening-kicker">CLOSED · 今日打烊</p>
      <div class="result-stars" :aria-label="`${stars} 星评价`">
        <Sparkles
          v-for="star in 3"
          :key="star"
          :class="{ lit: star <= stars }"
          :size="22"
          fill="currentColor"
        />
      </div>
      <h2>{{ resultTitle }}</h2>
      <p>最后一位客人离开后，小满跳上操作台，认真检查了咖啡机和今天的账本。</p>
      <div class="result-grid">
        <div>
          <small>营业额</small><strong>¥{{ stats.coins }}</strong>
        </div>
        <div>
          <small>完成订单</small><strong>{{ stats.served }}</strong>
        </div>
        <div>
          <small>漏单</small><strong>{{ stats.missed }}</strong>
        </div>
        <div>
          <small>平均品质</small><strong>{{ averageQuality }}</strong>
        </div>
        <div>
          <small>最高连杯</small><strong>×{{ stats.bestCombo }}</strong>
        </div>
        <div>
          <small>小满救场</small><strong>{{ stats.rescuesUsed }} 次</strong>
        </div>
      </div>
      <section
        v-if="discoveredMemories.length"
        class="memory-log"
        aria-label="本局发现的方块之家回忆"
      >
        <header>
          <span>今日找到的回忆</span
          ><strong>{{ discoveredMemories.length }} / {{ memoryList.length }}</strong>
        </header>
        <div>
          <span v-for="memory in discoveredMemories" :key="memory.id"
            ><img :src="memory.image" alt="" /><b>{{ memory.year }}</b
            >{{ memory.title }}</span
          >
        </div>
      </section>
      <section class="upgrade-shop" aria-label="设备升级">
        <header>
          <span
            ><small>长期经营资金</small><strong>¥{{ wallet }}</strong></span
          ><b>永久升级</b>
        </header>
        <div v-for="item in upgradeCatalog" :key="item.id" class="upgrade-row">
          <span
            ><strong>{{ item.name }}</strong
            ><small>{{ item.description }}</small></span
          >
          <div class="upgrade-level" :aria-label="`${item.level} 级，共 3 级`">
            <i v-for="level in 3" :key="level" :class="{ filled: level <= item.level }"></i>
          </div>
          <button
            type="button"
            :disabled="item.level >= 3 || wallet < item.cost"
            @click="purchaseUpgrade(item)"
          >
            {{ item.level >= 3 ? '已满级' : `¥${item.cost} 升级` }}
          </button>
        </div>
      </section>
      <p class="result-note">今日营业额已存入长期经营资金，升级会保留到下一局。</p>
      <div class="result-actions">
        <button type="button" class="secondary-button" @click="returnToIntro">回到店外</button
        ><button type="button" class="start-button" @click="startGame">
          <RotateCcw :size="17" />再营业一次
        </button>
      </div>
    </section>

    <Transition name="pause-fade">
      <div
        v-if="isPaused && !showExitConfirm"
        class="pause-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cafe-pause-title"
        aria-describedby="cafe-pause-description"
      >
        <button ref="pauseResumeButton" type="button" aria-label="继续营业" @click="togglePause">
          <Play :size="26" fill="currentColor" />
        </button>
        <strong id="cafe-pause-title">暂停营业</strong>
        <span id="cafe-pause-description">{{
          pauseReason || '计时、订单、设备和顾客耐心都已暂停'
        }}</span>
      </div>
    </Transition>

    <Transition name="pause-fade">
      <div
        v-if="showExitConfirm"
        class="exit-confirm-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cafe-exit-title"
        aria-describedby="cafe-exit-description"
      >
        <section class="exit-confirm-panel">
          <strong id="cafe-exit-title">要结束本次营业吗？</strong>
          <p id="cafe-exit-description">本局营业额和进度不会保存，永久升级不会受到影响。</p>
          <div>
            <button
              ref="exitCancelButton"
              type="button"
              class="secondary-button"
              @click="cancelExit"
            >
              继续营业
            </button>
            <button type="button" class="danger-button" @click="confirmExit">
              结束并{{ exitTarget === 'home' ? '返回首页' : '回到店外' }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </main>
</template>
