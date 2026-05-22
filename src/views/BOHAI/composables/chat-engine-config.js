export const TAVILY_API_KEY = import.meta.env.VITE_TAVILY_API_KEY || '';
export const SILICON_CLOUD_API_KEY = import.meta.env.VITE_SILICON_CLOUD_API_KEY || '';
export const SILICON_CLOUD_URL = import.meta.env.VITE_SILICON_CLOUD_URL || 'https://api.siliconflow.cn/v1/chat/completions';
export const SILICON_EMBEDDING_URL = import.meta.env.VITE_SILICON_EMBEDDING_URL || 'https://api.siliconflow.cn/v1/embeddings';
export const SILICON_RERANK_URL = import.meta.env.VITE_SILICON_RERANK_URL || 'https://api.siliconflow.cn/v1/rerank';

export const MAX_CONTEXT_MESSAGES = 10;
export const RATE_LIMIT_WINDOW_MS = 60000;
export const MAX_MESSAGES_PER_WINDOW = 10;
export const MIN_INTERVAL_MS = 1000;
export const BLOCK_DURATION_MS = 5000;
export const SESSION_SAVE_DEBOUNCE_MS = 500;
export const SESSION_SAVE_IDLE_TIMEOUT_MS = 1000;
export const KNOWLEDGE_MAX_CHUNKS = 6;
export const FORUM_MAX_POSTS = 5;
export const OPERATION_MAX_STEPS = 6;
export const SITE_GUIDE_MAX_CHUNKS = 3;
export const MEMORY_MAX_CHUNKS = 4;
export const FORUM_MAX_CHARS_PER_POST = 180;
export const MAX_HISTORY_CONTEXT_CHARS = 7200;
export const MAX_HISTORY_MESSAGE_CHARS = 1200;
export const MAX_FINAL_PROMPT_CHARS = 16000;
export const MAX_PROMPT_EXTRA_CHARS = 8000;
export const MAX_USER_INPUT_CHARS = 4200;
export const MAX_SEARCH_RESULT_CONTENT_CHARS = 280;
export const TREEHOLE_MEMORY_LIMIT = 120;
export const TREEHOLE_CONTEXT_MAX_ITEMS = 32;
export const TREEHOLE_CONTEXT_MAX_ITEM_CHARS = 260;
export const TREEHOLE_MEMORY_CACHE_TTL_MS = 30000;
export const SHARED_MEMORY_LIMIT = 180;
export const SHARED_MEMORY_CONTEXT_MAX_ITEMS = 8;
export const SHARED_MEMORY_CONTEXT_MAX_ITEM_CHARS = 220;
export const SHARED_MEMORY_CACHE_TTL_MS = 30000;
export const SHARED_MEMORY_SEARCH_FETCH_LIMIT = 24;
export const USER_PRIVATE_CONTEXT_CACHE_TTL_MS = 30000;
export const USER_PRIVATE_CONTEXT_MAX_ITEMS = 6;
export const USER_PRIVATE_POSTS_FETCH_LIMIT = 24;
export const USER_PRIVATE_MAIL_FETCH_LIMIT = 40;
export const USER_PRIVATE_GIFTS_FETCH_LIMIT = 20;
export const USER_PRIVATE_CONTEXT_MAX_ITEM_CHARS = 200;
export const MEMORY_CAPTURE_SETTING_KEY = 'boh_ai_memory_capture_enabled_v1';
export const TREEHOLE_MEMORY_SYNC_SETTING_KEY = 'boh_ai_note_reference_enabled_v1';
export const LEGACY_TREEHOLE_MEMORY_SYNC_SETTING_KEY = 'boh_ai_treehole_sync_enabled_v1';
export const CLOUD_REFERENCE_CONSENT_KEY = 'boh_ai_cloud_reference_consent_v1';
export const QUICK_NOTE_SETTING_KEY = 'boh_ai_quick_note_enabled_v1';
export const MEMORY_CAPTURE_STATUS_TIMEOUT_MS = 12000;
export const MEMORY_CAPTURE_MIN_DIALOGUE_ITEMS = 2;
export const MEMORY_CAPTURE_MIN_USER_CHARS = 8;
export const MEMORY_CAPTURE_CONTEXT_ITEMS = 12;
export const MEMORY_NOTICE_MAX_ITEMS = 3;
export const DEGENERATE_PUNCTUATION_RATIO = 0.88;
export const DEGENERATE_REPEAT_COUNT = 36;
export const DEGENERATE_PUNCT_REPEAT_COUNT = 18;
export const DEGENERATE_STREAM_WINDOW_CHARS = 320;
export const DEGENERATE_STREAM_MIN_CHARS = 120;
export const DEGENERATE_STREAM_PUNCTUATION_RATIO = 0.92;
export const DEGENERATE_STREAM_REPEAT_COUNT = 20;
export const KNOWLEDGE_CONTEXT_MAX_CHARS = 6500;
export const KNOWLEDGE_CONTEXT_MAX_BLOCK_CHARS = 3000;
export const ACTION_DRAFT_CONTENT_MAX_CHARS = 3000;
export const ACTION_DRAFT_TITLE_MAX_CHARS = 64;
export const ACTION_DRAFT_SUBJECT_MAX_CHARS = 80;
export const QUICK_NOTE_CONTENT_MAX_CHARS = 3000;
export const QUICK_NOTE_TITLE_MAX_CHARS = 80;

export const GENERATION_PROFILE_BY_MODE = {
  auto: { temperature: 0.18, top_p: 0.7, frequency_penalty: 0.06, max_tokens: 1400 },
  fast: { temperature: 0.22, top_p: 0.74, frequency_penalty: 0.08, max_tokens: 1200 },
  think: { temperature: 0.16, top_p: 0.68, frequency_penalty: 0.05, max_tokens: 2000 },
  pro: { temperature: 0.18, top_p: 0.7, frequency_penalty: 0.06, max_tokens: 1800 }
};
export const SHOW_INTERNAL_PROGRESS_NOTES = false;
export const ACCURACY_PREFERRED_MODEL_ID = 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B';
export const AUTO_ROUTER_MODEL_ID = 'Qwen/Qwen3.5-4B';
export const RAG_PREFERRED_MODEL_ID = 'THUDM/GLM-Z1-9B-0414';
export const SILICON_EMBEDDING_MODEL_ID = 'BAAI/bge-m3';
export const SILICON_RERANK_MODEL_ID = 'netease-youdao/bce-reranker-base_v1';
export const SILICON_OCR_MODEL_IDS = ['deepseek-ai/DeepSeek-OCR', 'PaddlePaddle/PaddleOCR-VL-1.5'];
export const SILICON_SPEECH_MODEL_IDS = ['FunAudioLLM/SenseVoiceSmall', 'TeleAI/TeleSpeechASR'];
export const SILICON_IMAGE_MODEL_IDS = ['Kwai-Kolors/Kolors'];

export const BASE_SYSTEM_PROMPT = `
你是 BOH AI，是方块之家网站内的智能助手。
请遵守以下规则：
1. 先直接回答用户核心问题，再补充必要细节，避免模板化和空话。
2. 回答要自然、简洁、可执行；除非用户要求，不强制使用固定小标题。
3. 涉及网站功能时，优先给出“入口路径 + 操作步骤”。
4. 若上下文中提供了“BOH Cloud+ 私有内容/论坛帖子/记忆库/站点操作知识/当前登录用户私域数据”，优先基于这些信息回答。
5. 不确定时明确说明不确定，禁止编造。
6. 默认使用用户提问语言回答。
7. 绝对不要逐段复述“内部检索资料”原文，不要输出“操作手册/知识库全文”。
8. 操作类问题统一输出：入口路径 + 最多 ${OPERATION_MAX_STEPS} 步。
9. 涉及“我的帖子/邮件/礼物/生日/Pushplus/积分订阅”等问题时，必须以“当前登录用户”数据为准；若未登录，先提示需要登录。
10. 必须根据问题类型选择知识源：操作问题优先“站点操作知识库”；社区最新动态优先“论坛帖子”；社区历史事实优先“公共记忆库/核心记忆库”；用户复盘与情绪问题优先“BOH Cloud+ 私有内容”；账号私域问题优先“当前登录用户私域数据”。
11. 若不同知识源存在冲突，优先采用更贴近问题语义且时间更新的数据，并明确提示“存在冲突信息”。
`;

export const GIFT_STATUS_LABELS = {
  preparing: '备货中',
  processing: '处理中',
  shipped: '已寄出/可取',
  completed: '已送达'
};

export const SUBSCRIPTION_STATUS_LABELS = {
  active: '生效中',
  expired: '已过期',
  cancelled: '已取消'
};

export const USER_PRIVATE_SUMMARY_KEYWORDS = [
  '我的信息', '我的资料', '我的数据', '我的状态', '我的情况',
  '当前用户', '登录用户', '我的账户', '我的账号', '个人数据', '个人状态'
];

export const USER_PRIVATE_ALL_KEYWORDS = ['全部', '汇总', '概览', '总览', '整体', '完整'];
export const USER_PRIVATE_POST_KEYWORDS = ['我的帖子', '我发的帖子', '我的发帖', '发帖记录', '帖子记录', '论坛记录', '我发帖'];
export const USER_PRIVATE_MAIL_KEYWORDS = ['邮件', '信件', '信箱', '收件箱', '已发送', '私信', '消息'];
export const USER_PRIVATE_GIFT_KEYWORDS = ['礼物', '礼品', 'gift'];
export const USER_PRIVATE_BIRTHDAY_KEYWORDS = ['生日', '生日会', 'birthday'];
export const USER_PRIVATE_PUSHPLUS_KEYWORDS = ['pushplus', '推送', '离线推送', '微信推送'];
export const USER_PRIVATE_SUBSCRIPTION_KEYWORDS = [
  '订阅', '会员', '套餐', '积分', 'boh积分', 'boh plus', 'boh ai plus', 'boh pro', 'boh max'
];
export const USER_PRIVATE_PERSONAL_PATTERN = /(我|我的|自己|本人|当前账号|当前用户|登录用户|个人)/;

export const SHARED_MEMORY_TRIGGER_KEYWORDS = [
  '公共记忆', '共享记忆', '记忆库', '记忆', '回忆', '曾经', '以前', '之前',
  '你记得', '有记录', '有没有人提到', '有没有提过', '沉淀', '历史', '往事'
];
export const ROUTING_FORUM_REALTIME_PATTERN = /(现在|最近|最新|今天|近期|本周|本月|动态|热帖|公告|活动)/;
export const ROUTING_HISTORY_FACT_PATTERN = /(历史|回忆|曾经|之前|以前|起源|经过|发生|提到|记得|来源|细节|人物|介绍|档案)/;

export const ACTION_POST_TRIGGER_PATTERN = /(发一篇帖子|发布一条帖子|发布帖子|发个帖子|发帖子|发个帖|发帖)/;
export const ACTION_MAIL_TRIGGER_PATTERN = /(发邮件|发私信|写邮件|写信|寄信)/;

export const chatModes = [
  { id: 'auto', name: 'Auto', model: AUTO_ROUTER_MODEL_ID, description: '自动路由' },
  { id: 'fast', name: '快速', model: 'Qwen/Qwen3-8B', description: '日常问答' },
  { id: 'think', name: '思考', model: 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B', description: '深度思考' },
  { id: 'pro', name: '专业', model: 'Qwen/Qwen2.5-7B-Instruct', description: '指令执行' },
];

export const siliconModelCatalog = {
  chat: [
    { id: AUTO_ROUTER_MODEL_ID, name: 'Qwen 3.5 4B', role: 'auto-router', free: true },
    { id: 'Qwen/Qwen3-8B', name: 'Qwen 3 8B', role: 'fast-chat', free: true },
    { id: ACCURACY_PREFERRED_MODEL_ID, name: 'DeepSeek R1 0528 Qwen3 8B', role: 'reasoning', free: true },
    { id: RAG_PREFERRED_MODEL_ID, name: 'GLM Z1 9B', role: 'rag-long-context', free: true },
    { id: 'THUDM/GLM-4-9B-0414', name: 'GLM-4 9B', role: 'writing-general', free: true },
    { id: 'Qwen/Qwen2.5-7B-Instruct', name: 'Qwen 2.5 7B Instruct', role: 'pro-code-command', free: true },
    { id: 'tencent/Hunyuan-MT-7B', name: 'Hunyuan MT 7B', role: 'translation', free: true }
  ],
  embedding: [
    { id: SILICON_EMBEDDING_MODEL_ID, name: 'BGE M3', role: 'rag-embedding', free: true, url: SILICON_EMBEDDING_URL },
    { id: 'netease-youdao/bce-embedding-base_v1', name: 'BCE Embedding', role: 'rag-embedding-alt', free: true, url: SILICON_EMBEDDING_URL }
  ],
  rerank: [
    { id: SILICON_RERANK_MODEL_ID, name: 'BCE Reranker', role: 'rag-rerank', free: true, url: SILICON_RERANK_URL }
  ],
  multimodal: [
    { id: 'deepseek-ai/DeepSeek-OCR', name: 'DeepSeek OCR', role: 'ocr', free: true },
    { id: 'PaddlePaddle/PaddleOCR-VL-1.5', name: 'PaddleOCR VL 1.5', role: 'ocr-vl', free: true },
    { id: 'THUDM/GLM-4.1V-9B-Thinking', name: 'GLM-4.1V 9B Thinking', role: 'vision-reasoning', free: true },
    { id: 'FunAudioLLM/SenseVoiceSmall', name: 'SenseVoice Small', role: 'speech-to-text', free: true },
    { id: 'TeleAI/TeleSpeechASR', name: 'TeleSpeech ASR', role: 'speech-to-text', free: true },
    { id: 'Kwai-Kolors/Kolors', name: 'Kolors', role: 'image-generation', free: true }
  ]
};

export const availableModels = [
  { id: AUTO_ROUTER_MODEL_ID, name: 'Qwen 3.5 4B', provider: 'SiliconCloud', url: SILICON_CLOUD_URL, apiKey: SILICON_CLOUD_API_KEY },
  { id: 'Qwen/Qwen3-8B', name: 'Qwen 3 8B', provider: 'SiliconCloud', url: SILICON_CLOUD_URL, apiKey: SILICON_CLOUD_API_KEY },
  { id: 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B', name: 'DeepSeek R1', provider: 'SiliconCloud', url: SILICON_CLOUD_URL, apiKey: SILICON_CLOUD_API_KEY },
  { id: 'Qwen/Qwen2.5-7B-Instruct', name: 'Qwen 2.5', provider: 'SiliconCloud', url: SILICON_CLOUD_URL, apiKey: SILICON_CLOUD_API_KEY },
  { id: 'THUDM/GLM-Z1-9B-0414', name: 'GLM Z1 9B', provider: 'SiliconCloud', url: SILICON_CLOUD_URL, apiKey: SILICON_CLOUD_API_KEY },
  { id: 'THUDM/GLM-4-9B-0414', name: 'GLM-4 9B', provider: 'SiliconCloud', url: SILICON_CLOUD_URL, apiKey: SILICON_CLOUD_API_KEY },
  { id: 'tencent/Hunyuan-MT-7B', name: 'Hunyuan MT 7B', provider: 'SiliconCloud', url: SILICON_CLOUD_URL, apiKey: SILICON_CLOUD_API_KEY },
];
