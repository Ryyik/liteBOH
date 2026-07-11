<template>
  <section class="g-lab-ai-config">
    <DashboardHero
      eyebrow="Lab AI Models"
      title="实验室模型配置"
      description="管理实验室文档排版和 PPT 生成功能使用的 AI 模型，模型从免费模型库中选择。"
    >
      <template #actions>
        <button type="button" class="g-btn g-btn-ghost" @click="loadAll" :disabled="isLoading">
          <RefreshCw :size="16" :class="{ 'g-spin': isLoading }" />
          <span>刷新</span>
        </button>
      </template>
    </DashboardHero>

    <DashboardNotice v-if="errorMessage" tone="error" dismissible @dismiss="errorMessage = ''">
      {{ errorMessage }}
    </DashboardNotice>
    <DashboardNotice v-if="successMessage" tone="success" dismissible @dismiss="successMessage = ''">
      {{ successMessage }}
    </DashboardNotice>

    <!-- 免费模型库为空时的提示 -->
    <DashboardNotice v-if="!isLoadingFreemodels && freemodels.length === 0" tone="warn">
      免费模型库为空，请先在「免费模型库」中添加模型。
    </DashboardNotice>

    <div v-if="isLoading && configs.length === 0" class="g-empty">
      <LoaderCircle :size="20" class="g-spin" />
      加载配置中...
    </div>

    <div v-else class="g-lab-ai-grid">
      <article
        v-for="config in configs"
        :key="config.id"
        :class="['g-card', 'g-lab-ai-card', { 'is-active': config.is_active }]"
      >
        <div class="g-card-head">
          <div class="g-lab-ai-card-header">
            <div class="g-lab-ai-card-icon">
              <component :is="getFeatureIcon(config.feature_key)" :size="18" />
            </div>
            <div>
              <div class="g-eyebrow">{{ config.feature_key }}</div>
              <strong>{{ config.feature_label }}</strong>
            </div>
          </div>
          <span :class="['g-badge', config.is_active ? 'is-success' : 'is-muted']">
            <span class="g-badge-dot" />
            {{ config.is_active ? '启用' : '停用' }}
          </span>
        </div>

        <p v-if="config.description" class="g-lab-ai-desc">{{ config.description }}</p>

        <form class="g-lab-ai-form" @submit.prevent="handleSave(config)">
          <div class="g-field">
            <label>模型（从免费模型库选择）</label>
            <select v-model="config.model_id" class="g-select is-mono" :disabled="isLoadingFreemodels" required>
              <option value="" disabled>{{ isLoadingFreemodels ? '加载中...' : '请选择模型' }}</option>
              <option v-for="m in freemodels" :key="m.model_id" :value="m.model_id">
                {{ m.name }} ({{ m.provider_label || m.provider }}) — {{ m.model_id }}
              </option>
            </select>
          </div>

          <div class="g-field">
            <label>API Key（从密钥库选择）</label>
            <select v-model="config.api_key_purpose" class="g-select" :disabled="isLoadingApiKeys" required>
              <option value="" disabled>{{ isLoadingApiKeys ? '加载中...' : '请选择 API Key' }}</option>
              <option v-for="k in getFilteredApiKeys(config.model_id)" :key="k.purpose" :value="k.purpose">
                {{ k.label || k.purpose }} ({{ k.provider }})
              </option>
            </select>
            <span v-if="config.model_id && getFilteredApiKeys(config.model_id).length === 0" class="g-field-hint" style="color: var(--chart-6);">
              该模型平台暂无可用的 API Key，请先在「API Key」中添加
            </span>
          </div>

          <div class="g-lab-ai-row">
            <div class="g-field">
              <label>Temperature</label>
              <input v-model.number="config.temperature" type="number" step="0.01" min="0" max="1.2" class="g-input" required />
            </div>
            <div class="g-field">
              <label>最大输出 Tokens</label>
              <input v-model.number="config.max_tokens" type="number" min="256" max="8192" step="256" class="g-input" required />
            </div>
          </div>

          <div class="g-lab-ai-card-foot">
            <button type="button" class="g-btn g-btn-secondary g-btn-sm" @click="handleToggleStatus(config)">
              {{ config.is_active ? '停用' : '启用' }}
            </button>
            <button type="submit" class="g-btn g-btn-primary g-btn-sm" :disabled="savingId === config.id">
              <Save :size="14" />
              <span>{{ savingId === config.id ? '保存中...' : '保存' }}</span>
            </button>
          </div>
        </form>
      </article>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { RefreshCw, Save, LoaderCircle, FileText, Presentation, Code2, FileEdit } from 'lucide-vue-next';
import { supabase } from '@/utils/supabase-client.js';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';
import { listApiKeys } from '@/utils/api/api-key-vault-api.js';
import DashboardHero from './shared/DashboardHero.vue';
import DashboardNotice from './shared/DashboardNotice.vue';

const { confirm } = useConfirmDialog();

const configs = ref([]);
const freemodels = ref([]);
const apiKeys = ref([]);
const isLoading = ref(false);
const isLoadingFreemodels = ref(false);
const isLoadingApiKeys = ref(false);
const savingId = ref('');
const errorMessage = ref('');
const successMessage = ref('');
let successTimer = null;

const clearSuccessTimer = () => {
  if (successTimer) {
    clearTimeout(successTimer);
    successTimer = null;
  }
};

const scheduleSuccessClear = () => {
  clearSuccessTimer();
  successTimer = setTimeout(() => { successMessage.value = ''; }, 3000);
};

const FEATURE_ICONS = {
  'doc-formatting': FileText,
  'ppt-generator': Presentation,
  'code-generator': Code2,
  'word-generator': FileEdit
};

const getFeatureIcon = (key) => FEATURE_ICONS[key] || FileText;

async function loadFreemodels() {
  isLoadingFreemodels.value = true;
  try {
    const { data, error: fetchError } = await supabase
      .from('freemodels')
      .select('model_id, name, family_label, provider, provider_label')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (fetchError) throw fetchError;
    freemodels.value = data || [];
  } catch (e) {
    errorMessage.value = `加载免费模型列表失败: ${e.message}`;
  } finally {
    isLoadingFreemodels.value = false;
  }
}

async function loadApiKeys() {
  isLoadingApiKeys.value = true;
  try {
    const result = await listApiKeys();
    const allKeys = result?.data?.keys || result?.keys || [];
    apiKeys.value = allKeys.filter(k => k.status === 'active');
  } catch (e) {
    apiKeys.value = [];
  } finally {
    isLoadingApiKeys.value = false;
  }
}

function getFilteredApiKeys(modelId) {
  const model = freemodels.value.find(m => m.model_id === modelId);
  const provider = model?.provider || 'siliconflow';
  return apiKeys.value.filter(k => k.provider === provider);
}

async function loadConfigs() {
  isLoading.value = true;
  errorMessage.value = '';
  try {
    const { data, error: fetchError } = await supabase
      .from('lab_ai_model_configs')
      .select('*')
      .order('sort_order', { ascending: true });
    if (fetchError) throw fetchError;
    configs.value = data || [];
  } catch (e) {
    errorMessage.value = `加载配置失败: ${e.message}`;
  } finally {
    isLoading.value = false;
  }
}

async function loadAll() {
  await Promise.all([loadFreemodels(), loadApiKeys(), loadConfigs()]);
}

async function handleSave(config) {
  savingId.value = config.id;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const { error: updateError } = await supabase
      .from('lab_ai_model_configs')
      .update({
        model_id: config.model_id,
        temperature: config.temperature,
        max_tokens: config.max_tokens,
        api_key_purpose: config.api_key_purpose || 'chat'
      })
      .eq('id', config.id);

    if (updateError) throw updateError;

    successMessage.value = `${config.feature_label} 配置已保存`;
    scheduleSuccessClear();
  } catch (e) {
    errorMessage.value = `保存失败: ${e.message}`;
  } finally {
    savingId.value = '';
  }
}

async function handleToggleStatus(config) {
  const newStatus = !config.is_active;
  const actionText = newStatus ? '启用' : '停用';

  const confirmed = await confirm({
    title: `${actionText}${config.feature_label}`,
    message: `确定要${actionText} ${config.feature_label} 吗？`,
    tone: 'warning'
  });

  if (!confirmed) return;

  try {
    const { error: updateError } = await supabase
      .from('lab_ai_model_configs')
      .update({ is_active: newStatus })
      .eq('id', config.id);

    if (updateError) throw updateError;

    config.is_active = newStatus;
    successMessage.value = `${config.feature_label} 已${actionText}`;
    scheduleSuccessClear();
  } catch (e) {
    errorMessage.value = `操作失败: ${e.message}`;
  }
}

onMounted(() => {
  loadAll();
});

onBeforeUnmount(() => {
  clearSuccessTimer();
});
</script>

<style scoped>
@import '../styles/base.css';
@import '../styles/google-components.css';
@import '../styles/responsive.css';

.g-lab-ai-config {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 5);
}

.g-lab-ai-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: calc(var(--spacing) * 4);
}

.g-lab-ai-card {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 3);
}
.g-lab-ai-card.is-active {
  border-color: color-mix(in srgb, var(--chart-5) 30%, var(--border));
}

.g-lab-ai-card-header {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 3);
}
.g-lab-ai-card-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius);
  background: var(--muted);
  color: var(--primary);
  display: grid;
  place-items: center;
  flex: 0 0 36px;
}

.g-lab-ai-desc {
  font-size: 0.82rem;
  color: var(--muted-foreground);
  margin: 0;
  line-height: 1.5;
}

.g-lab-ai-form {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 3);
}

.g-lab-ai-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: calc(var(--spacing) * 3);
}

.g-lab-ai-card-foot {
  display: flex;
  justify-content: flex-end;
  gap: calc(var(--spacing) * 2);
  padding-top: calc(var(--spacing) * 3);
  border-top: 1px solid var(--border);
}

@media (max-width: 600px) {
  .g-lab-ai-grid {
    grid-template-columns: 1fr;
  }
  .g-lab-ai-row {
    grid-template-columns: 1fr;
  }
}
</style>
