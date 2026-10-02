/**
 * 评论 / 回复类 textarea 的「多字扩展」— 全站单一实现点。
 *
 * ## 为什么需要它
 * textarea 的高度由 `rows` 属性决定，**与内容无关**；`resize: none` 之后连手动拖高也被封掉。
 * 竖屏手机写超过初始行数的评论时，文字只能在框内滚动，看不到正在写的上下文
 * （2026-09-30 报障：「论坛竖屏评论输入没有多字扩展，即输入框不会改变」）。
 *
 * 修复前项目里已有 4 份各自独立的自动增高实现，上限分别是 132 / 200 / 无上限 ——
 * 属 AGENTS.md 第 0 条要防的「同一条规则多处定义」，故收敛到本文件，不再加第 5 份。
 *
 * ## 两条必须遵守的规则
 * 1. 先 `height = 'auto'` 再读 `scrollHeight`，否则**收缩路径测不出来**。
 *    空内容时 `scrollHeight` 天然等于 `rows` 撑出的高度，所以不需要另算最小高度 ——
 *    这也是本实现不解析 `line-height` 的原因（`line-height: normal` 解析出来是 NaN，
 *    再叠一层兜底常量只会引入误差）。
 *    ⚠️ 但「空内容 scrollHeight = rows 固有高度」有一个前提：**框足够宽、placeholder 不折行**。
 *    窄框（如详情页底栏输入框，宽仅 ~107px）里折行后的占位文字会被算进 scrollHeight，
 *    空态直接变成两行高。测量时临时摘掉 placeholder 才能保住这个前提，见 `measureNow`。
 * 2. 高度是**内容驱动**的，父组件改写 value 时同样要重算。论坛回复框用的是
 *    `:value` + `@input` 受控写法，切换回复对象 / 发送成功清空 / 取消都由父组件改写内容 ——
 *    只绑 `@input` 的实现在这些路径上不会收缩（`ForumMain.vue` 的 `toggleReplyInput`）。
 *
 * ## 真源划分
 * - 上限：CSS 的 `max-height`（断点可调）。JS 读 `getComputedStyle` 取用，
 *   **不在 JS 里写第二份像素值**。
 * - 行高 / 内边距 / 边框：一律从 `getComputedStyle` 读，不写常量。
 *   （注意 `src/style.css` 在 `max-width: 768px` 下把 textarea 字号强制成 16px，
 *   CSS 里写的 15px 不是竖屏实际值。）
 *
 * ## 事件接线放在本文件里，不交给调用方
 * 元素是 `v-if` 出来的（`activeReplyTarget` 命中才渲染），所以不能挂 `onMounted`，
 * 而是 `watch(textareaRef)` 在元素出现 / 消失时挂卸监听 —— 调用方因此少一个「能忘」的接线点。
 *
 * ## 与 useKeyboardInset.js 的关系
 * 两者互不依赖：本文件只管高度，键盘遮挡判据一律走 `useKeyboardInset`（`--kb-inset`）。
 */

import { onBeforeUnmount, ref, unref, watch } from 'vue';

/**
 * 纯函数：由测量值算出要写入的像素高度。
 *
 * 单独导出是为了能在 node 环境（`vitest` 的 environment 是 node，无 DOM）下做单元测试 ——
 * 真实布局由 `scripts/probes/probe-reply-autogrow.mjs` 在浏览器里验，两边不重复。
 *
 * @param {object} metrics
 * @param {number} metrics.scrollHeight  `height: auto` 之后读到的 scrollHeight（含内边距，不含边框）
 * @param {number} [metrics.paddingTop=0]
 * @param {number} [metrics.paddingBottom=0]
 * @param {number} [metrics.borderTop=0]
 * @param {number} [metrics.borderBottom=0]
 * @param {string} [metrics.boxSizing='border-box']
 * @param {number} [metrics.maxHeight=Infinity] CSS 上限；未设时传 Infinity（调用方已把 `none`/NaN 归一）
 * @returns {number} 要写入的高度（px，整数，与 box-sizing 口径一致）
 */
export const resolveAutoGrowHeight = ({
  scrollHeight,
  paddingTop = 0,
  paddingBottom = 0,
  borderTop = 0,
  borderBottom = 0,
  boxSizing = 'border-box',
  maxHeight = Infinity,
} = {}) => {
  const raw = Number.isFinite(scrollHeight) ? scrollHeight : 0;
  const padding = (paddingTop || 0) + (paddingBottom || 0);
  const border = (borderTop || 0) + (borderBottom || 0);
  // scrollHeight 含内边距、不含边框：border-box 下补边框，content-box 下减掉内边距。
  const natural = boxSizing === 'content-box' ? raw - padding : raw + border;
  const cap = Number.isFinite(maxHeight) && maxHeight > 0 ? maxHeight : Infinity;
  return Math.max(0, Math.round(Math.min(natural, cap)));
};

/** 把 CSS 长度值解析成数字；`none` / `auto` / 空串一律视为「无上限」。 */
const parseCssLength = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

/**
 * @param {object} [options]
 * @param {import('vue').Ref<string>|(() => string)|null} [options.value]
 *        受控内容。传入后，内容被父组件改写时会自动重算（判据 E）。
 * @returns {{ textareaRef: import('vue').Ref<HTMLTextAreaElement|null>, resize: () => void, resetHeight: () => void }}
 */
export function useAutoGrowTextarea(options = {}) {
  const { value = null } = options;

  const textareaRef = ref(null);

  /** 上次观测到的宽度，用于过滤掉「我们自己改高度」触发的 ResizeObserver 回调。 */
  let observedWidth = -1;
  /** 中文拼音组字期间 scrollHeight 会抖动，先挂起，组字结束再补算。 */
  let composing = false;
  let frameId = 0;
  let observer = null;
  let boundEl = null;

  const hasDom = () => typeof window !== 'undefined' && typeof document !== 'undefined';

  const readMetrics = (el) => {
    const style =
      hasDom() && typeof window.getComputedStyle === 'function'
        ? window.getComputedStyle(el)
        : null;
    return {
      paddingTop: style ? parseFloat(style.paddingTop) || 0 : 0,
      paddingBottom: style ? parseFloat(style.paddingBottom) || 0 : 0,
      borderTop: style ? parseFloat(style.borderTopWidth) || 0 : 0,
      borderBottom: style ? parseFloat(style.borderBottomWidth) || 0 : 0,
      boxSizing: style?.boxSizing || 'border-box',
      maxHeight: style ? parseCssLength(style.maxHeight) : NaN,
    };
  };

  const measureNow = () => {
    const el = unref(textareaRef);
    if (!el || el.isConnected === false) return;

    const metrics = readMetrics(el);
    // ⚠️ 空内容时**必须把 placeholder 临时摘掉再量**（2026-10-01 实测）：
    // 浏览器会把【折行后的占位文字】也算进 scrollHeight。窄输入框里 "说点什么..." 折成两行，
    // 空态就被撑到两行高（详情页底栏实测 clientHeight 64px vs 应有的 40px），
    // 而 placeholder 是提示不是内容，不该参与高度计算。
    // 摘掉-量完-立刻写回，中间不 await，不会闪；只在 value 为空且确有 placeholder 时做。
    const savedPlaceholder = el.value ? null : el.placeholder;
    if (savedPlaceholder) el.placeholder = '';

    el.style.height = 'auto';
    const scrollHeight = el.scrollHeight;
    const next = resolveAutoGrowHeight({ scrollHeight, ...metrics });

    // ⚠️ 这里**必须**无条件写回，不能写「next === 上次的值就 return」。
    // 上面刚把 height 设成 auto，提前返回会把元素永久留在 auto 上 ——
    // 表现是「内容超上限后高度掉回 rows 的固有高度、框内滚动」（2026-09-30 实测踩到：
    // n=5 顶到上限 168，n=6 因 next 与上次同为 168 而提前返回，高度掉回 85）。
    // 写回同一个像素值不会触发重排，跳过它省不下什么，却会引入这条极隐蔽的路径。
    el.style.height = `${next}px`;

    if (savedPlaceholder) el.placeholder = savedPlaceholder;
  };

  const schedule = () => {
    if (frameId || !hasDom()) return;
    frameId = window.requestAnimationFrame(() => {
      frameId = 0;
      measureNow();
    });
  };

  const handleInput = () => {
    if (composing) return;
    schedule();
  };

  const handleCompositionStart = () => {
    composing = true;
  };

  const handleCompositionEnd = () => {
    composing = false;
    schedule();
  };

  const detach = (el) => {
    if (!el) return;
    el.removeEventListener('input', handleInput);
    el.removeEventListener('compositionstart', handleCompositionStart);
    el.removeEventListener('compositionend', handleCompositionEnd);
    observer?.disconnect();
    observer = null;
    boundEl = null;
  };

  const attach = (el) => {
    observedWidth = -1;
    boundEl = el;
    el.addEventListener('input', handleInput);
    el.addEventListener('compositionstart', handleCompositionStart);
    el.addEventListener('compositionend', handleCompositionEnd);

    // 宽度变化（旋转 / 侧栏开合 / KeepAlive 唤醒）会换行点改变，行数跟着变。
    // 只认宽度：高度是我们自己写的，认高度会形成回环。
    if (typeof window.ResizeObserver === 'function') {
      observer = new window.ResizeObserver((entries) => {
        for (const entry of entries) {
          const width = entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect?.width ?? 0;
          if (Math.abs(width - observedWidth) < 1) continue;
          observedWidth = width;
          schedule();
        }
      });
      observer.observe(el);
    }

    schedule();
  };

  watch(
    textareaRef,
    (el, previous) => {
      if (previous && previous !== el) detach(previous);
      if (el) attach(el);
    },
    { flush: 'post' },
  );

  if (value != null) {
    // ⚠️ 不能写成 `watch(() => unref(value), …)`：`unref` 只解 ref，**不会调用函数**，
    // 传 getter 时它会原样返回那个函数本身 → 依赖恒为同一个函数引用 → watcher 永不触发。
    // 2026-09-30 实测踩到：切换回复对象把内容从 200 字改成 7 字，高度停在 168 不动。
    const source = typeof value === 'function' ? value : () => unref(value);
    watch(source, () => schedule(), { flush: 'post' });
  }

  const resetHeight = () => {
    const el = unref(textareaRef);
    if (el) el.style.height = '';
    schedule();
  };

  onBeforeUnmount(() => {
    if (frameId && hasDom()) window.cancelAnimationFrame(frameId);
    frameId = 0;
    detach(boundEl);
  });

  return { textareaRef, resize: schedule, resetHeight };
}
