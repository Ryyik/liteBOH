import { computed, inject, provide, reactive, ref, shallowRef } from 'vue';
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

const keyOf = (row, field) => `${row?.id ?? 'new'}:${field}`;

/**
 * 在后台页面里建立编辑上下文。
 *
 * @param {Object} options
 * @param {boolean} [options.startActive=false] 是否一进页面就处于编辑态
 * @param {(row: Object, field: string, value: unknown) => Promise<void>} options.save
 *   单字段写入。宿主负责落库、并发/失败处理。
 * @param {(row: Object) => Promise<void>} [options.remove] 删除一条
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
  } = options;

  const active = ref(Boolean(startActive));
  const history = shallowRef([]);
  const busyKeys = ref(new Set());
  const failedKeys = ref(new Set());

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
  };

  const pushHistory = (entry) => {
    // 上限 50：撤销栈只服务「刚改错了」，不是审计日志（审计走变更日志那条线）
    const next = [...history.value, entry];
    history.value = next.length > 50 ? next.slice(next.length - 50) : next;
  };

  /**
   * 写一个字段。乐观更新由原语自己做（先改 modelValue），这里只负责落库与记录。
   * 失败时抛出，让原语回滚。
   */
  const commit = async (row, field, next, previous) => {
    if (!save) return;
    const key = keyOf(row, field);
    markBusy(key, true);
    try {
      await save(row, field, next);
      markFailed(key, false);
      pushHistory({ row, field, previous, next });
    } catch (error) {
      markFailed(key, true);
      logger.error('inline-editor', `字段写入失败: ${field}`, error);
      throw error;
    } finally {
      markBusy(key, false);
    }
  };

  const undo = async () => {
    const entry = history.value[history.value.length - 1];
    if (!entry || !save) return;
    history.value = history.value.slice(0, -1);

    const { row, field, previous, next } = entry;
    /* 就地编辑的乐观更新是**双向**的：只写库不写界面，用户点撤销会看到「什么都没发生」，
       而库其实已经改回去了 —— 下一次刷新才突然变，是最难排查的那种不一致。 */
    if (row) row[field] = previous;

    try {
      await save(row, field, previous);
      /* 文案用字段的中文标签，不要把 `title` 这种列名直接抛给运营 */
      notify?.(`已撤销「${labelOf?.(field) || field}」的修改`, 'ok');
    } catch (error) {
      // 撤销失败：界面和栈都要还原，否则这条改动永久失去撤销入口
      if (row) row[field] = next;
      history.value = [...history.value, entry];
      logger.error('inline-editor', '撤销失败', error);
      notify?.('撤销失败，请重试', 'error');
    }
  };

  const ctx = reactive({
    active,
    history,
    canUndo: computed(() => history.value.length > 0),
    undoCount: computed(() => history.value.length),
    commit,
    undo,
    remove,
    create,
    openFull,
    validate,
    notify,
    uploadImage,
    isBusy: (row, field) => busyKeys.value.has(keyOf(row, field)),
    isFailed: (row, field) => failedKeys.value.has(keyOf(row, field)),
    toggle: () => {
      active.value = !active.value;
    },
  });

  provide(INLINE_EDITOR_KEY, ctx);
  return ctx;
};
