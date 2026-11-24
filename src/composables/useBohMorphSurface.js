/**
 * 浮层「从哪来、回哪去」形变 —— 一套实现，多处复用（plans/047）
 *
 * ── 它解决什么 ───────────────────────────────────────────────────
 * 全站有 5 个浮层在做同一件事：从被点中的那张卡片**推开**（`clip-path` 窗口展开），
 * 关闭时窗口**收回**卡片。逻辑原本各写一份（PostDetailModal / ProductDetailSheet /
 * LotteryDetailSheet / 两个 ImageViewer），每份都踩过同一组坑。
 *
 * 本 composable 把那五条实测结论固化成唯一实现，宿主只提供「哪个元素要动、
 * 来源卡片的 key 是什么」。
 *
 * ── 为什么不做进 BohModal ────────────────────────────────────────
 * 形变要改的是**面板自身的 `clipPath` / `transition-property` / `transform`**，
 * 以及「面板内部某一层」的纵深缩放 —— 而纵深层是宿主自己的 DOM 结构
 * （`.pd-modal-scroll`、`.surface-scroll` …）。壳一旦知道这些就会耦合到具体宿主。
 * 所以：壳负责遮罩/滚锁/焦点/进出场**时机**，形变是独立一层。
 * 壳侧唯一协作点 = `morph` prop（为真时不接管面板动画，见 BohModal）。
 *
 * ── 五条坑（每条都有实测出处，改之前先读为什么）──────────────────
 * ① **退场时模板 ref 已解绑**：`v-if` 翻假的瞬间 Vue 就解绑 ref，即使节点被
 *    `<Transition>` 的 leave 留着继续淡出。所以元素要能回落成 DOM 查询，
 *    否则退场形变直接不播（这正是 2026-10-31「关闭不缩回」的真因）。
 * ② **形变期间必须把 `transition-property` 收成只剩 width**：CSS Cascade 里
 *    transitions 在最后一档，**压过 animations**。Vue 的 enter/leave 类会给面板挂
 *    `transition: transform … / opacity …`，把 WAAPI 形变整段压掉（实测宽度全程不动，
 *    只剩淡入，且没有任何报错）。
 * ③ **`transform` 同时要钉成 none**：收了 transition-property 之后，leave-to 的
 *    `scale(1.008)` 会**瞬间**生效（实测面板立刻变成 1032×758，末帧窗口落不到卡片上），
 *    enter-from 的 `translateY(12px)` 同理会把起点抬高。窗口方案里面板自己不该动。
 * ④ **退场透明度必须是独立一条 linear 动画，且末帧显式 `offset: 1`**：
 *    - 不能塞进几何那条关键帧 —— 几何走前载曲线（`--ease-morph-out` 在 45% 墙钟
 *      时间已走完 94%），同一个 offset 会落到完全不同的窗口大小上；
 *    - 不写 `offset: 1` 时 WAAPI 会追加一个取 underlying value（opacity 1）的隐式帧
 *      ⇒ 淡出到 0.65 之后**反弹回不透明**（实测 200ms 0.005 → 260ms 0.92）。
 *    - 淡出窗口 0.25 起、0.65 归零：0.25 时几何约 84%（窗口还明显大于卡片，这时才开始淡），
 *      0.65 时约 97.5%（基本等于卡片，已完全透明）。
 * ⑤ **退场必须 `keepFinal: true`**：默认收尾会 `cancel()`，cancel 的瞬间元素弹回原尺寸，
 *    紧接着 Vue 的 leave 才刚开始淡出 ⇒ 用户看到「缩进去、又弹回全屏、再淡出」
 *    （实测第 374ms 宽度从 185px 跳回 390px，此时遮罩 opacity 仍是 1.00）。
 */

import { nextTick, onBeforeUnmount, ref } from 'vue';
import {
  animateMorph,
  canMorph,
  insetFromRect,
  insetOpen,
  peekOrigin,
} from '@/utils/motion-origin.js';
import { motionEase, motionMs, motionNum } from '@/utils/motion.js';

/** 来源元素没记录圆角时的兜底值（与论坛详情 `.pd-modal-panel` 的 12px 同档） */
const DEFAULT_RADIUS = 12;
/** 纵深默认关闭：小于这个倍数时缩放不可见，白跑一条 WAAPI */
const MIN_DEPTH = 1.001;

/**
 * @param {object} options
 * @param {import('vue').Ref<Element|null>} options.surfaceRef 要做形变的元素
 * @param {() => string} options.originKey 来源卡片 key（必须带身份）
 * @param {string} [options.surfaceSelector] 退场时 ref 已解绑，用它回落到 DOM 查询（坑①）
 * @param {string} [options.depthSelector] 纵深层（相对 surface 内部查询）；不传则不跑纵深
 * @param {() => boolean} [options.enabled] 额外开关，默认拿起 `canMorph()`
 * @param {number} [options.fallbackRadius] 来源无圆角时的兜底
 */
export function useBohMorphSurface({
  surfaceRef,
  originKey,
  surfaceSelector = '',
  depthSelector = '',
  enabled = () => true,
  fallbackRadius = DEFAULT_RADIUS,
}) {
  /** 退场已开始：防重复触发（close 有多条入口：按钮 / Esc / 遮罩 / 路由） */
  const closing = ref(false);

  /** 取面板元素：ref 优先，退场时回落到 DOM 查询（坑①）。 */
  const resolveSurface = () => {
    const fromRef = surfaceRef?.value;
    if (fromRef) return fromRef;
    if (!surfaceSelector || typeof document === 'undefined') return null;
    return document.querySelector(surfaceSelector);
  };

  /** 形变起点的窗口值（来自来源卡片）。拿不到 / 环境不允许 ⇒ null（调用方降级淡入）。 */
  const startWindow = (el) => {
    if (!el || !canMorph() || !enabled()) return null;
    const key = originKey?.();
    if (!key) return null;
    const source = peekOrigin(key);
    if (!source) return null;
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    return insetFromRect(
      source,
      { left: box.left, top: box.top, width: box.width, height: box.height },
      { radius: source.radius || fallbackRadius },
    );
  };

  const radiusOf = (el) => {
    if (!el || typeof getComputedStyle !== 'function') return 0;
    return Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  };

  /**
   * 跑一段形变。
   * @param {'in'|'out'} direction
   * @returns {Promise<boolean>} 是否真的播了（false ⇒ 调用方走降级）
   */
  async function play(direction) {
    if (!canMorph() || !enabled()) return false;
    const incoming = direction === 'in';

    /* 进场要等渲染完（此时面板已在 DOM 且尺寸稳定）；退场先量再等 —— 坑①：
       退场时 ref 可能已解绑，但节点仍在文档里 460ms，DOM 查询量得到。 */
    if (incoming) await nextTick();
    const el = resolveSurface();
    if (!el) return false;

    const win = startWindow(el);
    if (!win) return false;

    const radiusTo = radiusOf(el);
    const duration = motionMs(
      incoming ? '--motion-morph-in-near' : '--motion-morph-out',
      incoming ? 480 : 360,
    );
    /* 进 / 出**不同曲线**：入场用 --ease-morph（峰值压到 30–45%，全程都有可见运动），
       退场用 --ease-morph-out（前载，立刻响应 + 末段轻贴）。入场用前载曲线会「一闪而过」。 */
    const easing = motionEase(incoming ? '--ease-morph' : '--ease-morph-out');

    /* 坑②③：把面板自己的动画通道收干净，WAAPI 才是唯一真源。
       恢复交给调用方（进场结束后置空；退场元素随即被移除，不必恢复）。 */
    const restoreTransition = () => {
      el.style.transitionProperty = '';
      el.style.transform = '';
    };
    el.style.transitionProperty = 'width';
    el.style.transform = 'none';

    /* 纵深：挂在内容层上，原点取卡片中心 —— 用默认 50% 50% 会让放大从面板中心
       发散，方向与「从这一格推开」相反。 */
    const depth = motionNum('--morph-depth', 1);
    if (depthSelector && depth > MIN_DEPTH) {
      const inner = el.querySelector(depthSelector);
      if (inner) {
        const box = el.getBoundingClientRect();
        const key = originKey?.();
        const source = key ? peekOrigin(key) : null;
        if (source) {
          const origin = `${(source.left + source.width / 2 - box.left).toFixed(1)}px ${(
            source.top +
            source.height / 2 -
            box.top
          ).toFixed(1)}px`;
          const frames = incoming
            ? [
                { transform: `scale(${depth.toFixed(3)})`, transformOrigin: origin },
                { transform: 'scale(1)', transformOrigin: origin },
              ]
            : [
                { transform: 'scale(1)', transformOrigin: origin },
                { transform: `scale(${depth.toFixed(3)})`, transformOrigin: origin },
              ];
          void animateMorph(inner, frames, {
            duration,
            easing,
            // 退场同样要保留终态，否则 cancel 的瞬间内容「弹回」1.0
            keepFinal: !incoming,
          });
        }
      }
    }

    if (incoming) {
      // 先钉住起始帧：nextTick 与 animate() 之间跨帧会露出全尺寸的一帧
      el.style.clipPath = win.value;
      await animateMorph(el, [{ clipPath: win.value }, { clipPath: insetOpen(radiusTo) }], {
        duration,
        easing,
      });
      el.style.clipPath = '';
      restoreTransition();
      return true;
    }

    /* 坑⑤：退场保留终态，cancel 会弹回全屏。
       几何那条**不能 await 之后再发透明度**（第一版就是这个错）：几何走 360ms，
       淡出要到它播完才开始 ⇒ 那时节点已快被摘除，实测只有 clipPath 一条动画在
       跑、opacity 全程 1.00。两条必须**并行发起**（论坛详情 `PostDetailModal`
       就是 `void` 两条连续发），然后用几何那条的 promise 表达「播完了」。 */
    const geometry = animateMorph(
      el,
      [{ clipPath: insetOpen(radiusTo) }, { clipPath: win.value }],
      { duration, easing, keepFinal: true },
    );
    /* 坑④：透明度独立 linear，末帧显式 offset 1（否则反弹回不透明）。
       窗口 0.25 起淡 / 0.65 归零：此时几何约 84%→97.5%（前载曲线），
       视觉上是「快贴回卡片时才消失」，不是「一块亮窗口一路贴上去」。 */
    void animateMorph(
      el,
      [
        { opacity: 1 },
        { opacity: 1, offset: 0.25 },
        { opacity: 0, offset: 0.65 },
        { opacity: 0, offset: 1 },
      ],
      { duration, easing: 'linear', keepFinal: true },
    );
    /* ⚠️ 必须等几何播完再返回：宿主组件常被父级 `v-if` 控制
       （`<ProductDetailSheet v-if="selectedProduct">`），`emit('close')` 会让
       整棵子树**立即**卸载，壳的 <Transition> 写了离场时长也保不住 ——
       实测节点在 8ms 就被摘除，形变一帧都没跑。它与「壳的 leave 时长」是两套
       保险：壳保「不在中途被 CSS 摘掉」，这里保「卸载前一定播完」。 */
    await geometry;
    return true;
  }

  /** 带守卫的退场：多入口调用只播一次，返回是否播了（宿主据此决定何时 emit close）。 */
  async function playClose() {
    if (closing.value) return false;
    closing.value = true;
    const played = await play('out');
    if (!played) closing.value = false;
    return played;
  }

  onBeforeUnmount(() => {
    closing.value = false;
  });

  return { play, playClose, closing };
}
