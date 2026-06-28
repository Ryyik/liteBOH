import { reactive } from 'vue';

/**
 * 替换原生 window.confirm / window.prompt
 * 用法:
 *   const { state, confirm, prompt, alert, confirmThree } = useConfirmDialog();
 *   if (await confirm({ title, message, tone })) { ... }
 *   const name = await prompt({ title, placeholder, defaultValue });
 *   const result = await confirmThree({ ... }); // 返回 'confirm' | 'cancel' | 'tertiary'
 */
const createDialogState = () => reactive({
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
  resolver: null
});

let _state = null;

const ensureState = () => {
  if (!_state) _state = createDialogState();
  return _state;
};

const open = (state, options, kind) => new Promise((resolve) => {
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

export const useConfirmDialog = () => {
  const state = ensureState();

  const close = (result) => {
    if (state.resolver) {
      state.resolver(result);
      state.resolver = null;
    }
    state.visible = false;
  };

  const confirm = (options = {}) => open(state, options, 'confirm').then((v) => {
    if (v === 'confirm' || v === true) return true;
    return false;
  });
  const prompt = (options = {}) => open(state, options, 'prompt').then((v) => (v === false || v === 'cancel' ? null : v));
  const alert = (options = {}) => open(state, { ...options, cancelText: '' }, 'alert').then(() => true);
  const confirmThree = (options = {}) => open(state, options, 'confirm').then((v) => {
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
    close
  };
};
