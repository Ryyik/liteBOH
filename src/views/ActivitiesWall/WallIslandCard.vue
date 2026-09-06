<script setup>
/**
 * WallIslandCard — 「活动&方块墙」全局导航栏自定义岛（showIsland.custom 槽位）
 * 由 UnifiedNavbar 的 .island-custom-host 渲染，内容高度自动上报撑开导航 surface。
 *
 * 布局约定：
 * - 活动 tab：分段切换居中；
 * - 方块墙 tab：切换自动靠左，右侧让位给 计数 / 刷新 / 贴一张。
 * 状态与动作回调由宿主页面（ActivitiesWall）通过 props 注入。
 */
import { Plus, RefreshCw } from "lucide-vue-next";

defineProps({
  tab: { type: String, default: "activities" },
  count: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
  changeTab: { type: Function, default: null },
  refresh: { type: Function, default: null },
  compose: { type: Function, default: null }
});
</script>

<template>
  <div class="wall-island-card" :class="{ 'is-wall': tab === 'wall' }">
    <!-- 分段切换：活动态居中，方块墙态靠左 -->
    <div class="wi-switch" role="tablist" aria-label="活动与方块墙切换">
      <span class="wi-switch-thumb" :class="{ right: tab === 'wall' }" aria-hidden="true"></span>
      <button
        type="button"
        role="tab"
        :aria-selected="tab === 'activities'"
        :class="{ active: tab === 'activities' }"
        @click="changeTab?.('activities')"
      >
        活动
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="tab === 'wall'"
        :class="{ active: tab === 'wall' }"
        @click="changeTab?.('wall')"
      >
        方块墙
      </button>
    </div>

    <!-- 方块墙操作区：仅方块墙 tab 展示 -->
    <Transition name="wi-fade">
      <div v-show="tab === 'wall'" class="wi-actions">
        <span class="wi-count">{{ count }} 份故事</span>
        <button
          type="button"
          class="wi-btn"
          :disabled="loading"
          aria-label="刷新方块墙"
          title="刷新"
          @click="refresh?.()"
        >
          <RefreshCw :size="16" :class="{ spinning: loading }" />
        </button>
        <button type="button" class="wi-cta" @click="compose?.()">
          <Plus :size="16" aria-hidden="true" />
          <span>贴一张</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.wall-island-card {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 52px;
  padding: 0 12px 4px;
}

.wall-island-card.is-wall {
  justify-content: flex-start;
}

/* ---- 分段切换 ---- */
.wi-switch {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  flex: 0 0 auto;
  padding: 3px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.05);
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.06);
}

.wi-switch button {
  position: relative;
  z-index: 1;
  height: 32px;
  padding: 0 20px;
  border: 0;
  background: transparent;
  border-radius: 999px;
  font-size: 13.5px;
  font-weight: 650;
  color: #64748b;
  cursor: pointer;
  transition: color 0.2s ease;
  -webkit-tap-highlight-color: transparent;
  white-space: nowrap;
}

.wi-switch button.active {
  color: #1d1d1f;
}

.wi-switch button:focus-visible {
  outline: 2px solid #94a3b8;
  outline-offset: 2px;
}

.wi-switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: calc(50% - 3px);
  height: calc(100% - 6px);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    0 2px 6px rgba(15, 23, 42, 0.14);
  transition: transform 0.35s cubic-bezier(0.22, 0.95, 0.36, 1);
}

.wi-switch-thumb.right {
  transform: translateX(100%);
}

/* ---- 方块墙操作区 ---- */
.wi-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.wi-count {
  font-size: 12.5px;
  font-weight: 650;
  color: #9a8575;
  white-space: nowrap;
}

.wi-btn {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(120, 90, 65, 0.08);
  color: #6b5647;
  cursor: pointer;
  transition: transform 0.2s ease, background 0.2s ease;
}

.wi-btn:hover { background: rgba(120, 90, 65, 0.15); transform: translateY(-1px); }
.wi-btn:active { transform: translateY(0); }
.wi-btn:disabled { cursor: default; opacity: 0.6; transform: none; }

.wi-cta {
  height: 34px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: #e07a5f;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 3px 0 #b85c44, 0 5px 10px rgba(160, 80, 55, 0.18);
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.2s ease;
}

.wi-cta:hover { background: #d86e52; transform: translateY(-1px); box-shadow: 0 4px 0 #b85c44, 0 8px 14px rgba(160, 80, 55, 0.22); }
.wi-cta:active { transform: translateY(2px); box-shadow: 0 1px 0 #b85c44, 0 3px 6px rgba(160, 80, 55, 0.18); }

.wi-btn:focus-visible,
.wi-cta:focus-visible {
  outline: 2px solid #c8794c;
  outline-offset: 2px;
}

/* 操作区展开/收起 */
.wi-fade-enter-active { transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.22, 0.95, 0.36, 1); }
.wi-fade-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.wi-fade-enter-from { opacity: 0; transform: translateX(10px); }
.wi-fade-leave-to { opacity: 0; transform: translateX(6px); }

.spinning {
  animation: wi-spin 0.9s linear infinite;
}

@keyframes wi-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 480px) {
  .wi-count { display: none; }
  .wi-switch button { padding: 0 14px; font-size: 13px; }
  .wi-cta span { display: none; }
  .wi-cta { padding: 0 11px; }
}

@media (prefers-reduced-motion: reduce) {
  .wi-switch-thumb,
  .wi-fade-enter-active,
  .wi-fade-leave-active,
  .spinning {
    transition: none;
    animation: none;
  }
}
</style>
