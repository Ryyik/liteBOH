<template>
  <!-- 竖屏整页目录（plans/049 期 1，2026-11-25）
       ── 它替代了什么 ────────────────────────────────────────────────
       「侧拉面板切页面」：原来是 `.g-sidebar` 在窄屏 `position: fixed` +
       `translateX(-100%)` 加遮罩滑出来（responsive.css:1371 / AdminSidebar.vue:1144），
       32 行挤在一个 302px 的抽屉里、组内还是手风琴。
       现在改成**一页一层**：目录（8 组）→ 组内行 → 子页，
       每层都是完整的一页，靠顶部返回条退出。与「我」页设置完全同构。

       ── 为什么不是给 AdminSidebar 加个 variant ──────────────────────
       抽屉与整页的差别不止定位：抽屉要遮罩、要 Esc 关闭、要滚动锁、组内是手风琴；
       整页要返回条、要面包屑式标题、要「点一行就换页」而不是展开。
       硬塞进一个组件会让 `isOpen / isExpanded` 这两套状态互相打架
       （抽屉展开着被切成整页时，手风琴的 Set 还留着）。
       拆开，让 AdminSidebar 保持桌面侧栏的单一职责。
  -->
  <div class="admin-nav-pages">
    <!-- 页头：第一层是「数据管理」标题；进层后换成圆形返回 + 当前层标题。
         骨架构图与设置页 SettingsSubpageHeader 一致（52px 返回列 / 1fr 标题 / 52px 动作列），
         但**不复用那个组件**：它的样式挂在 .gs-inline-bar 上、吸顶偏移读的是
         --userspace-nav-h，后台没有这个变量（hideNavbar，--dm-nav-height: 0）。 -->
    <header class="ap-bar">
      <button
        v-if="navPath.length"
        type="button"
        class="ap-back"
        :aria-label="`返回${parentTitle}`"
        :title="`返回${parentTitle}`"
        @click="goBack"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          aria-hidden="true"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </button>
      <span v-else class="ap-bar-spacer" aria-hidden="true"></span>
      <h1 class="ap-title">{{ currentTitle }}</h1>
      <span class="ap-bar-spacer" aria-hidden="true"></span>
    </header>

    <!-- 搜索：与设置页同一个位置和语义（搜到什么就直接去，不必先找分组） -->
    <div class="ap-search" role="search">
      <SearchIcon :size="15" class="ap-search-icon" aria-hidden="true" />
      <input
        v-model="searchQuery"
        type="search"
        class="ap-search-input"
        placeholder="搜索功能"
        aria-label="搜索后台功能"
        enterkeyhint="search"
        autocomplete="off"
      />
      <button
        v-if="searchQuery"
        type="button"
        class="ap-search-clear"
        aria-label="清除搜索"
        @click="searchQuery = ''"
      >
        ✕
      </button>
    </div>

    <!-- 搜索结果：跨层平铺，命中即去 -->
    <template v-if="isSearching">
      <div v-if="searchResults.length" class="ap-rows">
        <button
          v-for="(hit, idx) in searchResults"
          :key="hit.key"
          type="button"
          class="ap-row"
          :class="{ 'is-denied': hit.denied }"
          :aria-disabled="hit.denied ? 'true' : undefined"
          @click="onSearchHit(hit, idx)"
        >
          <span class="ap-row-text">
            <span class="ap-row-label">{{ hit.label }}</span>
            <span class="ap-row-sub">{{ hit.pathLabels }}</span>
          </span>
          <Lock v-if="hit.denied" :size="13" class="ap-lock" aria-hidden="true" />
          <ChevronRight v-else :size="15" class="ap-chevron" aria-hidden="true" />
        </button>
      </div>
      <p v-else class="ap-empty">没有匹配的功能</p>
    </template>

    <!-- 层级列表：每层一张卡，行与行之间内缩发丝线（设置页 .gs-row 同款） -->
    <template v-else>
      <div v-if="currentRows.length" class="ap-rows">
        <button
          v-for="row in currentRows"
          :key="row.id"
          type="button"
          class="ap-row"
          :class="{
            'is-active': activeRowId === row.id,
            'is-denied': !!row.denied,
            'has-children': hasChildren(row),
          }"
          :aria-disabled="row.denied ? 'true' : undefined"
          :aria-current="activeRowId === row.id ? 'page' : undefined"
          @click="onRowActivate(row)"
        >
          <span class="ap-row-text">
            <span class="ap-row-label">{{ row.label }}</span>
          </span>
          <Lock v-if="row.denied" :size="13" class="ap-lock" aria-hidden="true" />
          <template v-else-if="hasChildren(row)">
            <span class="ap-count">{{ row.children.length }}</span>
            <ChevronRight :size="15" class="ap-chevron" aria-hidden="true" />
          </template>
          <!-- 叶子行：只有「不是当前页」时才给箭头。
               ⚠️ 当前页不给箭头 —— 箭头在这一层的意思是「点进去还有一层」，
                  而「你已经在这一页」用左侧蓝条 + 淡染表达就够了。
                  两个信号同时出现会让人以为点当前行还能再深一层（实测第一版截图
                  就是这样：「用户」行既高亮又带箭头，看不出自己已经到了）。 -->
          <ChevronRight
            v-else-if="activeRowId !== row.id"
            :size="15"
            class="ap-chevron"
            aria-hidden="true"
          />
          <span v-else class="ap-current" aria-label="当前页">当前</span>
        </button>
      </div>
      <p v-else class="ap-empty">这一层没有可用的入口</p>
    </template>

    <!-- 第一层的分区待办：放在组卡片下方，与设置页「卡下脚注」同一位置语义 -->
    <p v-if="!isSearching && !navPath.length && groupBadgeTotal > 0" class="ap-footnote">
      有 {{ groupBadgeTotal }} 项待办分布在以上分区
    </p>
  </div>
</template>

<script setup>
/**
 * 竖屏整页目录 —— 三层钻取。
 *
 * 状态只有两个 ref：
 *   · `navPath`      当前身处哪一层（容器 id 栈，最多 2 层，与 admin-tab-groups 的守卫一致）
 *   · `searchQuery`  搜索关键词
 * 层级**不写 URL**：与设置页同一口径（那边二级页也是纯内存态，
 * 见 ProfileSettingsPanel 的 openEntry）。理由：切一层只是「翻目录」，
 * 不是「打开一页数据」—— 写 URL 会让浏览器返回键在目录层级里打转，
 * 而用户按返回期望的是「回上一页数据」。
 *
 * ⚠️ 内容页的切换才走 URL（?tab=），那是真的「在哪一页」。
 */
import { computed, ref, watch } from 'vue';
import { ChevronRight, Lock, Search as SearchIcon } from 'lucide-vue-next';
import {
  NAV_GROUPS,
  resolveNavContainer,
  resolveNavAncestryForRow,
  resolveNavRowIdForModule,
  resolveNavRowIdForTab,
} from '../config/nav-groups.js';
import { searchAdminFunctions } from '../config/function-index.js';

const props = defineProps({
  /** 分组结构（DataAdmin 的 navGroups：已补 denied 与 groupId） */
  groups: { type: Array, default: () => [] },
  /** 当前高亮行 id */
  activeRowId: { type: String, default: '' },
  /** 分区待办角标（buildGroupBadges 的产物） */
  groupBadges: { type: Object, default: () => ({}) },
  /** 功能索引（侧栏与 ⌘K 共用同一份） */
  functions: { type: Array, default: () => [] },
});

const emit = defineEmits(['navigate', 'denied']);

const SEARCH_LIMIT = 20;

/** 容器 id 栈：`[]` = 目录首页（8 个分区） */
const navPath = ref([]);
const searchQuery = ref('');

/* 分组结构优先用宿主传入的（它带 denied / groupId），
   宿主没传时退回静态真源 —— 保证组件单独挂载也不会白屏。 */
const sourceGroups = computed(() => (props.groups.length ? props.groups : NAV_GROUPS));

const hasChildren = (row) => Array.isArray(row?.children) && row.children.length > 0;

/** 当前层要渲染的行 */
const currentRows = computed(() => {
  const path = navPath.value;
  if (!path.length) {
    // 第一层：分区。用行渲染而不是组头 + 卡片，因为整页模式下
    // 「点一下换一页」才是主交互，组头不可点会让人以为那是标题。
    return sourceGroups.value.map((group) => ({
      id: group.id,
      label: group.label,
      kind: 'group-container',
      badge: groupBadge(group.id),
      children: group.rows,
    }));
  }
  const container = resolveNavContainer(path[path.length - 1]);
  if (!container) return [];
  // 容器里若有 child 级行，把源数据里的 denied 一并带过来（resolveNavContainer 读的是静态真源）
  return container.rows.map((row) => withDenied(row, path[path.length - 1]));
});

/**
 * 静态真源里的行没有 denied（那是宿主按角色算的），进层后要补上。
 * 否则「进组之后所有行看起来都能点」， Независимо от roles。
 */
const deniedRowIds = computed(() => {
  const set = new Set();
  const walk = (rows) => {
    rows.forEach((row) => {
      if (row.denied) set.add(row.id);
      if (hasChildren(row)) walk(row.children);
    });
  };
  sourceGroups.value.forEach((group) => walk(group.rows || []));
  return set;
});

const withDenied = (row, containerId) => {
  // 先在宿主传进来的结构里找同 id 的行（保留 denied / groupId 等宿主补充字段）
  const findIn = (rows) => {
    for (const item of rows) {
      if (item.id === row.id) return item;
      if (hasChildren(item)) {
        const found = findIn(item.children);
        if (found) return found;
      }
    }
    return null;
  };
  for (const group of sourceGroups.value) {
    if (group.id === containerId) {
      const hit = findIn(group.rows || []);
      if (hit) return hit;
    }
  }
  return deniedRowIds.value.has(row.id) ? { ...row, denied: true } : row;
};

const currentTitle = computed(() => {
  const path = navPath.value;
  if (!path.length) return '数据管理';
  const container = resolveNavContainer(path[path.length - 1]);
  return container?.label || '数据管理';
});

const parentTitle = computed(() => {
  const path = navPath.value;
  if (path.length <= 1) return '数据管理';
  const container = resolveNavContainer(path[path.length - 2]);
  return container?.label || '数据管理';
});

const groupBadge = (groupId) => {
  const value = props.groupBadges?.[groupId];
  if (value === true) return true;
  const count = Number(value || 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
};

/** 分区待办总数：只统计数字型角标，`true`（只知道有）不计入 */
const groupBadgeTotal = computed(() =>
  sourceGroups.value.reduce((sum, group) => {
    const badge = groupBadge(group.id);
    return sum + (typeof badge === 'number' ? badge : 0);
  }, 0),
);

/* ── 搜索 ───────────────────────────────────────────────────────────
   索引复用侧栏那份（function-index），避免「同一个词在两个入口给出两种结论」。
   命中项的路径链由 resolveNavAncestryForRow 反查 —— 搜到就能说出「它在哪一层」。 */
const isSearching = computed(() => searchQuery.value.trim().length > 0);

const rowById = computed(() => {
  const map = new Map();
  const walk = (rows) => {
    rows.forEach((row) => {
      map.set(row.id, row);
      if (hasChildren(row)) walk(row.children);
    });
  };
  sourceGroups.value.forEach((group) => walk(group.rows || []));
  return map;
});

/**
 * 功能索引的条目没有 `rowId`（它按「落点」组织，不是按导航行），
 * 所以路径链要在这里按 kind 反查：
 *   · tab     → resolveNavRowIdForTab（被融合的旧页签会落到它被并进的那一行）
 *   · module  → resolveNavRowIdForModule（4 个装修控制台收在「视觉装修」子页里）
 *   · section → 它本身就在某个分区下，但 section 不是 nav 行，只能靠分区名兜底
 */
const searchResults = computed(() => {
  if (!isSearching.value) return [];
  return searchAdminFunctions(props.functions, searchQuery.value, { limit: SEARCH_LIMIT }).map(
    (hit) => {
      let rowId = '';
      if (hit.kind === 'tab') rowId = resolveNavRowIdForTab(hit.id);
      else if (hit.kind === 'module') rowId = resolveNavRowIdForModule(hit.id);
      const anc = rowId ? resolveNavAncestryForRow(rowId) : [];
      const labels = anc
        .map((id) => {
          const fromGroups = sourceGroups.value.find((g) => g.id === id);
          if (fromGroups) return fromGroups.label;
          return rowById.value.get(id)?.label || '';
        })
        .filter(Boolean);
      return { ...hit, rowId, pathLabels: labels.join(' › ') || hit.moduleLabel || '' };
    },
  );
});

/* ── 交互 ─────────────────────────────────────────────────────────── */
const onRowActivate = (row) => {
  if (!row) return;
  if (row.denied) {
    emit('denied', { id: row.moduleId || row.tabId || row.id, label: row.label });
    return;
  }
  // 分区容器 / 有子页的行 ⇒ 进下一层；叶子 ⇒ 交给宿主导航
  if (row.kind === 'group-container' || hasChildren(row)) {
    navPath.value = [...navPath.value, row.id];
    return;
  }
  emit('navigate', row);
};

const goBack = () => {
  navPath.value = navPath.value.slice(0, -1);
};

const onSearchHit = (hit, idx) => {
  if (!hit) return;
  if (hit.denied) {
    emit('denied', { id: hit.moduleId || hit.id, label: hit.label });
    return;
  }
  searchQuery.value = '';
  // 搜索结果是一条「落点」，直接交给宿主；落点类型由 function-index 的 kind 表达
  emit('navigate', {
    id: hit.rowId || hit.id,
    label: hit.label,
    kind: hit.kind === 'tab' ? 'tab' : hit.kind === 'module' ? 'module' : 'section',
    tabId: hit.kind === 'tab' ? hit.id : undefined,
    moduleId: hit.kind === 'module' ? hit.id : undefined,
    section: hit.kind === 'section' ? hit.id : undefined,
    __fromSearch: true,
    __index: idx,
  });
};

/* ── 打开目录时回到首页 ─────────────────────────────────────────────
   ⚠️ 刻意**不**按 activeRowId 自动钻进当前组（本组件第一版是那样写的，
      探针实测：从 `?tab=users` 深链进来打开目录，看到的是「用户」组的 4 行，
      而不是 8 个分区）—— 那是错的语义。
      用户点「导航」的意图是「我要去别的地方」，不是「给我看我现在在哪」。
      当前所在分区用**高亮**表达（is-active 那套三通道），不用「直接进入」表达。
      设置页同一口径：点「设置」进的是组列表，不是上次停留的那一组。
   所以 navPath 只由用户点击推进，不随 activeRowId 变化。 */

defineExpose({
  /** 打开目录时调用：回到第一层（8 个分区） */
  resetPath: () => {
    navPath.value = [];
    searchQuery.value = '';
  },
});

// 搜索时展开层级没有意义（结果是平铺的），清掉避免退出搜索后停在意外的一层
watch(isSearching, (on) => {
  if (on) navPath.value = [];
});
</script>

<style scoped>
/* ══════════════════════════════════════════════════════════════════
   视觉规格逐项对齐设置页（ProfileSettingsPanel 的 .gs-* 一套）：
     卡片     --liquid-bg-strong + 16px 圆角 + 6px 内距 + 2px 行距
     行       44px 高 / 12px 18px 内距 / 无圆角（卡片圆角兜住两端）
     发丝线   行间内缩 18px（本组件行内没有图标槽，不必内缩到 61px）
     选中态   中性淡染 + 左缘 3px 蓝条 + 600 字重
   ⚠️ 不要用 .g-* 类名：那套是侧栏与表格的样式，`.g-nav-btn` 带着 36px 行高和
      平铺几何，混用会让两个视口的行高对不上（横屏 40 / 竖屏 44 是刻意的：
      竖屏手指命中区更大）。
   ══════════════════════════════════════════════════════════════════ */
.admin-nav-pages {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  min-height: calc(100dvh - var(--dm-nav-height, 0px));
  padding: 12px 16px calc(28px + env(safe-area-inset-bottom));
  box-sizing: border-box;
  background: var(--dm-bg, transparent);
}

/* ── 页头：52 / 1fr / 52 三列，与设置页子页头同一骨架 ── */
.ap-bar {
  display: grid;
  grid-template-columns: 44px 1fr 44px;
  align-items: center;
  min-height: 44px;
  gap: 4px;
}

.ap-bar-spacer {
  display: block;
  width: 44px;
}

.ap-back {
  width: 40px;
  height: 40px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--liquid-border, rgba(15, 23, 42, 0.08));
  border-radius: 50%;
  background: var(--liquid-bg-strong, rgba(255, 255, 255, 0.84));
  color: var(--liquid-text-primary, #1d1d1f);
  cursor: pointer;
  transition:
    transform 0.18s ease,
    background 0.18s ease;
}

.ap-back:active {
  transform: scale(0.94);
}

.ap-back svg {
  width: 18px;
  height: 18px;
}

/* 标题居中：设置页子页头就是居中，不是左对齐 —— 抽屉时代那个左对齐标题
   在整页里会像「页面标题」，而它在这一层其实是「你在哪」 */
.ap-title {
  grid-column: 2;
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
  color: var(--liquid-text-primary, #1d1d1f);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── 搜索 ── */
.ap-search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 12px;
  box-sizing: border-box;
  background: var(--liquid-bg-strong, rgba(255, 255, 255, 0.84));
  border: 1px solid var(--liquid-border, rgba(15, 23, 42, 0.08));
  border-radius: 12px;
}

.ap-search-icon {
  flex: 0 0 auto;
  color: var(--dm-muted, #6b7280);
}

.ap-search-input {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  /* 16px：iOS Safari 下小于 16px 会在聚焦时自动放大页面 */
  font-size: 16px;
  font-family: inherit;
}

.ap-search-input::-webkit-search-cancel-button {
  display: none;
}

.ap-search-clear {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.08);
  color: inherit;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}

/* ── 卡片与行 ── */
.ap-rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  background: var(--liquid-bg-strong, rgba(255, 255, 255, 0.84));
  border: 1px solid var(--liquid-border, rgba(15, 23, 42, 0.08));
  border-radius: var(--liquid-radius-md, 16px);
  overflow: hidden;
}

.ap-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 11px 12px;
  box-sizing: border-box;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--liquid-text-primary, #1d1d1f);
  font-size: 15px;
  line-height: 22px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.16s ease;
}

/* 行间发丝线：只在本行「前面还有一行」时出现，卡片首行不画
   （设置页 .gs-row + .gs-row::before 同一条口径） */
.ap-row + .ap-row::before {
  content: '';
  position: absolute;
  top: -1px;
  left: 12px;
  right: 12px;
  height: 1px;
  background: var(--liquid-border-hairline, rgba(15, 23, 42, 0.06));
  pointer-events: none;
}

.ap-row:active {
  background: rgba(15, 23, 42, 0.05);
}

/* 选中态三通道：淡染 + 左缘蓝条 + 加粗。
   ⚠️ 蓝条用 ::after —— ::before 已被行间发丝线占用，一个伪元素画不了两件事。 */
.ap-row.is-active {
  background: var(--rail-pill-bg, rgba(15, 23, 42, 0.075));
  font-weight: 600;
}

.ap-row.is-active::after {
  content: '';
  position: absolute;
  left: 2px;
  top: 50%;
  width: 3px;
  height: 16px;
  margin-top: -8px;
  border-radius: 2px;
  background: var(--sidebar-primary, #0071e3);
}

.ap-row.is-denied {
  opacity: 0.45;
}

.ap-row-text {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ap-row-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ap-row-sub {
  font-size: 12px;
  line-height: 16px;
  font-weight: 400;
  color: var(--dm-muted, #6b7280);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ap-chevron {
  flex: 0 0 auto;
  opacity: 0.32;
}

.ap-lock {
  flex: 0 0 auto;
  opacity: 0.6;
}

.ap-count {
  flex: 0 0 auto;
  min-width: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.06);
  color: var(--dm-muted, #6b7280);
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* 当前页标记：替换掉那一行的箭头（见模板注释）。
   用文字而不是图标 —— 设置页对「当前值」也是文字（`.gs-value`），
   一个勾/一个小圆点在这里都不如「当前」两个字直接。 */
.ap-current {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 400;
  color: var(--dm-muted, #6b7280);
  letter-spacing: 0.02em;
}

.ap-empty,
.ap-footnote {
  margin: 6px 4px 0;
  font-size: 12.5px;
  line-height: 18px;
  color: var(--dm-muted, #6b7280);
}

/* ── 暗色：本页暗色真源是 `.data-management-page[data-theme='dark']`
      （DataAdmin 自绑 + base.css:107），组件不读 html[data-theme]。
      但 scoped 样式选不到祖先上的属性 ⇒ 用 :global 抬一层，且**必须**带
      .data-management-page 前缀，理由同上。 ── */
:global(.data-management-page[data-theme='dark']) .ap-rows,
:global(.data-management-page[data-theme='dark']) .ap-search,
:global(.data-management-page[data-theme='dark']) .ap-back {
  background: rgba(38, 38, 42, 0.86);
  border-color: rgba(255, 255, 255, 0.1);
}

:global(.data-management-page[data-theme='dark']) .ap-title,
:global(.data-management-page[data-theme='dark']) .ap-row {
  color: #f5f5f7;
}

:global(.data-management-page[data-theme='dark']) .ap-row:active {
  background: rgba(255, 255, 255, 0.08);
}

:global(.data-management-page[data-theme='dark']) .ap-row.is-active {
  background: rgba(255, 255, 255, 0.12);
}

:global(.data-management-page[data-theme='dark']) .ap-row + .ap-row::before {
  background: rgba(255, 255, 255, 0.08);
}

:global(.data-management-page[data-theme='dark']) .ap-count {
  background: rgba(255, 255, 255, 0.12);
  color: #b8b8bd;
}

@media (min-width: 480px) {
  /* 大屏手机 / 竖屏平板：目录不要拉成通栏，读起来会散 */
  .admin-nav-pages {
    max-width: 560px;
    margin: 0 auto;
  }
}
</style>
