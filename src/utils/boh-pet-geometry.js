/**
 * boh-pet-geometry.js —— 小方气泡与菜单的定位几何（2026-11-23）
 *
 * 为什么单独抽出来：这两个定位都踩过**只有在窄屏才暴露**的真 bug，
 * 而且是纯数学问题（不依赖 Vue、不依赖 DOM 测量），最适合用纯函数锁死。
 *
 * 已修的坑（写在这里，避免有人「顺手简化」又改回去）：
 *   1) 右缘气泡原先是「左锚定 + maxWidth」⇒ 390 宽的手机上长句会溢出右边界
 *      被裁一半（短句恰好不触发，桌面宽屏更不触发）。现在改 right 锚定。
 *   2) 菜单高度写死 76 是按桌面 26px 项高算的，触摸端项高 44px ⇒ 垂直钳制算错。
 *
 * 一条纪律：本文件**不许读 window**。视口尺寸由调用方传入，这样测试才能
 * 穷举任意宽度（320 / 360 / 390 / 430 / 1280…）。
 */

/** 气泡最大宽度：窄屏收窄占屏比，但保留够读一行短句的宽度。 */
export const bubbleMaxWidth = (viewportWidth) => Math.min(200, Math.max(132, viewportWidth - 96));

/** 菜单宽度（固定，两项中文短词足够）。 */
export const MENU_WIDTH = 132;

/** 菜单高度：触摸端项高 44px × 2 + padding 8 + gap 2；桌面 26px × 2 + 8 + 2。 */
export const menuHeight = (isTouch) => (isTouch ? 98 : 76);

/**
 * 气泡定位。
 *
 * @param {{
 *   edge: 'left'|'right'|'top'|'bottom'|null,  // null = 浮空
 *   pos: {x: number, y: number},               // 挂件左上角（px）
 *   peekW: number,                             // 贴边探头宽度
 *   size: number,                              // 挂件全尺寸边长
 *   viewport: {w: number, h: number},
 * }} a
 * @returns {Record<string, string>} 直接可绑到 :style 的对象
 */
export function computeBubbleGeometry({ edge, pos, peekW, size, viewport }) {
  const W = viewport.w;
  const H = viewport.h;
  const MAX_W = bubbleMaxWidth(W);
  // 垂直钳制：至少留 96px 给气泡（两行），但不越过视口下缘
  const topClamp = (t) => Math.round(Math.min(Math.max(8, t), Math.max(8, H - 96)));

  if (edge === 'left') {
    // 左缘：气泡在右侧，左锚定（从探头右边长出去，数学上不可能越过左边界）
    return {
      left: `${Math.round(peekW + 8)}px`,
      top: `${topClamp(pos.y)}px`,
      maxWidth: `${MAX_W}px`,
      transformOrigin: 'left center',
    };
  }
  if (edge === 'top') {
    return {
      left: `${Math.round(Math.min(Math.max(8, pos.x), Math.max(8, W - MAX_W - 8)))}px`,
      top: `${Math.round(peekW + 8)}px`,
      maxWidth: `${MAX_W}px`,
      transformOrigin: 'center top',
    };
  }
  if (edge === 'bottom') {
    return {
      left: `${Math.round(Math.min(Math.max(8, pos.x), Math.max(8, W - MAX_W - 8)))}px`,
      bottom: `${Math.round(H - pos.y + 8)}px`,
      maxWidth: `${MAX_W}px`,
      transformOrigin: 'center bottom',
    };
  }
  /* 右缘：气泡在左侧，**右锚定** —— 右边缘钉在「挂件左边 - 8」，
     气泡向左生长。这是修掉「长句撑满 maxWidth 后越过右边界」的关键：
     左锚定时 right = left + width，宽度一撑就超出视口；右锚定时宽度怎么长
     都只往左走。
     ⚠️ 浮空（edge=null）不能照抄：浮空时挂件可能停在屏幕中间，
     右锚定会让气泡从中间往左长 200px，屏幕窄时左边界变成负数。
     浮空按「靠哪半屏」选锚定 —— 右半屏右锚定、左半屏左锚定，
     两侧都放得下时优先右侧（与贴右缘的视觉一致）。 */
  if (edge === null) {
    const rightAnchored = pos.x + size / 2 > W / 2;
    if (rightAnchored) {
      /* 右锚定 + 可用空间钳制：气泡只能长到「挂件左边 - 16」那么宽
         （8 间距 + 8 边距），否则窄屏上 200px 的 maxWidth 会把左边界压成负数。 */
      const avail = Math.max(96, pos.x - 16);
      return {
        right: `${Math.round(W - pos.x + 8)}px`,
        top: `${topClamp(pos.y + 4)}px`,
        maxWidth: `${Math.round(Math.min(MAX_W, avail))}px`,
        transformOrigin: 'right center',
      };
    }
    const availLeft = Math.max(96, W - (pos.x + size + 8) - 8);
    return {
      left: `${Math.round(Math.max(8, Math.min(pos.x + size + 8, W - MAX_W - 8)))}px`,
      top: `${topClamp(pos.y + 4)}px`,
      maxWidth: `${Math.round(Math.min(MAX_W, availLeft))}px`,
      transformOrigin: 'left center',
    };
  }
  /* 右缘：钉在视口右缘，可用空间恒等于 pos.x - 16，与浮空同一套钳制。 */
  return {
    right: `${Math.round(W - pos.x + 8)}px`,
    top: `${topClamp(pos.y + 4)}px`,
    maxWidth: `${Math.round(Math.min(MAX_W, Math.max(96, pos.x - 16)))}px`,
    transformOrigin: 'right center',
  };
}

/**
 * 菜单定位：默认挂在挂件左侧；左边放不下就翻到右侧。
 * 垂直方向必须用真实菜单高度钳制（触摸端比桌面高 22px）。
 *
 * @param {{
 *   pos: {x: number, y: number},
 *   size: number,
 *   viewport: {w: number, h: number},
 *   isTouch: boolean,
 * }} a
 * @returns {Record<string, string>}
 */
export function computeMenuGeometry({ pos, size, viewport, isTouch }) {
  const W = viewport.w;
  const H = viewport.h;
  const MENU_H = menuHeight(isTouch);
  let left = pos.x - MENU_WIDTH;
  if (left < 8) left = Math.min(pos.x + size + 8, Math.max(8, W - MENU_WIDTH - 8));
  const top = Math.min(Math.max(8, pos.y), Math.max(8, H - MENU_H - 8));
  return {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    width: `${MENU_WIDTH}px`,
  };
}
