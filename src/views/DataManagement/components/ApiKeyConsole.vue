<template>
  <section class="g-api-key-console">
    <DashboardHero
      eyebrow="Security Console"
      title="API Key 管理"
      description="集中管理第三方服务密钥。完整 Key 只在服务端加密存储，前端仅显示脱敏信息。"
    >
      <template #actions>
        <button type="button" class="g-btn g-btn-ghost" @click="loadKeys" :disabled="isLoading">
          <RefreshCw :size="16" :class="{ 'g-spin': isLoading }" />
          <span>刷新</span>
        </button>
        <button type="button" class="g-btn g-btn-primary" @click="openCreateForm">
          <Plus :size="16" />
          <span>新增密钥</span>
        </button>
      </template>
    </DashboardHero>

    <!-- Active key banner -->
    <article class="g-card g-api-key-banner" :class="{ 'is-active': activeKeyInfo }">
      <div class="g-api-key-banner-main">
        <div class="g-api-key-banner-icon"><KeyRound :size="20" /></div>
        <div>
          <div class="g-eyebrow">BOH 模型当前在用</div>
          <strong v-if="activeKeyInfo">{{ activeKeyInfo.label || `${activeKeyInfo.provider} ${activeKeyInfo.purpose}` }}</strong>
          <strong v-else>查询中...</strong>
          <div v-if="activeKeyInfo" class="g-api-key-banner-meta">
            <code v-if="activeKeyInfo.maskedValue" class="g-api-key-banner-code">{{ activeKeyInfo.maskedValue }}</code>
            <span v-if="activeKeyInfo.source === 'server_secret_fallback' || activeKeyInfo.readonly" class="g-badge is-warning">
              <span class="g-badge-dot" />Secrets 兜底
            </span>
          </div>
          <span v-else-if="activeKeyError" class="g-api-key-banner-error">{{ activeKeyError }}</span>
        </div>
      </div>
      <button type="button" class="g-btn g-btn-secondary g-btn-sm" @click="loadActiveKey" :disabled="isLoadingActiveKey">
        <RefreshCw :size="14" :class="{ 'g-spin': isLoadingActiveKey }" />
        重新查询
      </button>
    </article>

    <!-- Summary grid -->
    <div class="g-api-key-summary">
      <article v-for="item in summaryCards" :key="item.label" class="g-mini-card">
        <component :is="item.icon" :size="18" class="g-api-key-summary-icon" />
        <span class="g-eyebrow">{{ item.label }}</span>
        <strong class="g-mini-value">{{ item.value }}</strong>
      </article>
    </div>

    <!-- Notices -->
    <DashboardNotice v-if="errorMessage" tone="error" dismissible @dismiss="setMessage('')">
      {{ errorMessage }}
    </DashboardNotice>
    <DashboardNotice v-if="successMessage" tone="success" dismissible @dismiss="setMessage('')">
      {{ successMessage }}
    </DashboardNotice>

    <!-- Vault table + form (2 columns) -->
    <div class="g-api-key-layout">
      <!-- Key list -->
      <article class="g-card">
        <div class="g-card-head">
          <div>
            <div class="g-eyebrow">密钥列表</div>
            <strong>{{ apiKeys.length }} 项</strong>
          </div>
          <ShieldCheck :size="20" class="g-api-key-shield" />
        </div>
        <p class="g-api-key-hint">替换密钥时不会回显旧值，只能覆盖写入。</p>

        <div v-if="isLoading && apiKeys.length === 0" class="g-empty">正在读取密钥配置...</div>
        <div v-else-if="apiKeys.length === 0" class="g-empty">还没有保存任何 API Key。</div>
        <div v-else class="g-list">
          <article
            v-for="item in apiKeys"
            :key="item.id"
            :class="['g-api-key-row', { 'is-active': isActiveKey(item), 'is-readonly': item.readonly }]"
          >
            <div class="g-api-key-row-main">
              <div class="g-api-key-row-icon"><KeyRound :size="18" /></div>
              <div class="g-api-key-row-text">
                <div class="g-api-key-row-title">
                  <strong>{{ item.label || `${item.provider} ${item.purpose}` }}</strong>
                  <span :class="['g-badge', item.status === 'active' ? 'is-success' : 'is-muted']">
                    {{ item.status === 'active' ? '启用' : '停用' }}
                  </span>
                  <span v-if="item.readonly" class="g-badge is-warning">
                    <span class="g-badge-dot" />Secrets
                  </span>
                  <span v-if="isActiveKey(item)" class="g-badge is-primary">
                    <span class="g-badge-dot" />当前活跃
                  </span>
                </div>
                <div class="g-api-key-row-meta">
                  <span>{{ item.provider }}</span>
                  <span>{{ item.purpose }}</span>
                  <code class="is-mono">{{ item.maskedValue || '未生成脱敏值' }}</code>
                </div>
              </div>
            </div>
            <div class="g-api-key-row-test">
              <span :class="['g-api-key-row-dot', item.lastTestStatus || 'untested']" />
              <div>
                <strong>{{ getTestLabel(item) }}</strong>
                <small>{{ item.lastTestMessage || formatDateTime(item.updatedAt) }}</small>
              </div>
            </div>
            <div class="g-api-key-row-actions">
              <button type="button" class="g-icon-btn is-sm" title="测试连接" @click="handleTest(item)" :disabled="workingId === item.id">
                <PlugZap :size="14" />
              </button>
              <button type="button" class="g-icon-btn is-sm" title="替换密钥" @click="openEditForm(item)">
                <Pencil :size="14" />
              </button>
              <button
                type="button"
                class="g-icon-btn is-sm"
                :title="item.status === 'active' ? '停用' : '启用'"
                @click="toggleStatus(item)"
                :disabled="workingId === item.id || item.readonly"
              >
                <Power :size="14" />
              </button>
              <button
                type="button"
                class="g-icon-btn is-sm is-danger"
                title="删除密钥"
                @click="handleDelete(item)"
                :disabled="workingId === item.id || item.readonly"
              >
                <Trash2 :size="14" />
              </button>
            </div>
          </article>
        </div>
      </article>

      <!-- Form panel -->
      <aside ref="formPanelRef" class="g-card g-api-key-form" :class="{ highlighted: formHighlighted }">
        <div class="g-card-head">
          <div>
            <div class="g-eyebrow">表单</div>
            <strong>{{ editingId ? '替换密钥' : '新增密钥' }}</strong>
          </div>
        </div>
        <p class="g-api-key-hint">提交后仅保存密文和脱敏值。</p>

        <form class="g-api-key-form-body" @submit.prevent="handleSubmit">
          <div class="g-field">
            <label>服务商</label>
            <select v-model="form.provider" class="g-select" @change="syncPurposeWithProvider">
              <option v-for="provider in providerOptions" :key="provider.value" :value="provider.value">
                {{ provider.label }}
              </option>
            </select>
          </div>

          <div class="g-field">
            <label>用途</label>
            <select v-model="form.purpose" class="g-select">
              <option v-for="purpose in filteredPurposeOptions" :key="purpose.value" :value="purpose.value">
                {{ purpose.label }}
              </option>
            </select>
          </div>

          <div class="g-field">
            <label>显示名称</label>
            <input v-model.trim="form.label" class="g-input" type="text" maxlength="80" placeholder="例如 SiliconFlow Chat" />
          </div>

          <div class="g-field">
            <label>API Key</label>
            <input ref="apiKeyInputRef" v-model.trim="form.value" class="g-input is-mono" type="password" autocomplete="new-password" placeholder="粘贴新的 API Key" />
          </div>

          <div v-if="supportsChatTestConfig(form.provider)" class="g-field">
            <label>测试模型</label>
            <input v-model.trim="form.model" class="g-input" type="text" :placeholder="getDefaultModelForProvider(form.provider)" />
          </div>

          <div v-if="supportsChatTestConfig(form.provider)" class="g-field">
            <label>API URL</label>
            <input v-model.trim="form.apiUrl" class="g-input" type="url" :placeholder="getDefaultApiUrlForProvider(form.provider)" />
          </div>

          <div class="g-field">
            <label>状态</label>
            <select v-model="form.status" class="g-select">
              <option value="active">启用</option>
              <option value="disabled">停用</option>
            </select>
          </div>

          <div class="g-api-key-form-actions">
            <button type="button" class="g-btn g-btn-ghost" @click="resetForm">重置</button>
            <button type="submit" class="g-btn g-btn-primary" :disabled="isSubmitting">
              <Save :size="15" />
              <span>{{ isSubmitting ? '保存中' : '保存密钥' }}</span>
            </button>
          </div>
        </form>
      </aside>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue';
import {
  CheckCircle2,
  KeyRound,
  Pencil,
  PlugZap,
  Plus,
  Power,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  XCircle
} from 'lucide-vue-next';
import {
  listApiKeys,
  testApiKey,
  updateApiKeyStatus,
  upsertApiKey,
  deleteApiKey
} from '../../../utils/api/api-key-vault-api.js';
import { resolveVaultActiveKey } from '../../../utils/api/api-key-runtime-api.js';
import { useConfirmDialog } from '../../../composables/useConfirmDialog.js';
import DashboardHero from './shared/DashboardHero.vue';
import DashboardNotice from './shared/DashboardNotice.vue';

const { confirm } = useConfirmDialog();

const providerOptions = [
  { value: 'siliconflow', label: 'SiliconFlow' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'zhipu', label: '智谱 AI' },
  { value: 'tavily', label: 'Tavily' },
  { value: 'cloudinary', label: 'Cloudinary' },
  { value: 'turnstile', label: 'Turnstile' },
  { value: 'custom', label: '自定义' }
];

const purposeOptions = [
  { provider: 'siliconflow', value: 'chat', label: '聊天模型' },
  { provider: 'siliconflow', value: 'embedding', label: '向量嵌入' },
  { provider: 'siliconflow', value: 'rerank', label: '重排序' },
  { provider: 'siliconflow', value: 'moderation', label: '内容审核' },
  { provider: 'openrouter', value: 'chat', label: '聊天模型' },
  { provider: 'zhipu', value: 'chat', label: '聊天模型' },
  { provider: 'tavily', value: 'web_search', label: '联网搜索' },
  { provider: 'cloudinary', value: 'admin_api', label: '管理 API' },
  { provider: 'turnstile', value: 'secret', label: '服务端校验密钥' },
  { provider: 'custom', value: 'default', label: '默认用途' }
];

const DEFAULT_PROVIDER_CONFIG = {
  siliconflow: {
    label: 'SiliconFlow Chat',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    apiUrl: 'https://api.siliconflow.cn/v1/chat/completions'
  },
  openrouter: {
    label: 'OpenRouter Chat',
    model: 'openai/gpt-4o-mini',
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions'
  },
  zhipu: {
    label: '智谱 GLM Chat',
    model: 'glm-4.7-flash',
    apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
  }
};

const supportsChatTestConfig = (provider) => provider === 'siliconflow' || provider === 'openrouter' || provider === 'zhipu';
const getDefaultModelForProvider = (provider) => DEFAULT_PROVIDER_CONFIG[provider]?.model || '';
const getDefaultApiUrlForProvider = (provider) => DEFAULT_PROVIDER_CONFIG[provider]?.apiUrl || '';
const getDefaultLabelForProvider = (provider, purpose = 'chat') => (
  DEFAULT_PROVIDER_CONFIG[provider]?.label || `${provider} ${purpose}`
);

const apiKeys = ref([]);
const isLoading = ref(false);
const isSubmitting = ref(false);
const workingId = ref('');
const editingId = ref('');
const successMessage = ref('');
const errorMessage = ref('');

const activeKeyInfo = ref(null);
const activeKeyError = ref('');
const isLoadingActiveKey = ref(false);

const form = reactive({
  provider: 'siliconflow',
  purpose: 'chat',
  label: 'SiliconFlow Chat',
  value: '',
  status: 'active',
  model: 'Qwen/Qwen2.5-7B-Instruct',
  apiUrl: 'https://api.siliconflow.cn/v1/chat/completions'
});

const formPanelRef = ref(null);
const apiKeyInputRef = ref(null);
const formHighlighted = ref(false);
let formHighlightTimer = null;

const filteredPurposeOptions = computed(() =>
  purposeOptions.filter((p) => p.provider === form.provider)
);

const summaryCards = computed(() => {
  const total = apiKeys.value.length;
  const active = apiKeys.value.filter((item) => item.status === 'active').length;
  const disabled = total - active;
  const lastTest = apiKeys.value
    .filter((item) => item.lastTestStatus)
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0];
  const lastTestValue = lastTest
    ? (lastTest.lastTestStatus === 'success' ? '通过' : lastTest.lastTestStatus === 'failed' ? '失败' : '未测试')
    : '未测试';
  return [
    { label: '密钥总数', value: total, icon: KeyRound },
    { label: '启用中', value: active, icon: CheckCircle2 },
    { label: '已停用', value: disabled, icon: XCircle },
    { label: '最近一次测试', value: lastTestValue, icon: Sparkles }
  ];
});

const focusForm = () => {
  if (formHighlightTimer) clearTimeout(formHighlightTimer);
  formHighlighted.value = true;
  formHighlightTimer = setTimeout(() => { formHighlighted.value = false; formHighlightTimer = null; }, 1600);
  nextTick(() => {
    apiKeyInputRef.value?.focus({ preventScroll: true });
    formPanelRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
};

const setMessage = (message, type = 'success') => {
  successMessage.value = type === 'success' ? message : '';
  errorMessage.value = type === 'error' ? message : '';
};

const isActiveKey = (item) => {
  const info = activeKeyInfo.value;
  if (!info) return false;
  if (info.id && item.id === info.id) return true;
  if (info.source === 'server_secret_fallback' && item.readonly
      && item.provider === info.provider && item.purpose === info.purpose) {
    return true;
  }
  return false;
};

const loadActiveKey = async () => {
  isLoadingActiveKey.value = true;
  activeKeyError.value = '';
  const result = await resolveVaultActiveKey({ provider: 'siliconflow', purpose: 'chat' });
  isLoadingActiveKey.value = false;
  if (!result.ok) {
    activeKeyError.value = result.error?.message || '查询当前 Key 失败';
    activeKeyInfo.value = null;
    return;
  }
  activeKeyInfo.value = result.data?.keyInfo || null;
};

const formatDateTime = (value) => {
  if (!value) return '暂无时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无时间';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(date);
};

const getTestLabel = (item) => {
  if (item.lastTestStatus === 'success') return '测试通过';
  if (item.lastTestStatus === 'failed') return '测试失败';
  return '未测试';
};

const syncPurposeWithProvider = () => {
  const firstOption = filteredPurposeOptions.value[0];
  form.purpose = firstOption?.value || 'default';
  form.label = getDefaultLabelForProvider(form.provider, form.purpose);
  form.model = getDefaultModelForProvider(form.provider);
  form.apiUrl = getDefaultApiUrlForProvider(form.provider);
};

const loadKeys = async () => {
  isLoading.value = true;
  setMessage('');
  const result = await listApiKeys();
  isLoading.value = false;
  if (!result.ok) {
    setMessage(result.error?.message || '读取 API Key 失败', 'error');
    return;
  }
  apiKeys.value = Array.isArray(result.data) ? result.data : [];
};

const resetForm = () => {
  editingId.value = '';
  Object.assign(form, {
    provider: 'siliconflow',
    purpose: 'chat',
    label: 'SiliconFlow Chat',
    value: '',
    status: 'active',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    apiUrl: 'https://api.siliconflow.cn/v1/chat/completions'
  });
};

const openCreateForm = () => {
  resetForm();
  setMessage('');
  focusForm();
};

const openEditForm = (item) => {
  editingId.value = item.id;
  Object.assign(form, {
    provider: item.provider,
    purpose: item.purpose,
    label: item.label,
    value: '',
    status: item.status,
    model: item.metadata?.model || getDefaultModelForProvider(item.provider),
    apiUrl: item.metadata?.apiUrl || getDefaultApiUrlForProvider(item.provider)
  });
  setMessage('已载入配置，请粘贴新 Key 后保存。');
  focusForm();
};

const handleSubmit = async () => {
  if (!form.value.trim()) {
    setMessage('请粘贴新的 API Key。', 'error');
    return;
  }
  isSubmitting.value = true;
  const metadata = supportsChatTestConfig(form.provider)
    ? { model: form.model, apiUrl: form.apiUrl }
    : {};
  const result = await upsertApiKey({
    provider: form.provider,
    purpose: form.purpose,
    label: form.label,
    value: form.value,
    status: form.status,
    metadata
  });
  isSubmitting.value = false;
  if (!result.ok) {
    setMessage(result.error?.message || '保存失败', 'error');
    return;
  }
  setMessage('API Key 已加密保存。');
  resetForm();
  await loadKeys();
};

const handleTest = async (item) => {
  workingId.value = item.id;
  setMessage('');
  const result = await testApiKey(item.id, {
    provider: item.provider,
    purpose: item.purpose
  });
  workingId.value = '';
  if (!result.ok) {
    setMessage(result.error?.message || '测试失败', 'error');
    return;
  }
  setMessage(result.data?.lastTestMessage || '测试完成。', result.data?.lastTestStatus === 'failed' ? 'error' : 'success');
  await loadKeys();
};

const toggleStatus = async (item) => {
  if (item.readonly) {
    setMessage('Secrets 兜底项不能在页面停用，请在 Supabase Secrets 中调整，或新增同用途密钥覆盖它。', 'error');
    return;
  }
  const nextStatus = item.status === 'active' ? 'disabled' : 'active';
  const confirmed = await confirm({
    title: nextStatus === 'active' ? '启用此密钥？' : '停用此密钥？',
    message: `${item.label || item.purpose} 将${nextStatus === 'active' ? '恢复使用' : '暂停使用'}。`,
    confirmText: nextStatus === 'active' ? '启用' : '停用',
    tone: nextStatus === 'active' ? 'primary' : 'warning'
  });
  if (!confirmed) return;
  workingId.value = item.id;
  const result = await updateApiKeyStatus(item.id, nextStatus);
  workingId.value = '';
  if (!result.ok) {
    setMessage(result.error?.message || '状态更新失败', 'error');
    return;
  }
  setMessage(`已${nextStatus === 'active' ? '启用' : '停用'} ${item.label || item.purpose}。`);
  await loadKeys();
};

const handleDelete = async (item) => {
  if (item.readonly) {
    setMessage('Secrets 兜底项不可删除，请调整 Supabase 环境变量。', 'error');
    return;
  }
  const confirmed = await confirm({
    title: '删除此密钥？',
    message: `${item.label || item.purpose} 将被永久删除，此操作不可撤销。`,
    confirmText: '删除',
    tone: 'danger'
  });
  if (!confirmed) return;
  workingId.value = item.id;
  const result = await deleteApiKey(item.id);
  workingId.value = '';
  if (!result.ok) {
    setMessage(result.error?.message || '删除失败', 'error');
    return;
  }
  setMessage(`已删除 ${item.label || item.purpose}。`);
  await loadKeys();
};

onMounted(() => {
  loadKeys();
  loadActiveKey();
});

onUnmounted(() => {
  if (formHighlightTimer) {
    clearTimeout(formHighlightTimer);
    formHighlightTimer = null;
  }
});
</script>

<style scoped>
@import '../styles/base.css';
@import '../styles/google-components.css';
@import '../styles/responsive.css';

.g-api-key-console {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 5);
}

/* Active key banner */
.g-api-key-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--spacing) * 4);
  border: 1px solid var(--border);
}
.g-api-key-banner.is-active {
  border-color: color-mix(in srgb, var(--chart-5) 30%, var(--border));
  background: color-mix(in srgb, var(--chart-5) 6%, var(--card));
}
.g-api-key-banner-main {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 4);
  min-width: 0;
}
.g-api-key-banner-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius);
  display: grid;
  place-items: center;
  background: var(--muted);
  color: var(--primary);
  flex: 0 0 44px;
}
.g-api-key-banner strong { font-size: 1rem; }
.g-api-key-banner-meta {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  margin-top: calc(var(--spacing) * 2);
  flex-wrap: wrap;
}
.g-api-key-banner-code {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  padding: 2px 6px;
  background: var(--muted);
  border-radius: 4px;
  color: var(--foreground);
}
.g-api-key-banner-error { color: var(--destructive); font-size: 0.85rem; margin-top: calc(var(--spacing) * 1); display: block; }

/* Summary */
.g-api-key-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: calc(var(--spacing) * 3);
}
.g-api-key-summary .g-mini-card {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  column-gap: calc(var(--spacing) * 3);
  align-items: center;
}
.g-api-key-summary .g-mini-card .g-api-key-summary-icon {
  grid-row: span 2;
  color: var(--primary);
}
.g-api-key-summary .g-mini-card .g-eyebrow {
  align-self: end;
  margin: 0;
}
.g-api-key-summary .g-mini-card .g-mini-value {
  font-size: 1.3rem;
  align-self: start;
  margin: 0;
}

/* Layout */
.g-api-key-layout {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: calc(var(--spacing) * 4);
  align-items: start;
}

.g-api-key-hint {
  font-size: 0.8rem;
  color: var(--muted-foreground);
  margin: 0;
}
.g-api-key-shield { color: var(--primary); }

/* Key rows */
.g-api-key-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: calc(var(--spacing) * 4);
  align-items: center;
  padding: calc(var(--spacing) * 4);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--background);
  transition: background 0.2s ease, border-color 0.2s ease;
}
.g-api-key-row + .g-api-key-row { margin-top: calc(var(--spacing) * 2); }
.g-api-key-row:hover { background: var(--muted); }
.g-api-key-row.is-active { border-color: var(--primary); }
.g-api-key-row.is-readonly { opacity: 0.92; }
.g-api-key-row-main { display: flex; align-items: center; gap: calc(var(--spacing) * 3); min-width: 0; }
.g-api-key-row-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius);
  display: grid;
  place-items: center;
  background: var(--muted);
  color: var(--primary);
  flex: 0 0 36px;
}
.g-api-key-row-text { min-width: 0; }
.g-api-key-row-title {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  flex-wrap: wrap;
}
.g-api-key-row-meta {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  margin-top: calc(var(--spacing) * 1.5);
  font-size: 0.78rem;
  color: var(--muted-foreground);
  flex-wrap: wrap;
}
.g-api-key-row-meta code {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  background: var(--muted);
  padding: 1px 6px;
  border-radius: 4px;
  color: var(--foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 240px;
  white-space: nowrap;
}
.g-api-key-row-test {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  font-size: 0.78rem;
  color: var(--muted-foreground);
  min-width: 140px;
}
.g-api-key-row-test strong { color: var(--foreground); font-size: 0.85rem; display: block; }
.g-api-key-row-test small { font-size: 0.7rem; }
.g-api-key-row-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--muted-foreground);
  flex: 0 0 8px;
}
.g-api-key-row-dot.success { background: var(--chart-5); }
.g-api-key-row-dot.failed { background: var(--chart-2); }
.g-api-key-row-dot.untested { background: var(--muted-foreground); }
.g-api-key-row-actions {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 1);
}

/* Form */
.g-api-key-form.highlighted {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 14%, transparent);
}
.g-api-key-form-body {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 3);
  margin-top: calc(var(--spacing) * 2);
}
.g-api-key-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: calc(var(--spacing) * 2);
  padding-top: calc(var(--spacing) * 3);
  border-top: 1px solid var(--border);
  margin-top: calc(var(--spacing) * 2);
}

@media (max-width: 1100px) {
  .g-api-key-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .g-api-key-layout { grid-template-columns: 1fr; }
  .g-api-key-row { grid-template-columns: 1fr auto; }
  .g-api-key-row-test { grid-column: span 2; min-width: 0; }
  .g-api-key-row-actions { grid-column: span 2; justify-content: flex-end; }
}
</style>
