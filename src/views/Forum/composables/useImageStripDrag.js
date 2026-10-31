import { onBeforeUnmount, ref, nextTick } from 'vue';

/* 发帖图片「一行胶片条」的长按拖动排序（2026-10-30）。
 *
 * 为什么不用 HTML5 drag and drop
 * ------------------------------
 * `draggable` + dragstart/dragover/drop 在触屏上**根本不触发**：竖屏用户此前
 * 只能靠卡片左下角两个 26px 的 ← → 箭头排序。改成胶片条后箭头被移除，拖动
 * 必须真的可用，所以这里走 Pointer Events。
 *
 * 手势分工（与 composer.css 的 `touch-action: pan-y` 配套）
 * ------------------------------------------------------
 * · 纵向：交给外层面板滚动。浏览器一旦接管就发 pointercancel，我们收摊。
 * · 横向：浏览器被 pan-y 挡住不接管 ⇒ 由这里逐帧写 scrollLeft 实现横滑。
 *   这也是"整卡可拖"能成立的前提：横向手势全程在我们的手里，不会中途被抢走。
 * · 长按 300ms（或鼠标移动超过 4px）→ 进入拖拽：卡片抬起跟随手指，其余卡片
 *   按落点索引让位。落点用「卡片中心线」判定，与 splice(from→to) 语义一致，
 *   因此松手后的重排与让位后的视觉位置完全对齐，不会二次跳动。
 *
 * 位移全部命令式写 inline transform（不走 Vue :style）：拖拽是 60fps 的
 * 高频写，交给响应式会带来无谓的组件重渲染，而且下一帧 patch 会把这里写的
 * transform 冲掉。
 */

const LONG_PRESS_MS = 300;
const TOUCH_SLOP_PX = 9;
const MOUSE_SLOP_PX = 4;
const EDGE_ZONE_PX = 34;
const EDGE_STEP_PX = 14;
const MAX_TILT_Y_PX = 44;
const LIFT_SCALE = 1.08;
const CLICK_SUPPRESS_MS = 500;

export function useImageStripDrag({ canDragIndex, isLocked, onReorder }) {
  const stripRef = ref(null);
  const isReordering = ref(false);

  let pointerId = null;
  let pressIndex = -1;
  let pressX = 0;
  let pressY = 0;
  let pressScrollLeft = 0;
  let pressTimer = 0;
  /** 'idle' | 'pending'（已按下，还在判定手势）| 'pan'（横滑）| 'drag' */
  let phase = 'idle';
  let dragEl = null;
  let dragIndex = -1;
  let dropIndex = -1;
  let cards = [];
  let slotLefts = [];
  let slotStep = 0;
  let cardWidth = 0;
  let contentWidth = 0;
  let stripRect = null;
  let grabDx = 0;
  let grabDy = 0;
  let lastClientX = 0;
  let edgeRaf = 0;
  let suppressClick = false;
  let suppressTimer = 0;
  /* 长按判定期（按下 → 300ms 到）的视觉反馈：没有任何反馈时，用户会以为
     点了没反应而提前抬手 —— 这是长按类交互最典型的失败模式。 */
  let pressedEl = null;

  const clearPressTimer = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = 0;
    }
  };

  const clearSuppressTimer = () => {
    if (suppressTimer) {
      clearTimeout(suppressTimer);
      suppressTimer = 0;
    }
  };

  const readCards = () => {
    const strip = stripRef.value;
    if (!strip) return [];
    return Array.from(strip.querySelectorAll('.post-image-preview-item'));
  };

  const clearPressed = () => {
    if (!pressedEl) return;
    pressedEl.classList.remove('is-pressing');
    pressedEl = null;
  };

  const markPressed = (el) => {
    if (pressedEl === el) return;
    clearPressed();
    if (!el) return;
    pressedEl = el;
    el.classList.add('is-pressing');
  };

  const stopEdgeScroll = () => {
    if (edgeRaf) {
      cancelAnimationFrame(edgeRaf);
      edgeRaf = 0;
    }
  };

  /* 落点索引：数「指针越过了几张小卡的中心」。
     与 useForumDraftImagePipelines.reorderPostImage 的 splice(from,1)+splice(to,0)
     是同一套语义（先摘出自己再插入），所以松手后不需要二次换算。 */
  const computeDropIndex = (clientX) => {
    const strip = stripRef.value;
    if (!strip || !stripRect) return dropIndex >= 0 ? dropIndex : dragIndex;
    const x = clientX - stripRect.left + strip.scrollLeft;
    let crossed = 0;
    for (let i = 0; i < slotLefts.length; i += 1) {
      if (i === dragIndex) continue;
      if (x > slotLefts[i] + cardWidth / 2) crossed += 1;
    }
    return Math.max(0, Math.min(slotLefts.length - 1, crossed));
  };

  const paint = () => {
    const from = dragIndex;
    const to = dropIndex;
    cards.forEach((el, i) => {
      if (i === from) return;
      let shift = 0;
      if (to > from && i > from && i <= to) shift = -slotStep;
      else if (to < from && i >= to && i < from) shift = slotStep;
      el.style.transform = shift ? `translate3d(${shift}px, 0, 0)` : '';
    });
    if (dragEl) {
      dragEl.style.transform = `translate3d(${grabDx}px, ${grabDy}px, 0) scale(${LIFT_SCALE})`;
    }
  };

  const tickEdgeScroll = () => {
    edgeRaf = 0;
    const strip = stripRef.value;
    if (phase !== 'drag' || !strip || !stripRect) return;
    let dir = 0;
    if (lastClientX > stripRect.right - EDGE_ZONE_PX) dir = 1;
    else if (lastClientX < stripRect.left + EDGE_ZONE_PX) dir = -1;
    if (dir) {
      // 每次额外多给 1px：subpixel 宽度下 scrollLeft 可能取整不前进
      const before = strip.scrollLeft;
      strip.scrollLeft = before + dir * (EDGE_STEP_PX + 1);
      if (strip.scrollLeft !== before) {
        const next = computeDropIndex(lastClientX);
        if (next !== dropIndex) {
          dropIndex = next;
          paint();
        }
      }
    }
    edgeRaf = requestAnimationFrame(tickEdgeScroll);
  };

  const startDrag = () => {
    const strip = stripRef.value;
    if (!strip || phase === 'drag') return;
    if (!canDragIndex(pressIndex)) return;
    const nodes = readCards();
    if (pressIndex < 0 || pressIndex >= nodes.length) return;

    cards = nodes;
    slotLefts = nodes.map((el) => el.offsetLeft);
    slotStep =
      slotLefts.length > 1
        ? Math.max(1, Math.round(slotLefts[1] - slotLefts[0]))
        : Math.max(1, nodes[0].offsetWidth);
    dragEl = nodes[pressIndex];
    cardWidth = dragEl.offsetWidth;
    contentWidth = strip.scrollWidth;
    stripRect = strip.getBoundingClientRect();

    dragIndex = pressIndex;
    dropIndex = pressIndex;
    grabDx = 0;
    grabDy = 0;
    lastClientX = pressX;

    phase = 'drag';
    isReordering.value = true;
    clearPressed();
    dragEl.classList.add('is-lifted');
    // 抬起后手指仍可能停在原处，先画一帧让"已拿起"立刻可见
    paint();
    stopEdgeScroll();
    edgeRaf = requestAnimationFrame(tickEdgeScroll);
  };

  const teardown = () => {
    stopEdgeScroll();
    clearPressTimer();
    clearPressed();
    removeWindowListeners();
    if (dragEl) dragEl.classList.remove('is-lifted');
    cards.forEach((el) => {
      el.style.transform = '';
    });
    if (dragEl) dragEl.style.transform = '';
    cards = [];
    slotLefts = [];
    dragEl = null;
    dragIndex = -1;
    dropIndex = -1;
    grabDx = 0;
    grabDy = 0;
    phase = 'idle';
    pointerId = null;
    pressIndex = -1;
    isReordering.value = false;
    stripRect = null;
  };

  const armClickSuppression = () => {
    suppressClick = true;
    clearSuppressTimer();
    suppressTimer = setTimeout(() => {
      suppressClick = false;
      suppressTimer = 0;
    }, CLICK_SUPPRESS_MS);
  };

  const finishDrag = (commit) => {
    const from = dragIndex;
    const to = dropIndex;
    const moved = commit && from >= 0 && to >= 0 && from !== to;
    /* FLIP 收尾（plans/035 §P3）：
       松手那一刻，被拖的卡还停在「手指位置」，而数组是**松手后**才重排的。
       旧实现 teardown() 无条件清空 inline transform，于是这张卡从手指位置
       瞬移回旧槽位，再被列表重排推去新槽位 —— 肉眼是一跳一格。
       这里先量下松手时的视觉位置，重排落地后把它「拉回」那个位置再 320ms 放掉。 */
    const liftedEl = dragEl;
    const fromRect = liftedEl ? liftedEl.getBoundingClientRect() : null;
    teardown();
    if (!moved) return;
    onReorder?.(from, to);
    if (!liftedEl || !fromRect || typeof liftedEl.animate !== 'function') return;
    // 不让 TransitionGroup 的 move 过渡和这段 FLIP 打架（两套一起跑就是「抖一下再滑」）
    liftedEl.classList.add('is-settling');
    void nextTick().then(() => {
      // 重排期间节点可能已被替换（拖的是上传中的项、父组件换了 key）。
      // 脱离文档的元素量出来是 0×0，直接算会得到一个巨大的位移，
      // 再对死节点跑 320ms 动画 —— 看不见、也不报错，只是 FLIP 静默失效。
      if (!liftedEl.isConnected) return;
      const toRect = liftedEl.getBoundingClientRect();
      const dx = fromRect.left - toRect.left;
      const dy = fromRect.top - toRect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        liftedEl.classList.remove('is-settling');
        return;
      }
      const settle = () => liftedEl.classList.remove('is-settling');
      let animation;
      try {
        animation = liftedEl.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
          { duration: 320, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
        );
      } catch {
        // 不支持 WAAPI：直接落到新槽位，别把 is-settling 留在元素上
        settle();
        return;
      }
      animation.finished.then(settle, settle);
    });
  };

  const handlePointerMove = (event) => {
    if (phase === 'idle' || event.pointerId !== pointerId) return;
    const isTouch = event.pointerType !== 'mouse';
    const dx = event.clientX - pressX;
    const dy = event.clientY - pressY;
    lastClientX = event.clientX;

    if (phase === 'pending') {
      const slop = isTouch ? TOUCH_SLOP_PX : MOUSE_SLOP_PX;
      const horizontal = Math.abs(dx) > Math.abs(dy) * 1.15 && Math.abs(dx) > slop;
      if (horizontal) {
        clearPressTimer();
        clearPressed();
        const strip = stripRef.value;
        if (strip) {
          // 手指横滑 = 胶片条滚动（touch-action: pan-y 把横轴判给了我们）
          phase = 'pan';
          strip.scrollLeft = pressScrollLeft - dx;
        } else {
          phase = 'idle';
        }
        return;
      }
      if (Math.abs(dy) > slop) {
        // 竖向：外层面板在滚，长按意图作废
        clearPressTimer();
        clearPressed();
        phase = 'idle';
        removeWindowListeners();
        return;
      }
      if (!isTouch && Math.hypot(dx, dy) > MOUSE_SLOP_PX) startDrag();
      return;
    }

    if (phase === 'pan') {
      const strip = stripRef.value;
      if (strip) strip.scrollLeft = pressScrollLeft - dx;
      return;
    }

    if (phase !== 'drag' || !dragEl) return;
    const minDx = -slotLefts[dragIndex];
    const maxDx = Math.max(minDx, contentWidth - cardWidth - slotLefts[dragIndex]);
    // clamp 在内容坐标系里：卡片可以滑到条带两端，但不会跑到滚动内容之外
    // （跑出去就会被 overflow 裁掉，看起来像"拖丢了"）
    grabDx = Math.min(Math.max(dx, minDx), maxDx);
    grabDy = Math.min(Math.max(dy, -MAX_TILT_Y_PX), MAX_TILT_Y_PX);
    const next = computeDropIndex(event.clientX);
    if (next !== dropIndex) dropIndex = next;
    paint();
  };

  const handlePointerUp = (event) => {
    if (phase === 'idle' || event.pointerId !== pointerId) return;
    if (phase === 'drag') {
      finishDrag(true);
      armClickSuppression();
      return;
    }
    // 横滑/普通点击：只收摊，不动数据
    phase = 'idle';
    clearPressTimer();
    clearPressed();
    removeWindowListeners();
    if (pointerId !== null) pointerId = null;
  };

  const handlePointerCancel = (event) => {
    if (event && pointerId !== null && event.pointerId !== pointerId) return;
    if (phase === 'drag') {
      finishDrag(false);
      return;
    }
    phase = 'idle';
    clearPressTimer();
    clearPressed();
    removeWindowListeners();
    pointerId = null;
  };

  const addWindowListeners = () => {
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
  };

  function removeWindowListeners() {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerCancel);
  }

  const handlePointerDown = (event) => {
    if (phase !== 'idle') return;
    if (typeof event.button === 'number' && event.button > 0) return;
    if (isLocked()) return;
    const strip = stripRef.value;
    if (!strip) return;
    const target = event.target?.closest?.('.post-image-preview-item');
    const nodes = readCards();
    const index = target ? nodes.indexOf(target) : -1;

    pointerId = event.pointerId;
    pressIndex = index;
    pressX = event.clientX;
    pressY = event.clientY;
    pressScrollLeft = strip.scrollLeft;
    lastClientX = event.clientX;
    phase = 'pending';
    addWindowListeners();

    // 触摸：长按拾起。鼠标：移动即拖（在 pointermove 里按阈值触发）。
    if (index >= 0 && canDragIndex(index)) {
      markPressed(target);
    }
    if (event.pointerType !== 'mouse' && index >= 0 && canDragIndex(index)) {
      clearPressTimer();
      pressTimer = setTimeout(() => {
        pressTimer = 0;
        if (phase === 'pending') startDrag();
      }, LONG_PRESS_MS);
    }
  };

  /* 拖拽/长按之后的 click 必须吞掉：否则松手会顺带打开全屏预览。
     用 capture 阶段拦在卡片内 button 之前。 */
  const handleStripClick = (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    clearSuppressTimer();
    event.preventDefault();
    event.stopPropagation();
  };

  onBeforeUnmount(() => {
    teardown();
    clearSuppressTimer();
  });

  return {
    stripRef,
    isReordering,
    handlePointerDown,
    handleStripClick,
  };
}
