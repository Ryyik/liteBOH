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
    <nav ref="navEl" class="g-sidebar-nav" aria-label="管理导航">
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

      <!-- 设置页式分组导航（2026-11-25，plans/048 期 2）
           替代原来「10 个模块平铺 + 3 个 section 组头」：现在 8 组、32 个顶层行，
           有子页的行可展开（.g-nav-row.has-children），与设置页左栏同一套语义。
           ⚠️ 传入 navGroups 时才走这条分支；不传的宿主（AdminOverview 等）退回下面的模块列表，
              两者不会同时出现。 -->
      <template v-if="navGroups.length">
        <div v-for="group in filteredNavGroups" :key="group.id" class="g-sidebar-group">
          <span class="g-sidebar-group-label">
            {{ group.label }}
            <!-- 分区级待办：放在组头而不是某一行上 —— 「审核」有 3 个子页都可能待办，
                 挂到某一行会让人以为只有那一页要处理。
                 数字 = 真实条数；圆点 = 只知道「有」但不知道几条（见 nav-groups.js 注）。 -->
            <template v-if="groupBadge(group.id)">
              <span
                v-if="groupBadge(group.id) === true"
                class="g-sidebar-group-dot"
                aria-hidden="true"
              />
              <span v-else class="g-sidebar-group-badge">{{ groupBadge(group.id) }}</span>
            </template>
          </span>
          <!-- 行卡片（2026-11-25 补）：设置页左栏 .gs-nav 的同款白卡。
               没有它就是「一堆散落的白字浮在半透明玻璃上」—— 截图实测：
               行底色 rgba(0,0,0,0)、无 border、无 shadow，看着像粗体标签列表，
               而不是设置页那种「一张卡片里排着几行」。 -->
          <div class="g-sidebar-rows">
            <template v-for="row in group.rows" :key="row.id">
              <button
                type="button"
                :class="[
                  'g-nav-btn',
                  'g-nav-row',
                  {
                    'is-active': activeRowId === row.id,
                    'has-children': hasChildren(row),
                    'is-open': isExpanded(row),
                    'is-descendant-active': isDescendantActive(row),
                    'is-denied': !!row.denied,
                  },
                ]"
                :aria-disabled="row.denied ? 'true' : undefined"
                :aria-expanded="hasChildren(row) ? isExpanded(row) : undefined"
                :title="row.denied ? `${row.label}（当前角色无权限）` : row.label"
                @click="onRowClick(row)"
              >
                <span class="g-nav-label">{{ row.label }}</span>
                <Lock v-if="row.denied" :size="12" class="g-nav-lock" aria-hidden="true" />
                <!-- 子页行数：让人在点开前就知道里面有几项（设置页「当前值」那一列的等价物） -->
                <span v-if="hasChildren(row)" class="g-nav-count">{{ row.children.length }}</span>
                <ChevronDown
                  v-if="hasChildren(row)"
                  :size="12"
                  class="g-nav-chevron"
                  aria-hidden="true"
                />
              </button>

              <!-- 子页：展开后缩进一层。再深一层就超出「两次点击可达」的预算，不支持。 -->
              <template v-if="hasChildren(row) && isExpanded(row)">
                <button
                  v-for="child in row.children"
                  :key="child.id"
                  type="button"
                  :class="[
                    'g-nav-btn',
                    'g-nav-row',
                    'g-nav-child',
                    { 'is-active': activeRowId === child.id, 'is-denied': !!child.denied },
                  ]"
                  :aria-disabled="child.denied ? 'true' : undefined"
                  :title="child.denied ? `${child.label}（当前角色无权限）` : child.label"
                  @click="onRowClick(child)"
                >
                  <span class="g-nav-label">{{ child.label }}</span>
                  <Lock v-if="child.denied" :size="11" class="g-nav-lock" aria-hidden="true" />
                </button>
              </template>
            </template>
          </div>
        </div>
        <p v-if="normalizedQuery && !matchCount" class="g-sidebar-empty">
          换个关键词试试（也可搜「补发」「banner」这类叫法）
        </p>
      </template>

      <template v-else>
        <template v-for="group in groupedModules" :key="group.section">
          <div v-if="group.items.length" class="g-sidebar-group">
            <span class="g-sidebar-group-label">{{ group.label }}</span>
            <button
              v-for="mod in group.items"
              :key="mod.id"
              type="button"
              :class="[
                'g-nav-btn',
                { 'is-active': isModuleActive(mod.id), 'is-denied': mod.denied },
              ]"
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
      </template>
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
        aria-label="新增记录"
        @click="$emit('create-record')"
      >
        <Plus :size="14" />
      </button>
      <button
        type="button"
        class="g-icon-btn is-sm"
        title="刷新数据"
        aria-label="刷新数据"
        @click="$emit('refresh-data')"
      >
        <RefreshCw :size="14" />
      </button>
    </div>

    <!-- Footer -->
    <div class="g-sidebar-foot">
      <router-link
        class="g-sidebar-overview-link"
        to="/admin/overview"
        title="打开快捷概览（@ 动作 / 今日待办 / 收件箱）"
      >
        <Zap :size="12" aria-hidden="true" />
        快捷概览
      </router-link>
      <span class="g-sidebar-dot" aria-hidden="true" />
      <span>BOH 数据管理 · v2.5</span>
    </div>
  </aside>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { ChevronDown, Lock, Plus, RefreshCw, Search as SearchIcon, Zap } from 'lucide-vue-next';
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
  /**
   * 设置页式分组导航（config/nav-groups.js 的 NAV_GROUPS）。
   *
   * 传了它 ⇒ 侧栏渲染成 8 组 32 行、子页可展开；
   * 不传 ⇒ 退回原来的「模块平铺」（AdminConsoleShell 等宿主用不到分组，保持原样）。
   *
   * ⚠️ 为什么用 prop 而不是让侧栏自己 import NAV_GROUPS：
   *    独立控制台壳那几个页面只需要「能切走」，不需要设置页式分组；硬绑死会让它们
   *    也变成折叠结构，而它们本来的 18 条平铺已经够用。
   */
  navGroups: { type: Array, default: () => [] },
  /** 当前应高亮的行 id（分组结构下由宿主按 tab / module 反查后传入） */
  activeRowId: { type: String, default: '' },
  /**
   * 分区级待办角标：`{ 分区id: count }`（见 config/nav-groups.js 的 buildGroupBadges）。
   * 只有传了 navGroups 的宿主才会渲染它。
   */
  groupBadges: { type: Object, default: () => ({}) },
});

const emit = defineEmits([
  'module-click',
  'row-click',
  'denied-click',
  'function-click',
  'update:searchQuery',
  'create-record',
  'refresh-data',
]);

const localSearchQuery = ref(props.searchQuery || '');
/** 键盘选中项（只作用于「功能」那一组） */
const activeFnIndex = ref(-1);

/**
 * 侧栏 17 个模块一屏放不下，而「我在哪」只能靠高亮回答。
 * 从深链 / ⌘K 跳进靠后的模块（抽奖、AI 配置、日志…）时，高亮项在可视区外 ——
 * 用户看到的是「一个都没选中」。这里在挂载和模块变化后把它滚进视野。
 */
const navEl = ref(null);
const scrollActiveIntoView = () => {
  const el = navEl.value?.querySelector('.g-nav-btn.is-active');
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'nearest' });
  }
};
onMounted(() => nextTick(scrollActiveIntoView));
watch(
  () => props.activeModule,
  () => nextTick(scrollActiveIntoView),
);

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

/* ── 设置页式分组导航（2026-11-25，plans/048 期 2） ──────────────────
   展开状态是**纯本地 UI 状态**，不写 URL：
   分组只是导航的折叠，不改变「当前在哪一页」这个事实（那由 ?tab= 表达）。
   如果把展开态也塞进 URL，每次折叠都要 push 一条历史，浏览器返回键会变味。 */
const expandedRowIds = ref(new Set());

const hasChildren = (row) => Array.isArray(row?.children) && row.children.length > 0;

const isExpanded = (row) => expandedRowIds.value.has(row.id);

const isDescendantActive = (row) =>
  hasChildren(row) && row.children.some((child) => child.id === props.activeRowId);

const toggleExpand = (row) => {
  const next = new Set(expandedRowIds.value);
  if (next.has(row.id)) next.delete(row.id);
  else next.add(row.id);
  expandedRowIds.value = next;
};

/* 分组行不带图标（2026-11-25 复核后删掉）。
 *
 * 原本这里有一套 `GROUP_ICONS` + `iconFor(row)`，判的是 `row.isGroupRow` ——
 * 但**全仓没有任何地方产出 `isGroupRow` 字段**（`nav-groups.js` 只挂 `groupId`），
 * 所以它恒返回空串、从上线起就没有渲染过一个图标。这是「写了但没生效」的死代码。
 *
 * 删而不是补字段，因为设计上本来就不该有图标：这些 emoji 是按**分区**映射的
 * （users→👤 / lottery→🎲…），而分区名就写在组头正上方，「👤 用户」等于把
 * 同一个词说两遍。设置页左栏（`.gs-nav-item`）同样没有图标 —— 图标在内容区的
 * `.gs-row` 上，不在导航里。叶子行更不该有：8 组 × 每行一个 emoji 会让左栏变成
 * 一列花花绿绿的符号，反而更难扫。 */

/** 分区待办角标：0 / 非法值一律不显示（0 个待办不该占一个位置）。
 *  返回 `true` 表示「只画圆点」（宿主只知道有、不知道几条）。 */
const groupBadge = (groupId) => {
  const value = props.groupBadges?.[groupId];
  if (value === true) return true;
  const count = Number(value || 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
};

/**
 * 分组行点击：
 *   · 无权限的行 ⇒ 发 denied-click（与平铺分支同一个出口，提示文案不重复一遍）
 *   · 有子页     ⇒ 展开/收起（不导航，避免「点一下就跳走、看不见里面有什么」）
 *   · 叶子行     ⇒ 交给宿主（row-click），宿主自己决定 switchTab 还是跳路由
 *
 * ⚠️ 「有子页就只展开不导航」是刻意取舍：像「权益发放」这种组，进去哪一页都有歧义
 *    （积分还是订阅？），默认跳第一个等于替用户瞎猜。
 * ⚠️ denied 判断放最前：否则无权限的父行点一下还能展开，看起来像「能进去」。
 */
const onRowClick = (row) => {
  if (!row) return;
  if (row.denied) {
    emit('denied-click', { id: row.moduleId || row.tabId || row.id, label: row.label });
    return;
  }
  if (hasChildren(row)) {
    toggleExpand(row);
    return;
  }
  emit('row-click', row);
};

/** 分组导航的搜索过滤：按行 label 过滤，组整体隐藏时不留空组头 */
const filteredNavGroups = computed(() => {
  const q = normalizedQuery.value;
  if (!q) return props.navGroups;
  const matchRow = (row) => {
    if (`${row.label || ''}`.toLowerCase().includes(q)) return true;
    return hasChildren(row) && row.children.some((child) => matchRow(child));
  };
  return props.navGroups
    .map((group) => ({ ...group, rows: group.rows.filter(matchRow) }))
    .filter((group) => group.rows.length > 0);
});

/**
 * 搜索时把命中子行的父级自动展开 —— 否则搜「保底」命中的是子行，
 * 但父级「诊断」是折叠的，用户看到的是一片空。
 *
 * ⚠️ 展开是**写进 expandedRowIds 的副作用**，所以必须放在 watch 里，不能塞进 computed：
 *    computed 里改响应式状态会触发自身重算，Vue 会报「recursive update」。
 */
watch(normalizedQuery, (q) => {
  if (!q) return;
  const next = new Set(expandedRowIds.value);
  const walk = (rows) => {
    rows.forEach((row) => {
      // 子行命中 ⇒ 展开父级。子行本身不需要参与后续逻辑，所以只取 label 判断
      if (hasChildren(row) && row.children.some((c) => c.label.toLowerCase().includes(q))) {
        next.add(row.id);
      }
      if (hasChildren(row)) walk(row.children);
    });
  };
  props.navGroups.forEach((group) => walk(group.rows));
  expandedRowIds.value = next;
});

/** 当前行在可视区外时滚进来（深链进抽奖/AI 时侧栏高亮会落在屏幕外） */
const scrollActiveRowIntoView = () => {
  if (!props.navGroups.length) return;
  const el = navEl.value?.querySelector('.g-nav-row.is-active, .g-nav-row.is-descendant-active');
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'nearest' });
  }
};

/**
 * 找出「哪个父级行包含这个子行」。
 * 只有一层子页（结构守卫锁了不支持第三层），所以不用递归。
 */
const findParentRowIdOf = (childId) => {
  if (!childId) return '';
  for (const group of props.navGroups) {
    for (const row of group.rows) {
      if (hasChildren(row) && row.children.some((child) => child.id === childId)) return row.id;
    }
  }
  return '';
};

/**
 * 深链进入子页时**自动展开它的父级**（2026-11-25 复核补）。
 *
 * 没有这一步时：`?tab=points-grant` → `activeRowId = 'points-grant'`，
 * 而它挂在默认折叠的「权益发放」下面 ⇒ 侧栏里**一个高亮都看不到**，
 * 只有父级那行因为 `is-descendant-active` 淡染了一下（还要先展开才可见）。
 * 表现得就像「这个页面在侧栏里不存在」。
 *
 * ⚠️ 只在**进入时**展开，不因为「用户手动折叠了父级」而反复弹开：
 *    所以只依赖 `activeRowId`，不依赖 `expandedRowIds`
 *    （否则用户折起来的那一下会立刻被这里重新展开，形成打不开的抽屉）。
 */
watch(
  () => props.activeRowId,
  (rowId) => {
    const parentId = findParentRowIdOf(rowId);
    if (parentId && !expandedRowIds.value.has(parentId)) {
      const next = new Set(expandedRowIds.value);
      next.add(parentId);
      expandedRowIds.value = next;
    }
    nextTick(scrollActiveRowIntoView);
  },
  { immediate: true },
);

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

/* 行卡片：设置页左栏 `.gs-nav` 的同款皮肤（settings-glass.css 与
   ProfileSettingsPanel.vue 的 .gs-nav 规则）。
   ⚠️ 为什么必须有这一层：没有它时行直接铺在 .g-sidebar 的半透明玻璃上，
      实测行底色 rgba(0,0,0,0)、无 border、无 shadow —— 视觉是「一堆粗体白字」，
      不是设置页那种「一张卡里排着几行」。用户口径是「跟设置页风格一样」，
      差距就在这一层卡片上，不在分组标签上。
   数值与设置页逐项对齐（浏览器实测两边 computed style 完全相同）：
     background rgba(255,255,255,.84) / border-radius 16px（--liquid-radius-md）
     / padding 6px / gap 2px / 1px 描边 + 轻阴影 */
.g-sidebar-rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  border: 1px solid var(--liquid-border, var(--border));
  border-radius: var(--liquid-radius-md, 12px);
  background: var(--liquid-bg-strong, rgba(255, 255, 255, 0.84));
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
  box-shadow: var(--liquid-shadow-sm, none);
}

.g-sidebar-group-label {
  /* 设置页口径（settings-glass.css 的 .gs-group-title）：13px / 600 / 常规大小写。
     原来是 0.66rem + uppercase —— 那是「后台模块分区」的旧语言，
     与设置页的组头差得远（中文全大写没有意义，只会显得又小又挤）。 */
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--muted-foreground);
  padding: 0 calc(var(--spacing) * 3) 7px;
  /* 分区待办角标要跟组头同一行、靠右 */
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 分区待办角标（plans/048 期 3）：与行内 .g-nav-badge 同色系但更小 ——
   它是「这个分区里有几件待办」的汇总，粒度和行内角标不同，视觉要能区分 */
.g-sidebar-group-badge {
  min-width: 15px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--chart-2, #f59e0b);
  color: var(--sidebar-primary-foreground, #fff);
  font-size: 9px;
  font-weight: 700;
  line-height: 15px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
}

/* 「有但不知几条」用圆点：比显示一个假数字诚实 */
.g-sidebar-group-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--chart-2, #f59e0b);
  flex: 0 0 auto;
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

/* ── 设置页式分组行（2026-11-25，plans/048 期 2） ─────────────────────
   几何与选中态**逐项照抄设置页左栏**（ProfileSettingsPanel.vue 的 .gs-nav-item）：
     行高 40px / 圆角 10px / padding 9px 12px / gap 9px
   原来这里沿用的是平铺模块行的几何（36px / 8px / spacing 倍数），
   与设置页差 4px 行高、2px 圆角 —— 单看不明显，和设置页并排就很清楚。 */

.g-nav-btn.g-nav-row {
  /* 发丝线用 ::before 绝对定位在本行顶部，所以行自己必须是定位祖先 */
  position: relative;
  min-height: 40px;
  padding: 9px 12px;
  border-radius: 10px;
  /* 字号与行高对齐设置页左栏实测值（.gs-nav-item: 14px / line-height 20px）。
     ⚠️ line-height 必须**显式写**：设置页写了 20px，而 .g-nav-btn 是继承行高，
        14px 字落在继承行高上会撑到 45px（实测），比设置页的 40px 高 5px。 */
  font-size: 14px;
  line-height: 20px;
  /* 卡片内部的行间距由 .g-sidebar-rows 的 gap 给（2px），行自己不再留白 */
}

/* 分组行的选中态 = 设置页那套三通道（中性淡染 + 左缘蓝条 + 加粗）。
   ⚠️ 底色必须是**中性灰**（--rail-pill-bg），原来是 --sidebar-accent 的**淡蓝**
      rgb(219,234,254)：淡蓝压在蓝色玻璃底上几乎分不出层次，而且设置页左栏
      从来不用蓝底 —— 那边是 `rgba(15,23,42,0.075)` 的中性淡染。
      用户口径「跟设置页风格一样」，差异就在这里。 */
.g-nav-btn.g-nav-row.is-active,
.g-nav-btn.g-nav-row.is-active:hover {
  background: var(--rail-pill-bg, rgba(15, 23, 42, 0.075));
  color: var(--liquid-text-primary, var(--foreground));
  font-weight: 600;
  position: relative;
}

/* ⚠️ 左缘蓝条用 ::after，不是 ::before —— `::before` 已被上面的行间发丝线占用
   （`.g-sidebar-rows .g-nav-row + .g-nav-row::before`），同一个伪元素画不了两件事。
   设置页那边不冲突是因为它的发丝线只在右栏 `.gs-row` 上、左栏 `.gs-nav-item` 无线；
   本侧栏行同时要线也要条，所以必须分两个伪元素。 */
.g-nav-btn.g-nav-row.is-active::after {
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

/* 暗色：`--rail-pill-bg` 只挂在 .user-space-page（设置页宿主）上，
   数据管理页没有这个变量 ⇒ 会退到我写的亮色 fallback，
   在深底上就是一块看不见的近黑。这里按设置页暗色值（side-rail.css 的
   rgba(255,255,255,0.12)）显式覆写，与那边保持同一口径。

   ⚠️ 选择器必须用 `.data-management-page[data-theme='dark']`，**不是**
      `[data-theme='dark']`：暗色真源是本页根元素上的自绑属性
      （DataAdmin.vue 第 2 行 `:data-theme="currentTheme"`，见 base.css:107），
      组件不读 html[data-theme]。写成 html 那一版在主题切换时可能不生效。 */
.data-management-page[data-theme='dark'] .g-nav-btn.g-nav-row.is-active,
.data-management-page[data-theme='dark'] .g-nav-btn.g-nav-row.is-active:hover {
  background: var(--liquid-border);
  color: var(--liquid-text-primary);
}

/* 暗色卡片描边：--liquid-border 在暗色下已翻转，但玻璃底叠在深侧栏上
   边界感会消失，所以给一档更清楚的描边。 */
.data-management-page[data-theme='dark'] .g-sidebar-rows {
  border-color: var(--liquid-border);
}

/* 行间发丝线（设置页 .gs-row + .gs-row::before 的同款）：
   卡片里没有线时，行与行只是「白底上的几段字」，读起来不像一张列表 ——
   实测截图就是这样（用户最初的截图也是这个观感）。
   内缩量 = 行左内距 12px（本侧栏行没有 30px 图标槽，所以不用内缩到 61px）。 */
.g-sidebar-rows .g-nav-row + .g-nav-row::before {
  content: '';
  position: absolute;
  top: -1px;
  left: 12px;
  right: 12px;
  height: 1px;
  background: var(--liquid-border-hairline, var(--border));
  pointer-events: none;
}

/* 子页行数：与 .g-nav-badge 同一位置语义（右侧），但用中性色 ——
   它是「里面有几项」而不是「有几条要处理」，红/黄会让人误以为有待办 */
.g-nav-count {
  flex: 0 0 auto;
  margin-left: auto;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--sidebar-accent);
  color: var(--muted-foreground);
  font-size: 0.68rem;
  font-weight: 600;
  line-height: 17px;
  font-variant-numeric: tabular-nums;
}

/* 展开箭头：折叠时朝右、展开时朝下。
   ⚠️ 用 transform 而不是换图标组件 —— 换组件会重建 DOM，展开动效会闪。
      高度只有 12px，rotate 90° 后视觉中心不偏。 */
.g-nav-chevron {
  flex: 0 0 auto;
  margin-left: 4px;
  opacity: 0.5;
  transition: transform 0.18s ease;
}

.g-nav-row.is-open .g-nav-chevron {
  transform: rotate(180deg);
}

/* 子页缩进：与组图标的槽宽对齐（16px 槽 + 12px gap）。
   ⚠️ 「子页行」刻意不加图标 —— 加了一层 emoji 会让缩进层级反而看不清。 */
.g-nav-child {
  /* 与父行同一左内距（12px）再缩进一级：设置页的子级条目同样是"同卡片内缩进"，
     不靠大跳格区分层级。原来 spacing*7 ≈ 22px 显得太远，与卡片的 12px 基准脱节。 */
  padding-left: 26px;
  font-size: 13px;
  line-height: 20px;
  min-height: 36px;
}

/* 父级有选中子页时也淡染一下：否则「我展开了但其实在第三个子页」看不出来。
   与 is-active 的实心主色区分开 —— 父级只是「路径」，子页才是「位置」。 */
.g-nav-row.is-descendant-active {
  color: var(--sidebar-accent-foreground);
  font-weight: 600;
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

/* Footer */
.g-sidebar-foot {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  font-size: 0.7rem;
  color: var(--muted-foreground);
  flex: 0 0 auto;
}
/* 快捷概览入口：把独立概览页（/admin/overview）接回侧栏。
   在此之前它只有路由定义、没有任何链接，只能手敲 URL —— 等于「做了但打不开」。
   margin-left:auto 把它推到右侧，不与左侧状态点抢位；窄屏下允许收缩。 */
.g-sidebar-overview-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 2px 6px;
  border-radius: 999px;
  color: var(--muted-foreground);
  text-decoration: none;
  font-size: 0.68rem;
  line-height: 1.4;
  transition:
    background 0.16s ease,
    color 0.16s ease;
}
.g-sidebar-overview-link:hover,
.g-sidebar-overview-link:focus-visible {
  background: color-mix(in srgb, var(--foreground) 8%, transparent);
  color: var(--foreground);
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

/* ⚠️ 窄屏抽屉样式已删除（plans/049 期 1，2026-11-25）。
 *
 * 原来这里有一整块「fix 定位 + 负向平移」的滑出规则 + `.open` 态
 * 的滑出抽屉，服务于「侧拉面板切页面」。用户明确否掉了这个交互形态：
 * 「不再采用侧拉面板切页面了，而是改成像现在网站的设置页一样一页一个完整页面」。
 * 竖屏现在由 AdminNavPages（整页目录，一页一层）承担，本组件在窄屏下
 * **根本不会被渲染**（DataAdmin 的 `v-if="!isNarrowNav"`）。
 *
 * 留着这套规则会制造两个隐患：
 *   ① 任何人把侧栏放回窄屏，看到的是「默认被平移到屏幕外、因而不可见」的侧栏——
 *      因为没人再传 isOpen=true，表现为「导航凭空不见」；
 *   ② 它与 AdminNavPages 的整页样式会同时命中，靠源序决定胜负（CSS 里最脆的一种）。
 *
 * 所以在源码层面就删掉，让「窄屏没有抽屉」成为结构事实而不是运行时约定。
 * 需要恢复抽屉时，请先读 plans/049 §2 的取舍记录。
 */
</style>
