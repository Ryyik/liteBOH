<script setup>
/**
 * OverviewIslandLoading — 智能概览「加载中」自定义岛（showIsland.custom 槽位）
 * 由 UnifiedNavbar 的 .island-custom-host 渲染，高度自动上报撑开导航 surface。
 *
 * 视觉：白底玻璃胶囊（surface 自带）+ 8 彩色圆点转圈、波峰依次点亮发光 + 文字流光。
 * 无彩虹边、无外光晕——全程只有圆点自身的辉光。
 * 生命周期由宿主（useOverviewIsland）管理：请求返回后 close 换成品摘要岛，
 * 无新内容/异常静默收掉（不弹引导）；14s 兜底自动收，防请求悬挂导致岛常驻。
 */
defineProps({
  message: { type: String, default: '智能摘要即将就绪' }
});
</script>

<template>
  <div class="ov-island-loading" role="status" :aria-label="message">
    <span class="oil-spinner" aria-hidden="true">
      <i style="--a:0deg;   --i:0; --c:#ff5a5f"></i>
      <i style="--a:45deg;  --i:1; --c:#ff9f43"></i>
      <i style="--a:90deg;  --i:2; --c:#feca57"></i>
      <i style="--a:135deg; --i:3; --c:#1dd1a1"></i>
      <i style="--a:180deg; --i:4; --c:#48dbfb"></i>
      <i style="--a:225deg; --i:5; --c:#5f6cf6"></i>
      <i style="--a:270deg; --i:6; --c:#c56cf0"></i>
      <i style="--a:315deg; --i:7; --c:#ff6b81"></i>
    </span>
    <span class="oil-text">{{ message }}</span>
  </div>
</template>

<style scoped>
.ov-island-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 11px;
  height: 52px;
  padding: 0 12px 4px;
}

/* 8 彩点圆周 spinner：1.8s 一轮，波峰依次扫过，只有被扫到的点亮起 */
.oil-spinner {
  position: relative;
  width: 30px;
  height: 30px;
  flex: none;
}

.oil-spinner i {
  --r: 9.5px;
  position: absolute;
  top: 50%;
  left: 50%;
  width: 5.5px;
  height: 5.5px;
  margin: -2.75px 0 0 -2.75px;
  border-radius: 50%;
  background: var(--c);
  opacity: .25;
  transform: rotate(var(--a)) translateY(calc(-1 * var(--r))) scale(.72);
  animation: oil-dot 1.8s ease-in-out infinite;
  animation-delay: calc(var(--i) * 1.8s / 8);
}

@keyframes oil-dot {
  0%, 58%, 100% {
    opacity: .25;
    transform: rotate(var(--a)) translateY(calc(-1 * var(--r))) scale(.72);
    box-shadow: 0 0 0 transparent;
  }
  16% {
    opacity: 1;
    transform: rotate(var(--a)) translateY(calc(-1 * var(--r))) scale(1.24);
    box-shadow: 0 0 6px var(--c), 0 0 12px var(--c);
  }
}

.oil-text {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: .02em;
  white-space: nowrap;
  background: linear-gradient(90deg, #a1a1a6 0%, #1d1d1f 42%, #1d1d1f 58%, #a1a1a6 100%);
  background-size: 240% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: oil-shimmer 2.6s linear infinite;
}

@keyframes oil-shimmer {
  from { background-position: 130% 0; }
  to   { background-position: -130% 0; }
}

/* 暗色：文字换浅色流光（圆点彩本色两种主题通用） */
html[data-theme="dark"] .oil-text {
  background: linear-gradient(90deg, #6e6e73 0%, #f5f5f7 42%, #f5f5f7 58%, #6e6e73 100%);
  background-size: 240% 100%;
  -webkit-background-clip: text;
  background-clip: text;
}

@media (max-width: 480px) {
  .oil-text { font-size: 12.5px; }
}

@media (prefers-reduced-motion: reduce) {
  .oil-spinner i,
  .oil-text {
    animation: none;
  }
  .oil-spinner i {
    opacity: .5;
  }
}
</style>
