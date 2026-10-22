<template>
  <!--
    ProfileHomePanel 的加载骨架（2026-10-22）。
    此前 ProfileHomePanel 走 createPanelAsync 且**没有 loadingComponent**：
    chunk 拉取期间（delay 120ms + 网络耗时）这一块渲染成「无声空白」——
    用户从图库首次点「我」时，看到的就是 分段 tab 在、下面一片白。
    骨架按身份卡的真实结构画（封面带 / 头像 + 两行字 / 统计行 4 格），
    占位高度与真卡一致，加载完成时不重排。

    ⚠️ 颜色全部走全局液态 token + color-mix 派生：不写 [data-theme='dark'] 覆盖，
       不给 check:dark-tokens 棘轮添数。
  -->
  <div class="profile-home-skeleton" aria-hidden="true">
    <section class="phs-hero">
      <div class="phs-cover phs-wave"></div>
      <div class="phs-identity">
        <div class="phs-avatar phs-wave"></div>
        <div class="phs-lines">
          <div class="phs-line phs-line--name phs-wave"></div>
          <div class="phs-line phs-line--bio phs-wave"></div>
        </div>
      </div>
      <div class="phs-stats">
        <span v-for="i in 4" :key="i" class="phs-stat phs-wave"></span>
      </div>
    </section>
    <div class="phs-section">
      <div class="phs-line phs-line--section phs-wave"></div>
      <div class="phs-card phs-wave"></div>
      <div class="phs-card phs-wave"></div>
    </div>
  </div>
</template>

<script setup>
/**
 * 骨架无逻辑；keyframes 与配色都在本文件 scoped 内自洽，
 * 不依赖 ProfileHomePanel 的任何样式（它此刻还没加载完）。
 */
</script>

<style scoped>
.profile-home-skeleton {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 16px 28px;
}

.phs-wave {
  background: color-mix(in srgb, var(--liquid-text-primary) 7%, transparent);
  animation: phs-pulse 1.3s ease-in-out infinite;
}

@keyframes phs-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

/* 封面带：与真卡一致的 176px 通栏高（2026-10-22 竖屏全宽口径） */
.phs-cover {
  height: 176px;
  border-radius: 18px;
}

.phs-identity {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: -34px;
  padding: 0 16px;
}

.phs-avatar {
  width: 88px;
  height: 88px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 3px solid var(--liquid-bg-strong);
}

.phs-lines {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding-top: 30px;
}

.phs-line {
  height: 13px;
  border-radius: 7px;
}

.phs-line--name {
  width: 42%;
}

.phs-line--bio {
  width: 68%;
  opacity: 0.7;
}

.phs-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.phs-stat {
  height: 44px;
  border-radius: 12px;
}

.phs-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 6px;
}

.phs-line--section {
  width: 30%;
  height: 14px;
}

.phs-card {
  height: 96px;
  border-radius: 16px;
}

/* 弱动效偏好：只保留明暗呼吸之外的静态占位 */
@media (prefers-reduced-motion: reduce) {
  .phs-wave {
    animation: none;
  }
}
</style>
