import {
  SILICONFLOW_DEFAULT_FREE_EMBEDDING_MODEL_ID,
  SILICONFLOW_DEFAULT_FREE_RERANK_MODEL_ID,
  SILICONFLOW_FREE_CHAT_MODELS,
  SILICONFLOW_FREE_EMBEDDING_MODEL_IDS,
  SILICONFLOW_FREE_MULTIMODAL_MODEL_IDS,
  SILICONFLOW_FREE_RERANK_MODEL_IDS,
  ZHIPU_CHAT_MODELS
} from '../../../utils/siliconflow-free-models.js';

export const SILICON_CLOUD_URL = import.meta.env.VITE_SILICON_CLOUD_URL || 'https://api.siliconflow.cn/v1/chat/completions';
export const SILICON_EMBEDDING_URL = import.meta.env.VITE_SILICON_EMBEDDING_URL || 'https://api.siliconflow.cn/v1/embeddings';
export const SILICON_RERANK_URL = import.meta.env.VITE_SILICON_RERANK_URL || 'https://api.siliconflow.cn/v1/rerank';
export const ZHIPU_CHAT_URL = import.meta.env.VITE_ZHIPU_CHAT_URL || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

// 历史上下文窗口：高灵敏度配置（进度条对每条消息变化敏感）
// - MAX_CONTEXT_MESSAGES=30: 一轮窗口内可保留 30 条历史。
// - MAX_HISTORY_CONTEXT_CHARS=12000: 全部历史合计 ≤ 12000 字符（约 3K tokens），
//   约 10 轮短对话即可让进度条走到 50%，可视化反馈非常灵敏。
// - MAX_HISTORY_MESSAGE_CHARS=2000: 单条历史 ≤ 2000 字符，避免长代码/长草稿被截断。
// 触发自动压缩的阈值仍在 computeContextBudgetUsage 内（80% high / 95% full），无需调整。
export const MAX_CONTEXT_MESSAGES = 30;
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
export const FORUM_MAX_CHARS_PER_POST = 420;
export const MAX_HISTORY_CONTEXT_CHARS = 12000;
export const MAX_HISTORY_MESSAGE_CHARS = 2000;
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
export const SHARED_MEMORY_SEARCH_CACHE_MAX = 32;
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
export const RESPONSE_STYLE_SETTING_KEY = 'boh_ai_response_style_v1';
export const PLAN_MODE_SETTING_KEY = 'boh_ai_plan_mode_enabled_v1';
export const SHARED_MEMORY_SETTING_KEY = 'boh_ai_shared_memory_enabled_v1';
export const KNOWLEDGE_BASE_SETTING_KEY = 'boh_ai_knowledge_base_enabled_v1';
export const MEMORY_CAPTURE_STATUS_TIMEOUT_MS = 12000;
export const MEMORY_CAPTURE_MIN_DIALOGUE_ITEMS = 2;
export const MEMORY_CAPTURE_MIN_USER_CHARS = 8;
export const MEMORY_CAPTURE_CONTEXT_ITEMS = 12;
export const MEMORY_NOTICE_MAX_ITEMS = 3;
export const DEGENERATE_PUNCTUATION_RATIO = 0.95;
export const DEGENERATE_REPEAT_COUNT = 20;
export const DEGENERATE_PUNCT_REPEAT_COUNT = 12;
export const DEGENERATE_STREAM_WINDOW_CHARS = 320;
export const DEGENERATE_STREAM_MIN_CHARS = 120;
export const DEGENERATE_STREAM_PUNCTUATION_RATIO = 0.97;
export const DEGENERATE_STREAM_REPEAT_COUNT = 30;
export const KNOWLEDGE_CONTEXT_MAX_CHARS = 6500;
export const KNOWLEDGE_CONTEXT_MAX_BLOCK_CHARS = 3000;
export const ACTION_DRAFT_CONTENT_MAX_CHARS = 3000;
export const ACTION_DRAFT_TITLE_MAX_CHARS = 64;
export const QUICK_NOTE_CONTENT_MAX_CHARS = 3000;
export const QUICK_NOTE_TITLE_MAX_CHARS = 80;

// 模式 → 生成参数（仅作用于 5 个真实模式；auto 已在 2026-06-08 移除）。
export const GENERATION_PROFILE_BY_MODE = {
  fast: { temperature: 0.22, top_p: 0.74, frequency_penalty: 0.08, max_tokens: 1200 },
  pro: { temperature: 0.18, top_p: 0.7, frequency_penalty: 0.06, max_tokens: 1800 },
  multimodal: { temperature: 0.2, top_p: 0.75, frequency_penalty: 0.06, max_tokens: 1800 },
  plan: { temperature: 0.08, top_p: 0.55, frequency_penalty: 0.04, max_tokens: 2400 },
  'agent-cluster': { temperature: 0.18, top_p: 0.7, frequency_penalty: 0.06, max_tokens: 1600 },
  'glm-47-flash': { temperature: 0.2, top_p: 0.75, frequency_penalty: 0.06, max_tokens: 2400 },
  'glm-46v-flash': { temperature: 0.2, top_p: 0.75, frequency_penalty: 0.06, max_tokens: 1800 }
};
export const SHOW_INTERNAL_PROGRESS_NOTES = false;

// 4 模式专属基线模型（2026-06-08 重新定义，语义完全重新对齐）：
//   - FAST_NEX_MODEL_ID:     Fast 模式"极速响应"基线，Nex-N2-Pro 轻量通用
//   - PRO_QWEN_MODEL_ID:     Pro 模式"质量"基线，Qwen3-8B 旗舰通用
//   - PLAN_DEEPSEEK_MODEL_ID: Plan 模式"超级高质量"，DeepSeek-R1 推理
//   - AGENT_BASE_MODEL_ID:   Agent 模式多 worker 共享基模，Qwen3-8B
// 4 个模型都是"固定"映射,不再做"复杂/简单"二级判断。
export const FAST_NEX_MODEL_ID = 'nex-agi/Nex-N2-Pro';
export const PRO_QWEN_MODEL_ID = 'Qwen/Qwen3-8B';
export const PLAN_DEEPSEEK_MODEL_ID = 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B';
export const AGENT_BASE_MODEL_ID = 'Qwen/Qwen3-8B';
export const GLM47_FLASH_MODEL_ID = 'glm-4.7-flash';
export const GLM46V_FLASH_MODEL_ID = 'glm-4.6v-flash';

// 兼容旧命名（auto 路径已下线，但部分测试与子模块仍 import 这些常量）。
// AUTO_ROUTER_MODEL_ID → Fast 模式基线（让 AUTO 旧行为退化为 Fast）。
// AUTO_PRIMARY_MODEL_ID → Pro 模式基线。
// ACCURACY_PREFERRED_MODEL_ID → Plan 模式基线。
// PRO_DEEPSEEK_MODEL_ID → 仍指向 DeepSeek-R1,保留兼容。
export const AUTO_ROUTER_MODEL_ID = FAST_NEX_MODEL_ID;
export const AUTO_PRIMARY_MODEL_ID = PRO_QWEN_MODEL_ID;
export const ACCURACY_PREFERRED_MODEL_ID = PLAN_DEEPSEEK_MODEL_ID;
export const PRO_DEEPSEEK_MODEL_ID = 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B';
export const RAG_PREFERRED_MODEL_ID = 'THUDM/GLM-Z1-9B-0414';
// 集中管理 Agent 默认模型 ID，避免在多个 worker / orchestrator / synthesizer 内硬编码导致 drift。
// 修改这里即可同步到 Retriever / Ops / Memory / Orchestrator / Synthesizer。
export const AGENT_DEFAULT_MODEL_IDS = Object.freeze({
  retriever: 'Qwen/Qwen3-8B',
  ops: 'Qwen/Qwen2.5-7B-Instruct',
  memory: 'Qwen/Qwen3-8B',
  chatEngine: 'Qwen/Qwen3-8B',
  orchestrator: AUTO_ROUTER_MODEL_ID,
  synthesizer: 'Qwen/Qwen3-8B'
});
export const AGENT_RETRIEVER_DEFAULT_MODEL_ID = AGENT_DEFAULT_MODEL_IDS.retriever;
export const AGENT_OPS_DEFAULT_MODEL_ID = AGENT_DEFAULT_MODEL_IDS.ops;
export const AGENT_MEMORY_DEFAULT_MODEL_ID = AGENT_DEFAULT_MODEL_IDS.memory;
export const AGENT_CHAT_ENGINE_DEFAULT_MODEL_ID = AGENT_DEFAULT_MODEL_IDS.chatEngine;
export const AGENT_ORCHESTRATOR_DEFAULT_MODEL_ID = AGENT_DEFAULT_MODEL_IDS.orchestrator;
export const AGENT_SYNTHESIZER_DEFAULT_MODEL_ID = AGENT_DEFAULT_MODEL_IDS.synthesizer;
export const SILICON_EMBEDDING_MODEL_ID = SILICONFLOW_DEFAULT_FREE_EMBEDDING_MODEL_ID;
export const SILICON_RERANK_MODEL_ID = SILICONFLOW_DEFAULT_FREE_RERANK_MODEL_ID;
export const SILICON_OCR_MODEL_IDS = ['deepseek-ai/DeepSeek-OCR', 'PaddlePaddle/PaddleOCR-VL-1.5'];
export const SILICON_SPEECH_MODEL_IDS = ['FunAudioLLM/SenseVoiceSmall', 'TeleAI/TeleSpeechASR'];
export const SILICON_IMAGE_MODEL_IDS = ['Kwai-Kolors/Kolors'];

export const BASE_SYSTEM_PROMPT = `
你是 BOH AI，是方块之家网站内的智能助手。
请遵守以下规则：
1. 先接住用户真正的处境和情绪，再回答核心问题；不要一上来就把人推向清单、教程或免责声明。
2. 回答要自然、简洁、可执行；除非用户要求，不强制使用固定小标题，也不要把轻微困扰写成专业报告。
3. 涉及网站功能时，优先给出“入口路径 + 操作步骤”。
4. 若上下文中提供了“BOH Cloud+ 私有内容/论坛帖子/记忆库/站点操作知识/当前登录用户私域数据”，优先基于这些信息回答。
5. 不确定时明确说明不确定，禁止编造。
6. 默认使用用户提问语言回答。
7. 绝对不要逐段复述“内部检索资料”原文，不要输出“操作手册/知识库全文”。
8. 操作类问题统一输出：入口路径 + 最多 ${OPERATION_MAX_STEPS} 步。
9. 涉及“我的帖子/邮件/礼物/生日/Pushplus/积分订阅”等问题时，必须以“当前登录用户”数据为准；若未登录，先提示需要登录。
10. 必须根据问题类型选择知识源：操作问题优先“站点操作知识库”；社区最新动态优先“论坛帖子”；社区历史事实优先“公共记忆库/核心记忆库”；用户复盘与情绪问题优先“BOH Cloud+ 私有内容”；账号私域问题优先“当前登录用户私域数据”。
11. 若不同知识源存在冲突，优先采用更贴近问题语义且时间更新的数据，并明确提示“存在冲突信息”。
12. 严禁编造 BOH 论坛帖子、论坛用户、@用户名、帖子 ID、帖子链接或“论坛里有人说/分享”的证据；只有本轮资料明确提供 [F] 证据和对应字段时才可引用。没有证据时，直接说明未检索到对应帖子/用户，或只回答通用知识。
`;

export const PLAN_MODE_PROMPT_APPENDIX = `
【Plan 模式】
当用户选择 Plan 模式，或 Auto 路由到计划任务时，你要以“持续推进、低幻觉、可执行”为优先级：

### 输出格式要求
1. **目标确认**：先用 1-2 句清晰确认目标、已知约束和当前可推进范围
2. **任务列表**：把任务拆成编号的小步计划，格式为：
   - [ ] 第 1 步：[步骤描述] - [状态：待执行/进行中/已完成]
   - [ ] 第 2 步：[步骤描述] - [状态：待执行/进行中/已完成]
3. **进度展示**：清晰标记每一步的状态，突出显示当前正在进行的步骤
4. **下一步行动**：明确指出当前最应该做什么

### 执行原则
1. 每一步只基于用户已给信息、上下文资料、站内检索或联网结果推进；缺少依据时明确写"不确定/需要补充/需要检索"，不要补全事实
2. 区分"事实依据"和"推断建议"；涉及数据、路径、人物、时间、政策、版本、价格等容易变化的信息时必须说明来源或提示需要检索
3. 如果用户要长期推进，回答结尾给出明确的"下一步行动"，并保留可继续接力的上下文
4. 不要为了显得完整而编造进度、结果、表格字段、文件路径、用户数据或外部事实
5. 用对话的方式展示执行过程，让用户清晰看到每一步的进展

### 示例输出
> 📋 **目标确认**：帮你规划一次社区活动策划
> 
> 📝 **任务列表**：
> - [x] 第 1 步：确定活动主题和目标 - 已完成
> - [ ] 第 2 步：制定活动时间和地点方案 - 进行中 ← 当前
> - [ ] 第 3 步：准备活动内容和流程 - 待执行
> - [ ] 第 4 步：发布活动通知 - 待执行
> 
> 🎯 **下一步行动**：请提供你期望的活动时间范围，我来帮你制定具体的时间方案
`;

export const PAGE_CREATION_PROMPT_APPENDIX = `
【网页创建任务】
当用户要求创建/生成/设计网页页面时:

### 响应策略
1. 先确认用户想要的页面类型（首页、活动页、展示页、公告页等）和核心内容
2. 如果用户描述不够清晰，先提出 1-2 个关键问题（如色调偏好、内容要点）再生成
3. 生成完整、可直接运行的 HTML 代码，包含内联 CSS 样式
4. 代码必须是独立的 HTML 片段（不含 <html>/<head>/<body> 等外层标签）
5. 样式使用内联 <style> 标签，用现代 CSS（flexbox/grid/渐变/圆角等）
6. 优先使用 BOH Creator Studio 预览样式：
   - 字体：Inter, -apple-system, sans-serif
   - 主色：#1459d9（蓝色）
   - 背景：#f7f8fb 或渐变
   - 暗色文字：#111827
   - 次要文字：#4b5563
7. 生成结束后提示用户可以通过"发送到创作工作台"进一步编辑

### 输出格式
\`\`\`html
<section class="hero">
  <!-- 内容 -->
</section>
<style>
  /* 样式 */
</style>
\`\`\`
`;

export const RESPONSE_STYLE_OPTIONS = [
  {
    id: 'default',
    name: '默认',
    shortName: '默认',
    promptAppendix: `
【回答风格：默认】
1. 像一个可靠、自然的朋友兼助手：先回应用户话里的真实需求和情绪，再给答案。
2. 少用模板腔、客服腔和“建议如下”式长清单；能用两三段说清时，就用自然短段落。
3. 给建议要有取舍和轻重缓急，优先给一个最值得先做的小动作。
4. 可以有一点温度和个人感，但不要夸张、油腻或过度安慰。
`
  },
  {
    id: 'socratic',
    name: '苏格拉底',
    shortName: '苏格拉底',
    promptAppendix: `
【回答风格：苏格拉底】
1. 像一个耐心的思辨伙伴：先复述你理解到的核心矛盾，再指出一个关键判断角度。
2. 不要连续审问用户；每次最多提出 1-2 个真正能推动思考的问题。
3. 问题要具体、贴着用户处境，例如“你更怕失去什么？”而不是泛泛地问“你的目标是什么？”。
4. 可以给出暂时性的判断，但要把判断背后的前提摊开，让用户感觉自己也在参与推理。
5. 操作类问题仍优先给步骤；不要为了保持人格而故意绕弯。
`
  },
  {
    id: 'psychologist',
    name: '心理专家',
    shortName: '心理',
    promptAppendix: `
【回答风格：心理专家】
1. 像一个稳定、细心、有边界感的陪伴者：先说出你听见了什么，让用户感觉不是被分析，而是被理解。
2. 先承接，再慢慢整理；不要急着下定义、贴标签、给训练计划。
3. 建议要轻、少、可持续，优先给用户当下能做到的一小步，而不是一整套“自我管理方案”。
4. 区分“我能理解你可能会……”和“你就是……”；避免诊断式标签和绝对化判断。
5. 只有出现明确高风险、持续严重症状或用户询问诊断/治疗/用药时，才温和建议寻求专业帮助。
6. 结尾优先轻轻追问一个小问题，给用户继续说的空间。
`
  },
  {
    id: 'crisp',
    name: '高冷干练',
    shortName: '干练',
    promptAppendix: `
【回答风格：高冷干练】
1. 像一个冷静、靠谱、话不多的专业搭档：少铺垫，先给结论。
2. 语言短、准、有分量；删掉客套、重复解释和过度情绪安抚。
3. 保留必要的人味：可以简短承认用户处境，例如“这确实烦”，但马上进入判断或行动。
4. 优先输出结论、关键风险、下一步；能一句说清就不要扩写。
5. 保持礼貌，不讽刺、不居高临下，不把“高冷”写成冷漠。
`
  }
];

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
export const USER_PRIVATE_MAIL_KEYWORDS = [];
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

export const ACTION_POST_TRIGGER_PATTERN = /(发帖|发个帖|发(?:一条|一篇|个)?.{0,8}帖子|发布.{0,8}帖子|论坛发帖|论坛发布|论坛发布文案|起草.{0,12}(论坛|社区|帖子|发布文案)|写.{0,12}(论坛|社区|帖子|发布文案)|生成.{0,12}(论坛|社区|帖子|发布文案)|整理.{0,12}(论坛|社区|帖子|发布文案))/;

// 模式 ID 常量（2026-06-08 重新对齐产品语义）：
//   - Fast   = 极速响应
//   - Pro    = 质量（Qwen 旗舰通用）
//   - Plan   = 超级高质量（DeepSeek-R1 推理）
//   - Agent  = 工作（多 worker 集群）
//   - auto   = 历史保留，运行时已不再使用；新会话默认走 'fast'。
export const BOH_DEFAULT_MODE_ID = 'fast';
export const BOH_AUTO_MODE_ID = 'auto';

// 4 模式模型分配（基于 2026-06-08 全部 10 个免费模型健康检查）：
//
//   ┌────────────┬──────────────────────────────────────────┬──────────────────┐
//   │ 模式       │ 模型                                     │ 实测延迟         │
//   ├────────────┼──────────────────────────────────────────┼──────────────────┤
//   │ Fast       │ nex-agi/Nex-N2-Pro（轻量通用）            │ TBD 健康检查后填  │
//   │ Pro        │ Qwen/Qwen3-8B（旗舰通用）                │ ~11.5s(冷启)     │
//   │ Plan       │ deepseek-ai/DeepSeek-R1-0528-Qwen3-8B    │ ~6.8s            │
//   │ Agent      │ Qwen/Qwen3-8B（worker 共享基模）          │ ~11.5s(冷启)     │
//   └────────────┴──────────────────────────────────────────┴──────────────────┘
//
// 设计要点：
//   - 选 Fast = 选 Nex-N2-Pro（轻量）；后续若改 Nex 不稳可一键替换基线。
//   - 选 Pro = 选 Qwen3-8B，固定不切换；用户主动选 Pro 即明确"我要 Qwen 旗舰质量"。
//   - 选 Plan = 固定 DeepSeek-R1 + 温度 0.08，确保规划任务稳定。
//   - 选 Agent = 多 worker 共享 Qwen3-8B，指令一致性优先。
//   - 4 模式之间没有"自动切换"；用户主动选择什么就走什么。
//   - AUTO 模式已在 2026-06-08 移除（语义混淆：用户选 AUTO 期望"系统选最优"，实际是"系统选最快"）。
//
// 已移除的旧模型: Qwen3.5-4B(30s/90s 超时)、DeepSeek-R1-Distill-Qwen-7B(403)、
//   InternLM 2.5 7B(403)、GLM-4-9B(AUTO 路由用,AUTO 下线后不再用)。
export const chatModes = [
  {
    id: 'fast',
    name: 'Fast',
    tagline: '极速响应',
    description: '轻量模型，秒回',
    icon: 'zap',
    model: FAST_NEX_MODEL_ID
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: '质量',
    description: 'Qwen 旗舰通用',
    icon: 'sparkles',
    model: PRO_QWEN_MODEL_ID
  },
  {
    id: 'multimodal',
    name: '多模态',
    tagline: '图片/视频/文件',
    description: 'GLM 4.6V Flash',
    icon: 'image',
    model: GLM46V_FLASH_MODEL_ID
  },
  {
    id: 'plan',
    name: 'Plan',
    tagline: '超级高质量',
    description: '分步推进，深度推理',
    icon: 'list-checks',
    model: PLAN_DEEPSEEK_MODEL_ID
  },
  {
    id: 'agent-cluster',
    name: 'Agent',
    tagline: '工作',
    description: '多 Agent 并行',
    icon: 'users',
    model: AGENT_BASE_MODEL_ID
  }
];

// 兼容旧 export（旧 AUTO 路径依赖此函数；保留以避免破坏子模块 import）。
// 注意：auto 模式运行时已不再使用，仅供遗留 import 不报错。
export const resolveAutoModel = () => FAST_NEX_MODEL_ID;
export const resolveProModel = () => PRO_QWEN_MODEL_ID;

export const siliconModelCatalog = {
  chat: SILICONFLOW_FREE_CHAT_MODELS.map((model) => ({ ...model, role: 'free-chat', free: true })),
  zhipu: ZHIPU_CHAT_MODELS.map((model) => ({ ...model, role: 'zhipu-chat', free: true })),
  embedding: [
    { id: SILICON_EMBEDDING_MODEL_ID, name: 'BGE M3', role: 'rag-embedding', free: true, url: SILICON_EMBEDDING_URL },
    { id: 'netease-youdao/bce-embedding-base_v1', name: 'BCE Embedding', role: 'rag-embedding-alt', free: true, url: SILICON_EMBEDDING_URL }
  ],
  rerank: [
    { id: SILICON_RERANK_MODEL_ID, name: 'BCE Reranker', role: 'rag-rerank', free: true, url: SILICON_RERANK_URL },
    { id: 'BAAI/bge-reranker-v2-m3', name: 'BGE Reranker v2 M3', role: 'rag-rerank-alt', free: true, url: SILICON_RERANK_URL }
  ],
  multimodal: [
    { id: 'deepseek-ai/DeepSeek-OCR', name: 'DeepSeek OCR', role: 'ocr', free: true },
    { id: 'PaddlePaddle/PaddleOCR-VL-1.5', name: 'PaddleOCR VL 1.5', role: 'ocr-vl', free: true },
    { id: 'FunAudioLLM/SenseVoiceSmall', name: 'SenseVoice Small', role: 'speech-to-text', free: true },
    { id: 'TeleAI/TeleSpeechASR', name: 'TeleSpeech ASR', role: 'speech-to-text', free: true },
    { id: 'Kwai-Kolors/Kolors', name: 'Kolors', role: 'image-generation', free: true }
  ]
};

export const availableModels = [
  ...SILICONFLOW_FREE_CHAT_MODELS.map((model) => ({
    id: model.id,
    name: model.name,
    provider: 'SiliconCloud',
    providerKey: 'siliconflow',
    url: SILICON_CLOUD_URL,
    apiKey: ''
  })),
  ...ZHIPU_CHAT_MODELS.map((model) => ({
    id: model.id,
    name: model.name,
    provider: 'ZhipuAI',
    providerKey: 'zhipu',
    url: ZHIPU_CHAT_URL,
    apiKey: ''
  }))
];

export const allowedFreeSiliconModelIds = Object.freeze([
  ...SILICONFLOW_FREE_CHAT_MODELS.map((model) => model.id),
  ...ZHIPU_CHAT_MODELS.map((model) => model.id),
  ...SILICONFLOW_FREE_EMBEDDING_MODEL_IDS,
  ...SILICONFLOW_FREE_RERANK_MODEL_IDS,
  ...SILICONFLOW_FREE_MULTIMODAL_MODEL_IDS
]);
