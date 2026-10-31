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
import { motionEase } from './motion.js';

const LAYER_CLASS = 'boh-morph-layer';
const GHOST_CLASS = 'boh-morph-ghost';
const CONTEXT_CLASS = 'boh-morph-context';
const GHOST_STYLE_ID = 'boh-morph-ghost-style';

/**
 * 克隆体内**一律禁止 CSS 动画 / 过渡**（2026-10-31 修「关闭闪屏」）。
 *
 * ⚠️ 这是退场第一帧是纯白的根因：详情正文挂在 `.detail-content.fade-in-up` 上，
 *   那是 `animation: fadeInUp … both/fill` + `animation-delay: .1s`。克隆是**新插入的
 *   节点**，动画从头计时 —— 于是「这一页收进那张卡」的前 100ms 里整块内容
 *   opacity 恒为 0，用户看到的是「白页面缩下去」，而不是「详情缩回去」。
 *   实测（`_tmp-morph-frames`）：close-30 全白 → close-60 才隐约可见。
 *
 * ⚠️⚠️ 但**不能**写成 `animation: none`（第一版就是这么写的，害得另一处垫层整片空白）：
 *   仓库里有一类元素把 `opacity: 0` 写进了基础规则、只靠动画的 fill 把它抬到 1 ——
 *   典型是 `Forum/styles/base.css` 的 `.fade-in-up { animation: … forwards; opacity: 0 }`。
 *   禁用动画 = 退回 opacity 0 = 该元素在克隆里彻底消失。
 *   正确做法是让动画**立刻跑到终点**：时长/延迟归零 + `fill: both`，终帧就是「已显示」。
 *   `iteration-count: 1` 顺手掐掉 infinite 的骨架微光（时长 0 的无限动画 Chrome 会当成
 *   已完成，显式写死更稳）。
 *
 * 它不影响原页面（原节点没有这个类），也不会拦掉收缩动画 —— 收缩走的是 WAAPI
 * `ghost.animate()`，CSS `animation-*` 声明管不到它。
 */
function ensureGhostStyle() {
  if (document.getElementById(GHOST_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = GHOST_STYLE_ID;
  style.textContent =
    `.${GHOST_CLASS}, .${GHOST_CLASS} * {` +
    'animation-duration: 0s !important;' +
    'animation-delay: 0s !important;' +
    'animation-iteration-count: 1 !important;' +
    'animation-fill-mode: both !important;' +
    'transition: none !important;' +
    '}';
  document.head.appendChild(style);
}

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
 * 样式上下文壳 —— 克隆**必须**带着原来的选择器上下文。
 *
 * ⚠️ 这是「返回时那块异常白色区块」的根因（2026-10-31 实测）：
 *   详情正文卡是 `class="x-post-card glass-panel"`，在页面上靠
 *   `.post-detail-page .x-post-card { background: transparent; border-radius: 0;
 *   box-shadow: none }` 把它在详情里的样子**覆盖**成「无底、直角、无阴影」。
 *   克隆一旦被挂到 body 下，那条祖先选择器就不再命中 ⇒ 全部回落到 `.glass-panel`
 *   的默认白玻璃。实测 computed 值：
 *     background-color: rgba(255,255,255,0.8) / border-radius: 24px /
 *     box-shadow: 0 4px 24px rgba(0,0,0,.03)
 *   于是「这一页收进那张卡」变成了「一块白色圆角面板压在列表上缩下去」。
 *
 * 做法：用页面根的 `cloneNode(false)` 做一层**只有属性没有内容**的壳
 * （class / `data-v-*` / `data-theme` / `data-anniversary-skin` 全部保留），
 * 让 `.post-detail-page ...` 这类后代选择器、以及页根上定义的 `--detail-*`
 * 自定义属性重新生效；再把壳自身的布局/动画内联中和掉，使它只承担「样式环境」，
 * 不参与定位（ghost 是 absolute，仍相对 fixed 的层）。
 */
function createContextShell(contextEl) {
  if (!contextEl || typeof contextEl.cloneNode !== 'function') return null;
  const shell = contextEl.cloneNode(false);
  stripIds(shell);
  shell.classList.add(CONTEXT_CLASS);
  shell.style.cssText = [
    // 壳只负责「当祖先」。任何会改变包含块 / 尺寸 / 可见性的属性都必须清掉：
    // transform / filter / backdrop-filter / contain 会把绝对定位的包含块换掉
    // （仓库里踩过多次），页根上的进场动画还会让壳自己先淡入一遍。
    'position: static',
    'z-index: auto',
    'inset: auto',
    'display: block',
    'width: auto',
    'height: 0',
    'min-height: 0',
    'margin: 0',
    'padding: 0',
    'border: 0',
    'background: none',
    'box-shadow: none',
    'overflow: visible',
    'transform: none',
    'filter: none',
    'backdrop-filter: none',
    '-webkit-backdrop-filter: none',
    'contain: none',
    'animation: none',
    'transition: none',
    'will-change: auto',
    'pointer-events: none',
  ].join(';');
  return shell;
}

/**
 * 把 `sourceEl` 收缩到 `targetRect`（视口坐标）。
 *
 * @param {Element} sourceEl 当前页面上的元素（会被克隆，不改动原节点）
 * @param {{left:number,top:number,width:number,height:number}} targetRect
 * @param {{duration?:number, context?:Element|null, backdrop?:string}} [options]
 *   `context`  页面根（提供 `.post-detail-page ...` 选择器上下文与 `--detail-*` 变量），
 *              不传就退化成旧行为（克隆裸挂 body，样式可能塌成白玻璃 —— 见 createContextShell）
 *   `backdrop` 克隆的底色（一般传页面根 computed 的 background-color）。源元素自身是
 *              透明的（详情页正文卡）时不垫底色，收缩过程就是「文字浮在列表上飘进去」
 * @returns {Promise<boolean>} 是否真的播了
 */
export function playCollapseMorph(
  sourceEl,
  targetRect,
  { duration = 480, context = null, backdrop = '' } = {},
) {
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
    ensureGhostStyle();
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
      // 内联底色优先于任何 `.post-detail-page .x-post-card { background: … }` 规则，
      // 保证「窗口」在整段收缩里都是页面的那块底，而不是透出下面的列表
      backdrop ? `background-color: ${backdrop}` : '',
    ]
      .filter(Boolean)
      .join(';');
    layer = createLayer();
    const shell = createContextShell(context);
    if (shell) {
      shell.appendChild(ghost);
      layer.appendChild(shell);
    } else {
      layer.appendChild(ghost);
    }
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

  const ms = Math.max(80, Number(duration) || 360);
  /* 曲线读 `--ease-morph-out`（`tokens.css`，返程专用）：
     收缩要「贴到卡片上」，末段必须慢下来，否则最后一截是瞬移，
     看起来像「收到一半突然消失」。
     ⚠️ 别换成入场的 `--ease-morph`（0.3, 0.12, 0.15, 1）—— 那条前 30% 时间
     只走 12% 位移，收缩会「愣一下再收」，用户 2026-10-31 直接报「返回过慢」。
     读不到变量时兜底回这条字面量（构建期样式缺失才会走到）。 */
  const clipA = ghost.animate([{ clipPath: insetOpen(0) }, { clipPath: win.value }], {
    duration: ms,
    easing: motionEase('--ease-morph-out', 'cubic-bezier(0.32, 0.72, 0, 1)'),
    fill: 'both',
  });
  /* 透明度：**在收拢到卡片大小之前就淡完**（2026-10-31 用户
     「快回到原本列表大小的时候该窗口应该已经要渐隐消失了」）。

     linear 的关键帧 offset 是**墙钟时间**，而几何走的是前载曲线
     （--ease-morph-out 在 45% 时间点已走完 94%），两者的关系：
       · offset 0.25 ⇒ 几何 ~84%，窗口还明显比卡片大 → 此时才开始变淡；
       · offset 0.65 ⇒ 几何 ~97.5%（竖屏 481 vs 476 ≈ 1%）→ 此时已完全透明。
     于是**最后 35% 的行程里影子已经不在**，用户看到的是「真列表已经在那儿了」，
     而不是「一块亮窗口一路贴到卡片上才消失」。旧值（0.70 起淡、1.0 归零）
     正是后者：几何 94% 时还全亮，收满了才开始掉。
     ⚠️ 两头都不能再推：起点推到 0.4 之后窗口已经跟卡片差不多大才淡（就是原来的
     毛病）；终点推到 0.74 之后影子会活到几乎贴住卡片（实测 360ms 那档最后
     可见帧落在 282ms、窗口高 646 vs 卡片 644）。

     ⚠️⚠️ **末帧必须显式写 `offset: 1`**（2026-10-31 实测踩过）：WAAPI 会为
     「没有 offset 1 的末关键帧」自动追加一个隐式帧，用的是**元素的 underlying
     value**（这里是 1）⇒ 淡出跑完 0.65 之后会**反弹回不透明**，实测 200ms 时
     opacity 0.005、260ms 又回到 0.92，等于「化掉了又亮回来」。 */
  ghost.animate(
    [
      { opacity: 1 },
      { opacity: 1, offset: 0.25 },
      { opacity: 0, offset: 0.65 },
      { opacity: 0, offset: 1 },
    ],
    {
      duration: ms,
      easing: 'linear',
      fill: 'both',
    },
  );

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
