<template>
  <section class="g-moderation-config">
    <DashboardHero
      eyebrow="Moderation Config"
      title="审核模型配置"
      description="云端审核（第一层）与本地兜底的模型配置。文本与图片审核独立配置，保存后写入服务端并即时生效（自动清除 vault 缓存）。"
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
    <DashboardNotice v-if="warningMessage" tone="warning" dismissible @dismiss="warningMessage = ''">
      {{ warningMessage }}
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
        <p class="g-moderation-hint">
          云端审核始终是第一层；仅当云端不可达（网络错误 / 超时 / 限流 / 未启用）时才回退本地模型兜底。
          图片审核请选择具备视觉能力的模型（如 Gemini 系列）。
        </p>

        <form class="g-moderation-form" @submit.prevent="handleSave">
          <section
            v-for="blockDef in blockDefs"
            :key="blockDef.kind"
            class="g-moderation-block"
          >
            <header class="g-moderation-block-head">
              <strong>{{ blockDef.label }}</strong>
              <button
                type="button"
                class="g-toggle"
                @click="blocks[blockDef.kind].enabled = !blocks[blockDef.kind].enabled"
              >
                <span class="g-toggle-text">
                  <span>{{ blocks[blockDef.kind].enabled ? '已启用（云端第一层）' : '已停用（仅本地兜底）' }}</span>
                  <small v-if="!blocks[blockDef.kind].enabled">{{ blockDef.offHint }}</small>
                  <small v-else>{{ blockDef.onHint }}</small>
                </span>
                <span :class="['g-switch', { 'is-on': blocks[blockDef.kind].enabled }]"><span /></span>
              </button>
            </header>

            <div class="g-field">
              <label>模型 ID <em class="g-moderation-hint-inline">(从免费模型库选择)</em></label>
              <select
                v-model="blocks[blockDef.kind].modelId"
                class="g-select is-mono"
                :disabled="isLoadingFreemodels"
                @change="applyModelDefaults(blockDef.kind)"
              >
                <option value="" disabled>{{ isLoadingFreemodels ? '加载免费模型中...' : '请选择模型' }}</option>
                <option v-for="m in freemodels" :key="m.model_id" :value="m.model_id">
                  {{ m.name }} ({{ m.provider_label || m.provider }}) — {{ m.model_id }}
                </option>
              </select>
            </div>

            <div class="g-moderation-inline-fields">
              <div class="g-field">
                <label>供应商标识</label>
                <select v-model="blocks[blockDef.kind].provider" class="g-select">
                  <option value="custom">自定义（经反代）</option>
                  <option value="siliconflow">SiliconFlow</option>
                  <option value="zhipu">智谱 AI</option>
                </select>
                <span class="g-field-hint">custom 使用 API 密钥库里 custom/chat 的密钥（反代令牌）</span>
              </div>
              <div class="g-field">
                <label>API 地址</label>
                <input
                  v-model.trim="blocks[blockDef.kind].apiUrl"
                  class="g-input is-mono"
                  type="url"
                  placeholder="https://.../v1/chat/completions"
                />
                <span class="g-field-hint">选择模型后自动填入默认地址，可覆盖</span>
              </div>
            </div>

            <div class="g-moderation-test-row">
              <button
                type="button"
                class="g-btn g-btn-ghost"
                :disabled="blocks[blockDef.kind].testing || !blocks[blockDef.kind].modelId"
                @click="runConnectionTest(blockDef.kind)"
              >
                <Zap :size="14" />
                <span>{{ blocks[blockDef.kind].testing ? '测试中...' : '连通性测试' }}</span>
              </button>
              <span v-if="blocks[blockDef.kind].testResult" :class="['g-test-result', blocks[blockDef.kind].testResult.ok ? 'is-ok' : 'is-fail']">
                {{ blocks[blockDef.kind].testResult.text }}
              </span>
            </div>
          </section>
        </form>
      </article>

      <!-- Info panel -->
      <aside class="g-card">
        <div class="g-card-head">
          <div>
            <div class="g-eyebrow">状态</div>
            <strong>当前生效配置</strong>
          </div>
          <Info :size="20" class="g-moderation-shield" />
        </div>

        <div class="g-moderation-info">
          <div v-for="blockDef in blockDefs" :key="blockDef.kind" class="g-list-item">
            <span class="g-list-text">
              <span class="g-eyebrow">{{ blockDef.label }}</span>
              <code class="is-mono">{{ dbStatusText(blockDef.kind) }}</code>
              <span v-if="dbConfig[blockDef.kind]" class="g-field-hint">
                {{ dbConfig[blockDef.kind].api_url || '默认地址' }}
              </span>
            </span>
          </div>
          <div class="g-list-item">
            <span class="g-list-text">
              <span class="g-eyebrow">降级策略</span>
              <span>云端优先 → 不可达时本地兜底（仅拦高置信，低置信放行待抽查）</span>
            </span>
          </div>
          <div class="g-list-item">
            <span class="g-list-text">
              <span class="g-eyebrow">云端冷却状态</span>
              <span v-if="cooldownState.coolingDown" class="g-badge is-warn"><span class="g-badge-dot" />冷却中：{{ cooldownState.reason || '未知原因' }}</span>
              <span v-else class="g-badge is-success"><span class="g-badge-dot" />正常</span>
            </span>
          </div>
          <div class="g-list-item">
            <span class="g-list-text">
              <span class="g-eyebrow">说明</span>
              <span class="g-field-hint">
                配置保存至 bohai_model_configs 的 moderation-text / moderation-image 行（服务端裁决，前端不可篡改）。
                行为 disabled 时审核调用收到「未配置」，自动走本地兜底。
              </span>
            </span>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { Info, RefreshCw, Save, ShieldCheck, Zap } from 'lucide-vue-next';
import { supabase } from '@/utils/supabase-client.js';
import { callVaultSiliconChat, clearVaultModelCache } from '@/utils/api/api-key-runtime-api.js';
import { testCloudImageModeration, getCloudModerationCooldownState } from '@/utils/image-moderation-pipeline.js';
import { getRuntimeModerationConfig } from '@/utils/content-moderation.js';
import DashboardHero from './shared/DashboardHero.vue';
import DashboardNotice from './shared/DashboardNotice.vue';

const WORKER_CHAT_URL = 'https://boh-gemini-proxy.18768487974.workers.dev/v1/chat/completions';
const TEXT_MODE_ID = 'moderation-text';
const IMAGE_MODE_ID = 'moderation-image';
const LEGACY_STORAGE_MIGRATION_HINT = '检测到旧版本的本地审核配置，已预填到「文本审核」块，请确认后保存以完成迁移。';

const isSaving = ref(false);
const errorMessage = ref('');
const warningMessage = ref('');
const successMessage = ref('');
const freemodels = ref([]);
const isLoadingFreemodels = ref(false);
const dbConfig = reactive({ text: null, image: null });
const cooldownState = ref({ coolingDown: false, reason: '' });

// 保存成功提示定时器句柄，卸载时需清理避免内存泄漏
let successTimer = null;

const blockDefs = [
  {
    kind: 'text',
    label: '文本审核',
    modeId: TEXT_MODE_ID,
    onHint: '发帖/评论/资料等文字内容先经云端模型审核，云端不可达时降级为本地关键词检查。',
    offHint: '停用后文字审核调用收到「未配置」，直接降级本地关键词检查（硬违规仍拦截）。'
  },
  {
    kind: 'image',
    label: '图片审核',
    modeId: IMAGE_MODE_ID,
    onHint: '论坛图片/方块墙先经云端视觉模型审核，云端不可达时回退本地 nsfwjs 兜底（宽放行）。',
    offHint: '停用后图片审核直接走本地 nsfwjs 兜底（误杀率较高，不推荐长期停用）。'
  }
];

function createBlockState() {
  return reactive({
    enabled: false,
    modelId: '',
    provider: 'custom',
    apiUrl: '',
    testing: false,
    testResult: null
  });
}

const blocks = reactive({ text: createBlockState(), image: createBlockState() });

const VISION_MODEL_HINT = /gemini|glm-4(\.\d+)?v|qwen.*-vl|pixart|vision|doubao.*vision/i;

function buildModeRow(kind) {
  const block = blocks[kind];
  const def = blockDefs.find((item) => item.kind === kind);
  const modelRow = freemodels.value.find((m) => m.model_id === block.modelId) || null;
  const provider = block.provider || modelRow?.provider || 'custom';
  const isImage = kind === 'image';
  return {
    mode_id: def.modeId,
    display_name: isImage ? '审核·图片' : '审核·文本',
    tagline: '内容审核',
    description: isImage
      ? '论坛图片/方块墙的第一层云端审核（本地 nsfwjs 兜底）'
      : '发帖/评论/资料等文字内容的第一层云端审核（本地关键词兜底）',
    provider,
    provider_label: modelRow?.provider_label || (provider === 'custom' ? '自定义上游' : provider),
    model_id: block.modelId || '',
    api_url: block.apiUrl || modelRow?.api_base_url || '',
    capability: isImage ? 'multimodal' : 'chat',
    icon: 'shield-check',
    temperature: 0.1,
    top_p: 0.5,
    frequency_penalty: 0,
    max_tokens: 256,
    status: block.enabled ? 'active' : 'disabled',
    sort_order: isImage ? 901 : 900,
    notes: '审核专用模式：由数据管理面板「审核模型配置」维护，请勿在 BOHAI 模式列表中启用给用户。'
  };
}

async function loadFreemodels() {
  isLoadingFreemodels.value = true;
  try {
    const { data, error: fetchError } = await supabase
      .from('freemodels')
      .select('model_id, name, family_label, provider, provider_label, api_base_url')
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

function applyModelDefaults(kind) {
  const block = blocks[kind];
  const modelRow = freemodels.value.find((m) => m.model_id === block.modelId);
  if (!modelRow) return;
  if (modelRow.provider) block.provider = modelRow.provider;
  if (modelRow.api_base_url) block.apiUrl = modelRow.api_base_url;
}

async function loadDbConfig() {
  try {
    const { data, error } = await supabase
      .from('bohai_model_configs')
      .select('mode_id, provider, provider_label, model_id, api_url, capability, status, notes')
      .in('mode_id', [TEXT_MODE_ID, IMAGE_MODE_ID]);
    if (error) throw error;
    const rows = data || [];
    dbConfig.text = rows.find((row) => row.mode_id === TEXT_MODE_ID) || null;
    dbConfig.image = rows.find((row) => row.mode_id === IMAGE_MODE_ID) || null;
  } catch (e) {
    // 非管理员读不到 disabled 行、或网络失败 —— 表单回退到默认状态
    dbConfig.text = null;
    dbConfig.image = null;
    warningMessage.value = `读取服务端审核配置失败（${e.message}），下方表单可能不是当前生效值。`;
  }
}

function fillFormFromDb() {
  for (const def of blockDefs) {
    const row = dbConfig[def.kind];
    const block = blocks[def.kind];
    if (row) {
      block.enabled = row.status === 'active';
      block.modelId = row.model_id || '';
      block.provider = row.provider || 'custom';
      block.apiUrl = row.api_url || '';
    }
  }
}

function fillFormFromLegacyStorage() {
  if (dbConfig.text || dbConfig.image) return;
  const cfg = getRuntimeModerationConfig();
  if (!cfg || !cfg.modelId) return;
  blocks.text.modelId = cfg.modelId || '';
  blocks.text.provider = cfg.provider || 'custom';
  blocks.text.apiUrl = cfg.apiUrl || WORKER_CHAT_URL;
  blocks.text.enabled = cfg.enabled !== false;
  warningMessage.value = LEGACY_STORAGE_MIGRATION_HINT;
}

const loadConfig = async () => {
  errorMessage.value = '';
  successMessage.value = '';
  warningMessage.value = '';
  blocks.text = createBlockState();
  blocks.image = createBlockState();
  await loadDbConfig();
  fillFormFromDb();
  fillFormFromLegacyStorage();
  cooldownState.value = getCloudModerationCooldownState();
};

const dbStatusText = (kind) => {
  const row = dbConfig[kind];
  if (!row) return '未配置（走本地兜底）';
  const statusLabel = row.status === 'active' ? '启用中' : '已停用';
  return `${statusLabel} · ${row.model_id || '未选模型'}`;
};

const handleSave = async () => {
  isSaving.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  warningMessage.value = '';
  try {
    for (const def of blockDefs) {
      const block = blocks[def.kind];
      if (block.enabled && !block.modelId) {
        throw new Error(`${def.label}已启用但未选择模型，请先选择或停用该块`);
      }
    }

    const rows = blockDefs.map((def) => buildModeRow(def.kind));
    const { error: upsertError } = await supabase
      .from('bohai_model_configs')
      .upsert(rows, { onConflict: 'mode_id' });
    if (upsertError) throw upsertError;

    // 让 vault 的 5 分钟模式缓存立即失效，配置即时生效
    const cacheResult = await clearVaultModelCache().catch(() => ({ ok: false }));
    if (!cacheResult?.ok) {
      warningMessage.value = '配置已保存，但 vault 缓存清除失败：新配置最迟 5 分钟后生效。';
    }

    const enabledKinds = blockDefs.filter((def) => blocks[def.kind].enabled).map((def) => def.label);
    successMessage.value = enabledKinds.length
      ? `已保存：${enabledKinds.join('、')}云端审核已启用`
      : '已保存：两块审核均为停用状态（审核走本地兜底）';

    const imageModelId = blocks.image.modelId || '';
    if (blocks.image.enabled && imageModelId && !VISION_MODEL_HINT.test(imageModelId)) {
      warningMessage.value = `图片审核所选模型「${imageModelId}」可能不具备视觉能力，建议选择 Gemini 系列模型。`;
    }

    await loadDbConfig();
    cooldownState.value = getCloudModerationCooldownState();
  } catch (err) {
    errorMessage.value = `保存失败: ${err.message}`;
  } finally {
    isSaving.value = false;
    if (successTimer) clearTimeout(successTimer);
    successTimer = setTimeout(() => { successMessage.value = ''; }, 5000);
  }
};

const runConnectionTest = async (kind) => {
  const block = blocks[kind];
  block.testing = true;
  block.testResult = null;
  try {
    if (kind === 'text') {
      const startedAt = Date.now();
      const result = await callVaultSiliconChat({
        purpose: 'moderation',
        mode: TEXT_MODE_ID,
        payload: {
          messages: [
            { role: 'system', content: '你是内容安全审查助手。严格只输出 JSON：{"status":"approved|rejected","confidence":0~1,"reason":"..."}' },
            { role: 'user', content: '场景: connectivity-test\n内容: 今天天气不错，适合散步。' }
          ],
          stream: false
        },
        timeoutMs: 12000
      });
      const elapsedMs = Date.now() - startedAt;
      if (!result?.ok) {
        block.testResult = { ok: false, text: `失败：${result?.error?.message || `HTTP ${result?.status || 0}`}` };
      } else {
        const content = String(result?.data?.choices?.[0]?.message?.content || '').trim();
        block.testResult = { ok: true, text: `通过（${elapsedMs}ms）：${content.slice(0, 60) || '（空响应）'}` };
      }
    } else {
      const result = await testCloudImageModeration();
      block.testResult = result?.ok
        ? { ok: true, text: `通过（${result.elapsedMs}ms）：${result.verdict?.status || 'approved'}` }
        : { ok: false, text: `失败：${result?.message || '未知错误'}` };
    }
  } catch (err) {
    block.testResult = { ok: false, text: `失败：${err.message}` };
  } finally {
    block.testing = false;
  }
};

onMounted(() => {
  void loadFreemodels();
  void loadConfig();
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

.g-moderation-block {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 3);
  padding: calc(var(--spacing) * 3);
  border: 1px solid var(--border, rgba(0, 0, 0, 0.08));
  border-radius: 12px;
}

.g-moderation-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--spacing) * 3);
}

.g-moderation-inline-fields {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: calc(var(--spacing) * 3);
}

.g-moderation-test-row {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  flex-wrap: wrap;
}

.g-test-result { font-size: 0.78rem; word-break: break-all; }
.g-test-result.is-ok { color: #1a7f37; }
.g-test-result.is-fail { color: #c0392b; }

.g-badge.is-warn { color: #92400e; }

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
  .g-moderation-inline-fields { grid-template-columns: 1fr; }
}
</style>
