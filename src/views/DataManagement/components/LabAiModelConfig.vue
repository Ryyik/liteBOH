<template>
  <section class="g-lab-ai-config">
    <DashboardHero
      eyebrow="Lab AI Models"
      title="实验室模型配置"
      description="管理实验室文档、PPT、代码生成和论坛周报使用的 AI 模型，统一从 BOH AI 现有模型模式中选择，运行时由服务端按模式配置自动路由。"
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

    <!-- BOH AI 模型库为空时的提示 -->
    <DashboardNotice v-if="!isLoadingModels && bohaiModels.length === 0" tone="warn">
      BOH AI 模型库为空，请先在「BOH AI 模型」中添加并启用模型模式。
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
            <label>模型（从 BOH AI 现有模型选择）</label>
            <select v-model="config.model_id" class="g-select is-mono" :disabled="isLoadingModels" required>
              <option value="" disabled>{{ isLoadingModels ? '加载中...' : '请选择模型模式' }}</option>
              <option v-for="m in bohaiModels" :key="m.mode_id" :value="m.mode_id">
                {{ m.display_name }} ({{ m.provider_label || m.provider }}){{ m.min_tier && m.min_tier !== 'free' ? ` · 需${m.min_tier}` : '' }} — {{ m.mode_id }}
              </option>
            </select>
          </div>

          <div class="g-field">
            <label>API Key 用途（仅论坛周报等服务端直连使用）</label>
            <select v-model="config.api_key_purpose" class="g-select" :disabled="isLoadingApiKeys" required>
              <option value="" disabled>{{ isLoadingApiKeys ? '加载中...' : '请选择 API Key' }}</option>
              <option v-for="k in getFilteredApiKeys(config.model_id)" :key="k.purpose" :value="k.purpose">
                {{ k.label || k.purpose }} ({{ k.provider }})
              </option>
            </select>
            <span v-if="config.model_id && getFilteredApiKeys(config.model_id).length === 0" class="g-field-hint" style="color: var(--chart-6);">
              该模型平台暂无可用的 API Key；Lab 运行时由服务端自动匹配平台密钥，此项仅影响论坛周报。
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
            <button v-if="config.feature_key === 'forum-weekly-report'" type="button" class="g-btn g-btn-secondary g-btn-sm" @click="handleGenerateReport(config)" :disabled="generatingId === config.id">
              <Newspaper :size="14" />
              <span>{{ generatingId === config.id ? '生成中...' : '立即生成' }}</span>
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
import { RefreshCw, Save, LoaderCircle, FileText, Presentation, Code2, FileEdit, Newspaper } from 'lucide-vue-next';
import { supabase } from '@/utils/supabase-client.js';
import { generateForumWeeklyReport } from '@/utils/api/forum-api.js';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';
import { listApiKeys } from '@/utils/api/api-key-vault-api.js';
import DashboardHero from './shared/DashboardHero.vue';
import DashboardNotice from './shared/DashboardNotice.vue';

const { confirm } = useConfirmDialog();

const configs = ref([]);
const bohaiModels = ref([]);
const apiKeys = ref([]);
const isLoading = ref(false);
const isLoadingModels = ref(false);
const isLoadingApiKeys = ref(false);
const savingId = ref('');
const generatingId = ref('');
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
  'word-generator': FileEdit,
  'forum-weekly-report': Newspaper
};

const getFeatureIcon = (key) => FEATURE_ICONS[key] || FileText;

async function loadBohaiModels() {
  isLoadingModels.value = true;
  try {
    const { data, error: fetchError } = await supabase
      .from('bohai_model_configs')
      .select('mode_id, display_name, provider, provider_label, min_tier')
      .eq('status', 'active')
      .order('sort_order', { ascending: true });
    if (fetchError) throw fetchError;
    bohaiModels.value = data || [];
  } catch (e) {
    errorMessage.value = `加载 BOH AI 模型列表失败: ${e.message}`;
  } finally {
    isLoadingModels.value = false;
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

function getFilteredApiKeys(modeId) {
  const model = bohaiModels.value.find(m => m.mode_id === modeId);
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
  await Promise.all([loadBohaiModels(), loadApiKeys(), loadConfigs()]);
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

async function handleGenerateReport(config) {
  generatingId.value = config.id;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const result = await generateForumWeeklyReport();
    if (result.error) throw result.error;
    successMessage.value = '论坛周报已生成并发布';
    scheduleSuccessClear();
  } catch (e) {
    errorMessage.value = `生成周报失败: ${e.message}`;
  } finally {
    generatingId.value = '';
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
