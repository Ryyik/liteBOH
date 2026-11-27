<template>
  <!--
    圣诞交换礼物 · 首页英雄区

    树是**预渲染的静态 SVG**（`assets/images/xmas-hero-tree.svg`，由
    `views/ChristmasGiftTree/data/tree-pixels.js` 的 buildTreeSceneSvg 导出）。
    不在首屏实时生成：那要跑 2000 个 rect、产出 120KB 字符串，
    而 hero 是首屏最贵的一段。树改样之后必须重新导出，命令写在文件末尾。

    横竖两套构图：
      · 桌面 —— 树在右侧、大半出画（裁切），文字压在左侧的暗渐变上；
      · 竖屏 —— 树在上方居中，文字落在下半部，靠从下往上的暗色兜住可读性。
    两套都只调位置，不换 DOM，避免维护两份结构。
  -->
  <section class="xmas-hero" :aria-label="ariaLabel">
    <img
      class="xmas-hero-tree"
      :src="treeSrc"
      alt=""
      aria-hidden="true"
      :loading="priority ? 'eager' : 'lazy'"
      :fetchpriority="priority ? 'high' : 'auto'"
      decoding="async"
      draggable="false"
    />
    <div class="xmas-hero-shade" aria-hidden="true"></div>

    <div class="xmas-hero-content">
      <p class="xmas-hero-eyebrow">
        <span class="xmas-hero-dot" aria-hidden="true"></span>
        BOH · CHRISTMAS 2026
      </p>
      <h2 class="xmas-hero-title">
        <span class="xmas-hero-mark">圣诞交换礼物</span>
      </h2>
      <p class="xmas-hero-sub">挂上头像，随机配对。礼物自行准备。</p>
      <div class="xmas-hero-actions">
        <router-link class="xmas-hero-cta" to="/xmas">
          <svg class="xmas-hero-gift" viewBox="0 0 12 12" width="18" height="18" aria-hidden="true">
            <rect x="3" y="0" width="2" height="2" fill="currentColor" />
            <rect x="7" y="0" width="2" height="2" fill="currentColor" />
            <rect x="1" y="2" width="10" height="2" fill="currentColor" />
            <rect x="2" y="4" width="8" height="7" fill="currentColor" />
            <rect x="5" y="2" width="2" height="9" fill="#8a5a12" />
          </svg>
          立即参与
        </router-link>
        <span class="xmas-hero-meta">12 月 20 日 20:00 揭晓 · 最多 20 位</span>
      </div>
    </div>
  </section>
</template>

<script setup>
import treeSrc from '@/assets/images/xmas-hero-tree.svg?url';

defineProps({
  /** 首屏第一块 hero 时优先加载，其余懒加载 */
  priority: { type: Boolean, default: false },
  ariaLabel: { type: String, default: '方块之家 2026 圣诞交换礼物' },
});
</script>

<style scoped>
/*
 * 这一块是固定夜景，不跟站内主题切换 —— 与 /xmas 页面同一个夜空配色，
 * 从首页点进去不会出现「黑白两个世界」。
 * 依旧是像素风的硬规则：无圆角、无模糊渐变、阴影只有实心偏移。
 */
.xmas-hero {
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  min-height: clamp(440px, 62svh, 640px);
  overflow: hidden;
  padding: clamp(32px, 5vw, 72px) clamp(24px, 6vw, 88px);
  color: #eef2ff;
  background: linear-gradient(
    180deg,
    #070c1d 0 16%,
    #0a122a 16% 32%,
    #0d1834 32% 48%,
    #101d3d 48% 66%,
    #132446 66% 100%
  );
}

.xmas-hero-tree {
  position: absolute;
  right: -3%;
  bottom: -6%;
  z-index: 0;
  width: auto;
  /* 106% 是量出来的上限：再高树顶星就被首屏顶边切掉了 */
  height: 106%;
  max-width: none;
  user-select: none;
  pointer-events: none;
  animation: xmas-hero-tree-in 1.2s cubic-bezier(0.16, 1, 0.3, 1) both;
}

/* 左侧压暗：树在右边，文字在左边，没有这层渐变白字会直接压在树冠上 */
.xmas-hero-shade {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: linear-gradient(
    90deg,
    rgba(6, 11, 26, 0.94) 0%,
    rgba(6, 11, 26, 0.82) 28%,
    rgba(6, 11, 26, 0.42) 56%,
    rgba(6, 11, 26, 0) 78%
  );
}

.xmas-hero-content {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 560px;
}

.xmas-hero-eyebrow {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 14px;
  font-size: 11.5px;
  font-weight: 650;
  letter-spacing: 0.26em;
  color: #f0b83c;
}

.xmas-hero-dot {
  width: 6px;
  height: 6px;
  background: #f0b83c;
  flex: none;
}

.xmas-hero-title {
  margin: 0 0 14px;
  font-size: clamp(26px, 3.6vw, 46px);
  font-weight: 800;
  line-height: 1.34;
  letter-spacing: 0.01em;
  text-shadow: 2px 2px 0 rgba(4, 8, 20, 0.85);
}

/* 第二行是金色色块：整句同重会让人抓不住重点 */
.xmas-hero-mark {
  display: inline-block;
  margin-top: 8px;
  padding: 3px 12px 6px;
  background: #f0b83c;
  color: #2a1a04;
  text-shadow: none;
  box-shadow: 5px 5px 0 rgba(70, 40, 2, 0.5);
}

.xmas-hero-sub {
  max-width: 26em;
  margin: 0 0 26px;
  font-size: clamp(13px, 1.3vw, 15.5px);
  line-height: 1.75;
  color: #a9b6d4;
}

.xmas-hero-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
}

.xmas-hero-cta {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  height: 50px;
  padding: 0 26px;
  border: 3px solid #f0b83c;
  background: #c07f34;
  color: #fff8e6;
  font-size: 15.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-decoration: none;
  text-shadow: 2px 2px 0 rgba(48, 26, 2, 0.6);
  box-shadow:
    inset 3px 3px 0 rgba(255, 236, 180, 0.35),
    inset -3px -3px 0 rgba(60, 32, 2, 0.45),
    5px 5px 0 #060b18;
  transition: none;
}

.xmas-hero-cta:active {
  transform: translate(3px, 3px);
  box-shadow:
    inset 3px 3px 0 rgba(255, 236, 180, 0.25),
    inset -3px -3px 0 rgba(60, 32, 2, 0.45),
    2px 2px 0 #060b18;
}

.xmas-hero-gift {
  flex: none;
  shape-rendering: crispEdges;
  filter: drop-shadow(2px 2px 0 rgba(48, 26, 2, 0.5));
}

.xmas-hero-meta {
  font-size: 12px;
  letter-spacing: 0.04em;
  color: #9aa8c7;
}

/*
 * 只动 opacity。入场动画一旦写 transform，就会盖掉竖屏那条
 * `transform: translateX(50%)` 的居中 —— 动画优先级更高，树会贴到左边去。
 */
@keyframes xmas-hero-tree-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/*
 * 竖屏：树挪到上方居中，文字落到下半部。
 * 树高按视口给（而不是按容器高），否则矮手机上树会把文案整个挤出去。
 */
@media (max-width: 899px) {
  .xmas-hero {
    align-items: flex-end;
    min-height: clamp(560px, 80svh, 760px);
    padding: 24px 20px 34px;
  }

  .xmas-hero-tree {
    top: -1%;
    right: 50%;
    bottom: auto;
    /* 54%：树底停在 51% 处，和下方文案之间留出约 55px 的呼吸位 */
    height: 54%;
    transform: translateX(50%);
  }

  /* 竖屏的遮罩改成上下向：上方留一点树顶，下方压到近黑托住文字 */
  .xmas-hero-shade {
    background: linear-gradient(
      180deg,
      rgba(6, 11, 26, 0.5) 0%,
      rgba(6, 11, 26, 0) 26%,
      rgba(6, 11, 26, 0.55) 56%,
      rgba(6, 11, 26, 0.94) 82%,
      rgba(6, 11, 26, 0.98) 100%
    );
  }

  .xmas-hero-content {
    max-width: none;
    text-align: center;
  }

  .xmas-hero-eyebrow,
  .xmas-hero-actions {
    justify-content: center;
  }

  .xmas-hero-sub {
    margin-left: auto;
    margin-right: auto;
    margin-bottom: 22px;
  }
}

/* 矮横屏（手机横过来）：树会顶到文字，压小一档并让两边各让一点 */
@media (orientation: landscape) and (max-height: 560px) {
  /*
   * 手机横过来时宽度仍小于 900，会先吃到竖屏那套「居中 + 树在上」的规则；
   * 这里必须把对齐方式显式改回左起，否则树回到右侧、文字还留在中间，
   * 白字会直接压在树冠上。
   */
  .xmas-hero {
    min-height: 380px;
    align-items: center;
    padding: 26px 26px;
  }

  .xmas-hero-content {
    max-width: 58%;
    text-align: left;
  }

  .xmas-hero-eyebrow,
  .xmas-hero-actions {
    justify-content: flex-start;
  }

  .xmas-hero-tree {
    top: auto;
    right: -1%;
    bottom: -6%;
    /* 104%：再高树顶星会被 hero 顶边切掉 */
    height: 104%;
    transform: none;
  }

  .xmas-hero-shade {
    background: linear-gradient(
      90deg,
      rgba(6, 11, 26, 0.96) 0%,
      rgba(6, 11, 26, 0.9) 42%,
      rgba(6, 11, 26, 0.35) 68%,
      rgba(6, 11, 26, 0) 88%
    );
  }

  .xmas-hero-title {
    font-size: 24px;
  }

  .xmas-hero-mark {
    margin-top: 6px;
    padding: 2px 10px 4px;
  }

  .xmas-hero-sub {
    display: none;
  }

  .xmas-hero-cta {
    height: 44px;
    font-size: 14px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .xmas-hero-tree {
    animation: none;
  }
}
</style>

<!--
  重新导出树（改了 tree-pixels.js 之后必须跑）：
    node --input-type=module -e "import('./src/views/ChristmasGiftTree/data/tree-pixels.js').then(async m => { const fs = await import('node:fs'); fs.writeFileSync('src/assets/images/xmas-hero-tree.svg', m.buildTreeSceneSvg()); })"
-->
