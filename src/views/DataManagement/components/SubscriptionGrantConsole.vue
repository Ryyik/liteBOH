<template>
  <section class="subscription-grant-page">
    <header class="quota-config-hero">
      <div>
        <span class="quota-kicker">Subscription Grant</span>
        <h2>订阅发放</h2>
        <p>统一给全部用户批量添加订阅，或指定部分用户添加，可设置订阅层级、订阅周期与时间。不扣减用户积分。</p>
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
        <div><h3>发放方式</h3><p>「全部用户」会对所有账号（含管理员）批量添加订阅。</p></div>
        <div class="grant-mode-switch" role="tablist" aria-label="发放范围">
          <button type="button" :class="{ 'is-active': mode === 'all' }" @click="switchMode('all')">全部用户</button>
          <button type="button" :class="{ 'is-active': mode === 'selected' }" @click="switchMode('selected')">指定用户</button>
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
          <div v-if="searchResults.length > 0" class="grant-user-grid">
            <button
              v-for="user in searchResults"
              :key="user.id"
              type="button"
              class="grant-user-card"
              :class="{ 'is-selected': isSelected(user.id) }"
              @click="toggleUser(user)"
            >
              <span class="grant-user-avatar">
                <span class="grant-user-avatar-letter">{{ avatarText(user.username) }}</span>
                <img v-if="user.avatar_url" :src="user.avatar_url" alt="" loading="lazy" @error="onAvatarError" />
              </span>
              <span class="grant-user-info">
                <span class="grant-user-name">{{ user.username || '未命名用户' }}</span>
                <span class="grant-user-sub">
                  <em class="grant-user-role" :class="`role-${user.role || 'user'}`">{{ user.role || 'user' }}</em>
                  <span>{{ user.points }} 积分</span>
                </span>
              </span>
              <span class="grant-user-check" aria-hidden="true">✓</span>
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
            <span>订阅层级</span>
            <select v-model="planCode" aria-label="订阅层级" @change="onPlanCodeChange">
              <option v-for="opt in planOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </label>
          <label class="grant-field">
            <span>层级名称（展示名）</span>
            <input v-model="planName" type="text" maxlength="60" placeholder="例如：Pro" aria-label="层级名称" />
          </label>
          <label class="grant-field">
            <span>订阅周期</span>
            <select v-model="billingCycle" aria-label="订阅周期">
              <option v-for="opt in billingOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </label>
          <label class="grant-field">
            <span>订阅月数</span>
            <input v-model.number="durationMonths" type="number" :min="1" :max="120" step="1" placeholder="例如 1" aria-label="订阅月数" />
          </label>
          <label class="grant-field">
            <span>积分成本（仅记录，不扣减）</span>
            <input v-model.number="pointsCost" type="number" :min="0" step="1" placeholder="例如 0" aria-label="积分成本" />
          </label>
          <label class="grant-field">
            <span>状态</span>
            <select v-model="status" aria-label="状态">
              <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </label>
          <label class="grant-field">
            <span>订阅时间</span>
            <input v-model="startedAt" type="datetime-local" aria-label="订阅时间" @change="onStartedAtChange" />
          </label>
          <label class="grant-field">
            <span>到期时间</span>
            <input v-model="expiresAt" type="datetime-local" aria-label="到期时间" @change="onExpiresAtChange" />
          </label>
        </div>

        <div class="grant-skip-row">
          <label class="grant-skip-toggle">
            <input type="checkbox" v-model="skipExisting" />
            <span>跳过已有订阅用户</span>
          </label>
          <div class="grant-scope-switch" role="tablist" aria-label="跳过范围">
            <button type="button" :class="{ 'is-active': skipScope === 'same' }" @click="skipScope = 'same'">同层级</button>
            <button type="button" :class="{ 'is-active': skipScope === 'any' }" @click="skipScope = 'any'">所有层级</button>
          </div>
          <span class="grant-skip-hint">
            已有 <strong>{{ skipScope === 'any' ? existingAnyTotal : existingSameTotal }}</strong> 位用户{{ skipScope === 'any' ? '订阅了任意层级' : `订阅了「${planName || planCode}」层级` }}，开启后将跳过他们（{{ skipScope === 'any' ? '跳过所有生效订阅' : '仅跳过同层级生效订阅' }}）
          </span>
        </div>

        <div class="grant-submit-row">
          <span class="grant-summary">
            将为 <strong>{{ targetText }}</strong> 添加
            <strong>{{ planName || planCode }}</strong> 订阅（{{ billingCycle === 'yearly' ? '年付' : '月付' }} {{ durationMonths }} 个月）
            <template v-if="expiresAtText">，至 {{ expiresAtText }} 到期</template>
            <template v-if="skipExisting && skipTargetTotal > 0">，跳过 {{ skipTargetTotal }} 位已有{{ skipScope === 'any' ? '任意层级' : '同层级' }}订阅用户</template>
          </span>
          <button class="quota-btn primary" type="button" :disabled="saving || !canSubmit" @click="submitGrant">
            <Send :size="15" />{{ saving ? '发放中…' : '确认发放' }}
          </button>
        </div>
      </div>
    </section>

    <section class="quota-panel grant-panel">
      <div class="quota-panel-heading">
        <div>
          <h3>已有订阅用户</h3>
          <p>{{ listScope === 'any' ? '当前所有层级的生效订阅用户名单，可直接编辑。' : `当前「${planName || planCode}」层级的生效订阅用户名单，可直接编辑。` }}</p>
        </div>
        <div class="grant-head-actions">
          <div class="grant-scope-switch" role="tablist" aria-label="名单范围">
            <button type="button" :class="{ 'is-active': listScope === 'same' }" @click="switchListScope('same')">当前层级</button>
            <button type="button" :class="{ 'is-active': listScope === 'any' }" @click="switchListScope('any')">所有层级</button>
          </div>
          <span>{{ existingTotal }} 人</span>
        </div>
      </div>
      <div v-if="existingLoading" class="grant-loading">正在加载已有订阅用户…</div>
      <div v-else-if="existingUsers.length === 0" class="grant-empty">
        <Inbox :size="26" :stroke-width="1.5" />
        <p>暂无用户订阅该层级</p>
      </div>
      <div v-else class="grant-existing-list">
        <div v-for="sub in existingUsers" :key="sub.id" class="grant-existing-row">
          <span class="grant-existing-name">{{ sub.username || '未命名用户' }}</span>
          <span class="grant-existing-plan">{{ sub.plan_name || sub.plan_code }}</span>
          <span class="grant-existing-period">{{ formatDate(sub.started_at) }} ~ {{ formatDate(sub.expires_at) }}</span>
          <span class="grant-batch-tag" :class="sub.status">{{ statusLabel(sub.status) }}</span>
          <div class="grant-row-actions">
            <button type="button" class="grant-edit-btn" @click="openEdit(sub)">编辑</button>
            <button type="button" class="grant-edit-btn danger" @click="cancelOne(sub)">撤销</button>
          </div>
        </div>
      </div>
    </section>

    <SubscriptionEditModal
      v-model="editVisible"
      :subscription="editingSubscription"
      @saved="onSubscriptionEdited"
    />
    <section class="quota-panel grant-panel">
      <div class="quota-panel-heading">
        <div><h3>最近发放记录</h3><p>按发放批次展示，可展开查看用户明细。</p></div>
        <span>{{ recentTotal }} 批次</span>
      </div>
      <div v-if="recentLoading" class="grant-loading">正在加载发放记录…</div>
      <div v-else-if="batchList.length === 0" class="grant-empty">
        <Inbox :size="26" :stroke-width="1.5" />
        <p>暂无发放记录</p>
      </div>
      <div v-else class="grant-batch-list">
        <div v-for="batch in batchList" :key="batch.batchId" class="grant-batch-card">
          <div class="grant-batch-head">
            <div class="grant-batch-meta">
              <span class="grant-batch-time">{{ formatDate(batch.createdAt) }}</span>
              <span class="grant-batch-amount">{{ batch.planName }} × {{ batch.count }} 位用户</span>
              <span class="grant-batch-sub">{{ batch.billingCycle === 'yearly' ? '年付' : '月付' }} {{ batch.durationMonths }} 个月</span>
              <span class="grant-batch-tag" :class="batch.status">{{ statusLabel(batch.status) }}</span>
            </div>
            <span class="grant-batch-period">
              {{ formatDate(batch.startedAt) }} ~ {{ formatDate(batch.expiresAt) }}
            </span>
            <button type="button" class="grant-edit-btn danger" @click="cancelBatch(batch)">撤销批次</button>
          </div>
          <details class="grant-batch-detail">
            <summary>展开查看 {{ batch.count }} 位用户明细</summary>
            <div class="grant-batch-users">
              <span v-for="grant in batch.users" :key="grant.id" class="grant-batch-user">
                <span class="grant-batch-user-name">{{ grant.username || '未命名用户' }}</span>
              </span>
            </div>
          </details>
        </div>
      </div>
      <footer v-if="recentTotal > recentPageSize" class="g-sheet-foot grant-pagination">
        <span class="g-sheet-foot-text">
          显示 {{ (recentPage - 1) * recentPageSize + 1 }} - {{ Math.min(recentPage * recentPageSize, recentTotal) }} 批 / 共 {{ recentTotal }} 批
        </span>
        <DashboardPagination
          :model-value="recentPage"
          :total="recentTotal"
          :page-size="recentPageSize"
          aria-label="订阅发放记录分页"
          @update:model-value="loadRecent"
        />
      </footer>
    </section>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { Inbox, RefreshCw, Search, Send } from 'lucide-vue-next';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';
import { invalidateByTags } from '@/utils/request-core.js';
import { clearUserTierCache } from '@/utils/api/api-key-runtime-api.js';
import {
  cancelSubscription,
  cancelSubscriptionBatch,
  fetchExistingSubscribers,
  fetchRecentSubscriptionBatches,
  fetchSubscriptionTargetCount,
  grantSubscriptions,
  searchSubscriptionTargetUsers
} from '@/utils/api/subscription-admin-api.js';
import {
  SUBSCRIPTION_BILLING_OPTIONS,
  SUBSCRIPTION_PLAN_NAMES,
  SUBSCRIPTION_PLAN_OPTIONS,
  SUBSCRIPTION_STATUS_OPTIONS
} from '../config/fields.js';
import { logger } from '@/utils/logger.js';
import DashboardPagination from './shared/DashboardPagination.vue';
import SubscriptionEditModal from './SubscriptionEditModal.vue';

const { confirm } = useConfirmDialog();

const mode = ref('all');
const searchQuery = ref('');
const searchResults = ref([]);
const searching = ref(false);
const selectedUsers = ref([]);
const allUserCount = ref(0);

const planOptions = SUBSCRIPTION_PLAN_OPTIONS;
const billingOptions = SUBSCRIPTION_BILLING_OPTIONS;
const statusOptions = SUBSCRIPTION_STATUS_OPTIONS;

const planCode = ref('pro');
const planName = ref(SUBSCRIPTION_PLAN_NAMES.pro || 'Pro');
const billingCycle = ref('monthly');
const durationMonths = ref(1);
const pointsCost = ref(0);
const status = ref('active');
const startedAt = ref('');
const expiresAt = ref('');
let expiresAtTouched = false;

const saving = ref(false);
const message = ref('');
const messageTone = ref('success');
const loading = ref(false);
const recentLoading = ref(false);
const batchList = ref([]);
const recentPage = ref(1);
const recentTotal = ref(0);
const recentPageSize = 20;
let recentRequestId = 0;

const skipExisting = ref(false);
const skipScope = ref('same'); // 'same' | 'any'
const listScope = ref('same'); // 'same' | 'any'
const existingUsers = ref([]);
const existingTotal = ref(0);
const existingSameTotal = ref(0);
const existingAnyTotal = ref(0);
const existingLoading = ref(false);
let existingRequestId = 0;

const editVisible = ref(false);
const editingSubscription = ref(null);

const invalidateSubscriptionCache = (userId = '') => {
  const tags = ['subscriptions'];
  const normalizedUserId = String(userId || '').trim();
  if (normalizedUserId) tags.push(`subscriptions:user:${normalizedUserId}`);
  invalidateByTags(tags);
  if (normalizedUserId) {
    clearUserTierCache({ targetUserId: normalizedUserId }).catch((error) => {
      logger.warn('subscription-grant', '清除目标用户服务端订阅缓存失败:', error);
    });
  }
};

const pad = (n) => String(n).padStart(2, '0');
const toDatetimeLocal = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const toISO = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

const targetText = computed(() => {
  if (mode.value === 'selected') return `${selectedUsers.value.length} 位用户`;
  return allUserCount.value > 0 ? `全部 ${allUserCount.value} 位用户（含管理员）` : '全部用户';
});

const expiresAtText = computed(() => {
  const iso = toISO(expiresAt.value);
  return iso ? formatDate(iso) : '';
});

const skipTargetTotal = computed(() => skipScope.value === 'any' ? existingAnyTotal.value : existingSameTotal.value);

const canSubmit = computed(() => {
  if (!planCode.value || !String(planName.value || '').trim()) return false;
  if (mode.value === 'selected' && selectedUsers.value.length === 0) return false;
  if (!Number.isInteger(durationMonths.value) || durationMonths.value <= 0 || durationMonths.value > 120) return false;
  if (!Number.isFinite(pointsCost.value) || pointsCost.value < 0) return false;
  if (!toISO(startedAt.value)) return false;
  if (!toISO(expiresAt.value)) return false;
  if (Date.parse(toISO(expiresAt.value)) <= Date.parse(toISO(startedAt.value))) return false;
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

const avatarText = (username) => {
  const name = String(username || '').trim();
  return name ? name.slice(0, 1).toUpperCase() : '?';
};

const onAvatarError = (event) => {
  event.target.style.display = 'none';
};

const onPlanCodeChange = () => {
  planName.value = SUBSCRIPTION_PLAN_NAMES[planCode.value] || planCode.value;
  void loadExistingSubscribers();
};

const computeExpiresAt = () => {
  const startIso = toISO(startedAt.value);
  if (!startIso) return;
  const months = Number(durationMonths.value);
  if (!Number.isInteger(months) || months <= 0) return;
  const end = new Date(startIso);
  end.setUTCMonth(end.getUTCMonth() + months);
  expiresAt.value = toDatetimeLocal(end);
};

const onStartedAtChange = () => {
  if (!expiresAtTouched) computeExpiresAt();
};

const onExpiresAtChange = () => {
  expiresAtTouched = true;
};

const switchMode = (next) => {
  mode.value = next;
  if (next === 'all') void loadAllUserCount();
};

const loadAllUserCount = async () => {
  try {
    allUserCount.value = await fetchSubscriptionTargetCount();
  } catch (error) {
    allUserCount.value = 0;
  }
};

const loadExistingSubscribers = async () => {
  const myRequestId = ++existingRequestId;
  existingLoading.value = true;
  try {
    const result = await fetchExistingSubscribers(planCode.value, listScope.value === 'any');
    if (myRequestId !== existingRequestId) return;
    existingUsers.value = Array.isArray(result.rows) ? result.rows : [];
    existingTotal.value = Number(result.total || 0);
    existingSameTotal.value = Number(result.sameTotal || 0);
    existingAnyTotal.value = Number(result.anyTotal || 0);
  } catch (error) {
    if (myRequestId !== existingRequestId) return;
    existingUsers.value = [];
    existingTotal.value = 0;
    existingSameTotal.value = 0;
    existingAnyTotal.value = 0;
  } finally {
    if (myRequestId === existingRequestId) existingLoading.value = false;
  }
};

const switchListScope = (scope) => {
  listScope.value = scope;
  void loadExistingSubscribers();
};

const openEdit = (sub) => {
  editingSubscription.value = sub;
  editVisible.value = true;
};

const onSubscriptionEdited = () => {
  const editedUser = editingSubscription.value?.user_id;
  if (editedUser) invalidateSubscriptionCache(editedUser);
  editingSubscription.value = null;
  notify('订阅已更新');
  void loadExistingSubscribers();
};

const cancelOne = async (sub) => {
  const accepted = await confirm({
    title: '撤销订阅',
    message: `确定撤销「${sub.username || '未命名用户'}」的「${sub.plan_name || sub.plan_code}」订阅吗？撤销后该订阅立即失效（标记为已取消），记录保留可追溯。`,
    confirmText: '确认撤销',
    tone: 'danger'
  });
  if (!accepted) return;
  try {
    await cancelSubscription({ subscriptionId: sub.id });
    if (sub.user_id) invalidateSubscriptionCache(sub.user_id);
    notify('订阅已撤销');
    void loadExistingSubscribers();
  } catch (error) {
    logger.error('SubscriptionGrantConsole', '撤销订阅失败:', error);
    notify(error?.message || '撤销订阅失败', 'error');
  }
};

const cancelBatch = async (batch) => {
  const accepted = await confirm({
    title: '撤销发放批次',
    message: `确定撤销「${batch.planName}」× ${batch.count} 位用户这一批次吗？批次内仍生效的订阅将全部标记为已取消，记录保留可追溯。`,
    confirmText: '确认撤销',
    tone: 'danger'
  });
  if (!accepted) return;
  try {
    const result = await cancelSubscriptionBatch({ batchId: batch.batchId });
    const affected = Number(result?.affected || 0);
    notify(affected > 0 ? `已撤销该批次 ${affected} 条生效订阅` : '该批次没有仍生效的订阅');
    invalidateByTags(['subscriptions']);
    void loadExistingSubscribers();
    void loadRecent(recentPage.value);
  } catch (error) {
    logger.error('SubscriptionGrantConsole', '撤销发放批次失败:', error);
    notify(error?.message || '撤销发放批次失败', 'error');
  }
};

const handleSearch = async () => {
  searching.value = true;
  try {
    searchResults.value = await searchSubscriptionTargetUsers(searchQuery.value);
  } catch (error) {
    notify(error?.message || '搜索用户失败', 'error');
  } finally {
    searching.value = false;
  }
};

const submitGrant = async () => {
  if (!canSubmit.value) return;
  const userIds = mode.value === 'all' ? null : selectedUsers.value.map(u => u.id);
  const targetCount = mode.value === 'all'
    ? (allUserCount.value > 0 ? `全部 ${allUserCount.value} 位用户（含管理员）` : '全部用户')
    : `${selectedUsers.value.length} 位用户`;
  const skipNote = skipExisting.value && skipTargetTotal.value > 0
    ? `，跳过 ${skipTargetTotal.value} 位已有${skipScope.value === 'any' ? '任意层级' : `「${planName.value || planCode.value}」`}生效订阅的用户`
    : '';
  const accepted = await confirm({
    title: '确认发放订阅',
    message: `将向 ${targetCount} 添加「${planName.value || planCode.value}」订阅（${billingCycle.value === 'yearly' ? '年付' : '月付'} ${durationMonths.value} 个月），到期时间 ${expiresAtText.value}${skipNote}。该操作立即生效，不扣减用户积分。`,
    confirmText: '确认发放'
  });
  if (!accepted) return;

  saving.value = true;
  try {
    const result = await grantSubscriptions({
      userIds,
      planCode: planCode.value,
      planName: planName.value,
      billingCycle: billingCycle.value,
      pointsCost: pointsCost.value,
      durationMonths: durationMonths.value,
      startedAt: toISO(startedAt.value),
      expiresAt: toISO(expiresAt.value),
      status: status.value,
      skipExisting: skipExisting.value,
      skipAnyTier: skipScope.value === 'any'
    });
    const affected = result?.affected ?? 0;
    const skipped = Number(result?.skipped || 0);
    const summary = skipped > 0
      ? `已向 ${affected} 位用户发放「${result?.plan_name || planName.value}」订阅，跳过 ${skipped} 位已有订阅用户`
      : `已向 ${affected} 位用户发放「${result?.plan_name || planName.value}」订阅`;
    notify(summary);
    invalidateByTags(['subscriptions']);
    selectedUsers.value = [];
    searchResults.value = [];
    void loadExistingSubscribers();
    void loadRecent(1);
  } catch (error) {
    logger.error('SubscriptionGrantConsole', '发放订阅失败:', error);
    notify(error?.message || '发放订阅失败', 'error');
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

const statusLabel = (s) => {
  const found = statusOptions.find(opt => opt.value === s);
  return found ? found.label.replace(/（.*）/, '') : (s || '--');
};

const loadRecent = async (page = recentPage.value) => {
  const myRequestId = ++recentRequestId;
  recentLoading.value = true;
  try {
    const result = await fetchRecentSubscriptionBatches({ page, pageSize: recentPageSize });
    if (myRequestId !== recentRequestId) return;
    const total = Number(result.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / recentPageSize));
    if (total > 0 && page > totalPages) {
      await loadRecent(totalPages);
      return;
    }
    recentPage.value = page;
    recentTotal.value = total;
    batchList.value = result.rows.map((batch) => ({
      batchId: batch.batch_id,
      createdAt: batch.batch_created_at,
      planCode: batch.plan_code,
      planName: batch.plan_name,
      billingCycle: batch.billing_cycle,
      durationMonths: batch.duration_months,
      startedAt: batch.started_at,
      expiresAt: batch.expires_at,
      status: batch.status,
      count: Number(batch.grant_count || 0),
      users: Array.isArray(batch.users) ? batch.users : []
    }));
  } catch (error) {
    if (myRequestId !== recentRequestId) return;
    notify(error?.message || '加载发放记录失败', 'error');
  } finally {
    if (myRequestId === recentRequestId) recentLoading.value = false;
  }
};

onMounted(() => {
  startedAt.value = toDatetimeLocal(new Date());
  computeExpiresAt();
  void loadAllUserCount();
  void loadExistingSubscribers();
  void loadRecent();
});
</script>

<style scoped>
.subscription-grant-page { display: grid; gap: 16px; color: var(--foreground); }

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
.grant-scope-switch {
  display: inline-flex;
  padding: 2px;
  border-radius: 999px;
  background: var(--muted);
  flex-shrink: 0;
}
.grant-scope-switch button {
  border: none;
  background: transparent;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 650;
  color: var(--muted-foreground);
  cursor: pointer;
  transition: all 0.18s ease;
}
.grant-scope-switch button.is-active {
  background: var(--foreground);
  color: var(--background);
}
.grant-head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.grant-head-actions > span {
  color: var(--muted-foreground);
  font-size: 12px;
  white-space: nowrap;
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

/* 用户卡片网格 */
.grant-user-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
  max-height: 260px;
  overflow-y: auto;
  padding: 4px;
}
.grant-user-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--background);
  color: var(--foreground);
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
}
.grant-user-card:hover { border-color: color-mix(in srgb, var(--foreground) 35%, transparent); }
.grant-user-card.is-selected {
  background: color-mix(in srgb, var(--foreground) 8%, transparent);
  border-color: var(--foreground);
}
.grant-user-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--muted);
  color: var(--muted-foreground);
  font-size: 14px;
  font-weight: 700;
  overflow: hidden;
  position: relative;
}
.grant-user-avatar-letter { line-height: 1; }
.grant-user-avatar img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.grant-user-info { display: grid; gap: 3px; min-width: 0; }
.grant-user-name {
  font-weight: 650;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.grant-user-sub { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted-foreground); }
.grant-user-role {
  font-style: normal;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--muted);
}
.grant-user-role.role-admin { background: #fef0c7; color: #b54708; }
.grant-user-check {
  margin-left: auto;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: transparent;
  border: 1px solid var(--border);
  flex-shrink: 0;
  transition: all 0.15s ease;
}
.grant-user-card.is-selected .grant-user-check {
  background: var(--foreground);
  color: var(--background);
  border-color: var(--foreground);
}
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

.grant-fields { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
@media (max-width: 1080px) { .grant-fields { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 720px) { .grant-fields { grid-template-columns: 1fr; } }
.grant-field { display: grid; gap: 6px; }
.grant-field > span { color: var(--muted-foreground); font-size: 12px; }
.grant-field input, .grant-field select {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--card);
  color: var(--foreground);
  outline: none;
  box-sizing: border-box;
  font-size: 13px;
}
.grant-field input:focus, .grant-field select:focus { border-color: var(--foreground); }
.grant-submit-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding-top: 4px;
}
.grant-skip-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 13px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--muted) 40%, transparent);
  flex-wrap: wrap;
}
.grant-skip-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 650;
  color: var(--foreground);
  user-select: none;
}
.grant-skip-toggle input {
  width: 16px;
  height: 16px;
  accent-color: var(--foreground);
  cursor: pointer;
}
.grant-skip-hint { font-size: 12px; color: var(--muted-foreground); }
.grant-skip-hint strong { color: var(--foreground); }
.grant-existing-list { padding: 8px 14px 14px; display: grid; gap: 8px; max-height: 320px; overflow-y: auto; }
.grant-existing-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--background);
  flex-wrap: wrap;
}
.grant-existing-name { font-size: 13px; font-weight: 700; color: var(--foreground); min-width: 90px; }
.grant-existing-plan { font-size: 12px; color: var(--muted-foreground); }
.grant-existing-period { font-size: 12px; color: var(--muted-foreground); margin-left: auto; }
.grant-edit-btn {
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--foreground);
  font-size: 12px;
  font-weight: 650;
  padding: 5px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.grant-edit-btn:hover { border-color: var(--foreground); background: var(--muted); }
.grant-edit-btn.danger { color: #b42318; }
.grant-edit-btn.danger:hover { border-color: #b42318; background: #fff1f0; }
.grant-row-actions { display: inline-flex; gap: 6px; flex-shrink: 0; }
@media (max-width: 720px) {
  .grant-existing-period { margin-left: 0; width: 100%; }
  .quota-panel-heading { flex-wrap: wrap; gap: 10px; }
  .grant-head-actions { width: 100%; justify-content: space-between; }
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

/* 批次分组卡片 */
.grant-batch-list { display: grid; gap: 10px; padding: 14px; }
.grant-batch-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--background);
  overflow: hidden;
}
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
.grant-batch-sub { font-size: 12px; color: var(--muted-foreground); white-space: nowrap; }
.grant-batch-period { font-size: 12px; color: var(--muted-foreground); white-space: nowrap; }
.grant-batch-tag {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}
.grant-batch-tag.active { background: #ecfdf3; color: #067647; }
.grant-batch-tag.expired { background: #fef0c7; color: #b54708; }
.grant-batch-tag.cancelled { background: #fee4e2; color: #b42318; }
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
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 12px;
  background: var(--muted);
  color: var(--foreground);
  max-width: 200px;
}
.grant-batch-user-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.grant-batch-user-bal {
  font-size: 11px;
  color: var(--muted-foreground);
  white-space: nowrap;
}
.grant-pagination { padding-inline: 14px; }
</style>
