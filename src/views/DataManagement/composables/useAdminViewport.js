/**
 * 后台「两栏还是整页钻取」的视口判定（plans/049 期 1，2026-11-25）
 *
 * ── 为什么另建一个，不复用 settingsWideViewport ──────────────────────
 * `useSettingsChrome.js` 里的 `settingsWideViewport` 断点值（landscape 且
 * ≥1024×600）同时被 `isGlobalNavbarVisible` 的「设置子页隐藏导航岛」规则消费。
 * 后台若直接复用同一个 ref，将来任何一方觉得阈值该调，都会连带改掉前台导航
 * 行为 —— 那种「改 A 坏 B」的耦合在 plans/048 §3 里已经点名警告过。
 *
 * 所以这里**复制同一个判据、独立一个 ref**：两个视口语义当下恰好一致（都是
 * 「横屏够宽才两栏」），但各自可以有各自的演化节奏。
 *
 * ── 判据为什么是 orientation 而不是宽度 ────────────────────────────
 * 用户的原始口径是「竖屏就是一个完全的设置项目页面，横屏是左导航右子页」——
 * 判据是**方向**，不是「手机 vs 电脑」。所以：
 *   · 768×1024 竖屏平板 ⇒ 整页钻取（宽度过 768 但仍是竖屏）
 *   · 844×390 手机横屏 ⇒ 整页钻取（min-height 390 < 600，塞不下两栏）
 *   · 1440×900 笔记本 ⇒ 两栏
 * 用 `window.innerWidth < 768` 判会同时判错上面第一、二两条。
 */
import { ref } from 'vue';

/** 与 settingsWideViewport 同一个断点表达式，刻意重复而不是 import */
const QUERY = '(orientation: landscape) and (min-width: 1024px) and (min-height: 600px)';

const mq =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY)
    : null;

/**
 * 当前是否为「够宽的横屏」。
 * true  ⇒ 两栏：左栏 256px 常驻 + 右栏内容
 * false ⇒ 单栏整页钻取：目录 → 组内行 → 内容，每层都是完整一页
 *
 * ⚠️ 直接导出一个 ref（不是工厂函数）：断点在一个页面里只需要一份，
 *    工厂会让每次调用各建一个 listener，卸载时漏解绑。本模块只在 DataAdmin
 *    与其子组件里用，单例语义是对的。
 */
export const adminWideViewport = ref(mq ? mq.matches : false);

if (mq) {
  const onChange = (event) => {
    adminWideViewport.value = event.matches;
  };
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange);
  else if (typeof mq.addListener === 'function') mq.addListener(onChange);
}

/**
 * 测试用：把 ref 直接改掉（jsdom 里 matchMedia 是 stub，change 事件不会真触发）。
 * 生产代码不要调这个 —— 真源是媒体查询。
 */
export const setAdminWideViewportForTest = (value) => {
  adminWideViewport.value = !!value;
};
