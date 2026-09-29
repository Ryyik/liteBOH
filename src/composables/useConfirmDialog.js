import { reactive } from 'vue';

/**
 * 替换原生 window.confirm / window.prompt
 * 用法:
 *   const { state, confirm, prompt, alert, confirmThree } = useConfirmDialog();
 *   if (await confirm({ title, message, tone })) { ... }
 *   const name = await prompt({ title, placeholder, defaultValue });
 *   const result = await confirmThree({ ... }); // 返回 'confirm' | 'cancel' | 'tertiary'
 */
const createDialogState = () =>
  reactive({
    visible: false,
    kind: 'confirm',
    title: '',
    message: '',
    tone: 'default',
    confirmText: '',
    cancelText: '',
    tertiaryText: '',
    placeholder: '',
    defaultValue: '',
    resolver: null,
  });

let _state = null;

const ensureState = () => {
  if (!_state) _state = createDialogState();
  return _state;
};

/**
 * 「弹窗已被占用」这次互斥保护拒绝的**文案真源**。
 *
 * 调用方若 `await confirm()` 直接取值，必须把这一类**预期内**的拒绝归化成「用户取消」；
 * 否则它会上浮成一条错误 —— Vue 会把事件处理器里 async 函数的 rejection 交给
 * `app.config.errorHandler`，表现为「连点两下就多一条错误日志」。
 */
export const DIALOG_BUSY_MESSAGE = 'Dialog is already open';

/**
 * 判断某个异常是否来自上面那次互斥保护（判据**单一真源**，2026-09-29 收敛）。
 *
 * 只认自家这一条文案，**不做**宽泛匹配：其它异常（dialog 未定义、resolver 内部抛错、
 * 调用点自己写错）必须原样冒泡，否则会被静默吞成「点了没反应」。
 * 这条规矩原本由 `views/user-center/SharedMemoryManagement.vue` 单独立下，
 * 现在由本文件统一提供，避免判据出现第二份。
 */
export const isDialogBusy = (err) => String(err?.message ?? err ?? '') === DIALOG_BUSY_MESSAGE;

const open = (state, options, kind) => {
  // 互斥保护：如果弹窗已经打开，新请求直接 reject，避免覆盖 resolver 导致 Promise 永远挂起
  if (state.visible) {
    return Promise.reject(new Error(DIALOG_BUSY_MESSAGE));
  }

  return new Promise((resolve) => {
    state.visible = true;
    state.kind = kind;
    state.title = options.title || (kind === 'prompt' ? '请输入' : '请确认');
    state.message = options.message || '';
    state.tone = options.tone || 'default';
    state.confirmText = options.confirmText || '';
    state.cancelText = options.cancelText || '';
    state.tertiaryText = options.tertiaryText || '';
    state.placeholder = options.placeholder || '';
    state.defaultValue = options.defaultValue || '';
    state.resolver = resolve;
  });
};

export const useConfirmDialog = () => {
  const state = ensureState();

  const close = (result) => {
    if (state.resolver) {
      state.resolver(result);
      state.resolver = null;
    }
    state.visible = false;
  };

  const confirm = (options = {}) =>
    open(state, options, 'confirm').then((v) => {
      if (v === 'confirm' || v === true) return true;
      return false;
    });
  const prompt = (options = {}) =>
    open(state, options, 'prompt').then((v) => (v === false || v === 'cancel' ? null : v));
  const alert = (options = {}) =>
    open(state, { ...options, cancelText: '' }, 'alert').then(() => true);
  const confirmThree = (options = {}) =>
    open(state, options, 'confirm').then((v) => {
      if (v === 'confirm' || v === true) return 'confirm';
      if (v === 'tertiary') return 'tertiary';
      return 'cancel';
    });

  return {
    state,
    confirm,
    prompt,
    alert,
    confirmThree,
    close,
  };
};
