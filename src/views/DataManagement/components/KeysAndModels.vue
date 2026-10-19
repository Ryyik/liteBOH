<template>
  <section class="g-keys-models">
    <DashboardHero
      eyebrow="Keys &amp; Models"
      title="密钥与模型"
      description="平台是左栏的实体：选中它，右边同时给出这个平台的密钥和它下面的模型。密钥只在服务端加密保存，前端只显示脱敏值。"
    >
      <template #actions>
        <button
          type="button"
          class="g-btn g-btn-ghost"
          @click="refreshAll"
          :disabled="vault.loading.value"
        >
          <RefreshCw :size="16" :class="{ 'g-spin': vault.loading.value }" />
          <span>刷新</span>
        </button>
        <button
          type="button"
          class="g-btn g-btn-primary"
          @click="openKeyDialog({ fetchAfterSave: true })"
        >
          <Plus :size="16" />
          <span>添加平台</span>
        </button>
      </template>
    </DashboardHero>

    <DashboardNotice
      v-if="vault.message.value"
      :tone="vault.messageTone.value"
      dismissible
      @dismiss="vault.notify('')"
    >
      {{ vault.message.value }}
    </DashboardNotice>
    <DashboardNotice
      v-if="freemodels.error.value"
      tone="error"
      dismissible
      @dismiss="freemodels.error.value = ''"
    >
      {{ freemodels.error.value }}
    </DashboardNotice>

    <div class="km-layout">
      <aside class="g-card km-rail">
        <p class="km-rail-group">模型平台</p>
        <button
          v-for="pf in railPlatforms"
          :key="pf.id"
          type="button"
          :class="['km-pf', { 'is-active': pf.id === activeProvider }]"
          @click="selectProvider(pf.id)"
        >
          <span class="km-pf-top">
            <span class="km-pf-name">{{ pf.label }}</span>
            <span :class="['km-pf-dot', { 'is-live': pf.keyCount > 0 }]"></span>
          </span>
          <span class="km-pf-meta">{{ pf.modelCount }} 个模型 · {{ pf.keyCount }} 个密钥</span>
        </button>

        <p class="km-rail-group">工具服务</p>
        <button
          v-for="pf in railTools"
          :key="pf.id"
          type="button"
          :class="['km-pf', { 'is-active': pf.id === activeProvider }]"
          @click="selectProvider(pf.id)"
        >
          <span class="km-pf-top">
            <span class="km-pf-name">{{ pf.label }}</span>
            <span :class="['km-pf-dot', { 'is-live': pf.keyCount > 0 }]"></span>
          </span>
          <span class="km-pf-meta"
            >{{ pf.keyCount ? pf.keyCount + ' 个密钥' : '尚未配置' }} · 无模型</span
          >
        </button>
      </aside>

      <div class="km-detail">
        <header class="km-head">
          <h2>{{ activeMeta.label }}</h2>
          <span v-if="currentKeys.length" class="g-badge is-success">
            <span class="g-badge-dot" />已配置
          </span>
          <span v-else class="g-badge is-muted"><span class="g-badge-dot" />未配置</span>
          <span v-if="activeMeta.group === 'tool'" class="km-head-note">
            这个平台只提供密钥，没有模型清单
          </span>
          <span v-if="activeProvider === 'custom' && currentKeys.length > 1" class="km-head-note">
            下面是 {{ currentKeys.length }} 个自定义网关，它们共用同一份模型清单
          </span>
        </header>

        <section class="g-card">
          <div class="g-card-head">
            <div>
              <div class="g-eyebrow">密钥</div>
              <strong>{{ currentKeys.length }} 个</strong>
            </div>
            <button type="button" class="g-btn g-btn-sm" @click="openKeyDialog()">
              <Plus :size="14" />
              <span>添加 Key</span>
            </button>
          </div>
          <p class="km-hint">替换密钥时不会回显旧值，只能覆盖写入。</p>

          <div v-if="vault.loading.value && !currentKeys.length" class="g-empty">正在读取密钥…</div>
          <p v-else-if="!currentKeys.length" class="g-empty">
            还没有密钥。点右上角「添加平台」可以一次配好平台并自动拉取它的模型。
          </p>
          <ul v-else class="km-keys">
            <li
              v-for="item in pagedKeys"
              :key="item.id"
              :class="['km-key', { 'is-readonly': item.readonly }]"
            >
              <span class="km-key-main">
                <strong>{{
                  item.label || `${providerLabel(item.provider)} ${item.purpose}`
                }}</strong>
                <span class="g-badge is-muted">{{
                  purposeLabel(item.provider, item.purpose)
                }}</span>
                <span v-if="item.readonly" class="g-badge is-warning"
                  ><span class="g-badge-dot" />Secrets</span
                >
                <code class="km-mono">{{ item.maskedValue || '未生成脱敏值' }}</code>
              </span>
              <span class="km-key-state">
                <span :class="['km-dot', item.lastTestStatus || 'untested']"></span>
                <small>{{ testLabel(item) }}</small>
              </span>
              <span class="km-key-actions">
                <button
                  type="button"
                  class="g-btn g-btn-ghost g-btn-sm"
                  @click="vault.test(item)"
                  :disabled="vault.workingId.value === item.id"
                >
                  测试
                </button>
                <button
                  type="button"
                  class="g-btn g-btn-ghost g-btn-sm"
                  @click="openKeyDialog({ item })"
                >
                  替换
                </button>
                <button
                  type="button"
                  class="g-btn g-btn-ghost g-btn-sm"
                  @click="vault.toggleStatus(item)"
                  :disabled="item.readonly"
                >
                  {{ item.status === 'active' ? '停用' : '启用' }}
                </button>
                <button
                  type="button"
                  class="g-btn g-btn-ghost g-btn-sm km-danger"
                  @click="vault.remove(item)"
                  :disabled="item.readonly || vault.workingId.value === item.id"
                >
                  删除
                </button>
              </span>
            </li>
          </ul>
          <footer v-if="currentKeys.length > pageSize" class="km-foot">
            <span class="km-foot-text">{{ currentKeys.length }} 个密钥</span>
            <DashboardPagination
              v-model="keyPage"
              :total="currentKeys.length"
              :page-size="pageSize"
              aria-label="密钥分页"
            />
          </footer>
        </section>

        <section v-if="activeMeta.group === 'model'" class="g-card">
          <div class="g-card-head">
            <div>
              <div class="g-eyebrow">该平台的模型</div>
              <strong>{{ currentModels.length }} 个</strong>
            </div>
            <div class="km-head-actions">
              <button
                type="button"
                class="g-btn g-btn-secondary g-btn-sm"
                @click="openPickDialog()"
              >
                <Sparkles :size="14" />
                <span>从平台拉取</span>
              </button>
              <button type="button" class="g-btn g-btn-sm" @click="openModelDialog()">
                <Plus :size="14" />
                <span>手动添加</span>
              </button>
            </div>
          </div>
          <p class="km-hint">
            是否免费不在这里决定 —— 它由「AI 额度」页的额度倍率决定（倍率 0 = 免费）。
          </p>

          <div v-if="freemodels.loading.value && !currentModels.length" class="g-empty">
            正在读取模型…
          </div>
          <p v-else-if="!currentModels.length" class="g-empty">这个平台还没有加入任何模型。</p>
          <ul v-else class="km-models">
            <li v-for="model in currentModels" :key="model.id" class="km-model">
              <span class="km-model-main">
                <strong>{{ model.name }}</strong>
                <code class="km-mono">{{ model.model_id }}</code>
              </span>
              <span class="km-model-tags">
                <span class="g-badge is-secondary">{{ model.family_label || '通用' }}</span>
                <span v-if="!model.is_active" class="g-badge is-muted">已停用</span>
              </span>
              <span class="km-model-actions">
                <button
                  type="button"
                  class="g-btn g-btn-ghost g-btn-sm"
                  @click="openModelDialog({ model })"
                >
                  编辑
                </button>
                <button
                  type="button"
                  class="g-btn g-btn-ghost g-btn-sm"
                  @click="freemodels.toggleStatus(model)"
                >
                  {{ model.is_active ? '停用' : '启用' }}
                </button>
                <button
                  type="button"
                  class="g-btn g-btn-ghost g-btn-sm km-danger"
                  @click="freemodels.remove(model)"
                >
                  删除
                </button>
              </span>
            </li>
          </ul>
        </section>
      </div>
    </div>

    <!-- ============ 密钥表单（也是「添加平台」的载体） ============ -->
    <!-- ⚠️ 三个对话框必须 Teleport 出 `.management-section`（2026-10-17 P1-1 实测）：
         该 section 带 `backdrop-filter` ⇒ 按规范它会成为 `position: fixed` 后代的**包含块**，
         于是 `inset: 0` 的遮罩只铺满内容区（实测 1117×878 @ 292,131 而不是 1440×900），
         高一点的表单（手动添加模型 h≈664）还会从视口底部溢出。
         目标选 `.data-management-page` 而不是 `body`：页级 token（--card / --foreground /
         --border / --radius / --spacing）都挂在页根上，挂到 body 会全部丢失
         （ApiKeyConsole 的 discovery 弹层就因为挂 body 改用 :root 级 token）。 -->
    <Teleport :to="dialogHost">
      <div
        v-if="keyDialog"
        class="g-dialog-overlay"
        v-dialog-focus="() => (keyDialog = null)"
        @click.self="keyDialog = null"
      >
        <div class="g-dialog" role="dialog" aria-modal="true" aria-labelledby="kmKeyTitle">
          <header class="g-dialog-head">
            <div>
              <div class="g-eyebrow">
                {{
                  keyDialog.item
                    ? '替换密钥'
                    : overwrittenKey
                      ? '将覆盖已有密钥'
                      : '添加平台 / 密钥'
                }}
              </div>
              <strong id="kmKeyTitle">{{
                keyDialog.item ? keyDialog.item.label : '新增密钥'
              }}</strong>
            </div>
            <button
              type="button"
              class="g-icon-btn is-sm is-ghost"
              @click="keyDialog = null"
              title="关闭"
            >
              ×
            </button>
          </header>
          <form class="g-dialog-form" @submit.prevent="submitKey">
            <div class="g-field">
              <label>平台</label>
              <select
                v-model="keyDialog.form.provider"
                class="g-select"
                @change="onKeyProviderChange"
              >
                <optgroup label="模型平台">
                  <option v-for="id in modelPlatformIds" :key="id" :value="id">
                    {{ providerLabel(id) }}
                  </option>
                </optgroup>
                <optgroup label="工具服务">
                  <option v-for="id in toolServiceIds" :key="id" :value="id">
                    {{ providerLabel(id) }}
                  </option>
                </optgroup>
              </select>
              <span class="g-field-hint">接口地址由平台内置，不用手填。</span>
            </div>
            <div class="g-field">
              <label>用途</label>
              <select v-model="keyDialog.form.purpose" class="g-select">
                <option
                  v-for="p in providerPurposes(keyDialog.form.provider)"
                  :key="p.value"
                  :value="p.value"
                >
                  {{ p.label }}
                </option>
              </select>
            </div>
            <p
              v-if="overwrittenKey"
              class="g-notice is-warn km-overwrite"
              data-km="overwrite-warning"
            >
              <span>
                这个平台已经有「{{
                  overwrittenKey.label ||
                  purposeLabel(overwrittenKey.provider, overwrittenKey.purpose)
                }}」的密钥。一个平台的一种用途只能存一个密钥，保存会<strong>替换</strong>它，旧密钥立即失效。
              </span>
            </p>
            <div class="g-field">
              <label>显示名称</label>
              <input
                v-model.trim="keyDialog.form.label"
                class="g-input"
                type="text"
                maxlength="80"
                placeholder="例如 SiliconFlow Chat"
              />
            </div>
            <div class="g-field">
              <label>API Key</label>
              <input
                v-model.trim="keyDialog.form.value"
                class="g-input is-mono"
                type="password"
                autocomplete="off"
                placeholder="粘贴密钥，提交后只保存密文与脱敏值"
              />
              <span v-if="keyDialog.error" class="g-field-hint km-danger">{{
                keyDialog.error
              }}</span>
            </div>
            <label v-if="isModelPlatform(keyDialog.form.provider)" class="km-check">
              <input
                type="checkbox"
                v-model="keyDialog.form.fetchAfterSave"
                :disabled="!canDiscover(keyDialog.form.provider)"
              />
              <span>保存后自动拉取这个平台的模型（推荐）</span>
            </label>
            <footer class="g-dialog-foot">
              <button type="button" class="g-btn g-btn-ghost" @click="keyDialog = null">
                取消
              </button>
              <button type="submit" class="g-btn g-btn-primary" :disabled="vault.loading.value">
                {{ keySubmitLabel }}
              </button>
            </footer>
          </form>
        </div>
      </div>

      <!-- ============ 拉取结果勾选 ============ -->
      <div
        v-if="pickDialog"
        class="g-dialog-overlay"
        v-dialog-focus="closePickDialog"
        @click.self="closePickDialog"
      >
        <div class="g-dialog" role="dialog" aria-modal="true" aria-labelledby="kmPickTitle">
          <header class="g-dialog-head">
            <div>
              <div class="g-eyebrow">从平台拉取</div>
              <strong id="kmPickTitle">{{ providerLabel(pickDialog.provider) }} 的模型</strong>
            </div>
            <button
              type="button"
              class="g-icon-btn is-sm is-ghost"
              @click="closePickDialog"
              title="关闭"
            >
              ×
            </button>
          </header>
          <div class="g-dialog-form">
            <div v-if="pickDialog.loading" class="g-empty">正在向平台拉取模型清单…</div>
            <template v-else>
              <p v-if="pickDialog.error" class="km-danger">{{ pickDialog.error }}</p>
              <p v-else-if="!pickDialog.models.length" class="g-field-hint">
                平台没有返回任何模型。可以关掉这个窗口，用「手动添加」逐个填。
              </p>
              <template v-else>
                <p class="g-field-hint">
                  拉到 {{ pickDialog.models.length }} 个，已自动勾选还没入库的。入库后是否免费由「AI
                  额度」页的倍率决定。
                </p>
                <ul class="km-picks">
                  <li
                    v-for="m in pickDialog.models"
                    :key="m.id"
                    :class="['km-pick', { 'is-on': pickDialog.selected.has(m.id) }]"
                  >
                    <label>
                      <input
                        type="checkbox"
                        :checked="pickDialog.selected.has(m.id)"
                        @change="togglePick(m.id, $event.target.checked)"
                      />
                      <span class="km-pick-copy">
                        <strong>{{ m.name || m.id }}</strong>
                        <span class="km-mono">{{ m.id }}</span>
                      </span>
                    </label>
                    <span v-if="pickDialog.existing.has(m.id)" class="g-badge is-muted"
                      >已在库中</span
                    >
                  </li>
                </ul>
              </template>
            </template>
          </div>
          <footer class="g-dialog-foot">
            <button type="button" class="g-btn g-btn-ghost" @click="closePickDialog">取消</button>
            <button
              type="button"
              class="g-btn g-btn-primary"
              :disabled="pickDialog.importing || !pickDialog.selected.size"
              @click="submitPick"
            >
              {{ pickDialog.importing ? '导入中…' : `加入 ${pickDialog.selected.size} 个模型` }}
            </button>
          </footer>
        </div>
      </div>

      <!-- ============ 模型表单 ============ -->
      <div
        v-if="modelDialog"
        class="g-dialog-overlay"
        v-dialog-focus="() => (modelDialog = null)"
        @click.self="modelDialog = null"
      >
        <div class="g-dialog" role="dialog" aria-modal="true" aria-labelledby="kmModelTitle">
          <header class="g-dialog-head">
            <div>
              <div class="g-eyebrow">{{ modelDialog.isNew ? '新增模型' : '编辑模型' }}</div>
              <strong id="kmModelTitle">{{ modelDialog.form.name || '手动添加' }}</strong>
            </div>
            <button
              type="button"
              class="g-icon-btn is-sm is-ghost"
              @click="modelDialog = null"
              title="关闭"
            >
              ×
            </button>
          </header>
          <form class="g-dialog-form" @submit.prevent="submitModel">
            <div class="g-field">
              <label>平台</label>
              <select
                v-model="modelDialog.form.provider"
                class="g-select"
                @change="onModelProviderChange"
              >
                <option v-for="id in modelPlatformIds" :key="id" :value="id">
                  {{ providerLabel(id) }}
                </option>
              </select>
              <span class="g-field-hint">接口地址与密钥由平台保存，这里不用填。</span>
            </div>
            <div class="g-field">
              <label>模型 ID</label>
              <input
                v-model.trim="modelDialog.form.model_id"
                class="g-input is-mono"
                type="text"
                required
                placeholder="例如 Qwen/Qwen3-8B"
                :disabled="!modelDialog.isNew"
              />
              <span class="g-field-hint">上游真实的模型名。已经在库中的不要再加一次。</span>
            </div>
            <div class="g-field">
              <label>显示名称</label>
              <input
                v-model.trim="modelDialog.form.name"
                class="g-input"
                type="text"
                required
                placeholder="例如 Qwen 3 8B"
              />
            </div>
            <div class="km-row">
              <div class="g-field">
                <label>类型</label>
                <input
                  v-model.trim="modelDialog.form.family_label"
                  class="g-input"
                  type="text"
                  placeholder="例如 通用"
                />
              </div>
              <div class="g-field">
                <label>适用场景</label>
                <input
                  v-model.trim="modelDialog.form.best_for"
                  class="g-input"
                  type="text"
                  placeholder="例如 多场景聊天"
                />
              </div>
            </div>
            <div class="km-row">
              <div class="g-field">
                <label>显示排序</label>
                <input
                  v-model.number="modelDialog.form.sort_order"
                  class="g-input"
                  type="number"
                  min="0"
                  step="1"
                />
                <span class="g-field-hint">越小越靠前。</span>
              </div>
              <div class="g-field">
                <label>状态</label>
                <select v-model="modelDialog.form.is_active" class="g-select">
                  <option :value="true">启用</option>
                  <option :value="false">停用</option>
                </select>
              </div>
            </div>
            <span v-if="modelDialog.error" class="g-field-hint km-danger">{{
              modelDialog.error
            }}</span>
            <footer class="g-dialog-foot">
              <button type="button" class="g-btn g-btn-ghost" @click="modelDialog = null">
                取消
              </button>
              <button type="submit" class="g-btn g-btn-primary">保存</button>
            </footer>
          </form>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { Plus, RefreshCw, Sparkles } from 'lucide-vue-next';
import DashboardHero from './shared/DashboardHero.vue';
import DashboardNotice from './shared/DashboardNotice.vue';
import DashboardPagination from './shared/DashboardPagination.vue';
import {
  useKeyVault,
  PROVIDER_META,
  MODEL_PLATFORM_IDS,
  TOOL_SERVICE_IDS,
  providerLabel,
  purposeLabel,
  isModelPlatform,
} from '../composables/useKeyVault.js';
import { useFreemodels, createEmptyFreemodel } from '../composables/useFreemodels.js';
import { createDialogFocusTrapDirective } from '../composables/useDialogFocusTrap.js';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';

/* 模态框键盘可达性（Esc / Tab 循环 / 焦点归还），三个 `.g-dialog-overlay` 共用。
   `<script setup>` 里叫 vDialogFocus 的变量会自动注册成 `v-dialog-focus` 指令。 */
const vDialogFocus = createDialogFocusTrapDirective();

const { confirm } = useConfirmDialog();
const vault = useKeyVault();
const freemodels = useFreemodels();

const modelPlatformIds = MODEL_PLATFORM_IDS;
const toolServiceIds = TOOL_SERVICE_IDS;

const activeProvider = ref(MODEL_PLATFORM_IDS[0]);
const keyPage = ref(1);
const pageSize = 8;

const activeMeta = computed(
  () =>
    PROVIDER_META[activeProvider.value] || {
      label: activeProvider.value,
      group: 'model',
    },
);

/** 左栏：每个平台显示「几个模型 · 几个密钥」，一眼看出还没配的是哪个 */
const railEntry = (id, label = providerLabel(id)) => ({
  id,
  label,
  keyCount: (vault.keysByProvider.value[id] || []).length,
  modelCount: freemodels.modelsOf(id).length,
});

/**
 * `custom` 不是「一个平台」，而是一种**接入方式** —— 用户可能配了多个不同的自定义网关
 * （公司内网、Gemini 反代…）。左栏写死「自定义」等于把用户自己起的名字藏起来，
 * 所以：只有一个密钥时直接用它填的名字，多于一个时说明有几个。
 * ⚠️ 数据模型限制：freemodels 只记 provider、不记「属于哪个自定义网关」，
 * 所以多个自定义网关**共用同一份模型清单** —— 这点在详情页头明说，不假装能分清。
 */
const customPlatformLabel = computed(() => {
  const keys = vault.keysByProvider.value.custom || [];
  if (!keys.length) return '自定义';
  if (keys.length === 1) return keys[0].label || '自定义';
  return `自定义（${keys.length} 个）`;
});

const railPlatforms = computed(() =>
  MODEL_PLATFORM_IDS.map((id) =>
    railEntry(id, id === 'custom' ? customPlatformLabel.value : undefined),
  ),
);
const railTools = computed(() => TOOL_SERVICE_IDS.map((id) => railEntry(id)));

const currentKeys = computed(() => vault.keysByProvider.value[activeProvider.value] || []);
const currentModels = computed(() => freemodels.modelsOf(activeProvider.value));
const pagedKeys = computed(() =>
  currentKeys.value.slice((keyPage.value - 1) * pageSize, keyPage.value * pageSize),
);

watch(activeProvider, () => {
  keyPage.value = 1;
});

const providerPurposes = (id) =>
  PROVIDER_META[id]?.purposes || [{ value: 'default', label: '默认用途' }];
const canDiscover = (id) => Boolean(PROVIDER_META[id]?.supportsDiscovery);
const testLabel = (item) => {
  if (item.lastTestStatus === 'success') return '连接正常';
  if (item.lastTestStatus === 'failed') return item.lastTestMessage || '连接失败';
  return '尚未测试';
};

function selectProvider(id) {
  activeProvider.value = id;
}

async function refreshAll() {
  await Promise.all([vault.load(), freemodels.load()]);
}

/* ---------------- 密钥表单 ---------------- */
const keyDialog = ref(null);

function openKeyDialog({ item = null, fetchAfterSave = false } = {}) {
  const provider = item?.provider || activeProvider.value;
  const meta = PROVIDER_META[provider];
  keyDialog.value = {
    item,
    error: '',
    form: {
      provider,
      purpose: item?.purpose || meta?.defaultPurpose || 'chat',
      label: item?.label || meta?.defaultLabel || '',
      value: '',
      fetchAfterSave: fetchAfterSave && canDiscover(provider),
    },
  };
}

function onKeyProviderChange() {
  const meta = PROVIDER_META[keyDialog.value.form.provider];
  keyDialog.value.form.purpose = meta?.defaultPurpose || 'chat';
  keyDialog.value.form.label = meta?.defaultLabel || '';
  keyDialog.value.form.fetchAfterSave = Boolean(meta?.supportsDiscovery);
}

/** 同一行的判定：优先 id；id 为空（Secrets 兜底项）时退化为引用相等 */
const isSameRow = (a, b) => {
  if (!a || !b) return false;
  if (a === b) return true;
  return Boolean(a.id) && a.id === b.id;
};

/**
 * 这次保存会**覆盖掉**哪一行。
 *
 * `api_key_vault` 的唯一键是 `(provider, purpose)`（迁移 2026061001:17），
 * Edge Function 也是 `upsert(..., onConflict: 'provider,purpose')`
 * ⇒ 同一平台 + 同一用途**只能存在一行**，再保存就是**替换**而不是新增。
 *
 * 这对预设平台是对的（"替换密钥"），但对 `custom` 是灾难：
 * 用户以为在「添加第二个自定义网关」，实际把第一个的密钥和名字都覆盖掉了，
 * 而界面还提示"已加密保存"。所以非空时必须显式告知 + 二次确认。
 */
const overwrittenKey = computed(() => {
  if (!keyDialog.value) return null;
  const { provider, purpose } = keyDialog.value.form;
  const rows = vault.keysByProvider.value[provider] || [];
  return rows.find((k) => k.purpose === purpose && !isSameRow(k, keyDialog.value.item)) || null;
});

/** 按钮措辞跟着实际后果走 —— 不让「保存」这个词掩盖「替换」这件事 */
const keySubmitLabel = computed(() => {
  const fetch = Boolean(keyDialog.value?.form.fetchAfterSave);
  if (overwrittenKey.value) return fetch ? '覆盖并拉取' : '覆盖保存';
  return fetch ? '保存并拉取' : '保存';
});

async function submitKey() {
  const form = keyDialog.value.form;
  if (!form.value.trim()) {
    keyDialog.value.error = '请粘贴 API Key。';
    return;
  }
  const overwritten = overwrittenKey.value;
  if (overwritten) {
    const ok = await confirm({
      title: '这会覆盖已有的密钥',
      message:
        `${providerLabel(form.provider)} · ${purposeLabel(form.provider, form.purpose)} 只能存一个密钥。\n` +
        `保存后「${overwritten.label || overwritten.purpose}」的密钥会被替换，旧密钥立即失效。`,
      tone: 'danger',
      confirmText: '覆盖',
      cancelText: '取消',
    });
    if (!ok) return;
  }
  const meta = PROVIDER_META[form.provider];
  const metadata = {};
  if (meta?.supportsChatTest) metadata.model = meta.defaultModel;
  if (meta?.supportsChatTest || meta?.supportsDiscovery) metadata.apiUrl = meta.defaultApiUrl;

  const shouldFetch = form.fetchAfterSave && canDiscover(form.provider);
  const savedProvider = form.provider;
  const savedPurpose = form.purpose;
  const ok = await vault.save({
    provider: form.provider,
    purpose: form.purpose,
    label: form.label,
    value: form.value,
    metadata,
  });
  if (!ok) return;
  keyDialog.value = null;
  if (shouldFetch) {
    const saved = vault.keys.value.find(
      (k) => k.provider === savedProvider && k.purpose === savedPurpose,
    );
    openPickDialog(saved);
  }
}

/* ---------------- 拉取勾选 ---------------- */
const pickDialog = ref(null);

/* 三个对话框的 Teleport 宿主（原因见模板里那段注释）。
   挂载后再解析：setup 期页根可能还没进 DOM，先落 body 保证 v-if 打开时不会丢内容；
   页根一到位就改指 `.data-management-page`，把页级 token 一并带过去。 */
const dialogHost = ref('body');
onMounted(() => {
  if (document.querySelector('.data-management-page')) dialogHost.value = '.data-management-page';
});

async function openPickDialog(keyItem) {
  const provider = keyItem?.provider || activeProvider.value;
  const key =
    keyItem || (vault.keysByProvider.value[provider] || []).find((k) => k.status === 'active');
  pickDialog.value = {
    provider,
    keyId: key?.id || '',
    purpose: key?.purpose || PROVIDER_META[provider]?.defaultPurpose || 'chat',
    loading: true,
    importing: false,
    error: '',
    models: [],
    selected: new Set(),
    existing: new Set(),
  };
  // 拉取失败也要给出可操作的话，不静默停住
  if (!key) {
    pickDialog.value.loading = false;
    pickDialog.value.error = '这个平台还没有可用的密钥，先在左边加一个再拉取。';
    return;
  }
  const result = await vault.discover({
    id: key.id,
    provider,
    purpose: key.purpose,
  });
  const dialog = pickDialog.value;
  if (!dialog) return;
  dialog.loading = false;
  if (!result.ok) {
    dialog.error = result.message || '拉取失败';
    return;
  }
  dialog.models = result.models;
  dialog.existing = new Set(freemodels.modelsOf(provider).map((m) => m.model_id));
  // 默认勾选「还没入库的」，已在库里的不重复勾
  result.models.forEach((m) => {
    if (!dialog.existing.has(m.id)) dialog.selected.add(m.id);
  });
}

function togglePick(id, checked) {
  if (checked) pickDialog.value.selected.add(id);
  else pickDialog.value.selected.delete(id);
}

function closePickDialog() {
  pickDialog.value = null;
}

async function submitPick() {
  const dialog = pickDialog.value;
  if (!dialog || !dialog.selected.size) return;
  dialog.importing = true;
  const rows = dialog.models.filter((m) => dialog.selected.has(m.id));
  const result = await freemodels.importModels({
    provider: dialog.provider,
    providerLabel: providerLabel(dialog.provider),
    apiBaseUrl: PROVIDER_META[dialog.provider]?.defaultApiUrl || null,
    rows,
  });
  dialog.importing = false;
  if (result.error) {
    dialog.error = result.error;
    return;
  }
  vault.notify(
    `已加入 ${result.added} 个模型${result.skipped ? `，跳过 ${result.skipped} 个已在库中的` : ''}。`,
  );
  activeProvider.value = dialog.provider;
  closePickDialog();
}

/* ---------------- 模型表单 ---------------- */
const modelDialog = ref(null);

function openModelDialog({ model = null } = {}) {
  modelDialog.value = {
    isNew: !model,
    error: '',
    form: model ? { ...model } : createEmptyFreemodel(activeProvider.value),
  };
}

function onModelProviderChange() {
  const provider = modelDialog.value.form.provider;
  modelDialog.value.form.provider_label = providerLabel(provider);
}

async function submitModel() {
  const dialog = modelDialog.value;
  const form = dialog.form;
  if (!String(form.model_id || '').trim()) {
    dialog.error = '模型 ID 不能为空。';
    return;
  }
  if (!String(form.name || '').trim()) {
    dialog.error = '显示名称不能为空 —— 列表里看到的就是它。';
    return;
  }
  const payload = {
    model_id: form.model_id,
    name: form.name,
    provider: form.provider,
    provider_label: providerLabel(form.provider),
    family_label: form.family_label,
    best_for: form.best_for,
    sort_order: Number(form.sort_order) || 0,
    is_active: form.is_active !== false,
  };
  const ok = dialog.isNew
    ? await freemodels.create(payload)
    : await freemodels.update(form.id, payload);
  if (!ok) {
    dialog.error = freemodels.error.value || '保存失败';
    return;
  }
  activeProvider.value = form.provider;
  modelDialog.value = null;
}

onMounted(refreshAll);
</script>

<style scoped>
@import '../styles/base.css';
@import '../styles/responsive.css';
/* 三个对话框（添加 Key / 从平台拉取 / 手动添加模型）的 `.g-dialog*` 都在这里，
   2026-10-17 P1-1 之前它只写在 FreemodelsConfig 的 scoped 块里 ⇒ 本页对话框
   掉进文档流、按钮看着「没反应」。 */
@import '../styles/dialog.css';

.km-layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: calc(var(--spacing) * 4);
  align-items: start;
}

.km-rail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: calc(var(--spacing) * 3);
}

.km-rail-group {
  margin: calc(var(--spacing) * 2) 0 2px;
  font-size: 11px;
  font-weight: 500;
  color: var(--muted-foreground);
}

.km-rail-group:first-child {
  margin-top: 0;
}

.km-pf {
  display: grid;
  gap: 3px;
  padding: 9px 11px;
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) + 2px);
  background: var(--background);
  color: var(--foreground);
  text-align: left;
  cursor: pointer;
}

.km-pf:hover {
  border-color: var(--ring);
}

.km-pf.is-active {
  border-color: var(--primary);
}

.km-pf-top {
  display: flex;
  align-items: center;
  gap: 7px;
}

.km-pf-name {
  font-size: 13px;
  font-weight: 500;
}

.km-pf-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted-foreground);
}

.km-pf-dot.is-live {
  background: var(--chart-5);
}

.km-pf-meta {
  font-size: 11px;
  color: var(--muted-foreground);
}

.km-detail {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 3);
  min-width: 0;
}

.km-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.km-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
}

.km-head-note {
  font-size: 12px;
  color: var(--muted-foreground);
}

.km-head-actions {
  display: flex;
  gap: 6px;
}

.km-hint {
  margin: 0;
  padding: 0 15px 12px;
  font-size: 11px;
  color: var(--muted-foreground);
}

.km-keys,
.km-models,
.km-picks {
  list-style: none;
  margin: 0;
  padding: 0;
}

.km-key,
.km-model {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 15px;
  border-top: 1px solid var(--border);
}

.km-key-main,
.km-model-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.km-model-main {
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.km-key-main strong,
.km-model-main strong {
  font-size: 13px;
  font-weight: 500;
}

.km-mono {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--muted-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.km-key-state {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--muted-foreground);
}

.km-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--muted-foreground);
}

.km-dot.success {
  background: var(--chart-5);
}

.km-dot.failed {
  background: var(--chart-2);
}

.km-key-actions,
.km-model-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.km-model-tags {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.km-danger {
  color: var(--chart-2);
}

.km-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 15px;
  border-top: 1px solid var(--border);
}

.km-foot-text {
  font-size: 11px;
  color: var(--muted-foreground);
}

.km-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

/* 覆盖警示：多行文字要顶对齐（.g-notice 默认 center 会让第二行错位） */
.km-overwrite {
  align-items: flex-start;
  font-size: 12px;
  line-height: 1.6;
}

.km-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.km-pick {
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) + 2px);
  padding: 8px 11px;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.km-pick.is-on {
  border-color: var(--primary);
}

.km-pick label {
  display: flex;
  align-items: center;
  gap: 9px;
  cursor: pointer;
  min-width: 0;
}

.km-pick-copy {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.km-pick-copy strong {
  font-size: 12px;
  font-weight: 500;
}

@media (max-width: 900px) {
  .km-layout {
    grid-template-columns: 1fr;
  }

  .km-key,
  .km-model {
    flex-direction: column;
    align-items: flex-start;
  }

  .km-row {
    grid-template-columns: 1fr;
  }
}
</style>
