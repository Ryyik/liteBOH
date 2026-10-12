import { onMounted, onUnmounted, ref } from 'vue';

/* ============================================
   固定视窗滚动分镜（pin 分镜）的公共机制（2026-10-12 抽离）
   ============================================
   为什么抽：同一套机制在仓库里已经被手写了三遍，而且每写一遍都要重新踩同一个坑 ——
     · src/views/BOHApp/index.vue           （.stage 三屏能力介绍）
     · src/views/AboutUs/index.vue          （manifesto 逐字点亮 / chapters 三章轮换）
     · src/views/BOH8YearsJourney/index.vue （隧道 / 今昔 / 世界 / 地层 / 终章）
   三处各自重复了四件事：给 html 加类复位 body overflow、rAF 节流的滚动监听、
   ResizeObserver 重新量测、prefers-reduced-motion 短路。改一处口径要动三处 = 缺陷。

   它只负责三件事，完全不碰视觉：
     1. 复位 body overflow（不做这件事 sticky 会被降级成普通块，原因见下面那段长注释）；
     2. 把「滚到哪了」换算成一条 0~1 的进度（progress）；
     3. reduce 偏好下短路，不挂监听。
   位移 / 缩放 / 淡出 / 交叉切换全部由宿主页面从 progress 派生 —— 这一层不需要知道
   任何关于观感的事。

   ⚠️ 宿主必须在自己样式里写这条复位规则，类名与传进来的 scrollClass 一致：
        :global(html.<scrollClass> body) { overflow: visible !important; }
      并且宿主自己的根节点**不能有 overflow: hidden** —— 它同样会把 sticky 降级。

   ⚠️ 这个坑必须留在这里，不然每个新页面都要重新踩一次：
      src/style.css 里有两处会「顺手」把 body 变成滚动容器：
          body { overflow-x: hidden !important; overflow-y: visible !important }
      计算值因此是 (hidden, auto) —— 一个方向上不是 visible，body 就成立滚动容器。
      而 position: sticky 相对**最近的滚动祖先**定位，实际滚动发生在 html 上、body 自己
      并不滚 ⇒ 分镜元素永远粘不住，跟着内容一起滚出视口。实测现象（BOHApp 页记录的）：
      进度 0.5 时 sticky 元素 top = -990px（正常应为 0），页面滚到中途整片空白。
      只放开 body、不动 html：html 的 overflow-x: hidden 负责裁横向溢出，根元素的溢出
      属于正常视口滚动，不影响 sticky。
*/

export const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * 分镜进度：0 = 分镜顶部刚到视口顶，1 = 分镜底部对齐视口底。
 * 外层元素撑出的「多余高度」（height − 视口高）就是可用的滚动距离。
 * 没有多余高度（内容本来就短于一屏）时恒为 0，宿主据此退化成静态布局。
 */
export function computeStageProgress({
  scrollY = 0,
  top = 0,
  height = 0,
  viewportHeight = 0,
} = {}) {
  const travel = height - viewportHeight;
  if (!(travel > 0)) return 0;
  return clamp01((scrollY - top) / travel);
}

export function readReducedMotion() {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * @param targetRef 分镜的外层元素（撑高度的那个），computed 之外的普通 ref
 * @param options.scrollClass      挂到 html 上的类名；空字符串表示不需要复位 body
 * @param options.reducedProgress  reduce 偏好下 progress 取的值（默认 0 = 停在第一屏）
 */
export function useScrollStage(targetRef, options = {}) {
  const { scrollClass = '', reducedProgress = 0 } = options;

  const reduceMotion = ref(readReducedMotion());
  const scrollY = ref(0);
  const viewportHeight = ref(0);
  const progress = ref(reduceMotion.value ? reducedProgress : 0);

  let metrics = null;
  let frame = 0;
  let observer = null;
  let motionQuery = null;

  const measure = () => {
    const element = targetRef?.value;
    const vh = window.innerHeight || 1;
    viewportHeight.value = vh;
    if (!element) {
      metrics = null;
      return;
    }
    const rect = element.getBoundingClientRect();
    metrics = { top: window.scrollY + rect.top, height: element.offsetHeight };
  };

  const update = () => {
    const vh = window.innerHeight || 1;
    viewportHeight.value = vh;
    scrollY.value = window.scrollY;
    if (reduceMotion.value) {
      progress.value = reducedProgress;
      return;
    }
    if (!metrics) {
      progress.value = 0;
      return;
    }
    progress.value = computeStageProgress({
      scrollY: window.scrollY,
      ...metrics,
      viewportHeight: vh,
    });
  };

  /** 布局变动（字体回退 / 上方大图异步到位 / 模式表异步到达）后手动重算 */
  const refresh = () => {
    measure();
    update();
  };

  const onScroll = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      update();
    });
  };

  const onMotionChange = (event) => {
    reduceMotion.value = event.matches;
    refresh();
  };

  onMounted(() => {
    if (scrollClass) document.documentElement.classList.add(scrollClass);

    if (typeof window.matchMedia === 'function') {
      motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      motionQuery.addEventListener?.('change', onMotionChange);
    }

    measure();
    update();

    /* 观察 body 而不是只观察分镜自己：分镜上方的内容（首屏大图、字体回退、异步列表）
       到位时会把分镜整体推下去，只盯自己的话 top 会一直是旧值 —— 那一段的进度整体错位。
       body 高度在「分镜自身高度由 CSS 定死、不随 progress 变」的前提下不会自我激励，
       不会形成观察-重算的死循环。 */
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => refresh());
      if (targetRef?.value) observer.observe(targetRef.value);
      if (document.body) observer.observe(document.body);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', refresh, { passive: true });
  });

  onUnmounted(() => {
    if (scrollClass) document.documentElement.classList.remove(scrollClass);
    motionQuery?.removeEventListener?.('change', onMotionChange);
    observer?.disconnect();
    observer = null;
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', refresh);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  });

  return { progress, scrollY, viewportHeight, reduceMotion, refresh };
}
