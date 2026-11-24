<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  arrowSideOf,
  computeDropdownPosition,
  DROPDOWN_NARROW_MAX,
} from './boh-dropdown-position.js';
import './motion.css';

/**
 * BohDropdown — 全站唯一下拉/浮层菜单（plans/045 组件 13）
 *
 * 收的是那批「自己写 Teleport + 遮罩 + 手算 top/left + 遮罩点击关闭」的下拉：
 * PostComposer 的「更多」、Messages 的筛选、管理台的各类 picker。
 *
 * 内置（宿主零样板）：
 *   · 触发器插槽 + 玻璃面板（材质读 --liquid-*，与 BohModal 同源）；
 *   · 定位：下方放不下自动**翻到上方**，横向越界夹回视口（几何在
 *     boh-dropdown-position.js 里，纯函数可测）；面板尺寸变化、滚动、窗口
 *     resize 都会重算 —— 手写版几乎都在这一步漏了 resize；
 *   · 外点关闭（pointerdown 捕获，比 click 更早，避免"点完才关"）；
 *   · Esc 关闭（只在打开时挂监听，且 stopPropagation，不误关外层弹窗）；
 *   · 关闭后焦点**归还触发器**（WCAG 2.4.3）；
 *   · 窄屏（≤900）改底部上拉形态，与 PostComposer 既有口径一致；
 *   · 出入场走 motion.css 的 boh-pop 预设，reduced-motion 自动直切。
 *
 * 刻意**不做**的事：
 *   · 不做焦点陷阱 —— 下拉不是模态，Tab 应该能正常走出去（与 BohModal 相反）；
 *   · 不锁页面滚动 —— 同上；
 *   · 不接管选中逻辑 —— 面板内容完全由宿主给（菜单项 / 复选项 / 任意列表）。
 *
 * @example
 * <BohDropdown v-model="moreOpen" placement="top-end">
 *   <template #trigger="{ open, toggle }">
 *     <button type="button" :aria-expanded="open" @click="toggle">更多</button>
 *   </template>
 *   <button class="boh-dropdown__item" @click="addLocation()">添加位置</button>
 * </BohDropdown>
 */
const props = defineProps({
  /** v-model：是否打开 */
  modelValue: { type: Boolean, default: false },
  /** 首选方向：bottom-start | bottom-end | top-start | top-end */
  placement: { type: String, default: 'bottom-start' },
  /** 面板最小宽度（CSS 长度）；不传则由内容决定 */
  minWidth: { type: String, default: '' },
  /** 点面板外的任何地方是否关闭 */
  closeOnOutside: { type: Boolean, default: true },
  /** 按 Esc 是否关闭 */
  closeOnEsc: { type: Boolean, default: true },
  /** 面板 aria-label（无障碍：菜单需要一个名字） */
  label: { type: String, default: '菜单' },
  /** 强制关闭窄屏上拉形态（嵌在桌面版固定布局里时用） */
  disableSheet: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'open', 'close']);

const triggerRef = ref(null);
const panelRef = ref(null);
let pendingFocusReturn = false;

const pos = ref({ top: 0, left: 0, placement: props.placement, flipped: false, narrow: false });

const isOpen = computed(() => props.modelValue);

/** 面板上指示器所在边（翻转后要换边） */
const arrowSide = computed(() => arrowSideOf(pos.value.placement));

function requestClose(reason = 'programmatic') {
  if (!props.modelValue) return;
  /* 🔴 焦点归还必须发生在**移除 DOM 之前**。
     踩过：原来写在 emit(false) 之后 —— 那时面板已经进 leave 过渡/被移出，
     `panel.contains(document.activeElement)` 已经是 false（焦点已被浏览器退回
     body），整段归还变成空操作，而「关闭后焦点恰好在触发器上」的断言
     仍然看着正常（焦点在触发器本来就是打开前的状态），属于假绿。
     现在先记住焦点是否在面板里，再关，再还。 */
  const panel = panelRef.value;
  const hadFocusInside = Boolean(panel && panel.contains(document.activeElement));
  emit('update:modelValue', false);
  emit('close', reason);
  /* 焦点是否在面板里必须在 emit **之前**判 —— 之后面板开始移除，
     activeElement 已被浏览器退回 body，判出来恒为 false。
     真正的归还动作推迟到 after-leave（见下）。 */
  if (hadFocusInside) pendingFocusReturn = true;
}

/* 🔴 焦点归还必须等面板真正离开 DOM（Transition 的 after-leave）。
   实测三次才定下来：
     ① 同步 focus —— 被「面板移除 → 焦点退回 body」盖掉；
     ② rAF / setTimeout(0) —— 那会儿 leave 过渡还没跑完，面板仍在 DOM 里，
        `el.focus()` 直接被忽略（日志：el.isConnected=true 但 activeElement 仍是
        面板里的 .x-filter-option），最终焦点落到 body；
     ③ 正确时机是 after-leave：面板已摘除，没有任何东西跟触发器抢。
   三个坑的共性：**焦点在面板里时，面板没消失之前焦点是搬不走的**。 */
function onAfterLeave() {
  if (!pendingFocusReturn) return;
  pendingFocusReturn = false;
  /* 🔴 不能直接 focus 包裹层：`.boh-dropdown__trigger` 是个 <span>，本身不可聚焦，
     `span.focus()` 静默无效（日志实测：span.isConnected=true 但 activeElement
     不变）—— 这是最后才查出来的，前面 rAF / setTimeout / after-leave 三种时机
     都白试了。必须找包裹层里**第一个真正可聚焦**的元素。 */
  const wrap = triggerRef.value;
  if (!wrap?.isConnected) return;
  const target = wrap.matches('button, a[href], input, select, textarea, [tabindex]')
    ? wrap
    : wrap.querySelector(
        'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
  target?.focus?.({ preventScroll: true });
}

function toggle() {
  if (props.modelValue) requestClose('trigger');
  else {
    emit('update:modelValue', true);
    emit('open');
  }
}

/** 量一次并落位。面板尺寸未知时用内容自然尺寸（先渲染再量）。 */
function reposition() {
  const trigger = triggerRef.value;
  const panel = panelRef.value;
  if (!trigger || !panel) return;
  const anchor = trigger.getBoundingClientRect();
  const rect = panel.getBoundingClientRect();
  const narrow = !props.disableSheet && window.innerWidth <= DROPDOWN_NARROW_MAX;
  pos.value = computeDropdownPosition({
    anchor,
    panel: { width: rect.width || panel.offsetWidth, height: rect.height || panel.offsetHeight },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    placement: props.placement,
    narrow,
  });
}

/* ── 外点 + Esc：只在打开时挂，关闭即摘（别让页面常年多两个监听） ── */
function onPointerDown(event) {
  if (!props.closeOnOutside) return;
  const panel = panelRef.value;
  const trigger = triggerRef.value;
  const target = event.target;
  if (panel?.contains(target)) return;
  // 点触发器本身交给 toggle()，否则会「先关再开」闪一下
  if (trigger?.contains(target)) return;
  requestClose('outside');
}

function onKeydown(event) {
  if (event.key !== 'Escape' || !props.closeOnEsc) return;
  // 只处理面板/触发器内的 Esc：页面级的 Esc 不归我管
  const panel = panelRef.value;
  if (!panel?.contains(event.target) && !triggerRef.value?.contains(event.target)) return;
  /* stopPropagation 防外层 BohModal 一 Esc 关两层；
     preventDefault 防外层焦点管理把焦点抢走 —— 踩过：不拦默认行为时，
     Esc 之后焦点会落到 .page-userspace 这类外层容器上，归还逻辑等于没做。 */
  event.stopPropagation();
  event.preventDefault();
  requestClose('esc');
}

let listening = false;
function startListeners() {
  if (listening) return;
  listening = true;
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('scroll', reposition, { passive: true, capture: true });
  window.addEventListener('resize', reposition, { passive: true });
}
function stopListeners() {
  if (!listening) return;
  listening = false;
  document.removeEventListener('pointerdown', onPointerDown, true);
  document.removeEventListener('keydown', onKeydown);
  window.removeEventListener('scroll', reposition, { capture: true });
  window.removeEventListener('resize', reposition);
}

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      // 先渲染（pos 还是旧值，但面板已在 DOM 里可量），再落位
      await nextTick();
      reposition();
      // 第二帧再量一次：字体/图片可能刚加载完导致尺寸变化
      requestAnimationFrame(() => reposition());
      startListeners();
      /* 焦点进面板：下拉不是模态（Tab 能正常走出去），但键盘用户必须能
         用方向键/回车操作菜单项 —— 焦点留在触发器上时，按方向键毫无反应。
         取第一个可聚焦项；面板里没有可聚焦项（纯展示）就保持原样，别硬抢。 */
      requestAnimationFrame(() => {
        const first = panelRef.value?.querySelector(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        first?.focus?.({ preventScroll: true });
      });
    } else {
      stopListeners();
    }
  },
  { immediate: true },
);

onBeforeUnmount(stopListeners);

defineExpose({ reposition, close: () => requestClose('exposed') });
</script>

<template>
  <span class="boh-dropdown" :class="{ 'is-open': isOpen }">
    <!-- 触发器：宿主完全掌控外观，这里只提供 open/toggle 与 ref/aria -->
    <span ref="triggerRef" class="boh-dropdown__trigger">
      <slot name="trigger" :open="isOpen" :toggle="toggle">
        <button
          type="button"
          class="boh-dropdown__default-trigger"
          :aria-expanded="isOpen"
          aria-haspopup="menu"
          @click="toggle"
        >
          <slot name="label">菜单</slot>
        </button>
      </slot>
    </span>

    <Teleport to="body">
      <Transition name="boh-pop" @after-leave="onAfterLeave">
        <div
          v-if="isOpen"
          ref="panelRef"
          class="boh-dropdown__panel"
          :class="{ 'boh-dropdown__panel--sheet': pos.narrow }"
          :style="
            pos.narrow
              ? // 窄屏上拉：垂直位置交给 CSS（bottom 贴边），
                // 这里再算 top 只会和实际高度打架（面板高度随内容变，量一次不准）
                { left: `${pos.left}px`, minWidth: minWidth || undefined }
              : { top: `${pos.top}px`, left: `${pos.left}px`, minWidth: minWidth || undefined }
          "
          role="menu"
          :aria-label="label"
          :data-align="pos.placement.endsWith('end') ? 'end' : 'start'"
        >
          <span
            v-if="!pos.narrow"
            class="boh-dropdown__arrow"
            :class="`boh-dropdown__arrow--${arrowSide}`"
            aria-hidden="true"
          ></span>
          <div class="boh-dropdown__scroll">
            <slot :close="() => requestClose('item')" />
          </div>
        </div>
      </Transition>
    </Teleport>
  </span>
</template>

<style scoped>
.boh-dropdown {
  display: inline-block;
  position: relative;
}

.boh-dropdown__trigger {
  display: inline-flex;
}

.boh-dropdown__default-trigger {
  appearance: none;
  border: 1px solid var(--liquid-border);
  border-radius: var(--liquid-radius-pill, 999px);
  background: var(--liquid-bg-strong);
  color: var(--liquid-text-primary);
  font: inherit;
  font-size: 13px;
  padding: 6px 14px;
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--ease-out);
}
.boh-dropdown__default-trigger:hover {
  background: var(--liquid-bg);
}

/* 面板：Teleport 到 body，position: fixed —— 不受祖先 transform/overflow 影响，
   这是手写版最容易栽的地方（父级 overflow:hidden 直接把面板裁掉）。 */
.boh-dropdown__panel {
  position: fixed;
  /* 下拉与弹窗同层：它常常开在 BohModal 里，层级低了会被模态盖住 */
  z-index: var(--boh-z-modal);
  min-width: 180px;
  max-width: min(92vw, 420px);
  max-height: min(70vh, 520px);
  /* 🔴 面板本身不裁切：指示器是绝对定位在面板**外** 6px 的伪影，
     `overflow: auto/hidden` 会把它整块裁掉（实测箭头完全看不见，而
     "有没有指示器"的 DOM 断言照样通过 —— 又是一个假绿）。
     滚动交给内层的 __scroll 容器。 */
  overflow: visible;
  padding: 0;
  border: 1px solid var(--liquid-border-strong);
  border-radius: var(--liquid-radius-lg, 16px);
  background: var(--liquid-bg-strong);
  backdrop-filter: var(--liquid-filter-lg);
  -webkit-backdrop-filter: var(--liquid-filter-lg);
  box-shadow: var(--liquid-highlight), var(--liquid-shadow-overlay);
  color: var(--liquid-text-primary);
  font-size: 13px;
}
@media (prefers-reduced-motion: reduce) {
  .boh-dropdown__default-trigger {
    transition-duration: 0s;
  }
}

/* 内层滚动容器：面板为了露出指示器不能裁切，滚动必须挪到这一层。
   内衬也放在这里（面板自己的 padding 会让指示器的绝对定位基准偏移）。 */
.boh-dropdown__scroll {
  max-height: inherit;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 6px;
  border-radius: inherit;
}

/* 指示器：翻转后换边（arrowSideOf）。用正方形旋转 45° 的玻璃块，与面板同底色 */
/* 指示器要指向触发器：-start 档在左（面板左边对齐触发器左边），
   -end 档在右（面板右边对齐触发器右边）。死写 left: 18px 时，
   -end 档的箭头会飘到触发器外，看着像"接错了一个按钮"。 */
.boh-dropdown__arrow {
  position: absolute;
  width: 10px;
  height: 10px;
  background: inherit;
  border: solid var(--liquid-border-strong);
  transform: rotate(45deg);
  /* 必须压在面板之上：箭头有一半伸在面板外、一半压在面板背景上，
     不给 z-index 时 panel 自身的背景会盖住它（elementFromPoint 命中 panel
     而不是 arrow —— 这条是探针 B4 抓出来的）。 */
  z-index: 1;
  pointer-events: none;
}
.boh-dropdown__arrow--top {
  top: -6px;
  border-width: 1px 0 0 1px;
}
.boh-dropdown__arrow--bottom {
  bottom: -6px;
  border-width: 0 1px 1px 0;
}
/* 水平位置由 placement 决定：-start 靠左（默认 18px），-end 靠右 */
.boh-dropdown__panel[data-align='start'] .boh-dropdown__arrow {
  left: 18px;
}
.boh-dropdown__panel[data-align='end'] .boh-dropdown__arrow {
  right: 18px;
}

/* 窄屏上拉：贴底、圆角只留上方、去掉指示器 */
/* 窄屏上拉：贴底（留 12px = 与左右同值的边距），四边一致才不会压住 home indicator。
   ⚠️ 用 bottom 而不是 JS 算 top —— 面板高度由内容决定，JS 量到的尺寸和最终渲染
   会差几个像素，贴底判断（vh-bottom）就会漂。 */
.boh-dropdown__panel--sheet {
  left: 12px !important;
  right: 12px;
  bottom: 12px;
  top: auto !important;
  max-width: none;
  max-height: min(70vh, 520px);
  border-radius: var(--liquid-radius-lg, 18px);
}

/* 菜单项：宿主可直接用这两个类，也可以完全自定义 */
:slotted(.boh-dropdown__item) {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--ease-out);
}
:slotted(.boh-dropdown__item:hover) {
  background: var(--liquid-bg);
}
:slotted(.boh-dropdown__item:disabled) {
  opacity: 0.45;
  cursor: not-allowed;
}
:slotted(.boh-dropdown__item.is-active) {
  background: var(--boh-accent-soft);
  color: var(--boh-accent-text);
}
:slotted(.boh-dropdown__sep) {
  display: block;
  height: 1px;
  margin: 4px 6px;
  background: var(--liquid-border);
}
</style>
