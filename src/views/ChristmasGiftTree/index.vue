<script setup>
/**
 * 圣诞交换礼物（2026）
 *
 * 页面只做三件事：把树画好看、让头像能挂上去、把「什么时候出结果」说清楚。
 * 配对与揭晓都在服务端，这里的倒计时只是展示 —— 到点也必须重新问一次服务端，
 * 不能靠本地时钟自己把结果翻出来。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { useAvatarFrame } from '@/composables/useAvatarFrame';
import { useAuthStore } from '@/stores/auth';

import AdminDock from './components/AdminDock.vue';
import JoinSheet from './components/JoinSheet.vue';
import TreeScene from './components/TreeScene.vue';
import { useXmasExchange } from './composables/useXmasExchange.js';
import { buildHangerLayout } from './data/tree-layout.js';

const router = useRouter();
const auth = useAuthStore();
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

onMounted(async () => {
  // 先告诉 composable「我是谁」，名单回来时才能把我标出来
  setViewer(auth.userInfo.id);
  await refresh();
});

/*
 * 到点自动问服务端。
 * 这里**不能**用本地时间直接翻结果 —— 本地时钟可能不准，配对也由服务端生成；
 * 倒计时归零只是「该去看一眼了」的信号。
 */
watch(isRevealed, (revealed) => {
  if (revealed) loadResult();
});

/** '' | 'intro' | 'leave' */
const sheetMode = ref('');
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
  if (isSignedUp.value) return '已参与 · 退出交换';
  // phase 只在「运营关了展示 / 活动还是草稿」时才是 closed，与「报名已截止」不是一回事
  if (phase.value === 'closed') return '活动还没开始';
  if (isPastDeadline.value) return '报名已截止';
  return '交换礼物';
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
  if (ctaDisabled.value) return;
  sheetMode.value = isSignedUp.value ? 'leave' : 'intro';
}

async function onSheetConfirm() {
  if (isLeaveSheet.value) {
    const result = await leave();
    if (result.ok) sheetMode.value = '';
    return;
  }
  const result = await join();
  if (result.ok) sheetMode.value = '';
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
          把头像挂上树，<br />
          <span class="xmas-heading-em">交换一份圣诞礼物</span>
        </h1>
        <p class="xmas-lede">
          一个人的圣诞树是装饰，一群人的圣诞树才叫节日。挂上头像，剩下的交给那一天。
        </p>

        <div class="xmas-clock">
          <p class="clock-label">{{ isRevealed ? '交换结果已于' : '交换结果将在' }}</p>
          <p class="clock-value">
            <strong>{{ revealLabel }}</strong>
            <span>随机产生</span>
          </p>
          <p class="clock-left">
            <template v-if="isRevealed">结果已经揭晓</template>
            <template v-else-if="isPastDeadline">已经截止，等揭晓吧</template>
            <template v-else
              >还有 <em>{{ countdownText }}</em></template
            >
          </p>
        </div>

        <!--
          揭晓后才可能出现。数据来自服务端：未到点时那边连 partner 字段都不返回，
          所以这里不需要、也不应该在前端做「藏起来」。
        -->
        <div v-if="isRevealed && isSignedUp" class="xmas-result">
          <p class="result-label">你的圣诞礼物来自</p>
          <template v-if="result && result.partner">
            <p class="result-name">@{{ result.partner.username }}</p>
            <router-link class="result-link" :to="`/profile/${result.partner.username}`">
              去 TA 的主页
            </router-link>
          </template>
          <p v-else-if="result && result.code === 'SANTA'" class="result-name">官方礼物</p>
          <p v-else class="result-name result-name--muted">正在读取结果…</p>
          <p v-if="result && result.code === 'SANTA'" class="result-hint">
            今年你轮到了官方兜底的那一份，记得查收。
          </p>
        </div>

        <button
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
          <template v-if="phase === 'closed'"> 这一轮还没开始，先把这一页收着 </template>
          <template v-else-if="roster.length">
            已有 <strong>{{ roster.length }}</strong> 位朋友把头像挂上了树
          </template>
          <template v-else>树还空着，来挂第一个头像吧</template>
        </p>
        <div
          class="xmas-meter"
          role="img"
          :aria-label="`树上已挂 ${roster.length} 位，最多 ${capacity} 位`"
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
              ? '这一轮的配对已经完成，礼物自己准备好就行'
              : isSignedUp
                ? '揭晓前随时可以退出，头像会从树上取下来'
                : `最多 ${capacity} 位，礼物自己准备`
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
