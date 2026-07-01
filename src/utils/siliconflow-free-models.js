import { supabase } from '@/utils/supabase-client.js'

// 动态加载的模型列表（优先从数据库读取）
let cachedFreemodels = null;
let inflightPromise = null;

/**
 * 从数据库加载免费模型配置
 * @returns {Promise<Array>} 模型列表
 */
export async function loadFreemodelsFromDB() {
  if (cachedFreemodels) {
    return cachedFreemodels;
  }
  if (inflightPromise) {
    return inflightPromise;
  }
  inflightPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('freemodels')
        .select('model_id, name, family_label, best_for')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      if (data && data.length > 0) {
        cachedFreemodels = Object.freeze(data.map(item => ({
          id: item.model_id,
          name: item.name,
          familyLabel: item.family_label,
          bestFor: item.best_for
        })));
        return cachedFreemodels;
      }
      // 空结果也缓存，避免重复查询
      cachedFreemodels = Object.freeze([]);
      return cachedFreemodels;
    } catch (e) {
      console.warn('从数据库加载免费模型失败:', e.message);
      return [];
    } finally {
      inflightPromise = null;
    }
  })();
  return inflightPromise;
}

/**
 * 清除缓存，强制重新加载
 */
export function clearFreemodelsCache() {
  cachedFreemodels = null;
}

// 导出兼容接口（同步版本，不再硬编码，需要通过loadFreemodelsFromDB()异步加载）
export const SILICONFLOW_FREE_CHAT_MODELS = Object.freeze([]);
export const ZHIPU_CHAT_MODELS = Object.freeze([]);

/**
 * 同步获取已缓存的免费聊天模型列表
 * 需在 main.js 中 await loadFreemodelsFromDB() 预热后调用
 * @returns {Array} 模型列表（未加载时返回空数组）
 */
export function getFreeChatModels() {
  return cachedFreemodels || [];
}

// 模块加载时 fire-and-forget 预加载，尽早填充缓存
loadFreemodelsFromDB().catch(() => {});

export const SILICONFLOW_FREE_MULTIMODAL_MODEL_IDS = Object.freeze([
  'deepseek-ai/DeepSeek-OCR',
  'PaddlePaddle/PaddleOCR-VL-1.5',
  'FunAudioLLM/SenseVoiceSmall',
  'TeleAI/TeleSpeechASR',
  'Kwai-Kolors/Kolors'
]);

export const SILICONFLOW_FREE_EMBEDDING_MODEL_IDS = Object.freeze([
  'BAAI/bge-m3',
  'netease-youdao/bce-embedding-base_v1'
]);

export const SILICONFLOW_FREE_RERANK_MODEL_IDS = Object.freeze([
  'netease-youdao/bce-reranker-base_v1',
  'BAAI/bge-reranker-v2-m3'
]);

export const SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID = 'Qwen/Qwen3-8B';
export const SILICONFLOW_DEFAULT_FREE_EMBEDDING_MODEL_ID = 'BAAI/bge-m3';
export const SILICONFLOW_DEFAULT_FREE_RERANK_MODEL_ID = 'netease-youdao/bce-reranker-base_v1';

// 同步版本：基于缓存判断（如果缓存为空则返回false）
const SILICONFLOW_FREE_MODEL_ID_SET = new Set([
  ...SILICONFLOW_FREE_MULTIMODAL_MODEL_IDS,
  ...SILICONFLOW_FREE_EMBEDDING_MODEL_IDS,
  ...SILICONFLOW_FREE_RERANK_MODEL_IDS
]);

export const isSiliconFlowFreeModel = (modelId = '') => {
  const safeModelId = String(modelId || '').trim();

  // 检查缓存中的聊天模型
  if (cachedFreemodels) {
    const chatModelIds = new Set(cachedFreemodels.map(m => m.id));
    if (chatModelIds.has(safeModelId)) return true;
  }

  // 检查其他类型模型（多模态、嵌入、重排序）
  return SILICONFLOW_FREE_MODEL_ID_SET.has(safeModelId);
};

/**
 * 异步版本：从数据库验证模型是否为免费模型
 */
export async function isSiliconFlowFreeModelAsync(modelId = '') {
  const safeModelId = String(modelId || '').trim();

  // 从数据库加载模型列表
  const models = await loadFreemodelsFromDB();
  const chatModelIds = new Set(models.map(m => m.id));

  // 检查聊天模型或其他类型模型
  return chatModelIds.has(safeModelId) || SILICONFLOW_FREE_MODEL_ID_SET.has(safeModelId);
}

export const resolveSiliconFlowFreeModelId = (
  modelId = '',
  fallbackModelId = SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID
) => {
  const safeModelId = String(modelId || '').trim();
  if (isSiliconFlowFreeModel(safeModelId)) return safeModelId;
  if (isSiliconFlowFreeModel(fallbackModelId)) return fallbackModelId;
  return SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID;
};

/**
 * 异步版本：从数据库验证并解析模型ID
 */
export async function resolveSiliconFlowFreeModelIdAsync(
  modelId = '',
  fallbackModelId = SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID
) {
  const safeModelId = String(modelId || '').trim();
  if (await isSiliconFlowFreeModelAsync(safeModelId)) return safeModelId;
  if (await isSiliconFlowFreeModelAsync(fallbackModelId)) return fallbackModelId;
  return SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID;
};
