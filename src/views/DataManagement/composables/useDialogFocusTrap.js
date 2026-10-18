/**
 * `v-dialog-focus` — 管理后台模态框的键盘可达性（2026-10-17 全面审查 B-5）。
 *
 * 背景：`.g-dialog*` 的样式修好后（P1-1），对话框「能看见」了，但键盘用户依然进不去、
 * 出不来：打开后焦点还留在触发按钮上（Tab 要穿过整张表格才可能碰到弹层）、Tab 会跑进
 * 背后的页面、Esc 关不掉、关闭后焦点不归还。WCAG 2.1.2（No Keyboard Trap）/ 2.4.3。
 *
 * 用法（`<script setup>` 里同名变量 `vDialogFocus` 会自动注册成 `v-dialog-focus`）：
 *   const vDialogFocus = createDialogFocusTrapDirective();
 *   <div v-if="keyDialog" class="g-dialog-overlay" v-dialog-focus="() => (keyDialog = null)">
 *
 * 生命周期跟 `v-if` 走：挂载时存下「打开前的焦点元素」并把焦点移进弹层；
 * 卸载时归还焦点、摘掉监听 —— 组件侧不需要任何 watch。
 *
 * ⚠️ 指令挂在 **overlay**（不是 `.g-dialog`）上：overlay 是全屏层，keydown 从任何
 * 聚焦的后代冒泡到它都接得住。
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const getFocusable = (root) => [...root.querySelectorAll(FOCUSABLE_SELECTOR)].filter((el) => el.offsetParent !== null || el === document.activeElement);

export function createDialogFocusTrapDirective() {
  // 每个挂载的 overlay 一份状态（同一时刻理论上只有一个弹层，但用 WeakMap 不赌这个）
  const states = new WeakMap();

  const handleKeydown = (event) => {
    const state = states.get(event.currentTarget);
    if (!state) return;

    if (event.key === 'Escape') {
      // stopPropagation：别让页面级的 Esc 处理器（再关一层别的）跟着触发
      event.stopPropagation();
      state.close();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = getFocusable(state.el);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (!state.el.contains(active)) {
      // 焦点意外跑出去了（浏览器怪癖 / 程序化 focus）：拉回弹层
      event.preventDefault();
      first.focus();
      return;
    }
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return {
    mounted(el, binding) {
      const state = {
        el,
        close: typeof binding.value === 'function' ? binding.value : () => {},
        previouslyFocused: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      };
      states.set(el, state);
      el.addEventListener('keydown', handleKeydown);

      // 焦点进弹层：优先第一个可聚焦控件；没有可聚焦的就把卡片本身设成可聚焦
      requestAnimationFrame(() => {
        const target = getFocusable(el)[0] || el.querySelector('.g-dialog');
        if (target) {
          if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
          target.focus({ preventScroll: true });
        }
      });
    },
    unmounted(el) {
      const state = states.get(el);
      states.delete(el);
      el.removeEventListener('keydown', handleKeydown);
      // 焦点归还：只在这颗元素（或其内部）仍是当前焦点时归还，避免打断用户已经
      // 自己移走的焦点（例如点了遮罩外的东西）
      if (state?.previouslyFocused?.isConnected) {
        if (!el.contains(document.activeElement) || document.activeElement === document.body) {
          state.previouslyFocused.focus({ preventScroll: true });
        }
      }
    },
  };
}
