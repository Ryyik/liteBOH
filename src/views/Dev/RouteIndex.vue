<template>
  <main class="route-index">
    <header class="ri-header">
      <p class="ri-eyebrow">Development / Routes</p>
      <h1>路由索引</h1>
      <p class="ri-subtitle">
        全站 {{ pages.length }} 个页面 +
        {{ redirects.length }} 条兼容重定向，点击任意一行即新窗口打开。 列表由
        <code>router.getRoutes()</code> 实时生成 —— 新增路由后本页自动生效，不需要维护第二份清单。
      </p>
    </header>

    <div class="ri-toolbar">
      <label class="ri-filter" for="ri-filter-input">
        <Search :size="15" :stroke-width="2" aria-hidden="true" />
        <input
          id="ri-filter-input"
          v-model="keyword"
          type="search"
          placeholder="按名称 / 路径过滤，如 shop、ai、admin、登录"
        />
      </label>
      <p class="ri-count">
        页面 {{ filteredPages.length }}/{{ pages.length }} · 重定向
        {{ filteredRedirects.length }}/{{ redirects.length }}
      </p>
    </div>

    <p v-if="!filteredPages.length && !filteredRedirects.length" class="ri-empty">
      没有匹配「{{ keyword }}」的路由
    </p>

    <section
      v-for="group in visibleGroups"
      :key="group.key"
      class="ri-group"
      :aria-label="group.title"
    >
      <h2 class="ri-group-title">
        <span>{{ group.title }}</span>
        <span class="ri-group-count">{{ group.routes.length }}</span>
      </h2>
      <a
        v-for="row in group.routes"
        :key="row.path"
        class="ri-row"
        :href="row.href"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span class="ri-row-main">
          <span class="ri-row-label">{{ row.label }}</span>
          <span
            v-for="badge in row.badges"
            :key="badge"
            class="ri-badge"
            :class="badgeClass(badge)"
          >
            {{ badge }}
          </span>
        </span>
        <span class="ri-row-path">{{ row.path }}</span>
        <ExternalLink class="ri-row-icon" :size="14" :stroke-width="2" aria-hidden="true" />
      </a>
    </section>

    <section v-if="filteredRedirects.length" class="ri-group" aria-label="兼容重定向">
      <h2 class="ri-group-title">
        <span>兼容重定向</span>
        <span class="ri-group-count">{{ filteredRedirects.length }}</span>
      </h2>
      <a
        v-for="row in filteredRedirects"
        :key="row.path"
        class="ri-row ri-row--redirect"
        :href="row.href"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span class="ri-row-main">
          <span class="ri-row-label">{{ row.label }}</span>
          <span class="ri-badge ri-badge--muted">重定向</span>
        </span>
        <span class="ri-row-path">{{ row.path }} → {{ row.target }}</span>
        <ExternalLink class="ri-row-icon" :size="14" :stroke-width="2" aria-hidden="true" />
      </a>
    </section>
  </main>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ExternalLink, Search } from 'lucide-vue-next';
import { BOTTOM_NAV_ITEMS } from '@/config/bottom-nav';
import { SITE_NAV_ITEMS, flattenSiteNavPages } from '@/config/site-nav';

const router = useRouter();
const keyword = ref('');

// 参数路由（/forum/post/:id）没有真实 id 可点，用示例值填充，保证 href 一定打得开
const SAMPLE_PARAMS = { username: 'demo', id: '1' };
const fillParams = (path) =>
  path.replace(/:([A-Za-z0-9_]+)/g, (m, key) => SAMPLE_PARAMS[key] || '1');

// 标签优先取两份既有单源：顶栏菜单 + 底栏。查不到的补一张很小的展示层映射，
// 再查不到退回路由名 / 末级路径段。路由真源始终是 getRoutes()，本页不存第二份。
const labelMap = new Map();
for (const page of flattenSiteNavPages(SITE_NAV_ITEMS)) {
  const key = page.path.split('?')[0];
  if (!labelMap.has(key)) labelMap.set(key, page.label);
}
for (const item of BOTTOM_NAV_ITEMS) {
  const key = item.route.split('?')[0];
  if (!labelMap.has(key)) labelMap.set(key, item.label);
}
const EXTRA_LABELS = {
  '/user-space': '我',
  '/login': '登录',
  '/reset-password': '重置密码',
  '/history': '历史归档',
  '/gift': '新年好礼',
  '/boh-8-years-event': '八周年活动',
  '/join': '加入我们',
  '/shows': '精彩节目',
  '/forum/post/:id': '帖子详情',
  '/profile/:username': '用户主页',
  '/news/:id': '新闻详情',
  '/albums/:id': '影集阅读',
  '/studio/albums/:id': '影集编辑',
  '/user-space/albums': '我的影集',
  '/user-space/account-security': '账号安全',
  '/user-space/note': '云笔记 Cloud+',
  '/user-space/shared-memories': '共享记忆',
  '/user-space/pushplus-settings': '推送设置',
  '/user-space/settings/version': 'Beta 预览',
  '/user-space/gifts': '礼物地址',
  '/user-space/partners': '成员目录',
  '/shop/account': '商城账户',
};

const GROUP_TITLES = {
  '': '根路径',
  admin: '管理后台',
  'user-space': '个人空间',
  __dev: '开发工具页',
  studio: '创作台',
};
const groupKeyOf = (path) => path.split('/').filter(Boolean)[0] || '';

const isPageRoute = (route) => !!(route.components && Object.keys(route.components).length > 0);
const isCatchAll = (route) => route.path.includes('pathMatch') || route.path.includes('(.*)');

const badgesOf = (route) => {
  const badges = [];
  if (route.meta?.requiresAdmin) badges.push('管理员');
  if (route.meta?.requiresLogin) badges.push('需登录');
  if (route.meta?.immersiveNav) badges.push('沉浸导航');
  if (route.meta?.keepAlive) badges.push('页面缓存');
  if (route.path.startsWith('/__dev')) badges.push('DEV');
  return badges;
};

// 重定向目标：字符串直接展示；函数用最小 to 上下文求值一次（失败退「动态重定向」）
const describeRedirect = (route) => {
  const target = route.redirect;
  if (typeof target === 'string') return target;
  if (typeof target !== 'function') return '';
  try {
    const out = target({ query: {}, params: {}, hash: '', path: route.path });
    if (!out || typeof out !== 'object') return String(out);
    const query =
      out.query && Object.keys(out.query).length
        ? `?${new URLSearchParams(out.query).toString()}`
        : '';
    return out.path ? `${out.path}${query}` : String(out.name || '动态重定向');
  } catch {
    return '动态重定向';
  }
};

const allRows = computed(() => {
  const pages = [];
  const redirects = [];
  for (const route of router.getRoutes()) {
    // alias 记录与原路由同组件（避免重复行）；catch-all 无可展示落点
    if (route.aliasOf || isCatchAll(route)) continue;
    const label =
      labelMap.get(route.path) ||
      EXTRA_LABELS[route.path] ||
      String(route.name || '') ||
      route.path.split('/').filter(Boolean).pop() ||
      route.path;
    const base = {
      path: route.path,
      href: router.resolve(fillParams(route.path)).href,
      label,
      badges: badgesOf(route),
    };
    if (isPageRoute(route)) pages.push(base);
    else if (route.redirect) redirects.push({ ...base, target: describeRedirect(route) });
  }
  return { pages, redirects };
});

const pages = computed(() => allRows.value.pages);
const redirects = computed(() => allRows.value.redirects);

const matches = (row, q) =>
  row.label.toLowerCase().includes(q) ||
  row.path.toLowerCase().includes(q) ||
  String(row.target || '')
    .toLowerCase()
    .includes(q);

const filteredPages = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  return q ? pages.value.filter((row) => matches(row, q)) : pages.value;
});

const filteredRedirects = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  return q ? redirects.value.filter((row) => matches(row, q)) : redirects.value;
});

// 页面按顶级路径段分组（根路径恒在最前），重定向统一沉到最后一节，避免淹没页面
const visibleGroups = computed(() => {
  const byKey = new Map();
  for (const row of filteredPages.value) {
    const key = groupKeyOf(row.path);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(row);
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
    .map(([key, routes]) => ({ key, title: GROUP_TITLES[key] || `/${key}`, routes }));
});

const badgeClass = (badge) => {
  if (badge === '管理员') return 'ri-badge--admin';
  if (badge === 'DEV') return 'ri-badge--dev';
  if (badge === '重定向') return 'ri-badge--muted';
  return 'ri-badge--info';
};
</script>

<style scoped>
/* 用色纪律：只取静态加载、且自带 [data-theme=dark] 覆写的 --liquid-*  token
   （tokens.css，main.js 全局引入）。⚠️ 不要用 --boh-* 族 —— 它们定义在
   themes/dark-mode.css，该文件仅在暗色激活时才懒加载，浅色下整族未定义，
   scoped 里的 var() 会静默解析失败（背景透明、边框消失）。 */
.route-index {
  min-height: 100dvh;
  /* 顶部避让固定导航栏（与 shop 等同款 --nav-h 约定，兜底 80px ≥ 实测导航高 78px） */
  padding: calc(var(--nav-h, 80px) + 28px) 24px 72px;
  color: var(--liquid-text-primary);
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.ri-header,
.ri-toolbar,
.ri-group,
.ri-empty {
  width: min(100%, 980px);
  margin-left: auto;
  margin-right: auto;
}

.ri-header {
  margin-bottom: 20px;
}

.ri-eyebrow {
  margin: 0 0 4px;
  color: var(--liquid-text-secondary);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.08em;
}

h1 {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 600;
}

.ri-subtitle {
  margin: 0;
  color: var(--liquid-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.ri-subtitle code {
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--liquid-bg-nested);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}

.ri-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.ri-filter {
  flex: 1 1 300px;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--liquid-border-hairline);
  border-radius: 10px;
  background: var(--liquid-bg);
  color: var(--liquid-text-tertiary);
}

.ri-filter:focus-within {
  border-color: color-mix(in srgb, var(--liquid-text-primary) 35%, transparent);
}

.ri-filter input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--liquid-text-primary);
  font-size: 13px;
}

.ri-count {
  margin: 0;
  color: var(--liquid-text-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.ri-empty {
  margin-top: 24px;
  color: var(--liquid-text-secondary);
  font-size: 13px;
}

.ri-group {
  margin-bottom: 22px;
}

.ri-group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  color: var(--liquid-text-secondary);
  font-size: 13px;
  font-weight: 500;
}

.ri-group-count {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--liquid-bg-nested);
  color: var(--liquid-text-tertiary);
  font-size: 11px;
  font-weight: 400;
}

.ri-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
  padding: 10px 14px;
  border: 1px solid var(--liquid-border-hairline);
  border-radius: 10px;
  background: var(--liquid-bg);
  color: inherit;
  text-decoration: none;
  transition: border-color 150ms ease;
}

.ri-row:hover {
  border-color: color-mix(in srgb, var(--liquid-text-primary) 35%, transparent);
}

.ri-row-main {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  min-width: 170px;
}

.ri-row-label {
  font-size: 13px;
  font-weight: 500;
}

.ri-row-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--liquid-text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}

.ri-row-icon {
  flex: 0 0 auto;
  color: var(--liquid-text-tertiary);
}

.ri-row:hover .ri-row-icon {
  color: var(--liquid-text-primary);
}

.ri-row--redirect {
  background: var(--liquid-bg-nested);
}

.ri-row--redirect .ri-row-label {
  color: var(--liquid-text-secondary);
  font-weight: 400;
}

.ri-badge {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}

.ri-badge--info {
  background: color-mix(in srgb, var(--liquid-text-primary) 9%, transparent);
  color: var(--liquid-text-secondary);
}

.ri-badge--admin {
  background: color-mix(in srgb, var(--liquid-text-primary) 16%, transparent);
  color: var(--liquid-text-primary);
}

.ri-badge--dev {
  background: color-mix(in srgb, var(--liquid-text-primary) 9%, transparent);
  color: var(--liquid-text-secondary);
}

.ri-badge--muted {
  background: var(--liquid-bg-nested);
  color: var(--liquid-text-tertiary);
}

@media (max-width: 640px) {
  .route-index {
    padding: calc(var(--nav-h, 80px) + 20px) 16px 56px;
  }

  .ri-row {
    flex-wrap: wrap;
  }

  .ri-row-main {
    min-width: 0;
  }

  .ri-row-path {
    flex-basis: 100%;
  }
}
</style>
