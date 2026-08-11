<template>
  <section class="points-grant-page">
    <header class="quota-config-hero">
      <div>
        <span class="quota-kicker">Points Grant</span>
        <h2>积分发放</h2>
        <p>统一给全部用户批量发放积分，或指定部分用户发放，可填写备注（会同步展示在用户的「积分明细」中）。</p>
      </div>
      <div class="quota-hero-actions">
        <button class="quota-btn ghost" type="button" :disabled="loading || saving" @click="loadRecent">
          <RefreshCw :size="15" :class="{ spinning: loading }" />刷新
        </button>
      </div>
    </header>

    <div v-if="message" class="quota-notice" :class="messageTone" role="status">{{ message }}</div>

    <section class="quota-panel grant-panel">
      <div class="quota-panel-heading">
        <div><h3>发放方式</h3><p>「全部用户」会将积分发放给所有非管理员账号。</p></div>
        <div class="grant-mode-switch" role="tablist" aria-label="发放范围">
          <button type="button" :class="{ 'is-active': mode === 'all' }" @click="mode = 'all'">全部用户</button>
          <button type="button" :class="{ 'is-active': mode === 'selected' }" @click="mode = 'selected'">指定用户</button>
        </div>
      </div>

      <div class="grant-body">
        <template v-if="mode === 'selected'">
          <div class="grant-search-row">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="搜索用户名或用户ID..."
              aria-label="搜索用户"
              @input="handleSearch"
            />
            <button class="quota-btn ghost" type="button" :disabled="searching" @click="handleSearch">
              <Search :size="15" />{{ searching ? '搜索中…' : '搜索' }}
            </button>
          </div>
          <div v-if="searchResults.length > 0" class="grant-search-results">
            <button
              v-for="user in searchResults"
              :key="user.id"
              type="button"
              class="grant-user-item"
              :class="{ 'is-selected': isSelected(user.id) }"
              @click="toggleUser(user)"
            >
              <span class="grant-user-name">{{ user.username || '未命名用户' }}</span>
              <code>{{ user.id.slice(0, 8) }}</code>
              <span class="grant-user-points">{{ user.points }} 积分</span>
            </button>
          </div>
          <div class="grant-selected-wrap" v-if="selectedUsers.length > 0">
            <div class="grant-selected-head">
              <span>已选择 {{ selectedUsers.length }} 位用户</span>
              <button type="button" class="grant-clear-all" @click="selectedUsers = []">清空</button>
            </div>
            <div class="grant-selected-list">
              <span v-for="user in selectedUsers" :key="user.id" class="grant-chip">
                {{ user.username || '未命名用户' }}
                <button type="button" aria-label="移除" @click="removeUser(user.id)">×</button>
              </span>
            </div>
          </div>
        </template>

        <div class="grant-fields">
          <label class="grant-field">
            <span>积分数量</span>
            <input v-model.number="amount" type="number" :min="1" step="1" placeholder="例如 10" aria-label="积分数量" />
          </label>
          <label class="grant-field grant-field-wide">
            <span>备注（展示在积分明细中）</span>
            <input v-model="remark" type="text" maxlength="120" placeholder="例如：社区活动奖励" aria-label="备注" />
          </label>
        </div>

        <div class="grant-submit-row">
          <span class="grant-summary">
            将发放 <strong>{{ amountText }}</strong> 积分给
            <strong>{{ mode === 'all' ? '全部' : selectedUsers.length }} 位用户</strong>
            <template v-if="remark">，备注「{{ remark }}」</template>
          </span>
          <button class="quota-btn primary" type="button" :disabled="saving || !canSubmit" @click="submitGrant">
            <Send :size="15" />{{ saving ? '发放中…' : '确认发放' }}
          </button>
        </div>
      </div>
    </section>

    <section class="quota-panel grant-panel">
      <div class="quota-panel-heading">
        <div><h3>最近发放记录</h3><p>仅展示管理员操作产生的积分流水。</p></div>
        <span>{{ recentGrants.length }} 条</span>
      </div>
      <div v-if="recentLoading" class="grant-loading">正在加载发放记录…</div>
      <div v-else-if="recentGrants.length === 0" class="grant-empty">
        <Inbox :size="26" :stroke-width="1.5" />
        <p>暂无发放记录</p>
      </div>
      <div v-else class="grant-table-wrap">
        <table class="quota-table">
          <thead>
            <tr><th>用户</th><th>数量</th><th>备注</th><th>发放时间</th></tr>
          </thead>
          <tbody>
            <tr v-for="grant in recentGrants" :key="grant.id">
              <td>
                <strong>{{ grant.username || '未命名用户' }}</strong>
                <code class="grant-user-code">{{ String(grant.user_id || '').slice(0, 8) }}</code>
              </td>
              <td>
                <span class="grant-amount" :class="{ negative: grant.amount < 0 }">
                  {{ grant.amount > 0 ? '+' : '' }}{{ grant.amount }}
                </span>
              </td>
              <td class="muted">{{ grant.remark || '—' }}</td>
              <td class="muted">{{ formatDate(grant.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { Inbox, RefreshCw, Search, Send } from 'lucide-vue-next';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';
import { fetchRecentGrants, grantPoints, searchGrantTargetUsers } from '@/utils/api/points-admin-api.js';
import { supabase } from '@/utils/supabase-client.js';

const { confirm } = useConfirmDialog();

const mode = ref('all');
const searchQuery = ref('');
const searchResults = ref([]);
const searching = ref(false);
const selectedUsers = ref([]);
const amount = ref(0);
const remark = ref('');
const saving = ref(false);
const message = ref('');
const messageTone = ref('success');
const loading = ref(false);
const recentLoading = ref(false);
const recentGrants = ref([]);

const amountText = computed(() => Number(amount.value || 0).toLocaleString());
const canSubmit = computed(() => {
  if (!Number(amount.value) || Number(amount.value) <= 0) return false;
  if (mode.value === 'selected' && selectedUsers.value.length === 0) return false;
  return true;
});

const notify = (text, tone = 'success') => { message.value = text; messageTone.value = tone; };

const isSelected = (id) => selectedUsers.value.some(u => u.id === id);

const toggleUser = (user) => {
  if (isSelected(user.id)) {
    selectedUsers.value = selectedUsers.value.filter(u => u.id !== user.id);
  } else {
    selectedUsers.value = [...selectedUsers.value, user];
  }
};

const removeUser = (id) => {
  selectedUsers.value = selectedUsers.value.filter(u => u.id !== id);
};

const handleSearch = async () => {
  searching.value = true;
  try {
    searchResults.value = await searchGrantTargetUsers(searchQuery.value);
  } catch (error) {
    notify(error?.message || '搜索用户失败', 'error');
  } finally {
    searching.value = false;
  }
};

const submitGrant = async () => {
  if (!canSubmit.value) return;
  const userIds = mode.value === 'all' ? null : selectedUsers.value.map(u => u.id);
  const targetCount = mode.value === 'all' ? '全部' : selectedUsers.value.length;
  const accepted = await confirm(
    '确认发放积分',
    `将向 ${targetCount} 位用户发放 ${amount.value} 积分${remark.value ? `，备注「${remark.value}」` : ''}。该操作立即生效，不可撤销。`,
    '确认发放'
  );
  if (!accepted) return;

  saving.value = true;
  try {
    const result = await grantPoints({ userIds, amount: amount.value, remark: remark.value });
    notify(`已向 ${result?.affected ?? targetCount} 位用户发放 ${result?.amount ?? amount.value} 积分`);
    amount.value = 0;
    remark.value = '';
    selectedUsers.value = [];
    searchResults.value = [];
    void loadRecent();
  } catch (error) {
    notify(error?.message || '发放积分失败', 'error');
  } finally {
    saving.value = false;
  }
};

const formatDate = (d) => {
  if (!d) return '--';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const loadRecent = async () => {
  recentLoading.value = true;
  try {
    const rows = await fetchRecentGrants(20);
    const ids = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
    let userMap = {};
    if (ids.length > 0) {
      const { data } = await supabase.from('profiles').select('id, username').in('id', ids);
      userMap = Object.fromEntries((data || []).map(u => [u.id, u.username]));
    }
    recentGrants.value = rows.map(r => ({ ...r, username: userMap[r.user_id] || '' }));
  } catch (error) {
    notify(error?.message || '加载发放记录失败', 'error');
  } finally {
    recentLoading.value = false;
  }
};

onMounted(() => {
  void loadRecent();
});
</script>

<style scoped>
.points-grant-page { display: grid; gap: 16px; color: var(--foreground); }
.grant-panel { overflow: hidden; }
.grant-mode-switch {
  display: inline-flex;
  padding: 3px;
  border-radius: 999px;
  background: var(--muted);
}
.grant-mode-switch button {
  border: none;
  background: transparent;
  padding: 7px 16px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 650;
  color: var(--muted-foreground);
  cursor: pointer;
  transition: all 0.18s ease;
}
.grant-mode-switch button.is-active {
  background: var(--foreground);
  color: var(--background);
}
.grant-body { padding: 16px; display: grid; gap: 14px; }
.grant-search-row { display: flex; gap: 8px; }
.grant-search-row input {
  flex: 1;
  min-width: 0;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--card);
  color: var(--foreground);
  outline: none;
}
.grant-search-row input:focus { border-color: var(--foreground); }
.grant-search-results {
  display: grid;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--background);
}
.grant-user-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--foreground);
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}
.grant-user-item:hover { background: var(--muted); }
.grant-user-item.is-selected {
  background: color-mix(in srgb, var(--foreground) 8%, transparent);
  border-color: color-mix(in srgb, var(--foreground) 30%, transparent);
}
.grant-user-name { font-weight: 650; }
.grant-user-item code, .grant-user-code { color: var(--muted-foreground); font-size: 11px; }
.grant-user-points { margin-left: auto; color: var(--muted-foreground); font-size: 12px; }
.grant-selected-wrap { display: grid; gap: 8px; }
.grant-selected-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--muted-foreground);
}
.grant-clear-all {
  border: none;
  background: none;
  color: var(--foreground);
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}
.grant-selected-list { display: flex; flex-wrap: wrap; gap: 6px; }
.grant-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: var(--muted);
  color: var(--foreground);
}
.grant-chip button {
  border: none;
  background: none;
  color: var(--muted-foreground);
  font-size: 14px;
  cursor: pointer;
  line-height: 1;
}
.grant-chip button:hover { color: var(--foreground); }
.grant-fields { display: grid; grid-template-columns: 200px 1fr; gap: 12px; }
@media (max-width: 720px) { .grant-fields { grid-template-columns: 1fr; } }
.grant-field { display: grid; gap: 6px; }
.grant-field > span { color: var(--muted-foreground); font-size: 12px; }
.grant-field input {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--card);
  color: var(--foreground);
  outline: none;
  box-sizing: border-box;
}
.grant-field input:focus { border-color: var(--foreground); }
.grant-submit-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding-top: 4px;
}
@media (max-width: 720px) {
  .grant-submit-row { flex-direction: column; align-items: stretch; }
  .grant-submit-row .quota-btn { width: 100%; }
}
.grant-summary { font-size: 13px; color: var(--muted-foreground); line-height: 1.5; }
.grant-summary strong { color: var(--foreground); }
.grant-loading, .grant-empty { padding: 28px; text-align: center; color: var(--muted-foreground); font-size: 13px; }
.grant-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.grant-empty p { margin: 0; }
.grant-table-wrap { overflow-x: auto; }
.grant-amount { font-weight: 800; color: #12b76a; }
.grant-amount.negative { color: #f04438; }
.grant-user-code { margin-left: 8px; }
</style>
