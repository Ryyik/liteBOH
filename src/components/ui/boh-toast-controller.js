/**
 * boh-toast-controller — Toast 状态机（纯逻辑，无 DOM，plans/045 组件 6）
 *
 * 设计：
 *   · 状态机与渲染分离 —— 本文件零 DOM 依赖，单测直接跑；
 *   · 渲染交给 BohToastHost.vue（TransitionGroup 出入场走 motion.css 预设，
 *     动画时长由 CSS 读 token，本文件不管动画）；
 *   · 单例 bohtoast 导出：App.vue 挂一次 BohToastHost，全站任何地方
 *     `import { bohtoast } from '@/components/ui/boh-toast-controller.js'` 即可用。
 *     这是 notify.js（CustomEvent → App.vue）的换代通道：事件串改方法调用，
 *     语义五类（ok / warn / err / info），多队列上限防刷屏。
 *
 * 展示时长 DEFAULT_DURATION_MS 是**业务停留时长**（非动画时长），
 * 作为 prop 默认值存在；动画时长一律走 tokens.css 的 --duration-*。
 */

/** 同屏最多同时存在的 toast 数：超出时挤掉最旧的（防连续操作刷屏） */
const MAX_STACK = 3;

/** 默认停留时长（业务口径，非动画） */
export const DEFAULT_DURATION_MS = 2400;

/**
 * 类型别名归一：迁移期各存量调用方写法不一（success/error/warning），
 * 控制器统一收口为 ok/err/warn/info 四类（plans/045 阶段 1 迁移用）。
 */
const TYPE_ALIASES = { success: 'ok', error: 'err', warning: 'warn' };
const VALID_TYPES = ['ok', 'warn', 'err', 'info'];

export function createToastController({
  durationMs = DEFAULT_DURATION_MS,
  maxStack = MAX_STACK,
} = {}) {
  let nextId = 1;
  /** @type {Array<{id:number, type:string, message:string, durationMs:number, action:(?{label:string, run:?Function})|null}>} */
  let items = [];
  /** @type {Map<number, ReturnType<typeof setTimeout>>} */
  const timers = new Map();
  const listeners = new Set();

  const notify = () => listeners.forEach((fn) => fn(items));

  function remove(id) {
    const timer = timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(id);
    }
    const before = items.length;
    items = items.filter((t) => t.id !== id);
    return items.length !== before;
  }

  function schedule(id, ms) {
    const timer = setTimeout(() => {
      timers.delete(id);
      if (remove(id)) notify();
    }, ms);
    timers.set(id, timer);
  }

  /**
   * 弹一条提示。
   * @param {'ok'|'warn'|'err'|'info'|'success'|'error'|'warning'} type 语义类（后三个是迁移别名，归一到 ok/err/warn）
   * @param {string} message 文案（纯文本，调用方不传 HTML）
   * @param {{ durationMs?: number, sticky?: boolean, action?: {label: string, run?: Function} }} [opts]
   *   sticky=true 不自动消失（error 类语义：必须用户处理后手动关）；
   *   action 渲染为可点按钮，点击执行 run 后自动关。
   * @returns {number} 本条 toast 的 id（可传给 dismiss 手动提前关）
   */
  function show(type, message, opts = {}) {
    const normalized = TYPE_ALIASES[type] || type;
    const validType = VALID_TYPES.includes(normalized) ? normalized : 'info';
    // 超上限：挤掉最旧的（先摘它的 timer）
    while (items.length >= maxStack) remove(items[0].id);
    const item = {
      id: nextId++,
      type: validType,
      message: String(message ?? ''),
      durationMs: opts.durationMs ?? durationMs,
      action:
        opts.action && opts.action.label
          ? { label: String(opts.action.label), run: opts.action.run ?? null }
          : null,
    };
    items = [...items, item];
    if (!opts.sticky) schedule(item.id, item.durationMs);
    notify();
    return item.id;
  }

  /** 手动提前关（返回是否真的关掉了） */
  function dismiss(id) {
    const changed = remove(id);
    if (changed) notify();
    return changed;
  }

  /** 清空全部（路由切换等场景） */
  function clearAll() {
    const had = items.length > 0;
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
    items = [];
    if (had) notify();
  }

  function subscribe(fn) {
    listeners.add(fn);
    fn(items);
    return () => listeners.delete(fn);
  }

  function snapshot() {
    return items;
  }

  return { show, dismiss, clearAll, subscribe, snapshot };
}

/** 全站单例：App.vue 挂 BohToastHost，业务侧直接 bohtoast.show(...) */
export const bohtoast = createToastController();
