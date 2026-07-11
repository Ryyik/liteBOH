import { nextTick } from 'vue';
import {
  detectBohAIResourceSearchIntent,
  getResourceTypeLabel,
  searchMinecraftResourcesForBohAI
} from '@/utils/api/resource-search-api.js';
import {
  normalizePromptLine,
  truncateText
} from './bohai-engine-helpers.js';
import { logger } from '@/utils/logger.js';
import { safeErrorDetail, isAbortError, CHAT_ERROR_MESSAGES } from '../utils/chatErrorMessages.js';
import {
  RESOURCE_FOLLOW_UP_PATTERN,
  RESOURCE_RECOMMENDATION_PATTERN,
  WEAK_RESOURCE_QUERY_PATTERN,
  KNOWN_RESOURCE_NAME_ALIASES,
  stripResourceQueryNoise as stripResourceQueryNoiseShared
} from '../agents/core/agent-patterns.js';

export function useResourceSearch({
  getSessionByIndex,
  scrollToBottom,
  getModelForModeId,
  callModelInternal,
  activeGenerationSessionIndex,
  startThinkingTimer,
  stopThinkingTimer,
  setThinkingStatus,
  cleanupGenerationState,
  refreshConversationSummaryCache,
  appendUserMessageWithTitle,
  resetComposerInput,
  mergeAssistantMessageMeta,
  currentSessionIndex,
  abortController,
  runtimeAvailableModels
}) {
  const buildResourceSearchReply = (searchPayload = {}) => {
    const results = Array.isArray(searchPayload.results) ? searchPayload.results : [];
    const typeLabel = searchPayload.typeLabel || getResourceTypeLabel(searchPayload.type);
    const keywordText = Array.isArray(searchPayload.displayKeywords) && searchPayload.displayKeywords.length > 0
      ? searchPayload.displayKeywords.slice(0, 5).join('、')
      : (searchPayload.query || (searchPayload.isGenericRecommendation ? `热门${typeLabel === '全部' ? '资源' : typeLabel}` : '这个关键词'));
    const filters = [
      typeLabel && searchPayload.type !== 'all' ? typeLabel : '',
      searchPayload.loader ? searchPayload.loader : '',
      searchPayload.version ? searchPayload.version : ''
    ].filter(Boolean);
    const filterText = filters.length > 0 ? `（${filters.join(' / ')}）` : '';
    const searchIntro = searchPayload.isGenericRecommendation
      ? `我按热门和下载量帮你筛了一批${typeLabel === '全部' ? '资源' : typeLabel}${filterText}。`
      : `我先理解了你的需求，提取关键词：${keywordText}${filterText}。`;
    if (results.length === 0) {
      return searchPayload.isGenericRecommendation
        ? `我按热门和下载量搜索了${typeLabel === '全部' ? '资源' : typeLabel}${filterText}，但资源库暂时没有返回结果。可以换个类型、版本或加载器再试。`
        : `我理解你的需求后提取了关键词：${keywordText}${filterText}。但资源库里暂时没有找到匹配结果，可以换个描述，或放宽版本/加载器再试。`;
    }

    return [
      searchIntro,
      `在资源库里找到了 ${results.length} 个相关资源。`,
      '',
      '下面已经展示前几条结果，也可以点击"查看资源列表"打开完整面板。'
    ].join('\n');
  };

  const stripResourceQueryNoise = (value = '') => stripResourceQueryNoiseShared(normalizePromptLine, value);

  const isWeakResourceQuery = (value = '') => {
    const raw = normalizePromptLine(value, 80).toLowerCase();
    if (!raw) return true;
    const stripped = stripResourceQueryNoise(raw);
    return !stripped || WEAK_RESOURCE_QUERY_PATTERN.test(raw) || WEAK_RESOURCE_QUERY_PATTERN.test(stripped);
  };

  const normalizeResourceSearchQueries = (queries = []) => {
    const source = Array.isArray(queries) ? queries : [queries];
    return [...new Set(
      source
        .map((item) => normalizePromptLine(item, 80).toLowerCase())
        .map((item) => stripResourceQueryNoise(item))
        .filter(Boolean)
        .filter((item) => !isWeakResourceQuery(item))
        .filter((item) => item.length >= 2)
    )].slice(0, 5);
  };

  const normalizeResourceDisplayKeywords = (keywords = []) => {
    const source = Array.isArray(keywords) ? keywords : [keywords];
    return [...new Set(
      source
        .map((item) => normalizePromptLine(item, 40))
        .filter(Boolean)
        .filter((item) => /^热门/.test(item) || !isWeakResourceQuery(item))
    )].slice(0, 5);
  };

  const getKnownResourceNameQueries = (userText = '') => {
    const source = String(userText || '');
    const terms = [];
    KNOWN_RESOURCE_NAME_ALIASES.forEach((item) => {
      if (item.pattern.test(source)) terms.push(...item.terms);
    });
    return normalizeResourceSearchQueries(terms);
  };

  const getResourceTopicQueryOverride = (userText = '') => {
    const source = String(userText || '');
    const knownResourceQueries = getKnownResourceNameQueries(source);
    if (knownResourceQueries.length > 0) return knownResourceQueries;
    const terms = [];
    const add = (...items) => terms.push(...items);
    if (/宝可梦|神奇宝贝|精灵宝可梦|口袋妖怪|pokemon|pixelmon|cobblemon/i.test(source)) add('cobblemon', 'pixelmon', 'pokemon');
    if (/家具|家居|沙发|椅子|桌子|柜子/i.test(source)) add('furniture', 'decoration');
    if (/优化|性能|帧数|卡顿|流畅|低配|轻量/i.test(source)) add('performance', 'optimization');
    if (/小地图|地图导航|导航/i.test(source)) add('minimap', 'map');
    if (/科技|工业|机械|自动化/i.test(source)) add('tech', 'automation');
    if (/魔法|法术/i.test(source)) add('magic');
    if (/冒险|探索|地牢/i.test(source)) add('adventure', 'exploration', 'dungeon');
    if (/建筑|建造|装饰|室内|摆件/i.test(source)) add('building', 'decoration');
    if (/农业|种田|食物|料理/i.test(source)) add('farming', 'food');
    if (/生存|养老/i.test(source)) add('survival');
    if (/服务端|服务器/i.test(source)) add('server');
    if (/菜单|物品栏|背包|库存/i.test(source)) add('inventory', 'menu');
    if (/高清|真实|写实/i.test(source)) add('realistic', 'high resolution');
    return normalizeResourceSearchQueries(terms);
  };

  const getGenericResourceDisplayKeywords = (type = 'all') => {
    const label = getResourceTypeLabel(type);
    return [`热门${label === '全部' ? '资源' : label}`];
  };

  const isGenericResourceRecommendation = (userText = '', intent = {}) => {
    const source = String(userText || '');
    if (!RESOURCE_RECOMMENDATION_PATTERN.test(source)) return false;
    if (getResourceTopicQueryOverride(source).length > 0) return false;
    if (intent.type && intent.type !== 'all') return true;
    return /(资源|东西|mod|模组|整合包|材质包|资源包|光影|minecraft|我的世界|mc)/i.test(source);
  };

  const finalizeResourceSearchPlan = (userText = '', intent = {}, plan = {}) => {
    const safeIntentType = ['all', 'mod', 'modpack', 'resourcepack', 'shader'].includes(intent.type) ? intent.type : 'all';
    const safePlanType = ['all', 'mod', 'modpack', 'resourcepack', 'shader'].includes(plan.type) ? plan.type : 'all';
    const type = safeIntentType !== 'all' ? safeIntentType : safePlanType;
    const topicQueries = getResourceTopicQueryOverride(userText);
    const planQueries = normalizeResourceSearchQueries(plan.searchQueries);
    const genericRecommendation = topicQueries.length === 0
      && !plan.inheritedResourceTopic
      && (
        isGenericResourceRecommendation(userText, { ...intent, type })
        || (planQueries.length === 0 && Boolean(plan.isGenericRecommendation))
      );
    const searchQueries = topicQueries.length > 0
      ? topicQueries
      : (genericRecommendation ? [] : planQueries);
    const displayKeywords = topicQueries.length > 0
      ? topicQueries
      : (
        genericRecommendation
          ? getGenericResourceDisplayKeywords(type)
          : (
            normalizeResourceDisplayKeywords(plan.displayKeywords).length > 0
              ? normalizeResourceDisplayKeywords(plan.displayKeywords)
              : searchQueries
          )
      );

    return {
      ...plan,
      type,
      loader: normalizePromptLine(plan.loader, 24) || normalizePromptLine(intent.loader, 24),
      version: normalizePromptLine(plan.version, 24) || normalizePromptLine(intent.version, 24),
      searchQueries,
      displayKeywords,
      sort: genericRecommendation ? 'downloads' : (plan.sort === 'downloads' ? 'downloads' : 'relevance'),
      isGenericRecommendation: genericRecommendation,
      reason: genericRecommendation
        ? '按资源类型进行热门推荐。'
        : (plan.reason || '已根据资源类型和中文需求提取关键词。')
    };
  };

  const createFallbackResourceSearchPlan = (userText = '', intent = {}) => {
    const fallbackQuery = normalizePromptLine(intent.query, 120) || normalizePromptLine(userText, 120);
    const topicQueries = getResourceTopicQueryOverride(userText);
    const fallbackQueries = normalizeResourceSearchQueries([
      ...topicQueries,
      fallbackQuery
    ]);
    const isGenericRecommendation = fallbackQueries.length === 0 && isGenericResourceRecommendation(userText, intent);
    return {
      type: intent.type || 'all',
      loader: intent.loader || '',
      version: intent.version || '',
      searchQueries: fallbackQueries,
      displayKeywords: fallbackQueries.length > 0 ? fallbackQueries : getGenericResourceDisplayKeywords(intent.type || 'all'),
      reason: isGenericRecommendation ? '按资源类型进行热门推荐。' : '已根据资源类型和中文需求提取关键词。',
      sort: isGenericRecommendation ? 'downloads' : 'relevance',
      isGenericRecommendation,
      usedModel: false
    };
  };

  const getResourceDisplayKeywordOverride = (userText = '') => {
    return getResourceTopicQueryOverride(userText);
  };

  const getLastResourceSearchPayload = (sessionIndex, beforeMessageIndex = Infinity) => {
    const session = getSessionByIndex(sessionIndex);
    const messages = Array.isArray(session?.messages) ? session.messages : [];
    const maxIndex = Math.min(messages.length - 1, Number.isFinite(beforeMessageIndex) ? beforeMessageIndex - 1 : messages.length - 1);
    for (let index = maxIndex; index >= 0; index -= 1) {
      const message = messages[index];
      const payload = message?.role === 'assistant' && message?.meta?.kind === 'resource_search_results'
        ? message.meta.resourceSearch
        : null;
      if (payload && typeof payload === 'object') return payload;
    }
    return null;
  };

  const shouldInheritPreviousResourceTopic = (userText = '', plan = {}) => {
    if (!RESOURCE_FOLLOW_UP_PATTERN.test(String(userText || ''))) return false;
    return normalizeResourceSearchQueries(plan.searchQueries).length === 0
      || Boolean(plan.isGenericRecommendation);
  };

  const resolveResourceSearchPlanWithModel = async (userText, intent, requestSignal = undefined) => {
    const fallback = createFallbackResourceSearchPlan(userText, intent);
    const plannerModel = getModelForModeId('fast')
      || runtimeAvailableModels.value[0];
    if (!plannerModel?.id) return fallback;

    const PLANNER_TIMEOUT_MS = 8000;
    const combinedSignal = requestSignal
      ? (typeof AbortSignal.any === 'function'
          ? AbortSignal.any([requestSignal, AbortSignal.timeout(PLANNER_TIMEOUT_MS)])
          : requestSignal)
      : AbortSignal.timeout(PLANNER_TIMEOUT_MS);

    try {
      const raw = await callModelInternal(
        plannerModel.id,
        [
          '请把用户的 Minecraft 资源搜索需求改写成适合 Modrinth / CurseForge 等资源库检索的英文关键词。',
          '只输出 JSON，不要解释，不要 Markdown。',
          '',
          '字段：',
          '- type: "all" | "mod" | "modpack" | "resourcepack" | "shader"',
          '- loader: "fabric" | "forge" | "neoforge" | "quilt" | ""',
          '- version: 例如 "1.21.1"，没有就空字符串',
          '- searchQueries: string[]，0 到 5 个英文检索词，按优先级排序，短词优先，不要把中文原句直接翻译成无效长句',
          '- displayKeywords: string[]，给用户看的中文/英文关键词，最多 5 个',
          '- targetKind: "exact_resource" | "category" | "generic_recommendation"',
          '- normalizedTarget: string，用户真正想找的资源名或类别，例如 "Botania"、"magic mods"、"popular modpacks"',
          '- reason: string，一句话说明你提取了什么方向，最多 40 字',
          '- sort: "relevance" | "downloads"，泛推荐用 downloads，明确主题用 relevance',
          '',
          '规则：',
          '0. 先判断用户说的是具体 Mod 名还是泛类别。具体 Mod 名必须映射到英文项目名/常用 slug，不要降级成类别词。',
          '1. "我要家具mod/家具模组/家居"应输出 furniture、decoration、furnish 等关键词，而不是搜索"我要家具"。',
          '2. "宝可梦/神奇宝贝/口袋妖怪/Pixelmon/Cobblemon"必须输出 cobblemon、pixelmon、pokemon，不要输出"找宝可梦/宝可梦整合包"。',
          '3. "植物魔法"是具体 Mod Botania，必须输出 botania；不能只输出 magic。',
          "4. 常见中文名映射：暮色森林=twilight forest，匠魂=tinkers construct，机械动力=create，应用能源=applied energistics 2，农夫乐事=farmer's delight，通用机械=mekanism。",
          '5. "优化/帧数/低配"应输出 performance、optimization 等关键词。',
          '6. "小地图"如果是泛需求可输出 minimap、map；如果提到 Xaero 输出 xaero minimap。',
          '7. 如果用户说 Mod，就 type=mod；整合包 type=modpack；材质 type=resourcepack；光影 type=shader。',
          '8. searchQueries 不要包含 mod、modpack、minecraft、版本号或加载器，类型/版本/加载器走字段。',
          '9. 如果用户只是说"推荐一点整合包/推荐一些 mod/来点材质"这类泛推荐，没有具体主题，searchQueries 必须是 []，sort 必须是 downloads，displayKeywords 用"热门整合包/热门Mod"等。',
          '',
          `本地初判：${JSON.stringify({
            type: intent.type,
            loader: intent.loader,
            version: intent.version,
            query: intent.query
          })}`,
          `用户消息：${truncateText(userText, 500)}`
        ].join('\n'),
        '<role>你是 BOH AI 的 Minecraft 资源搜索规划器。</role>\n<thinking>先判断用户真正想找什么，再把它改写成资源库检索词。</thinking>\n<output_format>只返回严格 JSON</output_format>',
        [],
        combinedSignal,
        0,
        { max_tokens: 520, temperature: 0.05, top_p: 0.45, frequency_penalty: 0.02 }
      );
      let parsed = {};
      try { parsed = JSON.parse(String(raw || '').trim()); } catch (_) { /* 解析失败使用空对象兜底 */ }
      const safeType = ['all', 'mod', 'modpack', 'resourcepack', 'shader'].includes(parsed?.type) ? parsed.type : fallback.type;
      const parsedSearchQueries = normalizeResourceSearchQueries(parsed?.searchQueries);
      const searchQueries = parsedSearchQueries.length > 0 ? parsedSearchQueries : fallback.searchQueries;
      const displayOverride = normalizeResourceDisplayKeywords(getResourceDisplayKeywordOverride(userText));
      const isGenericRecommendation = searchQueries.length === 0 && (
        Boolean(fallback.isGenericRecommendation)
        || normalizeResourceDisplayKeywords(parsed?.displayKeywords).some((item) => /^热门/.test(item))
      );
      const parsedDisplayKeywords = normalizeResourceDisplayKeywords(parsed?.displayKeywords);
      return {
        type: safeType || fallback.type,
        loader: normalizePromptLine(parsed?.loader, 24) || fallback.loader,
        version: normalizePromptLine(parsed?.version, 24) || fallback.version,
        searchQueries,
        displayKeywords: displayOverride.length > 0
          ? displayOverride
          : parsedDisplayKeywords.length > 0
            ? parsedDisplayKeywords
            : (searchQueries.length > 0 ? searchQueries : getGenericResourceDisplayKeywords(safeType || fallback.type)),
        reason: normalizePromptLine(parsed?.reason, 80) || fallback.reason,
        targetKind: ['exact_resource', 'category', 'generic_recommendation'].includes(parsed?.targetKind) ? parsed.targetKind : '',
        normalizedTarget: normalizePromptLine(parsed?.normalizedTarget, 80),
        sort: parsed?.sort === 'downloads' || fallback.sort === 'downloads' ? 'downloads' : 'relevance',
        isGenericRecommendation,
        usedModel: true
      };
    } catch (error) {
      if (isAbortError(error) && requestSignal?.aborted) throw error;
      logger.warn('boh-ai', 'Resource search planning failed, using fallback', error);
      return fallback;
    }
  };

  const searchResourcesByPlan = async (plan = {}, requestSignal = undefined) => {
    const queries = normalizeResourceSearchQueries(plan.searchQueries);
    const effectiveQueries = queries.length > 0 ? queries : [''];
    const sortMode = plan.sort === 'downloads' || queries.length === 0 ? 'downloads' : 'relevance';
    const seen = new Set();
    const results = [];
    const searchedQueries = [];
    let totalHits = 0;

    for (const query of effectiveQueries) {
      if (requestSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const result = await searchMinecraftResourcesForBohAI({
        query,
        type: plan.type || 'all',
        loader: plan.loader || '',
        version: plan.version || '',
        limit: 8,
        sort: sortMode,
        signal: requestSignal
      });
      searchedQueries.push(query);
      totalHits += Number(result.totalHits || 0);
      for (const item of result.results || []) {
        const key = item.project_id || `${item.source}:${item.slug || item.title}`;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        results.push({ ...item, matchedQuery: query });
        if (results.length >= 12) break;
      }
      if (results.length >= 12) break;
    }

    return {
      ok: true,
      query: queries[0] || '',
      queries,
      searchedQueries: searchedQueries.filter(Boolean),
      type: plan.type || 'all',
      typeLabel: getResourceTypeLabel(plan.type || 'all'),
      version: normalizePromptLine(plan.version, 24),
      loader: normalizePromptLine(plan.loader, 24),
      totalHits,
      results,
      sort: sortMode,
      isGenericRecommendation: queries.length === 0 || Boolean(plan.isGenericRecommendation)
    };
  };

  const handleResourceSearchRequest = async (rawUserText = '') => {
    const userText = String(rawUserText || '').trim();
    const sessionIndex = currentSessionIndex.value;
    const session = getSessionByIndex(sessionIndex);
    if (!session) return false;
    let intent = detectBohAIResourceSearchIntent(userText);
    if (!intent.matched && RESOURCE_RECOMMENDATION_PATTERN.test(userText)) {
      const previousResourceSearch = getLastResourceSearchPayload(sessionIndex);
      if (previousResourceSearch) {
        intent = {
          matched: true,
          query: '',
          type: previousResourceSearch.type || 'all',
          loader: previousResourceSearch.loader || '',
          version: previousResourceSearch.version || ''
        };
      }
    }
    if (!intent.matched) return false;

    appendUserMessageWithTitle(sessionIndex, userText);
    resetComposerInput();
    scrollToBottom(true);

    session.isLoading = true;
    session.isThinking = true;
    activeGenerationSessionIndex.value = sessionIndex;
    startThinkingTimer();
    const requestController = new AbortController();
    abortController.value = requestController;
    session.messages.push({
      role: 'assistant',
      content: ''
    });
    const messageIndex = session.messages.length - 1;
    setThinkingStatus('意图理解中...');
    await nextTick();
    scrollToBottom();

    try {
      let plan = finalizeResourceSearchPlan(
        userText,
        intent,
        await resolveResourceSearchPlanWithModel(userText, intent, requestController.signal)
      );
      const previousResourceSearch = getLastResourceSearchPayload(sessionIndex, messageIndex);
      if (previousResourceSearch && shouldInheritPreviousResourceTopic(userText, plan)) {
        const previousQueries = normalizeResourceSearchQueries(previousResourceSearch.displayKeywords).length > 0
          ? normalizeResourceSearchQueries(previousResourceSearch.displayKeywords)
          : normalizeResourceSearchQueries(previousResourceSearch.queries || previousResourceSearch.query);
        if (previousQueries.length > 0) {
          plan.searchQueries = previousQueries;
          plan.displayKeywords = previousQueries;
          plan.sort = 'relevance';
          plan.isGenericRecommendation = false;
          plan.inheritedResourceTopic = true;
          plan.reason = '沿用上一轮资源主题继续搜索。';
        }
      }
      plan = finalizeResourceSearchPlan(userText, intent, plan);
      const plannedKeywords = normalizeResourceDisplayKeywords(plan.displayKeywords).join('、') || normalizeResourceSearchQueries(plan.searchQueries).join('、');
      setThinkingStatus(plan.isGenericRecommendation
        ? `正在搜索热门${getResourceTypeLabel(plan.type || intent.type || 'all')}...`
        : `正在搜索资源：${plannedKeywords || intent.query || userText}`);

      const searchPayload = await searchResourcesByPlan(plan, requestController.signal);
      const payload = {
        ...searchPayload,
        rawQuery: userText,
        displayKeywords: normalizeResourceDisplayKeywords(plan.displayKeywords).length > 0
          ? normalizeResourceDisplayKeywords(plan.displayKeywords)
          : (searchPayload.isGenericRecommendation ? getGenericResourceDisplayKeywords(plan.type || 'all') : normalizeResourceSearchQueries(plan.searchQueries)),
        plannerReason: plan.reason || '',
        usedModelPlanner: Boolean(plan.usedModel),
        isGenericRecommendation: Boolean(searchPayload.isGenericRecommendation || plan.isGenericRecommendation),
        requestedAt: Date.now()
      };
      if (payload.results.length === 0 && intent.query && !payload.queries.includes(intent.query)) {
        const fallbackPayload = await searchResourcesByPlan({
          ...plan,
          searchQueries: [intent.query]
        }, requestController.signal);
        payload.results = fallbackPayload.results;
        payload.totalHits += Number(fallbackPayload.totalHits || 0);
        payload.searchedQueries = [...new Set([...(payload.searchedQueries || []), ...(fallbackPayload.searchedQueries || [])])];
      }
      if (payload.results.length === 0 && payload.isGenericRecommendation) {
        const popularPayload = await searchResourcesByPlan({
          ...plan,
          searchQueries: [],
          sort: 'downloads'
        }, requestController.signal);
        payload.results = popularPayload.results;
        payload.totalHits += Number(popularPayload.totalHits || 0);
        payload.searchedQueries = [...new Set([...(payload.searchedQueries || []), ...(popularPayload.searchedQueries || [])])];
      }
      payload.query = payload.searchedQueries?.[0] || payload.query;
      payload.queries = payload.searchedQueries || payload.queries;
      payload.typeLabel = getResourceTypeLabel(payload.type);

      const targetSession = getSessionByIndex(sessionIndex);
      if (!targetSession?.messages?.[messageIndex]) return true;
      targetSession.messages[messageIndex].content = buildResourceSearchReply(payload);
      mergeAssistantMessageMeta(sessionIndex, messageIndex, {
        kind: 'resource_search_results',
        resourceSearch: payload
      });
      nextTick(scrollToBottom);
      void refreshConversationSummaryCache(sessionIndex);
      return true;
    } catch (error) {
      const targetSession = getSessionByIndex(sessionIndex);
      if (isAbortError(error)) {
        if (targetSession?.messages?.[messageIndex]) {
          targetSession.messages[messageIndex].content = CHAT_ERROR_MESSAGES.resourceSearchStopped;
        }
        return true;
      }
      logger.warn('boh-ai', 'Resource search failed', error);
      if (targetSession?.messages?.[messageIndex]) {
        targetSession.messages[messageIndex].content = CHAT_ERROR_MESSAGES.resourceSearchFailed();
        mergeAssistantMessageMeta(sessionIndex, messageIndex, {
          kind: 'resource_search_results',
          resourceSearch: {
            ok: false,
            query: intent.query,
            rawQuery: userText,
            type: intent.type,
            typeLabel: getResourceTypeLabel(intent.type),
            loader: intent.loader,
            version: intent.version,
            totalHits: 0,
            results: [],
            errorMessage: safeErrorDetail(error)
          }
        });
      }
      return true;
    } finally {
      cleanupGenerationState(sessionIndex, requestController);
    }
  };

  return {
    buildResourceSearchReply,
    stripResourceQueryNoise,
    isWeakResourceQuery,
    normalizeResourceSearchQueries,
    normalizeResourceDisplayKeywords,
    getKnownResourceNameQueries,
    getResourceTopicQueryOverride,
    getGenericResourceDisplayKeywords,
    isGenericResourceRecommendation,
    finalizeResourceSearchPlan,
    createFallbackResourceSearchPlan,
    getResourceDisplayKeywordOverride,
    getLastResourceSearchPayload,
    shouldInheritPreviousResourceTopic,
    resolveResourceSearchPlanWithModel,
    searchResourcesByPlan,
    handleResourceSearchRequest
  };
}