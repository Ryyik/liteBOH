import { supabase } from '../supabase-client.js';

const DEFAULT_SILICON_CHAT_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const DEFAULT_ZHIPU_CHAT_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

const toText = (value, fallback = '') => String(value || fallback || '').trim();
const toFiniteNumber = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

export const getDefaultApiUrlForBohaiProvider = (provider = '') => {
  if (provider === 'zhipu') return DEFAULT_ZHIPU_CHAT_URL;
  if (provider === 'openrouter') return 'https://openrouter.ai/api/v1/chat/completions';
  return DEFAULT_SILICON_CHAT_URL;
};

export const normalizeBohaiModelConfigRow = (row = {}) => {
  const provider = toText(row.provider, 'siliconflow').toLowerCase();
  const modeId = toText(row.mode_id || row.modeId);
  const modelId = toText(row.model_id || row.modelId);
  const displayName = toText(row.display_name || row.displayName || row.name, modeId);
  const apiUrl = toText(row.api_url || row.apiUrl, getDefaultApiUrlForBohaiProvider(provider));

  if (!modeId || !modelId || !displayName) return null;

  return {
    id: row.id || modeId,
    modeId,
    displayName,
    tagline: toText(row.tagline),
    description: toText(row.description),
    provider,
    providerLabel: toText(row.provider_label || row.providerLabel, provider),
    modelId,
    apiUrl,
    capability: toText(row.capability, 'chat'),
    icon: toText(row.icon, 'sparkles'),
    temperature: toFiniteNumber(row.temperature, 0.2, 0, 1.2),
    top_p: toFiniteNumber(row.top_p, 0.75, 0.1, 1),
    frequency_penalty: toFiniteNumber(row.frequency_penalty, 0.06, 0, 2),
    max_tokens: Math.trunc(toFiniteNumber(row.max_tokens, 1800, 256, 4096)),
    status: toText(row.status, 'active'),
    sortOrder: Math.trunc(toFiniteNumber(row.sort_order || row.sortOrder, 100, 0, 10000))
  };
};

export const listActiveBohaiModelConfigs = async () => {
  const { data, error } = await supabase
    .from('bohai_model_configs')
    .select('id, mode_id, display_name, tagline, description, provider, provider_label, model_id, api_url, capability, icon, temperature, top_p, frequency_penalty, max_tokens, status, sort_order, updated_at')
    .eq('status', 'active')
    .order('sort_order', { ascending: true })
    .order('display_name', { ascending: true });

  if (error) {
    return {
      ok: false,
      data: [],
      error: {
        message: error.message || '读取 BOHAI 模型配置失败',
        code: error.code || 'BOHAI_MODEL_CONFIG_ERROR'
      }
    };
  }

  return {
    ok: true,
    data: (Array.isArray(data) ? data : [])
      .map((row) => normalizeBohaiModelConfigRow(row))
      .filter(Boolean),
    error: null
  };
};

export const buildBohaiRuntimeModels = (rows = []) => {
  const configs = (Array.isArray(rows) ? rows : [])
    .map((row) => normalizeBohaiModelConfigRow(row))
    .filter(Boolean)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const chatModes = configs.map((item) => ({
    id: item.modeId,
    name: item.displayName,
    tagline: item.tagline,
    description: item.description,
    icon: item.icon,
    model: item.modelId,
    capability: item.capability
  }));

  const modelMap = new Map();
  configs.forEach((item) => {
    if (!modelMap.has(item.modelId)) {
      modelMap.set(item.modelId, {
        id: item.modelId,
        name: item.displayName,
        provider: item.providerLabel,
        providerKey: item.provider,
        url: item.apiUrl,
        apiKey: ''
      });
    }
  });

  const generationProfiles = configs.reduce((map, item) => {
    map[item.modeId] = {
      temperature: item.temperature,
      top_p: item.top_p,
      frequency_penalty: item.frequency_penalty,
      max_tokens: item.max_tokens
    };
    return map;
  }, {});

  return {
    chatModes,
    availableModels: [...modelMap.values()],
    generationProfiles
  };
};
