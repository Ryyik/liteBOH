<template>
  <section class="g-moderation-config">
    <DashboardHero
      eyebrow="Moderation Config"
      title="审核模型配置"
      description="配置内容审核使用的 AI 模型，修改后对后续审核即时生效，不影响正在进行的审核。"
    >
      <template #actions>
        <button type="button" class="g-btn g-btn-ghost" @click="loadConfig">
          <RefreshCw :size="16" />
          <span>重置表单</span>
        </button>
        <button type="button" class="g-btn g-btn-primary" @click="handleSave" :disabled="isSaving">
          <Save :size="16" />
          <span>{{ isSaving ? '保存中...' : '保存配置' }}</span>
        </button>
      </template>
    </DashboardHero>

    <DashboardNotice v-if="errorMessage" tone="error" dismissible @dismiss="errorMessage = ''">
      {{ errorMessage }}
    </DashboardNotice>
    <DashboardNotice v-if="successMessage" tone="success" dismissible @dismiss="successMessage = ''">
      {{ successMessage }}
    </DashboardNotice>

    <div class="g-moderation-layout">
      <!-- Form -->
      <article class="g-card">
        <div class="g-card-head">
          <div>
            <div class="g-eyebrow">表单</div>
            <strong>审核模型设置</strong>
          </div>
          <ShieldCheck :size="20" class="g-moderation-shield" />
        </div>
        <p class="g-moderation-hint">留空的字段会使用环境变量或默认值兜底。</p>

        <form class="g-moderation-form" @submit.prevent="handleSave">
          <div class="g-field">
            <label>模型 ID <em class="g-moderation-hint-inline">(从免费模型库选择)</em></label>
            <select v-model="form.modelId" class="g-select is-mono" :disabled="isLoadingFreemodels">
              <option value="" disabled>{{ isLoadingFreemodels ? '加载免费模型中...' : '请选择模型' }}</option>
              <option v-for="m in freemodels" :key="m.model_id" :value="m.model_id">
                {{ m.name }} ({{ m.provider_label || m.provider }}) — {{ m.model_id }}
              </option>
            </select>
            <span class="g-field-hint">当前生效：<code>{{ activeModelId }}</code></span>
          </div>

          <div class="g-field">
            <label>API 地址</label>
            <input
              v-model.trim="form.apiUrl"
              class="g-input is-mono"
              type="url"
              placeholder="https://api.siliconflow.cn/v1/chat/completions"
            />
            <span class="g-field-hint">留空则使用对应平台的默认地址</span>
          </div>

          <div class="g-field">
            <label>供应商标识</label>
            <select v-model="form.provider" class="g-select">
              <option value="">自动检测（留空）</option>
              <option value="siliconflow">SiliconFlow</option>
              <option value="zhipu">智谱 AI</option>
              <option value="openrouter">OpenRouter</option>
              <option value="custom">自定义</option>
            </select>
            <span class="g-field-hint">用于标识模型来源平台</span>
          </div>

          <div class="g-field">
            <label class="g-eyebrow">状态</label>
            <button type="button" class="g-toggle" @click="form.enabled = !form.enabled">
              <span class="g-toggle-text">
                <span>启用自定义审核模型</span>
                <small v-if="!form.enabled">关闭后使用环境变量 VITE_MODERATION_MODEL_ID 或默认值。</small>
                <small v-else>开启后使用上方配置的模型进行内容审核。</small>
              </span>
              <span :class="['g-switch', { 'is-on': form.enabled }]"><span /></span>
            </button>
          </div>
        </form>
      </article>

      <!-- Info panel -->
      <aside class="g-card">
        <div class="g-card-head">
          <div>
            <div class="g-eyebrow">状态</div>
            <strong>当前状态</strong>
          </div>
          <Info :size="20" class="g-moderation-shield" />
        </div>

        <div class="g-moderation-info">
          <div class="g-list-item">
            <span class="g-list-text">
              <span class="g-eyebrow">生效模型</span>
              <code class="is-mono">{{ activeModelId }}</code>
            </span>
          </div>
          <div class="g-list-item">
            <span class="g-list-text">
              <span class="g-eyebrow">生效 API</span>
              <code class="is-mono">{{ activeApiUrl }}</code>
            </span>
          </div>
          <div class="g-list-item">
            <span class="g-list-text">
              <span class="g-eyebrow">配置来源</span>
              <span>
                <span v-if="hasRuntimeConfig" class="g-badge is-success"><span class="g-badge-dot" />运行时</span>
                <span v-else class="g-badge is-muted"><span class="g-badge-dot" />环境变量</span>
              </span>
            </span>
          </div>
          <div class="g-list-item">
            <span class="g-list-text">
              <span class="g-eyebrow">默认模型</span>
              <code class="is-mono">Qwen/Qwen2.5-7B-Instruct</code>
            </span>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { Info, RefreshCw, Save, ShieldCheck } from 'lucide-vue-next';
import {
  getRuntimeModerationConfig,
  setRuntimeModerationConfig,
  getActiveModerationModelId,
  getActiveModerationApiUrl
} from '@/utils/content-moderation.js';
import { supabase } from '@/utils/supabase-client.js';
import DashboardHero from './shared/DashboardHero.vue';
import DashboardNotice from './shared/DashboardNotice.vue';

const isSaving = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const freemodels = ref([]);
const isLoadingFreemodels = ref(false);

// 响应式触发器：localStorage 非响应式，通过递增该 ref 让 computed 重新求值
const configVersion = ref(0);

// 保存成功提示定时器句柄，卸载时需清理避免内存泄漏
let successTimer = null;

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

const form = reactive({
  modelId: '',
  apiUrl: '',
  provider: '',
  enabled: true
});

const activeModelId = computed(() => { configVersion.value; return getActiveModerationModelId(); });
const activeApiUrl = computed(() => { configVersion.value; return getActiveModerationApiUrl(); });

const hasRuntimeConfig = computed(() => {
  configVersion.value;
  const cfg = getRuntimeModerationConfig();
  return cfg && cfg.enabled !== false && cfg.modelId;
});

const loadConfig = () => {
  const cfg = getRuntimeModerationConfig();
  if (cfg) {
    form.modelId = cfg.modelId || '';
    form.apiUrl = cfg.apiUrl || '';
    form.provider = cfg.provider || '';
    form.enabled = cfg.enabled !== false;
  } else {
    form.modelId = '';
    form.apiUrl = '';
    form.provider = '';
    form.enabled = true;
  }
  errorMessage.value = '';
  successMessage.value = '';
};

const handleSave = async () => {
  isSaving.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const ok = setRuntimeModerationConfig({
      modelId: form.modelId || '',
      apiUrl: form.apiUrl || '',
      provider: form.provider || '',
      enabled: form.enabled
    });
    if (ok) {
      successMessage.value = form.modelId
        ? `审核模型已切换为 ${form.modelId}`
        : '已清除自定义配置，使用默认模型';
      configVersion.value++;
    } else {
      errorMessage.value = '保存失败';
    }
  } catch (err) {
    errorMessage.value = `保存失败: ${err.message}`;
  } finally {
    isSaving.value = false;
    if (successTimer) clearTimeout(successTimer);
    successTimer = setTimeout(() => { successMessage.value = ''; }, 3000);
  }
};

onMounted(() => {
  loadConfig();
  loadFreemodels();
});

onBeforeUnmount(() => {
  if (successTimer) clearTimeout(successTimer);
});
</script>

<style scoped>
@import '../styles/base.css';
@import '../styles/google-components.css';
@import '../styles/responsive.css';

.g-moderation-config {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 5);
}

.g-moderation-layout {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: calc(var(--spacing) * 4);
  align-items: start;
}

.g-moderation-shield { color: var(--primary); }
.g-moderation-hint { font-size: 0.8rem; color: var(--muted-foreground); margin: 0 0 calc(var(--spacing) * 2); }
.g-moderation-hint-inline { font-style: normal; font-weight: 400; color: var(--muted-foreground); font-size: 0.78rem; }

.g-moderation-form {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);
  margin-top: calc(var(--spacing) * 2);
}

.g-moderation-info {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.g-moderation-info .g-list-item { padding: calc(var(--spacing) * 3) 0; }
.g-moderation-info .g-list-item code {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  background: var(--muted);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--foreground);
  word-break: break-all;
}

@media (max-width: 900px) {
  .g-moderation-layout { grid-template-columns: 1fr; }
}
</style>
