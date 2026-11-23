import { computed, ref } from 'vue';
import { listUserAiEndpoints } from '@/utils/api/user-endpoint-api.js';

/**
 * 用户自定义厂商 / 模型（BYOK）的**共享状态单一真源**。
 *
 * 两个消费方，都用这同一份状态，避免两份列表各说各话：
 *   · 设置页的「模型」分区 —— 增删改（写）
 *   · AI 引擎（useChatEngine）—— 把模型编成模式注入选择器（读）
 *
 * 为什么是模块级单例而不是每次调用 new 一份：设置页里刚保存完，输入框的模式选择器
 * 必须**立刻**出现新模型；两份独立状态就得靠事件往外捅，反而更脆。
 *
 * ⚠️ 运行时「模式 id」的约定：`user:<user_ai_models.id>`（见 EF 的 resolveUserModelPolicy）。
 *    前端不需要理解它，只需把它当不透明字符串填进 currentModeId —— 协议细节全在服务端。
 */
export const USER_MODE_PREFIX = 'user:';

const DEFAULT_LIMITS = { endpoints: 8, modelsPerEndpoint: 12 };

const endpoints = ref([]);
const limits = ref({ ...DEFAULT_LIMITS });
const loading = ref(false);
const loaded = ref(false);
const errorText = ref('');
let inflight = null;

const applyPayload = (payload) => {
  endpoints.value = Array.isArray(payload?.endpoints) ? payload.endpoints : [];
  if (payload?.limits && typeof payload.limits === 'object') {
    limits.value = { ...DEFAULT_LIMITS, ...payload.limits };
  }
};

/**
 * 拉取当前用户的自定义厂商列表。
 * `force` 用于「保存后刷新」；未登录 / 未加载过时静默失败（errorText 记录下来供设置页展示）。
 */
export const loadUserEndpoints = async ({ force = false } = {}) => {
  if (inflight) return inflight;
  if (loaded.value && !force) return { ok: true, data: null, error: null };
  loading.value = true;
  inflight = listUserAiEndpoints()
    .then((result) => {
      if (result.ok) {
        applyPayload(result.data);
        loaded.value = true;
        errorText.value = '';
      } else {
        errorText.value = result.error?.message || '自定义模型加载失败';
      }
      return result;
    })
    .finally(() => {
      loading.value = false;
      inflight = null;
    });
  return inflight;
};

/** 保存/删除成功后由调用方把服务端返回的最新列表塞回来（省一次往返） */
export const applyUserEndpointsPayload = (payload) => {
  applyPayload(payload);
  loaded.value = true;
  errorText.value = '';
};

export const resetUserEndpoints = () => {
  endpoints.value = [];
  limits.value = { ...DEFAULT_LIMITS };
  loaded.value = false;
  errorText.value = '';
};

/** 用户模型 → 可注入 `chatModes` 的模式对象（字段与官方模式对齐） */
const chatModes = computed(() =>
  endpoints.value.flatMap((endpoint) =>
    (endpoint.models || []).map((model) => ({
      id: model.modeId,
      name: model.displayName || model.modelId,
      tagline: `自有 Key · ${endpoint.name}`,
      description: `自定义厂商 ${endpoint.name} · ${model.modelId}`,
      // 图标沿用官方模式的命名约定，未知名字在 UI 里回退成默认图标
      icon: 'plug',
      model: model.modeId,
      capability: 'chat',
      // 不受订阅档位限制（用自己的 Key）；额度倍率 0 且 byok=true，
      // 前端据此显示「自有 Key」而不是「免费」—— 这两件事完全不同。
      minTier: 'free',
      quotaMultiplier: 0,
      byok: true,
      endpointName: endpoint.name,
    })),
  ),
);

/** 与 `chatModes[].model` 一一对应的模型表（引擎按 id 反查模型） */
const availableModels = computed(() =>
  chatModes.value.map((mode) => ({
    id: mode.model,
    name: mode.name,
    provider: mode.endpointName,
    providerKey: 'byok',
    url: '',
    // Key 永远不进前端：请求由 EF 用服务端解密后的密钥发出
    apiKey: '',
  })),
);

/** 生成参数：用户在模型里填了就用，否则留空走引擎默认 */
const generationProfiles = computed(() =>
  Object.fromEntries(
    endpoints.value.flatMap((endpoint) =>
      (endpoint.models || []).map((model) => {
        const profile = {};
        if (Number.isFinite(Number(model.temperature))) {
          profile.temperature = Number(model.temperature);
        }
        if (Number.isFinite(Number(model.maxTokens))) {
          profile.max_tokens = Number(model.maxTokens);
        }
        return [model.modeId, profile];
      }),
    ),
  ),
);

export function useUserEndpoints() {
  return {
    endpoints,
    limits,
    loading,
    loaded,
    errorText,
    chatModes,
    availableModels,
    generationProfiles,
    loadUserEndpoints,
    applyUserEndpointsPayload,
    resetUserEndpoints,
  };
}

/** 引擎侧只关心「注入什么」，不需要 CRUD API */
export const userAiChatModes = chatModes;
export const userAiAvailableModels = availableModels;
export const userAiGenerationProfiles = generationProfiles;
export const userAiEndpoints = endpoints;
export const userAiEndpointsLoaded = loaded;
