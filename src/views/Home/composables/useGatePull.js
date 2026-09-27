import { computed, ref, watch } from 'vue';

/* ============================================
   首页开场画「跟手揭开浮层」的全部逻辑（2026-09-27 抽离）
   ============================================
   为什么抽出来：这段逻辑当时把 Home/index.vue 撑到 700+ 行，和「论坛分区 / 底栏 /
   横屏左栏 / 导航高度探测」混在一个文件里，改一个门槛要在一堆无关代码里翻找。

   边界刻意划得很干净：
     · 这一层只负责「一条 0~1 的进度怎么被推、怎么被放开、怎么落定」；
     · 完全不碰视觉 —— 位移 / 缩放 / 圆角 / 模糊 / 淡出全部由 CSS 从
       --gate-p、--forum-p 派生（见 Home/style.scoped.css），时长只在下面的
       GATE_TIMINGS 里存在一份。
     · 因此它不需要任何 DOM ref：宿主页面把这两个变量绑到根元素 style 上即可。

   宿主需要接的线（三处）：
     1) `:style="{ '--gate-p': pullProgress, '--forum-p': forumP }"` + `:class` 上那几个开关；
     2) 开场层元素上绑 handleWheel / handleTouch*，window 上由 mounted() 挂键盘；
     3) onMounted 调 mounted()、onBeforeUnmount 调 unmounted()。
*/

/* ---------- 「看过一次」的标记 ----------
   2026-09-24：key 带构建指纹（生产构建注入的 <meta name="boh-build-id">；dev 不注入）——
   每次发布新版本，用户再访问就会重播一次开场画。
   原来是 sessionStorage：在 iOS PWA / 长驻标签下「会话」能跨好几天，标记一旦写入，
   开场画就再也不会播（用户感知为「首屏动画没了」）。改 localStorage + 24h 时间窗：
   同构建 24h 内不重复打扰，跨天自动重播。 */
const GATE_PASSED_KEY = 'boh-home-gate-passed';
const GATE_REPLAY_WINDOW_MS = 24 * 60 * 60 * 1000;

const resolveGateStorageKey = () => {
  if (typeof document === 'undefined') return GATE_PASSED_KEY;
  const buildId = String(document.querySelector('meta[name="boh-build-id"]')?.content || '').trim();
  return buildId ? `${GATE_PASSED_KEY}:${buildId}` : GATE_PASSED_KEY;
};
const GATE_STORAGE_KEY = resolveGateStorageKey();

const readGatePassed = () => {
  try {
    const seenAt = Number(window.localStorage.getItem(GATE_STORAGE_KEY));
    if (!Number.isFinite(seenAt) || seenAt <= 0) return false;
    return Date.now() - seenAt < GATE_REPLAY_WINDOW_MS;
  } catch {
    return false; // 隐私模式 / storage 被禁：当作没通过，照常播
  }
};
const markGatePassed = () => {
  try {
    window.localStorage.setItem(GATE_STORAGE_KEY, String(Date.now()));
  } catch {
    /* 存不住就算了，下次照常播 */
  }
};

/* ---------- 跟手参数 ----------
   旧实现是「阈值触发器」：累计位移到 28px 就播一条固定时长动画 + 立即卸载开场层，
   手指与画面全程零耦合 —— 感知为「画面不动，然后突然开演」，而且不可反悔。
   现在整段入场是一条 0~1 的进度：跟手阶段与位移 1:1 映射，释放阶段按进度 / 速度决策。
   ⚠️ 门槛必须「一次滚轮就够」：滚轮一格约 120px。曾设成 0.22 × 1.25 屏 = 250px，
   而用户滚一下只有 120px → 「滑一下弹回、再滑又弹回」＝用户报「下滑整个页面卡住」。
   2026-09-27 四调（用户：下滑要多一些）：行程 1.0 → 1.2 屏，同时把门槛降到 0.08
   —— 1.2 × 0.08 ≈ 81px，一次滚轮仍然稳进，但拖满整段要滑得更久，「行程感」更足。 */
// 拖动多少屏才算走满进度
const PULL_FULL_DISTANCE_RATIO = 1.2;
// 释放时的提交阈值（进度）；1.2 屏行程下 ≈ 81px
const PULL_COMMIT_PROGRESS = 0.08;
// 释放时的提交阈值（速度，progress/秒）——「快速一甩」不等进度够就进。
// ⚠️ 只对触摸生效：滚轮 deltaY 一格 100+，按单次事件速率判快甩会让任何一次滚动都达标。
const PULL_COMMIT_VELOCITY = 0.6;
// 滚轮 / 触控板没有「松手」事件：静默这么久没有新事件即视为释放。
// 取 160ms 而不是 140：正常滚轮节奏的间隔多在 150ms 内，算作同一次手势才能累积进度。
const WHEEL_RELEASE_IDLE_MS = 160;
// reduce 分支不做跟手，但也不许「轻碰即入」：留一点位移门槛
const REDUCE_TRIGGER_PX = 24;

/* ---------- 时序（全站唯一真源）----------
   ⚠️ 视觉已全部由 --gate-p 派生，时长只存在于这一处 —— 不会再出现
   「keyframes 写 1320ms、JS 常量写 980ms」这种注释与实现打架的情况。
   2026-09-27 三调（用户：行程不够长、动画再慢一些）：
     pullMs 1400 → 1900 —— 整段揭开的时间拉长，配合 easeOutExpo（起步快、后段极缓）
       观感是「推出去之后缓缓落定」；
     focusMs 760 → 860 —— 落定后的对焦窗口跟着放宽；
     settleMs 反而保持短（460）——「没进论坛」的那次手势必须尽快回位，
       否则用户的下一次滑动是在跟残留动画抢时间。「慢」只用在入场，不用在拒绝。
   reduce 用户的时长表单独给：动画降级成纯 opacity 时必须同步缩短，
   否则会出现「已经淡完了还盖着」的空窗（旧实现就是这个 bug）。 */
const GATE_TIMINGS = {
  normal: { pullMs: 1900, settleMs: 460, focusMs: 860, navEnterMs: 1400, navRevealAt: 0.5 },
  reduced: { pullMs: 360, settleMs: 220, focusMs: 300, navEnterMs: 320, navRevealAt: 0.3 },
};

export function useGatePull() {
  /* reduce 偏好：跟手拖拽对这类用户没有意义，改为一触发即完成（视觉走纯 opacity 降级）。
     setup 阶段先读一次，mounted 后再挂 change 监听。 */
  const reduceMotion = ref(false);
  let reduceQuery = null;

  const prefersReducedMotion = () => {
    try {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  };
  reduceMotion.value = prefersReducedMotion();
  const gateTimings = () => (reduceMotion.value ? GATE_TIMINGS.reduced : GATE_TIMINGS.normal);

  /* ---------- 状态 ---------- */
  /* 是否已通过过开场画 —— 同步判定（localStorage），必须在 setup 阶段就拿到：
     已通过的会话首帧就不能渲染开场层，否则会闪一下。 */
  const gateAlreadyPassed = readGatePassed();
  const gateDismissed = ref(gateAlreadyPassed);
  const gateLeaving = ref(false);
  const forumOpen = ref(gateAlreadyPassed);
  // 论坛层是否正在「对焦就位」（只在本会话真播了开场画时为 true，避免直接进论坛时空跑一次动画）
  const forumEntering = ref(false);
  /* 底栏是否该现身。它与 forumOpen 刻意分开：底栏要在进度过半后才从下方浮上来，
     所以它跟随进度而不是跟随 forumOpen；已通过过开场画的会话里直接就位。 */
  const bottomNavReady = ref(gateAlreadyPassed);
  /* 是否已落定：落定后论坛层必须解除 transform（它会创建包含块，
     让 stage 内 position:fixed 的子元素改以本层为基准）。 */
  const gateSettled = ref(gateAlreadyPassed);

  /* 入场进度（0~1）—— 整段入场唯一的可变量，CSS 全靠它派生 */
  const pullProgress = ref(gateAlreadyPassed ? 1 : 0);
  /* 论坛层（＝桌面）进度：起手 2% 不跟随，让浮层先动、桌面随后极轻归位 */
  const forumP = computed(() => {
    const p = pullProgress.value;
    return Math.min(1, Math.max(0, (p - 0.02) / 0.98));
  });
  const bottomNavEnterMs = computed(() => gateTimings().navEnterMs);
  const focusDurationMs = computed(() => gateTimings().focusMs);

  /* ---------- 内部计时器 / 采样 ---------- */
  let rafTween = 0;
  let wheelIdleTimer = null;
  // 兜底解锁计时器：解锁绝不能只依赖 rAF 补间链（见 commitGate 的说明）
  let unlockTimer = null;
  let touchStartY = 0;
  /* 速度采样：只记「最近两次连续变化之间」的速率。
     ⚠️ 不能拿「上一次变化」和「释放那一刻」比 —— 那样会把滚轮停下后的静默期
     也算成一次快速移动（实测：只滚 200px 就停住，静默后算出 1.35 progress/s，
     远超 0.6 阈值 → 用户只想看一眼，却直接被送进论坛，回弹形同不存在）。 */
  let prevSampleValue = 0;
  let prevSampleAt = 0;
  let lastVelocity = 0;

  // ============================================
  // 滚动锁：只覆盖「释放之后 → 落定」这一段
  // ============================================
  /* 「被带到下面」的确定性：提交之后的整段收尾里，无论手势再滑多长、触控板惯性、
     还是连滚几下，底层文档都不许动 —— 否则收尾一结束浮层卸载，落到的是已经滚过
     几屏的论坛，「被带下去」就成了「掉到中间」。
     ⚠️ 必须用 setProperty(..., 'important')：style.global.css 里 html/body 的 overflow
     带 !important（棘轮基线），普通 inline style 会被样式表压掉。
     ⚠️ 解锁三保险：补间回调（落位即交还）+ unlockTimer 硬计时器 + unmounted()。
     旧实现只挂在补间链上 —— 补间被 cancel 就是整页永久滚不动。
     跟手阶段不依赖这把锁：手势事件自己 preventDefault（见 handleWheel / handleTouchMove）。 */
  const lockDocumentScroll = () => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty('overflow', 'hidden', 'important');
    document.body.style.setProperty('overflow', 'hidden', 'important');
  };
  const unlockDocumentScroll = () => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.removeProperty('overflow');
    document.body.style.removeProperty('overflow');
  };

  // ============================================
  // 进度：手势与补间都只改 pullProgress 这一个值
  // ============================================
  /** 拖满一整屏进度需要的位移（px） */
  const pullFullDistance = () => {
    const vh = typeof window === 'undefined' ? 800 : window.innerHeight || 800;
    return Math.max(1, vh * PULL_FULL_DISTANCE_RATIO);
  };
  const cancelWheelIdle = () => {
    if (wheelIdleTimer) {
      window.clearTimeout(wheelIdleTimer);
      wheelIdleTimer = null;
    }
  };
  const cancelTween = () => {
    if (rafTween) {
      window.cancelAnimationFrame(rafTween);
      rafTween = 0;
    }
  };
  /** easeOutExpo：起步快、后段极缓 —— 「慢速长收尾」的曲线 */
  const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
  /** 写入进度。track=true 时顺便刷新速度采样（只有手势驱动的变化才算「手在动」） */
  const setPullProgress = (next, { track = true } = {}) => {
    const clamped = Math.min(1, Math.max(0, next));
    if (track) {
      const now = performance.now();
      const dt = now - prevSampleAt;
      // 速率只取「相邻两次变化之间」，dt=0（同一帧内多次调用）不采样
      if (dt > 0) lastVelocity = ((clamped - prevSampleValue) / dt) * 1000;
      prevSampleValue = clamped;
      prevSampleAt = now;
    }
    if (clamped === pullProgress.value) return;
    pullProgress.value = clamped;
  };
  /** 把进度补间到目标值（提交 / 回弹共用同一条路径） */
  const tweenProgressTo = (target, duration, onDone) => {
    cancelTween();
    const from = pullProgress.value;
    if (!Number.isFinite(duration) || duration <= 0 || from === target) {
      setPullProgress(target, { track: false });
      onDone?.();
      return;
    }
    const startedAt = performance.now();
    const step = (now) => {
      rafTween = 0;
      const t = Math.min(1, (now - startedAt) / duration);
      setPullProgress(from + (target - from) * easeOutExpo(t), { track: false });
      if (t < 1) {
        rafTween = window.requestAnimationFrame(step);
      } else {
        onDone?.();
      }
    };
    rafTween = window.requestAnimationFrame(step);
  };

  /** 提交：进度推到底 → 卸载浮层 → 论坛层对焦就位 → 交还滚动权 */
  const commitGate = () => {
    if (gateLeaving.value || gateDismissed.value) return;
    teardownGateKeys();
    cancelWheelIdle();
    cancelTween();
    /* 浮层是 fixed 覆盖层，期间底层文档可能已被滚过一截（视觉上看不见）。
       进入前把滚动位置归零，论坛必须从顶部开始。 */
    window.scrollTo({ top: 0, behavior: 'auto' });
    lockDocumentScroll();
    gateLeaving.value = true;
    forumOpen.value = true;
    markGatePassed();
    const { pullMs, focusMs } = gateTimings();
    /* 兜底解锁：**不许**让解锁只挂在 rAF 补间回调上 ——
       补间可能因为 HMR、渲染异常、页面切后台被 cancel 掉，一旦漏掉就是整页永久滚不动。 */
    if (unlockTimer) window.clearTimeout(unlockTimer);
    unlockTimer = window.setTimeout(() => {
      unlockTimer = null;
      unlockDocumentScroll();
    }, pullMs + 150);

    /* 从当前进度无缝接续（而不是从 0 重播一条动画）—— 「跟手」观感的最后一环：
       手指停在哪，收尾就从哪儿起步。 */
    tweenProgressTo(1, pullMs, () => {
      // 收尾完成：卸载浮层（此刻它已完全被推走并全透明，无跳变）
      gateDismissed.value = true;
      // 论坛层已落位 → 解除 transform 的包含块，再播一次「对焦」
      gateSettled.value = true;
      forumEntering.value = true;
      /* 落位即交还滚动权 —— 不必等对焦动画走完：它只动 opacity / filter，与滚动无关。 */
      if (unlockTimer) {
        window.clearTimeout(unlockTimer);
        unlockTimer = null;
      }
      unlockDocumentScroll();
      window.setTimeout(() => {
        forumEntering.value = false;
      }, focusMs);
    });
  };

  /** 回弹：进度归零，手势保持可用 —— 不做「一碰就不可逆」 */
  const settleGateBack = () => {
    cancelWheelIdle();
    tweenProgressTo(0, gateTimings().settleMs);
  };

  /* 统一释放判定：进度够 → 提交，否则回弹。
     速度只对触摸（指针）生效：滚轮的 deltaY 粒度太粗（一格就是 100+），
     按「单次事件的速率」判快甩会让任何一次滚轮都达标，所以滚轮路径只认进度。 */
  const releaseGate = ({ allowVelocity = false } = {}) => {
    if (gateLeaving.value || gateDismissed.value) return;
    const byProgress = pullProgress.value >= PULL_COMMIT_PROGRESS;
    const byVelocity = allowVelocity && lastVelocity >= PULL_COMMIT_VELOCITY;
    if (byProgress || byVelocity) commitGate();
    else settleGateBack();
  };

  // ============================================
  // 手势：触摸 / 滚轮 / 键盘三源，推的都是同一条进度
  // ============================================
  const gateActive = () => !gateLeaving.value && !gateDismissed.value;

  const armWheelRelease = () => {
    cancelWheelIdle();
    wheelIdleTimer = window.setTimeout(() => {
      wheelIdleTimer = null;
      releaseGate();
    }, WHEEL_RELEASE_IDLE_MS);
  };

  const handleWheel = (event) => {
    if (!gateActive()) return;
    // 触控板捏合缩放会以 ctrlKey + wheel 的形式灌进来，不是「下拉」意图
    if (event.ctrlKey) return;
    // 横向滚动为主（deltaX 主导）也不算下拉
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    /* 必须阻止默认滚动：浮层是 fixed 覆盖层，不拦的话底层文档会跟着滚，
       用户看到的是「画面不动、scrollY 在涨」——「跟手」就无从谈起。 */
    if (event.cancelable) event.preventDefault();
    if (reduceMotion.value) {
      if (event.deltaY > 0) commitGate();
      return;
    }
    // 反向滚动把进度拉回（不清零：来回抖动时手感不会归零顿住）
    setPullProgress(pullProgress.value + event.deltaY / pullFullDistance());
    armWheelRelease();
  };

  const handleTouchStart = (event) => {
    if (!gateActive()) return;
    touchStartY = event.touches?.[0]?.clientY ?? 0;
    cancelTween();
    cancelWheelIdle();
    // 重新起算速度窗口：上一次手势的残留速率不许影响这一次
    prevSampleValue = pullProgress.value;
    prevSampleAt = performance.now();
    lastVelocity = 0;
  };

  const handleTouchMove = (event) => {
    if (!gateActive()) return;
    if (event.cancelable) event.preventDefault();
    const currentY = event.touches?.[0]?.clientY ?? touchStartY;
    // 手指上划 = 内容上移 = 进入论坛
    const travel = touchStartY - currentY;
    if (reduceMotion.value) {
      if (travel > REDUCE_TRIGGER_PX) commitGate();
      return;
    }
    setPullProgress(travel <= 0 ? 0 : travel / pullFullDistance());
  };

  const handleTouchEnd = () => {
    if (!gateActive() || reduceMotion.value) return;
    // 触摸路径允许「甩得快」直接进（指针的速率信号是可靠的）
    releaseGate({ allowVelocity: true });
  };

  const handleGateKeydown = (event) => {
    if (!gateActive()) return;
    const scrollKeys = ['ArrowDown', 'PageDown', ' ', 'Spacebar', 'End'];
    if (!scrollKeys.includes(event.key)) return;
    event.preventDefault();
    // 键盘用户不该被「跟手」模型卡住：一次按键直接完成
    commitGate();
  };

  /* 键盘是唯一留在 window 上的监听（它没有 preventDefault 的全局副作用，且需要无焦点也能用）；
     wheel / touch 绑在开场层元素上由 Vue 卸载时自动清理 —— window 上的 passive:false +
     preventDefault 一旦泄漏（HMR / 异常卸载）会让整站永久滚不动，只剩关页面一条路。 */
  const teardownGateKeys = () => {
    if (typeof window === 'undefined') return;
    window.removeEventListener('keydown', handleGateKeydown);
  };
  const setupGateKeys = () => {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', handleGateKeydown);
  };

  /* reduce 偏好运行中切换时要能改变后续手势的分支 */
  const onReduceMotionChange = (event) => {
    reduceMotion.value = Boolean(event.matches);
  };

  // ============================================
  // 派生副作用
  // ============================================
  /* 底栏浮现：跟随进度而不是固定延时（进度过半时挂载，组件自己播入场动画）——
     跟手模型下「什么时候浮上来」必须由用户拖到哪儿决定，而不是由计时器决定。 */
  watch(pullProgress, (next) => {
    if (bottomNavReady.value || next < gateTimings().navRevealAt) return;
    bottomNavReady.value = true;
  });

  const mounted = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      if (!gateAlreadyPassed) setupGateKeys();
      return;
    }
    reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduceMotion.value = reduceQuery.matches;
    if (typeof reduceQuery.addEventListener === 'function') {
      reduceQuery.addEventListener('change', onReduceMotionChange);
    } else if (typeof reduceQuery.addListener === 'function') {
      reduceQuery.addListener(onReduceMotionChange);
    }
    // 已通过过开场画的会话不需要键盘手势
    if (!gateAlreadyPassed) setupGateKeys();
  };

  const unmounted = () => {
    teardownGateKeys();
    cancelWheelIdle();
    cancelTween();
    if (unlockTimer) {
      window.clearTimeout(unlockTimer);
      unlockTimer = null;
    }
    if (reduceQuery) {
      if (typeof reduceQuery.removeEventListener === 'function') {
        reduceQuery.removeEventListener('change', onReduceMotionChange);
      } else if (typeof reduceQuery.removeListener === 'function') {
        reduceQuery.removeListener(onReduceMotionChange);
      }
      reduceQuery = null;
    }
    // 兜底解锁：路由跳走时计时器已被清掉，不清会把文档永久锁死
    unlockDocumentScroll();
  };

  return {
    // 进度（绑到根元素 style）
    pullProgress,
    forumP,
    // 供模板切类的开关
    gateDismissed,
    gateLeaving,
    forumOpen,
    forumEntering,
    gateSettled,
    bottomNavReady,
    // 要喂给 CSS / 子组件的时长
    bottomNavEnterMs,
    focusDurationMs,
    // 手势入口
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleGateKeydown,
    commitGate,
    // 生命周期
    mounted,
    unmounted,
  };
}
