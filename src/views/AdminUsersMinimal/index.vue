<template>
  <div class="um">
    <!-- 一行 chrome：模块 / 搜索 / 条数 / 回旧面板。没有第二层工具栏，也没有独立的筛选行。 -->
    <div class="um-shell">
      <header class="um-bar">
        <nav class="um-mods" aria-label="模块">
          <span class="um-mod is-on" aria-current="page">用户</span>
          <button
            v-for="mod in legacyModules"
            :key="mod.id"
            type="button"
            class="um-mod"
            @click="goLegacy(mod.id)"
          >
            {{ mod.label }}<span class="um-old">旧</span>
          </button>
        </nav>

        <label class="um-find">
          <Search :size="14" aria-hidden="true" />
          <input
            v-model="keyword"
            type="search"
            placeholder="搜索用户名 / 角色"
            aria-label="搜索用户"
            @input="onKeywordInput"
          />
          <button
            v-if="keyword"
            type="button"
            class="um-clear"
            aria-label="清空搜索"
            @click="clearKeyword"
          >
            <X :size="12" />
          </button>
        </label>

        <span class="um-total">{{ totalLabel }}</span>
      </header>

      <div class="um-head" aria-hidden="true">
        <span></span>
        <span>用户名</span>
        <span>角色</span>
        <span>积分</span>
        <span>注册</span>
        <span></span>
      </div>

      <div class="um-body">
        <p v-if="loading" class="um-hint">载入中…</p>
        <p v-else-if="errorText" class="um-hint is-error">
          {{ errorText }}
          <button type="button" class="um-retry" @click="reload">重试</button>
        </p>
        <p v-else-if="!rows.length" class="um-hint">
          {{ keyword ? '没有匹配的用户' : '还没有用户' }}
        </p>

        <button
          v-for="row in rows"
          :key="row.id"
          type="button"
          class="um-row"
          @click="openEditor(row)"
        >
          <span class="um-dot" :class="`is-${roleKey(row.role)}`"></span>
          <span class="um-id">
            <span class="um-name">{{ row.username || '（未命名）' }}</span>
            <span class="um-meta">
              {{ roleLabel(row.role) }} · {{ formatPoints(row.points) }} 分 ·
              {{ formatDate(row.join_date) }}
            </span>
          </span>
          <span class="um-c">{{ roleLabel(row.role) }}</span>
          <span class="um-c">{{ formatPoints(row.points) }}</span>
          <span class="um-c">{{ formatDate(row.join_date) }}</span>
          <ChevronRight :size="14" class="um-caret" aria-hidden="true" />
        </button>

        <div v-if="hasMore" class="um-more">
          <button type="button" :disabled="loadingMore" @click="loadMore">
            {{ loadingMore ? '载入中…' : '加载更多' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 编辑：横屏从右侧进来、竖屏从底上来，同一份表单 -->
    <div
      v-if="editing"
      v-dialog-focus="closeEditor"
      class="um-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby="um-sheet-title"
      @click.self="closeEditor"
    >
      <form class="um-sheet" @submit.prevent="save">
        <div class="um-sheet-top">
          <h2 id="um-sheet-title" class="um-sheet-title">编辑用户</h2>
          <button type="button" class="um-x" aria-label="关闭" @click="closeEditor">
            <X :size="15" />
          </button>
        </div>

        <div class="um-fields">
          <div class="um-f">
            <label for="um-username">用户名</label>
            <input id="um-username" v-model="draft.username" type="text" maxlength="32" />
          </div>

          <div class="um-f">
            <label for="um-role">角色</label>
            <select id="um-role" v-model="draft.role">
              <option v-for="opt in roleOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>

          <div class="um-f">
            <label for="um-points">积分</label>
            <input id="um-points" v-model="draft.points" type="number" min="0" step="1" />
          </div>

          <div class="um-f">
            <label for="um-bio">备注</label>
            <textarea id="um-bio" v-model="draft.bio" rows="3" />
          </div>

          <p v-if="formError" class="um-form-error" role="alert">{{ formError }}</p>
        </div>

        <div class="um-actions">
          <span class="um-id-hint">{{ shortId }}</span>
          <span class="um-spacer"></span>
          <button type="button" class="um-btn" @click="closeEditor">取消</button>
          <button type="submit" class="um-btn is-primary" :disabled="saving || !canSave">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
/**
 * 极简用户列表（`/admin/users-minimal`）—— 新骨架的第一个真实模块。
 *
 * 与 `DataAdmin.vue` 的 users 页签并存，不是替换：先拿真实数据比对密度与操作步数，
 * 再决定推广到其它模块。四条刻意的约束：
 *
 *   ① **一屏只有一个决定轴**：模块 / 搜索 / 条数在同一个顶行，没有第二层工具栏、
 *      没有独立的「状态分布」行。加控件之前先问「它能不能并进那一行」。
 *   ② **列表只回答四件事**：谁、什么角色、多少分、什么时候来的。其余进编辑面板。
 *      所以列是 4 个而不是 11 个（ID / 邮箱 / 收货三件套 / 封禁 / 禁言全部下沉）。
 *   ③ **编辑是同一套骨架**：一份字段数组驱动表单，其它模块接进来只换这一份配置。
 *   ④ **横竖屏不是两套界面**：同一份 DOM，窄了把列折进标题下的第二行、面板改底部抽屉。
 *
 * 写路径不另造：profiles 的敏感列必须走 `admin_update_user_profile`，
 * 其余走直更 —— 拆分逻辑复用 `data-admin-profile-write.js`，
 * 原因见该文件头（补 GRANT 会让任何登录用户自升 admin，已实测）。
 */
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronRight, Search, X } from 'lucide-vue-next';
import { PROFILE_SAVE_SELECT_COLUMNS, USER_ROLE_OPTIONS } from '../DataManagement/config/fields.js';
import {
  adminUpdateUserProfile,
  fetchAdminProfiles,
  updateProfileRow,
} from '@/utils/api/data-admin-profile-api.js';
import { splitProfileWritePayload } from '../DataManagement/composables/data-admin-profile-write.js';
import { createDialogFocusTrapDirective } from '../DataManagement/composables/useDialogFocusTrap.js';

const vDialogFocus = createDialogFocusTrapDirective();

const PAGE_SIZE = 50;
const ROLE_LABELS = { user: '普通用户', admin: '管理员', moderator: '版主' };
const roleOptions = USER_ROLE_OPTIONS;

/** 只接了一个模块，其余三个先落回旧面板（不是死按钮，带「旧」角标） */
const legacyModules = [
  { id: 'points', label: '积分' },
  { id: 'products', label: '商品' },
  { id: 'forum', label: '帖子' },
];

const router = useRouter();

const rows = ref([]);
const total = ref(null);
const loading = ref(true);
const loadingMore = ref(false);
const errorText = ref('');
const keyword = ref('');

const editing = ref(null);
const draft = reactive({ username: '', role: 'user', points: '0', bio: '' });
const saving = ref(false);
const formError = ref('');

let keywordTimer = 0;
let requestId = 0;

const totalLabel = computed(() => {
  if (errorText.value) return '';
  if (total.value === null) return rows.value.length ? `已载入 ${rows.value.length}` : '';
  return `${total.value} 位用户`;
});
const hasMore = computed(() =>
  total.value === null ? rows.value.length >= PAGE_SIZE : rows.value.length < total.value,
);
const shortId = computed(() => String(editing.value?.id || '').slice(0, 8));
const canSave = computed(
  () => Boolean(String(draft.username || '').trim()) && Number.isFinite(Number(draft.points)),
);

const roleKey = (role) => (ROLE_LABELS[role] ? role : 'user');
const roleLabel = (role) => ROLE_LABELS[role] || role || '—';
const formatPoints = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('zh-CN') : '—';
};
const formatDate = (value) => (value ? String(value).slice(0, 10) : '—');

const load = async ({ append = false } = {}) => {
  const current = ++requestId;
  if (append) loadingMore.value = true;
  else {
    loading.value = true;
    errorText.value = '';
  }
  try {
    const result = await fetchAdminProfiles({
      keyword: keyword.value,
      limit: PAGE_SIZE,
      offset: append ? rows.value.length : 0,
    });
    if (current !== requestId) return; // 后发的请求已经覆盖这次结果
    rows.value = append ? [...rows.value, ...result.rows] : result.rows;
    total.value = result.total;
  } catch (error) {
    if (current !== requestId) return;
    errorText.value = `载入失败：${error?.message || '未知错误'}`;
    if (!append) rows.value = [];
  } finally {
    if (current === requestId) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
};

const reload = () => load();
const loadMore = () => load({ append: true });

const onKeywordInput = () => {
  window.clearTimeout(keywordTimer);
  keywordTimer = window.setTimeout(() => {
    keywordTimer = 0;
    load();
  }, 250);
};

const clearKeyword = () => {
  keyword.value = '';
  window.clearTimeout(keywordTimer);
  keywordTimer = 0;
  load();
};

const goLegacy = (tabId) => {
  router.push({ path: '/admin/data-management', query: { section: 'data', tab: tabId } });
};

const openEditor = (row) => {
  editing.value = row;
  draft.username = row.username || '';
  draft.role = row.role || 'user';
  draft.points = String(Number(row.points ?? 0));
  draft.bio = row.bio || '';
  formError.value = '';
};

const closeEditor = () => {
  if (saving.value) return;
  editing.value = null;
  formError.value = '';
};

const validate = () => {
  const username = String(draft.username || '').trim();
  if (!username) return '用户名不能为空';
  if (username.length > 32) return '用户名最多 32 个字符';
  if (!ROLE_LABELS[draft.role]) return '角色不合法';
  const points = Number(draft.points);
  if (!Number.isFinite(points) || points < 0) return '积分必须是大于等于 0 的数字';
  return '';
};

const save = async () => {
  if (saving.value || !editing.value) return;
  const invalid = validate();
  if (invalid) {
    formError.value = invalid;
    return;
  }

  saving.value = true;
  formError.value = '';
  const target = editing.value;
  const payload = {
    username: String(draft.username).trim(),
    role: draft.role,
    points: Math.round(Number(draft.points)),
    bio: String(draft.bio || '').trim(),
  };

  try {
    /* 敏感列（role/points）只能走 RPC，其余直更 —— 与主面板同一条链，
       顺序也一致：先 RPC 再直更，两者都成功才算保存成功。 */
    const { adminPatch, rest } = splitProfileWritePayload(payload);
    let saved = null;
    if (Object.keys(adminPatch).length) {
      const rpcRow = await adminUpdateUserProfile(target.id, adminPatch);
      if (rpcRow) saved = rpcRow;
    }
    if (Object.keys(rest).length) {
      const restRow = await updateProfileRow(target.id, rest, PROFILE_SAVE_SELECT_COLUMNS);
      saved = { ...(saved || {}), ...restRow };
    }

    // 就地替换这一行：不重拉整页，滚到第 37 行改完不会被弹回顶部
    rows.value = rows.value.map((row) =>
      row.id === target.id ? { ...row, ...payload, ...(saved || {}) } : row,
    );
    editing.value = null;
  } catch (error) {
    formError.value = `保存失败：${error?.message || '未知错误'}`;
  } finally {
    saving.value = false;
  }
};

load();

onBeforeUnmount(() => {
  window.clearTimeout(keywordTimer);
  requestId += 1; // 卸载后在途请求回来也不写状态
});
</script>

<style scoped>
/* 这一页刻意不用后台的液态玻璃主题：一张纸、一条分隔线、一个强调色。
   颜色全部走全局 token，暗色自动跟随（check:dark-tokens 只盯硬编码色）。 */
.um {
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--background, #fafaf9);
  color: var(--foreground, #1a1a1a);
  font-size: 13px;
  line-height: 1.5;
  padding: 18px 16px 40px;
}
.um-shell {
  /* 860 而不是 980：再宽下去，名字列与角色列之间会出现一条 400px 的空白真空——
     「元素少」不等于「留白多」，中间的空当会让人找不到横向阅读的落点。 */
  max-width: 860px;
  margin: 0 auto;
  background: var(--card, #fff);
  border: 1px solid var(--border, #e6e6e4);
  border-radius: 12px;
  overflow: hidden;
}

/* ── 顶行 ───────────────────────────────────────────── */
.um-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border, #efefed);
}
.um-mods {
  display: flex;
  gap: 2px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.um-mods::-webkit-scrollbar {
  display: none;
}
.um-mod {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: 0;
  background: transparent;
  color: var(--muted-foreground, #6f6f6d);
  font: inherit;
  font-size: 12.5px;
  padding: 5px 9px;
  border-radius: 7px;
  white-space: nowrap;
  cursor: pointer;
}
.um-mod.is-on {
  background: var(--foreground, #1a1a1a);
  color: var(--background, #fff);
}
.um-old {
  font-size: 10px;
  line-height: 1.2;
  padding: 1px 4px;
  border: 1px solid currentColor;
  border-radius: 4px;
  opacity: 0.55;
}
.um-find {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 120px;
  border-bottom: 1px solid var(--border, #e6e6e4);
  padding: 0 2px;
  color: var(--muted-foreground, #9a9a98);
}
.um-find input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12.5px;
  padding: 5px 0;
}
.um-clear {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 2px;
  display: inline-flex;
}
.um-total {
  font-size: 11.5px;
  color: var(--muted-foreground, #9a9a98);
  white-space: nowrap;
}

/* ── 表头 ───────────────────────────────────────────── */
.um-head,
.um-row {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr) 110px 80px 96px 14px;
  gap: 10px;
  align-items: center;
}
.um-head {
  padding: 7px 12px;
  background: var(--muted, #faf9f7);
  border-bottom: 1px solid var(--border, #efefed);
  font-size: 11.5px;
  color: var(--muted-foreground, #9a9a98);
}

/* ── 列表 ───────────────────────────────────────────── */
.um-body {
  max-height: calc(100vh - 190px);
  overflow-y: auto;
}
.um-row {
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--border, #f4f4f2);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  padding: 0 12px;
  height: 46px;
  cursor: pointer;
}
.um-row:last-of-type {
  border-bottom: 0;
}
.um-row:hover {
  background: var(--muted, #f7f7f5);
}
.um-row:focus-visible {
  outline: 2px solid var(--ring, #1a1a1a);
  outline-offset: -2px;
}
.um-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #9a9a98;
}
.um-dot.is-admin {
  background: #b5794a;
}
.um-dot.is-moderator {
  background: #4a7fb5;
}
.um-dot.is-user {
  background: #7f9c5a;
}
.um-id {
  min-width: 0;
  display: block;
  overflow: hidden;
}
.um-name {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.um-meta {
  display: none;
  font-size: 11.5px;
  color: var(--muted-foreground, #8a8a88);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.um-c {
  font-size: 12.5px;
  color: var(--muted-foreground, #4a4a48);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.um-caret {
  color: var(--muted-foreground, #c4c4c2);
  justify-self: end;
}
.um-hint {
  margin: 0;
  padding: 34px 14px;
  text-align: center;
  color: var(--muted-foreground, #9a9a98);
  font-size: 12.5px;
}
.um-hint.is-error {
  color: #a8443f;
}
.um-retry {
  margin-left: 6px;
  border: 0;
  background: transparent;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
  font: inherit;
}
.um-more {
  padding: 10px;
  text-align: center;
}
.um-more button {
  border: 1px solid var(--border, #e6e6e4);
  background: transparent;
  color: var(--muted-foreground, #6f6f6d);
  border-radius: 7px;
  padding: 6px 16px;
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}
.um-more button:disabled {
  opacity: 0.6;
  cursor: default;
}

/* ── 编辑面板 ───────────────────────────────────────── */
.um-scrim {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(20, 20, 20, 0.18);
  display: flex;
  justify-content: flex-end;
}
.um-sheet {
  width: min(360px, 100%);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--card, #fff);
  border-left: 1px solid var(--border, #e8e8e6);
}
.um-sheet-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 15px;
  border-bottom: 1px solid var(--border, #f0f0ee);
}
.um-sheet-title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
}
.um-x {
  border: 0;
  background: transparent;
  color: var(--muted-foreground, #8a8a88);
  cursor: pointer;
  padding: 2px;
  display: inline-flex;
}
.um-fields {
  flex: 1;
  overflow-y: auto;
  padding: 15px;
  display: grid;
  gap: 12px;
  align-content: start;
}
.um-f label {
  display: block;
  margin-bottom: 4px;
  font-size: 11.5px;
  color: var(--muted-foreground, #8a8a88);
}
.um-f input,
.um-f select,
.um-f textarea {
  width: 100%;
  border: 1px solid var(--border, #e2e2e0);
  border-radius: 7px;
  background: var(--card, #fff);
  color: inherit;
  font: inherit;
  font-size: 12.5px;
  padding: 7px 9px;
  outline: 0;
}
.um-f input:focus,
.um-f select:focus,
.um-f textarea:focus {
  border-color: var(--foreground, #1a1a1a);
}
.um-f textarea {
  min-height: 62px;
  resize: vertical;
}
.um-form-error {
  margin: 0;
  font-size: 12px;
  color: #a8443f;
}
.um-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 15px;
  border-top: 1px solid var(--border, #f0f0ee);
}
.um-id-hint {
  font-size: 10.5px;
  color: var(--muted-foreground, #b0b0ae);
  font-variant-numeric: tabular-nums;
}
.um-spacer {
  flex: 1;
}
.um-btn {
  border: 1px solid var(--border, #e0e0de);
  background: transparent;
  color: inherit;
  border-radius: 7px;
  padding: 6px 14px;
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}
.um-btn.is-primary {
  background: var(--foreground, #1a1a1a);
  border-color: var(--foreground, #1a1a1a);
  color: var(--background, #fff);
}
.um-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

/* ── 竖屏 / 窄屏：同一份 DOM，列折进第二行，面板改成底部抽屉 ── */
@media (max-width: 720px) {
  .um {
    padding: 0 0 24px;
  }
  .um-shell {
    border: 0;
    border-radius: 0;
    min-height: calc(100dvh - 24px);
  }
  .um-bar {
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 10px;
  }
  .um-mods {
    order: 1;
    width: 100%;
  }
  .um-find {
    order: 2;
  }
  .um-total {
    order: 3;
  }
  .um-head {
    display: none;
  }
  .um-row {
    grid-template-columns: 14px minmax(0, 1fr) 14px;
    height: 58px;
  }
  .um-meta {
    display: block;
  }
  .um-c {
    display: none;
  }
  .um-body {
    max-height: none;
  }
  .um-scrim {
    align-items: flex-end;
  }
  .um-sheet {
    width: 100%;
    /* 高度跟着字段走，不要硬撑到 82% —— 4 个字段撑满一屏会在「备注」和
       动作条之间留出一大片死空，单手操作时反而更难点到「保存」。 */
    height: auto;
    max-height: 86%;
    border-left: 0;
    border-top: 1px solid var(--border, #e8e8e6);
    border-radius: 14px 14px 0 0;
    padding-bottom: env(safe-area-inset-bottom);
  }
  .um-fields {
    flex: 0 1 auto;
  }
}
</style>
