/**
 * 返程收缩层 —— 「详情 → 列表卡片」的那一帧（plans/035 §L3）
 *
 * 为什么需要它：竖屏详情是**整页路由**，进入详情时列表已被卸载。所以在「返回」
 * 这一刻，目标卡片**还不存在**（要等列表重新挂载、还原滚动位置）。任何
 * 「让详情元素自己缩回卡片」的写法都会失败 —— 元素马上就要被卸载。
 *
 * 做法：离场前把正文卡**克隆**一份，放到 body 下的固定层里（视觉上与原地一字不差），
 * 然后让这份克隆收缩到入口时记下的卡片矩形；路由照常跳转，列表在下面长出来，
 * 克隆落到卡片位置时淡出并移除。用户看到的是「这一页收成了那张卡」。
 *
 * 四条硬约束：
 *  ① **克隆必须先钉死尺寸再定位**。不钉宽高的话，放进 `position: fixed` 的层里
 *     会按新的包含块重新排版，字会换行、图和文字的相对位置全变。
 *  ② **z-index 要低于图片查看器**（2147483000），否则从详情里开大图再返回时
 *     大图会被克隆盖住。
 *  ③ **一律 `pointer-events: none`**：这一层存在 480ms，期间用户可能立刻点列表里的
 *    东西，绝不能被一块透明的残影挡掉。
 *  ④ **结束必须移除节点**（成功、失败、被 cancel 三条路都要走）。留在 body 上的
 *     克隆节点会吃掉后续所有「点到了哪里」的判断，而且看不见、查不出来。
 */

import { insetFromRect, insetOpen } from './motion-origin.js';

const LAYER_CLASS = 'boh-morph-layer';
const GHOST_CLASS = 'boh-morph-ghost';

/**
 * 每次调用都建一个**自己的**层。
 *
 * ⚠️ 不要复用单例层：两次收缩重叠时（连点两次返回、或返回时又点了另一条帖子），
 * 后来的那次会 `replaceChildren()` 清掉前一次的克隆，而前一次收尾时 `layer.remove()`
 * 又会把**后一次还活着的那层**一起拆掉 —— 表现是第二次收缩凭空消失。
 */
function createLayer() {
  const layer = document.createElement('div');
  layer.className = LAYER_CLASS;
  layer.setAttribute('aria-hidden', 'true');
  // 约束③：整层不参与命中测试
  layer.style.cssText = [
    'position: fixed',
    'inset: 0',
    'z-index: 2147482000',
    'pointer-events: none',
    'overflow: hidden',
    // layout + paint：给绝对定位的克隆一个包含块，并把超出视口的部分裁掉。
    // ⚠️ 不要写 `contain: strict` —— 它含 size containment，会把这一层按「无内容」
    // 定尺寸，克隆在内层就是 0×0（看不见、也查不出原因）。
    'contain: layout paint',
  ].join(';');
  document.body.appendChild(layer);
  return layer;
}

/** 克隆里重复的 id 会造成 document 查询歧义，一律摘掉（不影响观感）。 */
function stripIds(root) {
  root.removeAttribute('id');
  if (root.querySelectorAll) {
    root.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
  }
}

/**
 * 把 `sourceEl` 收缩到 `targetRect`（视口坐标）。
 *
 * @param {Element} sourceEl 当前页面上的元素（会被克隆，不改动原节点）
 * @param {{left:number,top:number,width:number,height:number}} targetRect
 * @param {{duration?:number}} [options]
 * @returns {Promise<boolean>} 是否真的播了
 */
export function playCollapseMorph(sourceEl, targetRect, { duration = 480 } = {}) {
  if (typeof document === 'undefined' || typeof window === 'undefined')
    return Promise.resolve(false);
  if (!sourceEl || typeof sourceEl.cloneNode !== 'function') return Promise.resolve(false);
  if (!targetRect || !(targetRect.width > 1) || !(targetRect.height > 1))
    return Promise.resolve(false);

  const box = sourceEl.getBoundingClientRect();
  if (!box.width || !box.height) return Promise.resolve(false);

  let layer = null;
  let ghost = null;
  const cleanup = () => {
    ghost?.remove();
    layer?.remove();
  };

  try {
    const clone = sourceEl.cloneNode(true);
    stripIds(clone);
    ghost = clone;
    ghost.classList.add(GHOST_CLASS);
    // 约束①：先钉死尺寸，再定位。宽高必须来自原元素，不能让它自适应
    ghost.style.cssText = [
      `position: absolute`,
      `left: ${box.left}px`,
      `top: ${box.top}px`,
      `width: ${box.width}px`,
      `height: ${box.height}px`,
      'margin: 0',
      'transform-origin: 0 0',
      'will-change: transform, opacity',
    ].join(';');
    layer = createLayer();
    layer.appendChild(ghost);
  } catch {
    cleanup();
    return Promise.resolve(false);
  }

  /* 窗口收缩（2026-10-31 改，iOS 口径）：克隆**保持全尺寸**，用 clip-path 的
     `inset()` 把它裁到卡片矩形 —— 内容一帧都不缩放，所以文字不会被压扁，
     也不需要靠「提前压掉透明度」来掩盖变形（旧 FLIP 版本必须在 30% 就把
     opacity 压到 1 以下，正是为了遮丑）。

     窗口面积随时间连续变化，末段贴到卡片边缘时还看得清，观感是「这一页被
     收进那一格」；旧版非等比缩放则是「一块矩形被抽走」，中途是扁长的怪物形状。 */
  const win = insetFromRect(targetRect, box, { radius: targetRect.radius || 12 });
  const canAnimate = typeof ghost.animate === 'function';
  if (!win || !canAnimate) {
    cleanup();
    return Promise.resolve(false);
  }

  const ms = Math.max(80, Number(duration) || 480);
  /* 曲线用 --ease-morph（起步快、末段缓）而不是 ease-in：
     收缩要「贴到卡片上」，末段必须慢下来，否则最后一截是瞬移，
     看起来像「收到一半突然消失」。 */
  const clipA = ghost.animate([{ clipPath: insetOpen(0) }, { clipPath: win.value }], {
    duration: ms,
    easing: 'cubic-bezier(0.3, 0.12, 0.15, 1)',
    fill: 'both',
  });
  // 透明度只在最后 30% 掉：窗口边缘已经和卡片重合，此时淡出才是「交接」而不是「遮丑」
  ghost.animate([{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], {
    duration: ms,
    easing: 'linear',
    fill: 'both',
  });

  // 约束④：三条收尾路径都清理
  return clipA.finished.then(
    () => {
      cleanup();
      return true;
    },
    () => {
      cleanup();
      return false;
    },
  );
}
