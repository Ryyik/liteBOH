import { computed, ref } from 'vue';
import {
  listApiKeys,
  testApiKey,
  updateApiKeyStatus,
  upsertApiKey,
  deleteApiKey,
  discoverModels,
} from '@/utils/api/api-key-vault-api.js';
import { resolveVaultActiveKey } from '@/utils/api/api-key-runtime-api.js';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';

/**
 * API Key 库的前端真源（密钥与模型页 / 旧的 API Key 页共用）。
 *
 * ── 为什么要有这个文件 ──────────────────────────────────────────────
 * 合并前，provider 的元数据散在 ApiKeyConsole.vue 的**三处**：
 *   · providerOptions      —— 有哪些平台
 *   · purposeOptions       —— 每个平台有哪些用途
 *   · DEFAULT_PROVIDER_CONFIG —— 默认模型 / 默认接口地址
 * 三处必须同步改，漏一处就是「下拉里选得到、但默认值填不出」。
 * 现在全部收进下面的 PROVIDER_META，一处定义。
 *
 * ── 两类 provider（合并设计的关键修正）────────────────────────────
 * 不是所有密钥都是「模型平台」：
 *   · group 'model' —— SiliconFlow / OpenRouter / 智谱 / 自定义：有模型清单可管
 *   · group 'tool'  —— Tavily（联网搜索）/ Cloudinary（图床）/ Turnstile（人机校验）：
 *                     只有密钥，没有模型。界面上不该给它们显示「该平台的模型」区块。
 *
 * ── 返回值约定 ──────────────────────────────────────────────────────
 * api-key-vault-api 的每个函数都返回 `{ ok, data, error }`，本 composable
 * 统一把它翻译成「写 message、返回 boolean」，调用方不必各自解包。
 */

/** provider 元数据 —— 全站唯一声明点。新增平台只改这里。 */
export const PROVIDER_META = {
  siliconflow: {
    label: 'SiliconFlow',
    group: 'model',
    defaultPurpose: 'chat',
    defaultLabel: 'SiliconFlow Chat',
    defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
    defaultApiUrl: 'https://api.siliconflow.cn/v1/chat/completions',
    supportsDiscovery: true,
    supportsChatTest: true,
    purposes: [
      { value: 'chat', label: '聊天模型' },
      { value: 'embedding', label: '向量嵌入' },
      { value: 'rerank', label: '重排序' },
      { value: 'moderation', label: '内容审核' },
    ],
  },
  openrouter: {
    label: 'OpenRouter',
    group: 'model',
    defaultPurpose: 'chat',
    defaultLabel: 'OpenRouter Chat',
    defaultModel: 'openai/gpt-4o-mini',
    defaultApiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    supportsDiscovery: true,
    supportsChatTest: true,
    purposes: [{ value: 'chat', label: '聊天模型' }],
  },
  zhipu: {
    label: '智谱 AI',
    group: 'model',
    defaultPurpose: 'chat',
    defaultLabel: '智谱 GLM Chat',
    defaultModel: 'glm-4.7-flash',
    defaultApiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    supportsDiscovery: true,
    supportsChatTest: true,
    purposes: [{ value: 'chat', label: '聊天模型' }],
  },
  custom: {
    label: '自定义',
    group: 'model',
    defaultPurpose: 'chat',
    defaultLabel: '自定义',
    defaultModel: '',
    defaultApiUrl: '',
    supportsDiscovery: true,
    supportsChatTest: false,
    purposes: [
      { value: 'chat', label: '聊天模型' },
      { value: 'default', label: '默认用途' },
    ],
  },
  tavily: {
    label: 'Tavily',
    group: 'tool',
    defaultPurpose: 'web_search',
    defaultLabel: 'Tavily 联网搜索',
    defaultModel: '',
    defaultApiUrl: '',
    supportsDiscovery: false,
    supportsChatTest: false,
    purposes: [{ value: 'web_search', label: '联网搜索' }],
  },
  cloudinary: {
    label: 'Cloudinary',
    group: 'tool',
    defaultPurpose: 'admin_api',
    defaultLabel: 'Cloudinary 管理 API',
    defaultModel: '',
    defaultApiUrl: '',
    supportsDiscovery: false,
    supportsChatTest: false,
    purposes: [{ value: 'admin_api', label: '管理 API' }],
  },
  turnstile: {
    label: 'Turnstile',
    group: 'tool',
    defaultPurpose: 'secret',
    defaultLabel: 'Turnstile 服务端校验',
    defaultModel: '',
    defaultApiUrl: '',
    supportsDiscovery: false,
    supportsChatTest: false,
    purposes: [{ value: 'secret', label: '服务端校验密钥' }],
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDER_META);
/** 有模型清单可管的平台 */
export const MODEL_PLATFORM_IDS = PROVIDER_IDS.filter((id) => PROVIDER_META[id].group === 'model');
/** 只有密钥、没有模型的服务 */
export const TOOL_SERVICE_IDS = PROVIDER_IDS.filter((id) => PROVIDER_META[id].group === 'tool');

export const providerLabel = (id) => PROVIDER_META[id]?.label || id || '未知平台';
export const purposeLabel = (provider, purpose) =>
  PROVIDER_META[provider]?.purposes?.find((p) => p.value === purpose)?.label || purpose || '';
export const isModelPlatform = (id) => PROVIDER_META[id]?.group === 'model';

export function useKeyVault() {
  const { confirm } = useConfirmDialog();

  const keys = ref([]);
  const activeKey = ref(null);
  const activeKeyError = ref('');
  const loading = ref(false);
  const loadingActive = ref(false);
  const workingId = ref('');
  const error = ref('');
  const message = ref('');
  const messageTone = ref('success');

  const notify = (text, tone = 'success') => {
    message.value = text || '';
    messageTone.value = tone;
    if (!text) return;
    if (tone === 'error') error.value = text;
  };

  const keysByProvider = computed(() => {
    const map = {};
    PROVIDER_IDS.forEach((id) => {
      map[id] = [];
    });
    keys.value.forEach((k) => {
      if (!map[k.provider]) map[k.provider] = [];
      map[k.provider].push(k);
    });
    return map;
  });

  /** 有密钥的平台（左栏只列这些 + 预设里还没配的模型平台） */
  const providersWithKeys = computed(() =>
    PROVIDER_IDS.filter((id) => (keysByProvider.value[id] || []).length > 0),
  );

  async function load() {
    loading.value = true;
    error.value = '';
    const result = await listApiKeys();
    loading.value = false;
    if (!result.ok) {
      notify(result.error?.message || '读取 API Key 失败', 'error');
      return false;
    }
    keys.value = Array.isArray(result.data) ? result.data : [];
    return true;
  }

  async function loadActive() {
    loadingActive.value = true;
    activeKeyError.value = '';
    try {
      activeKey.value = await resolveVaultActiveKey();
    } catch (e) {
      activeKey.value = null;
      activeKeyError.value = e?.message || '查询当前活跃 Key 失败';
    } finally {
      loadingActive.value = false;
    }
  }

  /** 新增或替换密钥。metadata 只对有意义的 provider 带上（见 PROVIDER_META）。 */
  async function save({ provider, purpose, label, value, status = 'active', metadata }) {
    const meta = PROVIDER_META[provider];
    let finalMetadata = metadata;
    if (!finalMetadata) {
      finalMetadata = {};
      if (meta?.supportsChatTest) finalMetadata.model = meta.defaultModel;
      if (meta?.supportsChatTest || meta?.supportsDiscovery)
        finalMetadata.apiUrl = meta.defaultApiUrl;
    }
    const result = await upsertApiKey({
      provider,
      purpose,
      label,
      value,
      status,
      metadata: finalMetadata,
    });
    if (!result.ok) {
      notify(result.error?.message || '保存失败', 'error');
      return false;
    }
    notify('API Key 已加密保存。');
    await load();
    return true;
  }

  async function test(item) {
    workingId.value = item.id;
    const result = await testApiKey(item.id, { provider: item.provider, purpose: item.purpose });
    workingId.value = '';
    if (!result.ok) {
      notify(result.error?.message || '测试失败', 'error');
      return false;
    }
    notify(
      result.data?.lastTestMessage || '测试完成。',
      result.data?.lastTestStatus === 'failed' ? 'error' : 'success',
    );
    await load();
    return true;
  }

  async function toggleStatus(item) {
    // Secrets 兜底项由服务端环境变量提供，不能在页面上停用 —— 只能新增同用途密钥覆盖。
    if (item.readonly) {
      notify(
        'Secrets 兜底项不能在页面停用，请在 Supabase Secrets 中调整，或新增同用途密钥覆盖它。',
        'error',
      );
      return false;
    }
    const next = item.status === 'active' ? 'disabled' : 'active';
    const result = await updateApiKeyStatus(item.id, next);
    if (!result.ok) {
      notify(result.error?.message || '状态更新失败', 'error');
      return false;
    }
    notify(next === 'active' ? '已启用。' : '已停用。');
    await load();
    return true;
  }

  async function remove(item) {
    const ok = await confirm({
      title: '删除这个密钥？',
      message: `${providerLabel(item.provider)} · ${item.label || item.purpose}\n删除后依赖它的功能会立即失效。`,
      tone: 'danger',
      confirmText: '删除',
      cancelText: '取消',
    });
    if (!ok) return false;
    workingId.value = item.id;
    const result = await deleteApiKey(item.id);
    workingId.value = '';
    if (!result.ok) {
      notify(result.error?.message || '删除失败', 'error');
      return false;
    }
    notify('密钥已删除。');
    await load();
    return true;
  }

  /**
   * 调用中转站 GET /v1/models 拉模型清单。
   * 返回 `{ ok, models, modelsUrl, apiBaseUrl, upstreamStatus, upstreamBodyPreview, message }`，
   * 由调用方决定怎么展示（旧页弹窗、新页向导的「自动拉取」都走这里）。
   */
  async function discover({ id, provider, purpose, modelsUrl }) {
    const payload = { id, provider, purpose };
    if (modelsUrl) payload.modelsUrl = modelsUrl;
    const result = await discoverModels(payload);
    if (!result.ok) {
      return {
        ok: false,
        models: [],
        message: result.error?.message || '模型发现失败（边缘函数调用失败）',
      };
    }
    const data = result.data || {};
    if (!data.ok) {
      return {
        ok: false,
        models: [],
        modelsUrl: data.modelsUrl || '',
        apiBaseUrl: data.apiBaseUrl || '',
        upstreamStatus: data.upstreamStatus || null,
        upstreamBodyPreview: data.upstreamBodyPreview || '',
        message: data.message || '中转站返回失败',
      };
    }
    return {
      ok: true,
      models: Array.isArray(data.models) ? data.models : [],
      modelsUrl: data.modelsUrl || '',
      apiBaseUrl: data.apiBaseUrl || '',
      upstreamStatus: data.upstreamStatus || null,
      upstreamBodyPreview: data.upstreamBodyPreview || '',
      message: '',
    };
  }

  return {
    keys,
    activeKey,
    activeKeyError,
    loading,
    loadingActive,
    workingId,
    error,
    message,
    messageTone,
    keysByProvider,
    providersWithKeys,
    load,
    loadActive,
    save,
    test,
    toggleStatus,
    remove,
    discover,
    notify,
  };
}
