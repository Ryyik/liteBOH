<template>
  <div class="ai-quota-page">
    <main class="quota-shell">
      <header class="page-header">
        <div>
          <span class="eyebrow">AI Config</span>
          <h1>AI 对话配额配置</h1>
          <p>管理各用户等级的 AI 对话每日限额。修改后最长 1 分钟生效。</p>
        </div>
        <div class="header-actions">
          <button type="button" class="ghost-btn" @click="loadConfig" :disabled="isLoading">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{ spinning: isLoading }">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>刷新</span>
          </button>
        </div>
      </header>

      <div v-if="errorMessage" class="notice error">{{ errorMessage }}</div>
      <div v-if="successMessage" class="notice success">{{ successMessage }}</div>

      <section class="config-table-section">
        <div v-if="isLoading && configs.length === 0" class="empty-state">正在加载配置...</div>
        <div v-else-if="configs.length === 0" class="empty-state">暂无配额配置数据。</div>

        <table v-else class="quota-table">
          <thead>
            <tr>
              <th>层级</th>
              <th>每日限额</th>
              <th>最后更新</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in configs" :key="row.tier">
              <td class="tier-cell">
                <strong>{{ tierLabel(row.tier) }}</strong>
              </td>
              <td class="limit-cell">
                <div v-if="editingTier === row.tier" class="limit-edit">
                  <input v-model.number="editValue" type="number" min="-1" class="limit-input"
                    :class="{ 'input-error': editValue !== -1 && editValue < 0 }" />
                  <span v-if="editValue === -1" class="limit-hint">(-1 = 无限)</span>
                </div>
                <span v-else class="limit-value">{{ row.daily_limit === -1 ? '∞ 无限' : row.daily_limit + ' 条' }}</span>
              </td>
              <td class="date-cell">{{ formatDate(row.updated_at) }}</td>
              <td class="action-cell">
                <button v-if="editingTier === row.tier" type="button" class="btn-sm btn-save"
                  :disabled="isSaving" @click="handleSave(row.tier)">
                  {{ isSaving ? '保存中...' : '保存' }}
                </button>
                <template v-else>
                  <button type="button" class="btn-sm btn-edit" @click="startEdit(row)">编辑</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '@/utils/supabase-client.js';
import { logger } from '@/utils/logger.js';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();

const isLoading = ref(false);
const isSaving = ref(false);
const configs = ref([]);
const editingTier = ref('');
const editValue = ref(0);
const errorMessage = ref('');
const successMessage = ref('');

const TIER_LABELS_MAP = {
  guest: '未登录用户',
  free: '免费用户',
  plus: 'Plus',
  pro: 'Pro',
  max: 'Max',
  ultra: 'Ultra'
};

const tierLabel = (tier) => TIER_LABELS_MAP[tier] || tier;

const formatDate = (iso) => {
  if (!iso) return '--';
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false });
  } catch { return '--'; }
};

const loadConfig = async () => {
  if (!authStore.isAdmin) {
    errorMessage.value = '无权限访问：仅管理员可管理 AI 配额配置';
    logger.warn('ai-quota', '非管理员尝试访问配额配置页');
    return;
  }
  isLoading.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const { data, error } = await supabase
      .from('ai_quota_config')
      .select('*')
      .order('tier', { ascending: true });
    if (error) throw error;
    configs.value = data || [];
  } catch (err) {
    errorMessage.value = '加载失败: ' + (err.message || '未知错误');
    logger.error('ai-quota', '加载配额配置失败', err);
  } finally {
    isLoading.value = false;
  }
};

const startEdit = (row) => {
  editingTier.value = row.tier;
  editValue.value = row.daily_limit;
};

const handleSave = async (tier) => {
  if (!authStore.isAdmin) {
    errorMessage.value = '无权限：仅管理员可修改配额配置';
    return;
  }
  const val = Number(editValue.value);
  if (!Number.isFinite(val) || (val < -1)) {
    errorMessage.value = '限额必须 >= -1（-1=无限）';
    return;
  }
  isSaving.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const { error } = await supabase
      .from('ai_quota_config')
      .upsert({ tier, daily_limit: val, updated_at: new Date().toISOString() })
      
    if (error) throw error;
    successMessage.value = `${tierLabel(tier)} 限额已更新为 ${val === -1 ? '无限' : val + ' 条'}`;
    editingTier.value = '';
    await loadConfig();
  } catch (err) {
    errorMessage.value = '保存失败: ' + (err.message || '未知错误');
    logger.error('ai-quota', '保存配额配置失败', err);
  } finally {
    isSaving.value = false;
  }
};

onMounted(() => {
  loadConfig();
});
</script>

<style scoped>
.ai-quota-page {
  min-height: 100vh;
  background: #f8fafc;
  display: flex;
  justify-content: center;
  padding: 32px 24px;
}

.quota-shell {
  width: 100%;
  max-width: 800px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.eyebrow {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: #1459d9;
  text-transform: uppercase;
}

.page-header h1 {
  margin: 4px 0 6px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
}

.page-header p {
  margin: 0;
  font-size: 14px;
  color: #64748b;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.ghost-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  color: #475569;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.ghost-btn:hover {
  background: #f1f5f9;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.notice {
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  margin-bottom: 16px;
}

.notice.error {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.notice.success {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
}

.empty-state {
  text-align: center;
  padding: 48px 0;
  color: #94a3b8;
  font-size: 15px;
}

.config-table-section {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
}

.quota-table {
  width: 100%;
  border-collapse: collapse;
}

.quota-table th {
  text-align: left;
  padding: 14px 20px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.quota-table td {
  padding: 14px 20px;
  font-size: 14px;
  color: #334155;
  border-bottom: 1px solid #f1f5f9;
}

.quota-table tr:last-child td {
  border-bottom: none;
}

.tier-cell strong {
  color: #0f172a;
}

.limit-value {
  font-variant-numeric: tabular-nums;
}

.limit-edit {
  display: flex;
  align-items: center;
  gap: 8px;
}

.limit-input {
  width: 80px;
  padding: 6px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 14px;
  text-align: center;
}

.limit-input.input-error {
  border-color: #ef4444;
  box-shadow: 0 0 0 1px #ef4444;
}

.limit-hint {
  font-size: 12px;
  color: #94a3b8;
}

.date-cell {
  color: #94a3b8;
  font-size: 13px;
}

.action-cell {
  display: flex;
  gap: 8px;
}

.btn-sm {
  padding: 6px 14px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.btn-edit {
  background: #f1f5f9;
  color: #475569;
}

.btn-edit:hover {
  background: #e2e8f0;
}

.btn-save {
  background: #1459d9;
  color: #fff;
}

.btn-save:hover {
  background: #1045b0;
}

.btn-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
