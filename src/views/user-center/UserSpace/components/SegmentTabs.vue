<template>
  <div ref="tabsRef" class="segment-tabs" role="tablist" :aria-label="ariaLabel">
    <button
      v-for="s in sections"
      :key="s.id"
      :ref="setItemRef"
      type="button"
      role="tab"
      class="segment-tab"
      :class="{ active: modelValue === s.id }"
      :aria-selected="modelValue === s.id"
      @click="$emit('update:modelValue', s.id)"
    >
      {{ s.label }}
    </button>
    <span
      class="segment-tab-indicator"
      :class="{ 'is-animatable': animatable }"
      :style="indicatorStyle"
      aria-hidden="true"
    ></span>
  </div>
</template>

<script setup>
// 抖音式纯文字页签（2026-09-09）：无背景无按钮框，当前项加粗放大 + 弹性滑动下划线。
// 随内容滚走（不吸附）；顶栏避让由 --segment-tabs-inset 提供（默认 = 导航 inset + 4px，与导航胶囊留出呼吸）。
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

const props = defineProps({
  sections: {
    type: Array,
    required: true,
  },
  modelValue: {
    type: String,
    default: '',
  },
  ariaLabel: {
    type: String,
    default: '分区切换',
  },
});

defineEmits(['update:modelValue']);

const tabsRef = ref(null);
const itemRefs = ref([]);
const indicator = ref({ x: 0, w: 0, ready: false });
/* ⚠️ 首次落位**不能**播过渡（2026-10-31 修「返回时指示器从官方滑到最新」）。
 *
 * 病灶：指示器初值是 `{ x: 0, w: 0 }`，而 `.segment-tab-indicator` 上写着
 * `transition: transform 300ms …`。于是首帧渲染在 x=0（= 第一席「官方」），
 * `measure()` 拿到「最新」的 offsetLeft 后改写 → 浏览器照规矩补间 300ms。
 * 用户看到的是「一条下划线从官方划到最新」，而且只在**重挂载**时出现
 * （从详情页返回、切页签回来），读起来就像「页面被重新加载了一遍」。
 *
 * 做法：只在**用户真的切换**（下面的 watch(modelValue)）时才放开过渡；
 * 其余的测量（首帧 / ResizeObserver / 字体就绪）一律瞬移落位。
 * 反过来「等 ready 后再 rAF 放开」不行 —— 字体就绪那次仍然会滑一下。 */
const animatable = ref(false);

const setItemRef = (el) => {
  if (el) itemRefs.value.push(el);
};

const measure = async () => {
  await nextTick();
  const idx = props.sections.findIndex((s) => s.id === props.modelValue);
  const el = itemRefs.value[idx];
  if (!el || !tabsRef.value) return;
  indicator.value = { x: el.offsetLeft, w: el.offsetWidth, ready: true };
};

const indicatorStyle = computed(() => ({
  width: `${indicator.value.w || 0}px`,
  transform: `translateX(${indicator.value.x || 0}px)`,
  opacity: indicator.value.ready ? 1 : 0,
}));

watch(
  () => props.modelValue,
  () => {
    // 只有这一条路径代表「用户切了分区」，滑动反馈是想要的
    animatable.value = true;
    void measure();
  },
);
watch(
  () => props.sections,
  () => {
    void measure();
  },
  { deep: true },
);

let resizeObserver = null;
onMounted(() => {
  void measure();
  if (typeof ResizeObserver === 'function' && tabsRef.value) {
    resizeObserver = new ResizeObserver(() => {
      void measure();
    });
    resizeObserver.observe(tabsRef.value);
  }
  // 字体加载完成后校准一次（文字宽度变化）
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    document.fonts.ready
      .then(() => {
        void measure();
      })
      .catch(() => {});
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  itemRefs.value = [];
});
</script>

<style scoped>
.segment-tabs {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: clamp(20px, 5vw, 34px);
  /* 避让 = 导航岛实测高度（--userspace-nav-h 由 UserSpaceMain ResizeObserver 写入）
     + 刘海屏安全区（岛 fixed top:0 自身不避让）+ 呼吸 4px */
  padding: var(
      --segment-tabs-inset,
      calc(var(--userspace-nav-h, 84px) + env(safe-area-inset-top, 0px) + 4px)
    )
    20px 2px;
}

.segment-tab {
  position: relative;
  border: 0;
  background: transparent;
  padding: 2px 2px 9px;
  font-family: inherit;
  font-size: 14.5px;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: var(--liquid-text-secondary, #6e6e73);
  cursor: pointer;
  transition:
    color 180ms var(--ease-out, ease-out),
    transform 240ms cubic-bezier(0.34, 1.3, 0.64, 1),
    font-size 240ms cubic-bezier(0.34, 1.3, 0.64, 1);
}

.segment-tab:hover {
  color: var(--liquid-text-primary, #1d1d1f);
}

.segment-tab:active {
  transform: scale(0.96);
}

/* 键盘焦点（2026-10-20 补）：本组件此前**一条 focus 样式都没有**，
   键盘用户 Tab 到段控时完全看不出焦点在哪。outline 用页面主色、外扩 3px，
   且只在 :focus-visible 出现（鼠标点击不闪框）。 */
.segment-tab:focus-visible {
  outline: 2px solid var(--liquid-accent, #0071e3);
  outline-offset: 3px;
  border-radius: 6px;
}

.segment-tab.active {
  color: var(--liquid-text-primary, #1d1d1f);
  font-weight: 600;
  font-size: 15.5px;
}

.segment-tab-indicator {
  position: absolute;
  bottom: 3px;
  left: 0;
  height: 3px;
  border-radius: 2px;
  background: var(--liquid-text-primary, #1d1d1f);
  /* 默认**无过渡**：首帧/重挂载/字体就绪这些非用户触发的测量必须瞬移落位，
     否则会看到下划线从第一席「官方」滑到当前席（见 script 里 animatable 的注释）。 */
  transition: none;
}

.segment-tab-indicator.is-animatable {
  transition:
    transform 300ms cubic-bezier(0.3, 1.15, 0.35, 1),
    width 300ms cubic-bezier(0.3, 1.15, 0.35, 1);
}

@media (max-width: 480px) {
  .segment-tabs {
    gap: 16px;
    padding-left: 14px;
    padding-right: 14px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .segment-tab,
  .segment-tab-indicator {
    transition-duration: 1ms;
    animation-duration: 1ms;
  }
}
</style>
