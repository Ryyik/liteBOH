/**
 * useDelight — 成功时刻的 delight 动画封装
 *
 * 设计原则（参考 emil-design-eng）：
 * - 克制使用 — 仅在用户达成"高情绪价值"动作时触发（登录成功、表单提交成功等）
 * - 短促优雅 — 单次 burst 不超过 1.2s，避免打扰用户
 * - 可访问性 — 自动尊重 prefers-reduced-motion，在该模式下不触发
 * - 颜色协调 — 使用项目主题色，避免彩虹色
 *
 * 用法：
 *   const delight = useDelight();
 *   delight.success();        // 默认成功动效（克制金粉）
 *   delight.celebrate();      // 更强烈的庆祝动效（多 burst）
 *   delight.burst({ x, y });  // 自定义位置单次 burst
 */

import confetti from "canvas-confetti";

const THEME_COLORS_SUCCESS = ["#0071e3", "#34c759", "#5ac8fa", "#ffffff"];
const THEME_COLORS_CELEBRATE = [
  "#0071e3",
  "#34c759",
  "#ff9f0a",
  "#ff453a",
  "#bf5af2",
  "#ffffff",
];

/**
 * 检测用户是否启用了减少动画偏好
 */
function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useDelight() {
  /**
   * 单次克制 burst — 用于"操作成功"
   * @param {Object} options - { x, y, colors, particleCount, spread }
   */
  function burst(options = {}) {
    if (prefersReducedMotion()) return;

    const {
      x = 0.5,
      y = 0.7,
      colors = THEME_COLORS_SUCCESS,
      particleCount = 35,
      spread = 55,
      startVelocity = 25,
      scalar = 0.8,
    } = options;

    confetti({
      particleCount,
      spread,
      startVelocity,
      origin: { x, y },
      colors,
      scalar,
      ticks: 120,
      disableForReducedMotion: true,
    });
  }

  /**
   * 成功动效 — 单次克制金粉
   * 适合：登录成功、表单保存成功、个人资料更新成功
   */
  function success() {
    if (prefersReducedMotion()) return;
    burst({
      x: 0.5,
      y: 0.6,
      particleCount: 40,
      spread: 60,
      startVelocity: 28,
      colors: THEME_COLORS_SUCCESS,
    });
  }

  /**
   * 庆祝动效 — 多 burst 错落
   * 适合：发帖成功、抽奖中奖、达成里程碑
   */
  function celebrate() {
    if (prefersReducedMotion()) return;

    // 中心 burst
    burst({
      x: 0.5,
      y: 0.5,
      particleCount: 60,
      spread: 70,
      startVelocity: 35,
      colors: THEME_COLORS_CELEBRATE,
    });

    // 左右两侧延迟 burst
    setTimeout(() => {
      burst({
        x: 0.2,
        y: 0.6,
        particleCount: 25,
        spread: 45,
        startVelocity: 25,
        colors: THEME_COLORS_CELEBRATE,
      });
      burst({
        x: 0.8,
        y: 0.6,
        particleCount: 25,
        spread: 45,
        startVelocity: 25,
        colors: THEME_COLORS_CELEBRATE,
      });
    }, 200);
  }

  return {
    burst,
    success,
    celebrate,
  };
}
