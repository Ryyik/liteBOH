<template>
  <div class="user-picker">
    <div class="user-picker-search">
      <div class="user-picker-input-wrap">
        <Search :size="15" class="user-picker-icon" aria-hidden="true" />
        <input
          ref="inputRef"
          v-model="keyword"
          type="text"
          :placeholder="placeholder"
          :aria-label="placeholder"
          aria-autocomplete="list"
          @input="onInput"
          @keydown.enter.prevent="searchNow"
          @keydown.esc="closeResults"
        />
        <span v-if="searching" class="user-picker-hint">搜索中…</span>
      </div>
      <button type="button" class="user-picker-btn" :disabled="searching" @click="searchNow">
        <Search :size="15" />搜索
      </button>
    </div>

    <!-- 结果 -->
    <div v-if="results.length" class="user-picker-results" role="listbox" aria-label="搜索结果">
      <button
        v-for="user in results"
        :key="user.id"
        type="button"
        role="option"
        :aria-selected="isSelected(user.id)"
        class="user-picker-item"
        :class="{ 'is-selected': isSelected(user.id) }"
        @click="pick(user)"
      >
        <span class="user-picker-avatar" aria-hidden="true">
          <img
            v-if="user.avatar_url && !brokenAvatars.has(user.id)"
            :src="user.avatar_url"
            alt=""
            loading="lazy"
            @error="markAvatarBroken(user.id)"
          />
          <template v-else>{{ initialOf(user.username) }}</template>
        </span>
        <span class="user-picker-main">
          <span class="user-picker-name">{{ user.username || '未命名用户' }}</span>
          <span class="user-picker-sub">
            <em v-if="user.role" class="user-picker-role" :class="`role-${user.role}`">
              {{ user.role }}
            </em>
            <code class="user-picker-id">{{ shortId(user.id) }}</code>
            <span v-if="user.points != null" class="user-picker-meta">{{ user.points }} 积分</span>
          </span>
        </span>
        <span v-if="isSelected(user.id)" class="user-picker-check" aria-hidden="true">✓</span>
      </button>
    </div>

    <!-- 空结果：给「粘贴 UUID」这条唯一还能走的路 -->
    <div v-else-if="searched && !searching" class="user-picker-empty">
      <p>没有匹配的用户。</p>
      <div class="user-picker-empty-actions">
        <input
          v-model="manualId"
          type="text"
          class="user-picker-manual"
          placeholder="粘贴用户 UUID，回车加入"
          aria-label="粘贴用户 UUID"
          @keydown.enter.prevent="addManualUser"
        />
        <button type="button" class="user-picker-btn" @click="addManualUser">加入</button>
      </div>
    </div>

    <!-- 空闲态：最近选择 -->
    <div v-if="!keyword && !results.length && recentUsers.length" class="user-picker-recent">
      <span class="user-picker-recent-label">最近选择</span>
      <button
        v-for="user in recentUsers"
        :key="`recent-${user.id}`"
        type="button"
        class="user-picker-recent-chip"
        @click="pick(user)"
      >
        {{ user.username || shortId(user.id) }}
      </button>
    </div>

    <!-- 已选 -->
    <div v-if="selectedUsers.length" class="user-picker-selected">
      <div class="user-picker-selected-head">
        <span>已选择 {{ selectedUsers.length }} 位用户</span>
        <button type="button" class="user-picker-clear" @click="clearAll">清空</button>
      </div>
      <div class="user-picker-chips">
        <span v-for="user in selectedUsers" :key="user.id" class="user-picker-chip">
          {{ user.username || shortId(user.id) }}
          <button type="button" aria-label="移除" @click="remove(user.id)">×</button>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * UserPicker — 发放台 / 表单共用的选人组件（plans/042 B4 / AC-7）
 *
 * 之前三个发放台各写一份（积分 / 订阅 / 抽奖补参与）：去抖时长、回车行为、
 * 排序口径、空结果处理全都不一样 —— 「同一个用户名在三个页面搜出三种顺序」。
 * 这里只做**搜索与选择**，发放逻辑仍留在各自页面。
 *
 * 搜索函数由调用方注入，且允许两种返回形状（历史原因）：
 *   - Promise<Array<user>>
 *   - Promise<{ data, error }>   （supabase 风格）
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Search } from 'lucide-vue-next';

import { scoreRow, UUID_PATTERN } from '@/utils/search-core.js';

const props = defineProps({
  /** (keyword) => Promise<Array> | Promise<{data,error}>，必传 */
  search: { type: Function, required: true },
  /** 多选传数组，单选传对象或 null */
  modelValue: { type: [Array, Object], default: null },
  multiple: { type: Boolean, default: true },
  /** 最近选择的 localStorage key（不同发放台各存各的） */
  recentKey: { type: String, default: 'boh-admin-user-picker-recent-v1' },
  placeholder: { type: String, default: '搜索用户名或用户 ID…' },
});

const emit = defineEmits(['update:modelValue', 'error']);

const DEBOUNCE_MS = 250;
const RECENT_LIMIT = 5;

const keyword = ref('');
const results = ref([]);
const searching = ref(false);
const searched = ref(false);
const manualId = ref('');
const inputRef = ref(null);

const selectedUsers = computed(() => {
  if (props.multiple) return Array.isArray(props.modelValue) ? props.modelValue : [];
  return props.modelValue ? [props.modelValue] : [];
});

const readRecent = () => {
  try {
    const raw = localStorage.getItem(props.recentKey);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((item) => item?.id).slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
};

const recentUsers = ref(readRecent());

watch(
  () => props.recentKey,
  () => {
    recentUsers.value = readRecent();
  },
);

const shortId = (id) => String(id || '').slice(0, 8);

/** 头像裂图不进 DOM（否则每行一个破图标）；按 id 记，换关键词不清空也无所谓 */
const brokenAvatars = ref(new Set());
const markAvatarBroken = (id) => {
  brokenAvatars.value = new Set([...brokenAvatars.value, id]);
};

const initialOf = (username) =>
  String(username || '?')
    .trim()
    .charAt(0)
    .toUpperCase() || '?';

const isSelected = (id) => selectedUsers.value.some((user) => user.id === id);

const emitSelected = (list) => {
  emit('update:modelValue', props.multiple ? list : list[0] || null);
};

const rememberRecent = (list) => {
  const next = list.slice(0, RECENT_LIMIT);
  recentUsers.value = next;
  try {
    localStorage.setItem(props.recentKey, JSON.stringify(next));
  } catch {
    /* 隐私模式写不进去就算了，不该阻断选人 */
  }
};

const pick = (user) => {
  if (!user?.id) return;
  if (props.multiple) {
    const exists = isSelected(user.id);
    const next = exists
      ? selectedUsers.value.filter((item) => item.id !== user.id)
      : [...selectedUsers.value, user];
    emitSelected(next);
    if (!exists) rememberRecent([user, ...selectedUsers.value.filter((i) => i.id !== user.id)]);
  } else {
    emitSelected([user]);
    rememberRecent([user]);
    closeResults();
  }
};

const remove = (id) => {
  emitSelected(selectedUsers.value.filter((user) => user.id !== id));
};

const clearAll = () => emitSelected([]);

const closeResults = () => {
  results.value = [];
  searched.value = false;
};

let timer = 0;
let requestId = 0;

const runSearch = async () => {
  const value = keyword.value.trim();
  if (!value) {
    closeResults();
    return;
  }
  const current = ++requestId;
  searching.value = true;
  try {
    const raw = await props.search(value);
    if (current !== requestId) return; // 有更新的请求在飞，丢弃旧结果
    if (Array.isArray(raw)) results.value = raw;
    else if (raw?.error) {
      results.value = [];
      emit('error', raw.error.message || '搜索用户失败');
    } else results.value = Array.isArray(raw?.data) ? raw.data : [];
    // 相关性排序：完全相等 > 前缀 > 包含（以前三个页面各按积分/时间排，谁都不对）
    results.value = [...results.value].sort(
      (a, b) =>
        scoreRow(b, value, [{ column: 'username' }, { column: 'id' }]) -
        scoreRow(a, value, [{ column: 'username' }, { column: 'id' }]),
    );
    searched.value = true;
  } catch (error) {
    if (current !== requestId) return;
    results.value = [];
    searched.value = true;
    emit('error', error?.message || '搜索用户失败');
  } finally {
    if (current === requestId) searching.value = false;
  }
};

const onInput = () => {
  window.clearTimeout(timer);
  searched.value = false;
  timer = window.setTimeout(runSearch, DEBOUNCE_MS);
};

const searchNow = () => {
  window.clearTimeout(timer);
  runSearch();
};

/** 空结果时的兜底：知道 UUID 的人不该被「搜不到」挡在门外 */
const addManualUser = () => {
  const id = manualId.value.trim();
  if (!UUID_PATTERN.test(id)) {
    emit('error', '这不是合法的用户 UUID');
    return;
  }
  pick({ id, username: '' });
  manualId.value = '';
  closeResults();
};

onBeforeUnmount(() => window.clearTimeout(timer));

defineExpose({ focus: () => inputRef.value?.focus(), searchNow });
</script>

<style scoped>
.user-picker {
  display: grid;
  gap: 10px;
}

.user-picker-search {
  display: flex;
  gap: 8px;
  align-items: center;
}

.user-picker-input-wrap {
  position: relative;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
}

.user-picker-icon {
  position: absolute;
  left: 10px;
  color: var(--muted-foreground);
  pointer-events: none;
}

.user-picker-input-wrap input {
  width: 100%;
  height: 36px;
  padding: 0 86px 0 32px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--muted);
  color: var(--foreground);
  font-size: 13px;
}

.user-picker-input-wrap input:focus {
  outline: none;
  border-color: var(--primary);
}

.user-picker-hint {
  position: absolute;
  right: 10px;
  font-size: 11px;
  color: var(--muted-foreground);
}

.user-picker-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  color: var(--foreground);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.user-picker-btn:hover:not(:disabled) {
  background: var(--muted);
}

.user-picker-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.user-picker-results {
  display: grid;
  gap: 4px;
  max-height: 220px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--popover-solid, var(--card));
}

.user-picker-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 9px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--foreground);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.user-picker-item:hover {
  background: var(--muted);
}

.user-picker-item.is-selected {
  background: color-mix(in srgb, var(--primary) 12%, transparent);
}

.user-picker-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-picker-avatar {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  overflow: hidden;
  border-radius: 50%;
  background: var(--muted);
  color: var(--muted-foreground);
  font-size: 12px;
}

.user-picker-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-picker-main {
  flex: 1 1 auto;
  min-width: 0;
  display: grid;
  gap: 2px;
}

.user-picker-sub {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.user-picker-role {
  font-style: normal;
  font-size: 10px;
  padding: 0 6px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--muted-foreground);
}

.user-picker-role.role-admin {
  border-color: color-mix(in srgb, var(--primary) 40%, transparent);
  color: var(--primary);
}

.user-picker-check {
  flex: 0 0 auto;
  color: var(--primary);
  font-size: 13px;
}

.user-picker-id {
  font-size: 11px;
  color: var(--muted-foreground);
}

.user-picker-meta {
  font-size: 11px;
  color: var(--muted-foreground);
}

.user-picker-empty {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  font-size: 12px;
  color: var(--muted-foreground);
}

.user-picker-empty p {
  margin: 0;
}

.user-picker-empty-actions {
  display: flex;
  gap: 8px;
}

.user-picker-manual {
  flex: 1 1 auto;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--muted);
  color: var(--foreground);
  font-size: 12px;
}

.user-picker-recent {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.user-picker-recent-label {
  font-size: 11px;
  color: var(--muted-foreground);
}

.user-picker-recent-chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--card);
  color: var(--foreground);
  font-size: 12px;
  padding: 3px 10px;
  cursor: pointer;
}

.user-picker-selected {
  display: grid;
  gap: 6px;
}

.user-picker-selected-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--muted-foreground);
}

.user-picker-clear {
  border: 0;
  background: transparent;
  color: var(--primary);
  font-size: 12px;
  cursor: pointer;
}

.user-picker-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.user-picker-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 4px 3px 10px;
  border: 1px solid color-mix(in srgb, var(--primary) 26%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  font-size: 12px;
  color: var(--foreground);
}

.user-picker-chip button {
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}
</style>
