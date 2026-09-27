<template>
  <div ref="rootRef" class="global-search" role="search" aria-label="全站搜索">
    <div class="gs-bar">
      <Search :size="16" class="gs-bar-icon" aria-hidden="true" />
      <input
        ref="inputRef"
        v-model="query"
        type="search"
        class="gs-input"
        :placeholder="placeholder"
        aria-label="搜索全站内容"
        autocomplete="off"
        spellcheck="false"
        @keydown="handleKeydown"
      />
      <LoaderCircle v-if="loading" :size="15" class="gs-spinner" aria-hidden="true" />
      <button
        v-else-if="query"
        type="button"
        class="gs-clear"
        aria-label="清除搜索"
        @click="clearQuery"
      >
        ×
      </button>
    </div>

    <div v-if="trimmedQuery && chips.length" class="gs-chips" role="tablist" aria-label="结果类型">
      <button
        type="button"
        class="gs-chip"
        :class="{ active: activeSource === '' }"
        role="tab"
        :aria-selected="activeSource === ''"
        @click="selectSource('')"
      >
        全部
      </button>
      <button
        v-for="chip in chips"
        :key="chip.id"
        type="button"
        class="gs-chip"
        :class="{ active: activeSource === chip.id }"
        role="tab"
        :aria-selected="activeSource === chip.id"
        @click="selectSource(chip.id)"
      >
        {{ chip.label }}<span class="gs-chip-count">{{ chip.count }}</span>
      </button>
    </div>

    <div class="gs-body">
      <!-- 空态：最近搜索（Spotlight 的 Recents 同款） -->
      <div v-if="!trimmedQuery && history.length" class="gs-history">
        <div class="gs-history-head">
          <span class="gs-group-title">最近搜索</span>
          <button type="button" class="gs-history-clear" @click="clearHistory">清除</button>
        </div>
        <div class="gs-history-list">
          <button
            v-for="item in history"
            :key="item"
            type="button"
            class="gs-history-item"
            @click="applyHistory(item)"
          >
            {{ item }}
          </button>
        </div>
      </div>
      <div v-if="!trimmedQuery && hotWords.length" class="gs-history">
        <div class="gs-history-head">
          <span class="gs-group-title">热门搜索</span>
        </div>
        <div class="gs-history-list">
          <button
            v-for="word in hotWords"
            :key="word"
            type="button"
            class="gs-history-item"
            @click="applyHistory(word)"
          >
            {{ word }}
          </button>
        </div>
      </div>
      <div v-if="!trimmedQuery && guessEntries.length" class="gs-history">
        <div class="gs-history-head">
          <span class="gs-group-title">猜你想去</span>
        </div>
        <div class="gs-history-list">
          <button
            v-for="entry in guessEntries"
            :key="entry.key"
            type="button"
            class="gs-history-item"
            @click="goGuess(entry)"
          >
            {{ entry.title }}
          </button>
        </div>
      </div>
      <p v-if="!trimmedQuery" class="gs-hint">输入关键词搜索全站内容 · 支持 @用户 #类型 前缀</p>
      <p v-else-if="loading && !visibleGroups.length" class="gs-hint">搜索中…</p>
      <p v-else-if="!visibleGroups.length" class="gs-hint">
        没有找到「{{ trimmedQuery }}」相关内容
      </p>

      <div
        v-for="group in visibleGroups"
        :key="group.id"
        class="gs-group"
        :class="{ 'gs-group--answer': group.id === 'answers' }"
      >
        <div class="gs-group-head">
          <span class="gs-group-title">{{ group.label }}</span>
          <button
            v-if="group.canExpand"
            type="button"
            class="gs-group-all"
            @click="selectSource(group.id)"
          >
            查看全部
          </button>
        </div>
        <div v-for="hit in group.hits" :key="hit.key" class="gs-hit-row">
          <button
            type="button"
            class="gs-hit"
            :class="{ active: currentHit?.key === hit.key }"
            @click="openHit(hit)"
            @mouseenter="focusHit(hit)"
          >
            <span class="gs-hit-main">
              <span class="gs-hit-title"
                ><span v-if="hit.badge" class="gs-hit-badge">{{ hit.badge }}</span
                ><template v-for="(seg, si) in splitMarks(hit.title)" :key="si"
                  ><mark v-if="seg.mark" class="gs-mark">{{ seg.t }}</mark
                  ><template v-else>{{ seg.t }}</template></template
                ></span
              >
              <span v-if="hit.excerpt" class="gs-hit-excerpt"
                ><template v-for="(seg, ei) in splitMarks(hit.excerpt)" :key="ei"
                  ><mark v-if="seg.mark" class="gs-mark">{{ seg.t }}</mark
                  ><template v-else>{{ seg.t }}</template></template
                ></span
              >
            </span>
            <span v-if="hit.meta" class="gs-hit-meta">{{ hit.meta }}</span>
          </button>
          <!-- 结果级动作：复制链接（悬停/选中态浮现；⚠️ 不能嵌进 .gs-hit —— button 套 button 非法） -->
          <button
            v-if="hit.route"
            type="button"
            class="gs-hit-copy"
            :class="{ done: copiedKey === hit.key }"
            tabindex="-1"
            :aria-label="`复制「${hit.title}」的链接`"
            @click.stop="copyHitLink(hit)"
          >
            {{ copiedKey === hit.key ? '已复制 ✓' : '复制链接' }}
          </button>
        </div>
      </div>

      <!-- 常驻 AI 入口（Spotlight 的「在网页中搜索」同款位）：有词就在，不只零结果兜底 -->
      <button v-if="trimmedQuery" type="button" class="gs-ai" @click="askAi">
        <Sparkles :size="14" aria-hidden="true" />
        <span>用 BOH AI 深度搜索「{{ trimmedQuery }}」</span>
      </button>
    </div>

    <div class="gs-foot">
      <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
      <span><kbd>Enter</kbd> 打开</span>
      <span><kbd>⌥</kbd><kbd>1-9</kbd> 类型</span>
      <span><kbd>Esc</kbd> 关闭</span>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { LoaderCircle, Search, Sparkles } from 'lucide-vue-next';
import {
  SITE_SEARCH_SOURCES,
  SITE_SEARCH_SOURCE_ORDER,
  SITE_SEARCH_PAGES,
  SITE_SEARCH_HOT_WORDS,
  runInstantSearch,
  runSourceSearch,
} from '@/config/site-search-sources';
import { showIsland } from '@/composables/useIsland.js';
import { logger } from '@/utils/logger.js';

/**
 * 全局搜索面板（灵动岛形态）—— 见 plans/020-site-global-search.md
 *
 * 经 `showIsland.custom(GlobalSearchIsland, { onClose })` 渲染进导航 surface：
 * 由 navbar 的 ResizeObserver 上报高度撑开 surface，面板自身不关心定位。
 *
 * 结果编排：
 *   - 「全部」视图只跑 instant 组（本地索引 + 帖子 + 用户），每组上限 PER_GROUP_LIMIT；
 *   - 点类型 chip / 「查看全部」切到单组全量（deferred 组也在此刻才发起查询）；
 *   - ⚠️ 组内排序，不做跨组融合加权 —— 跨类别分数没有可比性（见方案 §3.3）。
 */
const props = defineProps({
  placeholder: { type: String, default: '搜索帖子、用户、商城、教程…' },
  /** 关闭面板（由 navbar 传入：它会调 showIsland 的 handle.close()） */
  onClose: { type: Function, default: null },
  /**
   * 动作搜索的执行器（由 navbar 透传 handleMenuAction —— 单一真相源）。
   * 命中 hit.action 时由面板调用，面板自身不实现任何动作逻辑。
   */
  onAction: { type: Function, default: null },
});

const SEARCH_DEBOUNCE_MS = 250;
const PER_GROUP_LIMIT = 3;
const SINGLE_GROUP_LIMIT = 20;

const router = useRouter();
const rootRef = ref(null);
const inputRef = ref(null);

const query = ref('');
const activeSource = ref('');
const groups = ref({});
const loading = ref(false);
const selectedIndex = ref(0);

let debounceTimer = null;
let controller = null;

const trimmedQuery = computed(() => query.value.trim());

const currentHit = computed(() => flatHits.value[selectedIndex.value] || null);

/** 有结果的来源，按注册表固定顺序（组内排序，不做跨组融合） */
const SOURCE_CLICKS_KEY = 'boh-site-search-source-clicks';

const readSourceClicks = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(SOURCE_CLICKS_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
};

/** 各来源的历史点击次数（个性化排序，Spotlight 的使用频率学习同款思路） */
const sourceClicks = ref(readSourceClicks());

const recordSourceClick = (sourceId) => {
  if (!sourceId) return;
  sourceClicks.value = {
    ...sourceClicks.value,
    [sourceId]: (sourceClicks.value[sourceId] || 0) + 1,
  };
  try {
    localStorage.setItem(SOURCE_CLICKS_KEY, JSON.stringify(sourceClicks.value));
  } catch {
    /* 隐私模式等写入失败可忽略：只影响排序记忆 */
  }
};

// ---- 搜索历史（Spotlight 的 Recents）：命中结果时落账，空态展示、点击回填 ----
const HISTORY_KEY = 'boh-site-search-history';
const HISTORY_LIMIT = 8;

const readHistory = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((item) => typeof item === 'string' && item.trim()) : [];
  } catch {
    return [];
  }
};

const history = ref(readHistory());

const recordHistory = (keyword) => {
  const q = String(keyword || '').trim();
  if (!q) return;
  history.value = [q, ...history.value.filter((item) => item !== q)].slice(0, HISTORY_LIMIT);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value));
  } catch {
    /* 写入失败只影响历史记忆 */
  }
};

const clearHistory = () => {
  history.value = [];
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* ignore */
  }
};

const applyHistory = (item) => {
  query.value = item;
  inputRef.value?.focus();
};

/** 热门搜索词（运营位，静态配置单源在 site-search-sources.ts） */
const hotWords = SITE_SEARCH_HOT_WORDS;

/* ---------------- 空态推荐：热门词 + 猜你想去（条目级点击频率） ---------------- */

const ITEM_CLICKS_KEY = 'boh-site-search-item-clicks';

const readItemClicks = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(ITEM_CLICKS_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
};

const recordItemClick = (hit) => {
  if (!hit?.route) return;
  const map = readItemClicks();
  map[hit.key] = (map[hit.key] || 0) + 1;
  try {
    localStorage.setItem(ITEM_CLICKS_KEY, JSON.stringify(map));
  } catch {
    /* 写入失败只影响推荐记忆 */
  }
};

/** 猜你想去：条目点击次数最高的「页面」类结果（≥3 条直接用；不足用固定常用入口补齐） */
const guessEntries = computed(() => {
  const counts = readItemClicks();
  const top = Object.entries(counts)
    .filter(([key, count]) => key.startsWith('page-') && Number(count) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 3)
    .map(([key]) => SITE_SEARCH_PAGES.find((page) => `page-${page.id}` === key))
    .filter(Boolean);
  const merged = [...top];
  for (const path of ['/download', '/shop', '/lotteries']) {
    if (merged.length >= 3) break;
    const page = SITE_SEARCH_PAGES.find((p) => p.path === path);
    if (page && !merged.some((m) => m.id === page.id)) merged.push(page);
  }
  return merged.map((page) => ({ key: `page-${page.id}`, title: page.label, route: page.path }));
});

const goGuess = (entry) => {
  recordItemClick(entry);
  props.onClose?.();
  router.push(entry.route);
};

/* ---------------- 高亮：excerpt/title 里的 [[..]] 标记 → <mark> 分段（纯文本渲染，无 v-html） ---------------- */

const splitMarks = (text) => {
  const src = String(text || '');
  if (!src.includes('[[')) return src ? [{ t: src, mark: false }] : [];
  const out = [];
  const re = /\[\[(.+?)\]\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ t: src.slice(last, m.index), mark: false });
    out.push({ t: m[1], mark: true });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ t: src.slice(last), mark: false });
  return out;
};

/* ---------------- 范围指令前缀：@xxx 只搜用户；#标签 只搜对应来源 ---------------- */

const parseScope = (raw) => {
  const q = String(raw || '').trim();
  const at = /^@(.+)$/.exec(q);
  if (at) return { keyword: at[1].trim(), forcedSourceId: 'users' };
  const hash = /^#([^\s#]+)(?:\s+(.*))?$/.exec(q);
  if (hash) {
    const label = hash[1].toLowerCase();
    const source = SITE_SEARCH_SOURCES.find((s) => s.label.toLowerCase().includes(label));
    if (source) return { keyword: (hash[2] || '').trim(), forcedSourceId: source.id };
  }
  return { keyword: q, forcedSourceId: '' };
};

// ---- 结果级动作：复制链接（全来源通用；关注/报名等业务动作需要登录态与状态回显，暂不进面板）----
const copiedKey = ref('');
let copiedTimer = null;

const buildHitUrl = (hit) => `${window.location.origin}/#${hit.route}`;

const copyHitLink = async (hit) => {
  try {
    await navigator.clipboard.writeText(buildHitUrl(hit));
    copiedKey.value = hit.key;
    if (copiedTimer) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      copiedKey.value = '';
    }, 1600);
  } catch (error) {
    logger.warn('site-search', '复制链接失败', error);
  }
};

/**
 * 有结果的来源：历史点击多的组排前面（频率优先），同频保持注册表顺序
 * （sort 稳定）。⚠️ 仍不做跨组融合加权 —— 频率只决定「组与组的展示顺序」，
 * 组内分数依旧各归各，跨类别分数没有可比性。
 */
const orderedGroups = computed(() =>
  SITE_SEARCH_SOURCE_ORDER.map((id) => ({
    id,
    label: SITE_SEARCH_SOURCES.find((s) => s.id === id)?.label || id,
    hits: Array.isArray(groups.value[id]) ? groups.value[id] : [],
  }))
    .filter((group) => group.hits.length > 0)
    .sort((a, b) => (sourceClicks.value[b.id] || 0) - (sourceClicks.value[a.id] || 0)),
);

/** 面板展示的组：选中某类型时只展示该组 */
const visibleGroups = computed(() => {
  const list = activeSource.value
    ? orderedGroups.value.filter((group) => group.id === activeSource.value)
    : orderedGroups.value.slice(0, 5);
  return list.map((group) => ({
    ...group,
    canExpand: !activeSource.value && group.hits.length >= PER_GROUP_LIMIT,
  }));
});

/** 键盘导航用：按展示顺序拍平所有可见结果 */
const flatHits = computed(() => visibleGroups.value.flatMap((group) => group.hits));

const chips = computed(() => {
  const list = orderedGroups.value.map((group) => ({
    id: group.id,
    label: group.label,
    count: group.hits.length,
  }));
  // 当前选中的来源即使本轮无结果也要保留 chip，否则「查看全部」后切不回来
  if (activeSource.value && !list.some((chip) => chip.id === activeSource.value)) {
    const source = SITE_SEARCH_SOURCES.find((s) => s.id === activeSource.value);
    if (source) list.push({ id: source.id, label: source.label, count: 0 });
  }
  // ⚠️ deferred 来源必须常驻可点：它们只在切 chip 时才发起查询，若只显示「有结果的组」
  // 就永远没结果、永远不可达（Modrinth 等第三方 API 的显式触发全靠这里）。
  for (const source of SITE_SEARCH_SOURCES) {
    if (source.group === 'deferred' && !list.some((chip) => chip.id === source.id)) {
      list.push({ id: source.id, label: source.label, count: 0 });
    }
  }
  return list;
});

const runSearch = async () => {
  // 范围指令前缀（@用户 / #来源）优先于 chip 状态 —— 前缀是更明确的意图
  const { keyword, forcedSourceId } = parseScope(trimmedQuery.value);
  controller?.abort();
  if (!keyword) {
    groups.value = {};
    loading.value = false;
    return;
  }
  controller = new AbortController();
  const { signal } = controller;
  loading.value = true;
  try {
    const next = forcedSourceId
      ? {
          [forcedSourceId]: await runSourceSearch(forcedSourceId, keyword, {
            limit: SINGLE_GROUP_LIMIT,
            signal,
          }),
        }
      : activeSource.value
        ? {
            [activeSource.value]: await runSourceSearch(activeSource.value, keyword, {
              limit: SINGLE_GROUP_LIMIT,
              signal,
            }),
          }
        : await runInstantSearch(keyword, { limitPerSource: PER_GROUP_LIMIT, signal });
    if (signal.aborted) return;
    groups.value = next;
    selectedIndex.value = 0;
  } catch (error) {
    if (!signal.aborted) logger.warn('site-search', '搜索失败', error);
  } finally {
    if (!signal.aborted) loading.value = false;
  }
};

const scheduleSearch = () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
};

// 输入变化 → 防抖；类型切换 → 立即（切换本身是显式动作，不该再等防抖）
watch(query, () => {
  selectedIndex.value = 0;
  scheduleSearch();
});

const selectSource = (sourceId) => {
  if (activeSource.value === sourceId) return;
  activeSource.value = sourceId;
  selectedIndex.value = 0;
  runSearch();
};

const clearQuery = () => {
  query.value = '';
  groups.value = {};
  activeSource.value = '';
  inputRef.value?.focus();
};

const openHit = async (hit) => {
  if (!hit) return;
  recordSourceClick(hit.source);
  recordHistory(trimmedQuery.value);
  recordItemClick(hit);
  props.onClose?.();
  // 动作项（Spotlight 式「搜到即执行」）：不跳转，执行权归导航栏 handleMenuAction
  if (hit.action) {
    props.onAction?.(hit.action);
    return;
  }
  // 外链（Modrinth 等第三方）：新标签打开，不走站内路由
  if (/^https?:\/\//i.test(hit.route)) {
    window.open(hit.route, '_blank', 'noopener');
    return;
  }
  // 无 route（计算器即答）：答案已在标题里，面板保持原状
  if (!hit.route) return;
  try {
    await router.push(hit.route);
  } catch (error) {
    logger.warn('site-search', `跳转失败: ${hit.route}`, error);
  }
};

/** 常驻 AI 入口：把搜索词交给 BOH AI 岛（通路 = showIsland.ai，AI 岛优先级最高无需抢占） */
const askAi = () => {
  const keyword = trimmedQuery.value;
  if (!keyword) return;
  recordSourceClick('ai');
  props.onClose?.();
  const opened = showIsland.ai({
    prompt: `请帮我在站内找与「${keyword}」相关的内容（帖子、新闻、活动、商城、教程），并总结要点`,
  });
  // opener 未注册（navbar 未挂载等）时兜底进 AI 对话页，不让点击落空
  if (!opened) router.push('/ai-chat');
};

const focusHit = (hit) => {
  const index = flatHits.value.findIndex((item) => item.key === hit.key);
  if (index >= 0) selectedIndex.value = index;
};

const scrollToSelected = () => {
  nextTick(() => {
    const nodes = rootRef.value?.querySelectorAll('.gs-hit');
    nodes?.[selectedIndex.value]?.scrollIntoView({ block: 'nearest' });
  });
};

const handleKeydown = (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    props.onClose?.();
    return;
  }
  const total = flatHits.value.length;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (total) selectedIndex.value = (selectedIndex.value + 1) % total;
    scrollToSelected();
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (total) selectedIndex.value = (selectedIndex.value - 1 + total) % total;
    scrollToSelected();
    return;
  }
  // Alt+数字（1-9）切类型 chip —— Spotlight 的 Cmd+1..4 同款。
  // ⚠️ 不能用 Cmd/Ctrl+数字：浏览器把它们保留给「切换标签页」，页面 preventDefault 拦不住。
  // ⚠️ 判据必须用 event.code（Digit1..9）而不是 event.key：macOS 上 Option+数字的
  // key 是特殊字符（Option+2 = '™'），按 key 判断在 Mac 上永远匹配不上（探针实测踩过）。
  // 监听在输入框上，裸数字是打字，必须带修饰键。
  if (event.altKey && !event.metaKey && !event.ctrlKey && /^Digit[1-9]$/.test(event.code)) {
    // ⚠️ 「全部」chip 是模板硬编码、不在 chips 计算属性里 → 键盘序号整体差一位：
    // 1 = 全部，2.. = chips[0..]（temp-diag 实测 chips.value[1] 曾是 undefined）
    const n = Number(event.code.slice(5));
    const chip = n === 1 ? { id: '' } : chips.value[n - 2];
    if (chip) {
      event.preventDefault();
      selectSource(chip.id);
    }
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    openHit(flatHits.value[selectedIndex.value]);
  }
};

/**
 * 点外部关闭。
 * ⚠️ 必须排除搜索按钮自身：否则点按钮 → 先被这里判为「外部」而关闭，
 * 紧接着按钮的 toggle 又把它打开，表现为「点一下闪一下」。
 */
const handleDocumentClick = (event) => {
  const target = event.target;
  if (!target) return;
  // ⚠️ 点击目标在派发中途被换下树（如点「最近搜索」条目 → query 变化 → 空态历史块
  // v-if 卸载 → 冒泡到 document 时 target.isConnected=false）——这是面板自己的交互，
  // 绝不能判成「点外部」而关面板（实测会把面板整个关掉、回填失效）。
  if (!target.isConnected) return;
  if (rootRef.value?.contains(target)) return;
  if (target.closest?.('.nav-search-btn')) return;
  props.onClose?.();
};

onMounted(() => {
  inputRef.value?.focus();
  document.addEventListener('click', handleDocumentClick);
});

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (copiedTimer) clearTimeout(copiedTimer);
  controller?.abort();
  document.removeEventListener('click', handleDocumentClick);
});
</script>

<style scoped>
.global-search {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 10px 8px;
  color: #1d1d1f;
}

.gs-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.gs-bar-icon {
  color: #667085;
  flex-shrink: 0;
}

.gs-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  outline: none;
  font-size: 15px;
  font-weight: 500;
  color: #1d1d1f;
}

.gs-input::placeholder {
  color: #98a2b3;
}

.gs-input::-webkit-search-cancel-button {
  display: none;
}

.gs-clear {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.08);
  color: #515154;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.gs-clear:hover {
  background: rgba(0, 0, 0, 0.14);
}

.gs-spinner {
  flex-shrink: 0;
  color: #667085;
  animation: gs-spin 900ms linear infinite;
}

@keyframes gs-spin {
  to {
    transform: rotate(360deg);
  }
}

.gs-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.gs-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid rgba(100, 116, 139, 0.16);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.5);
  color: #526174;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    border-color 0.18s ease;
}

.gs-chip:hover {
  background: rgba(255, 255, 255, 0.86);
}

.gs-chip.active {
  color: #fff;
  background: #1d1d1f;
  border-color: #1d1d1f;
}

.gs-chip-count {
  opacity: 0.62;
  font-variant-numeric: tabular-nums;
}

.gs-body {
  max-height: min(52vh, 360px);
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gs-hint {
  margin: 0;
  padding: 18px 12px;
  text-align: center;
  color: #8995a7;
  font-size: 13px;
}

.gs-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gs-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px 2px;
}

.gs-group-title {
  color: #8995a7;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.gs-group-all {
  border: none;
  background: transparent;
  color: #1d62d4;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  padding: 2px 4px;
}

.gs-group-all:hover {
  text-decoration: underline;
}

.gs-hit {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 11px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.14s ease,
    border-color 0.14s ease;
}

.gs-hit-row {
  position: relative; /* 锚定悬浮的「复制链接」按钮 */
}

/* 结果级动作按钮：悬停/选中时浮现于行尾（覆盖次要 meta 区），平时完全隐身。
   ⚠️ 不能嵌进 .gs-hit（button 套 button 非法），故用兄弟节点 + 绝对定位。 */
.gs-hit-copy {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  padding: 3px 9px;
  border: 1px solid rgba(29, 98, 212, 0.35);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.95);
  color: #1d62d4;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.14);
  transition:
    opacity 0.15s ease,
    background 0.15s ease;
}

.gs-hit-row:hover .gs-hit-copy,
.gs-hit-copy:focus-visible,
.gs-hit-copy.done {
  opacity: 1;
  pointer-events: auto;
}

.gs-hit-copy.done {
  color: #0f7b3d;
  border-color: rgba(15, 123, 61, 0.4);
}

/* 速查组（即答卡）：轻强调，读起来像「系统直接给了答案」 */
.gs-group--answer .gs-hit {
  background: rgba(29, 98, 212, 0.07);
  border-color: rgba(29, 98, 212, 0.18);
}

.gs-group--answer .gs-hit.active,
.gs-group--answer .gs-hit:hover {
  background: rgba(29, 98, 212, 0.12);
  border-color: rgba(29, 98, 212, 0.3);
}

/* 空态：最近搜索 */
.gs-history {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 4px 0;
}

.gs-history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 6px;
}

.gs-history-clear {
  border: none;
  background: transparent;
  color: #9aa4b2;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  padding: 2px 4px;
}

.gs-history-clear:hover {
  color: #526174;
  text-decoration: underline;
}

.gs-history-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.gs-history-item {
  max-width: 100%;
  padding: 5px 12px;
  border: 1px solid rgba(100, 116, 139, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.5);
  color: #526174;
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition:
    background 0.18s ease,
    border-color 0.18s ease;
}

.gs-history-item:hover {
  background: rgba(255, 255, 255, 0.86);
  border-color: rgba(100, 116, 139, 0.38);
}

.gs-hit.active,
.gs-hit:hover {
  background: rgba(255, 255, 255, 0.6);
  border-color: rgba(255, 255, 255, 0.7);
}

.gs-hit-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gs-hit-title {
  font-size: 13.5px;
  font-weight: 500;
  color: #1d1d1f;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-hit-badge {
  flex-shrink: 0;
  padding: 1px 5px;
  border-radius: 5px;
  background: rgba(29, 98, 212, 0.1);
  color: #1d62d4;
  font-size: 10px;
  font-weight: 600;
}

.gs-hit-excerpt {
  font-size: 12px;
  color: #667085;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 关键词高亮：excerpt/title 的 [[..]] 标记 → <mark>（纯文本节点渲染，无 v-html） */
.gs-mark {
  margin: 0 1px;
  padding: 0 1px;
  border-radius: 3px;
  background: rgba(29, 98, 212, 0.14);
  color: #1d4ed8;
  font-weight: 600;
}

.gs-hit-meta {
  flex-shrink: 0;
  color: #9aa4b2;
  font-size: 11px;
  max-width: 132px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 常驻 AI 入口：虚线框弱化存在感，位置固定在结果列表末尾（Spotlight「在网页中搜索」同款位） */
.gs-ai {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 2px;
  padding: 9px 10px;
  border: 1px dashed rgba(100, 116, 139, 0.3);
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.4);
  color: #526174;
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;
}

.gs-ai:hover {
  background: rgba(255, 255, 255, 0.78);
  border-color: rgba(100, 116, 139, 0.5);
  color: #1d1d1f;
}

.gs-foot {
  display: flex;
  gap: 12px;
  padding: 2px 10px 0;
  color: #9aa4b2;
  font-size: 11px;
}

.gs-foot kbd {
  display: inline-block;
  min-width: 16px;
  margin-right: 2px;
  padding: 1px 4px;
  border: 1px solid rgba(100, 116, 139, 0.2);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.6);
  font-family: inherit;
  font-size: 10px;
  text-align: center;
}

/* 暗色：与统一导航栏同前缀（surface 带 data-theme）。
   写法对齐 style.scoped.css 的既有惯例 —— 直接用 ID 前缀 + 本组件 scope 属性，
   不用 :global() 包裹（实测那样写规则不会输出到产物里，暗色态恒失效）。 */
#unified-nav-container[data-theme='dark'] .global-search {
  color: #f5f5f7;
}

#unified-nav-container[data-theme='dark'] .gs-bar {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.14);
  box-shadow: none;
}

#unified-nav-container[data-theme='dark'] .gs-bar-icon {
  color: #86868b;
}

#unified-nav-container[data-theme='dark'] .gs-input {
  color: #f5f5f7;
}

#unified-nav-container[data-theme='dark'] .gs-input::placeholder {
  color: #636366;
}

#unified-nav-container[data-theme='dark'] .gs-clear {
  background: rgba(255, 255, 255, 0.1);
  color: #a1a1a6;
}

#unified-nav-container[data-theme='dark'] .gs-chip {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.14);
  color: #e5e5ea;
}

#unified-nav-container[data-theme='dark'] .gs-chip:hover {
  background: rgba(255, 255, 255, 0.14);
}

#unified-nav-container[data-theme='dark'] .gs-chip.active {
  background: #f5f5f7;
  border-color: #f5f5f7;
  color: #1d1d1f;
}

#unified-nav-container[data-theme='dark'] .gs-hint,
#unified-nav-container[data-theme='dark'] .gs-group-title,
#unified-nav-container[data-theme='dark'] .gs-hit-meta,
#unified-nav-container[data-theme='dark'] .gs-foot {
  color: #8e8e93;
}

#unified-nav-container[data-theme='dark'] .gs-hit.active,
#unified-nav-container[data-theme='dark'] .gs-hit:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.12);
}

#unified-nav-container[data-theme='dark'] .gs-hit-title {
  color: #f5f5f7;
}

#unified-nav-container[data-theme='dark'] .gs-hit-excerpt {
  color: #a1a1a6;
}

#unified-nav-container[data-theme='dark'] .gs-hit-badge {
  background: rgba(70, 130, 255, 0.18);
  color: #8ab4ff;
}

#unified-nav-container[data-theme='dark'] .gs-mark {
  background: rgba(70, 130, 255, 0.26);
  color: #9cc3ff;
}

#unified-nav-container[data-theme='dark'] .gs-group-all {
  color: #8ab4ff;
}

#unified-nav-container[data-theme='dark'] .gs-foot kbd {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.14);
}

#unified-nav-container[data-theme='dark'] .gs-ai {
  border-color: rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  color: #a1a1a6;
}

#unified-nav-container[data-theme='dark'] .gs-ai:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.32);
  color: #f5f5f7;
}

#unified-nav-container[data-theme='dark'] .gs-history-clear {
  color: #8e8e93;
}

#unified-nav-container[data-theme='dark'] .gs-history-clear:hover {
  color: #c7c7cc;
}

#unified-nav-container[data-theme='dark'] .gs-history-item {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.16);
  color: #c7c7cc;
}

#unified-nav-container[data-theme='dark'] .gs-history-item:hover {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.3);
}

#unified-nav-container[data-theme='dark'] .gs-hit-copy {
  background: rgba(30, 30, 32, 0.96);
  border-color: rgba(138, 180, 255, 0.5);
  color: #8ab4ff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
}

#unified-nav-container[data-theme='dark'] .gs-hit-copy.done {
  color: #6fd592;
  border-color: rgba(111, 213, 146, 0.5);
}

#unified-nav-container[data-theme='dark'] .gs-group--answer .gs-hit {
  background: rgba(70, 130, 255, 0.12);
  border-color: rgba(70, 130, 255, 0.28);
}

#unified-nav-container[data-theme='dark'] .gs-group--answer .gs-hit.active,
#unified-nav-container[data-theme='dark'] .gs-group--answer .gs-hit:hover {
  background: rgba(70, 130, 255, 0.2);
  border-color: rgba(138, 180, 255, 0.42);
}

@media (prefers-reduced-motion: reduce) {
  .gs-chip,
  .gs-hit,
  .gs-ai,
  .gs-history-item,
  .gs-hit-copy {
    transition: none;
  }

  .gs-spinner {
    animation: none;
  }
}
</style>
