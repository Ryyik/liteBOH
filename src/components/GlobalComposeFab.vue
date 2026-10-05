<template>
  <Transition name="compose-fab-pop">
    <button
      v-if="visible"
      type="button"
      class="mobile-compose-fab embedded-compose-fab"
      aria-label="发布帖子"
      @click="goCompose"
    >
      <span>+</span>
    </button>
  </Transition>
</template>

<script setup>
/**
 * 全局发帖 FAB（2026-10-05 修「竖屏底栏来回切换后 + 号消失」用户报障；横屏不涉及）
 *
 * 发帖器的宿主是 ForumMain（首页 feed 与 UserSpace 方块 tab 由它自带的
 * .mobile-compose-fab 原地打开）；底栏其余落点（我 / 消息、AI 页）没有可见的
 * ForumMain，+ 号此前随底栏切换直接消失。本组件在那些落点兜底：点击走横屏左栏
 * 同款的 /?compose=1 深链，由首页分区壳原地打开发帖器（含草稿保存确认链）。
 *
 * 与 ForumMain 自带 FAB 的分工（互斥，防双 + 号）：
 *   · '/'                      → ForumMain FAB
 *   · /user-space（方块 tab，含无 tab 参数的默认态）→ ForumMain FAB
 *   · /user-space?tab=posts|messages|… 与 /ai-chat → 本组件
 *
 * 样式取自 styles/common/compose-fab.css（.mobile-compose-fab 单源，本组件经
 * <style src> 引进应用壳）—— 不能依赖 ForumMain 的 scoped CSS：本组件出现的路由
 * ForumMain 往往未挂载，那套样式根本没加载（实测裸按钮 10×30 掉到视口外）。
 */
import { computed, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { isForumPortraitComposer, onForumPortraitComposerChange } from '@/utils/forum-viewport.js';

const route = useRoute();
const router = useRouter();

// 竖屏编辑器形态判据单源：utils/forum-viewport.js（与 ForumMain 的 FAB 同一判据）
const isPortrait = ref(isForumPortraitComposer());
let releasePortraitWatch = null;
if (typeof window !== 'undefined') {
  releasePortraitWatch = onForumPortraitComposerChange((matches) => {
    isPortrait.value = matches;
  });
}
onUnmounted(() => {
  if (typeof releasePortraitWatch === 'function') releasePortraitWatch();
});

const visible = computed(() => {
  if (!isPortrait.value) return false;
  if (route.path === '/user-space') {
    // 无 tab 参数 = UserSpace 默认进方块 tab（useUserSpaceTabs initialTab='community'），
    // 归 ForumMain 的 FAB；只有显式切到其它 tab 才由这里兜底
    const tab = String(route.query.tab || '');
    return tab !== '' && tab !== 'community';
  }
  return route.path === '/ai-chat';
});

const goCompose = () => {
  router.push({ path: '/', query: { compose: '1' } });
};
</script>

<style src="@/styles/common/compose-fab.css"></style>
<style scoped>
.compose-fab-pop-enter-active,
.compose-fab-pop-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.compose-fab-pop-enter-from,
.compose-fab-pop-leave-to {
  opacity: 0;
  transform: scale(0.6);
}
</style>
