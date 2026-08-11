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
        <div><h3>最近发放记录</h3><p>按发放批次展示，可整批撤销。</p></div>
        <span>{{ batchList.length }} 批次</span>
      </div>
      <div v-if="recentLoading" class="grant-loading">正在加载发放记录…</div>
      <div v-else-if="batchList.length === 0" class="grant-empty">
        <Inbox :size="26" :stroke-width="1.5" />
        <p>暂无发放记录</p>
      </div>
      <div v-else class="grant-batch-list">
        <div
          v-for="batch in batchList"
          :key="batch.key"
          class="grant-batch-card"
          :class="{ 'is-revoked': batch.revoked }"
        >
          <div class="grant-batch-head">
            <div class="grant-batch-meta">
              <span class="grant-batch-time">{{ formatDate(batch.createdAt) }}</span>
              <span class="grant-batch-amount">
                +{{ batch.amount }} 积分 × {{ batch.count }} 位用户（共 {{ batch.amount * batch.count }} 积分）
              </span>
              <span v-if="batch.revoked" class="grant-batch-tag revoked">已撤销</span>
              <span v-else class="grant-batch-tag active">有效</span>
            </div>
            <div class="grant-batch-remark" v-if="batch.remark">{{ batch.remark }}</div>
            <button
              v-if="batch.canRevoke"
              class="quota-btn danger-ghost"
              type="button"
              :disabled="revokingBatchId === batch.batchId"
              @click="handleRevoke(batch)"
            >
              <Undo2 :size="14" />
              {{ revokingBatchId === batch.batchId ? '撤销中…' : '撤销发放' }}
            </button>
          </div>
          <details class="grant-batch-detail">
            <summary>展开查看 {{ batch.count }} 位用户明细</summary>
            <div class="grant-batch-users">
              <span v-for="grant in batch.grants" :key="grant.id" class="grant-batch-user">
                <span class="grant-batch-user-name">{{ grant.username || '未命名用户' }}</span>
                <span class="grant-batch-user-bal">余额 {{ grant.balance_after ?? '—' }}</span>
              </span>
            </div>
          </details>
        </div>
      </div>
    </section>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { Inbox, RefreshCw, Search, Send, Undo2 } from 'lucide-vue-next';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';
import { fetchRecentGrants, grantPoints, revokeGrant, searchGrantTargetUsers } from '@/utils/api/points-admin-api.js';
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
const revokingBatchId = ref('');

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
  const accepted = await confirm({
    title: '确认发放积分',
    message: `将向 ${targetCount} 位用户发放 ${amount.value} 积分${remark.value ? `，备注「${remark.value}」` : ''}。该操作立即生效，如需取消可在发放记录中撤销。`,
    confirmText: '确认发放'
  });
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
    console.error('[PointsGrantConsole] 发放积分失败:', error);
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
    const rows = await fetchRecentGrants(200);
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

// 按 batch_id 分组发放记录；同一批次的 admin_grant 汇总为一条，admin_revoke 标记为已撤销
const batchList = computed(() => {
  const map = new Map();
  for (const grant of recentGrants.value) {
    const batchId = grant.batch_id || `legacy-${grant.id}`;
    if (!map.has(batchId)) {
      map.set(batchId, {
        key: batchId,
        batchId: grant.batch_id || null,
        amount: 0,
        count: 0,
        remark: '',
        createdAt: grant.created_at,
        grants: [],
        revoked: false,
        canRevoke: Boolean(grant.batch_id)
      });
    }
    const batch = map.get(batchId);
    if (grant.reason === 'admin_grant') {
      batch.grants.push(grant);
      batch.count += 1;
      batch.amount = grant.amount;
      if (grant.remark) batch.remark = grant.remark;
      if (!batch.createdAt || grant.created_at < batch.createdAt) {
        batch.createdAt = grant.created_at;
      }
    } else if (grant.reason === 'admin_revoke') {
      batch.revoked = true;
      batch.canRevoke = false;
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });
});

const handleRevoke = async (batch) => {
  if (!batch.batchId) return;
  const accepted = await confirm({
    title: '确认撤销发放',
    message: `将撤销 ${formatDate(batch.createdAt)} 的发放批次：${batch.amount} 积分 × ${batch.count} 位用户。所有用户将扣回对应积分，该操作不可恢复。`,
    confirmText: '确认撤销'
  });
  if (!accepted) return;

  revokingBatchId.value = batch.batchId;
  try {
    const result = await revokeGrant(batch.batchId);
    notify(`已撤销 ${result?.revoked ?? batch.count} 位用户的 ${batch.amount} 积分发放`);
    void loadRecent();
  } catch (error) {
    console.error('[PointsGrantConsole] 撤销发放失败:', error);
    notify(error?.message || '撤销发放失败', 'error');
  } finally {
    revokingBatchId.value = '';
  }
};

onMounted(() => {
  void loadRecent();
});
</script>

<style scoped>
.points-grant-page { display: grid; gap: 16px; color: var(--foreground); }

/* quota-* 基础样式（scoped 自包含，与 AiQuotaConfigConsole 一致） */
.quota-config-hero, .quota-panel { border: 1px solid var(--border); border-radius: 14px; background: var(--card); }
.quota-config-hero { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 22px; }
.quota-kicker { color: var(--muted-foreground); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.quota-config-hero h2 { margin: 4px 0 0; font-size: 22px; }
.quota-config-hero h2, .quota-panel-heading h3 { color: var(--foreground); }
.quota-config-hero p, .quota-panel-heading p { margin: 5px 0 0; color: var(--muted-foreground); font-size: 13px; line-height: 1.5; }
.quota-hero-actions { display: flex; gap: 8px; }
.quota-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 36px; padding: 0 13px; border: 1px solid var(--border); border-radius: 9px; background: var(--card); color: var(--foreground); font-weight: 650; cursor: pointer; }
.quota-btn.primary { background: var(--foreground); color: var(--background); border-color: var(--foreground); }
.quota-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.spinning { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.quota-notice { padding: 11px 14px; border-radius: 10px; font-size: 13px; }
.quota-notice.success { background: #ecfdf3; color: #067647; }
.quota-notice.error { background: #fff1f0; color: #b42318; }
.quota-panel { overflow: hidden; }
.quota-panel-heading { display: flex; align-items: center; justify-content: space-between; padding: 17px 18px; border-bottom: 1px solid var(--border); }
.quota-panel-heading h3 { font-size: 15px; color: var(--foreground); }
.quota-panel-heading > span { color: var(--muted-foreground); font-size: 12px; }
.quota-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.quota-table th, .quota-table td { padding: 12px 16px; border-bottom: 1px solid var(--border); text-align: left; white-space: nowrap; }
.quota-table th { color: var(--muted-foreground); font-size: 11px; font-weight: 650; }
.quota-table tbody tr:last-child td { border-bottom: 0; }
.quota-table code { color: var(--muted-foreground); font-size: 11px; }
.muted { color: var(--muted-foreground); max-width: 250px; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 720px) {
  .quota-config-hero { align-items: stretch; flex-direction: column; }
  .quota-hero-actions { width: 100%; }
  .quota-hero-actions .quota-btn { flex: 1; }
}

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

/* 批次分组卡片 */
.grant-batch-list { display: grid; gap: 10px; padding: 14px; }
.grant-batch-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--background);
  overflow: hidden;
  transition: border-color 0.18s ease, opacity 0.18s ease;
}
.grant-batch-card.is-revoked { opacity: 0.62; border-style: dashed; }
.grant-batch-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  flex-wrap: wrap;
}
.grant-batch-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex: 1; min-width: 0; }
.grant-batch-time { font-size: 12px; color: var(--muted-foreground); white-space: nowrap; }
.grant-batch-amount { font-size: 13px; font-weight: 700; color: var(--foreground); white-space: nowrap; }
.grant-batch-remark { font-size: 12px; color: var(--muted-foreground); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.grant-batch-tag {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}
.grant-batch-tag.active { background: #ecfdf3; color: #067647; }
.grant-batch-tag.revoked { background: #fef0c7; color: #b54708; }
.grant-batch-card.is-revoked .grant-batch-tag.revoked { background: #fee4e2; color: #b42318; }

.quota-btn.danger-ghost {
  border-color: color-mix(in srgb, #f04438 35%, transparent);
  color: #f04438;
  background: transparent;
}
.quota-btn.danger-ghost:hover:not(:disabled) {
  background: color-mix(in srgb, #f04438 8%, transparent);
}
.quota-btn.danger-ghost:disabled { opacity: 0.55; cursor: not-allowed; }

.grant-batch-detail { border-top: 1px solid var(--border); }
.grant-batch-detail > summary {
  padding: 9px 14px;
  font-size: 12px;
  color: var(--muted-foreground);
  cursor: pointer;
  user-select: none;
  list-style: none;
}
.grant-batch-detail > summary::-webkit-details-marker { display: none; }
.grant-batch-detail > summary::before { content: '▸'; margin-right: 6px; transition: transform 0.15s ease; display: inline-block; }
.grant-batch-detail[open] > summary::before { transform: rotate(90deg); }
.grant-batch-detail[open] > summary { color: var(--foreground); }

.grant-batch-users {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 14px 12px;
}
.grant-batch-user {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px 5px 12px;
  border-radius: 8px;
  font-size: 12px;
  background: var(--muted);
  color: var(--foreground);
  max-width: 220px;
}
.grant-batch-user-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.grant-batch-user-bal {
  color: var(--muted-foreground);
  font-size: 11px;
  white-space: nowrap;
}
.grant-batch-card.is-revoked .grant-batch-user { opacity: 0.7; }
</style>
