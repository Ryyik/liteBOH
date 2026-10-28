/**
 * ActivityHeatmapLauncher — 「活跃轨迹」胶囊按钮 + 完整点阵弹窗
 *
 * 2026-10-27 抽出（单源）：这个交互原来写在 ProfileHomePanel 里，
 * 只有「我的」页有；他人空间（Profile/ProfileMain）要把同一套入口同步过去时，
 * 复制一份等于给「弹窗焦点管理 / 滚动锁 / 暗色桥接」各留一个未来会漂的副本。
 * 所以把小按钮 + 弹窗收进这里，两个页面都渲染这**同一个**组件。
 *
 * 设计取舍（用户定稿）：
 *   · 资料卡里只留一枚内容宽胶囊，标题行 + 点阵 + 图例全部搬进弹窗；
 *   · 胶囊上**不显示天数**（同一条数字在弹窗副标题里已有，摆按钮上只会把按钮撑成两段字）；
 *   · 弹窗 Teleport 到 body（页内祖先带 backdrop-filter / 入场动画的 transform 时，
 *     position:fixed 会被劫持成相对祖先定位 —— 这条踩过两次）；
 *   · 弹窗内的 ActivityHeatmap 用 `embedded` 变体：只去外壳与重复标题，点阵逻辑复用本体。
 */
<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import ActivityHeatmap from './ActivityHeatmap.vue';

const props = defineProps({
  /** get_user_activity_heatmap 的返回值；未就绪传 null */
  payload: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  /** 是否本人视角（访客视角隐藏「去发帖」入口） */
  isOwner: { type: Boolean, default: true },
});

const emit = defineEmits(['compose']);

/* 数字口径与 ActivityHeatmap 内部一致：active_days 是「有活动的天数」，
   total 是发帖 + 回复 —— 两处各算一遍会漂，所以这里只做展示用，
   真正统计仍以组件内 computed 为准（弹窗里显示的也是组件自己那份）。 */
const activeDays = computed(() => Number(props.payload?.active_days) || 0);
const totalCount = computed(
  () => (Number(props.payload?.total_posts) || 0) + (Number(props.payload?.total_comments) || 0),
);

const triggerLabel = computed(() => {
  if (props.loading) return '活跃轨迹，正在加载';
  if (!activeDays.value && !totalCount.value) return '活跃轨迹，还没有留下足迹，点击查看';
  return `活跃轨迹，过去一年 ${totalCount.value} 次、活跃 ${activeDays.value} 天，点击查看完整图`;
});

const sheetSubtitle = computed(() => {
  if (props.loading) return '正在加载…';
  // 零数据时**不返回副标题**：空态里已经写着「还没有留下足迹」，
  // 副标题再写一遍就是同一句话在弹窗里出现两遍（实测 innerText 是
  // "还没有留下足迹 还没有留下足迹"）。
  if (!activeDays.value && !totalCount.value) return '';
  return `过去一年 ${totalCount.value} 次 · 活跃 ${activeDays.value} 天`;
});

const isOpen = ref(false);
const closeRef = ref(null);

const openSheet = () => {
  isOpen.value = true;
  nextTick(() => closeRef.value?.focus?.());
};
const closeSheet = () => {
  isOpen.value = false;
};
const handleCompose = () => {
  closeSheet();
  emit('compose');
};

const handleKeydown = (event) => {
  if (event.key === 'Escape') closeSheet();
};

/* 滚动锁挂在 <html> 上：弹窗是 fixed 覆盖层，底下页面还能滚会穿帮。
   这里用 document.documentElement.classList 而不是 body，与其它模态框一致。 */
watch(isOpen, (open) => {
  if (open) {
    document.addEventListener('keydown', handleKeydown);
    document.documentElement.classList.add('profile-sheet-lock');
  } else {
    document.removeEventListener('keydown', handleKeydown);
    document.documentElement.classList.remove('profile-sheet-lock');
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown);
  document.documentElement.classList.remove('profile-sheet-lock');
});
</script>

<template>
  <button
    type="button"
    class="profile-activity-trigger"
    :class="{ 'is-loading': loading }"
    :aria-label="triggerLabel"
    :title="triggerLabel"
    @click="openSheet"
  >
    <span class="profile-activity-trigger-icon" aria-hidden="true">
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect x="3" y="4" width="18" height="17" rx="3" />
        <path d="M8 2v4M16 2v4M3 10h18" />
      </svg>
    </span>
    <span class="profile-activity-trigger-label">活跃轨迹</span>
    <span
      v-if="loading"
      class="profile-activity-trigger-skeleton"
      aria-hidden="true"
    ></span>
  </button>

  <Teleport to="body">
    <Transition name="profile-heatmap-sheet">
      <div
        v-if="isOpen"
        class="profile-heatmap-overlay"
        @click.self="closeSheet"
      >
        <section
          class="profile-heatmap-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-heatmap-sheet-title"
        >
          <header class="profile-heatmap-sheet-head">
            <div class="profile-heatmap-sheet-titles">
              <h2 id="profile-heatmap-sheet-title">活跃轨迹</h2>
              <p v-if="sheetSubtitle">{{ sheetSubtitle }}</p>
            </div>
            <button
              ref="closeRef"
              type="button"
              class="profile-heatmap-sheet-close"
              aria-label="关闭活跃轨迹"
              @click="closeSheet"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>
          <ActivityHeatmap
            embedded
            :payload="payload"
            :loading="loading"
            :is-owner="isOwner"
            @compose="handleCompose"
          />
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── 胶囊（2026-10-27）────────────────────────────────────────────
   内容宽、浅底 + 描边，与「编辑资料 / 关注」这类主按钮形成主次对比。
   它不显示天数：数字由弹窗副标题承担，按钮只回答「点了会看到什么」。 */
.profile-activity-trigger {
  appearance: none;
  -webkit-appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: auto;
  max-width: 100%;
  min-width: 0;
  min-height: 32px;
  margin: 0;
  padding: 0 12px;
  border: 1px solid var(--stroke, rgba(15, 23, 42, 0.08));
  border-radius: 999px;
  /* ⚠️ 别用 `var(--surface-2, rgba(29,29,31,.05))`：宿主页没有定义 --surface-2 时
     取到的是**亮色档 fallback** ⇒ 暗色下变成「深色压深底」，胶囊底几乎不可见。
     用 color-mix 叠当前字色：亮色 = 6% 黑、暗色 = 6% 白，一条规则吃两主题，
     也不给 dark-token 棘轮记账。 */
  background: color-mix(in srgb, var(--text-primary, #1d1d1f) 6%, transparent);
  box-shadow: none;
  color: var(--text-primary, #1d1d1f);
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    transform 160ms var(--ease-out, ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .profile-activity-trigger:hover {
    background: color-mix(in srgb, var(--text-primary, #1d1d1f) 12%, transparent);
    border-color: var(--stroke-strong, var(--stroke, rgba(15, 23, 42, 0.18)));
  }
}

.profile-activity-trigger:active {
  transform: scale(0.98);
}

/* 极窄屏（≤340，iPhone SE 一代）：这一排三枚胶囊挤不进一行，
   换行后本胶囊会孤零零缩在第二行左端 —— 看着就是「没对齐」。
   让它独占一行并撑满，读起来是「有意为之的次级动作条」。
   ⚠️ 这条必须写在基础规则**之后**：同特异性下后写的赢（写在前面会静默失效）。 */
@media (max-width: 340px) {
  .profile-activity-trigger {
    justify-content: center;
    width: 100%;
  }
}

.profile-activity-trigger:focus-visible {
  outline: 2px solid var(--liquid-text-primary, #1d1d1f);
  outline-offset: 2px;
}

.profile-activity-trigger-icon {
  display: inline-flex;
  flex: 0 0 auto;
  color: var(--text-secondary, #6e6e73);
}

.profile-activity-trigger-label {
  flex: 0 0 auto;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: -0.01em;
  white-space: nowrap;
}

/* 加载骨架：按钮上没有文字值，加载期只留一小截灰条顶位，
   避免这排在数据回来时宽度跳动。 */
.profile-activity-trigger-skeleton {
  display: inline-block;
  flex: 0 0 auto;
  width: 28px;
  height: 8px;
  border-radius: 4px;
  /* 骨架条同样走 color-mix，不写死 rgba（暗色块里每多一个裸色都记账）。 */
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--text-primary, #1d1d1f) 6%, transparent) 25%,
    color-mix(in srgb, var(--text-primary, #1d1d1f) 12%, transparent) 50%,
    color-mix(in srgb, var(--text-primary, #1d1d1f) 6%, transparent) 75%
  );
  background-size: 200% 100%;
  animation: profile-trigger-shimmer 1.4s linear infinite;
}

@keyframes profile-trigger-shimmer {
  from {
    background-position: 200% 0;
  }

  to {
    background-position: -200% 0;
  }
}

/* ── 弹窗（Teleport 到 body）────────────────────────────────────────
   ⚠️ 这段样式作用在 body 下的节点上，因此：
   ① 选择器**不能**带页内祖先（节点已经不在那棵树里）；
   ② 页级 token（--surface / --stroke / --text-primary …）只定义在页根上，
      body 下取不到 ⇒ 显式把宿主变量映射到全局 --liquid-* 全家桶，
      弹窗里的 ActivityHeatmap 才拿得到颜色（它内部读的就是这套页级变量）；
   ③ 暗色覆盖必须写 `html[data-theme='dark']`，不能写 `.user-space-page[data-theme=dark]`。 */
.profile-heatmap-overlay {
  position: fixed;
  inset: 0;
  /* #unified-nav-container 是 9999，必须比它高，否则弹窗顶部会被导航岛压住。 */
  z-index: 10000;
  display: grid;
  /* safe center：内容比视口高时退化为 start，配合 overflow-y:auto 才能滚到首行；
     纯 center 会把上半截顶成负 top，那部分永远滚不出来（手机横屏实测）。 */
  align-items: center;
  align-items: safe center;
  justify-items: center;
  padding: 24px 16px;
  overflow-y: auto;
  background: rgba(15, 23, 42, 0.34);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.profile-heatmap-sheet {
  /* 页级变量 → 全局 token 的桥（见上方 ②） */
  --text-primary: var(--liquid-text-primary);
  --text-secondary: var(--liquid-text-secondary);
  --text-tertiary: var(--liquid-text-tertiary);
  --stroke: var(--liquid-border, rgba(15, 23, 42, 0.1));
  --surface: #ffffff;
  --surface-2: rgba(29, 29, 31, 0.05);
  /* ⚠️ 宽度必须用 `max-width` + `box-sizing: border-box`，不能用 `width: min(100%, 560px)`：
     实测 390 视口下 min() 那条被内容（817px 的点阵滚动区）压过，卡片按 560 撑开、
     左右各被裁 85px。grid item 的 min-width: auto 会认内容宽 —— max-width 才能硬限住。 */
  box-sizing: border-box;
  width: 100%;
  max-width: 560px;
  min-width: 0;
  padding: 18px 18px 16px;
  border: 1px solid var(--liquid-border, rgba(15, 23, 42, 0.1));
  border-radius: 22px;
  /* 实色而不是半透明玻璃：卡面底下就是点阵与图例，
     62% 半透明会让背后的页面文字透进标题。 */
  background: #ffffff;
  box-shadow: var(--liquid-shadow-overlay, 0 24px 80px rgba(15, 23, 42, 0.14));
  text-align: left;
}

.profile-heatmap-sheet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.profile-heatmap-sheet-titles {
  min-width: 0;
}

.profile-heatmap-sheet-titles h2 {
  margin: 0;
  color: var(--liquid-text-primary);
  font-size: 17px;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.profile-heatmap-sheet-titles p {
  margin: 4px 0 0;
  color: var(--liquid-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.profile-heatmap-sheet-close {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--liquid-text-secondary);
  cursor: pointer;
  transition: background-color 160ms ease;
}

@media (hover: hover) and (pointer: fine) {
  .profile-heatmap-sheet-close:hover {
    /* color-mix 而不是写死 rgba：亮色下 12% 黑、暗色下 12% 白，一条规则吃两主题。 */
    background: color-mix(in srgb, var(--liquid-text-primary) 12%, transparent);
  }
}

.profile-heatmap-sheet-enter-active,
.profile-heatmap-sheet-leave-active {
  transition: opacity 180ms ease;
}

.profile-heatmap-sheet-enter-active .profile-heatmap-sheet,
.profile-heatmap-sheet-leave-active .profile-heatmap-sheet {
  transition:
    transform 220ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 180ms ease;
}

.profile-heatmap-sheet-enter-from,
.profile-heatmap-sheet-leave-to {
  opacity: 0;
}

.profile-heatmap-sheet-enter-from .profile-heatmap-sheet,
.profile-heatmap-sheet-leave-to .profile-heatmap-sheet {
  opacity: 0;
  transform: translateY(14px) scale(0.985);
}

html[data-theme='dark'] .profile-heatmap-overlay {
  /* 暗色遮罩用 --liquid-bg-overlay 的暗色档：暗底对比低，亮色那层 34% 压不住卡片边界。 */
  background: var(--liquid-bg-overlay);
}

html[data-theme='dark'] .profile-heatmap-sheet {
  /* 暗色卡面走深玻璃 token，不在这里写第二组裸色 —— 棘轮只降不升。 */
  --surface: var(--liquid-bg-strong);
  --surface-2: var(--liquid-bg-nested);
  background: var(--liquid-bg-strong);
  border-color: var(--liquid-border);
}

/* 弹窗期间的背景滚动锁：锁挂在 <html> 上。
   scoped 选择器命不中 html（它没有 data-v 属性），必须用 :global 透出去。 */
:global(html.profile-sheet-lock) {
  overflow: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .profile-activity-trigger,
  .profile-heatmap-sheet-enter-active,
  .profile-heatmap-sheet-leave-active,
  .profile-heatmap-sheet-enter-active .profile-heatmap-sheet,
  .profile-heatmap-sheet-leave-active .profile-heatmap-sheet {
    transition: none;
  }

  .profile-activity-trigger-skeleton {
    animation: none;
  }
}
</style>
