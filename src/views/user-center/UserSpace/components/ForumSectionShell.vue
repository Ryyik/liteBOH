<template>
  <div class="forum-section-shell" :class="{ 'feed-switching': feedSwitchPulse }">
    <SegmentTabs
      :sections="FORUM_SECTION_ITEMS"
      :model-value="section"
      aria-label="方块分区"
      @update:model-value="selectSection"
    />

    <!-- 最新/关注/新闻/活动：ForumMain 承载（embedded），KeepAlive 保住滚动与已加载列表 -->
    <div v-show="isFeedSection" class="forum-section-feed">
      <KeepAlive>
        <AsyncForum
          v-if="isFeedSection"
          ref="forumViewRef"
          :show-navbar="false"
          :show-header="false"
          :embedded="true"
          :external-feed="externalFeed"
          @island-message="emit('island-message', $event)"
          @composer-state="emit('composer-state', $event)"
        />
      </KeepAlive>
    </div>

    <!-- 官方：首次切到才挂载（slot 由页面注入，内含异步加载的英雄区舞台） -->
    <div v-if="officialVisited" v-show="section === 'official'" class="forum-section-official">
      <slot name="official" />
    </div>

    <!-- 成员：独立面板，切走即卸载（与改版前 UserSpace 行为一致）
         ⚠️ 印象席已于 2026-10-01 移出论坛（plans/022 §4.5）——
         它现在是「我」页的第三个分段，见 components/ProfileImpressionsSection.vue。
         不要在这里把它加回来：那会让「印象」重新变成两个入口、两份数据层。 -->
    <AsyncCommunity
      v-if="section === 'members'"
      @switch-tab="emit('switch-tab', $event)"
      @open-follow-modal="(user, type) => emit('open-follow-modal', user, type)"
    />
  </div>
</template>

<script setup>
/* 方块（论坛）分区壳 —— 归属 UserSpace，2026-09-23 起由两处共用：
     · views/user-center/UserSpace/UserSpaceMain.vue（底栏「方块」分区）
     · views/Home/index.vue（首页 `/` 街景 Hero 下滑直达的论坛）
   单源：分区定义来自 @/config/forum-sections，不再各写一份。
   七席 = 官方 / 最新 / 关注 / 新闻 / 活动 / 成员 / 印象，官方居首但默认落点仍是「最新」。

   承载分流：
     · 最新/关注/新闻/活动 → AsyncForum（ForumMain，embedded，30s 轮询原样）
     · 官方              → #official 插槽（页面注入惰性加载的英雄区舞台）
     · 成员              → AsyncCommunity（CommunityTab）
     · 印象              → **已移出**（2026-10-01），现为「我」页第三分段，
                           见 components/ProfileImpressionsSection.vue

   过渡动画复用既有的 userspace-tab-in/out 体系（由外层页面提供类名）。 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import SegmentTabs from './SegmentTabs.vue';
import { AsyncCommunity, AsyncForum } from '../async-loaders.js';
import {
  FORUM_DEFAULT_SECTION,
  FORUM_SECTION_ITEMS,
  isForumFeedSection,
  resolveExternalFeed,
  resolveForumSection,
} from '@/config/forum-sections';
import { prefetchForumFirstPage } from '@/views/Forum/forum-feed-prefetch.js';

const props = defineProps({
  /** 当前分区（v-model:section） */
  section: { type: String, default: FORUM_DEFAULT_SECTION },
});

const emit = defineEmits([
  'update:section',
  'island-message',
  // 发布会话开关（ForumMain 的 isMobileComposerOpen → 外层左栏用）
  'composer-state',
  'switch-tab',
  'open-follow-modal',
  'section-change',
]);

const section = computed(() => resolveForumSection(props.section));
const isFeedSection = computed(() => isForumFeedSection(section.value));
const externalFeed = computed(() => resolveExternalFeed(section.value));

const forumViewRef = ref(null);
// 官方分区惰性挂载：访问过才渲染插槽（英雄区渲染层因此不进首屏）
const officialVisited = ref(false);

/* 首屏 feed 预发（A1，2026-11-16）：本壳是首页 `/` 与 user-space「方块」两个宿主的
   **共同父级**，在这里（setup 同步体）发，等于「宿主 chunk 一到就发」，比等
   AsyncForum chunk 下载 + 解析完、ForumMain 挂载之后才发，早一整段。
   实测第一条数据请求与 ForumMain chunk 完成只差 30–40ms ⇒ 提前的正是那段空窗。
   只在默认分区（最新）预发：关注 / 新闻 / 活动 / 影集会带不同筛选参数，key 不一致，
   预发等于白打一笔（`buildForumFeedParams` 的默认值只覆盖默认分区）。 */
if (section.value === FORUM_DEFAULT_SECTION) prefetchForumFirstPage();

// 最新/关注/新闻/活动互切：内容做一次轻淡入脉冲（配合页签弹性指示条）
const feedSwitchPulse = ref(false);
let feedPulseTimer = null;
const pulseFeed = () => {
  feedSwitchPulse.value = true;
  if (feedPulseTimer) clearTimeout(feedPulseTimer);
  feedPulseTimer = setTimeout(() => {
    feedSwitchPulse.value = false;
  }, 360);
};

// ============================================
// 分区副作用
// ============================================
const selectSection = (next) => {
  const target = resolveForumSection(next);
  if (target === section.value) return;
  emit('update:section', target);
};

watch(
  section,
  (next) => {
    if (next === 'official') officialVisited.value = true;
    if (isForumFeedSection(next)) pulseFeed();
    emit('section-change', next);
  },
  { immediate: true },
);

/** 供外层使用的嵌入论坛入口（ForumMain 通过 defineExpose 暴露这些方法） */
const callForumView = (method) => {
  const view = forumViewRef.value;
  if (!view || typeof view[method] !== 'function') return false;
  view[method]();
  return true;
};

defineExpose({
  refreshEmbeddedScroll: () => forumViewRef.value?.refreshEmbeddedScroll?.(),
  openComposer: () => callForumView('openComposer'),
  focusSearch: () => callForumView('focusSearch'),
  // closeComposer 是异步的（有改动内容时要先弹「保存草稿」确认），故单独转发
  closeComposer: () => {
    const view = forumViewRef.value;
    if (!view || typeof view.closeComposer !== 'function') return Promise.resolve();
    return view.closeComposer();
  },
});

onBeforeUnmount(() => {
  if (feedPulseTimer) {
    clearTimeout(feedPulseTimer);
    feedPulseTimer = null;
  }
});
</script>

<style scoped>
.forum-section-shell {
  width: 100%;
}

.forum-section-feed,
.forum-section-official {
  width: 100%;
}

/* 分区切换轻淡入脉冲（原 UserSpace 社区壳同款） */
.forum-section-shell.feed-switching .forum-section-feed {
  animation: forumSectionFeedPulse 360ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes forumSectionFeedPulse {
  from {
    opacity: 0.72;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .forum-section-shell.feed-switching .forum-section-feed {
    animation: none;
  }
}
</style>
