<template>
  <section class="pity-grant-page">
    <header class="quota-config-hero">
      <div>
        <span class="quota-kicker">Pity Management</span>
        <h2>保底次数管理</h2>
        <p>
          统一管理全站用户的保底次数（连续失败场次）。支持对全部或指定用户进行增加、减少、设值、清零；
          自动按订阅档位阈值截断（Plus 24 / Pro 18 / Max 12 / Ultra 8，Free 0 不计保底）。
        </p>
      </div>
      <div class="quota-hero-actions">
        <button class="quota-btn ghost" type="button" :disabled="loadingProgress || saving" @click="loadProgress(1)">
          <RefreshCw :size="15" :class="{ spinning: loadingProgress }" />刷新
        </button>
      </div>
    </header>

    <div v-if="message" class="quota-notice" :class="messageTone" role="status">{{ message }}</div>

    <!-- 阈值说明 -->
    <section class="quota-panel">
      <div class="quota-panel-heading">
        <div><h3>档位阈值</h3><p>达到阈值即下次符合条件的抽奖必中保底；Free 不计保底。</p></div>
      </div>
      <div class="pity-threshold-grid">
        <span class="pity-threshold-chip">Plus <strong>24</strong></span>
        <span class="pity-threshold-chip">Pro <strong>18</strong></span>
        <span class="pity-threshold-chip">Max <strong>12</strong></span>
        <span class="pity-threshold-chip">Ultra <strong>8</strong></span>
        <span class="pity-threshold-chip muted">Free <strong>0</strong></span>
      </div>
    </section>

    <!-- 批量操作 -->
    <section class="quota-panel grant-panel">
      <div class="quota-panel-heading">
        <div><h3>批量操作</h3><p>「全部用户」将对所有非管理员账号生效；指定用户可精确控制。</p></div>
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
              @keydown.enter.prevent="handleSearch"
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
              <span class="grant-user-points">{{ user.role || 'user' }}</span>
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

        <div class="pity-op-row">
          <div class="pity-op-switch" role="tablist" aria-label="操作类型">
            <button type="button" :class="{ 'is-active': opType === 'adjust' }" @click="opType = 'adjust'">增减</button>
            <button type="button" :class="{ 'is-active': opType === 'set' }" @click="opType = 'set'">设值</button>
            <button type="button" :class="{ 'is-active': opType === 'clear' }" @click="opType = 'clear'; opValue = 0">清零</button>
          </div>
          <div class="pity-op-fields">
            <template v-if="opType === 'adjust'">
              <label class="grant-field">
                <span>调整值（正数增加，负数减少）</span>
                <div class="pity-stepper">
                  <button type="button" class="pity-step-btn" @click="opDelta = Math.max(-100, Number(opDelta || 0) - 1)">−</button>
                  <input v-model.number="opDelta" type="number" step="1" placeholder="例如 1 或 -1" aria-label="调整值" />
                  <button type="button" class="pity-step-btn" @click="opDelta = Math.min(100, Number(opDelta || 0) + 1)">+</button>
                </div>
              </label>
              <div class="pity-presets">
                <button v-for="n in [1, 5, 10]" :key="'inc'+n" type="button" class="pity-preset" @click="opDelta = n">+{{ n }}</button>
                <button v-for="n in [1, 5, 10]" :key="'dec'+n" type="button" class="pity-preset danger" @click="opDelta = -n">−{{ n }}</button>
              </div>
            </template>
            <template v-else-if="opType === 'set'">
              <label class="grant-field">
                <span>设为（0 到阈值上限）</span>
                <input v-model.number="opValue" type="number" :min="0" :max="24" step="1" placeholder="例如 10" aria-label="设值" />
              </label>
            </template>
            <template v-else>
              <span class="pity-clear-hint">将选中用户的保底次数清零（设为 0）。Free 用户已为 0。</span>
            </template>
            <label class="grant-field grant-field-wide">
              <span>原因备注（可选，写入审计日志）</span>
              <input v-model="reason" type="text" maxlength="120" placeholder="例如：活动补偿 / 误操作回退" aria-label="原因" />
            </label>
          </div>
        </div>

        <div class="grant-submit-row">
          <span class="grant-summary">
            <template v-if="opType === 'adjust'">
              将对 <strong>{{ mode === 'all' ? '全部' : selectedUsers.length }} 位用户</strong> 的保底次数
              <strong :class="Number(opDelta) > 0 ? 'pity-positive' : 'pity-negative'">{{ Number(opDelta) > 0 ? '+' : '' }}{{ Number(opDelta) || 0 }}</strong>
            </template>
            <template v-else-if="opType === 'set'">
              将 <strong>{{ mode === 'all' ? '全部' : selectedUsers.length }} 位用户</strong> 的保底次数设为 <strong>{{ Number(opValue) || 0 }}</strong>
            </template>
            <template v-else>
              将 <strong>{{ mode === 'all' ? '全部' : selectedUsers.length }} 位用户</strong> 的保底次数<strong>清零</strong>
            </template>
            <template v-if="reason">，原因「{{ reason }}」</template>（自动按档位阈值截断，Free 跳过）
          </span>
          <button class="quota-btn primary" type="button" :disabled="saving || !canSubmit" @click="submitBatch">
            <Send :size="15" />{{ saving ? '执行中…' : '确认执行' }}
          </button>
        </div>
      </div>
    </section>

    <!-- 当前保底进度列表 -->
    <section class="quota-panel grant-panel">
      <div class="quota-panel-heading">
        <div><h3>当前保底进度</h3><p>按连续失败次数排序，支持搜索与快捷操作。</p></div>
        <span>{{ progressTotal }} 条记录</span>
      </div>

      <div class="pity-progress-toolbar">
        <div class="grant-search-row" style="flex:1">
          <input v-model="progressSearch" type="text" placeholder="按用户名或ID筛选进度..." aria-label="筛选保底进度" @keydown.enter.prevent="loadProgress(1)" />
          <button class="quota-btn ghost" type="button" :disabled="loadingProgress" @click="loadProgress(1)">
            <Search :size="15" />筛选
          </button>
        </div>
      </div>

      <div v-if="loadingProgress" class="grant-loading">正在加载保底进度…</div>
      <div v-else-if="progressList.length === 0" class="grant-empty">
        <Inbox :size="26" :stroke-width="1.5" />
        <p>暂无保底进度记录（仅显示已参与过抽奖的用户）</p>
      </div>
      <div v-else class="pity-progress-list">
        <div class="pity-progress-head">
          <span>用户</span>
          <span>档位</span>
          <span>阈值</span>
          <span>当前次数</span>
          <span>剩余</span>
          <span>状态</span>
          <span>操作</span>
        </div>
        <div v-for="row in progressList" :key="row.user_id || row.id" class="pity-progress-row" :class="{ 'is-due': row.is_due }">
          <span class="pity-user-cell">
            <strong>{{ row.username || '未命名' }}</strong>
            <code>{{ String(row.user_id || row.id || '').slice(0, 8) }}</code>
            <span v-if="row.role === 'admin'" class="pity-role-tag">admin</span>
          </span>
          <span class="pity-tier">{{ String(row.tier_code || 'free') }}</span>
          <span>{{ row.threshold ?? '—' }}</span>
          <span class="pity-count">{{ row.consecutive_losses ?? 0 }}</span>
          <span>{{ row.remaining_losses ?? '—' }}</span>
          <span><span class="pity-status" :class="row.is_due ? 'due' : 'normal'">{{ row.is_due ? '可兑现' : '累计中' }}</span></span>
          <span class="pity-row-actions">
            <button type="button" class="pity-mini-btn" :disabled="rowActionId === row.user_id" @click="quickAdjust(row, 1)" title="+1">+1</button>
            <button type="button" class="pity-mini-btn" :disabled="rowActionId === row.user_id" @click="quickAdjust(row, -1)" title="−1">−1</button>
            <button type="button" class="pity-mini-btn danger" :disabled="rowActionId === row.user_id" @click="quickSet(row, 0)" title="清零">清零</button>
            <button type="button" class="pity-mini-btn ghost" :disabled="rowActionId === row.user_id" @click="openSetDialog(row)" title="设值">设值</button>
            <button type="button" class="pity-mini-btn undo" :disabled="rowActionId === row.user_id" @click="undoRow(row)" title="撤销最近一次修改">
              <Undo2 :size="13" />撤销
            </button>
          </span>
        </div>
      </div>

      <footer v-if="progressTotal > progressPageSize" class="g-sheet-foot grant-pagination">
        <span class="g-sheet-foot-text">
          显示 {{ (progressPage - 1) * progressPageSize + 1 }} - {{ Math.min(progressPage * progressPageSize, progressTotal) }} 条 / 共 {{ progressTotal }} 条
        </span>
        <DashboardPagination
          :model-value="progressPage"
          :total="progressTotal"
          :page-size="progressPageSize"
          aria-label="保底进度分页"
          @update:model-value="loadProgress"
        />
      </footer>
    </section>

    <!-- 最近操作批次 -->
    <section class="quota-panel grant-panel">
      <div class="quota-panel-heading">
        <div><h3>最近操作批次</h3><p>按批次查看批量增减/设值记录，可展开查看每个用户的前后值。</p></div>
        <span>{{ batchOpsTotal }} 条记录</span>
      </div>

      <div v-if="loadingBatchOps" class="grant-loading">正在加载操作记录…</div>
      <div v-else-if="batchOpsList.length === 0" class="grant-empty">
        <Inbox :size="26" :stroke-width="1.5" />
        <p>暂无批量操作记录</p>
      </div>
      <div v-else class="pity-batch-list">
        <div v-for="op in batchOpsList" :key="op.id" class="pity-batch-card">
          <div class="pity-batch-head">
            <div class="pity-batch-meta">
              <span class="pity-batch-time">{{ formatDate(op.created_at) }}</span>
              <span class="pity-batch-type">{{ op.action === 'pity.batch_adjust' ? '批量增减' : '批量设值' }}</span>
              <span class="pity-batch-amount" :class="op.action === 'pity.batch_adjust' && Number(op.delta) < 0 ? 'pity-negative' : ''">
                {{ op.action === 'pity.batch_adjust' ? (Number(op.delta) > 0 ? '+' : '') + (op.delta ?? 0) : '设为 ' + (op.value ?? 0) }}
              </span>
              <span class="pity-batch-count">成功 {{ op.success ?? 0 }} / 跳过 {{ op.skipped ?? 0 }} / 失败 {{ op.failed ?? 0 }}</span>
            </div>
            <div class="pity-batch-head-right">
              <span v-if="op.reason" class="pity-batch-reason">「{{ op.reason }}」</span>
              <span v-if="op.undone" class="pity-batch-undone-tag">已撤销</span>
              <button v-else type="button" class="pity-mini-btn undo" :disabled="batchActionId === op.id" @click="undoBatch(op)">
                <Undo2 :size="13" />撤销批次
              </button>
            </div>
          </div>
          <details class="pity-batch-detail">
            <summary>查看 {{ (op.details || []).length }} 位用户明细</summary>
            <div class="pity-batch-detail-list">
              <div v-for="d in op.details" :key="d.user_id" class="pity-batch-detail-row">
                <span class="pity-batch-detail-name">{{ d.username || '未命名用户' }}</span>
                <span v-if="d.ok" class="pity-batch-detail-change">{{ d.before }} → {{ d.after }}</span>
                <span v-else class="pity-batch-detail-skip">
                  {{ d.code === 'NOT_ELIGIBLE' ? 'Free/阈值0跳过' : (d.code === 'NOT_FOUND' ? '用户不存在' : '失败') }}
                </span>
              </div>
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
import {
  adjustPity,
  batchAdjustPity,
  batchSetPity,
  fetchPityBatchOps,
  fetchPityProgress,
  searchPityTargetUsers,
  setPity,
  undoPity,
  undoPityBatch
} from '@/utils/api/pity-admin-api.js';
import { logger } from '@/utils/logger.js';
import DashboardPagination from './shared/DashboardPagination.vue';

const { confirm, prompt } = useConfirmDialog();

const mode = ref('all');
const opType = ref('adjust');
const opDelta = ref(1);
const opValue = ref(0);
const reason = ref('');
const searchQuery = ref('');
const searchResults = ref([]);
const searching = ref(false);
const selectedUsers = ref([]);
const saving = ref(false);
const message = ref('');
const messageTone = ref('success');
const loadingProgress = ref(false);
const progressList = ref([]);
const progressTotal = ref(0);
const progressPage = ref(1);
const progressPageSize = 20;
const progressSearch = ref('');
const rowActionId = ref('');
const batchOpsList = ref([]);
const batchOpsTotal = ref(0);
const loadingBatchOps = ref(false);
const batchActionId = ref('');
let progressRequestId = 0;

const canSubmit = computed(() => {
  if (mode.value === 'selected' && selectedUsers.value.length === 0) return false;
  if (opType.value === 'adjust') return Number.isInteger(Number(opDelta.value)) && Number(opDelta.value) !== 0;
  if (opType.value === 'set') return Number.isInteger(Number(opValue.value)) && Number(opValue.value) >= 0;
  if (opType.value === 'clear') return true;
  return false;
});

const notify = (text, tone = 'success') => { message.value = text; messageTone.value = tone; if (tone === 'success') setTimeout(() => { if (message.value === text) message.value = ''; }, 4000); };
const isSelected = (id) => selectedUsers.value.some(u => u.id === id);
const toggleUser = (user) => {
  if (isSelected(user.id)) selectedUsers.value = selectedUsers.value.filter(u => u.id !== user.id);
  else selectedUsers.value = [...selectedUsers.value, user];
};
const removeUser = (id) => { selectedUsers.value = selectedUsers.value.filter(u => u.id !== id); };

const handleSearch = async () => {
  searching.value = true;
  try {
    searchResults.value = await searchPityTargetUsers(searchQuery.value);
  } catch (e) {
    notify(e?.message || '搜索失败', 'error');
  } finally { searching.value = false; }
};

const loadProgress = async (page = progressPage.value) => {
  const myId = ++progressRequestId;
  loadingProgress.value = true;
  try {
    const { rows, total } = await fetchPityProgress({ page, pageSize: progressPageSize, search: progressSearch.value });
    if (myId !== progressRequestId) return;
    const totalPages = Math.max(1, Math.ceil(total / progressPageSize));
    if (total > 0 && page > totalPages) {
      await loadProgress(totalPages);
      return;
    }
    progressPage.value = page;
    progressTotal.value = total;
    progressList.value = rows;
  } catch (e) {
    if (myId !== progressRequestId) return;
    notify(e?.message || '加载保底进度失败', 'error');
  } finally {
    if (myId === progressRequestId) loadingProgress.value = false;
  }
};

const formatDate = (d) => {
  if (!d) return '--';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const loadBatchOps = async () => {
  loadingBatchOps.value = true;
  try {
    const { rows, total } = await fetchPityBatchOps(20);
    batchOpsList.value = Array.isArray(rows) ? rows : [];
    batchOpsTotal.value = Number(total || 0);
  } catch (e) {
    notify(e?.message || '加载操作批次失败', 'error');
  } finally { loadingBatchOps.value = false; }
};

const submitBatch = async () => {
  if (!canSubmit.value || saving.value) return;
  const targetCount = mode.value === 'all' ? '全部' : selectedUsers.value.length;
  let title = '确认执行';
  let msg = '';
  if (opType.value === 'adjust') msg = `将对 ${targetCount} 位用户的保底次数 ${Number(opDelta.value) > 0 ? '+' : ''}${opDelta.value}，原因：${reason.value || '无'}。自动按档位阈值截断。`;
  if (opType.value === 'set') msg = `将 ${targetCount} 位用户的保底次数设为 ${opValue.value}，原因：${reason.value || '无'}。`;
  if (opType.value === 'clear') msg = `将 ${targetCount} 位用户的保底次数清零，原因：${reason.value || '无'}。`;
  const accepted = await confirm({ title, message: msg, confirmText: '确认执行' });
  if (!accepted) return;
  saving.value = true;
  try {
    let result;
    const userIds = mode.value === 'all' ? null : selectedUsers.value.map(u => u.id);
    if (opType.value === 'adjust') {
      result = await batchAdjustPity({ userIds, delta: Number(opDelta.value), reason: reason.value });
      notify(`已完成：成功 ${result?.success ?? 0}，跳过 ${result?.skipped ?? 0}（Free/阈值0），失败 ${result?.failed ?? 0}`);
    } else if (opType.value === 'set') {
      result = await batchSetPity({ userIds, value: Number(opValue.value), reason: reason.value });
      notify(`已完成：成功 ${result?.success ?? 0}，跳过 ${result?.skipped ?? 0}，失败 ${result?.failed ?? 0}`);
    } else {
      result = await batchSetPity({ userIds, value: 0, reason: reason.value });
      notify(`已清零：成功 ${result?.success ?? 0}，跳过 ${result?.skipped ?? 0}，失败 ${result?.failed ?? 0}`);
    }
    selectedUsers.value = [];
    searchResults.value = [];
    await loadProgress(1);
    await loadBatchOps();
  } catch (e) {
    logger.error('PityGrantConsole', '批量操作失败:', e);
    notify(e?.message || '批量操作失败', 'error');
  } finally { saving.value = false; }
};

const quickAdjust = async (row, delta) => {
  const userId = row.user_id || row.id;
  if (!userId || rowActionId.value) return;
  rowActionId.value = userId;
  try {
    const res = await adjustPity({ userId, delta, reason: `快捷${delta > 0 ? '增加' : '减少'}${Math.abs(delta)}` });
    notify(`已调整「${row.username}」：${res.before} → ${res.after}（${res.tier} 阈值 ${res.threshold}）`);
    await loadProgress(progressPage.value);
  } catch (e) {
    notify(e?.message || '调整失败', 'error');
  } finally { rowActionId.value = ''; }
};

const quickSet = async (row, value) => {
  const userId = row.user_id || row.id;
  if (!userId || rowActionId.value) return;
  const accepted = await confirm({ title: '确认清零', message: `将「${row.username}」的保底次数清零？`, confirmText: '确认清零' });
  if (!accepted) return;
  rowActionId.value = userId;
  try {
    const res = await setPity({ userId, value, reason: '快捷清零' });
    notify(`已清零「${row.username}」：${res.before} → ${res.after}`);
    await loadProgress(progressPage.value);
  } catch (e) {
    notify(e?.message || '清零失败', 'error');
  } finally { rowActionId.value = ''; }
};

const openSetDialog = async (row) => {
  const userId = row.user_id || row.id;
  const input = await prompt({
    title: '设置保底次数',
    message: `为「${row.username}」（当前 ${row.consecutive_losses ?? 0}，档位 ${row.tier_code} 阈值 ${row.threshold}）设置新的保底次数：`,
    placeholder: '0 到阈值之间的整数',
    defaultValue: String(row.consecutive_losses ?? 0)
  });
  if (input === null) return;
  const v = Number(String(input).trim());
  if (!Number.isInteger(v) || v < 0) { notify('请输入大于等于 0 的整数', 'error'); return; }
  rowActionId.value = userId;
  try {
    const res = await setPity({ userId, value: v, reason: '单用户设值' });
    notify(`已设置「${row.username}」：${res.before} → ${res.after}`);
    await loadProgress(progressPage.value);
  } catch (e) {
    notify(e?.message || '设置失败', 'error');
  } finally { rowActionId.value = ''; }
};

const undoRow = async (row) => {
  const userId = row.user_id || row.id;
  if (!userId || rowActionId.value) return;
  const accepted = await confirm({
    title: '撤销保底修改',
    message: `将「${row.username}」的保底次数恢复到最近一次修改前的值（当前 ${row.consecutive_losses ?? 0}）。该操作会写入审计日志。`,
    confirmText: '确认撤销',
    tone: 'danger'
  });
  if (!accepted) return;
  rowActionId.value = userId;
  try {
    const res = await undoPity({ userId, reason: '快捷撤销' });
    notify(`已撤销「${row.username}」：${res.before} → ${res.after}（回退自 ${res.undo_from || '未知操作'}）`);
    await loadProgress(progressPage.value);
  } catch (e) {
    notify(e?.message || '撤销失败', 'error');
  } finally { rowActionId.value = ''; }
};

const undoBatch = async (op) => {
  if (!op.id || batchActionId.value) return;
  const opLabel = op.action === 'pity.batch_adjust' ? `批量${Number(op.delta) > 0 ? '+' : ''}${op.delta}` : `设为 ${op.value}`;
  const accepted = await confirm({
    title: '撤销保底批次',
    message: `将「${formatDate(op.created_at)}」的${opLabel}批次（成功 ${op.success ?? 0} 位用户）全部恢复到操作前的值。该操作会写入审计日志。`,
    confirmText: '确认撤销',
    tone: 'danger'
  });
  if (!accepted) return;
  batchActionId.value = op.id;
  try {
    const res = await undoPityBatch({ logId: op.id, reason: '批次撤销' });
    notify(`已撤销批次：${res.affected ?? 0} 位用户已恢复（跳过 ${res.skipped ?? 0}）`);
    await loadBatchOps();
    await loadProgress(progressPage.value);
  } catch (e) {
    notify(e?.message || '撤销批次失败', 'error');
  } finally { batchActionId.value = ''; }
};

onMounted(() => { void loadProgress(1); void loadBatchOps(); });
</script>

<style scoped>
.pity-grant-page { display: grid; gap: 16px; color: var(--foreground); }
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
.quota-panel-heading h3 { font-size: 15px; }
.quota-panel-heading > span { color: var(--muted-foreground); font-size: 12px; }

.pity-threshold-grid { display: flex; flex-wrap: wrap; gap: 8px; padding: 14px 18px; }
.pity-threshold-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; font-size: 12px; background: var(--muted); color: var(--foreground); border: 1px solid var(--border); }
.pity-threshold-chip.muted { opacity: 0.7; }
.pity-threshold-chip strong { font-size: 13px; }

.grant-panel { overflow: hidden; }
.grant-mode-switch { display: inline-flex; padding: 3px; border-radius: 999px; background: var(--muted); }
.grant-mode-switch button { border: none; background: transparent; padding: 7px 16px; border-radius: 999px; font-size: 13px; font-weight: 650; color: var(--muted-foreground); cursor: pointer; transition: all 0.18s ease; }
.grant-mode-switch button.is-active { background: var(--foreground); color: var(--background); }
.grant-body { padding: 16px; display: grid; gap: 14px; }
.grant-search-row { display: flex; gap: 8px; }
.grant-search-row input { flex: 1; min-width: 0; height: 38px; padding: 0 12px; border: 1px solid var(--border); border-radius: 9px; background: var(--card); color: var(--foreground); outline: none; }
.grant-search-row input:focus { border-color: var(--foreground); }
.grant-search-results { display: grid; gap: 6px; max-height: 220px; overflow-y: auto; padding: 4px; border: 1px solid var(--border); border-radius: 10px; background: var(--background); }
.grant-user-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--foreground); text-align: left; cursor: pointer; transition: all 0.15s ease; }
.grant-user-item:hover { background: var(--muted); }
.grant-user-item.is-selected { background: color-mix(in srgb, var(--foreground) 8%, transparent); border-color: color-mix(in srgb, var(--foreground) 30%, transparent); }
.grant-user-name { font-weight: 650; }
.grant-user-item code { color: var(--muted-foreground); font-size: 11px; }
.grant-user-points { margin-left: auto; color: var(--muted-foreground); font-size: 12px; }
.grant-selected-wrap { display: grid; gap: 8px; }
.grant-selected-head { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--muted-foreground); }
.grant-clear-all { border: none; background: none; color: var(--foreground); font-size: 12px; font-weight: 650; cursor: pointer; }
.grant-selected-list { display: flex; flex-wrap: wrap; gap: 6px; }
.grant-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px; font-size: 12px; background: var(--muted); color: var(--foreground); }
.grant-chip button { border: none; background: none; color: var(--muted-foreground); font-size: 14px; cursor: pointer; line-height: 1; }
.grant-chip button:hover { color: var(--foreground); }
.grant-field { display: grid; gap: 6px; }
.grant-field > span { color: var(--muted-foreground); font-size: 12px; }
.grant-field input { width: 100%; height: 38px; padding: 0 12px; border: 1px solid var(--border); border-radius: 9px; background: var(--card); color: var(--foreground); outline: none; box-sizing: border-box; }
.grant-field input:focus { border-color: var(--foreground); }
.grant-submit-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding-top: 4px; }
@media (max-width: 720px) { .grant-submit-row { flex-direction: column; align-items: stretch; } .grant-submit-row .quota-btn { width: 100%; } }
.grant-summary { font-size: 13px; color: var(--muted-foreground); line-height: 1.5; }
.grant-summary strong { color: var(--foreground); }
.pity-positive { color: #12b76a !important; }
.pity-negative { color: #f04438 !important; }
.grant-loading, .grant-empty { padding: 28px; text-align: center; color: var(--muted-foreground); font-size: 13px; }
.grant-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.grant-empty p { margin: 0; }
.grant-pagination { padding-inline: 14px; }

.pity-op-row { display: grid; gap: 12px; padding: 12px; border: 1px solid var(--border); border-radius: 12px; background: color-mix(in srgb, var(--muted) 40%, transparent); }
.pity-op-switch { display: inline-flex; gap: 6px; }
.pity-op-switch button { border: 1px solid var(--border); background: var(--card); color: var(--foreground); padding: 7px 14px; border-radius: 999px; font-size: 13px; font-weight: 650; cursor: pointer; }
.pity-op-switch button.is-active { background: var(--foreground); color: var(--background); border-color: var(--foreground); }
.pity-op-fields { display: grid; grid-template-columns: 220px 1fr; gap: 12px; align-items: start; }
@media (max-width: 720px) { .pity-op-fields { grid-template-columns: 1fr; } }
.pity-stepper { display: flex; align-items: center; gap: 0; border: 1px solid var(--border); border-radius: 9px; overflow: hidden; background: var(--card); }
.pity-stepper input { border: none !important; border-radius: 0 !important; text-align: center; flex: 1; }
.pity-step-btn { width: 38px; height: 38px; border: none; background: var(--muted); color: var(--foreground); font-size: 16px; cursor: pointer; }
.pity-step-btn:hover { background: color-mix(in srgb, var(--foreground) 10%, var(--muted)); }
.pity-presets { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding-top: 22px; }
.pity-preset { min-width: 44px; height: 30px; padding: 0 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--card); color: var(--foreground); font-size: 12px; font-weight: 650; cursor: pointer; }
.pity-preset.danger { color: #f04438; border-color: color-mix(in srgb, #f04438 30%, transparent); }
.pity-clear-hint { font-size: 13px; color: var(--muted-foreground); padding-top: 8px; grid-column: 1 / -1; }

.pity-progress-toolbar { padding: 12px 14px; border-bottom: 1px solid var(--border); display: flex; gap: 8px; }
.pity-progress-list { display: grid; }
.pity-progress-head, .pity-progress-row { display: grid; grid-template-columns: 1.6fr 0.7fr 0.6fr 0.8fr 0.7fr 0.8fr 1.4fr; gap: 8px; align-items: center; padding: 10px 14px; font-size: 13px; border-bottom: 1px solid var(--border); }
.pity-progress-head { color: var(--muted-foreground); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; background: color-mix(in srgb, var(--muted) 40%, transparent); }
.pity-progress-row.is-due { background: color-mix(in srgb, #12b76a 6%, transparent); }
.pity-user-cell { display: flex; align-items: center; gap: 6px; min-width: 0; flex-wrap: wrap; }
.pity-user-cell strong { font-weight: 700; }
.pity-user-cell code { color: var(--muted-foreground); font-size: 11px; }
.pity-role-tag { font-size: 10px; padding: 1px 6px; border-radius: 999px; background: var(--muted); color: var(--muted-foreground); }
.pity-tier { text-transform: capitalize; }
.pity-count { font-weight: 800; }
.pity-status { display: inline-flex; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
.pity-status.due { background: #ecfdf3; color: #067647; }
.pity-status.normal { background: var(--muted); color: var(--muted-foreground); }
.pity-row-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.pity-mini-btn { min-width: 38px; height: 28px; padding: 0 8px; border: 1px solid var(--border); border-radius: 7px; background: var(--card); color: var(--foreground); font-size: 12px; font-weight: 650; cursor: pointer; }
.pity-mini-btn:hover { background: var(--muted); }
.pity-mini-btn.danger { color: #f04438; border-color: color-mix(in srgb, #f04438 28%, transparent); }
.pity-mini-btn.ghost { color: var(--muted-foreground); }
.pity-mini-btn.undo { color: #7a5af8; border-color: color-mix(in srgb, #7a5af8 28%, transparent); display: inline-flex; align-items: center; gap: 4px; }
.pity-mini-btn:disabled { opacity: 0.5; cursor: not-allowed; }
@media (max-width: 900px) {
  .pity-progress-head { display: none; }
  .pity-progress-row { grid-template-columns: 1fr; gap: 6px; padding: 12px 14px; }
  .pity-row-actions { justify-content: flex-start; }
  .quota-config-hero { flex-direction: column; align-items: stretch; }
}

.pity-batch-list { display: grid; gap: 8px; padding: 14px; }
.pity-batch-card { border: 1px solid var(--border); border-radius: 12px; background: var(--card); overflow: hidden; }
.pity-batch-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; flex-wrap: wrap; }
.pity-batch-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.pity-batch-time { color: var(--muted-foreground); font-size: 12px; }
.pity-batch-type { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--muted); color: var(--foreground); }
.pity-batch-amount { font-weight: 800; font-size: 13px; }
.pity-batch-count { color: var(--muted-foreground); font-size: 12px; }
.pity-batch-head-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.pity-batch-reason { color: var(--muted-foreground); font-size: 12px; }
.pity-batch-undone-tag { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px; background: var(--muted); color: var(--muted-foreground); }
.pity-batch-detail { border-top: 1px solid var(--border); }
.pity-batch-detail summary { padding: 10px 14px; font-size: 12px; color: var(--muted-foreground); cursor: pointer; list-style: none; display: flex; align-items: center; gap: 6px; }
.pity-batch-detail summary::-webkit-details-marker { display: none; }
.pity-batch-detail summary::before { content: '▸'; transition: transform 0.15s ease; }
.pity-batch-detail[open] summary::before { transform: rotate(90deg); }
.pity-batch-detail summary:hover { background: var(--muted); }
.pity-batch-detail-list { display: grid; max-height: 260px; overflow-y: auto; border-top: 1px solid var(--border); }
.pity-batch-detail-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 14px; font-size: 12px; border-bottom: 1px solid var(--border); }
.pity-batch-detail-row:last-child { border-bottom: none; }
.pity-batch-detail-name { font-weight: 650; color: var(--foreground); }
.pity-batch-detail-change { color: var(--foreground); font-variant-numeric: tabular-nums; }
.pity-batch-detail-skip { color: var(--muted-foreground); font-size: 11px; }
</style>
