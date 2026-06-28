<template>
  <section class="api-key-console">
    <main class="api-key-shell">
      <header class="page-header">
        <div>
          <span class="eyebrow">Security Console</span>
          <h1>API Key 管理</h1>
          <p>集中管理第三方服务密钥，完整 Key 只在服务端加密存储，前端仅显示脱敏信息。</p>
        </div>
        <div class="header-actions">
          <button type="button" class="ghost-btn" @click="loadKeys" :disabled="isLoading">
            <RefreshCw :size="17" :class="{ spinning: isLoading }" />
            <span>刷新</span>
          </button>
          <button type="button" class="primary-btn" @click="openCreateForm">
            <Plus :size="17" />
            <span>新增密钥</span>
          </button>
        </div>
      </header>

      <section class="active-key-banner" :class="{ 'has-data': activeKeyInfo }">
        <div class="banner-left">
          <span class="banner-icon">
            <KeyRound :size="18" />
          </span>
          <div>
            <strong>BOH 模型当前在用</strong>
            <span v-if="activeKeyInfo">
              {{ activeKeyInfo.label || `${activeKeyInfo.provider} ${activeKeyInfo.purpose}` }}
              <code v-if="activeKeyInfo.maskedValue">{{ activeKeyInfo.maskedValue }}</code>
              <span v-if="activeKeyInfo.source === 'server_secret_fallback' || activeKeyInfo.readonly" class="source-pill">Secrets 兜底</span>
            </span>
            <span v-else-if="activeKeyError" class="banner-error">{{ activeKeyError }}</span>
            <span v-else class="banner-placeholder">正在查询...</span>
          </div>
        </div>
        <div class="banner-actions">
          <button type="button" class="ghost-btn" @click="loadActiveKey" :disabled="isLoadingActiveKey">
            <RefreshCw :size="16" :class="{ spinning: isLoadingActiveKey }" />
            <span>重新查询</span>
          </button>
        </div>
      </section>

      <section class="summary-grid">
        <div v-for="item in summaryCards" :key="item.label" class="summary-card">
          <component :is="item.icon" :size="19" />
          <div>
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </div>
        </div>
      </section>

      <section class="vault-layout">
        <div class="vault-table-panel">
          <div class="panel-heading">
            <div>
              <h2>密钥列表</h2>
              <p>替换密钥时不会回显旧值，只能覆盖写入。</p>
            </div>
            <ShieldCheck :size="20" />
          </div>

          <div v-if="errorMessage" class="notice error">{{ errorMessage }}</div>
          <div v-if="successMessage" class="notice success">{{ successMessage }}</div>

          <div v-if="isLoading && apiKeys.length === 0" class="empty-state">正在读取密钥配置...</div>
          <div v-else-if="apiKeys.length === 0" class="empty-state">还没有保存任何 API Key。</div>
          <div v-else class="key-list">
            <article v-for="item in apiKeys" :key="item.id" class="key-row">
              <div class="key-main">
                <div class="provider-icon">
                  <KeyRound :size="18" />
                </div>
                <div>
                  <div class="key-title">
                    <strong>{{ item.label || `${item.provider} ${item.purpose}` }}</strong>
                    <span class="status-pill" :class="item.status">{{ item.status === 'active' ? '启用' : '停用' }}</span>
                    <span v-if="item.readonly" class="source-pill">Secrets</span>
                    <span v-if="isActiveKey(item)" class="active-pill" :class="['source-' + (activeKeyInfo?.source || 'vault')]">当前活跃</span>
                  </div>
                  <div class="key-meta">
                    <span>{{ item.provider }}</span>
                    <span>{{ item.purpose }}</span>
                    <code>{{ item.maskedValue || '未生成脱敏值' }}</code>
                  </div>
                </div>
              </div>
              <div class="test-info">
                <span :class="['test-dot', item.lastTestStatus || 'untested']"></span>
                <div>
                  <strong>{{ getTestLabel(item) }}</strong>
                  <small>{{ item.lastTestMessage || formatDateTime(item.updatedAt) }}</small>
                </div>
              </div>
              <div class="row-actions">
                <button type="button" class="icon-btn" title="测试连接" @click="handleTest(item)" :disabled="workingId === item.id">
                  <PlugZap :size="17" />
                </button>
                <button type="button" class="icon-btn" title="替换密钥" @click="openEditForm(item)">
                  <Pencil :size="17" />
                </button>
                <button
                  type="button"
                  class="icon-btn"
                  :title="item.status === 'active' ? '停用' : '启用'"
                  @click="toggleStatus(item)"
                  :disabled="workingId === item.id || item.readonly"
                >
                  <Power :size="17" />
                </button>
              </div>
            </article>
          </div>
        </div>

        <aside ref="formPanelRef" class="form-panel" :class="{ highlighted: formHighlighted }">
          <div class="panel-heading compact">
            <div>
              <h2>{{ editingId ? '替换密钥' : '新增密钥' }}</h2>
              <p>提交后仅保存密文和脱敏值。</p>
            </div>
          </div>

          <form class="key-form" @submit.prevent="handleSubmit">
            <label>
              <span>服务商</span>
              <select v-model="form.provider" @change="syncPurposeWithProvider">
                <option v-for="provider in providerOptions" :key="provider.value" :value="provider.value">
                  {{ provider.label }}
                </option>
              </select>
            </label>

            <label>
              <span>用途</span>
              <select v-model="form.purpose">
                <option v-for="purpose in filteredPurposeOptions" :key="purpose.value" :value="purpose.value">
                  {{ purpose.label }}
                </option>
              </select>
            </label>

            <label>
              <span>显示名称</span>
              <input v-model.trim="form.label" type="text" maxlength="80" placeholder="例如 SiliconFlow Chat" />
            </label>

            <label>
              <span>API Key</span>
              <input ref="apiKeyInputRef" v-model.trim="form.value" type="password" autocomplete="new-password" placeholder="粘贴新的 API Key" />
            </label>

            <label v-if="supportsChatTestConfig(form.provider)">
              <span>测试模型</span>
              <input v-model.trim="form.model" type="text" :placeholder="getDefaultModelForProvider(form.provider)" />
            </label>

            <label v-if="supportsChatTestConfig(form.provider)">
              <span>API URL</span>
              <input v-model.trim="form.apiUrl" type="url" :placeholder="getDefaultApiUrlForProvider(form.provider)" />
            </label>

            <label>
              <span>状态</span>
              <select v-model="form.status">
                <option value="active">启用</option>
                <option value="disabled">停用</option>
              </select>
            </label>

            <div class="form-actions">
              <button type="button" class="ghost-btn" @click="resetForm">重置</button>
              <button type="submit" class="primary-btn" :disabled="isSubmitting">
                <Save :size="17" />
                <span>{{ isSubmitting ? '保存中' : '保存密钥' }}</span>
              </button>
            </div>
          </form>
        </aside>
      </section>
    </main>
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
  XCircle
} from 'lucide-vue-next';
import {
  listApiKeys,
  testApiKey,
  updateApiKeyStatus,
  upsertApiKey
} from '@/utils/api/api-key-vault-api.js';
import { resolveVaultActiveKey } from '@/utils/api/api-key-runtime-api.js';

const providerOptions = [
  { value: 'siliconflow', label: 'SiliconFlow' },
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
  { provider: 'zhipu', value: 'chat', label: '聊天模型' },
  { provider: 'tavily', value: 'web_search', label: '联网搜索' },
  { provider: 'cloudinary', value: 'admin_api', label: '管理 API' },
  { provider: 'turnstile', value: 'secret', label: '服务端校验密钥' },
  { provider: 'custom', value: 'default', label: '默认用途' }
];

const apiKeys = ref([]);
const isLoading = ref(false);
const isSubmitting = ref(false);
const workingId = ref('');
const editingId = ref('');
const errorMessage = ref('');
const successMessage = ref('');
const activeKeyInfo = ref(null);
const isLoadingActiveKey = ref(false);
const activeKeyError = ref('');
const formPanelRef = ref(null);
const apiKeyInputRef = ref(null);
const formHighlighted = ref(false);
let formHighlightTimer = null;

const form = reactive({
  provider: 'siliconflow',
  purpose: 'chat',
  label: 'SiliconFlow Chat',
  value: '',
  status: 'active',
  model: 'Qwen/Qwen2.5-7B-Instruct',
  apiUrl: 'https://api.siliconflow.cn/v1/chat/completions'
});

const DEFAULT_PROVIDER_CONFIG = {
  siliconflow: {
    label: 'SiliconFlow Chat',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    apiUrl: 'https://api.siliconflow.cn/v1/chat/completions'
  },
  zhipu: {
    label: '智谱 GLM Chat',
    model: 'glm-4.7-flash',
    apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
  }
};

const supportsChatTestConfig = (provider) => provider === 'siliconflow' || provider === 'zhipu';
const getDefaultModelForProvider = (provider) => DEFAULT_PROVIDER_CONFIG[provider]?.model || '';
const getDefaultApiUrlForProvider = (provider) => DEFAULT_PROVIDER_CONFIG[provider]?.apiUrl || '';
const getDefaultLabelForProvider = (provider, purpose = 'chat') => (
  DEFAULT_PROVIDER_CONFIG[provider]?.label || `${provider} ${purpose}`
);

const focusForm = async () => {
  await nextTick();
  formPanelRef.value?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  formHighlighted.value = true;
  if (formHighlightTimer) clearTimeout(formHighlightTimer);
  formHighlightTimer = setTimeout(() => {
    formHighlighted.value = false;
    formHighlightTimer = null;
  }, 1400);
  apiKeyInputRef.value?.focus?.();
};

const filteredPurposeOptions = computed(() => {
  const options = purposeOptions.filter((item) => item.provider === form.provider);
  return options.length ? options : purposeOptions.filter((item) => item.provider === 'custom');
});

const activeCount = computed(() => apiKeys.value.filter((item) => item.status === 'active').length);
const failedCount = computed(() => apiKeys.value.filter((item) => item.lastTestStatus === 'failed').length);
const summaryCards = computed(() => [
  { label: '总密钥', value: apiKeys.value.length, icon: KeyRound },
  { label: '启用中', value: activeCount.value, icon: CheckCircle2 },
  { label: '测试失败', value: failedCount.value, icon: XCircle },
  { label: '本页暴露', value: '0 完整值', icon: ShieldCheck }
]);

const setMessage = (message, type = 'success') => {
  successMessage.value = type === 'success' ? message : '';
  errorMessage.value = type === 'error' ? message : '';
};

const isActiveKey = (item) => {
  const info = activeKeyInfo.value;
  if (!info) return false;
  // vault 命中：id 严格匹配
  if (info.id && item.id === info.id) return true;
  // Secrets 兜底：provider + purpose 匹配且同源
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
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
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
  workingId.value = item.id;
  const nextStatus = item.status === 'active' ? 'disabled' : 'active';
  const result = await updateApiKeyStatus(item.id, nextStatus);
  workingId.value = '';
  if (!result.ok) {
    setMessage(result.error?.message || '状态更新失败', 'error');
    return;
  }
  setMessage(`已${nextStatus === 'active' ? '启用' : '停用'} ${item.label || item.purpose}。`);
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
.api-key-console {
  width: 100%;
}

.api-key-shell {
  width: min(1480px, calc(100% - 32px));
  margin: 0 auto;
  padding: 24px 0 40px;
}

.page-header,
.vault-table-panel,
.form-panel,
.summary-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.06);
}

.form-panel {
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.form-panel.highlighted {
  border-color: #2563eb;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12), 0 16px 40px rgba(15, 23, 42, 0.08);
}

.page-header {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: center;
  flex-wrap: wrap;
  padding: 22px 24px;
  border-radius: 8px;
}

.page-header > div:first-child {
  min-width: 0;
  flex: 1 1 240px;
}

.page-header > .header-actions {
  flex: 0 1 auto;
}

.eyebrow {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: #2563eb;
  text-transform: uppercase;
  letter-spacing: 0;
  margin-bottom: 6px;
}

.page-header h1,
.panel-heading h2 {
  margin: 0;
  letter-spacing: 0;
}

.page-header h1 {
  font-size: 24px;
}

.page-header p,
.panel-heading p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 14px;
}

.header-actions,
.form-actions,
.row-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.active-key-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin: 18px 0 0;
  padding: 14px 18px;
  background: linear-gradient(120deg, #eff6ff, #f8fafc);
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
}

.active-key-banner .banner-left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  flex: 1 1 auto;
}

.active-key-banner .banner-icon {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #2563eb;
  color: #fff;
  border-radius: 10px;
}

.active-key-banner strong {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: #1d4ed8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
}

.active-key-banner .banner-left > div {
  min-width: 0;
}

.active-key-banner .banner-left > div > span {
  display: block;
  font-size: 14px;
  color: #0f172a;
  word-break: break-all;
}

.active-key-banner .banner-left > div > span code {
  margin-left: 6px;
  padding: 1px 6px;
  background: rgba(37, 99, 235, 0.10);
  color: #1d4ed8;
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}

.active-key-banner .banner-error {
  color: #b91c1c !important;
}

.active-key-banner .banner-placeholder {
  color: #64748b !important;
}

.active-key-banner .banner-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.active-pill {
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  background: #2563eb;
  color: #fff;
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.active-pill::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 0 0 0 rgba(37, 99, 255, 0.6);
  animation: active-pulse 1.6s ease-out infinite;
}

.active-pill.source-server_secret_fallback {
  background: #d97706;
}

@keyframes active-pulse {
  0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.7); }
  70% { box-shadow: 0 0 0 6px rgba(255, 255, 255, 0); }
  100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
}

@media (max-width: 560px) {
  .active-key-banner {
    flex-direction: column;
    align-items: flex-start;
  }
  .active-key-banner .banner-actions {
    align-self: flex-end;
  }
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin: 18px 0;
}

.summary-card {
  border-radius: 8px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.summary-card > div {
  min-width: 0;
  flex: 1 1 auto;
}

.summary-card svg {
  flex: 0 0 auto;
  color: #2563eb;
}

.summary-card span,
.test-info small {
  display: block;
  color: #64748b;
  font-size: 12px;
}

.summary-card strong {
  display: block;
  margin-top: 2px;
  font-size: 20px;
}

.vault-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 18px;
  align-items: start;
}

.vault-table-panel,
.form-panel {
  border-radius: 8px;
  padding: 20px;
}

.panel-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}

.panel-heading.compact {
  margin-bottom: 12px;
}

.notice {
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
  font-size: 13px;
}

.notice.error {
  color: #991b1b;
  background: #fee2e2;
}

.notice.success {
  color: #166534;
  background: #dcfce7;
}

.empty-state {
  padding: 32px;
  text-align: center;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  color: #64748b;
}

.key-list {
  display: grid;
  gap: 10px;
}

.key-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(180px, 220px) auto;
  gap: 14px;
  align-items: center;
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fbfdff;
}

.key-main,
.test-info {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.key-main > div:last-child,
.test-info > div:last-child {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
}

.provider-icon,
.icon-btn {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.provider-icon {
  flex: 0 0 auto;
  background: #dbeafe;
  color: #1d4ed8;
}

.key-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.key-title strong {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1 1 auto;
}

.key-title .status-pill,
.key-title .source-pill {
  flex: 0 0 auto;
}

.key-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 5px;
  color: #64748b;
  font-size: 12px;
  min-width: 0;
}

.key-meta > span,
.key-meta > code {
  min-width: 0;
  max-width: 100%;
}

.key-meta code {
  color: #334155;
  background: #e2e8f0;
  border-radius: 6px;
  padding: 1px 6px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.status-pill {
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 700;
}

.status-pill.active {
  color: #166534;
  background: #dcfce7;
}

.status-pill.disabled {
  color: #475569;
  background: #e2e8f0;
}

.source-pill {
  border-radius: 999px;
  padding: 2px 8px;
  color: #1d4ed8;
  background: #dbeafe;
  font-size: 12px;
  font-weight: 700;
}

.test-dot {
  width: 10px;
  height: 10px;
  flex: 0 0 auto;
  align-self: flex-start;
  margin-top: 5px;
  border-radius: 999px;
  background: #94a3b8;
}

.test-dot.success {
  background: #22c55e;
}

.test-dot.failed {
  background: #ef4444;
}

.test-info strong {
  display: block;
  font-size: 13px;
}

.icon-btn {
  border: 1px solid #dbe3ef;
  background: #fff;
  color: #334155;
  cursor: pointer;
}

.icon-btn:hover,
.ghost-btn:hover {
  border-color: #93c5fd;
  color: #1d4ed8;
}

.ghost-btn,
.primary-btn {
  min-height: 40px;
  border-radius: 8px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
}

.ghost-btn {
  color: #334155;
  border-color: #dbe3ef;
  background: #fff;
}

.primary-btn {
  color: #fff;
  background: #2563eb;
}

.primary-btn:disabled,
.ghost-btn:disabled,
.icon-btn:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.key-form {
  display: grid;
  gap: 12px;
}

.key-form label {
  display: grid;
  gap: 6px;
  color: #334155;
  font-size: 13px;
  font-weight: 700;
}

.key-form input,
.key-form select {
  min-height: 40px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0 12px;
  font: inherit;
  color: #0f172a;
  background: #fff;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 980px) {
  .page-header,
  .vault-layout {
    grid-template-columns: 1fr;
  }

  .page-header {
    display: grid;
  }

  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .key-row {
    grid-template-columns: 1fr;
  }

  .key-row .test-info,
  .key-row .row-actions {
    justify-content: flex-start;
  }

  .test-info strong,
  .test-info small,
  .key-meta code {
    white-space: normal;
  }
}

@media (max-width: 560px) {
  .api-key-shell {
    width: min(100% - 20px, 1480px);
  }

  .summary-grid {
    grid-template-columns: 1fr;
  }

  .header-actions,
  .form-actions,
  .row-actions {
    flex-wrap: wrap;
  }
}
</style>
