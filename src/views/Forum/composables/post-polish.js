/**
 * post-polish.js —— 发帖编辑器的「智能整理」纯函数层（提示词构建 + 结果解析）
 *
 * 定位：只回答两个问题 —— ① 该给模型看什么；② 模型吐回来的东西怎么变成
 * { title, content }。**零副作用、零网络**，所以能直接单测（见
 * `tests/unit/forum-post-polish.test.js`）。真正的调用与状态机在
 * `useForumPostPolish.js`。
 *
 * ── 为什么不做成「岛」（2026-10-25 用户口径）──────────────────────────
 * 发帖是一个**全屏独占**的写作场景（竖屏 `.mobile-composer-overlay` 的
 * z-index 是 100000，见 `styles/replies-responsive.css:529`），而 AI 岛的宿主
 * 挂在导航栏里（z-index 9999）。岛在这个场景下既看不见、也不该抢焦点。
 * 结论：整理能力做成编辑器**内置**的一步，生成时在字上跑流光，落点后
 * 直接写回并给「撤销」，不经过岛。
 *
 * ── 为什么可以直接替换（2026-10-26 定稿）──────────────────────────────
 * 用户的正文是他自己的东西，模型结果仍然必须可回退。现行交互把安全网从
 * 「先预览」换成了「可撤销」：发起请求前拍原文快照，落点后直接写回
 * `newPost`，状态行提供撤销入口。撤销链是否可靠由 `useForumPostPolish`
 * 的原文快照与 `tests/unit/forum-post-polish.test.js` 守住。
 */
import { FORUM_POST_TITLE_MAX_LENGTH } from '../forum-config.js';

/**
 * 送去整理的正文上限（字符）。
 *
 * ⚠️ 这个数字被**服务端的输出上限**反推出来，不是拍脑袋：
 *   调用链是 `callBohAIModel` → EF `runtime-chat`，而 EF 的
 *   `buildRuntimePayload()`（`supabase/functions/api-key-vault/index.ts:2129`）
 *   会用**服务端 policy** 覆盖客户端传的 `max_tokens / temperature / top_p`
 *   ⇒ 客户端写的采样参数**一律不生效**，能产出多少 token 完全由 `mode` 那一行
 *   配置决定。不传 mode 时 EF 落到 `fast`（该行 `max_tokens = 1200`）。
 *
 *   整理任务的输出长度约等于输入长度，中文 1 字 ≈ 1 token，故留出约 1/4 余量
 *   ⇒ 900。超过这个长度的正文**禁用按钮并说明原因**，而不是静默截断：
 *   截断后整段替换会丢掉后半截，那比不给整理更糟。
 */
export const POST_POLISH_MAX_INPUT_CHARS = 900;

/**
 * 送去整理时，标题的截断长度。
 *
 * 与编辑器标题框的 `FORUM_POST_TITLE_MAX_LENGTH` **同一个真源**
 * （`../forum-config.js`）—— 这里做 re-export，不在本文件写第二份 50。
 */
export const POST_POLISH_MAX_TITLE_CHARS = FORUM_POST_TITLE_MAX_LENGTH;

/** 正文送来时为空、但标题非空，算不算「有东西可整理」——判据收敛在这一个函数。 */
export const hasPolishableText = ({ title = '', content = '' } = {}) =>
  Boolean(String(content || '').trim() || String(title || '').trim());

/**
 * 组装送给模型的 messages。
 *
 * 设计取舍：
 * - **要求 JSON 输出**，而不是「标题：/ 正文：」这种分栏文本。后者在正文里
 *   出现「标题：」这种字样时会解析错位（`post-draft.js` 那套 label 解析就吃过
 *   这个亏，所以才配了 `extractFieldUntilNextLabel` 这类防御）。
 * - **明确禁止增删事实**。整理 ≠ 创作：模型只许改措辞、断句、分段、顺序，
 *   不许补「我猜你想说」。这条与 `shared-rules.js` 的 NO_FABRICATION_RULE
 *   同一个意思，但这里是写作用途，不说「不确定就说不确定」，而是说
 *   「不要新增原文没有的信息」。
 * - **不传 temperature / max_tokens**：传了也会被 EF 覆盖（见上面
 *   POST_POLISH_MAX_INPUT_CHARS 的说明），传了只会让下一个人以为它有用。
 *
 * @param {{ title?: string, content?: string }} draft
 * @returns {Array<{ role: 'system'|'user', content: string }>}
 */
export const buildPolishMessages = ({ title = '', content = '' } = {}) => {
  const safeTitle = String(title || '')
    .trim()
    .slice(0, POST_POLISH_MAX_TITLE_CHARS);
  const safeContent = String(content || '')
    .trim()
    .slice(0, POST_POLISH_MAX_INPUT_CHARS);

  const systemPrompt = [
    '<role>',
    '你是方块之家社区的发帖编辑，擅长把作者已经写好的草稿改得更清楚、更自然、更好读。',
    '你的工作是“润色与重组”，不是替作者重新创作，也不是只做错别字修正。',
    '</role>',
    '<goal>',
    '- 让读者第一眼知道这篇帖子在说什么，读下去不费力',
    '- 在不改变作者原意的前提下，提升标题的信息量、开头的抓力、段落的节奏与句子之间的衔接',
    '- 删掉重复、口头禅式的填充和明显的语病，但保留作者自己的表达习惯',
    '</goal>',
    '<constraints>',
    '- 必须保留原文的事实、观点、数字、人名、时间、地点与因果关系；不得新增原文没有的信息',
    '- 不得删除原文里存在的信息点；可以把同一信息合并成更顺的句子，但不能让它消失',
    '- 保持作者原本的语气、人称与情绪强度，不要改成客服腔、论文腔或营销腔',
    '- 标题要具体、有信息量；原文标题空泛时，从正文提炼，不要用“分享”“记录一下”这类空标题',
    '- 正文按语义分段：一段只讲一件事；长句可以拆，短句可以合并，但不要为了整齐而机械排比',
    '- 不要使用 Markdown 标记（不要 #、**、- 列表符），正文是纯文本；需要列举时用自然语言或换行',
    `- 标题不超过 ${POST_POLISH_MAX_TITLE_CHARS} 字，正文不超过 ${POST_POLISH_MAX_INPUT_CHARS} 字`,
    '- 只输出 JSON，不要任何解释、前后缀或 Markdown 代码块',
    '</constraints>',
    '<quality_bar>',
    '- 改写后应当明显更好读；如果只是换几个同义词，说明没有达到要求',
    '- 但“更好读”不等于“更长”：不要为了显得丰富而扩写，信息密度优先',
    '- 保留原文的细节与具体场景，正是这些细节让帖子不像模板',
    '</quality_bar>',
    '<output_format>',
    '{"title": "...", "content": "..."}',
    '</output_format>',
  ].join('\n');

  const userPrompt = [
    safeTitle ? `标题：${safeTitle}` : '标题：（用户还没有写标题，请根据正文拟一个）',
    '',
    safeContent ? `正文：${safeContent}` : '正文：（用户还没有写正文，请根据标题补一小段）',
  ].join('\n');

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
};

/**
 * 把模型回复解析成 `{ title, content }`。
 *
 * 三级兜底（顺序即可靠性）：
 *   1. `extractBohAIJsonObject` —— 复用 BOHAI 那份真源，它已经处理了
 *      「推理标签包裹」「```json 围栏」「前后有解释文字」三种常见污染；
 *   2. 裸文本 + 分栏标签（模型没听话、返回了「标题：…\n正文：…」）；
 *   3. 整段当正文、标题留空（至少不丢内容）。
 *
 * 任何一级产出的字段都要再过一遍长度钳制 —— 模型不保证遵守上限。
 *
 * @param {string} raw 模型返回的正文
 * @param {{ extractJson?: (text: string) => unknown }} [opts]
 * @returns {{ title: string, content: string, degraded: boolean }}
 *   `degraded` = 没拿到结构化 JSON、走了兜底（UI 可以据此弱化提示）
 */
export const parsePolishResult = (raw, { extractJson } = {}) => {
  const text = String(raw || '').trim();
  if (!text) return { title: '', content: '', degraded: true };

  const clampTitle = (value) =>
    String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, POST_POLISH_MAX_TITLE_CHARS);

  // 模型偶尔会把 JSON 里的换行写成字面量 \n（不经转义），解析后照样能用；
  // 但真换行要保留 —— 正文的分段信息全在换行里。
  const normalizeContent = (value) =>
    String(value || '')
      .replace(/\r\n/g, '\n')
      .trim()
      .slice(0, POST_POLISH_MAX_INPUT_CHARS);

  if (typeof extractJson === 'function') {
    const parsed = extractJson(text);
    if (parsed && typeof parsed === 'object') {
      const title = clampTitle(parsed.title);
      const content = normalizeContent(parsed.content ?? parsed.body);
      if (content) return { title, content, degraded: false };
    }
  }

  const labelTitle = text.match(/(?:^|\n)\s*(?:标题|title)\s*[：:]\s*([^\n]+)/i);
  const labelContent = text.match(/(?:^|\n)\s*(?:正文|content|body)\s*[：:]\s*([\s\S]+)$/i);
  if (labelContent) {
    return {
      title: clampTitle(labelTitle?.[1] || ''),
      content: normalizeContent(labelContent[1]),
      degraded: true,
    };
  }

  return { title: '', content: normalizeContent(text), degraded: true };
};

/**
 * 结果是否与原文实质不同 —— 用来在预览里判断「这次整理有没有真的改动」，
 * 以及避免用户点「应用」后得到一个和原来一模一样的稿子还以为生效了。
 *
 * 归一化只做「空白折叠 + 首尾修剪」：措辞相同但分段不同算**有**改动
 * （分段正是整理的主要价值之一），所以不能把换行也折叠掉。
 *
 * @param {{ title?: string, content?: string }} original 当前编辑器里的内容
 * @param {{ title?: string, content?: string }} result 模型整理后的内容
 */
export const isPolishResultChanged = (original = {}, result = {}) => {
  const fold = (value) =>
    String(value || '')
      .replace(/[ \t]+/g, ' ')
      .trim();
  const sameTitle = fold(original.title) === fold(result.title);
  const sameContent = fold(original.content) === fold(result.content);
  return !(sameTitle && sameContent);
};
