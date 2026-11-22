/**
 * useSwipeActions — 消息中心左滑快捷手势(iOS Mail 式,2026-11-21)
 *
 * 形态:列表行左滑露出「已读 / 归档」按钮层;松手过阈值吸附展开,再点行收起;
 * 展开期间点按钮执行动作并收起。同一时刻至多一行展开。
 *
 * 与既有手势的共存(都是刻意设计,别动):
 *  - 长按多选(pointerdown 450ms):横向位移一旦判定为滑动,立刻回调 onSwipeStart
 *    让宿主 cancelLongPress——两者互斥但共享 pointerdown。
 *  - 纵向滚动:行挂 `touch-action: pan-y`,浏览器对纵向滑动接管并触发 pointercancel,
 *    这里捕获到 cancel 即复位;斜率判定(|dx| > |dy| × 1.2)先拦一道。
 *  - 鼠标:桌面行已有 hover 快捷钮,pointerType === 'mouse' 不启用滑动。
 *
 * 性能契约:拖拽过程直接改 DOM(transform/opacity/transition),**不走响应式**——
 * 列表行带 v-memo,拖拽若走状态绑定会被 memo 跳过或不必要地重渲整表。
 */
import { ref } from 'vue';

export function useSwipeActions({ revealWidth = 148, openThreshold = 76, onSwipeStart } = {}) {
  /** 当前展开的行 id(响应式:模板/其他逻辑只读它做反证) */
  const swipeOpenId = ref(null);
  let drag = null;

  const findLayers = (el) => ({
    cell: el?.closest?.('.x-item-swipe-cell') || null,
    actions: el?.closest?.('.x-item-swipe-cell')?.querySelector('.x-swipe-actions') || null,
  });

  const apply = (layers, offset, { animate = false } = {}) => {
    const { cell, actions } = layers;
    if (!cell) return;
    const row = cell.querySelector('.x-item');
    if (!row) return;
    row.style.transition = animate ? 'transform 0.22s ease' : 'none';
    row.style.transform = offset === 0 ? '' : `translateX(${offset}px)`;
    if (animate) {
      window.setTimeout(() => {
        if (row.style.transition === 'transform 0.22s ease') row.style.transition = '';
      }, 240);
    }
    if (actions) {
      const visible = Math.min(1, Math.abs(offset) / openThreshold);
      actions.style.opacity = String(visible);
      actions.style.pointerEvents = visible > 0.9 ? 'auto' : 'none';
    }
  };

  const close = () => {
    if (!swipeOpenId.value) return;
    const cell = document.querySelector(
      `.x-item-swipe-cell[data-swipe-id="${CSS.escape(swipeOpenId.value)}"]`,
    );
    if (cell)
      apply({ cell, actions: cell.querySelector('.x-swipe-actions') }, 0, { animate: true });
    swipeOpenId.value = null;
  };

  /** 展开行被移除(归档等)时由宿主调用:静默复位状态,不找 DOM */
  const resetIf = (msgId) => {
    if (swipeOpenId.value && swipeOpenId.value === msgId) swipeOpenId.value = null;
  };

  const onRowPointerDown = (event, msgId, { enabled } = {}) => {
    if (event.pointerType === 'mouse') return;
    if (typeof enabled === 'function' && !enabled()) return;
    if (drag) return;
    const layers = findLayers(event.currentTarget);
    if (!layers.cell) return;
    // 已有展开行:先收(可能是本行 → 记 tapToClose,松手未拖即收)
    const wasOpen = swipeOpenId.value === msgId;
    if (swipeOpenId.value && !wasOpen) close();
    drag = {
      id: msgId,
      layers,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: 0,
      horizontal: false,
      vertical: false,
      tapToClose: wasOpen,
    };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      /* capture 失败不影响主流程 */
    }
  };

  const onRowPointerMove = (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.horizontal && !drag.vertical) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      // 斜率判定:横向为主才算滑动;纵向交还原生滚动
      if (Math.abs(dx) > Math.abs(dy) * 1.2 && dx < 0) {
        drag.horizontal = true;
        if (typeof onSwipeStart === 'function') onSwipeStart();
      } else {
        drag.vertical = true;
        return;
      }
    }
    if (!drag.horizontal) return;
    // 起点补偿:若本行已展开,拖拽从 -revealWidth 起算
    const base = drag.tapToClose ? -revealWidth : 0;
    const offset = Math.max(Math.min(base + dx, 0), -revealWidth - 32);
    drag.offsetX = offset;
    apply(drag.layers, offset);
  };

  /**
   * 返回 'action' | 'close' | null:宿主据此在 onItemClick 里吞掉本次点击。
   * action = 完成了一次滑动展开;close = 滑动收起了已展开行。
   */
  const onRowPointerUp = () => {
    if (!drag) return null;
    const { horizontal, vertical, offsetX, layers, id, tapToClose } = drag;
    drag = null;
    if (vertical) return null;
    if (!horizontal) {
      if (tapToClose) {
        close();
        return 'close';
      }
      return null;
    }
    if (offsetX <= -openThreshold) {
      apply(layers, -revealWidth, { animate: true });
      if (layers.cell) layers.cell.classList.add('is-swipe-open');
      swipeOpenId.value = id;
      return 'action';
    }
    if (tapToClose) {
      close();
      return 'close';
    }
    apply(layers, 0, { animate: true });
    return 'swipe-back';
  };

  const onRowPointerCancel = () => {
    if (!drag) return;
    const { layers, horizontal, tapToClose } = drag;
    drag = null;
    if (!horizontal) return;
    // 已展开行被纵向滚动打断:回到展开位;普通拖拽:回弹归零
    apply(layers, tapToClose ? -revealWidth : 0, { animate: true });
  };

  return {
    swipeOpenId,
    close,
    resetIf,
    onRowPointerDown,
    onRowPointerMove,
    onRowPointerUp,
    onRowPointerCancel,
  };
}
