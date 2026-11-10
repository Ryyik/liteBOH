import { computed, inject, onBeforeUnmount, provide, reactive, ref, shallowRef } from 'vue';
import { logger } from '@/utils/logger.js';

/**
 * 后台「就地编辑」上下文。
 *
 * 设计要点（2026-11-09 用户口径：「整个页面和前端一样，组件上有增删小按钮，
 * 点组件就能直接改字」）：
 *
 * 1. **一份组件，两种宿主**。后台路由直接渲染前台页面组件（`<Shop />`），
 *    编辑能力靠 provide/inject 注入，而不是另做一套编辑器 UI。这样前后台
 *    永远是同一棵 DOM，不存在「预览漂移」。
 *
 * 2. **无上下文即纯文本**。前台 /shop 不 provide，原语（EditableText 等）
 *    退化成 `<span>{{ value }}</span>`，与改造前完全一致 —— 视觉零影响、
 *    打包成本几百字节。
 *
 * 3. **不碰 DOM，只用条件渲染**。刻意不用 contenteditable：Vue 的 patch 与它
 *    天然冲突（用户输入不在 vnode 里，任一响应式更新都会把输入吃掉），还要处理
 *    粘贴残留 HTML、光标跳位、中文输入法 composition。原语的做法是「同一个 span
 *    内，编辑态渲染 input，其余情况渲染文本」，DOM 始终由 Vue 掌管。
 *
 * 4. **前台不承担编辑依赖**。上传/浮层/校验都不在这里 import，由宿主（后台页面）
 *    通过 options 注入，前台 bundle 不会被拖胖。
 */

export const INLINE_EDITOR_KEY = Symbol('boh-inline-editor');

/** 原语里取上下文：前台拿不到就返回 null，据此降级。 */
export const useInlineEditor = () => inject(INLINE_EDITOR_KEY, null);

/**
 * 写入键 = 表 + 主键 + 字段。
 *
 * 为什么必须带表：一个宿主页面可以同时挂两张表的内容（商城页里商品与抽奖卡
 * 同在 `/shop`，抽奖卡在 `lotteries`、商品卡在 `products`）。若键只到 `id:field`，
 * 两张表里恰好同名的字段（`title` / `status`）在「忙碌/失败红边」上会互相串，
 * 而且撤销栈靠 key 排序写入时也会排到别人的队列后面。
 */
const keyOf = (row, field, table = '') => `${table}#${row?.id ?? 'new'}:${field}`;

/**
 * 在后台页面里建立编辑上下文。
 *
 * @param {Object} options
 * @param {boolean} [options.startActive=false] 是否一进页面就处于编辑态
 * @param {(row: Object, field: string, value: unknown, table: string) => Promise<void>} options.save
 *   单字段写入。宿主负责落库、并发/失败处理。`table` 是原语声明的目标表（空 = 宿主默认表）。
 * @param {(row: Object, table: string) => Promise<void>} [options.remove] 删除一条
 * @param {() => Promise<void>} [options.create] 新增一条
 * @param {(row: Object) => void} [options.openFull] 打开完整表单（复杂字段的唯一正道）
 * @param {(field: string, value: unknown, row: Object) => string} [options.validate]
 *   返回错误文案；空串表示通过。校验口径来自 tables.js 的字段配置，宿主注入。
 * @param {(message: string, tone?: 'ok'|'error') => void} [options.notify]
 * @returns {Object} 上下文（reactive，模板里可直接 editor.active）
 */
export const provideInlineEditor = (options = {}) => {
  const {
    startActive = false,
    save,
    remove,
    create,
    openFull,
    validate,
    notify,
    uploadImage,
    labelOf,
    metaOf,
  } = options;

  const active = ref(Boolean(startActive));
  const history = shallowRef([]);
  const busyKeys = ref(new Set());
  const failedKeys = ref(new Set());
  /** 失败红边的自动消退定时器（key → timeout），见 markFailed */
  const failedTimers = new Map();
  /** 同一字段的写入队列（key → Promise），见 enqueueWrite */
  const writeQueues = new Map();

  const markBusy = (key, on) => {
    const next = new Set(busyKeys.value);
    if (on) next.add(key);
    else next.delete(key);
    busyKeys.value = next;
  };

  const markFailed = (key, on) => {
    const next = new Set(failedKeys.value);
    if (on) next.add(key);
    else next.delete(key);
    failedKeys.value = next;

    /* 失败红边必须会自己消：只清「下次写成功」这一条路的话，用户改错一次后再也不碰
       那个字段，红边就会一直亮着，看起来像仍然在报错。 */
    const timer = failedTimers.get(key);
    if (timer) clearTimeout(timer);
    failedTimers.delete(key);
    if (on) {
      failedTimers.set(
        key,
        setTimeout(() => markFailed(key, false), 4000),
      );
    }
  };

  /**
   * 同一字段的写入串行排队。
   *
   * 不加队列时，快速连改同一个字段会并发发出两个 PATCH：网络乱序返回时，
   * 先发的旧值可能后落地，DB 最终停在用户已经改掉的值上 —— 界面显示 A、
   * 刷新后变 B，且没有任何报错可循。不同字段互不影响，仍然并行。
   */
  const enqueueWrite = (key, fn) => {
    const prev = writeQueues.get(key) || Promise.resolve();
    const run = prev.then(fn);
    // 队列里存「吞掉错误」的版本：某次失败不该把该字段后续的写入永久卡住
    writeQueues.set(
      key,
      run.catch(() => {}),
    );
    return run;
  };

  const pushHistory = (entry) => {
    // 上限 50：撤销栈只服务「刚改错了」，不是审计日志（审计走变更日志那条线）
    const next = [...history.value, entry];
    history.value = next.length > 50 ? next.slice(next.length - 50) : next;
  };

  /**
   * 写一个字段。乐观更新由原语自己做（先改 modelValue），这里只负责落库与记录。
   * 失败时抛出，让原语回滚。
   *
   * `table` 由原语声明（见各原语的 `table` prop）：宿主据此决定写哪张表、取哪套
   * 字段配置。传空则宿主用它的默认表（商城宿主默认 products）。
   */
  const commit = (row, field, next, previous, table = '') => {
    if (!save) return Promise.resolve();
    const key = keyOf(row, field, table);
    const entry = { row, field, previous, next, table };

    /* **先入撤销栈、再落库**。反过来（等 save 成功才入栈）会让「改完立刻点撤销」
       扑空 —— 请求还在路上时栈是空的，undo 直接 return，用户看到的是「点了没反应」。 */
    pushHistory(entry);
    markBusy(key, true);

    return enqueueWrite(key, () => save(row, field, next, table))
      .then(() => {
        markFailed(key, false);
      })
      .catch((error) => {
        // 失败：把这条从撤销栈摘掉（值已由原语回滚）
        history.value = history.value.filter((item) => item !== entry);
        markFailed(key, true);
        logger.error('inline-editor', `字段写入失败: ${field}`, error);
        throw error;
      })
      .finally(() => {
        markBusy(key, false);
      });
  };

  const undo = async () => {
    const entry = history.value[history.value.length - 1];
    if (!entry || !save) return;
    history.value = history.value.slice(0, -1);

    const { row, field, previous, next } = entry;
    const table = entry.table || '';
    const key = keyOf(row, field, table);
    /* 就地编辑的乐观更新是**双向**的：只写库不写界面，用户点撤销会看到「什么都没发生」，
       而库其实已经改回去了 —— 下一次刷新才突然变，是最难排查的那种不一致。 */
    if (row) row[field] = previous;

    try {
      // 走同一个队列：撤销必须排在那次还没写完的 commit 之后，否则会被它覆盖
      await enqueueWrite(key, () => save(row, field, previous, table));
      /* 文案用字段的中文标签，不要把 `title` 这种列名直接抛给运营 */
      notify?.(`已撤销「${labelOf?.(field, table) || field}」的修改`, 'ok');
    } catch (error) {
      // 撤销失败：界面和栈都要还原，否则这条改动永久失去撤销入口
      if (row) row[field] = next;
      history.value = [...history.value, entry];
      logger.error('inline-editor', '撤销失败', error);
      notify?.('撤销失败，请重试', 'error');
    }
  };

  /** 把某一行从撤销栈里摘掉（行被删除后，它的历史已经没有意义） */
  const forget = (row) => {
    if (!row) return;
    history.value = history.value.filter((entry) => entry.row !== row);
  };

  const ctx = reactive({
    active,
    history,
    canUndo: computed(() => history.value.length > 0),
    undoCount: computed(() => history.value.length),
    commit,
    undo,
    forget,
    /* 包装一层：删掉的记录不能留在撤销栈里 —— undo 会对一个已不存在的 id 发 PATCH，
       影响 0 行却不报错，用户会看到「已撤销」但页面上什么都没变。 */
    remove: async (row, table = '') => {
      if (!remove) return;
      await remove(row, table);
      forget(row);
    },
    create,
    openFull,
    validate,
    notify,
    uploadImage,
    /** 字段声明（tables.js 那一项）：原语据此拿 maxLength 等约束，宿主不用各写一份。
     *  带 table 是因为同名字段在不同表里约束不同（商品 title 120 / 抽奖 title 120 但
     *  卡片只显示 28 字），宿主按表取配置才不会张冠李戴。 */
    metaOf,
    isBusy: (row, field, table = '') => busyKeys.value.has(keyOf(row, field, table)),
    isFailed: (row, field, table = '') => failedKeys.value.has(keyOf(row, field, table)),
    toggle: () => {
      active.value = !active.value;
    },
  });

  provide(INLINE_EDITOR_KEY, ctx);

  // 失败红边的定时器挂着页面级引用，离开编辑器时要一起收掉
  onBeforeUnmount(() => {
    failedTimers.forEach((timer) => clearTimeout(timer));
    failedTimers.clear();
  });

  return ctx;
};
