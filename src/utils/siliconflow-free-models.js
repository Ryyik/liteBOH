export const SILICONFLOW_FREE_CHAT_MODELS = Object.freeze([
  { id: 'Qwen/Qwen3-8B', name: 'Qwen 3 8B', familyLabel: '通用', bestFor: '多场景聊天' },
  { id: 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B', name: 'DeepSeek R1 0528 8B', familyLabel: '推理', bestFor: '高强推理' },
  { id: 'THUDM/GLM-Z1-9B-0414', name: 'GLM Z1 9B', familyLabel: '通用', bestFor: '综合任务' },
  { id: 'Qwen/Qwen2.5-7B-Instruct', name: 'Qwen 2.5 7B Instruct', familyLabel: '指令', bestFor: '稳定执行' },
  { id: 'nex-agi/Nex-N2-Pro', name: 'Nex N2 Pro', familyLabel: '通用', bestFor: '轻量通用对话' },
  { id: 'THUDM/GLM-4-9B-0414', name: 'GLM 4 9B', familyLabel: '通用', bestFor: '快速响应' },
  { id: 'tencent/Hunyuan-MT-7B', name: 'Hunyuan MT 7B', familyLabel: '翻译', bestFor: '多语翻译' }
]);

export const ZHIPU_CHAT_MODELS = Object.freeze([
  { id: 'glm-4.7-flash', name: 'GLM-4.7-Flash', familyLabel: '长上下文', bestFor: '200K 长上下文聊天' },
  { id: 'glm-4.6v-flash', name: 'GLM-4.6V-Flash', familyLabel: '多模态', bestFor: '图片、视频、文件、文本' }
]);

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

const SILICONFLOW_FREE_MODEL_ID_SET = new Set([
  ...SILICONFLOW_FREE_CHAT_MODELS.map((model) => model.id),
  ...ZHIPU_CHAT_MODELS.map((model) => model.id),
  ...SILICONFLOW_FREE_MULTIMODAL_MODEL_IDS,
  ...SILICONFLOW_FREE_EMBEDDING_MODEL_IDS,
  ...SILICONFLOW_FREE_RERANK_MODEL_IDS
]);

export const isSiliconFlowFreeModel = (modelId = '') => (
  SILICONFLOW_FREE_MODEL_ID_SET.has(String(modelId || '').trim())
);

export const resolveSiliconFlowFreeModelId = (
  modelId = '',
  fallbackModelId = SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID
) => {
  const safeModelId = String(modelId || '').trim();
  if (isSiliconFlowFreeModel(safeModelId)) return safeModelId;
  if (isSiliconFlowFreeModel(fallbackModelId)) return fallbackModelId;
  return SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID;
};
