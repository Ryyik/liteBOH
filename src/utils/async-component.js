/**
 * 异步「面板 / 子页面」的统一工厂 —— 唯一实现处。
 *
 * ⚠️ 为什么不能再写 `defineAsyncComponent(() => import('...'))` 的裸简写：
 *   裸简写在 loader 成功前**没有任何 UI**，chunk 拉不到时整块是「无声空白」
 *   （用户报过「点成员什么都没有」）。失败也无人上报 —— 只能等用户口述。
 *   本工厂统一三件事：① 延迟 120ms 才显示 loading（避免闪一下骨架）；
 *   ② 失败退避重试 2 次（300 / 600ms 递增）；③ 仍失败则上报
 *   `async_component_failure` + 渲染错误卡（明示「加载失败」而非空白）。
 *
 * ⚠️ 错误卡用**内联样式**，刻意不依赖任何 CSS 文件：这个组件存在的意义正是
 *   「资源加载失败时还能说话」，若它自己也要等一份可能失败的 CSS 才有观感，
 *   就在最关键的时候失效了。颜色统一用 `currentColor`（继承父级文字色）⇒
 *   深浅主题下都可读，不需要额外维护两套变量。
 *
 * 存量已有等价实现的旧写法（async-loaders.js 的 AsyncCommunity / AsyncForum /
 * AsyncBOHAI）保留各自业务差异（loadingComponent / timeout），新增一律走本工厂。
 * 门禁 `check:async-component-fallback` 会拦住新增的裸写法。
 */
import { defineAsyncComponent, h } from 'vue';
import { reportEvent } from './monitoring.js';

const DEFAULT_DELAY = 120;
const DEFAULT_TIMEOUT = 20 * 1000;
const DEFAULT_RETRIES = 2;

/** 统一错误卡：替代裸简写的「无声空白」 */
const AsyncPanelError = {
  name: 'AsyncPanelError',
  setup() {
    return () =>
      h(
        'div',
        {
          class: 'async-panel-fallback',
          role: 'alert',
          style: {
            padding: '24px 16px',
            textAlign: 'center',
            fontSize: '14px',
            lineHeight: '1.6',
            borderRadius: '12px',
            border: '1px dashed currentColor',
            opacity: '0.7',
          },
        },
        [
          h('p', { style: { margin: '0 0 4px', fontWeight: '600' } }, '内容加载失败'),
          h('p', { style: { margin: '0', fontSize: '13px' } }, '请检查网络后重试，或刷新页面。'),
        ],
      );
  },
};

/**
 * 创建一个带失败兜底的异步组件。
 * @param {Function} loader 动态加载函数，如 () => import('./X.vue')
 * @param {object} [options]
 * @param {string} [options.label] 上报用的标识（默认取调用方变量名不可得，故显式传）
 * @param {number} [options.delay] 显示 loading 前的延迟
 * @param {number} [options.timeout] 超时（触发 onError）
 * @param {number} [options.retries] 退避重试次数
 * @param {object} [options.loadingComponent] 自定义 loading
 * @param {object} [options.errorComponent] 自定义错误卡
 */
export const createPanelAsync = (loader, options = {}) => {
  const {
    label = 'anonymous',
    delay = DEFAULT_DELAY,
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    loadingComponent,
    errorComponent,
  } = options;

  return defineAsyncComponent({
    loader,
    delay,
    timeout,
    loadingComponent,
    errorComponent: errorComponent || AsyncPanelError,
    onError(error, retry, fail, attempts) {
      if (attempts <= retries) {
        setTimeout(() => retry(), attempts * 300);
        return;
      }
      reportEvent('async_component_failure', { label });
      fail(error);
    },
  });
};
