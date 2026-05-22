<template>
  <div class="global-pages-index-page">
    <UnifiedNavbar />

    <main class="page-shell">
      <header class="page-header">
        <div>
          <p class="eyebrow">Vue Entry Catalog</p>
          <h1 class="page-title">全站 Vue 入口说明</h1>
          <p class="page-subtitle">
            汇总当前路由、Vue 页面文件、入口用途、权限状态和兼容跳转，方便快速理解这个项目每个页面在做什么。
          </p>
        </div>
      </header>

      <section class="summary-grid" aria-label="页面统计">
        <div class="summary-card">
          <span class="summary-label">路由页面</span>
          <strong>{{ routedPages.length }}</strong>
        </div>
        <div class="summary-card">
          <span class="summary-label">Vue 视图文件</span>
          <strong>{{ viewFiles.length }}</strong>
        </div>
        <div class="summary-card">
          <span class="summary-label">未挂路由视图</span>
          <strong>{{ orphanViewFiles.length }}</strong>
        </div>
        <div class="summary-card">
          <span class="summary-label">默认重定向</span>
          <strong>{{ redirectPages.length }}</strong>
        </div>
        <div class="summary-card">
          <span class="summary-label">保留队列</span>
          <strong>{{ keepQueue.length }}</strong>
        </div>
        <div class="summary-card danger">
          <span class="summary-label">删除队列</span>
          <strong>{{ deleteQueue.length }}</strong>
        </div>
      </section>

      <section class="toolbar-panel">
        <input
          v-model="keyword"
          type="search"
          class="search-input"
          placeholder="搜索路径、页面名、Vue 文件或用途说明"
        >
        <div class="category-tabs" aria-label="入口分类">
          <button
            v-for="item in categoryTabs"
            :key="item.key"
            type="button"
            class="category-tab"
            :class="{ active: activeCategory === item.key }"
            @click="activeCategory = item.key"
          >
            {{ item.label }}
            <span>{{ item.count }}</span>
          </button>
        </div>
      </section>

      <div class="workspace-layout">
        <div class="workspace-main">
          <section class="content-panel">
            <div class="panel-heading">
              <div>
                <h2>路由入口</h2>
                <p>来自 Vue Router，包含页面职责、组件文件和可访问状态。</p>
              </div>
              <span class="result-count">{{ filteredRoutedPages.length }} / {{ routedPages.length }}</span>
            </div>

            <div v-if="filteredRoutedPages.length === 0" class="empty-state">
              没有匹配到路由页面。
            </div>

            <div v-else class="entry-grid">
              <article
                v-for="item in filteredRoutedPages"
                :key="item.path"
                class="entry-card"
                :class="{
                  'queued-keep': isInKeepQueue(queueKeyForRoute(item)),
                  'queued-delete': isInDeleteQueue(queueKeyForRoute(item))
                }"
              >
                <div class="entry-card-head">
                  <div>
                    <span class="category-pill">{{ item.category }}</span>
                    <h3>{{ item.displayName }}</h3>
                  </div>
                  <a
                    v-if="item.jumpHref"
                    class="open-link"
                    :href="item.jumpHref"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    打开
                  </a>
                  <span v-else class="open-link disabled">不可打开</span>
                </div>

                <p class="entry-description">{{ item.description }}</p>

                <dl class="entry-meta">
                  <div>
                    <dt>路由</dt>
                    <dd><code>{{ item.path }}</code></dd>
                  </div>
                  <div>
                    <dt>Vue 文件</dt>
                    <dd>{{ item.componentPath }}</dd>
                  </div>
                  <div v-if="item.redirectText">
                    <dt>默认跳转</dt>
                    <dd><code>{{ item.redirectText }}</code></dd>
                  </div>
                </dl>

                <div class="badges">
                  <span v-if="item.hasDynamicParams" class="status-badge blue">动态参数</span>
                  <span v-if="item.requiresAdmin" class="status-badge red">管理员</span>
                  <span v-if="item.upcoming" class="status-badge amber">即将上线</span>
                  <span v-if="!item.requiresAdmin && !item.upcoming" class="status-badge green">普通访问</span>
                  <span v-if="isInKeepQueue(queueKeyForRoute(item))" class="status-badge keep">已保留</span>
                  <span v-if="isInDeleteQueue(queueKeyForRoute(item))" class="status-badge delete">待删除</span>
                </div>

                <div class="queue-actions">
                  <button
                    type="button"
                    class="queue-btn keep-btn"
                    :class="{ active: isInKeepQueue(queueKeyForRoute(item)) }"
                    @click="addRouteToKeepQueue(item)"
                  >
                    保留
                  </button>
                  <button
                    type="button"
                    class="queue-btn delete-btn"
                    :class="{ active: isInDeleteQueue(queueKeyForRoute(item)) }"
                    @click="addRouteToDeleteQueue(item)"
                  >
                    删除
                  </button>
                </div>
              </article>
            </div>
          </section>

          <section class="content-panel">
            <div class="panel-heading">
              <div>
                <h2>默认重定向</h2>
                <p>这些路径没有独立 Vue 页面，只负责把父级入口导向默认目标页。</p>
              </div>
              <span class="result-count">{{ filteredRedirectPages.length }} / {{ redirectPages.length }}</span>
            </div>

            <div v-if="filteredRedirectPages.length === 0" class="empty-state">
              没有匹配到重定向入口。
            </div>

            <div v-else class="redirect-list">
              <div v-for="item in filteredRedirectPages" :key="item.path" class="redirect-row">
                <code>{{ item.path }}</code>
                <span>指向</span>
                <code>{{ item.redirectText }}</code>
                <p>{{ item.description }}</p>
              </div>
            </div>
          </section>

          <section class="content-panel">
            <div class="panel-heading">
              <div>
                <h2>未挂路由的 Vue 视图</h2>
                <p>这些文件在 `src/views` 下，但不是独立路由入口，通常被某个页面内部引用。</p>
              </div>
              <span class="result-count">{{ filteredOrphanViewFiles.length }} / {{ orphanViewFiles.length }}</span>
            </div>

            <div v-if="filteredOrphanViewFiles.length === 0" class="empty-state">
              没有匹配到未挂路由视图。
            </div>

            <div v-else class="orphan-list">
              <div
                v-for="item in filteredOrphanViewFiles"
                :key="item.path"
                class="orphan-row"
                :class="{
                  'queued-keep': isInKeepQueue(queueKeyForView(item)),
                  'queued-delete': isInDeleteQueue(queueKeyForView(item))
                }"
              >
                <div class="orphan-title-row">
                  <span>{{ item.name }}</span>
                  <div class="queue-actions compact">
                    <button
                      type="button"
                      class="queue-btn keep-btn"
                      :class="{ active: isInKeepQueue(queueKeyForView(item)) }"
                      @click="addViewToKeepQueue(item)"
                    >
                      保留
                    </button>
                    <button
                      type="button"
                      class="queue-btn delete-btn"
                      :class="{ active: isInDeleteQueue(queueKeyForView(item)) }"
                      @click="addViewToDeleteQueue(item)"
                    >
                      删除
                    </button>
                  </div>
                </div>
                <code>{{ item.path }}</code>
                <p>{{ item.description }}</p>
              </div>
            </div>
          </section>
        </div>

        <aside class="queue-sidebar" aria-label="整理队列">
          <section class="queue-panel">
            <div class="queue-panel-head">
              <div>
                <h2>删除 Vue 页面列表</h2>
                <p>点击页面卡片里的“删除”后，会先进入这个队列。</p>
              </div>
              <span>{{ deleteQueue.length }}</span>
            </div>

            <div v-if="deleteQueue.length === 0" class="queue-empty">
              暂无待删除页面。
            </div>

            <div v-else class="queue-content">
              <div class="copy-actions">
                <button type="button" class="copy-btn primary" @click="copyDeleteQueueSummary">
                  复制删除清单
                </button>
                <button type="button" class="copy-btn" @click="copyDeleteQueuePaths">
                  复制路径
                </button>
                <button type="button" class="copy-btn" @click="copyDeleteQueueNames">
                  复制页面名
                </button>
              </div>
              <p v-if="copyStatus" class="copy-status">{{ copyStatus }}</p>

              <div class="delete-queue-list">
                <article v-for="item in deleteQueue" :key="item.key" class="delete-queue-item">
                  <div>
                    <strong>{{ item.name }}</strong>
                    <code>{{ item.filePath }}</code>
                    <p v-if="item.routePath">{{ item.routePath }}</p>
                  </div>
                  <button type="button" class="remove-queue-btn" @click="removeFromDeleteQueue(item.key)">
                    移除
                  </button>
                </article>
              </div>
            </div>
          </section>

          <section class="queue-panel keep-panel">
            <div class="queue-panel-head">
              <div>
                <h2>保留队列</h2>
                <p>已确认要留下的入口，避免后续清理时误删。</p>
              </div>
              <span>{{ keepQueue.length }}</span>
            </div>

            <div v-if="keepQueue.length === 0" class="queue-empty">
              暂无保留标记。
            </div>

            <div v-else class="keep-queue-list">
              <article v-for="item in keepQueue" :key="item.key" class="keep-queue-item">
                <div>
                  <strong>{{ item.name }}</strong>
                  <code>{{ item.filePath }}</code>
                </div>
                <button type="button" class="remove-queue-btn" @click="removeFromKeepQueue(item.key)">
                  移除
                </button>
              </article>
            </div>
          </section>
        </aside>
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import UnifiedNavbar from '@/components/UnifiedNavbar/index.vue';
import { useAuthStore } from '@/stores/auth';
import { redirectCatalog, routeCatalog, routeComponentPaths } from './pageCatalog.js';

const router = useRouter();
const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);

const keyword = ref('');
const activeCategory = ref('all');
const copyStatus = ref('');

const viewModules = import.meta.glob('/src/views/**/*.vue');
const QUEUE_STORAGE_KEYS = {
  keep: 'boh-global-pages-index-keep-queue',
  delete: 'boh-global-pages-index-delete-queue'
};

const currentUsername = computed(() => {
  const fromStore = String(userInfo.value?.username || '').trim();
  if (fromStore) return fromStore;
  const fromLocal = String(localStorage.getItem('username') || '').trim();
  return fromLocal || 'guest';
});

const normalizeComponentPath = (pathText) => {
  const text = String(pathText || '').trim();
  if (!text) return '未知组件';

  const srcFlag = '/src/';
  const srcIndex = text.lastIndexOf(srcFlag);
  if (srcIndex >= 0) {
    return `src/${text.slice(srcIndex + srcFlag.length)}`;
  }

  if (text.startsWith('@/')) {
    return `src/${text.slice(2)}`;
  }

  if (text.includes('/views/')) {
    return `src/views/${text.split('/views/').pop()}`;
  }

  if (text.startsWith('/src/')) {
    return text.slice(1);
  }

  return text.replace(/^(\.\/|\.\.\/)+/, 'src/');
};

const extractComponentPath = (record) => {
  const component = record?.components?.default || record?.component;
  if (!component) return '未配置组件';

  if (typeof component === 'function') {
    const funcText = String(component);
    const importMatch = funcText.match(/import\((['"`])([^'"`]+\.vue)\1\)/);
    if (importMatch && importMatch[2]) {
      return normalizeComponentPath(importMatch[2]);
    }
    return '动态组件';
  }

  if (typeof component === 'object' && component) {
    if (component.__file) {
      return normalizeComponentPath(component.__file);
    }
    return component.name ? `静态组件：${component.name}` : '静态组件';
  }

  return '未知组件';
};

const getRedirectText = (redirect) => {
  if (!redirect) return '';
  if (typeof redirect === 'string') return redirect;
  if (typeof redirect === 'object') return redirect.path || redirect.name || '对象重定向';
  return '函数重定向';
};

const buildJumpPath = (rawPath) => {
  const template = String(rawPath || '');
  if (!template || template.includes('*')) return '';

  return template.replace(/:([A-Za-z0-9_]+)(\([^)]*\))?([?+*])?/g, (_all, paramName) => {
    const key = String(paramName || '');
    if (key === 'username') return encodeURIComponent(currentUsername.value);
    if (key === 'id') return '1';
    if (key === 'projectId') return 'demo-project';
    return `demo-${key}`;
  });
};

const buildJumpHref = (rawPath) => {
  const jumpPath = buildJumpPath(rawPath);
  if (!jumpPath) return '';

  try {
    return router.resolve(jumpPath).href || '';
  } catch (_error) {
    return '';
  }
};

const readQueueFromStorage = (key) => {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(key);
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item?.key) : [];
  } catch (_error) {
    return [];
  }
};

const keepQueue = ref(readQueueFromStorage(QUEUE_STORAGE_KEYS.keep));
const deleteQueue = ref(readQueueFromStorage(QUEUE_STORAGE_KEYS.delete));

watch(keepQueue, (items) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(QUEUE_STORAGE_KEYS.keep, JSON.stringify(items));
}, { deep: true });

watch(deleteQueue, (items) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(QUEUE_STORAGE_KEYS.delete, JSON.stringify(items));
}, { deep: true });

const queueKeyForRoute = (item) => `route:${item.path}`;
const queueKeyForView = (item) => `view:${item.path}`;

const buildRouteQueueItem = (item) => ({
  key: queueKeyForRoute(item),
  type: 'route',
  name: item.displayName,
  filePath: item.componentPath,
  routePath: item.path,
  category: item.category
});

const buildViewQueueItem = (item) => ({
  key: queueKeyForView(item),
  type: 'view',
  name: item.name,
  filePath: item.path,
  routePath: '',
  category: '未挂路由视图'
});

const upsertQueueItem = (queueRef, nextItem) => {
  queueRef.value = [
    nextItem,
    ...queueRef.value.filter((item) => item.key !== nextItem.key)
  ];
};

const removeQueueItem = (queueRef, key) => {
  queueRef.value = queueRef.value.filter((item) => item.key !== key);
};

const addToKeepQueue = (item) => {
  upsertQueueItem(keepQueue, item);
  removeQueueItem(deleteQueue, item.key);
};

const addToDeleteQueue = (item) => {
  upsertQueueItem(deleteQueue, item);
  removeQueueItem(keepQueue, item.key);
};

const addRouteToKeepQueue = (item) => addToKeepQueue(buildRouteQueueItem(item));
const addRouteToDeleteQueue = (item) => addToDeleteQueue(buildRouteQueueItem(item));
const addViewToKeepQueue = (item) => addToKeepQueue(buildViewQueueItem(item));
const addViewToDeleteQueue = (item) => addToDeleteQueue(buildViewQueueItem(item));
const removeFromKeepQueue = (key) => removeQueueItem(keepQueue, key);
const removeFromDeleteQueue = (key) => removeQueueItem(deleteQueue, key);
const isInKeepQueue = (key) => keepQueue.value.some((item) => item.key === key);
const isInDeleteQueue = (key) => deleteQueue.value.some((item) => item.key === key);

const deleteQueueSummaryText = computed(() => {
  return deleteQueue.value
    .map((item) => {
      const routeText = item.routePath ? ` | 路由: ${item.routePath}` : '';
      return `${item.name} | Vue: ${item.filePath}${routeText}`;
    })
    .join('\n');
});

const deleteQueuePathText = computed(() => {
  return deleteQueue.value.map((item) => item.filePath).join('\n');
});

const deleteQueueNameText = computed(() => {
  return deleteQueue.value.map((item) => item.name).join('\n');
});

const writeClipboardText = async (text, successMessage) => {
  const value = String(text || '').trim();
  if (!value) {
    copyStatus.value = '删除队列为空，暂无可复制内容。';
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', 'readonly');
      textarea.style.position = 'fixed';
      textarea.style.top = '-999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    copyStatus.value = successMessage;
  } catch (_error) {
    copyStatus.value = '复制失败，请检查浏览器剪贴板权限。';
  }
};

const copyDeleteQueueSummary = () => writeClipboardText(
  deleteQueueSummaryText.value,
  `已复制 ${deleteQueue.value.length} 条删除清单。`
);

const copyDeleteQueuePaths = () => writeClipboardText(
  deleteQueuePathText.value,
  `已复制 ${deleteQueue.value.length} 个 Vue 路径。`
);

const copyDeleteQueueNames = () => writeClipboardText(
  deleteQueueNameText.value,
  `已复制 ${deleteQueue.value.length} 个页面名。`
);

const matchesKeyword = (item, fields) => {
  const q = String(keyword.value || '').trim().toLowerCase();
  if (!q) return true;

  return fields.some((field) => String(item[field] || '').toLowerCase().includes(q));
};

const routedPages = computed(() => {
  const seen = new Set();

  return router
    .getRoutes()
    .filter((record) => !record.aliasOf)
    .filter((record) => Boolean(record.path))
    .filter((record) => Boolean(record.components?.default || record.component))
    .map((record) => {
      const path = String(record.path);
      const name = record.name ? String(record.name) : '';
      const detail = routeCatalog[name] || {};
      const redirectText = getRedirectText(record.redirect);

      return {
        path,
        routeName: name,
        displayName: detail.title || name || path,
        category: detail.category || '未分类',
        description: detail.description || '暂未补充说明，可在 routeCatalog 中继续完善。',
        componentPath: routeComponentPaths[name] || extractComponentPath(record),
        hasDynamicParams: path.includes(':'),
        redirectText,
        requiresAdmin: Boolean(record.meta?.requiresAdmin),
        upcoming: Boolean(record.meta?.upcoming),
        jumpHref: buildJumpHref(path)
      };
    })
    .filter((item) => {
      if (seen.has(item.path)) return false;
      seen.add(item.path);
      return true;
    })
    .sort((a, b) => {
      const categorySort = a.category.localeCompare(b.category, 'zh-Hans-CN');
      if (categorySort !== 0) return categorySort;
      return a.path.localeCompare(b.path, 'zh-Hans-CN');
    });
});

const redirectPages = computed(() => {
  const routedPaths = new Set(routedPages.value.map((item) => item.path));

  return router
    .getRoutes()
    .filter((record) => !record.aliasOf)
    .filter((record) => Boolean(record.redirect))
    .filter((record) => !routedPaths.has(record.path))
    .map((record) => {
      const path = String(record.path);
      return {
        path,
        category: '默认重定向',
        redirectText: getRedirectText(record.redirect),
        description: redirectCatalog[path] || '父级入口导向默认目标页。'
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path, 'zh-Hans-CN'));
});

const viewFiles = computed(() => {
  return Object.keys(viewModules)
    .map((path) => path.replace(/^\/src\//, 'src/'))
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
});

const routedComponentPaths = computed(() => {
  return new Set(
    routedPages.value
      .map((item) => item.componentPath)
      .filter((path) => path.startsWith('src/views/'))
  );
});

const orphanViewFiles = computed(() => {
  return viewFiles.value
    .filter((path) => !routedComponentPaths.value.has(path))
    .map((path) => {
      const parts = path.split('/');
      const fileName = parts[parts.length - 1] || path;
      const parentName = parts[parts.length - 2] || '';
      const isInternal = path.includes('/components/') || path.includes('/panels/');

      return {
        path,
        name: fileName === 'index.vue' ? parentName : fileName.replace(/\.vue$/, ''),
        description: isInternal
          ? '页面内部拆分组件，不建议作为独立路由入口。'
          : '位于 views 目录但当前没有注册到 Vue Router，可检查是否为备用页面、废弃页面或待接入页面。'
      };
    });
});

const categoryTabs = computed(() => {
  const categories = routedPages.value.reduce((acc, item) => {
    acc.set(item.category, (acc.get(item.category) || 0) + 1);
    return acc;
  }, new Map());

  return [
    { key: 'all', label: '全部路由', count: routedPages.value.length },
    ...Array.from(categories.entries()).map(([category, count]) => ({
      key: category,
      label: category,
      count
    })),
    { key: 'redirects', label: '默认重定向', count: redirectPages.value.length },
    { key: 'orphan', label: '未挂路由视图', count: orphanViewFiles.value.length }
  ];
});

const filteredRoutedPages = computed(() => {
  if (activeCategory.value === 'redirects' || activeCategory.value === 'orphan') return [];

  return routedPages.value
    .filter((item) => activeCategory.value === 'all' || item.category === activeCategory.value)
    .filter((item) => matchesKeyword(item, [
      'path',
      'routeName',
      'displayName',
      'category',
      'description',
      'componentPath',
      'redirectText'
    ]));
});

const filteredRedirectPages = computed(() => {
  if (activeCategory.value !== 'all' && activeCategory.value !== 'redirects') return [];

  return redirectPages.value.filter((item) => matchesKeyword(item, [
    'path',
    'category',
    'redirectText',
    'description'
  ]));
});

const filteredOrphanViewFiles = computed(() => {
  if (activeCategory.value !== 'all' && activeCategory.value !== 'orphan') return [];

  return orphanViewFiles.value.filter((item) => matchesKeyword(item, [
    'path',
    'name',
    'description'
  ]));
});
</script>

<style scoped>
.global-pages-index-page {
  min-height: 100vh;
  background: #f6f7f9;
  color: #172033;
}

.page-shell {
  width: min(1180px, calc(100% - 32px));
  margin: 0 auto;
  padding: 96px 0 56px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-end;
}

.eyebrow {
  margin: 0 0 8px;
  color: #4f6f52;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.page-title {
  margin: 0;
  color: #111827;
  font-size: 32px;
  line-height: 1.2;
  letter-spacing: 0;
}

.page-subtitle {
  max-width: 760px;
  margin: 10px 0 0;
  color: #596273;
  font-size: 14px;
  line-height: 1.7;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}

.summary-card,
.toolbar-panel,
.content-panel {
  border: 1px solid rgba(23, 32, 51, 0.1);
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 8px 24px rgba(23, 32, 51, 0.06);
}

.summary-card {
  min-height: 88px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.summary-label {
  color: #697386;
  font-size: 13px;
}

.summary-card strong {
  color: #172033;
  font-size: 28px;
  line-height: 1;
}

.summary-card.danger strong {
  color: #ad3434;
}

.toolbar-panel {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-input {
  width: 100%;
  min-height: 44px;
  border: 1px solid #ccd3df;
  border-radius: 8px;
  padding: 0 14px;
  color: #172033;
  font-size: 14px;
  outline: none;
}

.search-input:focus {
  border-color: #3b6f5a;
  box-shadow: 0 0 0 3px rgba(59, 111, 90, 0.14);
}

.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.category-tab {
  min-height: 34px;
  border: 1px solid #d8dde7;
  border-radius: 8px;
  background: #f8fafc;
  color: #344054;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.category-tab span {
  min-width: 22px;
  border-radius: 999px;
  background: #e8edf3;
  color: #526071;
  padding: 2px 7px;
  font-size: 11px;
}

.category-tab.active {
  border-color: #3b6f5a;
  background: #eaf4ee;
  color: #244b39;
}

.category-tab.active span {
  background: #cfe5d6;
  color: #244b39;
}

.content-panel {
  padding: 16px;
}

.workspace-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
  align-items: start;
}

.workspace-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.queue-sidebar {
  position: sticky;
  top: 84px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-heading {
  margin-bottom: 14px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.panel-heading h2 {
  margin: 0;
  color: #172033;
  font-size: 18px;
  line-height: 1.3;
}

.panel-heading p {
  margin: 6px 0 0;
  color: #697386;
  font-size: 13px;
  line-height: 1.5;
}

.result-count {
  flex: 0 0 auto;
  color: #697386;
  font-size: 13px;
  font-weight: 700;
}

.entry-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.entry-card {
  border: 1px solid #e1e5ec;
  border-radius: 8px;
  background: #fbfcfd;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.entry-card.queued-keep,
.orphan-row.queued-keep {
  border-color: #9bc9a9;
  background: #f5fbf7;
}

.entry-card.queued-delete,
.orphan-row.queued-delete {
  border-color: #f0a6a6;
  background: #fff8f8;
}

.entry-card-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.category-pill,
.status-badge {
  width: fit-content;
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 800;
}

.category-pill {
  display: inline-flex;
  margin-bottom: 7px;
  background: #edf1f7;
  color: #526071;
}

.entry-card h3 {
  margin: 0;
  color: #172033;
  font-size: 17px;
  line-height: 1.35;
}

.open-link {
  min-width: 54px;
  min-height: 32px;
  border-radius: 8px;
  background: #263a2f;
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
}

.open-link.disabled {
  background: #d8dde7;
  color: #697386;
}

.entry-description {
  margin: 0;
  color: #445064;
  font-size: 13px;
  line-height: 1.65;
}

.entry-meta {
  margin: 0;
  display: grid;
  gap: 8px;
}

.entry-meta div {
  min-width: 0;
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 8px;
}

.entry-meta dt {
  color: #697386;
  font-size: 12px;
  font-weight: 800;
}

.entry-meta dd {
  min-width: 0;
  margin: 0;
  color: #273244;
  font-size: 12px;
  overflow-wrap: anywhere;
}

code {
  border-radius: 6px;
  background: #eef2f6;
  color: #243348;
  padding: 2px 6px;
  font-family: 'SF Mono', Monaco, Consolas, monospace;
  font-size: 12px;
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.status-badge.blue {
  background: #e8f1ff;
  color: #2458a6;
}

.status-badge.red {
  background: #fff0f0;
  color: #ad3434;
}

.status-badge.amber {
  background: #fff5da;
  color: #8a5a00;
}

.status-badge.green {
  background: #eaf4ee;
  color: #2f684d;
}

.status-badge.keep {
  background: #dcefe4;
  color: #24563d;
}

.status-badge.delete {
  background: #ffe1e1;
  color: #a83434;
}

.queue-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.queue-actions.compact {
  flex: 0 0 auto;
}

.queue-btn,
.remove-queue-btn {
  border: 1px solid #d8dde7;
  border-radius: 8px;
  min-height: 32px;
  background: #ffffff;
  color: #344054;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.queue-btn.keep-btn.active,
.queue-btn.keep-btn:hover {
  border-color: #74ad86;
  background: #eaf4ee;
  color: #24563d;
}

.queue-btn.delete-btn.active,
.queue-btn.delete-btn:hover {
  border-color: #e98b8b;
  background: #fff0f0;
  color: #a83434;
}

.redirect-list,
.orphan-list {
  display: grid;
  gap: 8px;
}

.redirect-row,
.orphan-row {
  border: 1px solid #e1e5ec;
  border-radius: 8px;
  background: #fbfcfd;
  padding: 12px;
}

.redirect-row {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) auto minmax(160px, 1fr);
  gap: 10px;
  align-items: center;
}

.redirect-row span {
  color: #697386;
  font-size: 12px;
}

.redirect-row p,
.orphan-row p {
  grid-column: 1 / -1;
  margin: 4px 0 0;
  color: #596273;
  font-size: 13px;
  line-height: 1.5;
}

.orphan-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  align-items: start;
}

.orphan-title-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.orphan-title-row span {
  color: #172033;
  font-size: 13px;
  font-weight: 800;
}

.orphan-row code {
  overflow-wrap: anywhere;
}

.queue-panel {
  border: 1px solid rgba(23, 32, 51, 0.1);
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 8px 24px rgba(23, 32, 51, 0.06);
  padding: 14px;
}

.queue-panel-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
}

.queue-panel-head h2 {
  margin: 0;
  color: #172033;
  font-size: 16px;
  line-height: 1.35;
}

.queue-panel-head p {
  margin: 5px 0 0;
  color: #697386;
  font-size: 12px;
  line-height: 1.5;
}

.queue-panel-head > span {
  min-width: 28px;
  border-radius: 999px;
  background: #fff0f0;
  color: #ad3434;
  padding: 4px 8px;
  text-align: center;
  font-size: 12px;
  font-weight: 900;
}

.keep-panel .queue-panel-head > span {
  background: #eaf4ee;
  color: #24563d;
}

.queue-empty {
  border: 1px dashed #c9d1dd;
  border-radius: 8px;
  color: #697386;
  padding: 18px 12px;
  text-align: center;
  font-size: 13px;
}

.queue-content {
  display: grid;
  gap: 10px;
}

.copy-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.copy-btn {
  border: 1px solid #d8dde7;
  border-radius: 8px;
  min-height: 34px;
  background: #ffffff;
  color: #344054;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.copy-btn.primary {
  grid-column: 1 / -1;
  border-color: #263a2f;
  background: #263a2f;
  color: #ffffff;
}

.copy-btn:hover {
  border-color: #b7c0ce;
  background: #f5f7fa;
}

.copy-btn.primary:hover {
  border-color: #1c2e24;
  background: #1c2e24;
}

.copy-status {
  margin: 0;
  border-radius: 8px;
  background: #eef7f1;
  color: #24563d;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
}

.delete-queue-list,
.keep-queue-list {
  display: grid;
  gap: 8px;
  max-height: 42vh;
  overflow: auto;
}

.delete-queue-item,
.keep-queue-item {
  border: 1px solid #e1e5ec;
  border-radius: 8px;
  background: #fbfcfd;
  padding: 10px;
  display: grid;
  gap: 8px;
}

.delete-queue-item strong,
.keep-queue-item strong {
  display: block;
  margin-bottom: 6px;
  color: #172033;
  font-size: 13px;
  line-height: 1.4;
}

.delete-queue-item code,
.keep-queue-item code {
  display: block;
  overflow-wrap: anywhere;
}

.delete-queue-item p {
  margin: 6px 0 0;
  color: #697386;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.remove-queue-btn {
  justify-self: start;
}

.remove-queue-btn:hover {
  border-color: #b7c0ce;
  background: #f5f7fa;
}

.empty-state {
  border: 1px dashed #c9d1dd;
  border-radius: 8px;
  color: #697386;
  padding: 28px 16px;
  text-align: center;
  font-size: 14px;
}

@media (max-width: 900px) {
  .summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .entry-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .workspace-layout {
    grid-template-columns: 1fr;
  }

  .queue-sidebar {
    position: static;
    order: -1;
  }

  .redirect-row,
  .orphan-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .page-shell {
    width: min(100% - 24px, 1180px);
    padding: 78px 0 32px;
  }

  .page-header,
  .panel-heading {
    flex-direction: column;
    align-items: stretch;
  }

  .page-title {
    font-size: 26px;
  }

  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .entry-grid {
    grid-template-columns: 1fr;
  }

  .orphan-title-row {
    flex-direction: column;
    align-items: stretch;
  }

  .entry-meta div {
    grid-template-columns: 1fr;
    gap: 3px;
  }
}
</style>
