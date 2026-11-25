<template>
  <!-- 模块内页签：设置页式的卡片行（2026-11-25，plans/048 期 1）
       ── 为什么不用横向 chips ────────────────────────────────────────
       原来这里是 54 个页签塞进一条 overflow-x 的 chips 条（`.g-module-tabs`），
       1440 宽就已经看不全，抽奖 10 个、AI 配置 7 个只能横滚。
       改成竖排行之后每行能承载「叫什么 + 有多少 + 有没有事要做」三件事，
       且与设置页（`.gs-group > .gs-rows`）同一套视觉语言。

       ── 视觉规格全部来自 settings-glass.css，不在这里新造 ────────────
       卡片底 / 描边 / 圆角 / 行高 / 发丝线内缩都由下面的 `--tab-*` 变量给出，
       值与 settings-glass.css 的行几何一致（44px 行、18px 左内距、13px 图标间距）。
       ⚠️ 刻意**不 import** settings-glass.css：那个文件是经
          `ProfileSettingsPanel.vue` 的 `<style scoped> @import` 引入的，编译后规则
          带的是父组件的 data-v，作用不到本组件（同类坑见 SettingsSubpageHeader.vue 头部）。
          所以这里复制的是**数值**，不是规则 —— 改设置页行高时本文件要跟着看。 -->
  <div class="tab-list" role="tablist" :aria-label="ariaLabel">
    <div class="tab-list-rows">
      <button
        v-for="tabId in tabIds"
        :key="tabId"
        type="button"
        role="tab"
        class="tab-row"
        :class="{ 'is-active': currentTab === tabId }"
        :aria-selected="currentTab === tabId"
        @click="$emit('select', tabId)"
      >
        <span class="tab-row-main">
          <span class="tab-row-label">{{ labelOf(tabId) }}</span>
          <span v-if="badgeOf(tabId)" class="tab-row-badge">{{ badgeOf(tabId) }}</span>
        </span>
        <ChevronRight :size="15" :stroke-width="2" class="tab-row-chevron" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * AdminTabList —— 一个模块内部的页签列表（设置页式卡片行）。
 *
 * 单一职责：只负责「把一个 tabId 数组渲染成可点的行」。
 * 它不知道 tab 属于哪个模块、也不自己查权限 —— 全都由宿主传进来，
 * 这样它既能用在数据管理面板，也能用在独立控制台壳里。
 */
import { ChevronRight } from 'lucide-vue-next';

const props = defineProps({
  /** 当前模块的页签 id 数组（顺序即显示顺序） */
  tabIds: { type: Array, required: true },
  /** 当前选中的页签 id */
  currentTab: { type: String, default: '' },
  /** tabId → 中文名的解析函数（宿主持有 `tabs` 定义，这里不重复一份） */
  getTabLabel: { type: Function, required: true },
  /**
   * tabId → 角标文案（如「12 条待处理」）。
   * 返回空值时不出角标。宿主没这份数据时整个 prop 不传即可。
   */
  getTabBadge: { type: Function, default: null },
  ariaLabel: { type: String, default: '子表切换' },
});

defineEmits(['select']);

const labelOf = (tabId) => {
  const label = props.getTabLabel(tabId);
  return label || tabId;
};

const badgeOf = (tabId) => {
  if (typeof props.getTabBadge !== 'function') return '';
  const value = props.getTabBadge(tabId);
  return value === 0 || value === null || value === undefined ? '' : String(value);
};
</script>

<style scoped>
/* 行几何单点：改这里就是改所有行（与 settings-glass.css 的 .gs-rows 数值对齐） */
.tab-list {
  --tab-row-pad-x: 18px;
  --tab-row-gap: 13px;
  /* 发丝线内缩量 = 左内距 + 图标槽 30px + 间距；本组件没有图标槽，所以只内缩到文字起始处。
     ⚠️ 与设置页不同：设置页的行有 30px 彩色图标，线要内缩到图标右侧（61px）。
        本列表无图标，内缩量 = 左内距（18px），否则线会从行中间开始，看着像断了一截。 */
  --tab-row-inset: var(--tab-row-pad-x);
  margin-bottom: 12px;
}

.tab-list-rows {
  display: flex;
  flex-direction: column;
  background: var(--liquid-bg-strong, rgba(255, 255, 255, 0.84));
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
  border: 1px solid var(--border);
  border-radius: var(--liquid-radius-md, 12px);
  box-shadow: var(--liquid-shadow-sm);
  overflow: hidden;
}

.tab-row {
  position: relative;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--tab-row-gap);
  width: 100%;
  min-height: 44px;
  padding: 6px var(--tab-row-pad-x);
  border: 0;
  background: transparent;
  color: var(--muted-foreground);
  font-family: inherit;
  font-size: 0.86rem;
  font-weight: 500;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.tab-row:hover {
  background: rgba(15, 23, 42, 0.035);
  color: var(--foreground);
}

.tab-row:active {
  background: rgba(15, 23, 42, 0.06);
}

/* 发丝线内缩到文字起始处（设置页同一口径，不用 border） */
.tab-row + .tab-row::before {
  content: '';
  position: absolute;
  top: 0;
  left: var(--tab-row-inset);
  right: 0;
  height: 1px;
  background: var(--border);
  opacity: 0.55;
  pointer-events: none;
}

.tab-row-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.tab-row-label {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 角标：数字比红点更该看见「有几条」，与侧栏 .g-nav-badge 同语义 */
.tab-row-badge {
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(252, 44, 80, 0.12);
  color: var(--primary);
  font-size: 0.7rem;
  font-weight: 600;
  line-height: 1.6;
}

.tab-row-chevron {
  flex: 0 0 auto;
  opacity: 0.35;
  transition: opacity 0.15s ease;
}

.tab-row:hover .tab-row-chevron {
  opacity: 0.6;
}

/* 选中：中性淡染 + 左缘蓝条 + 加粗（设置页 .gs-nav-item.active 的三通道口径）
   ⚠️ 不能只靠底色 —— 玻璃底上淡染几乎看不见（AGENTS.md 记过「加了 class 但看不出选中」）。 */
.tab-row.is-active {
  background: rgba(15, 23, 42, 0.055);
  color: var(--foreground);
  font-weight: 600;
}

.tab-row.is-active::after {
  content: '';
  position: absolute;
  left: 1px;
  top: 50%;
  width: 3px;
  height: 16px;
  margin-top: -8px;
  border-radius: 2px;
  background: var(--primary);
}

/* 暗色：玻璃底换成深色，否则白卡在暗色页面上刺眼 */
:global([data-theme='dark']) .tab-list-rows {
  background: var(--card);
  border-color: var(--border);
}

:global([data-theme='dark']) .tab-row:hover {
  background: var(--liquid-border-hairline);
}

:global([data-theme='dark']) .tab-row:active {
  background: var(--liquid-border);
}

:global([data-theme='dark']) .tab-row.is-active {
  background: var(--liquid-border);
}
</style>
