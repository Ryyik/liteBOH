<template>
  <section class="g-freemodels-config">
    <DashboardHero
      eyebrow="Foundation"
      title="免费模型库"
      description="所有 AI 场景（BOHAI、审核、实验室）的模型均从此库选择。管理 SiliconFlow 免费模型列表，支持启用/禁用、排序调整。"
    >
      <template #actions>
        <button type="button" class="g-btn g-btn-ghost" @click="showBatchAddDialog = true">
          <ListPlus :size="16" />
          <span>批量添加</span>
        </button>
        <button type="button" class="g-btn g-btn-primary" @click="handleCreate">
          <Plus :size="16" />
          <span>添加模型</span>
        </button>
        <button type="button" class="g-btn g-btn-ghost" @click="loadModels" :disabled="isLoading">
          <RefreshCw :size="16" :class="{ 'g-spin': isLoading }" />
          <span>刷新</span>
        </button>
      </template>
    </DashboardHero>

    <div class="g-freemodels-summary">
      <div class="g-mini-card">
        <span class="g-eyebrow">模型总数</span>
        <strong class="g-mini-value">{{ models.length }}</strong>
      </div>
      <div class="g-mini-card">
        <span class="g-eyebrow">已启用</span>
        <strong class="g-mini-value" :style="{ color: 'var(--chart-5)' }">{{ models.filter(m => m.is_active).length }}</strong>
      </div>
      <div class="g-mini-card">
        <span class="g-eyebrow">已停用</span>
        <strong class="g-mini-value" :style="{ color: 'var(--muted-foreground)' }">{{ models.filter(m => !m.is_active).length }}</strong>
      </div>
      <div class="g-mini-card">
        <span class="g-eyebrow">平台数</span>
        <strong class="g-mini-value">{{ Object.keys(providerStats).length }}</strong>
      </div>
    </div>

    <DashboardNotice v-if="error" tone="error" dismissible @dismiss="error = ''">
      {{ error }}
    </DashboardNotice>

    <article class="g-card">
      <div class="g-card-head">
        <div>
          <div class="g-eyebrow">模型列表</div>
          <strong>按 sort_order 升序展示</strong>
        </div>
        <div class="g-freemodels-filter">
          <Filter :size="14" class="g-freemodels-filter-icon" />
          <select v-model="filterProvider" class="g-select is-sm">
            <option value="all">全部平台</option>
            <option v-for="opt in FREEMODEL_PROVIDER_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }} ({{ providerStats[opt.value]?.total || 0 }})
            </option>
          </select>
        </div>
        <span class="g-badge is-muted">{{ sortedModels.length }} 项</span>
      </div>

      <div v-if="isLoading && models.length === 0" class="g-empty">
        <LoaderCircle :size="20" class="g-spin" />
        加载模型列表...
      </div>
      <div v-else-if="sortedModels.length === 0" class="g-empty">暂无模型配置，点击上方按钮添加。</div>
      <div v-else class="g-freemodels-grid">
        <article v-for="model in pagedModels" :key="model.id" :class="['g-freemodel-card', { 'is-active': model.is_active }]">
          <div class="g-freemodel-card-head">
            <div class="g-freemodel-card-titles">
              <strong class="g-freemodel-card-name">{{ model.name }}</strong>
              <code class="g-freemodel-card-id">{{ model.model_id }}</code>
            </div>
            <span class="g-badge" :class="model.is_active ? 'is-success' : 'is-muted'">
              <span class="g-badge-dot" />
              {{ model.is_active ? '启用' : '禁用' }}
            </span>
          </div>
          <div class="g-freemodel-card-meta">
            <span class="g-badge is-primary">
              <span class="g-badge-dot" /> {{ model.provider_label || getProviderLabel(model.provider) }}
            </span>
            <span class="g-badge is-secondary">
              {{ model.family_label }}
            </span>
            <span class="g-freemodel-card-best">{{ model.best_for }}</span>
          </div>
          <div class="g-freemodel-card-foot">
            <label class="g-freemodel-sort">
              <span class="g-eyebrow">排序</span>
              <input v-model.number="model.sort_order" type="number" min="0" class="g-input g-freemodel-sort-input" @change="handleUpdateSort(model)" />
            </label>
            <div class="g-freemodel-card-actions">
              <button type="button" class="g-btn g-btn-secondary g-btn-sm" @click="handleToggleStatus(model)">
                {{ model.is_active ? '停用' : '启用' }}
              </button>
              <button type="button" class="g-icon-btn is-sm" @click="handleEdit(model)" title="编辑">
                <Edit3 :size="14" />
              </button>
              <button type="button" class="g-icon-btn is-sm is-danger" @click="handleDelete(model)" title="删除">
                <Trash2 :size="14" />
              </button>
            </div>
          </div>
        </article>
      </div>
      <footer v-if="sortedModels.length > modelPageSize" class="g-sheet-foot">
        <span class="g-sheet-foot-text">
          显示 {{ (modelPage - 1) * modelPageSize + 1 }} - {{ Math.min(modelPage * modelPageSize, sortedModels.length) }} 项 / 共 {{ sortedModels.length }} 项
        </span>
        <DashboardPagination v-model="modelPage" :total="sortedModels.length" :page-size="modelPageSize" aria-label="免费模型库分页" />
      </footer>
    </article>

    <!-- 编辑/添加对话框 -->
    <div v-if="editingModel" class="g-dialog-overlay" @click.self="editingModel = null">
      <div class="g-dialog">
        <header class="g-dialog-head">
          <div>
            <div class="g-eyebrow">表单</div>
            <strong>{{ isNewModel ? '添加模型' : '编辑模型' }}</strong>
          </div>
          <button type="button" class="g-icon-btn is-sm is-ghost" @click="editingModel = null" title="关闭">
            <X :size="14" />
          </button>
        </header>
        <form class="g-dialog-form" @submit.prevent="handleSave">
          <div class="g-field">
            <label>模型 ID</label>
            <input v-model="editingModel.model_id" class="g-input is-mono" type="text" required placeholder="例如：Qwen/Qwen3-8B" :disabled="!isNewModel" />
          </div>
          <div class="g-field">
            <label>显示名称</label>
            <input v-model="editingModel.name" class="g-input" type="text" required placeholder="例如：Qwen 3 8B" />
          </div>
          <div class="g-field">
            <label>API 平台</label>
            <select v-model="editingModel.provider" class="g-select" @change="onProviderChange">
              <option v-for="opt in FREEMODEL_PROVIDER_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <span class="g-field-hint">选择模型来自哪个 API 平台</span>
          </div>
          <div class="g-field">
            <label>平台显示名</label>
            <input v-model="editingModel.provider_label" class="g-input" type="text" placeholder="留空自动填充" />
          </div>
          <div class="g-field">
            <label>类型</label>
            <input v-model="editingModel.family_label" class="g-input" type="text" required placeholder="例如：通用" />
          </div>
          <div class="g-field">
            <label>适用场景</label>
            <input v-model="editingModel.best_for" class="g-input" type="text" required placeholder="例如：多场景聊天" />
          </div>
          <div class="g-field">
            <label>自定义 API 地址</label>
            <input v-model="editingModel.api_base_url" class="g-input is-mono" type="url" placeholder="留空使用平台默认地址" />
            <span class="g-field-hint">仅自定义平台需要填写，标准平台留空即可</span>
          </div>
          <div class="g-field">
            <label>排序</label>
            <input v-model.number="editingModel.sort_order" class="g-input" type="number" min="0" />
          </div>
          <div class="g-dialog-actions">
            <button type="button" class="g-btn g-btn-ghost" @click="editingModel = null">取消</button>
            <button type="submit" class="g-btn g-btn-primary">{{ isNewModel ? '添加' : '保存' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- 批量添加对话框 -->
    <div v-if="showBatchAddDialog" class="g-dialog-overlay" @click.self="showBatchAddDialog = false">
      <div class="g-dialog g-dialog-wide">
        <header class="g-dialog-head">
          <div>
            <div class="g-eyebrow">表单</div>
            <strong>批量添加模型</strong>
          </div>
          <button type="button" class="g-icon-btn is-sm is-ghost" @click="showBatchAddDialog = false" title="关闭">
            <X :size="14" />
          </button>
        </header>
        <form class="g-dialog-form" @submit.prevent="handleBatchAdd">
          <div class="g-field">
            <label>从 API Key 选择（可选）</label>
            <select v-model="batchKeyId" class="g-select" @change="onKeySelectChange">
              <option value="">不使用 API Key，手动选平台</option>
              <option v-for="k in availableApiKeys" :key="k.id" :value="k.id">
                {{ k.label || `${k.provider} ${k.purpose}` }} · {{ k.provider }}
              </option>
            </select>
            <span class="g-field-hint">
              选中后会自动填充下方平台与 API 地址（来自该 Key 的配置）
              <span v-if="selectedKeyMeta">｜当前 Key 的 API URL：<code class="is-mono">{{ selectedKeyMeta.apiUrl || '未配置' }}</code></span>
            </span>
          </div>
          <div class="g-field">
            <label>API 平台</label>
            <select v-model="batchProvider" class="g-select" :disabled="!!batchKeyId">
              <option v-for="opt in FREEMODEL_PROVIDER_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <span class="g-field-hint">
              {{ batchKeyId ? '已由所选 API Key 自动锁定' : '批量添加的模型都会归属于该平台' }}
            </span>
          </div>
          <div class="g-field">
            <label>模型 ID 列表（英文逗号或换行分割）</label>
            <textarea v-model="batchModelIds" class="g-textarea" rows="8" required
              placeholder="例如：Qwen/Qwen3-8B, deepseek-ai/DeepSeek-R1-0528-Qwen3-8B, THUDM/GLM-Z1-9B-0414" />
            <span class="g-field-hint">自动过滤重复和已存在的模型</span>
          </div>
          <div class="g-dialog-actions">
            <button type="button" class="g-btn g-btn-ghost" @click="showBatchAddDialog = false">取消</button>
            <button type="submit" class="g-btn g-btn-primary" :disabled="isBatchAdding">
              {{ isBatchAdding ? '添加中...' : '批量添加' }}
            </button>
          </div>
        </form>
      </div>
    </div>

  </section>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { Plus, RefreshCw, Edit3, Trash2, LoaderCircle, ListPlus, X, Filter } from 'lucide-vue-next'
import { supabase } from '@/utils/supabase-client.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { FREEMODEL_PROVIDER_OPTIONS } from '../config/fields.js'
import { listApiKeys } from '../../../utils/api/api-key-vault-api.js'
import DashboardHero from './shared/DashboardHero.vue';
import DashboardNotice from './shared/DashboardNotice.vue';
import DashboardPagination from './shared/DashboardPagination.vue';

const { confirm } = useConfirmDialog()

const models = ref([])
const isLoading = ref(false)
const error = ref('')
const editingModel = ref(null)
const isNewModel = ref(false)
const showBatchAddDialog = ref(false)
const batchModelIds = ref('')
const isBatchAdding = ref(false)
const batchProvider = ref('siliconflow')
const filterProvider = ref('all')
const modelPage = ref(1)
const modelPageSize = 12

// 批量添加时可选择已存的 API Key，自动填充 provider / api_base_url
const apiKeys = ref([])
const batchKeyId = ref('')  // 选中的 API Key id

// 仅展示可用作模型来源的 Key（chat 类 + custom/openrouter/siliconflow/zhipu）
const availableApiKeys = computed(() => {
  return apiKeys.value.filter((k) => {
    if (k.status !== 'active') return false
    return ['siliconflow', 'openrouter', 'zhipu', 'custom'].includes(k.provider)
  })
})

// 当前选中的 Key 对应的元数据
const selectedKeyMeta = computed(() => {
  if (!batchKeyId.value) return null
  const k = apiKeys.value.find((x) => x.id === batchKeyId.value)
  if (!k) return null
  return {
    id: k.id,
    provider: k.provider,
    purpose: k.purpose,
    label: k.label || `${k.provider} ${k.purpose}`,
    apiUrl: k.metadata?.apiUrl || ''
  }
})

// 选中 Key 时自动同步 batchProvider（provider 下拉随之联动）
const onKeySelectChange = () => {
  const meta = selectedKeyMeta.value
  if (meta) {
    batchProvider.value = meta.provider
  }
}

const providerLabelMap = computed(() => {
  const map = {}
  FREEMODEL_PROVIDER_OPTIONS.forEach(opt => { map[opt.value] = opt.label })
  return map
})

const PROVIDER_DEFAULTS = {
  siliconflow: {
    label: 'SiliconFlow',
    apiBaseUrl: 'https://api.siliconflow.cn/v1/chat/completions'
  },
  openrouter: {
    label: 'OpenRouter',
    apiBaseUrl: 'https://openrouter.ai/api/v1/chat/completions'
  },
  zhipu: {
    label: '智谱 AI',
    apiBaseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
  },
  custom: {
    label: '自定义',
    apiBaseUrl: ''
  }
}

function getProviderLabel(provider) {
  return PROVIDER_DEFAULTS[provider]?.label || providerLabelMap.value[provider] || provider || '未知'
}

function getProviderApiBaseUrl(provider) {
  return PROVIDER_DEFAULTS[provider]?.apiBaseUrl || ''
}

const sortedModels = computed(() =>
  [...models.value]
    .filter(m => filterProvider.value === 'all' || m.provider === filterProvider.value)
    .sort((a, b) => a.sort_order - b.sort_order)
)

const pagedModels = computed(() => {
  const start = (modelPage.value - 1) * modelPageSize
  return sortedModels.value.slice(start, start + modelPageSize)
})

watch(filterProvider, () => {
  modelPage.value = 1
})

watch(sortedModels, (items) => {
  const totalPages = Math.max(1, Math.ceil(items.length / modelPageSize))
  if (modelPage.value > totalPages) modelPage.value = totalPages
})

const uniqueFamilyCount = computed(() => new Set(models.value.map(m => m.family_label).filter(Boolean)).size)

const providerStats = computed(() => {
  const stats = {}
  models.value.forEach(m => {
    const p = m.provider || 'siliconflow'
    if (!stats[p]) stats[p] = { total: 0, active: 0 }
    stats[p].total++
    if (m.is_active) stats[p].active++
  })
  return stats
})

async function loadModels() {
  isLoading.value = true
  error.value = ''

  try {
    const { data, error: fetchError } = await supabase
      .from('freemodels')
      .select('*')
      .order('sort_order', { ascending: true })

    if (fetchError) throw fetchError

    models.value = data || []
  } catch (e) {
    error.value = `加载失败: ${e.message}`
  } finally {
    isLoading.value = false
  }
}

function handleCreate() {
  isNewModel.value = true
  editingModel.value = {
    model_id: '',
    name: '',
    provider: 'siliconflow',
    provider_label: 'SiliconFlow',
    family_label: '通用',
    best_for: '多场景聊天',
    api_base_url: '',
    sort_order: 0,
    is_active: true
  }
}

function handleEdit(model) {
  isNewModel.value = false
  editingModel.value = { ...model }
}

function onProviderChange() {
  if (!editingModel.value) return
  if (!editingModel.value.provider_label) {
    editingModel.value.provider_label = getProviderLabel(editingModel.value.provider)
  }
  if (!editingModel.value.api_base_url) {
    editingModel.value.api_base_url = getProviderApiBaseUrl(editingModel.value.provider)
  }
}

async function handleSave() {
  if (!editingModel.value) return

  try {
    if (isNewModel.value) {
      const { error: insertError } = await supabase
        .from('freemodels')
        .insert([editingModel.value])

      if (insertError) throw insertError

      await confirm({
        title: '添加成功',
        message: `模型 ${editingModel.value.name} 已添加`,
        tone: 'success'
      })
    } else {
      const { error: updateError } = await supabase
        .from('freemodels')
        .update({
          name: editingModel.value.name,
          provider: editingModel.value.provider,
          provider_label: editingModel.value.provider_label || getProviderLabel(editingModel.value.provider),
          family_label: editingModel.value.family_label,
          best_for: editingModel.value.best_for,
          api_base_url: editingModel.value.api_base_url || null,
          sort_order: editingModel.value.sort_order
        })
        .eq('id', editingModel.value.id)

      if (updateError) throw updateError

      await confirm({
        title: '更新成功',
        message: `模型 ${editingModel.value.name} 已更新`,
        tone: 'success'
      })
    }

    editingModel.value = null
    await loadModels()
  } catch (e) {
    await confirm({
      title: '操作失败',
      message: e.message,
      tone: 'danger'
    })
  }
}

async function handleToggleStatus(model) {
  const newStatus = !model.is_active
  const actionText = newStatus ? '启用' : '禁用'

  const confirmed = await confirm({
    title: `${actionText}模型`,
    message: `确定要${actionText}模型 ${model.name} 吗？`,
    tone: 'warning'
  })

  if (!confirmed) return

  try {
    const { error: updateError } = await supabase
      .from('freemodels')
      .update({ is_active: newStatus })
      .eq('id', model.id)

    if (updateError) throw updateError

    model.is_active = newStatus

    await confirm({
      title: '操作成功',
      message: `模型 ${model.name} 已${actionText}`,
      tone: 'success'
    })
  } catch (e) {
    await confirm({
      title: '操作失败',
      message: e.message,
      tone: 'danger'
    })
  }
}

async function handleUpdateSort(model) {
  try {
    const { error: updateError } = await supabase
      .from('freemodels')
      .update({ sort_order: model.sort_order })
      .eq('id', model.id)

    if (updateError) throw updateError
  } catch (e) {
    error.value = `排序更新失败: ${e.message}`
    await loadModels() // Reload to reset
  }
}

async function handleDelete(model) {
  const confirmed = await confirm({
    title: '删除模型',
    message: `确定要删除模型 ${model.name} 吗？此操作不可撤销。`,
    tone: 'warning'
  })

  if (!confirmed) return

  try {
    const { error: deleteError } = await supabase
      .from('freemodels')
      .delete()
      .eq('id', model.id)

    if (deleteError) throw deleteError

    await confirm({
      title: '删除成功',
      message: `模型 ${model.name} 已删除`,
      tone: 'success'
    })

    await loadModels()
  } catch (e) {
    await confirm({
      title: '删除失败',
      message: e.message,
      tone: 'danger'
    })
  }
}

async function handleBatchAdd() {
  if (!batchModelIds.value.trim()) return

  isBatchAdding.value = true

  try {
    // 解析模型ID列表（支持逗号分割和换行分割）
    const ids = batchModelIds.value
      .split(/[,\n]/)
      .map(id => id.trim())
      .filter(id => id.length > 0)

    // 去重
    const uniqueIds = [...new Set(ids)]

    // 过滤已存在的模型
    const existingModelIds = new Set(models.value.map(m => m.model_id))
    const newIds = uniqueIds.filter(id => !existingModelIds.has(id))

    if (newIds.length === 0) {
      await confirm({
        title: '提示',
        message: '所有模型ID都已存在，无需添加',
        tone: 'info'
      })
      showBatchAddDialog.value = false
      batchModelIds.value = ''
      return
    }

    // 获取当前最大排序值
    const maxSortOrder = models.value.reduce((max, m) => Math.max(max, m.sort_order || 0), 0)

    // 优先使用所选 API Key 的 api_base_url；否则回退到 provider 默认值
    const keyMeta = selectedKeyMeta.value
    const effectiveProvider = keyMeta ? keyMeta.provider : batchProvider.value
    const effectiveProviderLabel = keyMeta
      ? (keyMeta.label || getProviderLabel(effectiveProvider))
      : getProviderLabel(effectiveProvider)
    const effectiveApiBaseUrl = keyMeta
      ? (keyMeta.apiUrl || getProviderApiBaseUrl(effectiveProvider) || null)
      : (getProviderApiBaseUrl(effectiveProvider) || null)

    // 批量插入模型（使用模型ID作为默认名称）
    const insertData = newIds.map((id, index) => ({
      model_id: id,
      name: id.split('/').pop() || id, // 从模型ID提取名称
      provider: effectiveProvider,
      provider_label: effectiveProviderLabel,
      api_base_url: effectiveApiBaseUrl,
      family_label: '通用',
      best_for: '多场景聊天',
      sort_order: maxSortOrder + index + 1,
      is_active: true
    }))

    const { error: insertError } = await supabase
      .from('freemodels')
      .insert(insertData)

    if (insertError) throw insertError

    await confirm({
      title: '批量添加成功',
      message: `成功添加 ${newIds.length} 个模型`,
      tone: 'success'
    })

    showBatchAddDialog.value = false
    batchModelIds.value = ''
    batchKeyId.value = ''
    await loadModels()
  } catch (e) {
    await confirm({
      title: '批量添加失败',
      message: e.message,
      tone: 'danger'
    })
  } finally {
    isBatchAdding.value = false
  }
}

async function loadApiKeys() {
  const result = await listApiKeys()
  if (result.ok) {
    apiKeys.value = Array.isArray(result.data) ? result.data : []
  }
}

onMounted(() => {
  loadModels()
  loadApiKeys()
})
</script>

<style scoped>
@import '../styles/base.css';
@import '../styles/google-components.css';
@import '../styles/responsive.css';

.g-freemodels-config {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 5);
}

.g-freemodels-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: calc(var(--spacing) * 3);
}

/* Model card grid */
.g-freemodels-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: calc(var(--spacing) * 3);
}

.g-freemodel-card {
  display: grid;
  gap: calc(var(--spacing) * 3);
  padding: calc(var(--spacing) * 4);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--background);
  transition: background 0.2s ease, border-color 0.2s ease;
}
.g-freemodel-card:hover { background: var(--muted); border-color: var(--ring); }
.g-freemodel-card.is-active { border-color: color-mix(in srgb, var(--chart-5) 30%, var(--border)); }

.g-freemodels-filter {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 1.5);
}
.g-freemodels-filter-icon { color: var(--muted-foreground); }
.g-select.is-sm { height: 32px; font-size: 0.82rem; padding: 0 28px 0 10px; }
.g-badge.is-secondary {
  background: color-mix(in srgb, var(--chart-3) 12%, transparent);
  color: var(--chart-3);
}

.g-freemodel-card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: calc(var(--spacing) * 2);
}
.g-freemodel-card-titles { min-width: 0; flex: 1; }
.g-freemodel-card-name {
  display: block;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--foreground);
  margin: 0;
}
.g-freemodel-card-id {
  display: block;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--muted-foreground);
  margin-top: 2px;
  word-break: break-all;
}

.g-freemodel-card-meta {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  flex-wrap: wrap;
}
.g-freemodel-card-best {
  font-size: 0.78rem;
  color: var(--muted-foreground);
}

.g-freemodel-card-foot {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: calc(var(--spacing) * 2);
  border-top: 1px solid var(--border);
  padding-top: calc(var(--spacing) * 3);
}
.g-freemodel-sort {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 1);
  min-width: 80px;
}
.g-freemodel-sort-input {
  height: 30px;
  font-family: var(--font-mono);
}
.g-freemodel-card-actions {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 1);
}

/* Dialog */
.g-dialog-overlay {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, var(--foreground) 35%, transparent);
  display: grid;
  place-items: center;
  z-index: 1100;
  padding: calc(var(--spacing) * 5);
}
.g-dialog {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: calc(var(--spacing) * 5);
  width: min(440px, 100%);
  max-height: 90vh;
  overflow-y: auto;
}
.g-dialog.g-dialog-wide { width: min(640px, 100%); }
.g-dialog-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: calc(var(--spacing) * 3);
  margin-bottom: calc(var(--spacing) * 4);
}
.g-dialog-form {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 3);
}
.g-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: calc(var(--spacing) * 2);
  padding-top: calc(var(--spacing) * 3);
  border-top: 1px solid var(--border);
  margin-top: calc(var(--spacing) * 2);
}
.g-freemodels-dialog-subtitle {
  font-size: 0.78rem;
  color: var(--muted-foreground);
  margin: calc(var(--spacing) * 1) 0 0;
  max-width: 480px;
}

.g-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 1100px) {
  .g-freemodels-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
