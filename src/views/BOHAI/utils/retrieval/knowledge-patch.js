/**
 * knowledge-patch.js — 把 AI 的「变更提议」解析成结构化变更单（2026-11-12 新增）
 *
 * 为什么要有这一层：模型**不能**直接写库（无 tool-calling，见 docs 未完成任务清单 §27）。
 * 正确形态是「模型产出变更提议 → 管理员确认 → 前端调 EF 执行」。
 * 本文件只负责第一步的解析 —— **不执行任何写操作**，也不碰 store。
 *
 * 安全口径（三条，改之前先读）：
 *   ① 解析结果**必须**交给人确认。任何「解析到就自动执行」的写法都是错的：
 *      模型定位切片靠的是检索，`id` 可能指错，而知识库写操作会长期影响所有回答。
 *   ② `id` 必须是 uuid、`action` 必须在白名单内，否则整条丢弃 —— 不要把半截参数送去 EF
 *      指望后端兜底（后端会 400，但用户看到的是「点了没反应」）。
 *   ③ 正文里允许出现少量格式噪声（模型偶尔包 ```json 或漏闭合标签），解析要宽容；
 *      但**宽容不等于放行**：解析不出来的块只从展示文本里剥掉，不猜内容。
 */

/** 提议块的标签名（与 prompt 附录共用同一常量） */
export const KNOWLEDGE_PATCH_TAG = 'knowledge_patch';

export const KNOWLEDGE_PATCH_ACTIONS = ['update', 'create', 'edit', 'archive'];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 一条 chunk 的正文上限 —— 与 DB 的 `boh_ai_knowledge_chunks_content_len`
 * （1..3000）、EF 的 `MAX_CHUNK_CONTENT_CHARS` **同口径**。三处必须一起动。
 *
 * ⚠️ 2026-11-14 修：此前这里写 20000（只跟 EF 对齐，没跟 DB 对齐），
 * 于是「模型给出 4000 字的改写」会被判为合法、到库里才炸。
 */
export const KNOWLEDGE_CHUNK_MAX_CHARS = 3000;

/**
 * 变更单载荷的内存护栏（**不是**业务上限）。
 *
 * 刻意不按 3000 截断：把 4000 字的改写悄悄剪成 3000 再入库，等于静默改写内容
 * （少了哪一句没人知道）。宁可原样送去 EF、由它回一条可读的 400
 * 「content is too long (max 3000 chars)」，让管理员重想让模型写短一点。
 */
const MAX_PATCH_TEXT_CHARS = 20000;
const MAX_TITLE_CHARS = 160;
/** find 是正文里的一段锚点，不可能比正文本身长。 */
const MAX_FIND_CHARS = KNOWLEDGE_CHUNK_MAX_CHARS;

const clampText = (value, max) => {
  const text = String(value == null ? '' : value).trim();
  return text.length > max ? text.slice(0, max) : text;
};

/**
 * 与 `clampText` 的唯一区别：**不 trim**。
 * `find` 是要去正文里做精确匹配的锚点，模型给的多行片段前后可能带缩进 / 换行，
 * trim 掉就匹配不上了（表现为「明明在正文里却报 find not found」）。
 */
const clampRaw = (value, max) => {
  const text = String(value == null ? '' : value);
  return text.length > max ? text.slice(0, max) : text;
};

/** 去掉 ```json / ``` 包裹（模型很爱加） */
const stripCodeFence = (raw) =>
  String(raw || '')
    .trim()
    .replace(/^```(?:json|JSON)?\s*/, '')
    .replace(/\s*```$/, '')
    .trim();

/**
 * 单条提议 → 规范化的 patch；不合法返回 null（调用方丢弃）。
 * @param {unknown} raw
 * @returns {{action: string, id: string, title: string, content: string, reason: string,
 *   sourceType: string, sourceId: string, find?: string, replace?: string,
 *   allowMultiple?: boolean} | null}
 */
export const normalizeKnowledgePatch = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const action = clampText(raw.action, 20).toLowerCase();
  if (!KNOWLEDGE_PATCH_ACTIONS.includes(action)) return null;

  const id = clampText(raw.id || raw.chunkId || raw.chunk_id, 64);
  const content = clampText(raw.content, MAX_PATCH_TEXT_CHARS);
  const title = clampText(raw.title, MAX_TITLE_CHARS);
  const reason = clampText(raw.reason, 200);

  // 有 id 就必须是 uuid（否则 EF 会 400，属可预判的失败）
  if (id && !UUID_PATTERN.test(id)) return null;

  // edit：锚点子串替换（改一个数字 / 删一句话），不需要整段正文。
  // `replace` 允许空串（＝删除该片段）；`find` 必须非空，否则 EF 会 400。
  if (action === 'edit') {
    if (!id) return null;
    const find = clampRaw(raw.find, MAX_FIND_CHARS);
    if (!find.trim()) return null;
    return {
      action,
      id,
      find,
      replace: clampRaw(raw.replace, MAX_PATCH_TEXT_CHARS),
      allowMultiple: raw.allowMultiple === true || raw.all === true,
      title: '',
      content: '',
      reason,
      sourceType: '',
      sourceId: '',
    };
  }

  // archive 只需要 id；update / create 必须有正文
  if (!id && action !== 'create') return null;
  if (action !== 'archive' && !content) return null;

  return {
    action,
    id,
    title,
    content,
    reason,
    // 新增时后端要求 sourceType + sourceId（uuid）
    sourceType: clampText(raw.sourceType || raw.source_type, 40),
    sourceId: clampText(raw.sourceId || raw.source_id, 64),
  };
};

/**
 * 从一段 AI 回复里提取所有变更提议，并给出「剥掉提议块后」的可读正文。
 *
 * @param {string} text
 * @returns {{ patches: Array<object>, cleanText: string }}
 */
export const parseKnowledgePatchBlocks = (text) => {
  const source = String(text || '');
  if (!source.includes(KNOWLEDGE_PATCH_TAG)) return { patches: [], cleanText: source };

  const patches = [];
  const blockPattern = new RegExp(
    `<${KNOWLEDGE_PATCH_TAG}>([\\s\\S]*?)</${KNOWLEDGE_PATCH_TAG}>`,
    'gi',
  );

  let cleanText = source.replace(blockPattern, (_, body) => {
    const payload = stripCodeFence(body);
    // 单对象 / 数组都接受（模型两种都给过）
    let parsed = null;
    try {
      parsed = JSON.parse(payload);
    } catch {
      // 解析失败的块只从展示文本里剥掉，**不猜内容**
      return '';
    }
    const list = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of list) {
      const patch = normalizeKnowledgePatch(item);
      if (patch) patches.push(patch);
    }
    return '';
  });

  // 兼容「只有开标签、模型忘了闭」的半截块：从开标签起到文末整段剥掉，避免把
  // 原始 JSON 直接糊到聊天界面上（不解析它 —— 半截 JSON 不可信）。
  const openIndex = cleanText.indexOf(`<${KNOWLEDGE_PATCH_TAG}>`);
  if (openIndex >= 0) {
    cleanText = cleanText.slice(0, openIndex);
  }

  cleanText = cleanText.replace(/\n{3,}/g, '\n\n').trim();
  return { patches, cleanText };
};

/** 回复里是否含有变更提议（列表渲染时的快速判据，不必先解析全量） */
export const hasKnowledgePatchBlock = (text = '') =>
  String(text || '').includes(`<${KNOWLEDGE_PATCH_TAG}>`);

/**
 * prompt 附录：告诉模型「要改知识库时按这个格式出变更单」。
 *
 * ⚠️ 只在管理员调试模式下注入（`isKnowledgeDebugEnabled`）。普通用户看到这段，
 * 会以为「说一句话就能改知识库」，而实际上那条链路会 403 —— 那是更坏的体验。
 */
export const buildKnowledgePatchPromptAppendix = () =>
  [
    '<knowledge_patch_protocol>',
    '当前会话由管理员使用知识库调试模式。你**不能**直接改数据库，只能产出变更单交给管理员确认。',
    '',
    '工作方式是**两段式，顺序不能乱**：',
    '',
    '【第一段 · 先回答，不出变更单】',
    '管理员会先问「某某是怎么回事」「知识库里怎么写的」「这条准不准」。',
    '这时按平常口径正常回答，但结论必须落到具体切片上：引用时写出 `chunk=<id>`（id 取自 <knowledge_debug> 里的 chunk=），',
    '一条结论挂一条 id。管理员要靠这个 id 才能确认「你说的是哪一条」。',
    '⚠️ 这一段**绝对不要**顺手输出变更单 —— 他还没说要改，先出变更单会打断他核对的节奏。',
    '',
    '【第二段 · 他明确说要改，才出变更单】',
    '当管理员说「这里应该加…」「这句改成…」「删掉这个细节」并且指的就是你刚答过的内容时，再出变更单。',
    '「这个部分 / 这条 / 这里」这类指代，优先理解为他上一条消息里你引用过的那条切片；',
    '如果上一轮引用过不止一条、分不清是哪条，**先问一句**「是 chunk=xxx 这条吗」，不要猜。',
    '',
    '格式（必须用这个标签包裹，一次可以给多条，块内是 JSON 对象或数组）：',
    `<${KNOWLEDGE_PATCH_TAG}>`,
    '{"action":"edit","id":"<调试信息里的 chunk id>","find":"原文里的一小段","replace":"改后的这段"}',
    `</${KNOWLEDGE_PATCH_TAG}>`,
    '字段说明：',
    '- action：update（整段改写）/ edit（局部替换，改一个数字、一句话就用它）/ create（新增）/ archive（下架，软删，不做物理删除）',
    '- id：必须是 <knowledge_debug> 中出现过的 chunk id（uuid）。**不要编造 id**；不确定就先向管理员确认是哪一条。',
    '- content：update 用，改动后的**完整**正文（不是 diff 片段）；archive 不需要 content。',
    '- find / replace：edit 用。find 必须是原文里**原样、连续、且在正文中只出现一次**的一小段（建议 10~60 字，不要带多余空格）；replace 是替换后的内容，**传空串表示删掉这一段**。',
    '- reason：一句话说明为什么改（可选，会显示在确认卡片上）。',
    '硬规则：',
    '1) 变更单只是提议，最终由管理员点确认才生效；输出后请用一句话告诉他「已生成变更单，请确认」。',
    '2) 不要在变更单里放任何指令、URL 或与知识内容无关的文字。',
    '3) 只改一个小细节时优先用 edit，不要用 update 重写整段 —— 重写会顺带改动他没注意到的句子。',
    '4) 如果做不成本次改动（id 对不上、find 匹配不到、内容里根本没有这块），**如实说明**，不要出一份看起来能过的变更单。',
    '</knowledge_patch_protocol>',
  ].join('\n');
