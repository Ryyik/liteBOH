/**
 * boh-activity.js — 消息流「活动行」的唯一真源（2026-10-19 建立）
 *
 * 背景（用户口径）：「正在思考 / 连接社区记忆 / 联网搜索是同样的光效闪动切换，
 * 始终显示一个动作（当前正在进行的那个），然后会有切换。」
 *
 * 改动前它们是**三块各自挂载、各自卸下**的节点：
 *   ① 联网搜索行（`webActive`，从请求发出挂到整轮结束）；
 *   ② 「正在读取近日帖子」（`communitySearchActive && isThinking`，检索一结束就消失）；
 *   ③ 「正在思考」（`isReasoningLive`，显式排除搜索中）。
 * 于是搜索期两行同时闪、检索结束下方那行突然消失、再冒出「正在思考」——
 * 看起来就是「同样的光效在闪动切换」。
 *
 * 现在：**由本文件的纯函数算出「此刻唯一该展示的那一个动作」**，视图只渲染它。
 * 「只显示一个」由数据保证，不再靠模板里 `v-if` 的书写顺序。
 *
 * ## 优先级（= 用户口径「当前正在进行的那个」）
 *
 * ```
 * 网页搜索（请求在途）        ← 唯一真的「外部请求还在飞」的那一路
 *   ↓ 结果到位
 * 社区检索（读《帖子标题》）    ← 网页回来了、社区还在读：此刻正在进行的**动作**是社区
 *   ↓ 社区读完
 * 网页检索（读标题）          ← 社区那边也没在读了，网页标题成为「刚读完、等模型开口」的证据
 *   ↓ 首 token（isThinking 翻 false）
 * 正在思考（模型推理）
 * ```
 *
 * ⚠️ `community` 必须排在 `web-results` **前面**：两者可以同时成立（网页先回、社区还在途），
 *   而「社区还在读」才是此刻真正在进行的那一个动作。反过来排会让整轮都停在「网页检索」，
 *   用户永远看不到社区在做什么 —— 那正是原本次序要修的症状。
 *
 * ⚠️ 两条不能动的纪律：
 * 1. **搜索在途时不显示「正在思考」**（2026-10-08 用户口径，探针 A2 锁着）—— 上表里它本来就在最后。
 * 2. **社区检索不再「检索结束就消失」**：它挂到整轮结束（`isLoading`），只在轮到它时展示。
 *    旧口径「检索期必须出这一行才可见」的问题消失了 —— 现在它是唯一那一行。
 *
 * @param {{
 *   isThinking?: boolean,
 *   isLoading?: boolean,
 *   webSearchActive?: boolean,
 *   webSearchResultCount?: number,
 *   communitySearchActive?: boolean,
 *   webTitleRevealed?: boolean,
 * }} state
 * @returns {'web-searching' | 'web-results' | 'community' | 'thinking' | 'answering' | ''}
 */
export const resolveBohActivityStage = ({
  isThinking = false,
  isLoading = false,
  webSearchActive = false,
  webSearchResultCount = 0,
  communitySearchActive = false,
  // 本轮网页标题是否**已经露过脸**（视图在结果到位那一拍记一次，见 `shouldRevealWebTitle`）
  webTitleRevealed = false,
} = {}) => {
  const busy = Boolean(isThinking || isLoading);
  if (!busy) return '';
  // ① 网页请求还在飞（唯一真的「外部请求在途」的信号）
  if (webSearchActive) return 'web-searching';
  // ② 社区检索还在读（`communityActivity.active`，连接器结果回来后即 false）
  if (communitySearchActive) return 'community';
  // ③ 还没开口（`isThinking` 在首个**可见** token 才翻 false，推理块不算可见 token）
  if (isThinking) {
    // 结果已经拿到、标题还没机会露脸 ⇒ 先让标题占这一拍，再进「正在思考」。
    // 两者同一段（`isThinking`）里二选一，靠 `webTitleRevealed` 记住「已经露过了」，
    // 所以不会出现「标题一直占着、正在思考永不出现」（那是纯优先级排序的死结）。
    // ⚠️ 没有结果时**不进**这一段：否则会显示一个空标题的「网页检索」。
    const hasWebResult = Number(webSearchResultCount) > 0;
    return hasWebResult && !webTitleRevealed ? 'web-results' : 'thinking';
  }
  // ④ 已开口：回复正文在长；网页标题挂在展开面里照样能看
  return 'answering';
};

/**
 * 「网页标题已经露过脸」的判定 —— **纯函数**，由调用方把「已经露了几拍」喂进来。
 *
 * 为什么不是纯优先级排序：`web-results` 与 `thinking` 同属「还没开口」这一段，
 * 谁排前面都会让另一个**整段消失**（实测：排前时 `thinking` 永不出现；
 * 排后时标题永不出现）。所以这一段必须带**次数状态**，不能只靠顺序。
 *
 * @param {{ webSearchResultCount?: number, revealCount?: number }} state
 * @returns {boolean}
 */
export const shouldRevealWebTitle = ({ webSearchResultCount = 0, revealCount = 0 } = {}) =>
  Number(webSearchResultCount) > 0 && Number(revealCount) < 1;

/** 各阶段的状态文案。**唯一真源** —— 视图里不许再写第二份字面量。 */
export const BOH_ACTIVITY_LABELS = {
  'web-searching': '网页搜索',
  'web-results': '网页检索',
  community: '正在连接社区记忆',
  thinking: '正在思考',
  answering: '正在撰写回复',
};

/** 阶段 → 行内展开面（只有这两阶段有可展开内容）；其余无。 */
export const BOH_ACTIVITY_SURFACE = {
  'web-searching': 'web',
  'web-results': 'web',
  community: '',
  thinking: 'reason',
  answering: '',
};

/**
 * 社区检索阶段的一行文案：有帖子标题就点名，没有就退回泛称。
 * 用户口径（2026-10-19）：「正在读取近日帖子」的详情改为「正在读取《帖子标题》」。
 *
 * @param {string} title 本轮社区检索命中的**最新一篇**帖子标题（已由连接器写入 metadata）
 */
export const formatCommunityActivityLine = (title) => {
  const clean = String(title || '')
    .replace(/\s+/g, ' ')
    .replace(/[《》]/g, '')
    .trim();
  if (!clean) return BOH_ACTIVITY_LABELS.community;
  return `正在读取《${clean}》`;
};

/** 行内标题（网页轮换 / 思考标题可被调用方覆盖），未给覆盖值时按阶段取默认文案。 */
export const resolveActivityLine = (stage, override = '') => {
  const text = String(override || '').trim();
  if (text) return text;
  return BOH_ACTIVITY_LABELS[stage] || '';
};

/**
 * 从社区检索结果里挑出「正在读取的那一篇」的标题。
 *
 * @param {Array<{ title?: string, latestAt?: string }>} rows `bohai-connectors` 写入的
 *   `metadata.postTitles`：每行 = 一个连接器命中的帖子；`latestAt` 是该源里最新一篇的时间。
 * @returns {string} 最新一篇的标题（无可用标题时返回 ''）
 */
export const pickCommunityPostTitle = (rows) => {
  if (!Array.isArray(rows)) return '';
  const clean = (value) =>
    String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  const withTitle = rows
    .map((row) => ({
      title: clean(row?.title),
      // 没有日期的排在最后（「缺失 ≠ 过期」：不惩罚，但也不许顶掉真的日期）
      ts: Number.isFinite(Date.parse(row?.latestAt || '')) ? Date.parse(row.latestAt) : -1,
    }))
    .filter((row) => row.title);
  if (withTitle.length === 0) return '';
  withTitle.sort((a, b) => b.ts - a.ts);
  return withTitle[0].title;
};

/** 这一行能否展开（箭头只在能展开时出现，避免点了没反应）。 */
export const canExpandActivity = (stage, { webPageCount = 0, hasReasoning = false } = {}) => {
  const surface = BOH_ACTIVITY_SURFACE[stage] || '';
  if (surface === 'web') return Number(webPageCount) > 0;
  if (surface === 'reason') return Boolean(hasReasoning);
  return false;
};
