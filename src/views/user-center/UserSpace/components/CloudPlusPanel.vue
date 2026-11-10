<template>
  <!-- Cloud+（2026-11-10 从「整页跳转」改为设置三级页）
       原来设置里点它是 `router.push('/user-space/note?view=settings')` —— 整页换成图库，
       设置壳（左栏 + 返回条）全没了。现在横屏出右栏、竖屏整页。
       页面实现仍是 CloudPlusMain 一份，内嵌时它的视图档位改走内部 ref
       （initial-view="settings" → 配额 / 清理 / 空间管理那一档），不读写 ?view=
       —— 那个参数在 /user-space 上归设置壳用，写进去会把设置页顶掉。 -->
  <div class="cloud-plus-panel">
    <Suspense>
      <template #default>
        <CloudPlusMain embedded initial-view="settings" />
      </template>
      <template #fallback>
        <div class="cpp-skeleton" aria-hidden="true">
          <span class="cpp-skeleton-line is-short animate-skeleton-wave"></span>
          <span class="cpp-skeleton-card animate-skeleton-wave"></span>
          <span class="cpp-skeleton-card animate-skeleton-wave"></span>
        </div>
      </template>
    </Suspense>
  </div>
</template>

<script setup>
/**
 * Cloud+ 内联面板：只做「嵌入外壳 + 首屏骨架」。
 * 取数、配额、回收站、分享全部留在 CloudPlusMain 里，这里不复制任何业务逻辑。
 */
import { createPanelAsync } from '@/utils/async-component.js';

const CloudPlusMain = createPanelAsync(
  () => import('@/views/user-center/Cloud+/CloudPlusMain.vue'),
  { label: 'CloudPlusMain' },
);
</script>

<style scoped>
@import '../styles/settings-glass.css';

.cloud-plus-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  animation: cpp-in 240ms var(--ease-out, ease-out) both;
}

@keyframes cpp-in {
  from {
    opacity: 0;
    transform: translateX(12px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* 内嵌时收掉 Cloud+ 自己的页面留白（原本是整页的 24px gutter + 32px 底部）——
   设置右栏已经把内容框在 393..1249 里，再加 24px 就和上面返回条、以及其它
   设置子页的卡片左缘差一格（实测 417 vs 393）。 */
.cloud-plus-panel :deep(.cloud-page.embedded .cloud-shell) {
  padding: 0 0 8px;
}

/* 也不铺它自己的整页白底 + 100vh 撑高：设置右栏的画布是灰的，
   铺一层白会把这一档变成「页面里的页面」，与旁边几张卡片不在同一层。
   ⚠️ 玻璃卡的材质注释写着「需要一层冷色环境光」—— 那条是为整页准备的，
   在设置右栏里环境光由宿主画布给，这里只去掉页面底色，不动卡的材质。 */
.cloud-plus-panel :deep(.cloud-page.embedded) {
  min-height: 0;
  background: transparent;
}

/* 环境光是挂在 .cloud-page::before 上的（inset:0 的径向渐变），只清 background
   清不掉它 —— 内嵌时一并关掉，让这一档和旁边几张设置卡片同处一块灰画布。 */
.cloud-plus-panel :deep(.cloud-page.embedded::before) {
  display: none;
}

/* 竖屏（手机整页形态）：设置壳在窄屏不给左右内边距，收掉留白后标题会贴到屏幕边上。
   横屏不加 —— 那时右栏自带内边距，加了会与返回条左缘错开 16px。 */
@media (max-width: 767px) {
  .cloud-plus-panel :deep(.cloud-page.embedded .cloud-shell) {
    padding: 0 16px 8px;
  }
}

.cpp-skeleton {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 4px 0;
}

.cpp-skeleton-line {
  display: block;
  height: 16px;
  width: 180px;
  border-radius: 8px;
  background: var(--liquid-bg-strong, rgba(0, 0, 0, 0.06));
}

.cpp-skeleton-line.is-short {
  width: 120px;
}

.cpp-skeleton-card {
  display: block;
  height: 96px;
  border-radius: var(--liquid-radius-md, 18px);
  background: var(--liquid-bg-strong, rgba(0, 0, 0, 0.04));
}

@media (prefers-reduced-motion: reduce) {
  .cloud-plus-panel {
    animation: none;
  }
}
</style>
