<script setup>
/**
 * 圣诞交换礼物（2026）
 *
 * 页面只做三件事：把树画好看、让头像能挂上去、把「什么时候出结果」说清楚。
 * 配对与揭晓都在服务端，这里的倒计时只是展示 —— 到点也必须重新问一次服务端，
 * 不能靠本地时钟自己把结果翻出来。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';

import { useAvatarFrame } from '@/composables/useAvatarFrame';
import { isLitePerf, motionEase, motionMs, prefersReducedMotion } from '@/utils/motion.js';
import { useAuthStore } from '@/stores/auth';

import AdminDock from './components/AdminDock.vue';
import JoinSheet from './components/JoinSheet.vue';
import TreeScene from './components/TreeScene.vue';
import { useXmasExchange } from './composables/useXmasExchange.js';
import { buildHangerLayout } from './data/tree-layout.js';
import { resolveXmasPrimaryAction } from './xmas-login-gate.js';

const router = useRouter();
const auth = useAuthStore();
const { isLoggedIn, showLoginModal } = storeToRefs(auth);

const ctaRef = ref(null);
let flightClone = null;
let flightTarget = null;
let flightAnimation = null;
let flightTimer = 0;
let flightResizeHandler = null;

// 头像框没有落在 auth 的 userInfo 上，唯一真源是 useAvatarFrame 的 effectiveFrame
const { effectiveFrame } = useAvatarFrame();

const {
  phase,
  roster,
  slotCount,
  submitting,
  error,
  countdownText,
  isSignedUp,
  isPastDeadline,
  revealDue,
  isRevealed,
  revealLabel,
  capacity,
  result,
  setViewer,
  refresh,
  loadResult,
  join,
  leave,
} = useXmasExchange();

watch(
  [() => isLoggedIn.value, () => auth.userInfo.id],
  ([, userId]) => {
    setViewer(userId);
    void refresh();
  },
  { immediate: true },
);

/*
 * 到点自动问服务端。
 * 这里**不能**用本地时间直接翻结果 —— 本地时钟可能不准，配对也由服务端生成；
 * 倒计时归零只是「该去看一眼了」的信号。
 */
watch(revealDue, (due) => {
  if (due) loadResult();
});

/** '' | 'intro' | 'leave' */
const sheetMode = ref('');
const isUnmounted = ref(false);
const activeHangerId = ref(null);
/** 页面内管理面板。只在管理员身上出现，普通用户看不到这个入口 */
const adminOpen = ref(false);
const canManage = computed(() => auth.isAdmin);

const sheetOpen = computed(() => sheetMode.value !== '');
const isLeaveSheet = computed(() => sheetMode.value === 'leave');

/**
 * 树的占用率做成一排像素格：数字「8 / 20」看不出"还剩多少"，
 * 一排格子一眼就知道树还空不空。10 格，格数跟着容量走。
 */
const METER_CELLS = 10;
const meterCells = computed(() =>
  Array.from({ length: METER_CELLS }, (_, i) => {
    const filled = Math.round((roster.value.length / Math.max(1, capacity.value)) * METER_CELLS);
    return i < filled;
  }),
);

/**
 * 按 slot 取坐标：退出的人会留一个空位，其他人的位置绝不重排。
 * （如果按数组下标取坐标，中间有人一退，后面所有人都会往上挪一格。）
 */
const hangers = computed(() => {
  const layout = buildHangerLayout(Math.max(slotCount.value, roster.value.length));
  const bySlot = new Map(roster.value.map((person) => [person.slot, person]));
  return layout.hangers
    .map((slotPoint, index) => {
      const person = bySlot.get(index);
      if (!person) return null;
      return {
        ...person,
        // 自己用真实头像/头像框；未登录时留空，组件会退回首字母
        avatarUrl: person.isSelf ? auth.userInfo.avatarUrl || '' : person.avatarUrl,
        frameUrl: person.isSelf ? effectiveFrame.value?.url || '' : person.frameUrl,
        x: slotPoint.x,
        y: slotPoint.y,
        size: slotPoint.size,
      };
    })
    .filter(Boolean);
});

const ctaLabel = computed(() => {
  // 揭晓后服务端已经拒绝退出，按钮不能再写着「退出交换」—— 点了只会报错
  if (isRevealed.value && isSignedUp.value) return '结果已揭晓';
  if (isSignedUp.value) return '已参与 · 退出';
  // phase 只在「运营关了展示 / 活动还是草稿」时才是 closed，与「报名已截止」不是一回事
  if (phase.value === 'closed') return '活动未开始';
  if (isPastDeadline.value) return '报名已截止';
  if (!isLoggedIn.value) return '登录参与';
  return '参与交换';
});

const ctaDisabled = computed(
  () =>
    phase.value === 'closed' ||
    (isRevealed.value && isSignedUp.value) ||
    (!isSignedUp.value && isPastDeadline.value),
);

/** 背景雪花 / 星点都用下标推导参数，不用 Math.random：重渲染不会跳位 */
const snowflakes = Array.from({ length: 26 }, (_, i) => ({
  id: i,
  left: (i * 37 + 11) % 100,
  size: 2 + (i % 4),
  duration: 9 + ((i * 5) % 8),
  delay: -((i * 0.77) % 11),
  drift: ((i % 5) - 2) * 26,
  opacity: 0.35 + (i % 4) * 0.16,
}));

const stars = Array.from({ length: 34 }, (_, i) => ({
  id: i,
  left: (i * 53 + 7) % 100,
  top: (i * 29 + 5) % 62,
  size: i % 7 === 0 ? 3 : 2,
  delay: -((i * 0.41) % 6),
  opacity: 0.18 + (i % 5) * 0.12,
}));

function goHome() {
  router.push('/');
}

function onPrimaryClick() {
  cancelAvatarFlight();
  const action = resolveXmasPrimaryAction({
    isLoggedIn: isLoggedIn.value,
    isSignedUp: isSignedUp.value,
    ctaDisabled: ctaDisabled.value,
  });
  if (action === 'noop') return;
  if (action === 'login') {
    showLoginModal.value = true;
    return;
  }
  sheetMode.value = action === 'leave' ? 'leave' : 'intro';
}

async function onSheetConfirm() {
  if (!isLoggedIn.value) {
    sheetMode.value = '';
    showLoginModal.value = true;
    return;
  }
  if (isLeaveSheet.value) {
    const result = await leave();
    if (result.ok) sheetMode.value = '';
    return;
  }
  const result = await join();
  if (isUnmounted.value || !result.ok) return;
  sheetMode.value = '';
  await nextTick();
  window.clearTimeout(flightTimer);
  flightTimer = window.setTimeout(playSelfAvatarFlight, motionMs('--duration-fast', 180));
}

function cancelAvatarFlight() {
  window.clearTimeout(flightTimer);
  flightTimer = 0;
  flightAnimation?.cancel();
  flightAnimation = null;
  flightClone?.remove();
  flightClone = null;
  if (flightTarget) flightTarget.style.opacity = '1';
  flightTarget = null;
  if (flightResizeHandler) {
    window.removeEventListener('resize', flightResizeHandler);
    flightResizeHandler = null;
  }
}

onBeforeUnmount(() => {
  isUnmounted.value = true;
  cancelAvatarFlight();
});

async function playSelfAvatarFlight() {
  await nextTick();
  const source = ctaRef.value;
  const target = document.querySelector('.hanger[data-self="true"]');
  if (!source || !target) return;

  if (prefersReducedMotion() || isLitePerf()) {
    flightTarget = target;
    target.style.opacity = '0';
    flightAnimation = target.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: motionMs('--duration-press', 160),
      easing: motionEase('--ease-out', 'ease-out'),
    });
    await flightAnimation.finished.catch(() => {});
    cancelAvatarFlight();
    return;
  }

  const sourceRect = source.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const size = Math.max(1, targetRect.width);
  const sourceX = sourceRect.left + sourceRect.width / 2;
  const sourceY = sourceRect.top + sourceRect.height / 2;
  const targetX = targetRect.left + targetRect.width / 2;
  const targetY = targetRect.top + targetRect.height / 2;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const distance = Math.hypot(dx, dy);
  const lift = Math.min(140, Math.max(56, distance * 0.22));
  const startScale = Math.min(1.45, Math.max(1, 52 / size));

  const clone = target.cloneNode(true);
  clone.classList.add('xmas-flight-clone');
  clone.setAttribute('aria-hidden', 'true');
  clone.setAttribute('tabindex', '-1');
  clone.setAttribute('inert', '');
  Object.assign(clone.style, {
    position: 'fixed',
    left: `${sourceX - size / 2}px`,
    top: `${sourceY - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    margin: '0',
    transform: 'none',
    opacity: '0',
    zIndex: '60',
    pointerEvents: 'none',
    contain: 'none',
    willChange: 'transform, opacity',
  });
  clone.querySelector('.hanger-name')?.remove();
  target.style.opacity = '0';
  document.body.appendChild(clone);
  flightClone = clone;
  flightTarget = target;

  flightAnimation = clone.animate(
    [
      {
        transform: `translate3d(0, 0, 0) rotate(0deg) scale(${startScale})`,
        opacity: 0,
        offset: 0,
      },
      {
        transform: `translate3d(0, 0, 0) rotate(0deg) scale(${startScale})`,
        opacity: 1,
        offset: 0.12,
      },
      {
        transform: `translate3d(${dx * 0.58}px, ${dy * 0.58 - lift}px, 0) rotate(-4deg) scale(0.9)`,
        opacity: 1,
        offset: 0.58,
      },
      {
        transform: `translate3d(${dx}px, ${dy}px, 0) rotate(0deg) scale(1)`,
        opacity: 1,
        offset: 1,
      },
    ],
    {
      duration: motionMs('--motion-morph-in', 620),
      easing: motionEase('--ease-morph', 'cubic-bezier(0.3, 0.12, 0.15, 1)'),
      fill: 'forwards',
    },
  );

  flightResizeHandler = cancelAvatarFlight;
  window.addEventListener('resize', flightResizeHandler, { once: true });
  await flightAnimation.finished.catch(() => {});
  cancelAvatarFlight();
}

function onHangerSelect(id) {
  activeHangerId.value = activeHangerId.value === id ? null : id;
}
</script>

<template>
  <main class="xmas-page" :data-phase="phase">
    <div class="xmas-sky" aria-hidden="true"></div>
    <div class="xmas-stars" aria-hidden="true">
      <span
        v-for="star in stars"
        :key="star.id"
        :style="{
          left: `${star.left}%`,
          top: `${star.top}%`,
          width: `${star.size}px`,
          height: `${star.size}px`,
          '--star-op': star.opacity,
          animationDelay: `${star.delay}s`,
        }"
      ></span>
    </div>
    <div class="xmas-snow" aria-hidden="true">
      <span
        v-for="flake in snowflakes"
        :key="flake.id"
        :style="{
          left: `${flake.left}%`,
          width: `${flake.size}px`,
          height: `${flake.size}px`,
          animationDuration: `${flake.duration}s`,
          animationDelay: `${flake.delay}s`,
          '--drift': `${flake.drift}px`,
          '--flake-opacity': flake.opacity,
        }"
      ></span>
    </div>

    <header class="xmas-top">
      <button type="button" class="xmas-back" aria-label="返回首页" @click="goHome">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M14.5 5.5L8 12l6.5 6.5"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <span class="xmas-brand">方块之家 · BOH</span>

      <!-- 管理入口：只有管理员看得到。普通用户连按钮都不渲染，
           但真正的权限判定在服务端（current_user_is_admin），不靠这个 v-if 兜底。 -->
      <button
        v-if="canManage"
        type="button"
        class="xmas-admin-trigger"
        aria-label="打开名单管理"
        @click="adminOpen = true"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z"
            stroke="currentColor"
            stroke-width="1.8"
          />
          <path
            d="M4.5 12h-2M21.5 12h-2M12 4.5v-2M12 21.5v-2M6.7 6.7L5.3 5.3M18.7 18.7l-1.4-1.4M17.3 6.7l1.4-1.4M5.3 18.7l1.4-1.4"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
          />
        </svg>
        管理
      </button>
    </header>

    <div class="xmas-shell">
      <section class="xmas-stage" aria-label="圣诞树">
        <TreeScene :hangers="hangers" :active-id="activeHangerId" @select="onHangerSelect" />
      </section>

      <aside class="xmas-panel">
        <p class="xmas-kicker">
          <span aria-hidden="true"></span>BOH · CHRISTMAS 2026<span aria-hidden="true"></span>
        </p>
        <h1 class="xmas-heading">
          <span class="xmas-heading-em">圣诞交换礼物</span>
        </h1>
        <p class="xmas-lede">挂上头像，随机配对。礼物自行准备。</p>

        <div class="xmas-clock">
          <p class="clock-label">揭晓时间</p>
          <p class="clock-value">
            <strong>{{ revealLabel }}</strong>
            <span>GMT+8</span>
          </p>
          <p class="clock-left">
            <template v-if="isRevealed">结果已揭晓</template>
            <template v-else-if="isPastDeadline">报名已截止</template>
            <template v-else
              >距揭晓 <em>{{ countdownText }}</em></template
            >
          </p>
        </div>

        <!--
          揭晓后才可能出现。数据来自服务端：未到点时那边连 partner 字段都不返回，
          所以这里不需要、也不应该在前端做「藏起来」。
        -->
        <div v-if="isRevealed && isSignedUp" class="xmas-result">
          <p class="result-label">你的礼物来自</p>
          <template v-if="result && result.partner">
            <p class="result-name">@{{ result.partner.username }}</p>
            <router-link class="result-link" :to="`/profile/${result.partner.username}`">
              查看主页
            </router-link>
          </template>
          <p v-else-if="result && result.code === 'SANTA'" class="result-name">官方礼物</p>
          <p v-else class="result-name result-name--muted">读取中…</p>
          <p v-if="result && result.code === 'SANTA'" class="result-hint">
            本轮礼物由官方提供，请留意查收。
          </p>
        </div>

        <button
          ref="ctaRef"
          type="button"
          class="xmas-cta"
          :class="{ 'is-joined': isSignedUp, 'is-disabled': ctaDisabled }"
          :disabled="ctaDisabled"
          @click="onPrimaryClick"
        >
          <span v-if="isSignedUp" class="cta-dot" aria-hidden="true"></span>
          <svg
            v-else
            class="cta-icon"
            viewBox="0 0 12 12"
            width="18"
            height="18"
            aria-hidden="true"
          >
            <rect x="3" y="0" width="2" height="2" fill="currentColor" />
            <rect x="7" y="0" width="2" height="2" fill="currentColor" />
            <rect x="1" y="2" width="10" height="2" fill="currentColor" />
            <rect x="2" y="4" width="8" height="7" fill="currentColor" />
            <rect x="5" y="4" width="2" height="7" fill="#c07f34" />
          </svg>
          {{ ctaLabel }}
        </button>

        <p class="xmas-count" aria-live="polite">
          <template v-if="phase === 'closed'">本轮活动未开始</template>
          <template v-else-if="roster.length">
            <strong>{{ roster.length }}</strong> 人已参与
          </template>
          <template v-else>暂无参与者</template>
        </p>
        <div
          class="xmas-meter"
          role="img"
          :aria-label="`已参与 ${roster.length} 人，最多 ${capacity} 人`"
        >
          <span
            v-for="(on, i) in meterCells"
            :key="i"
            class="meter-cell"
            :class="{ 'is-on': on }"
            aria-hidden="true"
          ></span>
        </div>
        <p class="xmas-note">
          {{
            isRevealed
              ? '配对已完成 · 礼物自行准备'
              : isSignedUp
                ? '揭晓前可退出'
                : `最多 ${capacity} 人 · 礼物自行准备`
          }}
        </p>
      </aside>
    </div>

    <JoinSheet
      :open="sheetOpen"
      :mode="sheetMode || 'intro'"
      :submitting="submitting"
      :error="error"
      :reveal-label="revealLabel"
      :people-count="roster.length"
      :capacity="capacity"
      @close="sheetMode = ''"
      @confirm="onSheetConfirm"
    />

    <!-- 管理面板复用页面的像素材质；改完名单让页面重拉一次，树上的头像立刻同步 -->
    <AdminDock v-if="canManage" :open="adminOpen" @close="adminOpen = false" @changed="refresh" />
  </main>
</template>

<style scoped>
@import './style.scoped.css';
</style>
