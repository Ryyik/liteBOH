/**
 * search.js — 联网搜索：Tavily 优先 → 免费代理兜底 + 搜索结果上下文构建
 *
 * 来源：从 `composables/bohai-engine-helpers.js` **原样拆出**（plans/025 v2 · Step 3「utils 归位」）。
 * 值逐字不变；原 barrel `bohai-engine-helpers.js` 已在 Step 3 ⑧ 删除，消费方直连本模块。
 */
import {
  MAX_PROMPT_EXTRA_CHARS,
  MAX_SEARCH_RESULT_CONTENT_CHARS,
} from '../../composables/chat-engine-config.js';
import { searchVaultFree, searchVaultTavily } from '@/utils/api/api-key-runtime-api.js';
import { logger } from '@/utils/logger.js';
import { escapePromptXmlAttr, normalizePromptLine } from '../text/normalize.js';

export const buildSearchResultsContext = (results = [], aiAnswer = '') => {
  if (!Array.isArray(results) || results.length === 0) {
    // 即使没有结构化结果，若有 AI 摘要也作为上下文返回，避免完全无依据
    if (aiAnswer) {
      return `\n\n以下是实时搜索摘要，请据此回答用户：\n<search_answer>\n${escapePromptXmlAttr(normalizePromptLine(aiAnswer, MAX_PROMPT_EXTRA_CHARS - 200))}\n</search_answer>\n\n请在回答时说明这是基于网络搜索的结果。\n\n`;
    }
    return '';
  }

  const SEARCH_SUFFIX_TEMPLATE =
    '\n\n以下是实时搜索结果，请根据这些信息回答用户，如果搜索结果不相关，请忽略：\n<search_results>\n\n</search_results>\n\n请在回答时，在引用搜索结果的地方标注编号，如 [W1], [W2]。并在回答结束时列出参考来源。\n\n';
  const effectiveMax = Math.max(0, MAX_PROMPT_EXTRA_CHARS - SEARCH_SUFFIX_TEMPLATE.length);

  let body = '';
  // Tavily advanced 模式返回的 AI 摘要，置于结果之前作为高优先级上下文
  if (aiAnswer) {
    const answerLine = `<ai_answer>${escapePromptXmlAttr(normalizePromptLine(aiAnswer, 800))}</ai_answer>\n`;
    body += answerLine;
  }
  for (let i = 0; i < results.length; i += 1) {
    const item = results[i];
    const ref = `W${i + 1}`;
    const title = escapePromptXmlAttr(normalizePromptLine(item?.title, 120));
    const url = escapePromptXmlAttr(normalizePromptLine(item?.url, 240));
    const content = escapePromptXmlAttr(
      normalizePromptLine(item?.content, MAX_SEARCH_RESULT_CONTENT_CHARS),
    );
    const line = `<result index="${i + 1}" ref="${ref}" title="${title}" url="${url}">${content}</result>\n`;
    if (body.length + line.length > effectiveMax) break;
    body += line;
  }

  if (!body) return '';

  return `\n\n以下是实时搜索结果，请根据这些信息回答用户，如果搜索结果不相关，请忽略：\n<search_results>\n${body}</search_results>\n\n请在回答时，在引用搜索结果的地方标注编号，如 [W1], [W2]。并在回答结束时列出参考来源。\n\n`;
};

export const getWebSearchFreshnessDays = (queryText = '') => {
  const normalized = normalizePromptLine(queryText, 800);
  if (!normalized) return null;
  if (
    /(今天|今日|刚刚|刚才|这几天|近几天|过去几天|过去[一二两三四五六七八九十\d]+天)/i.test(
      normalized,
    )
  ) {
    return 7;
  }
  if (/(最近|近期|最新|本周|这周|本月|这个月|新发布|刚发布|新闻|动态|近况)/i.test(normalized)) {
    return 30;
  }
  return null;
};

// ─── 联网搜索：Tavily 优先 → 免费代理兜底 ──────────────────────────────────
// Tavily 走 api_key_vault（provider='tavily', purpose='web_search'）；DB 里没有记录时
// EF 会回落到环境变量 TAVILY_API_KEY（index.ts:989）—— 所以现网无需在控制台额外配 key。
//
// ⚠️ Tavily 的 key 是**全站共享一把**：免费额度 1000 次/月，超出按次计费，用量是总量口径，
// 而 web_search_daily_limit 只约束单个用户。所以这里只做「优先 + 兜底」，不做重试放大、
// 不做多查询并发。
//
// 两段式超时：单段各 12s，合计 ≤24s，给 useChatEngine 那层 30s 的 AbortSignal 留出余量。
// （原为「单段 25s + 单通道」；两段直接相加会撞外层兜底。）
const TAVILY_SEARCH_TIMEOUT_MS = 12_000;
const FREE_SEARCH_TIMEOUT_MS = 12_000;

// 配置类失败（未配 key / key 已停用）是**确定性**的，不该每轮都白试一次 —— 记下来直接跳过。
// 瞬态失败（网络 / 超时 / 5xx）不写这里：只回落本轮的免费通道，下一轮仍优先试 Tavily。
// ⚠️ 补配 key 之后需要刷新页面才会重新启用（管理端配置本就是低频操作）。
let tavilySearchUnavailable = false;

export const resetTavilySearchAvailability = () => {
  tavilySearchUnavailable = false;
};

const isSearchConfigError = (message) =>
  /未配置|未找到该 API Key|已停用|missing.*key|no active.*key|not configured/i.test(
    String(message || ''),
  );

const toWebSearchSuccess = (vaultResult, provider) => {
  const searchData = vaultResult.data || {};
  const results = Array.isArray(searchData?.results) ? searchData.results : [];
  const aiAnswer = typeof searchData?.answer === 'string' ? searchData.answer.trim() : '';
  return {
    ok: true,
    disabled: false,
    provider,
    count: results.length,
    context: buildSearchResultsContext(results, aiAnswer),
    results,
    aiAnswer,
  };
};

export const searchWebForPrompt = async (queryText, requestSignal = undefined) => {
  if (requestSignal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const freshnessDays = getWebSearchFreshnessDays(queryText);
  const payload = {
    query: queryText,
    search_depth: 'advanced',
    include_answer: true,
    max_results: 5,
    // ⚠️ days 只在 Tavily（advanced）通道被真正透传；免费通道的 EF 分支会丢弃它。
    ...(freshnessDays ? { days: freshnessDays } : {}),
  };

  if (!tavilySearchUnavailable) {
    const tavilyResult = await searchVaultTavily({
      payload,
      timeoutMs: TAVILY_SEARCH_TIMEOUT_MS,
      signal: requestSignal,
    });
    if (tavilyResult.ok) {
      return toWebSearchSuccess(tavilyResult, 'tavily');
    }
    const tavilyMessage = String(tavilyResult.error?.message || '');
    if (isSearchConfigError(tavilyMessage)) {
      tavilySearchUnavailable = true;
      logger.warn('boh-ai', 'Tavily 不可用（未配置或已停用），联网搜索回落免费通道', {
        message: tavilyMessage.slice(0, 120),
      });
    }
    // 外层已中断（用户取消 / 30s 兜底）：不必再浪费一次兜底请求。
    if (requestSignal?.aborted) {
      return {
        ok: false,
        disabled: false,
        provider: null,
        count: 0,
        context: '',
        message: '联网搜索已取消',
        error: tavilyResult.error,
      };
    }
  }

  const freeResult = await searchVaultFree({
    payload,
    timeoutMs: FREE_SEARCH_TIMEOUT_MS,
    signal: requestSignal,
  });
  if (freeResult.ok) {
    return toWebSearchSuccess(freeResult, 'free');
  }

  // 两条通道都失败：disabled 只由**兜底通道**的错误判定，语义与改动前完全一致 ——
  // Only a genuine configuration error should change the persistent switch.
  // Provider/network failures are transient and should leave the preference on.
  const message = String(freeResult.error?.message || '联网搜索暂时不可用');
  return {
    ok: false,
    disabled: isSearchConfigError(message),
    provider: null,
    count: 0,
    context: '',
    message,
    error: freeResult.error,
  };
};
