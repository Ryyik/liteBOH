<template>
  <div class="ov">
    <aside class="ov-side" aria-label="后台导航">
      <div class="ov-brand">
        <span class="ov-brand-dot"></span>
        <span class="ov-brand-text">BOH 控制台</span>
      </div>

      <nav class="ov-nav">
        <span class="ov-nav-item is-active">概览</span>
        <a
          v-for="mod in navModules"
          :key="mod.id"
          class="ov-nav-item"
          :href="moduleHref(mod)"
          @click.prevent="go(moduleHref(mod))"
        >
          {{ mod.label }}
        </a>
      </nav>

      <a class="ov-side-foot" :href="panelHref" @click.prevent="go(panelHref)">完整面板 →</a>
    </aside>

    <main class="ov-main">
      <header class="ov-head">
        <p class="ov-eyebrow">概览</p>
        <h1>今天，做点什么？</h1>
      </header>

      <form
        v-if="selectedAction"
        class="ov-command ov-form"
        :class="{ 'is-open': showMore }"
        @submit.prevent="openPreview"
      >
        <div class="ov-form-head">
          <span class="ov-action-chip">
            @{{ selectedAction.label }}
            <button type="button" aria-label="退出动作" @click="exitAction">
              <X :size="12" />
            </button>
          </span>
          <span
            class="ov-form-hint"
            aria-live="polite"
            :class="{ 'is-error': hasError || (anyTouched && Boolean(validateMessage)) }"
          >
            {{ hintText }}
          </span>
          <button
            v-if="moreParams.length > 0"
            type="button"
            class="ov-form-toggle"
            :aria-expanded="showMore"
            @click="showMore = !showMore"
          >
            更多设置
            <span v-if="!showMore && missingMoreCount > 0" class="ov-form-toggle-count">
              还有 {{ missingMoreCount }} 项可选
            </span>
            <ChevronDown :size="13" :class="{ 'is-up': showMore }" />
          </button>
          <button type="submit" class="ov-run" :disabled="Boolean(validateMessage) || submitting">
            预览
          </button>
        </div>

        <div class="ov-form-row">
          <label v-for="param in mainParams" :key="param.key" class="ov-field">
            <span class="ov-field-label">
              {{ param.label }}<em v-if="param.required" aria-hidden="true">*</em>
            </span>
            <input
              :ref="(el) => setSlotRef(param.key, el)"
              v-model="draft[param.key]"
              class="ov-field-input"
              :class="{
                'is-missing': param.required && touched[param.key] && !isParamFilled(param),
              }"
              :type="inputType(param)"
              :placeholder="param.placeholder || param.label"
              :min="param.min"
              :maxlength="param.maxLength"
              :aria-label="param.label"
              @input="errorText = ''"
              @blur="markTouched(param.key)"
            />
            <small v-if="param.hint" class="ov-field-hint">{{ param.hint }}</small>
          </label>
        </div>

        <!-- 更多设置：字段多，默认收起，只显示已填数量，避免一上来就是一堵墙 -->
        <div v-if="showMore" class="ov-form-row ov-form-more">
          <template v-for="param in moreParams" :key="param.key">
            <label v-if="param.type === 'switch'" class="ov-field is-switch">
              <span class="ov-field-label">{{ param.label }}</span>
              <button
                type="button"
                class="ov-switch"
                role="switch"
                :aria-checked="draft[param.key] === true"
                :class="{ 'is-on': draft[param.key] === true }"
                @click="draft[param.key] = draft[param.key] !== true"
              >
                <span class="ov-switch-dot"></span>
                <span class="ov-switch-text">{{ draft[param.key] === true ? '开' : '关' }}</span>
              </button>
              <small v-if="param.hint" class="ov-field-hint">{{ param.hint }}</small>
            </label>

            <label v-else-if="param.type === 'select'" class="ov-field">
              <span class="ov-field-label">{{ param.label }}</span>
              <select v-model="draft[param.key]" class="ov-field-input" @change="errorText = ''">
                <option v-for="option in param.options" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
              <small v-if="param.hint" class="ov-field-hint">{{ param.hint }}</small>
            </label>

            <label v-else-if="param.type === 'textarea'" class="ov-field is-wide">
              <span class="ov-field-label">{{ param.label }}</span>
              <textarea
                v-model="draft[param.key]"
                class="ov-field-input"
                :rows="param.rows || 2"
                :maxlength="param.maxLength"
                :placeholder="param.placeholder || ''"
                @input="errorText = ''"
                @blur="markTouched(param.key)"
              ></textarea>
            </label>

            <label v-else class="ov-field" :class="{ 'is-wide': param.key === 'cover_image_url' }">
              <span class="ov-field-label">
                {{ param.label }}<em v-if="param.required" aria-hidden="true">*</em>
              </span>
              <input
                :ref="(el) => setSlotRef(param.key, el)"
                v-model="draft[param.key]"
                class="ov-field-input"
                :class="{
                  'is-missing': param.required && touched[param.key] && !isParamFilled(param),
                }"
                :type="inputType(param)"
                :placeholder="param.placeholder || param.label"
                :min="param.min"
                :maxlength="param.maxLength"
                :aria-label="param.label"
                @input="errorText = ''"
                @blur="markTouched(param.key)"
              />
              <small v-if="param.hint" class="ov-field-hint">{{ param.hint }}</small>
            </label>
          </template>

          <!-- 派生字段：只读，值由其他字段算出来（中奖人数跟着保底规则变） -->
          <div v-for="item in derivedParams" :key="item.key" class="ov-field is-derived">
            <span class="ov-field-label">{{ item.label }}</span>
            <span class="ov-field-readonly">{{ item.compute(draft) }}</span>
            <small class="ov-field-hint">由保底规则自动决定，不能手改</small>
          </div>
        </div>
      </form>

      <div v-else class="ov-command" :class="{ 'is-open': showResults }">
        <Search :size="16" class="ov-command-icon" aria-hidden="true" />
        <input
          ref="inputRef"
          v-model="raw"
          class="ov-command-input"
          type="text"
          autocomplete="off"
          spellcheck="false"
          :placeholder="placeholder"
          aria-label="搜索功能，或输入 @ 执行动作"
          @keydown="onKeydown"
          @focus="focused = true"
          @blur="onBlur"
        />
        <kbd v-if="!raw" class="ov-command-kbd">⌘K</kbd>
        <button v-else class="ov-command-clear" type="button" aria-label="清空" @click="reset">
          <X :size="14" />
        </button>

        <div v-if="showResults" class="ov-results" role="listbox">
          <p class="ov-results-head">{{ isActionMode ? '动作' : '搜索结果' }}</p>
          <button
            v-for="(row, index) in results"
            :key="row.key"
            type="button"
            role="option"
            :aria-selected="index === cursor"
            :class="['ov-result', { 'is-cursor': index === cursor }]"
            @mouseenter="cursor = index"
            @mousedown.prevent="runResult(row)"
          >
            <span class="ov-result-label">{{ row.label }}</span>
            <span class="ov-result-meta">{{ row.meta }}</span>
            <span v-if="row.risk === 'high'" class="ov-result-risk">需在目标页确认</span>
            <CornerDownLeft :size="13" class="ov-result-enter" aria-hidden="true" />
          </button>
          <p v-if="results.length === 0" class="ov-results-empty">
            {{
              isActionMode
                ? '没有匹配的动作，试试 @抽奖 / @发货'
                : `没有找到「${raw.trim()}」，要创建内容请输入 @`
            }}
          </p>
        </div>
      </div>

      <div v-if="previewOpen && selectedAction" class="ov-preview">
        <p class="ov-preview-head">将要创建 · 草稿</p>
        <div v-for="section in previewSections" :key="section.title" class="ov-preview-section">
          <p class="ov-preview-sub">{{ section.title }}</p>
          <dl class="ov-preview-list">
            <div v-for="row in section.rows" :key="row.label">
              <dt>{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            </div>
          </dl>
        </div>
        <ul v-if="previewChecks.length > 0" class="ov-preview-checks">
          <li v-for="check in previewChecks" :key="check.text" :class="`is-${check.tone}`">
            {{ check.text }}
          </li>
        </ul>
        <p v-if="errorText" class="ov-preview-error">{{ errorText }}</p>
        <div class="ov-preview-actions">
          <button type="button" class="ov-ghost" @click="previewOpen = false">返回修改</button>
          <button type="button" class="ov-run" :disabled="submitting" @click="confirmCreate">
            {{ submitting ? '创建中…' : '确认创建' }}
          </button>
        </div>
      </div>

      <div v-if="createdRecord" class="ov-done">
        <span>已创建「{{ createdRecord.title || '抽奖' }}」，状态为草稿</span>
        <button type="button" class="ov-ghost" @click="openDetail">去查看</button>
        <button type="button" class="ov-ghost" @click="exitAction">再来一个</button>
      </div>

      <section class="ov-cards" aria-label="概览状态">
        <button
          v-for="card in cards"
          :key="card.id"
          type="button"
          class="ov-card"
          :class="{ 'is-zero': card.value === 0, 'is-unknown': card.value === null }"
          @click="goCard(card)"
        >
          <span class="ov-card-label">{{ card.label }}</span>
          <span class="ov-card-value">{{ card.value === null ? '—' : card.value }}</span>
        </button>
      </section>

      <section class="ov-inbox" aria-label="待处理">
        <header class="ov-inbox-head">
          <h2>待处理</h2>
          <span v-if="pendingCount > 0" class="ov-badge">{{ pendingCount }}</span>
          <span v-else-if="!loading" class="ov-badge is-idle">0</span>
          <a class="ov-inbox-all" :href="panelHref" @click.prevent="go(panelHref)">全部 →</a>
        </header>

        <div v-if="loading" class="ov-inbox-empty">正在读取…</div>
        <div v-else-if="visibleInbox.length === 0" class="ov-inbox-empty">
          <Inbox :size="22" stroke-width="1.6" aria-hidden="true" />
          <span>没有待处理事项，站点运行正常</span>
        </div>
        <ul v-else class="ov-inbox-list">
          <li v-for="item in visibleInbox" :key="item.id" class="ov-inbox-row">
            <span class="ov-dot" :class="`is-${item.severity}`" aria-hidden="true"></span>
            <span class="ov-row-type">{{ item.type }}</span>
            <span class="ov-row-title">{{ item.title }}</span>
            <time class="ov-row-time" :datetime="item.createdAt">{{
              relativeTime(item.createdAt)
            }}</time>
            <button type="button" class="ov-row-action" @click="go(item.to)">
              {{ item.actionLabel }}
            </button>
          </li>
        </ul>
      </section>

      <p class="ov-tip">
        输入 <code>@</code> 只能执行动作；不带 <code>@</code> 的输入只用于查找功能与记录。
      </p>
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { ChevronDown, CornerDownLeft, Inbox, Search, X } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { tabModules } from '@/views/DataManagement/config/tabs.js';
import {
  buildAdminFunctionIndex,
  searchAdminFunctions,
} from '@/views/DataManagement/config/function-index.js';
import { canViewModule } from '@/views/DataManagement/config/rbac.js';
import {
  buildActionRoute,
  filterActions,
  initialDraft,
  validateDraft,
  visibleParams,
} from './actions/registry.js';
import { fetchOverviewSnapshot } from '@/utils/api/admin-overview-api.js';

const router = useRouter();
const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);

const panelHref = '/admin/data-management';
const role = computed(() => userInfo.value?.role || 'admin');
const navModules = computed(() => tabModules.filter((mod) => canViewModule(role.value, mod.id)));
const functions = computed(() => buildAdminFunctionIndex({ role: role.value }));

const inputRef = ref(null);
const raw = ref('');
const cursor = ref(0);
const focused = ref(false);

/* ── `@` 动作的参数区（P1） ─────────────────────────────────────────────
   选中带 params 的动作后，命令栏原地切成表单：主行放最常用的 4 项，
   其余收进「更多设置」；齐了才能预览，预览确认后才真正写入。 */
const selectedAction = ref(null);
const draft = ref({});
const slotRefs = {};
const previewOpen = ref(false);
const showMore = ref(false);
const submitting = ref(false);
const createdRecord = ref(null);
const errorText = ref('');
const hasError = computed(() => Boolean(errorText.value));

const isActionMode = computed(() => /^[@＠]/.test(raw.value.trimStart()));
const actionQuery = computed(() => (isActionMode.value ? raw.value.trimStart().slice(1) : ''));
const placeholder = computed(() =>
  isActionMode.value
    ? '选择要执行的动作，↑↓ 选择，↵ 打开'
    : '搜索功能、用户、订单，或输入 @ 执行动作',
);

const results = computed(() => {
  if (isActionMode.value) {
    return filterActions(actionQuery.value).map((action) => ({
      key: `action-${action.id}`,
      kind: 'action',
      label: `@${action.label}`,
      meta: action.desc,
      risk: action.risk,
      action,
    }));
  }
  const query = raw.value.trim();
  if (!query) return [];
  return searchAdminFunctions(functions.value, query, { limit: 8 })
    .filter((entry) => !entry.denied)
    .map((entry) => ({
      key: entry.key,
      kind: entry.kind,
      label: entry.label,
      meta: [
        entry.moduleLabel,
        entry.kind === 'tab' ? '页签' : entry.kind === 'section' ? '子页' : '模块',
      ]
        .filter(Boolean)
        .join(' · '),
      entry,
    }));
});

const showResults = computed(
  () =>
    !selectedAction.value &&
    focused.value &&
    results.value.length > 0 &&
    raw.value.trim().length > 0,
);

const validateMessage = computed(() =>
  selectedAction.value ? validateDraft(selectedAction.value, draft.value) : '',
);

/* 不在用户还没动过任何字段时就写「还缺 XX」并把输入框描红 —— 一进来满屏红边
   比什么都不提示更劝退。只有碰过某个字段（失焦）之后才开始提示。 */
const touched = ref({});
const markTouched = (key) => {
  touched.value = { ...touched.value, [key]: true };
};
const anyTouched = computed(() => Object.values(touched.value).some(Boolean));

const hintText = computed(() => {
  if (errorText.value) return errorText.value;
  if (anyTouched.value && validateMessage.value) return validateMessage.value;
  return '填好必填项即可预览，不会直接写入';
});

/** 主行 = 最常用参数；主行填完就能建出可用草稿，其余全是可选细化 */
const mainParams = computed(() =>
  visibleParams(selectedAction.value, draft.value).filter((param) => param.group !== 'more'),
);
const moreParams = computed(() =>
  visibleParams(selectedAction.value, draft.value).filter((param) => param.group === 'more'),
);
const derivedParams = computed(() =>
  (selectedAction.value?.derived || []).filter(
    (item) => !item.visibleWhen || item.visibleWhen(draft.value),
  ),
);

const isParamFilled = (param) => {
  const value = draft.value[param.key];
  if (param.type === 'number') return value !== '' && value !== null && value !== undefined;
  if (param.type === 'switch') return typeof value === 'boolean';
  return Boolean(String(value ?? '').trim());
};

/** 「更多设置」里还没填几项 —— 收起时也能知道漏了什么；开关不算（都有默认值） */
const missingMoreCount = computed(
  () =>
    moreParams.value
      .filter((param) => param.type !== 'switch' && param.type !== 'select')
      .filter((param) => !isParamFilled(param)).length,
);

const previewSections = computed(() => {
  const result = selectedAction.value?.summarize?.(draft.value);
  if (!result) return [];
  return Array.isArray(result) ? [{ title: '', rows: result }] : result.sections || [];
});

const previewChecks = computed(() => {
  const result = selectedAction.value?.summarize?.(draft.value);
  return Array.isArray(result) ? [] : result?.checks || [];
});

const inputType = (param) => {
  if (param.type === 'datetime') return 'datetime-local';
  if (param.type === 'number') return 'number';
  return 'text';
};

const setSlotRef = (key, el) => {
  if (el) slotRefs[key] = el;
  else delete slotRefs[key];
};

const focusFirstSlot = () => {
  const first = mainParams.value.find((param) => !isParamFilled(param));
  if (first) slotRefs[first.key]?.focus?.();
};

const selectAction = (action) => {
  if (!action) return;
  // 没有参数 = 只跳转；有参数才进表单
  if (!action.params || action.params.length === 0) {
    go(buildActionRoute(action));
    reset();
    return;
  }
  selectedAction.value = action;
  // 必须铺 defaults：抽奖的首页展示默认是关、账号年龄校验默认是开，
  // 漏了这两项会被保存策略的默认值反过来（首页直接可见）。
  draft.value = initialDraft(action);
  raw.value = '';
  previewOpen.value = false;
  showMore.value = false;
  createdRecord.value = null;
  errorText.value = '';
  touched.value = {};
  nextTick(focusFirstSlot);
};

const exitAction = () => {
  selectedAction.value = null;
  draft.value = {};
  previewOpen.value = false;
  showMore.value = false;
  createdRecord.value = null;
  errorText.value = '';
  touched.value = {};
  nextTick(() => inputRef.value?.focus());
};

const openPreview = () => {
  if (validateMessage.value) {
    errorText.value = validateMessage.value;
    return;
  }
  errorText.value = '';
  previewOpen.value = true;
};

const confirmCreate = async () => {
  const action = selectedAction.value;
  if (!action?.submit || submitting.value) return;
  submitting.value = true;
  errorText.value = '';
  try {
    const record = await action.submit({ draft: draft.value, userId: userInfo.value?.id });
    createdRecord.value = record || { title: draft.value.title || draft.value.prize_title };
    previewOpen.value = false;
    await load();
  } catch (err) {
    errorText.value = err?.message || '创建失败，请稍后重试';
  } finally {
    submitting.value = false;
  }
};

const openDetail = () => {
  const tab = selectedAction.value?.detailTab;
  const id = createdRecord.value?.id;
  if (!tab || !id) return;
  go(`/admin/data-management/${tab}/${id}`);
};

const functionHref = (entry) => {
  if (!entry) return panelHref;
  if (entry.kind === 'section') return `${panelHref}?section=${entry.id}`;
  if (entry.kind === 'tab') return `${panelHref}?tab=${entry.id}`;
  const mod = tabModules.find((m) => m.id === entry.id);
  const firstTab = mod?.tabIds?.[0];
  return firstTab ? `${panelHref}?tab=${firstTab}` : panelHref;
};

const moduleHref = (mod) => {
  const firstTab = mod?.tabIds?.[0];
  return firstTab ? `${panelHref}?tab=${firstTab}` : panelHref;
};

const go = (href) => {
  if (!href) return;
  router.push(href).catch(() => {});
};

const goCard = (card) => {
  const { tab, ...rest } = card.to || {};
  go({ path: panelHref, query: { tab, ...rest } });
};

const runResult = (row) => {
  if (!row) return;
  if (row.kind === 'action') {
    selectAction(row.action);
    return;
  }
  go(functionHref(row.entry));
  reset();
};

const reset = () => {
  raw.value = '';
  cursor.value = 0;
  nextTick(() => inputRef.value?.focus());
};

const onBlur = () => {
  focused.value = false;
};

const onKeydown = (event) => {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    cursor.value = Math.min(cursor.value + 1, Math.max(results.value.length - 1, 0));
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    cursor.value = Math.max(cursor.value - 1, 0);
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const row = results.value[cursor.value] || results.value[0];
    if (row) runResult(row);
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    if (raw.value) reset();
    else inputRef.value?.blur();
    return;
  }
  cursor.value = 0;
};

const onGlobalKeydown = (event) => {
  const isK = event.key.toLowerCase() === 'k';
  if (!(event.metaKey || event.ctrlKey) || !isK) return;
  event.preventDefault();
  inputRef.value?.focus();
  inputRef.value?.select();
};

const loading = ref(true);
const counts = ref({});
const inbox = ref([]);

const load = async () => {
  try {
    const snapshot = await fetchOverviewSnapshot();
    counts.value = snapshot.counts;
    inbox.value = snapshot.inbox;
  } catch {
    counts.value = {};
    inbox.value = [];
  } finally {
    loading.value = false;
  }
};

const cards = computed(() => [
  {
    id: 'ship',
    label: '待发货',
    value: counts.value.pendingShipments ?? null,
    to: { tab: 'shopOrders', status: 'preparing' },
  },
  {
    id: 'reports',
    label: '待处理举报',
    value: counts.value.activeReports ?? null,
    to: { tab: 'reportedPosts', status: 'active' },
  },
  {
    id: 'draws',
    label: '待开奖',
    value: counts.value.dueDraws ?? null,
    to: { tab: 'lotteries', status: 'open' },
  },
  {
    id: 'users',
    label: '7 日新增',
    value: counts.value.newUsers7d ?? null,
    to: { tab: 'users' },
  },
]);

const pendingCount = computed(() => inbox.value.length);
const visibleInbox = computed(() => inbox.value.slice(0, 5));

const relativeTime = (iso) => {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '';
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  return `${days} 天前`;
};

onMounted(() => {
  load();
  window.addEventListener('keydown', onGlobalKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown);
});
</script>

<style scoped>
.ov {
  --ov-line: var(--border, rgba(0, 0, 0, 0.08));
  --ov-muted: var(--muted, #f2f2f7);
  --ov-card: var(--card, #ffffff);
  --ov-shadow-soft: 0 1px 2px rgba(0, 0, 0, 0.03);
  --ov-shadow-lift: 0 10px 28px -16px rgba(0, 0, 0, 0.28);
  --ov-ring: 0 0 0 3px rgba(255, 69, 58, 0.12);
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  background: var(--background, #f5f5f7);
  color: var(--foreground, #1d1d1f);
  font-family:
    'DM Sans',
    ui-sans-serif,
    system-ui,
    -apple-system,
    sans-serif;
  -webkit-font-smoothing: antialiased;
}

.ov-side {
  width: 176px;
  flex: 0 0 176px;
  padding: 18px 12px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  border-right: 1px solid var(--ov-line);
}

.ov-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px;
  font-size: 13px;
  font-weight: 600;
}

.ov-brand-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--primary, #ff453a);
  box-shadow: 0 0 0 3px rgba(255, 69, 58, 0.14);
}

.ov-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ov-nav-item {
  display: block;
  padding: 7px 10px;
  border-radius: 8px;
  font-size: 13px;
  color: inherit;
  text-decoration: none;
  opacity: 0.72;
  transition:
    background-color 0.16s ease,
    opacity 0.16s ease;
}

.ov-nav-item:hover {
  background: var(--ov-muted);
  opacity: 1;
}

.ov-nav-item.is-active {
  background: var(--ov-card);
  border: 1px solid var(--ov-line);
  opacity: 1;
  font-weight: 600;
}

.ov-side-foot {
  margin-top: auto;
  padding: 10px;
  border-top: 1px solid var(--ov-line);
  font-size: 12px;
  color: inherit;
  opacity: 0.55;
  text-decoration: none;
}

.ov-main {
  flex: 1;
  min-width: 0;
  max-width: 920px;
  margin: 0 auto;
  padding: 40px 20px 72px;
}

.ov-eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  opacity: 0.55;
}

.ov-head h1 {
  margin: 0 0 18px;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.ov-command {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 54px;
  padding: 0 16px;
  border: 1px solid var(--ov-line);
  border-radius: 14px;
  background: var(--ov-card);
  box-shadow: var(--ov-shadow-soft);
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}

.ov-command:focus-within {
  border-color: var(--primary, #ff453a);
  box-shadow: var(--ov-ring);
}

.ov-command.is-open {
  border-color: var(--primary, #ff453a);
}

.ov-command-icon {
  flex: 0 0 auto;
  opacity: 0.45;
}

.ov-command-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
}

.ov-command-kbd {
  font-size: 11px;
  padding: 2px 6px;
  border: 1px solid var(--ov-line);
  border-radius: 6px;
  opacity: 0.55;
}

.ov-command-clear {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 50%;
  background: var(--ov-muted);
  color: inherit;
  cursor: pointer;
}

.ov-results {
  position: absolute;
  z-index: 20;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  padding: 6px;
  border: 1px solid var(--ov-line);
  border-radius: 14px;
  background: var(--ov-card);
  box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.22);
}

.ov-results-head {
  margin: 4px 8px 6px;
  font-size: 11px;
  opacity: 0.5;
}

.ov-result {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.ov-result.is-cursor {
  background: var(--ov-muted);
}

.ov-result-label {
  font-weight: 600;
}

.ov-result-meta {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 12px;
  opacity: 0.55;
}

.ov-result-risk {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(255, 159, 10, 0.14);
  color: #b25000;
}

.ov-result-enter {
  opacity: 0.35;
}

.ov-results-empty {
  margin: 6px 10px 10px;
  font-size: 12px;
  opacity: 0.6;
}

.ov-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 22px 0 28px;
}

.ov-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 15px 16px 16px;
  border: 1px solid var(--ov-line);
  border-radius: 14px;
  background: var(--ov-card);
  color: inherit;
  font: inherit;
  text-align: left;
  box-shadow: var(--ov-shadow-soft);
  cursor: pointer;
  transition:
    transform 0.16s ease,
    box-shadow 0.16s ease,
    border-color 0.16s ease;
}

.ov-card:hover {
  transform: translateY(-2px);
  border-color: rgba(0, 0, 0, 0.14);
  box-shadow: var(--ov-shadow-lift);
}

.ov-card-label {
  font-size: 12px;
  letter-spacing: 0.01em;
  opacity: 0.55;
}

.ov-card-value {
  font-size: 27px;
  font-weight: 600;
  line-height: 1.05;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.ov-card.is-zero .ov-card-value {
  opacity: 0.35;
}

.ov-card.is-unknown .ov-card-value {
  opacity: 0.5;
}

.ov-inbox {
  border: 1px solid var(--ov-line);
  border-radius: 14px;
  background: var(--ov-card);
  box-shadow: var(--ov-shadow-soft);
  overflow: hidden;
}

.ov-inbox-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--ov-line);
}

.ov-inbox-head h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.ov-badge {
  min-width: 18px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(255, 69, 58, 0.12);
  color: #d70015;
  font-size: 11px;
  text-align: center;
}

.ov-badge.is-idle {
  background: var(--ov-muted);
  color: inherit;
  opacity: 0.6;
}

.ov-inbox-all {
  margin-left: auto;
  font-size: 12px;
  opacity: 0.6;
  text-decoration: none;
  color: inherit;
}

.ov-inbox-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.ov-inbox-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--ov-line);
  transition: background-color 0.14s ease;
}

.ov-inbox-row:hover {
  background: var(--ov-muted);
}

.ov-inbox-row:last-child {
  border-bottom: 0;
}

.ov-dot {
  flex: 0 0 auto;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ov-line);
}

.ov-dot.is-danger {
  background: #ff453a;
}

.ov-dot.is-warning {
  background: #ff9f0a;
}

.ov-dot.is-muted {
  background: rgba(0, 0, 0, 0.25);
}

.ov-row-type {
  flex: 0 0 44px;
  font-size: 11px;
  opacity: 0.5;
}

.ov-row-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13px;
}

.ov-row-time {
  flex: 0 0 auto;
  font-size: 11px;
  opacity: 0.45;
}

.ov-row-action {
  flex: 0 0 auto;
  padding: 4px 11px;
  border: 1px solid var(--ov-line);
  border-radius: 7px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color 0.14s ease,
    background-color 0.14s ease;
}

.ov-row-action:hover {
  border-color: rgba(0, 0, 0, 0.18);
  background: var(--ov-card);
}

.ov-inbox-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 28px 16px;
  font-size: 13px;
  opacity: 0.55;
}

.ov-tip {
  margin: 18px 0 0;
  font-size: 12px;
  opacity: 0.45;
}

.ov-tip code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--ov-muted);
  font-size: 11px;
}

/* ── `@` 动作表单 ── */

.ov-form {
  height: auto;
  min-height: 54px;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  padding: 12px 14px 14px;
}

/* 表单不用整块红框 —— 红色只留给 @ 动作 chip 和焦点环，
   否则一进表单就像整个表单在报错。 */
.ov-form.is-open {
  border-color: var(--ov-line);
}

.ov-form-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.ov-action-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border-radius: 9px;
  font-size: 13px;
  white-space: nowrap;
  background: rgba(255, 69, 58, 0.1);
  color: #c4000f;
  font-weight: 600;
}

.ov-action-chip button {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.08);
  color: inherit;
  cursor: pointer;
}

.ov-form-hint {
  flex: 1;
  min-width: 120px;
  font-size: 12px;
  opacity: 0.5;
}

.ov-form-hint.is-error {
  color: var(--warn, #b25000);
  opacity: 0.95;
}

.ov-form-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 11px;
  border: 0;
  border-radius: 999px;
  background: var(--ov-muted);
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.14s ease;
}

.ov-form-toggle:hover {
  background: rgba(0, 0, 0, 0.06);
}

.ov-form-toggle-count {
  font-size: 11px;
  opacity: 0.45;
}

.ov-form-toggle svg {
  transition: transform 0.18s ease;
}

.ov-form-toggle svg.is-up {
  transform: rotate(180deg);
}

.ov-form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(152px, 1fr));
  gap: 12px 14px;
  align-items: start;
}

/* 更多设置整块放进浅底容器：字段多的时候不至于和主行混成一片 */
.ov-form-more {
  padding: 12px;
  border-radius: 11px;
  background: var(--ov-muted);
}

.ov-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.ov-field.is-wide {
  grid-column: span 2;
}

.ov-field-label {
  font-size: 11px;
  letter-spacing: 0.02em;
  opacity: 0.58;
}

.ov-field-label em {
  margin-left: 2px;
  font-style: normal;
  color: #d92b1f;
}

.ov-field-input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--ov-line);
  border-radius: 9px;
  background: var(--ov-card);
  color: inherit;
  font: inherit;
  font-size: 13px;
  outline: none;
  transition:
    border-color 0.14s ease,
    box-shadow 0.14s ease;
}

.ov-field-input:hover {
  border-color: rgba(0, 0, 0, 0.16);
}

textarea.ov-field-input {
  height: auto;
  padding: 8px 10px;
  line-height: 1.55;
  resize: vertical;
}

select.ov-field-input {
  cursor: pointer;
}

.ov-field-input:focus {
  border-color: var(--primary, #ff453a);
  box-shadow: var(--ov-ring);
}

.ov-field-input.is-missing {
  border-color: rgba(217, 43, 31, 0.42);
}

.ov-field-input::placeholder {
  color: inherit;
  opacity: 0.38;
}

.ov-field-hint {
  font-size: 11px;
  line-height: 1.45;
  opacity: 0.45;
}

.ov-switch {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--ov-line);
  border-radius: 9px;
  background: var(--ov-card);
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.14s ease;
}

.ov-switch:hover {
  border-color: rgba(0, 0, 0, 0.16);
}

.ov-switch-dot {
  position: relative;
  width: 24px;
  height: 13px;
  border-radius: 999px;
  background: rgba(128, 128, 128, 0.35);
  transition: background 0.18s ease;
}

.ov-switch-dot::after {
  content: '';
  position: absolute;
  top: 1.5px;
  left: 1.5px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.18s ease;
}

.ov-switch.is-on .ov-switch-dot {
  background: var(--primary, #ff453a);
}

.ov-switch.is-on .ov-switch-dot::after {
  transform: translateX(11px);
}

.ov-switch-text {
  font-size: 11px;
  opacity: 0.55;
}

.ov-field-readonly {
  display: flex;
  align-items: center;
  height: 34px;
  padding: 0 10px;
  border: 1px dashed var(--ov-line);
  border-radius: 9px;
  background: var(--ov-card);
  font-size: 13px;
  opacity: 0.72;
}

@media (max-width: 620px) {
  .ov-field.is-wide {
    grid-column: auto;
  }

  /* 竖屏一排两列会把「机械键盘」这种值截成「机械键…」，预览必须单列 */
  .ov-preview-list {
    grid-template-columns: minmax(0, 1fr);
  }

  /* 提示文字独占一行，别和 chip、按钮挤在同一行 */
  .ov-form-hint {
    order: 3;
    flex-basis: 100%;
  }
}

.ov-run {
  height: 34px;
  padding: 0 16px;
  border: 0;
  border-radius: 9px;
  background: var(--primary, #ff453a);
  color: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    filter 0.14s ease,
    box-shadow 0.14s ease;
  box-shadow: 0 2px 10px -3px rgba(255, 69, 58, 0.5);
}

.ov-run:hover:not(:disabled) {
  filter: brightness(0.95);
}

.ov-run:disabled {
  opacity: 0.4;
  box-shadow: none;
  cursor: default;
}

.ov-ghost {
  height: 34px;
  padding: 0 13px;
  border: 1px solid var(--ov-line);
  border-radius: 9px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.14s ease;
}

.ov-ghost:hover {
  background: var(--ov-muted);
}

.ov-preview {
  margin-top: 12px;
  padding: 16px;
  border: 1px solid var(--ov-line);
  border-radius: 14px;
  background: var(--ov-card);
  box-shadow: var(--ov-shadow-soft);
}

.ov-preview-head {
  margin: 0 0 12px;
  font-size: 12px;
  letter-spacing: 0.01em;
  opacity: 0.55;
}

.ov-preview-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
  margin: 0;
}

.ov-preview-list div {
  display: flex;
  gap: 8px;
  font-size: 13px;
}

.ov-preview-list dt {
  flex: 0 0 auto;
  min-width: 74px;
  white-space: nowrap;
  opacity: 0.5;
}

.ov-preview-list dd {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ov-preview-section {
  padding: 11px 13px;
  border-radius: 10px;
  background: var(--ov-muted);
}

.ov-preview-section + .ov-preview-section {
  margin-top: 8px;
}

.ov-preview-sub {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  opacity: 0.45;
}

.ov-preview-checks {
  margin: 12px 0 0;
  padding: 0 0 0 18px;
  font-size: 12px;
  line-height: 1.7;
  opacity: 0.7;
}

.ov-preview-checks li.is-warn {
  color: var(--warn, #b25000);
  opacity: 1;
}

.ov-preview-checks li + li {
  margin-top: 3px;
}

.ov-preview-error {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--warn, #b25000);
}

.ov-preview-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.ov-done {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 12px;
  padding: 12px 16px;
  border: 1px solid var(--ov-line);
  border-radius: 14px;
  background: var(--ov-card);
  box-shadow: var(--ov-shadow-soft);
  font-size: 13px;
}

.ov-done span {
  flex: 1;
  min-width: 0;
}

@media (max-width: 860px) {
  .ov-side {
    display: none;
  }

  .ov-main {
    padding: 28px 16px 56px;
  }

  .ov-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ov-head h1 {
    font-size: 22px;
  }

  .ov-row-time {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ov-card,
  .ov-command,
  .ov-nav-item {
    transition: none;
  }
}
</style>
