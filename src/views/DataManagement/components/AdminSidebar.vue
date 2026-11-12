<template>
  <aside :class="['g-sidebar', { open: isOpen }]" :aria-label="'网站管理导航'">
    <!-- Brand：点击回到概览 -->
    <button type="button" class="g-sidebar-brand is-clickable" title="回到站点概览" @click="goHome">
      <div class="g-sidebar-brand-mark" aria-hidden="true">B</div>
      <div class="g-sidebar-brand-copy">
        <strong>BOH Admin</strong>
        <span>站点数据工作台</span>
      </div>
    </button>

    <!-- Search pill：搜「功能」（页签 / 独立控制台页 / 系统子页）+ 过滤侧栏模块
         2026-11-12：此前只按 label/description 过滤 10 个模块，搜「积分发放」「补发」
         「头像框」一律「无匹配模块」—— 用户找功能的主路径整个缺失。 -->
    <div class="g-sidebar-search">
      <SearchIcon :size="14" class="g-search-icon" />
      <input
        v-model="localSearchQuery"
        type="text"
        placeholder="搜索功能 / 模块..."
        class="g-sidebar-search-input"
        aria-label="搜索功能或导航模块"
        @input="onSearchInput"
        @keydown.esc="clearSearch"
        @keydown.down.prevent="moveActive(1)"
        @keydown.up.prevent="moveActive(-1)"
        @keydown.enter.prevent="confirmActive"
      />
      <button
        v-if="localSearchQuery"
        type="button"
        class="g-sidebar-search-clear"
        @click="clearSearch"
        aria-label="清除搜索"
      >
        ×
      </button>
    </div>

    <div v-if="normalizedQuery" class="g-sidebar-search-status" role="status">
      <span v-if="functionMatchCount || matchCount">
        找到 {{ functionMatchCount }} 个功能<template v-if="matchCount">
          · {{ matchCount }} 个模块</template
        >
      </span>
      <span v-else>没有匹配的功能或模块</span>
      <kbd v-if="functionMatchCount" class="g-sidebar-search-hint">↵ 打开</kbd>
    </div>

    <!-- Navigation (grouped by section) -->
    <nav class="g-sidebar-nav" aria-label="管理导航">
      <!-- 功能命中排在最前：搜到功能名的人要的是「打开那一页」，不是「进某个模块再翻」 -->
      <div v-if="functionMatches.length" class="g-sidebar-group">
        <span class="g-sidebar-group-label">功能</span>
        <button
          v-for="(fn, idx) in functionMatches"
          :key="fn.key"
          type="button"
          :class="[
            'g-nav-btn',
            'g-nav-fn',
            { 'is-active': idx === activeFnIndex, 'is-denied': fn.denied },
          ]"
          :aria-disabled="fn.denied"
          :title="fn.denied ? `${fn.label}（当前角色无权限）` : `${fn.moduleLabel} › ${fn.label}`"
          @click="pickFunction(fn)"
          @mouseenter="activeFnIndex = idx"
        >
          <component
            :is="fn.iconComponent"
            v-if="fn.iconComponent"
            :size="15"
            class="g-nav-glyph"
          />
          <span v-else class="g-nav-glyph g-nav-fn-emoji" aria-hidden="true">{{
            fn.icon || '📄'
          }}</span>
          <span class="g-nav-label">{{ fn.label }}</span>
          <span class="g-nav-fn-module">{{ fn.moduleLabel }}</span>
          <Lock v-if="fn.denied" :size="12" class="g-nav-lock" aria-hidden="true" />
        </button>
      </div>

      <template v-for="group in groupedModules" :key="group.section">
        <div v-if="group.items.length" class="g-sidebar-group">
          <span class="g-sidebar-group-label">{{ group.label }}</span>
          <button
            v-for="mod in group.items"
            :key="mod.id"
            type="button"
            :class="['g-nav-btn', { 'is-active': isModuleActive(mod.id), 'is-denied': mod.denied }]"
            :aria-disabled="mod.denied"
            :title="mod.denied ? `${mod.label}（当前角色无权限）` : mod.description || mod.label"
            @click="selectModule(mod)"
          >
            <component :is="mod.icon" :size="16" class="g-nav-glyph" />
            <span class="g-nav-label">{{ mod.label }}</span>
            <Lock v-if="mod.denied" :size="12" class="g-nav-lock" aria-hidden="true" />
            <!-- 未保存草稿角标：数字比红点更该看见「有几条」，所以单开一格 -->
            <span
              v-if="badgeCount(mod.id)"
              class="g-nav-badge"
              :title="`${badgeCount(mod.id)} 条未保存草稿`"
              >{{ badgeCount(mod.id) }}</span
            >
            <span v-else-if="hasAlert(mod.id)" class="g-nav-dot" aria-hidden="true"></span>
          </button>
        </div>
      </template>
      <p v-if="normalizedQuery && !matchCount && !functionMatchCount" class="g-sidebar-empty">
        换个关键词试试（也可搜「补发」「banner」这类叫法）
      </p>
      <p v-if="!modules.length" class="g-sidebar-empty">暂无可用模块，请刷新重试</p>
    </nav>

    <!-- Quick actions
         ⚠️ 这两个按钮的语义绑定在「数据管理面板的当前列表」上（新增记录 / 刷新当前表格）。
         独立控制台页没有列表上下文，宿主必须传 :show-quick-actions="false" ——
         否则就是两个点了没反应、也没有提示的死按钮（2026-11-01 复核）。 -->
    <div v-if="showQuickActions" class="g-sidebar-quick">
      <button
        type="button"
        class="g-icon-btn is-sm"
        title="新增记录"
        @click="$emit('create-record')"
      >
        <Plus :size="14" />
      </button>
      <button
        type="button"
        class="g-icon-btn is-sm"
        title="刷新数据"
        @click="$emit('refresh-data')"
      >
        <RefreshCw :size="14" />
      </button>
      <span class="g-sidebar-quick-label">快捷操作</span>
    </div>

    <!-- Footer -->
    <div class="g-sidebar-foot">
      <span class="g-sidebar-dot" aria-hidden="true" />
      <span>BOH 数据管理 · v2.5</span>
    </div>
  </aside>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { Lock, Plus, RefreshCw, Search as SearchIcon } from 'lucide-vue-next';
import { SIDEBAR_SECTION_LABELS } from '../config/rbac.js';
import { searchAdminFunctions } from '../config/function-index.js';

const SECTION_ORDER = ['overview', 'data', 'system'];
/** 功能命中最多列几条：再多就把模块列表挤到看不见的地方，剩下的交给 ⌘K */
const FUNCTION_MATCH_LIMIT = 8;

const props = defineProps({
  activeModule: { type: String, required: true },
  modules: { type: Array, required: true },
  /**
   * 可搜索的「功能」清单（buildAdminFunctionIndex 的产物，宿主按角色算一次）。
   * 两个宿主（数据管理面板 / 独立控制台壳）都传；不传就退化成只过滤模块。
   */
  functions: { type: Array, default: () => [] },
  /** 当前角色无权访问的模块 id（置灰禁用，不断层隐藏，便于审计） */
  deniedIds: { type: Array, default: () => [] },
  isOpen: { type: Boolean, required: true },
  searchQuery: { type: String, default: '' },
  /**
   * 「审核」模块的小红点：待审核数量 > 0 时点亮。
   * ⚠️ 计数来自数据管理面板自己的查询，独立控制台页（AdminConsoleShell）没有这份数据
   * ⇒ 那四个页面上红点不会出现。它只是提示、不影响功能，别为此在壳里再拉一次统计。
   */
  hasUnmoderated: { type: Boolean, default: false },
  /**
   * 未保存草稿的模块级计数：`{ moduleId: count }`。
   * 只来自数据管理面板（草稿存在它的 localStorage 里），独立控制台页不传 ⇒ 不显示。
   */
  moduleBadges: { type: Object, default: () => ({}) },
  /**
   * 需要「亮红点」的模块 id（不含角标那种计数语义）：
   * 目前是审核待办（由 hasUnmoderated 表达）与抽奖到期未开奖（宿主传入）。
   */
  alertModules: { type: Array, default: () => [] },
  /**
   * 是否显示「快捷操作」区（新增记录 / 刷新数据）。
   * 两者的实现都在数据管理面板里（当前列表上下文）；没有列表的宿主传 false。
   */
  showQuickActions: { type: Boolean, default: true },
});

const emit = defineEmits([
  'module-click',
  'denied-click',
  'function-click',
  'update:searchQuery',
  'create-record',
  'refresh-data',
]);

const localSearchQuery = ref(props.searchQuery || '');
/** 键盘选中项（只作用于「功能」那一组） */
const activeFnIndex = ref(-1);

watch(
  () => props.searchQuery,
  (val) => {
    if (val !== localSearchQuery.value) localSearchQuery.value = val || '';
  },
);

const deniedSet = computed(() => new Set(props.deniedIds || []));
/** 未保存草稿计数：0 / 非法值一律当作无角标 */
const badgeCount = (moduleId) => {
  const count = Number(props.moduleBadges?.[moduleId] || 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
};
/** 红点是「有事要处理」的布尔语义：审核待办 + 宿主传入的告警模块 */
const alertSet = computed(() => new Set(props.alertModules || []));
const hasAlert = (moduleId) =>
  (moduleId === 'moderation' && props.hasUnmoderated) || alertSet.value.has(moduleId);
const normalizedQuery = computed(() => localSearchQuery.value.trim().toLowerCase());

const filteredModules = computed(() => {
  const q = normalizedQuery.value;
  const list = Array.isArray(props.modules) ? props.modules : [];
  const matched = q
    ? list.filter((mod) => `${mod.label || ''}${mod.description || ''}`.toLowerCase().includes(q))
    : list;
  return matched.map((mod) => ({ ...mod, denied: deniedSet.value.has(mod.id) }));
});

const matchCount = computed(() => filteredModules.value.length);

/**
 * 功能命中：搜「功能名 / 别名 / 模块名」都能命中页签、独立控制台页与系统子页。
 * 关键词为空时不出这一组（默认视图保持「模块导航」不变）。
 *
 * 已经被下面「模块」那一组筛出来的模块不在这里重复一遍 ——
 * 否则搜「积分」会看到两个「用户」（一次在功能组、一次在模块组），
 * 用户会以为这是两个不同的东西。只靠别名才命中的模块仍留在这里（模块组筛不出它）。
 */
const functionMatches = computed(() => {
  if (!normalizedQuery.value) return [];
  const shownModules = new Set(filteredModules.value.map((mod) => mod.id));
  return searchAdminFunctions(props.functions, localSearchQuery.value, {
    // 先多取几条再过滤：否则被过滤掉的模块会把名额占满，能搜到的功能反而变少
    limit: FUNCTION_MATCH_LIMIT + 4,
  })
    .filter((fn) => !(fn.kind === 'module' && shownModules.has(fn.id)))
    .slice(0, FUNCTION_MATCH_LIMIT);
});
const functionMatchCount = computed(() => functionMatches.value.length);

// 关键词一变，键盘选中项回到第一条（否则会停在上一次的下标上，Enter 打开意外的东西）
watch(localSearchQuery, () => {
  activeFnIndex.value = -1;
});

const groupedModules = computed(() =>
  SECTION_ORDER.map((section) => ({
    section,
    label: SIDEBAR_SECTION_LABELS[section] || section,
    items: filteredModules.value.filter((mod) => (mod.section || 'data') === section),
  })),
);

const isModuleActive = (modId) => props.activeModule === modId;

const onSearchInput = () => {
  emit('update:searchQuery', localSearchQuery.value);
};

const clearSearch = () => {
  localSearchQuery.value = '';
  activeFnIndex.value = -1;
  emit('update:searchQuery', '');
};

const pickFunction = (fn) => {
  if (!fn) return;
  // 跳过去之后把关键词清掉：否则侧栏一直停在过滤态，刚打开的功能还是看不见高亮
  localSearchQuery.value = '';
  activeFnIndex.value = -1;
  emit('update:searchQuery', '');
  emit('function-click', fn);
};

/** ↑/↓ 在「功能」命中里移动；到底/到顶回绕。没有命中时不吞键。 */
const moveActive = (delta) => {
  const len = functionMatches.value.length;
  if (!len) return;
  const current = activeFnIndex.value;
  activeFnIndex.value =
    delta > 0 ? (current >= len - 1 ? 0 : current + 1) : current <= 0 ? len - 1 : current - 1;
};

/** ↵ 打开当前选中项；还没用 ↑↓ 选过就默认第一条（搜完直接回车是最常见的动作） */
const confirmActive = () => {
  const list = functionMatches.value;
  if (!list.length) return;
  pickFunction(list[activeFnIndex.value >= 0 ? activeFnIndex.value : 0]);
};

const selectModule = (mod) => {
  if (mod.denied) {
    emit('denied-click', mod);
    return;
  }
  emit('module-click', mod);
};

const goHome = () => {
  const overview = (props.modules || []).find((mod) => mod.id === 'overview');
  selectModule(overview || { id: 'overview', label: '概览' });
};
</script>

<style scoped>
/* Sidebar shell — 透明液态玻璃侧栏 */
.g-sidebar {
  position: sticky;
  top: var(--dm-nav-height);
  height: calc(100vh - var(--dm-nav-height));
  height: calc(100dvh - var(--dm-nav-height));
  background: var(--dm-liquid-sidebar, rgba(240, 246, 255, 0.6));
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
  color: var(--sidebar-foreground);
  border-right: 1px solid var(--sidebar-border);
  padding: calc(var(--spacing) * 4);
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 3);
  z-index: 1002;
  overflow: hidden;
  width: var(--dm-sidebar-width);
  flex: 0 0 var(--dm-sidebar-width);
}

/* Brand */
.g-sidebar-brand {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 3);
  padding: calc(var(--spacing) * 1) 0 calc(var(--spacing) * 2);
  border-bottom: 1px solid var(--sidebar-border);
  flex: 0 0 auto;
}
.g-sidebar-brand.is-clickable {
  border-top: none;
  border-left: none;
  border-right: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  width: 100%;
}
.g-sidebar-brand-mark {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: var(--sidebar-primary);
  color: var(--sidebar-primary-foreground);
  font-weight: 600;
  font-size: 0.9rem;
  flex: 0 0 32px;
}
.g-sidebar-brand-copy {
  display: grid;
  gap: 1px;
  min-width: 0;
  line-height: 1.2;
}
.g-sidebar-brand-copy strong {
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--sidebar-foreground);
}
.g-sidebar-brand-copy span {
  font-size: 0.7rem;
  color: var(--muted-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Search */
.g-sidebar-search {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  height: 32px;
  padding: 0 calc(var(--spacing) * 3);
  border: 1px solid var(--input);
  border-radius: 999px;
  background: var(--card);
  color: var(--foreground);
  transition: border-color 0.2s ease;
  flex: 0 0 auto;
}
.g-sidebar-search:focus-within {
  border-color: var(--primary);
}
.g-sidebar-search .g-search-icon {
  color: var(--muted-foreground);
  flex: 0 0 14px;
}
.g-sidebar-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.8rem;
  min-width: 0;
}
.g-sidebar-search-input::placeholder {
  color: var(--muted-foreground);
}
.g-sidebar-search-clear {
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}

/* Search status */
.g-sidebar-search-status {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  padding: calc(var(--spacing) * 2) calc(var(--spacing) * 3);
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--muted-foreground);
  border-radius: var(--radius);
  font-size: 0.74rem;
  flex: 0 0 auto;
}

/* Nav list (grouped) */
.g-sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 3);
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}
.g-sidebar-nav::-webkit-scrollbar {
  width: 3px;
}
.g-sidebar-nav::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 999px;
}
.g-sidebar-group {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 0.5);
}
.g-sidebar-group-label {
  font-size: 0.66rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted-foreground);
  padding: 0 calc(var(--spacing) * 3);
}
.g-sidebar-empty {
  font-size: 0.76rem;
  color: var(--muted-foreground);
  padding: 0 calc(var(--spacing) * 3);
  margin: 0;
}

.g-nav-btn {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 3);
  width: 100%;
  padding: calc(var(--spacing) * 2.5) calc(var(--spacing) * 3);
  border: none;
  background: transparent;
  color: var(--sidebar-foreground);
  border-radius: var(--radius);
  font: inherit;
  font-size: 0.84rem;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    transform 0.16s ease;
  min-height: 36px;
  overflow: hidden;
  flex: 0 0 auto;
}
.g-nav-btn:hover {
  background: var(--sidebar-accent);
  color: var(--sidebar-accent-foreground);
}
.g-nav-btn:active {
  transform: scale(0.98);
}
.g-nav-btn.is-active {
  background: var(--sidebar-primary);
  color: var(--sidebar-primary-foreground);
  font-weight: 600;
}
.g-nav-btn .g-nav-glyph {
  width: 16px;
  text-align: center;
  flex: 0 0 16px;
  color: currentColor;
}
.g-nav-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.g-nav-btn.is-denied {
  opacity: 0.45;
  cursor: not-allowed;
}
.g-nav-btn.is-denied:hover {
  background: transparent;
  color: var(--sidebar-foreground);
}
.g-nav-lock {
  flex: 0 0 12px;
}

/* 功能命中行：比模块行多一个「所属模块」小字，用来回答「这页在哪」 */
.g-nav-fn .g-nav-fn-emoji {
  width: 16px;
  flex: 0 0 16px;
  font-size: 13px;
  line-height: 1;
  text-align: center;
}
.g-nav-fn-module {
  flex: 0 0 auto;
  max-width: 42%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.68rem;
  color: var(--muted-foreground);
  padding-left: calc(var(--spacing) * 1);
}
.g-nav-fn.is-active .g-nav-fn-module {
  color: color-mix(in srgb, var(--sidebar-primary-foreground) 78%, transparent);
}
/* 键盘选中直接用 .g-nav-btn.is-active 的实心态（与模块行同一套视觉） */
.g-sidebar-search-hint {
  margin-left: auto;
  font-size: 0.62rem;
  font-family: inherit;
  color: var(--muted-foreground);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0 4px;
  line-height: 15px;
}

/* Status dot (for moderation) */
.g-nav-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--chart-2);
  flex: 0 0 8px;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--chart-2) 24%, transparent);
}
.g-nav-btn.is-active .g-nav-dot {
  background: var(--sidebar-primary-foreground);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--sidebar-primary-foreground) 28%, transparent);
}

/* 未保存草稿角标：与审核红点同色系但带数字，且不占满行 —— 右侧留白靠 margin-left:auto */
.g-nav-badge {
  flex: 0 0 auto;
  min-width: 17px;
  margin-left: auto;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--chart-2, #f59e0b);
  color: var(--sidebar-primary-foreground, #fff);
  font-size: 10px;
  font-weight: 700;
  line-height: 17px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* Quick action row (bottom) */
.g-sidebar-quick {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  padding-top: calc(var(--spacing) * 2);
  border-top: 1px solid var(--sidebar-border);
  flex: 0 0 auto;
}
.g-sidebar-quick-label {
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted-foreground);
  font-weight: 600;
  margin-left: auto;
}

/* Footer */
.g-sidebar-foot {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  font-size: 0.7rem;
  color: var(--muted-foreground);
  flex: 0 0 auto;
}
.g-sidebar-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--chart-5);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--chart-5) 22%, transparent);
  flex: 0 0 6px;
}

/* Responsive */
@media (max-width: 1024px) {
  .g-sidebar {
    width: 220px;
    flex-basis: 220px;
    padding: calc(var(--spacing) * 3);
  }
}

/* 窄屏或矮横屏（手机旋转）侧栏抽屉化：与 DataAdmin computeMobileView
   判据对齐 —— 844×390 若仍走桌面常驻侧栏，内容区被压到 533px。 */
@media (max-width: 768px), (orientation: landscape) and (max-height: 500px) {
  .g-sidebar {
    position: fixed;
    top: var(--dm-nav-height);
    left: 0;
    width: min(86vw, 302px);
    flex-basis: auto;
    transform: translateX(-100%);
    transition: transform 0.35s cubic-bezier(0.25, 0.1, 0.25, 1);
    z-index: 1050;
    padding-bottom: calc(var(--spacing) * 4 + env(safe-area-inset-bottom));
    overscroll-behavior: contain;
  }
  .g-sidebar.open {
    transform: translateX(0);
  }
  /* 移动端抽屉内始终展开，不沿用桌面折叠态 */
  .g-sidebar.is-collapsed {
    width: min(86vw, 302px);
    padding: calc(var(--spacing) * 3);
  }
  .g-sidebar.is-collapsed .g-sidebar-brand-copy,
  .g-sidebar.is-collapsed .g-sidebar-search,
  .g-sidebar.is-collapsed .g-sidebar-search-status,
  .g-sidebar.is-collapsed .g-sidebar-group-label,
  .g-sidebar.is-collapsed .g-nav-label,
  .g-sidebar.is-collapsed .g-nav-dot,
  .g-sidebar.is-collapsed .g-nav-lock,
  .g-sidebar.is-collapsed .g-sidebar-quick-label,
  .g-sidebar.is-collapsed .g-sidebar-foot span:last-child {
    display: revert;
  }
  .g-sidebar.is-collapsed .g-nav-btn {
    justify-content: flex-start;
  }
}
</style>
