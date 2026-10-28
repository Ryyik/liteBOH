/**
 * 异步「面板 / 子页面」的统一工厂 —— 唯一实现处。
 *
 * ⚠️ 为什么不能再写 `defineAsyncComponent(() => import('...'))` 的裸简写：
 *   裸简写在 loader 成功前**没有任何 UI**，chunk 拉不到时整块是「无声空白」
 *   （用户报过「点成员什么都没有」）。失败也无人上报 —— 只能等用户口述。
 *   本工厂统一三件事：① 延迟 120ms 才显示 loading（避免闪一下骨架）；
 *   ② 失败退避重试 2 次（300 / 600ms 递增）；③ 仍失败则上报
 *   `async_component_failure` + **继续显示加载态**（见下）。
 *
 * ⚠️ 失败态刻意**不渲染错误卡**（2026-10-27 用户定稿：那两块黑虚线框比空白更像故障）：
 *   一次部署窗口能让同一页同时冒出两三块虚线框，观感远差于「继续转圈」。
 *   所以失败后 UI 保持「三个点 + 正在加载…」，真正的出口交给恢复链 ——
 *   onError 重试耗尽时调用 `recoverDynamicImportFailure()`（SW 感知强刷，30s 冷却）。
 *   恢复被限流 / 真网络故障时就一直保持在加载态：下次进入该面板会重新 import 再试。
 *   可观测性不因此丢失：fail() 之前照样上报 `async_component_failure`（带 label）。
 *
 * ⚠️ 加载态的视觉复用 index.html 的**内联** `.boh-boot-dots` / `.boh-boot-text`，
 *   不引任何外部 CSS 文件：资源全挂时内联样式仍在，符合本文件「不依赖可能失败的
 *   CSS」的初衷；圆点再用 `currentColor` 兜一层内联色，深浅主题自动跟随。
 *
 * 存量已有等价实现的旧写法（async-loaders.js 的 AsyncCommunity / AsyncForum /
 * AsyncBOHAI）保留各自业务差异（loadingComponent / timeout），新增一律走本工厂。
 * 门禁 `check:async-component-fallback` 会拦住新增的裸写法。
 */
import { defineAsyncComponent, h } from 'vue';
import { reportEvent } from './monitoring.js';
import { recoverDynamicImportFailure } from './vite-preload-recovery.js';

const DEFAULT_DELAY = 120;
const DEFAULT_TIMEOUT = 20 * 1000;
const DEFAULT_RETRIES = 2;

/* 失败态 = 沿用加载态的外观（三个点 + 文案），不出现任何「加载失败」字样。
   用内联样式兜底：index.html 的 .boh-boot-dots 负责弹跳动画，这里只保证
   即使那段内联样式缺失，也能看到三个灰点而不是「什么都没有」。 */
const dotStyle = {
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  background: 'currentColor',
  opacity: '0.35',
};

const AsyncPanelQuiet = {
  name: 'AsyncPanelQuiet',
  setup() {
    return () =>
      h(
        'div',
        {
          class: 'async-panel-quiet',
          role: 'status',
          'aria-live': 'polite',
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '14px',
            padding: '28px 16px',
            minHeight: '88px',
          },
        },
        [
          h(
            'div',
            {
              class: 'boh-boot-dots',
              'aria-hidden': 'true',
              style: { display: 'flex', gap: '7px' },
            },
            [
              h('span', { style: dotStyle }),
              h('span', { style: dotStyle }),
              h('span', { style: dotStyle }),
            ],
          ),
          h('p', { class: 'boh-boot-text', style: { margin: '0', fontSize: '13px' } }, '正在加载…'),
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
 * @param {object} [options.errorComponent] 自定义失败兜底（默认 = 继续显示加载态）
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
    errorComponent: errorComponent || AsyncPanelQuiet,
    onError(error, retry, fail, attempts) {
      if (attempts <= retries) {
        setTimeout(() => retry(), attempts * 300);
        return;
      }
      reportEvent('async_component_failure', { label });
      /* 先发起恢复再 fail：部署窗口期（旧 index.html 引用已删除的 hash chunk）
         只有强刷能救，30s 冷却内不重复刷。恢复没发起时页面停在加载态 ——
         这是刻意的降级，用户看不到「加载失败」这种比故障更吓人的说法。 */
      recoverDynamicImportFailure();
      fail(error);
    },
  });
};
