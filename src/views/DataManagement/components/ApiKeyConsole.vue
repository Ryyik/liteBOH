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
              <button
                v-if="supportsDiscovery(item.provider)"
                type="button"
                class="g-icon-btn is-sm"
                title="发现模型（调用 /v1/models）"
                @click="handleDiscover(item)"
                :disabled="workingId === item.id"
              >
                <Search :size="14" />
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

          <div v-if="supportsApiUrlConfig(form.provider)" class="g-field">
            <label>API URL</label>
            <input v-model.trim="form.apiUrl" class="g-input" type="url" :placeholder="getDefaultApiUrlForProvider(form.provider) || '例如 https://your-relay.com/v1/chat/completions'" />
            <span v-if="form.provider === 'custom'" class="g-field-hint">中转站的 chat completions 端点，模型发现时会自动推导出 /models 端点</span>
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

    <!-- 模型发现 Modal -->
    <Teleport to="body">
      <div v-if="discovery.open" class="g-discovery-overlay" @click.self="closeDiscovery">
        <div class="g-discovery-modal">
          <header class="g-discovery-head">
            <div>
              <div class="g-eyebrow">模型自动发现</div>
              <strong>
                {{ discovery.provider }}
                <span v-if="discovery.apiBaseUrl" class="g-discovery-head-url">{{ discovery.apiBaseUrl }}</span>
              </strong>
            </div>
            <button type="button" class="g-icon-btn is-sm" title="关闭" @click="closeDiscovery" :disabled="discovery.importing">
              <X :size="16" />
            </button>
          </header>

          <div class="g-discovery-toolbar">
            <div class="g-field g-discovery-filter">
              <input
                v-model="discovery.filter"
                class="g-input"
                type="text"
                placeholder="按 id / 名称 / owned_by 过滤"
                :disabled="discovery.loading || discovery.models.length === 0"
              />
            </div>
            <div class="g-discovery-toolbar-meta">
              <span v-if="!discovery.loading" class="g-badge is-muted">
                共 {{ discovery.models.length }} 个 / 选中 {{ discovery.selectedIds.size }}
              </span>
            </div>
            <button
              v-if="!discovery.loading && discovery.models.length > 0"
              type="button"
              class="g-btn g-btn-ghost g-btn-sm"
              @click="toggleSelectAll"
              :disabled="discovery.importing"
            >
              {{ allFilteredSelected ? '取消全选' : '全选当前' }}
            </button>
          </div>

          <!-- Models URL 可编辑区（兜底：自动推导失败时用户可手动指定） -->
          <div class="g-discovery-url-bar">
            <div class="g-field g-discovery-url-input">
              <label>Models URL</label>
              <input
                v-model="discovery.editableModelsUrl"
                class="g-input is-mono"
                type="url"
                placeholder="例如 https://your-relay.com/v1/models"
                :disabled="discovery.loading || discovery.importing"
              />
            </div>
            <button
              type="button"
              class="g-btn g-btn-secondary g-btn-sm"
              @click="handleRediscover"
              :disabled="discovery.loading || discovery.importing || !discovery.editableModelsUrl.trim()"
            >
              <RefreshCw :size="14" :class="{ 'g-spin': discovery.loading }" />
              <span>{{ discovery.loading ? '发现中' : '重新发现' }}</span>
            </button>
          </div>

          <!-- 加载中 -->
          <div v-if="discovery.loading" class="g-discovery-loading">
            <LoaderCircle :size="24" class="g-spin" />
            <span>正在调用 /v1/models 获取模型列表...</span>
          </div>

          <!-- 错误 -->
          <div v-else-if="discovery.error" class="g-discovery-error">
            <DashboardNotice tone="error" dismissible @dismiss="discovery.error = ''">
              {{ discovery.error }}
            </DashboardNotice>
            <details v-if="discovery.modelsUrl || discovery.upstreamBodyPreview" class="g-discovery-diagnostics">
              <summary>诊断信息</summary>
              <dl>
                <div v-if="discovery.modelsUrl">
                  <dt>请求的 models URL</dt>
                  <dd><code class="is-mono">{{ discovery.modelsUrl }}</code></dd>
                </div>
                <div v-if="discovery.upstreamStatus">
                  <dt>上游 HTTP 状态码</dt>
                  <dd><code class="is-mono">{{ discovery.upstreamStatus }}</code></dd>
                </div>
                <div v-if="discovery.upstreamBodyPreview">
                  <dt>上游响应预览（前 400 字符）</dt>
                  <dd><pre class="g-discovery-pre">{{ discovery.upstreamBodyPreview }}</pre></dd>
                </div>
              </dl>
              <p class="g-discovery-hint">
                常见原因：① 中转站不支持 <code>/v1/models</code> 接口（多数中转站只代理 chat/completions）；② api_url 配置的路径不规则，自动推导的 models URL 错误；③ API Key 无权限访问模型列表。
              </p>
            </details>
          </div>

          <!-- 导入结果 -->
          <DashboardNotice v-else-if="discovery.importResult" tone="success" dismissible @dismiss="discovery.importResult = null">
            已添加 {{ discovery.importResult.added }} 个模型到免费模型库
            <span v-if="discovery.importResult.skipped > 0">（跳过 {{ discovery.importResult.skipped }} 个已存在）</span>
          </DashboardNotice>

          <!-- 空列表 -->
          <div v-else-if="discovery.models.length === 0" class="g-empty">
            未返回任何模型，可能是该中转站不支持 /v1/models 接口。
          </div>

          <!-- 模型列表 -->
          <div v-else class="g-discovery-list">
            <label
              v-for="m in filteredDiscoveredModels"
              :key="m.id"
              class="g-discovery-item"
              :class="{ 'is-selected': discovery.selectedIds.has(m.id) }"
            >
              <input
                type="checkbox"
                :checked="discovery.selectedIds.has(m.id)"
                :disabled="discovery.importing"
                @change="toggleSelect(m.id)"
              />
              <div class="g-discovery-item-main">
                <code class="is-mono">{{ m.id }}</code>
                <span v-if="m.owned_by" class="g-discovery-item-owner">· {{ m.owned_by }}</span>
              </div>
              <small v-if="m.name && m.name !== m.id" class="g-discovery-item-name">{{ m.name }}</small>
            </label>
          </div>

          <footer class="g-discovery-foot">
            <button
              type="button"
              class="g-btn g-btn-ghost"
              @click="closeDiscovery"
              :disabled="discovery.importing"
            >
              关闭
            </button>
            <button
              type="button"
              class="g-btn g-btn-primary"
              :disabled="discovery.loading || discovery.importing || discovery.selectedIds.size === 0"
              @click="handleImportToFreemodels"
            >
              <ListPlus :size="15" />
              <span>{{ discovery.importing ? '导入中...' : `添加 ${discovery.selectedIds.size} 个到免费模型库` }}</span>
            </button>
          </footer>
        </div>
      </div>
    </Teleport>
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
  Search,
  X,
  LoaderCircle,
  ListPlus,
  Trash2,
  XCircle
} from 'lucide-vue-next';
import {
  listApiKeys,
  testApiKey,
  updateApiKeyStatus,
  upsertApiKey,
  deleteApiKey,
  discoverModels
} from '../../../utils/api/api-key-vault-api.js';
import { supabase } from '../../../utils/supabase-client.js';
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
  { provider: 'custom', value: 'chat', label: '聊天模型' },
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
// custom provider 也需要 apiUrl（用于模型发现时推导 /v1/models 端点）
const supportsApiUrlConfig = (provider) => supportsChatTestConfig(provider) || provider === 'custom';
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
  // 三类 provider 都需要 apiUrl：chat 测试用 + custom 用于模型发现推导
  const metadata = supportsApiUrlConfig(form.provider)
    ? { ...(supportsChatTestConfig(form.provider) ? { model: form.model } : {}), apiUrl: form.apiUrl }
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

// ============================================================
// 模型自动发现：调用中转站 GET /v1/models 拉取可用模型列表
// ============================================================
const supportsDiscovery = (provider) => provider === 'siliconflow' || provider === 'openrouter' || provider === 'zhipu' || provider === 'custom';

const discovery = reactive({
  open: false,
  loading: false,
  importing: false,
  keyId: '',
  provider: '',
  purpose: '',
  apiBaseUrl: '',
  modelsUrl: '',
  // 用户可手动修改的 models URL（默认同 modelsUrl，用户修改后用于重新发现）
  editableModelsUrl: '',
  upstreamStatus: null,
  upstreamBodyPreview: '',
  models: [],
  selectedIds: new Set(),
  filter: '',
  error: '',
  importResult: null
});

const filteredDiscoveredModels = computed(() => {
  const kw = discovery.filter.trim().toLowerCase();
  if (!kw) return discovery.models;
  return discovery.models.filter((m) =>
    String(m.id || '').toLowerCase().includes(kw)
    || String(m.name || '').toLowerCase().includes(kw)
    || String(m.owned_by || '').toLowerCase().includes(kw)
  );
});

const allFilteredSelected = computed(() => {
  const list = filteredDiscoveredModels.value;
  return list.length > 0 && list.every((m) => discovery.selectedIds.has(m.id));
});

const toggleSelect = (id) => {
  if (discovery.selectedIds.has(id)) {
    discovery.selectedIds.delete(id);
  } else {
    discovery.selectedIds.add(id);
  }
};

const toggleSelectAll = () => {
  const list = filteredDiscoveredModels.value;
  if (allFilteredSelected.value) {
    list.forEach((m) => discovery.selectedIds.delete(m.id));
  } else {
    list.forEach((m) => discovery.selectedIds.add(m.id));
  }
};

const closeDiscovery = () => {
  if (discovery.importing) return;
  discovery.open = false;
  discovery.models = [];
  discovery.selectedIds.clear();
  discovery.filter = '';
  discovery.error = '';
  discovery.importResult = null;
  discovery.keyId = '';
  discovery.provider = '';
  discovery.purpose = '';
  discovery.apiBaseUrl = '';
  discovery.modelsUrl = '';
  discovery.editableModelsUrl = '';
  discovery.upstreamStatus = null;
  discovery.upstreamBodyPreview = '';
};

// 执行发现请求的核心函数（首次 + 重新发现共用）
const runDiscovery = async (modelsUrlOverride) => {
  discovery.loading = true;
  discovery.error = '';
  discovery.importResult = null;
  discovery.models = [];
  discovery.selectedIds.clear();
  discovery.upstreamStatus = null;
  discovery.upstreamBodyPreview = '';

  const payload = {
    id: discovery.keyId,
    provider: discovery.provider,
    purpose: discovery.purpose
  };
  if (modelsUrlOverride) {
    payload.modelsUrl = modelsUrlOverride;
  }
  const result = await discoverModels(payload);
  discovery.loading = false;
  workingId.value = '';
  if (!result.ok) {
    discovery.error = result.error?.message || '模型发现失败（边缘函数调用失败）';
    return;
  }
  const data = result.data || {};
  discovery.apiBaseUrl = data.apiBaseUrl || discovery.apiBaseUrl;
  discovery.modelsUrl = data.modelsUrl || '';
  // editableModelsUrl 始终同步为本次实际使用的 modelsUrl（首次进入时填上，便于用户修改）
  if (!discovery.editableModelsUrl) {
    discovery.editableModelsUrl = data.modelsUrl || '';
  }
  discovery.upstreamStatus = data.upstreamStatus || null;
  discovery.upstreamBodyPreview = data.upstreamBodyPreview || '';
  if (!data.ok) {
    discovery.error = data.message || '中转站返回失败';
    return;
  }
  discovery.models = Array.isArray(data.models) ? data.models : [];
  discovery.models.forEach((m) => discovery.selectedIds.add(m.id));
};

const handleDiscover = async (item) => {
  if (!supportsDiscovery(item.provider)) {
    setMessage(`Provider "${item.provider}" 暂不支持模型发现。`, 'error');
    return;
  }
  workingId.value = item.id;
  discovery.open = true;
  discovery.importing = false;
  discovery.filter = '';
  discovery.editableModelsUrl = '';
  discovery.keyId = item.id;
  discovery.provider = item.provider;
  discovery.purpose = item.purpose;
  discovery.apiBaseUrl = item.metadata?.apiUrl || '';
  await runDiscovery();
};

// 用户在弹窗里手动修改了 models URL 后重新发现
const handleRediscover = async () => {
  if (!discovery.editableModelsUrl.trim()) {
    discovery.error = '请填写 Models URL。';
    return;
  }
  if (workingId.value) return;
  workingId.value = discovery.keyId;
  await runDiscovery(discovery.editableModelsUrl.trim());
};

// 一键添加到免费模型库（freemodels 表）
// 直接走前端 supabase（管理员 RLS 允许插入），onConflict model_id 跳过已存在的
const handleImportToFreemodels = async () => {
  if (discovery.selectedIds.size === 0) {
    discovery.error = '请至少选择一个模型。';
    return;
  }
  discovery.importing = true;
  discovery.error = '';
  discovery.importResult = null;

  try {
    const selectedIds = Array.from(discovery.selectedIds);
    const selectedModels = discovery.models.filter((m) => selectedIds.includes(m.id));

    // 先查已存在的 model_id（用于跳过）
    const { data: existingRows, error: queryError } = await supabase
      .from('freemodels')
      .select('model_id')
      .in('model_id', selectedIds);
    if (queryError) throw queryError;
    const existingSet = new Set((existingRows || []).map((r) => r.model_id));

    // 取当前最大 sort_order
    const { data: maxRow, error: maxError } = await supabase
      .from('freemodels')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxError) throw maxError;
    let maxSort = Number(maxRow?.sort_order || 0);

    const providerLabelMap = {
      siliconflow: 'SiliconFlow',
      openrouter: 'OpenRouter',
      zhipu: '智谱 AI',
      custom: '自定义'
    };
    const providerLabel = providerLabelMap[discovery.provider] || discovery.provider;
    const apiBaseUrl = discovery.apiBaseUrl || null;

    const toInsert = [];
    const skipped = [];
    for (const m of selectedModels) {
      if (existingSet.has(m.id)) {
        skipped.push(m.id);
        continue;
      }
      maxSort += 1;
      // 名称优先用返回的 name，否则用 id 最后一段
      const fallbackName = String(m.id || '').split('/').pop() || m.id;
      toInsert.push({
        model_id: m.id,
        name: m.name || fallbackName,
        provider: discovery.provider,
        provider_label: providerLabel,
        api_base_url: apiBaseUrl,
        family_label: '通用',
        best_for: '多场景聊天',
        sort_order: maxSort,
        is_active: true
      });
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('freemodels')
        .insert(toInsert);
      if (insertError) throw insertError;
    }

    discovery.importResult = {
      added: toInsert.length,
      skipped: skipped.length
    };

    // 把已成功导入的从选中集合清掉
    toInsert.forEach((m) => discovery.selectedIds.delete(m.model_id));
  } catch (e) {
    discovery.error = e.message || '导入失败';
  } finally {
    discovery.importing = false;
  }
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

/* ============================================================
   模型发现 Modal
   ============================================================ */
.g-discovery-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(var(--spacing) * 4);
  background: rgba(20, 20, 24, 0.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.g-discovery-modal {
  display: flex;
  flex-direction: column;
  width: min(720px, 100%);
  max-height: min(80vh, 720px);
  background: var(--background, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: calc(var(--radius, 12px) + 4px);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}
.g-discovery-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: calc(var(--spacing) * 3);
  padding: calc(var(--spacing) * 4) calc(var(--spacing) * 5);
  border-bottom: 1px solid var(--border, #e5e7eb);
}
.g-discovery-head strong {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  font-size: 1rem;
}
.g-discovery-head-url {
  font-family: var(--font-mono, monospace);
  font-size: 0.78rem;
  font-weight: 400;
  color: var(--muted-foreground, #6b7280);
  background: var(--muted, #f3f4f6);
  padding: 2px 8px;
  border-radius: 6px;
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.g-discovery-toolbar {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 3);
  padding: calc(var(--spacing) * 3) calc(var(--spacing) * 5);
  border-bottom: 1px solid var(--border, #e5e7eb);
}
.g-discovery-filter { flex: 1; min-width: 0; margin: 0; }
.g-discovery-toolbar-meta { flex-shrink: 0; }
.g-discovery-url-bar {
  display: flex;
  align-items: flex-end;
  gap: calc(var(--spacing) * 3);
  padding: calc(var(--spacing) * 3) calc(var(--spacing) * 5);
  border-bottom: 1px solid var(--border, #e5e7eb);
  background: var(--muted, #f9fafb);
}
.g-discovery-url-input { flex: 1; min-width: 0; margin: 0; }
.g-discovery-url-input label {
  display: block;
  font-size: 0.72rem;
  color: var(--muted-foreground, #6b7280);
  margin-bottom: 4px;
}
.g-discovery-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: calc(var(--spacing) * 3);
  padding: calc(var(--spacing) * 10) calc(var(--spacing) * 5);
  color: var(--muted-foreground, #6b7280);
}
.g-discovery-list {
  flex: 1;
  overflow-y: auto;
  padding: calc(var(--spacing) * 2) calc(var(--spacing) * 5);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.g-discovery-item {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 3);
  padding: calc(var(--spacing) * 2) calc(var(--spacing) * 3);
  border-radius: var(--radius, 8px);
  cursor: pointer;
  transition: background 0.15s ease;
}
.g-discovery-item:hover { background: var(--muted, #f3f4f6); }
.g-discovery-item.is-selected { background: color-mix(in srgb, var(--primary, #3b82f6) 8%, transparent); }
.g-discovery-item input[type="checkbox"] {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  cursor: pointer;
}
.g-discovery-item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  overflow: hidden;
}
.g-discovery-item-main code {
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.g-discovery-item-owner {
  font-size: 0.75rem;
  color: var(--muted-foreground, #6b7280);
  flex-shrink: 0;
}
.g-discovery-item-name {
  font-size: 0.75rem;
  color: var(--muted-foreground, #6b7280);
  flex-shrink: 0;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.g-discovery-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: calc(var(--spacing) * 3);
  padding: calc(var(--spacing) * 3) calc(var(--spacing) * 5);
  border-top: 1px solid var(--border, #e5e7eb);
}
.g-discovery-error {
  padding: calc(var(--spacing) * 3) calc(var(--spacing) * 5);
  overflow-y: auto;
}
.g-discovery-diagnostics {
  margin-top: calc(var(--spacing) * 3);
  padding: calc(var(--spacing) * 3);
  background: var(--muted, #f9fafb);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: var(--radius, 8px);
  font-size: 0.82rem;
}
.g-discovery-diagnostics > summary {
  cursor: pointer;
  font-weight: 500;
  color: var(--foreground, #111827);
  user-select: none;
}
.g-discovery-diagnostics dl {
  margin: calc(var(--spacing) * 3) 0 0 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
}
.g-discovery-diagnostics dt {
  font-size: 0.72rem;
  color: var(--muted-foreground, #6b7280);
  margin-bottom: 2px;
}
.g-discovery-diagnostics dd {
  margin: 0;
  word-break: break-all;
}
.g-discovery-diagnostics dd code {
  font-size: 0.78rem;
  padding: 2px 6px;
  background: var(--background, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 4px;
}
.g-discovery-pre {
  margin: 0;
  padding: calc(var(--spacing) * 2);
  max-height: 200px;
  overflow: auto;
  background: var(--background, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
  font-family: var(--font-mono, monospace);
  font-size: 0.75rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--foreground, #111827);
}
.g-discovery-hint {
  margin: calc(var(--spacing) * 3) 0 0 0;
  font-size: 0.75rem;
  color: var(--muted-foreground, #6b7280);
  line-height: 1.6;
}
.g-discovery-hint code {
  font-size: 0.72rem;
  padding: 1px 4px;
  background: var(--background, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 3px;
}
@media (max-width: 640px) {
  .g-discovery-overlay { padding: calc(var(--spacing) * 2); }
  .g-discovery-head,
  .g-discovery-toolbar,
  .g-discovery-foot { padding-left: calc(var(--spacing) * 3); padding-right: calc(var(--spacing) * 3); }
  .g-discovery-list { padding-left: calc(var(--spacing) * 3); padding-right: calc(var(--spacing) * 3); }
}
</style>
