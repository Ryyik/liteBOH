import {
  isLikelyFactualQuestion,
  extractCitationIdsFromText,
  resolveKnowledgeRoutingPlanCore
} from '@/utils/ai-chat-grounding.js';
import {
  BOHAI_CONNECTOR_IDS,
  createBohAIConnector,
  runBohAIReadConnectors,
  summarizeBohAIConnectorResults
} from '@/utils/bohai-connectors.js';
import { createBohAIRetrievalTrace } from '@/utils/bohai-observability.js';
import { SITE_OPERATION_MEMORY } from '@/data/ai-site-guide.js';
import { logger } from '@/utils/logger.js';
import { getHealthContext } from './useHealthRetrieval.js';
import {
  FORUM_MAX_CHARS_PER_POST,
  FORUM_MAX_POSTS,
  KNOWLEDGE_CONTEXT_MAX_BLOCK_CHARS,
  KNOWLEDGE_CONTEXT_MAX_CHARS,
  MEMORY_MAX_CHUNKS,
  SHARED_MEMORY_CACHE_TTL_MS,
  SHARED_MEMORY_CONTEXT_MAX_ITEM_CHARS,
  SHARED_MEMORY_CONTEXT_MAX_ITEMS,
  SHARED_MEMORY_LIMIT,
  SHARED_MEMORY_SEARCH_CACHE_MAX,
  SHARED_MEMORY_SEARCH_FETCH_LIMIT,
  SHARED_MEMORY_TRIGGER_KEYWORDS,
  SITE_GUIDE_MAX_CHUNKS,
  TREEHOLE_CONTEXT_MAX_ITEM_CHARS,
  TREEHOLE_CONTEXT_MAX_ITEMS,
  TREEHOLE_MEMORY_CACHE_TTL_MS,
  TREEHOLE_MEMORY_LIMIT,
  USER_PRIVATE_CONTEXT_CACHE_TTL_MS,
  USER_PRIVATE_CONTEXT_MAX_ITEM_CHARS,
  USER_PRIVATE_CONTEXT_MAX_ITEMS,
  USER_PRIVATE_GIFTS_FETCH_LIMIT,
  USER_PRIVATE_POSTS_FETCH_LIMIT,
  ROUTING_FORUM_REALTIME_PATTERN,
  ROUTING_HISTORY_FACT_PATTERN
} from './chat-engine-config.js';
import {
  getAIMemory,
  normalizeText,
  extractQueryKeywords,
  scoreChunk,
  selectRelevantChunks,
  trimKnowledgeChunk,
  isMissingRelationError,
  normalizePromptLine,
  rankEvidenceContextBlocks,
  compressKnowledgeContextBlocks,
  containsAnyKeyword,
  getPostTitleAndBody,
  formatPromptDate,
  isOperationQuestion,
  shouldUseSiteGuide
} from './bohai-engine-helpers.js';
import {
  resolveUserPrivateRetrievalPlan,
  getUserOverviewContext,
  getUserPostsPrivateContext,
  getUserGiftPrivateContext,
  getUserBirthdayPrivateContext,
  getUserPushplusPrivateContext,
  getUserSubscriptionPrivateContext
} from './useUserPrivateRetrieval.js';
import {
  isCommunityQuestion,
  shouldUseMemoryContext,
  shouldUseSharedMemoryContext,
  shouldUseHealthContext,
  shouldUseTreeholeContext as _shouldUseTreeholeContext
} from './useIntentDetection.js';
import {
  rankForumPostsByQuery,
  getForumTagFilterFromQuery,
  getForumSortModeFromQuery,
  isLatestForumSummaryQuery,
  filterRecentForumPosts,
  sortForumPostsByCreatedAtDesc,
  normalizeForumSummaryText,
  buildForumPostNaturalSummary,
  buildExtractiveForumSummaryAnswer,
  buildForumNarrativeSummaryPrompt,
  removeForumSummaryLinks,
  getForumSummarySourceText,
  FORUM_SUMMARY_POLARITY_RULES,
  detectForumSummaryPolarityConflicts,
  buildForumSearchQueries,
  mergeForumPosts
} from './useForumSummary.js';

/**
 * 知识路由与上下文构建子 composable
 *
 * 从 useChatEngine 中拆出的知识检索相关逻辑。
 * 通过 deps 接收共享响应式状态与外部依赖，不依赖闭包。
 *
 * @param {Object} deps
 * @param {import('vue').Ref<boolean>} deps.isLoggedIn
 * @param {import('vue').Ref<Object>} deps.userInfo
 * @param {import('vue').Ref<boolean>} deps.isTreeholeMemoryEnabled
 * @param {import('vue').Ref<boolean>} deps.isForumSearchEnabled
 * @param {import('vue').Ref<boolean>} deps.isHealthAnalysisEnabled
 * @param {import('vue').Ref<boolean>} deps.isHealthAnalysisDismissed
 * @param {import('vue').Ref<boolean>} deps.isSharedMemoryEnabled
 * @param {import('vue').Ref<boolean>} deps.isKnowledgeBaseEnabled
 * @param {Object} deps.treeholeMemoryCache
 * @param {Object} deps.sharedMemoryCache
 * @param {Map} deps.sharedMemorySearchCache
 * @param {Object} deps.userPrivateContextCache
 * @param {Function} deps.resetUserPrivateContextCache
 * @param {Function} deps.getPosts - 论坛帖子获取 API
 * @param {Function} deps.getUserPosts - 用户帖子获取 API
 * @param {Function} deps.getMySubscriptions - 用户订阅获取 API
 * @param {Function} deps.getSharedAIMemoriesForAI - 公共记忆读取 API
 * @param {Function} deps.searchSharedAIMemoriesForAI - 公共记忆搜索 API
 * @param {Function} deps.searchBohAIKnowledgeForAI - 向量知识检索 API
 * @param {Function} deps.getMyCloudEntriesForAI - BOH Cloud+ 条目获取 API
 * @param {Object} deps.supabase - Supabase 客户端实例
 */
export function useKnowledgeRetrieval(deps) {
  const {
    isLoggedIn,
    userInfo,
    isTreeholeMemoryEnabled,
    isForumSearchEnabled,
    isHealthAnalysisEnabled,
    isHealthAnalysisDismissed,
    isSharedMemoryEnabled,
    isKnowledgeBaseEnabled,
    treeholeMemoryCache,
    sharedMemoryCache,
    sharedMemorySearchCache,
    userPrivateContextCache,
    resetUserPrivateContextCache,
    getPosts,
    getUserPosts,
    getMySubscriptions,
    getSharedAIMemoriesForAI,
    searchSharedAIMemoriesForAI,
    searchBohAIKnowledgeForAI,
    getMyCloudEntriesForAI,
    supabase
  } = deps;

  // ============================================================
  // 知识上下文块构建
  // ============================================================

  const buildKnowledgeContextBlock = (title, chunks, { citationPrefix = 'K' } = {}) => {
    if (!chunks || chunks.length === 0) return '';
    const body = chunks
      .map((chunk, index) => `[${citationPrefix}${index + 1}] ${trimKnowledgeChunk(chunk)}`)
      .join('\n\n');
    return `【${title}】\n${body}`;
  };

  const getVectorKnowledgeChunks = async (queryText, {
    sourceTypes = ['shared_memory'],
    limit = 8,
    syncLimit = 40,
    minSimilarity = 0.18
  } = {}) => {
    const safeQuery = normalizePromptLine(queryText, 220);
    if (!safeQuery) return [];

    try {
      const result = await searchBohAIKnowledgeForAI({
        query: safeQuery,
        sourceTypes,
        limit,
        syncLimit,
        minSimilarity,
        ensureIndexed: true
      });

      if (!result.ok) {
        logger.warn('boh-ai', '向量检索失败，回退关键词检索', result.error?.message || result.error);
        return [];
      }

      const chunks = Array.isArray(result.data?.chunks) ? result.data.chunks : [];
      return chunks.filter((chunk) => normalizePromptLine(chunk?.content, 20));
    } catch (error) {
      logger.error('boh-ai', '向量检索异常', error);
      return [];
    }
  };

  const buildVectorKnowledgeContext = (title, chunks, {
    citationPrefix = 'V',
    maxItems = 8,
    maxContentChars = 320
  } = {}) => {
    const source = Array.isArray(chunks) ? chunks.slice(0, maxItems) : [];
    if (source.length === 0) return '';

    const body = source.map((chunk, index) => {
      const metadata = chunk?.metadata && typeof chunk.metadata === 'object' ? chunk.metadata : {};
      const content = normalizePromptLine(chunk?.content, maxContentChars);
      const chunkTitle = normalizePromptLine(chunk?.title, 80);
      const time = normalizePromptLine(metadata.updatedAt || metadata.entryDate || chunk?.updated_at, 40) || '未知';
      const mood = normalizePromptLine(metadata.mood, 24);
      const tags = Array.isArray(metadata.tags) && metadata.tags.length > 0
        ? metadata.tags.map((tag) => normalizePromptLine(tag, 20)).filter(Boolean).join('、')
        : '';
      const similarity = Number(chunk?.similarity);
      const retrievalMethod = normalizePromptLine(
        metadata.retrievalMethod || chunk?.retrievalMethod,
        20
      );
      const scoreText = Number.isFinite(similarity) && similarity > 0
        ? `\n相关度: ${Math.round(similarity * 100)}%`
        : '';
      const methodText = retrievalMethod ? `\n检索: ${retrievalMethod}` : '';
      const titleText = chunkTitle ? `\n标题: ${chunkTitle}` : '';
      const moodText = mood ? `\n心情: ${mood}` : '';
      const tagsText = tags ? `\n标签: ${tags}` : '';
      return `[${citationPrefix}${index + 1}] 时间: ${time}${titleText}${moodText}${tagsText}${scoreText}${methodText}\n内容: ${content || '（空）'}`;
    }).join('\n\n');

    return `【${title}】\n${body}`;
  };

  // ============================================================
  // 核心记忆库
  // ============================================================

  const getMemoryContext = async (queryText) => {
    const vectorPromise = getVectorKnowledgeChunks(queryText, {
      sourceTypes: ['core_memory', 'knowledge_base'],
      limit: Math.max(MEMORY_MAX_CHUNKS, 8),
      syncLimit: 60,
      minSimilarity: 0.1
    });
    const keywordPromise = getAIMemory();

    const [vectorChunks, memoryResult] = await Promise.allSettled([vectorPromise, keywordPromise]);
    const vectorChunksResolved = vectorChunks.status === 'fulfilled' ? vectorChunks.value : [];

    if (vectorChunksResolved.length > 0) {
      return buildVectorKnowledgeContext('官方事实与导入知识库语义检索结果', vectorChunksResolved, {
        citationPrefix: 'K',
        maxItems: MEMORY_MAX_CHUNKS,
        maxContentChars: 520
      });
    }

    const memory = memoryResult.status === 'fulfilled' ? memoryResult.value : null;
    if (!memory) return '';
    const chunks = selectRelevantChunks(memory, queryText, MEMORY_MAX_CHUNKS);
    return buildKnowledgeContextBlock('核心记忆库检索结果', chunks, { citationPrefix: 'K' });
  };

  // ============================================================
  // 共享记忆
  // ============================================================

  let _sharedMemoryPending = null;

  const getSharedMemoriesCached = async () => {
    const now = Date.now();
    const shouldUseCache = (now - sharedMemoryCache.fetchedAt) < SHARED_MEMORY_CACHE_TTL_MS
      && Array.isArray(sharedMemoryCache.items);

    if (shouldUseCache) {
      return sharedMemoryCache.items;
    }

    if (_sharedMemoryPending) return _sharedMemoryPending;

    _sharedMemoryPending = (async () => {
      try {
        const result = await getSharedAIMemoriesForAI({ limit: SHARED_MEMORY_LIMIT });
        if (!result.ok) {
          logger.warn('boh-ai', '读取 AI 公共记忆失败', result.error?.message || result.error);
          sharedMemoryCache.fetchedAt = Date.now();
          sharedMemoryCache.items = [];
          return [];
        }
        const items = Array.isArray(result.data) ? result.data : [];
        sharedMemoryCache.fetchedAt = Date.now();
        sharedMemoryCache.items = items;
        return items;
      } finally {
        _sharedMemoryPending = null;
      }
    })();

    return _sharedMemoryPending;
  };

  const selectSharedMemoriesByQuery = (memories, queryText, maxItems = SHARED_MEMORY_CONTEXT_MAX_ITEMS) => {
    const source = Array.isArray(memories) ? memories : [];
    if (source.length === 0) return [];

    const keywords = extractQueryKeywords(queryText);
    const scored = source.map((item) => {
      const content = normalizePromptLine(item?.content, SHARED_MEMORY_CONTEXT_MAX_ITEM_CHARS);
      const mood = normalizePromptLine(item?.mood, 24);
      const tags = Array.isArray(item?.tags) ? item.tags.join(' ') : '';
      const merged = `${content}\n${mood}\n${tags}`;
      return {
        item,
        score: scoreChunk(merged, keywords)
      };
    });

    const matched = scored
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxItems)
      .map((entry) => entry.item);

    if (matched.length > 0) return matched;
    return [];
  };

  const getSharedMemoriesByQuery = async (queryText = '', { limit = SHARED_MEMORY_SEARCH_FETCH_LIMIT } = {}) => {
    const safeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(60, Math.trunc(limit)))
      : SHARED_MEMORY_SEARCH_FETCH_LIMIT;
    const safeQuery = normalizePromptLine(queryText, 220);
    const cacheKey = normalizeText(safeQuery) || '__empty_query__';
    const now = Date.now();
    const cached = sharedMemorySearchCache.get(cacheKey);
    if (cached && (now - cached.fetchedAt) < SHARED_MEMORY_CACHE_TTL_MS && Array.isArray(cached.items)) {
      // LRU bump: delete and re-set to move to end
      sharedMemorySearchCache.delete(cacheKey);
      sharedMemorySearchCache.set(cacheKey, cached);
      return cached.items;
    }

    try {
      if (safeQuery) {
        const searchResult = await searchSharedAIMemoriesForAI({
          query: safeQuery,
          limit: safeLimit
        });
        if (searchResult.ok && Array.isArray(searchResult.data)) {
          if (sharedMemorySearchCache.size >= SHARED_MEMORY_SEARCH_CACHE_MAX) {
            const firstKey = sharedMemorySearchCache.keys().next().value;
            sharedMemorySearchCache.delete(firstKey);
          }
          sharedMemorySearchCache.set(cacheKey, {
            fetchedAt: now,
            items: searchResult.data
          });
          return searchResult.data;
        }
        if (!searchResult.ok) {
          logger.warn('boh-ai', '共享记忆搜索 RPC 失败，回退本地筛选', searchResult.error?.message || searchResult.error);
        }
      }

      const fallbackSource = await getSharedMemoriesCached();
      const fallbackItems = safeQuery
        ? selectSharedMemoriesByQuery(fallbackSource, safeQuery, safeLimit)
        : fallbackSource.slice(0, safeLimit);
      if (sharedMemorySearchCache.size >= SHARED_MEMORY_SEARCH_CACHE_MAX) {
        const firstKey = sharedMemorySearchCache.keys().next().value;
        sharedMemorySearchCache.delete(firstKey);
      }
      sharedMemorySearchCache.set(cacheKey, {
        fetchedAt: now,
        items: fallbackItems
      });
      return fallbackItems;
    } catch (error) {
      logger.error('boh-ai', '共享记忆搜索异常', error);
      return [];
    }
  };

  const getSharedMemoryContext = async (queryText) => {
    const vectorPromise = getVectorKnowledgeChunks(queryText, {
      sourceTypes: ['shared_memory'],
      limit: SHARED_MEMORY_CONTEXT_MAX_ITEMS,
      syncLimit: SHARED_MEMORY_SEARCH_FETCH_LIMIT,
      minSimilarity: 0.12
    });
    const keywordPromise = getSharedMemoriesByQuery(queryText, { limit: SHARED_MEMORY_SEARCH_FETCH_LIMIT });

    const [vectorChunks, keywordResult] = await Promise.allSettled([vectorPromise, keywordPromise]);
    const vectorChunksResolved = vectorChunks.status === 'fulfilled' ? vectorChunks.value : [];

    if (vectorChunksResolved.length > 0) {
      return {
        context: buildVectorKnowledgeContext('AI公共记忆库语义检索结果', vectorChunksResolved, {
          citationPrefix: 'S',
          maxItems: SHARED_MEMORY_CONTEXT_MAX_ITEMS,
          maxContentChars: SHARED_MEMORY_CONTEXT_MAX_ITEM_CHARS
        }),
        total: vectorChunksResolved.length
      };
    }

    const memories = keywordResult.status === 'fulfilled' ? keywordResult.value : [];
    if (!Array.isArray(memories) || memories.length === 0) {
      return { context: '', total: 0 };
    }

    const selected = selectSharedMemoriesByQuery(memories, queryText, SHARED_MEMORY_CONTEXT_MAX_ITEMS);
    if (selected.length === 0) {
      return { context: '', total: 0 };
    }

    const body = selected.map((item, index) => {
      const content = normalizePromptLine(item?.content, SHARED_MEMORY_CONTEXT_MAX_ITEM_CHARS);
      const mood = normalizePromptLine(item?.mood, 24) || '未标注';
      const tags = Array.isArray(item?.tags) && item.tags.length > 0
        ? item.tags.map((tag) => normalizePromptLine(tag, 20)).filter(Boolean).join('、')
        : '无';
      const time = normalizePromptLine(item?.updatedAt || item?.createdAt, 40) || '未知';
      return `[S${index + 1}] 时间: ${time}\n心情: ${mood}\n标签: ${tags}\n内容: ${content || '（空）'}`;
    }).join('\n\n');

    return {
      context: `【AI公共记忆库检索结果】\n${body}`,
      total: selected.length
    };
  };

  // ============================================================
  // 站点指南
  // ============================================================

  const getSiteGuideContext = (queryText) => {
    const chunks = selectRelevantChunks(SITE_OPERATION_MEMORY, queryText, SITE_GUIDE_MAX_CHUNKS);
    return buildKnowledgeContextBlock('站点操作与路径知识库', chunks, { citationPrefix: 'G' });
  };

  // ============================================================
  // 树洞 / BOH Cloud+
  // ============================================================

  const shouldUseTreeholeContext = (text) => _shouldUseTreeholeContext(text, {
    isTreeholeMemoryEnabled: isTreeholeMemoryEnabled.value,
    isLoggedIn: isLoggedIn.value,
    userInfo: userInfo.value
  });

  let _treeholeMemoryPending = null;

  const getTreeholeMemoriesCached = async () => {
    const userId = String(userInfo.value?.id || '').trim();
    if (!userId || !isLoggedIn.value) {
      treeholeMemoryCache.userId = '';
      treeholeMemoryCache.fetchedAt = 0;
      treeholeMemoryCache.items = [];
      return [];
    }

    const now = Date.now();
    const shouldUseCache = treeholeMemoryCache.userId === userId
      && (now - treeholeMemoryCache.fetchedAt) < TREEHOLE_MEMORY_CACHE_TTL_MS
      && Array.isArray(treeholeMemoryCache.items);

    if (shouldUseCache) {
      return treeholeMemoryCache.items;
    }

    if (_treeholeMemoryPending) return _treeholeMemoryPending;

    _treeholeMemoryPending = (async () => {
      try {
        const result = await getMyCloudEntriesForAI(userId, { limit: TREEHOLE_MEMORY_LIMIT });
        if (!result.ok) {
          logger.warn('boh-ai', '读取 BOH Cloud+ 上下文失败', result.error?.message || result.error);
          treeholeMemoryCache.userId = userId;
          treeholeMemoryCache.fetchedAt = Date.now();
          treeholeMemoryCache.items = [];
          return [];
        }

        const items = Array.isArray(result.data) ? result.data : [];
        treeholeMemoryCache.userId = userId;
        treeholeMemoryCache.fetchedAt = Date.now();
        treeholeMemoryCache.items = items;
        return items;
      } catch (error) {
        logger.error('boh-ai', '读取 BOH Cloud+ 异常', error);
        treeholeMemoryCache.userId = userId;
        treeholeMemoryCache.fetchedAt = Date.now();
        treeholeMemoryCache.items = [];
        return [];
      } finally {
        _treeholeMemoryPending = null;
      }
    })();

    return _treeholeMemoryPending;
  };

  const selectTreeholeMemoriesByQuery = (memories, queryText) => {
    const source = Array.isArray(memories) ? memories : [];
    if (source.length === 0) return [];

    const keywords = extractQueryKeywords(queryText);
    if (keywords.length === 0) {
      return source.slice(0, TREEHOLE_CONTEXT_MAX_ITEMS);
    }

    const scored = source
      .map((item, index) => {
        const content = normalizePromptLine(item?.content, TREEHOLE_CONTEXT_MAX_ITEM_CHARS);
        const mood = normalizePromptLine(item?.mood, 24);
        const tags = Array.isArray(item?.tags) ? item.tags.join(' ') : '';
        const title = normalizePromptLine(item?.title, 80);
        return {
          item,
          index,
          score: scoreChunk(`${title}\n${content}\n${mood}\n${tags}`, keywords)
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, TREEHOLE_CONTEXT_MAX_ITEMS)
      .map((entry) => entry.item);

    return scored.length > 0 ? scored : source.slice(0, TREEHOLE_CONTEXT_MAX_ITEMS);
  };

  const getTreeholeContext = async (queryText) => {
    const vectorPromise = getVectorKnowledgeChunks(queryText, {
      sourceTypes: ['cloud_entry'],
      limit: Math.min(12, TREEHOLE_CONTEXT_MAX_ITEMS),
      syncLimit: Math.min(80, TREEHOLE_MEMORY_LIMIT)
    });
    const keywordPromise = getTreeholeMemoriesCached();

    const [vectorChunks, memoryResult] = await Promise.allSettled([vectorPromise, keywordPromise]);
    const vectorChunksResolved = vectorChunks.status === 'fulfilled' ? vectorChunks.value : [];

    if (vectorChunksResolved.length > 0) {
      return {
        context: buildVectorKnowledgeContext('用户 BOH Cloud+ 语义检索结果', vectorChunksResolved, {
          citationPrefix: 'T',
          maxItems: Math.min(12, TREEHOLE_CONTEXT_MAX_ITEMS),
          maxContentChars: TREEHOLE_CONTEXT_MAX_ITEM_CHARS
        }),
        total: vectorChunksResolved.length
      };
    }

    const memories = memoryResult.status === 'fulfilled' ? memoryResult.value : [];
    if (!Array.isArray(memories) || memories.length === 0) {
      return { context: '', total: 0 };
    }

    const selected = selectTreeholeMemoriesByQuery(memories, queryText);
    if (selected.length === 0) {
      return { context: '', total: memories.length };
    }

    const body = selected.map((item, index) => {
      const content = normalizePromptLine(item?.content, TREEHOLE_CONTEXT_MAX_ITEM_CHARS);
      const mood = normalizePromptLine(item?.mood, 24) || '未标注';
      const tags = Array.isArray(item?.tags) && item.tags.length > 0
        ? item.tags.map((tag) => normalizePromptLine(tag, 20)).filter(Boolean).join('、')
        : '无';
      const time = normalizePromptLine(item?.updatedAt || item?.createdAt, 40) || '未知';
      return `[T${index + 1}] 时间: ${time}\n心情: ${mood}\n标签: ${tags}\n内容: ${content || '（空）'}`;
    }).join('\n\n');

    return {
      context: `【用户 BOH Cloud+ 全部内容】\n${body}`,
      total: memories.length
    };
  };

  // ============================================================
  // 论坛（纯函数从 useForumSummary.js 导入）
  // ============================================================

  // 获取论坛数据
  const getForumContext = async (queryText = '') => {
    try {
      const latestSummaryMode = isLatestForumSummaryQuery(queryText);
      const sortMode = latestSummaryMode ? 'latest' : getForumSortModeFromQuery(queryText);
      const tagFilter = getForumTagFilterFromQuery(queryText);
      const candidateQueries = latestSummaryMode ? [] : buildForumSearchQueries(queryText);
      const mergedPosts = [];

      if (candidateQueries.length > 0) {
        const searchResults = await Promise.allSettled(
          candidateQueries.map((searchQuery) => getPosts(null, {
            page: 1,
            pageSize: 8,
            limit: 8,
            sortMode,
            searchQuery,
            tagFilter
          }))
        );
        for (const result of searchResults) {
          if (result.status === 'fulfilled' && result.value?.data) {
            mergeForumPosts(mergedPosts, result.value.data);
          }
        }
      }

      if (mergedPosts.length < FORUM_MAX_POSTS) {
        const { data: fallbackPosts } = await getPosts(null, {
          page: 1,
          pageSize: latestSummaryMode ? FORUM_MAX_POSTS : 10,
          limit: latestSummaryMode ? FORUM_MAX_POSTS : 10,
          sortMode,
          tagFilter
        });
        mergeForumPosts(mergedPosts, fallbackPosts);
      }

      const posts = mergedPosts;
      if (!Array.isArray(posts) || posts.length === 0) return '';

      const recentPosts = filterRecentForumPosts(posts);
      const recentSource = recentPosts.length > 0 ? recentPosts : posts;
      const rankedPosts = sortMode === 'latest'
        ? sortForumPostsByCreatedAtDesc(recentSource)
        : rankForumPostsByQuery(recentSource, queryText);
      const selectedPosts = rankedPosts.slice(0, FORUM_MAX_POSTS);
      const forumContext = selectedPosts.map((post, index) => {
        const parsed = getPostTitleAndBody(post);
        const title = parsed.title || '无标题';
        const author = normalizePromptLine(post?.author_username, 40) || '未知作者';
        const authorIdLabel = author === '未知作者' ? '未知作者' : `@${author.replace(/^@+/, '')}`;
        const preview = String(parsed.body || '').slice(0, FORUM_MAX_CHARS_PER_POST);
        const likes = Number(post?.like_count || post?.likes_count || 0);
        const comments = Number(post?.comment_count || 0);
        const tag = normalizePromptLine(post?.tagLabel || post?.tag, 24) || '未标注';
        const time = formatPromptDate(post?.created_at, '未知');
        const postId = String(post?.id || '').trim();
        const url = postId ? `#/forum/post/${postId}` : '#/forum';
        const excerpt = normalizePromptLine(post?.search_excerpt, FORUM_MAX_CHARS_PER_POST);
        return [
          `[F${index + 1}] 【论坛帖子】${title}`,
          `发帖ID：${authorIdLabel} ｜ 标签：${tag} ｜ 时间：${time}`,
          `查看：${url}`,
          `内容：${excerpt || preview}${!excerpt && parsed.body.length > FORUM_MAX_CHARS_PER_POST ? '...' : ''}`,
          `互动：点赞 ${likes}，评论 ${comments}`
        ].join('\n');
      }).join('\n\n');

      return {
        context: `【社区帖子检索结果】\n检索词：${candidateQueries.join(' / ') || '最新社区帖子'}\n范围：近 30 日优先${recentPosts.length > 0 ? '' : '（近 30 日无结果，回退到最近可用帖子）'}\n排序：${sortMode === 'hottest' ? '近期热门优先' : '最新优先'}${tagFilter ? `\n标签过滤：${tagFilter}` : ''}${latestSummaryMode || sortMode === 'latest' ? `\n输出约束：必须严格按 [F1] 到 [F${selectedPosts.length}] 的顺序总结；[F1] 是当前检索到的最新发布帖子，后续依次按发布时间从新到旧排列。不要按热度、重要性或相关性重排。` : ''}\n\n${forumContext}`,
        total: selectedPosts.length,
        evidenceRefs: selectedPosts.map((_, index) => `F${index + 1}`),
        labels: [`社区帖子(${selectedPosts.length}条)`],
        confidence: selectedPosts.length > 0 ? 0.86 : 0,
        metadata: {
          sortMode,
          tagFilter,
          query: candidateQueries[0] || '',
          latestSummaryMode,
          recentOnly: recentPosts.length > 0,
          recentWindowDays: 30,
          posts: selectedPosts
        }
      };
    } catch (error) {
      logger.error('boh-ai', '获取论坛数据失败', error);
      return { context: '', total: 0 };
    }
  };

  // ============================================================
  // 用户私域
  // ============================================================

  const getUserPrivateSnapshotCached = async () => {
    const userId = String(userInfo.value?.id || '').trim();
    if (!userId || !isLoggedIn.value) {
      resetUserPrivateContextCache();
      return null;
    }

    const now = Date.now();
    const shouldUseCache = userPrivateContextCache.userId === userId
      && (now - userPrivateContextCache.fetchedAt) < USER_PRIVATE_CONTEXT_CACHE_TTL_MS
      && userPrivateContextCache.snapshot;
    if (shouldUseCache) {
      return userPrivateContextCache.snapshot;
    }

    const [
      profileResult,
      postResult,
      giftResult,
      subscriptionResult
    ] = await Promise.allSettled([
      supabase
        .from('profiles')
        .select(`
          id,
          username,
          role,
          points,
          join_date,
          birth_month,
          birth_day,
          pushplus_enabled,
          gift_status
        `)
        .eq('id', userId)
        .maybeSingle(),
      getUserPosts(userId, userId, { page: 1, pageSize: USER_PRIVATE_POSTS_FETCH_LIMIT, limit: USER_PRIVATE_POSTS_FETCH_LIMIT }),
      supabase
        .from('user_gifts')
        .select(`
          id,
          user_id,
          gift_no,
          gift_content,
          gift_price,
          gift_status,
          is_active,
          completed_at,
          created_at,
          updated_at
        `)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(USER_PRIVATE_GIFTS_FETCH_LIMIT),
      getMySubscriptions(userId, { includeExpired: true })
    ]);

    const profileValue = profileResult.status === 'fulfilled' ? profileResult.value : null;
    if (profileValue?.error && !isMissingRelationError(profileValue.error, 'profiles')) {
      logger.warn('boh-ai', '读取当前用户档案失败', profileValue.error?.message || profileValue.error);
    }

    const postValue = postResult.status === 'fulfilled' ? postResult.value : null;
    if (postValue?.error && !isMissingRelationError(postValue.error, 'posts')) {
      logger.warn('boh-ai', '读取当前用户帖子失败', postValue.error?.message || postValue.error);
    }

    const giftValue = giftResult.status === 'fulfilled' ? giftResult.value : null;
    if (giftValue?.error && !isMissingRelationError(giftValue.error, 'user_gifts')) {
      logger.warn('boh-ai', '读取当前用户礼物失败', giftValue.error?.message || giftValue.error);
    }

    const subscriptionValue = subscriptionResult.status === 'fulfilled' ? subscriptionResult.value : null;
    if (subscriptionValue?.error && !isMissingRelationError(subscriptionValue.error, 'user_subscriptions')) {
      logger.warn('boh-ai', '读取当前用户订阅失败', subscriptionValue.error?.message || subscriptionValue.error);
    }

    const mergedProfile = {
      id: userId,
      username: String(userInfo.value?.username || ''),
      role: String(userInfo.value?.role || 'user'),
      points: Number(userInfo.value?.points || 0),
      join_date: userInfo.value?.joinDate || null,
      birth_month: userInfo.value?.birthMonth || '',
      birth_day: userInfo.value?.birthDay || '',
      pushplus_enabled: false,
      gift_status: '',
      gift_content: '',
      gift_no: '',
      gift_price: 0,
      ...(profileValue?.data || {})
    };
    mergedProfile.points = Number(mergedProfile.points || 0);
    mergedProfile.gift_price = Number(mergedProfile.gift_price || 0);
    mergedProfile.pushplus_enabled = Boolean(mergedProfile.pushplus_enabled);

    const snapshot = {
      userId,
      profile: mergedProfile,
      posts: Array.isArray(postValue?.data) ? postValue.data : [],
      gifts: Array.isArray(giftValue?.data) ? giftValue.data : [],
      subscriptions: Array.isArray(subscriptionValue?.data) ? subscriptionValue.data : []
    };

    userPrivateContextCache.userId = userId;
    userPrivateContextCache.fetchedAt = now;
    userPrivateContextCache.snapshot = snapshot;
    return snapshot;
  };

  const getUserPrivateContext = async (queryText) => {
    const plan = resolveUserPrivateRetrievalPlan(queryText);
    if (!plan.shouldUse) {
      return {
        context: '',
        labels: []
      };
    }

    if (!isLoggedIn.value || !userInfo.value?.id) {
      return {
        context: '【用户私域证据 [U1]】\n未检测到登录用户。若需要查询"我的帖子/礼物/生日会/Pushplus/订阅积分"，请先登录账号。',
        labels: ['登录状态(未登录)']
      };
    }

    const snapshot = await getUserPrivateSnapshotCached();
    if (!snapshot) {
      return {
        context: '',
        labels: []
      };
    }

    const blocks = [];
    const labels = [];

    if (plan.overview) {
      const result = getUserOverviewContext(snapshot);
      if (result?.context) {
        blocks.push(result.context);
        if (result.label) labels.push(result.label);
      }
    }

    if (plan.posts) {
      const result = getUserPostsPrivateContext(snapshot, queryText);
      if (result?.context) {
        blocks.push(result.context);
        if (result.label) labels.push(result.label);
      }
    }

    if (plan.gifts) {
      const result = getUserGiftPrivateContext(snapshot);
      if (result?.context) {
        blocks.push(result.context);
        if (result.label) labels.push(result.label);
      }
    }

    if (plan.birthday) {
      const result = getUserBirthdayPrivateContext(snapshot);
      if (result?.context) {
        blocks.push(result.context);
        if (result.label) labels.push(result.label);
      }
    }

    if (plan.pushplus) {
      const result = getUserPushplusPrivateContext(snapshot);
      if (result?.context) {
        blocks.push(result.context);
        if (result.label) labels.push(result.label);
      }
    }

    if (plan.subscriptions) {
      const result = getUserSubscriptionPrivateContext(snapshot);
      if (result?.context) {
        blocks.push(result.context);
        if (result.label) labels.push(result.label);
      }
    }

    const wrappedBlocks = blocks
      .map((block, index) => `【用户私域证据 [U${index + 1}]】\n${block}`)
      .filter(Boolean);

    return {
      context: wrappedBlocks.join('\n\n'),
      labels
    };
  };

  // ============================================================
  // 知识路由
  // ============================================================

  const resolveKnowledgeRoutingPlan = (queryText) => {
    const normalized = normalizeText(queryText);
    const operation = isOperationQuestion(normalized);
    const community = isCommunityQuestion(normalized);
    const forumRealtime = community && ROUTING_FORUM_REALTIME_PATTERN.test(normalized);
    const communityHistory = community && ROUTING_HISTORY_FACT_PATTERN.test(normalized);
    const userPrivatePlan = resolveUserPrivateRetrievalPlan(normalized);
    const hasSharedMemoryTrigger = containsAnyKeyword(normalized, SHARED_MEMORY_TRIGGER_KEYWORDS);

    const basePlan = {
      treehole: shouldUseTreeholeContext(normalized),
      sharedMemory: shouldUseSharedMemoryContext(normalized),
      memory: shouldUseMemoryContext(normalized),
      siteGuide: shouldUseSiteGuide(normalized),
      // forum 仅由用户手动开关控制，不再自动判定
      forum: false,
      userPrivate: userPrivatePlan.shouldUse,
      health: shouldUseHealthContext(normalized)
    };

    return resolveKnowledgeRoutingPlanCore({
      basePlan,
      operation,
      community,
      forumRealtime,
      communityHistory,
      hasSharedMemoryTrigger
    });
  };

  const getRetrievalTargetLabels = (plan = {}) => {
    const labels = [];
    if (plan.forum) labels.push('社区帖子');
    if (plan.memory) labels.push('核心记忆库/导入知识库');
    if (plan.sharedMemory) labels.push('AI 公共记忆');
    if (plan.siteGuide) labels.push('站点操作手册');
    if (plan.treehole) labels.push('BOH Cloud+');
    if (plan.userPrivate) labels.push('当前账号资料');
    if (plan.health) labels.push('BOH Health 数据');
    return labels;
  };

  const buildVisibleRetrievalActionNote = (retrievalPlan = {}, {
    treeholeTotal = 0,
    sharedMemoryTotal = 0,
    userPrivateLabels = []
  } = {}) => {
    const parts = [];
    if (retrievalPlan.treehole) {
      parts.push(treeholeTotal > 0 ? `看了你的 BOH Cloud+ ${treeholeTotal} 条内容` : '看了你的 BOH Cloud+');
    }
    if (retrievalPlan.memory) parts.push('查看了 BOH 历史背景与导入知识库');
    if (retrievalPlan.sharedMemory) {
      parts.push(sharedMemoryTotal > 0 ? `查看了公共记忆库 ${sharedMemoryTotal} 条内容` : '查看了公共记忆库');
    }
    if (retrievalPlan.forum) parts.push('浏览了社区帖子');
    if (retrievalPlan.siteGuide) parts.push('查看了站点操作手册');
    if (retrievalPlan.userPrivate) {
      const labelText = Array.isArray(userPrivateLabels) && userPrivateLabels.length > 0
        ? userPrivateLabels.slice(0, 2).join('、')
        : '当前账号资料';
      parts.push(`查看了${labelText}`);
    }
    if (retrievalPlan.health) parts.push('查看了你的 BOH Health 数据');
    if (parts.length === 0) return '';
    return `${parts.join('，')}。`;
  };

  // ============================================================
  // 读取连接器
  // ============================================================

  const createReadConnectors = () => [
    createBohAIConnector({
      id: BOHAI_CONNECTOR_IDS.cloud,
      planKey: 'treehole',
      label: 'BOH Cloud+',
      source: 'BOH Cloud+ 私有内容',
      evidencePrefix: 'T',
      requiresLogin: true,
      read: getTreeholeContext,
      describeAction: (result) => (
        Number(result?.total || 0) > 0
          ? `看了你的 BOH Cloud+ ${Number(result.total)} 条内容`
          : '看了你的 BOH Cloud+'
      )
    }),
    createBohAIConnector({
      id: BOHAI_CONNECTOR_IDS.sharedMemory,
      planKey: 'sharedMemory',
      label: 'AI 公共记忆',
      source: 'AI 公共记忆库',
      evidencePrefix: 'S',
      read: getSharedMemoryContext,
      describeAction: (result) => (
        Number(result?.total || 0) > 0
          ? `查看了公共记忆库 ${Number(result.total)} 条内容`
          : '查看了公共记忆库'
      )
    }),
    createBohAIConnector({
      id: BOHAI_CONNECTOR_IDS.knowledge,
      planKey: 'memory',
      label: '核心记忆库/导入知识库',
      source: 'BOH 历史背景与导入知识库',
      evidencePrefix: 'K',
      read: getMemoryContext,
      describeAction: () => '查看了 BOH 历史背景与导入知识库'
    }),
    createBohAIConnector({
      id: BOHAI_CONNECTOR_IDS.siteGuide,
      planKey: 'siteGuide',
      label: '站点操作手册',
      source: '站点操作与路径知识库',
      evidencePrefix: 'G',
      read: (queryText) => getSiteGuideContext(queryText),
      describeAction: () => '查看了站点操作手册'
    }),
    createBohAIConnector({
      id: BOHAI_CONNECTOR_IDS.forum,
      planKey: 'forum',
      label: '社区帖子',
      source: '社区帖子',
      evidencePrefix: 'F',
      read: getForumContext,
      describeAction: (result) => {
        const total = Number(result?.total || 0);
        return total > 0 ? `检索了社区帖子 ${total} 条` : '检索了社区帖子';
      }
    }),
    createBohAIConnector({
      id: BOHAI_CONNECTOR_IDS.userPrivate,
      planKey: 'userPrivate',
      label: '当前账号资料',
      source: '当前登录用户私域数据',
      evidencePrefix: 'U',
      requiresLogin: true,
      read: getUserPrivateContext,
      describeAction: (result) => {
        const labels = Array.isArray(result?.labels) ? result.labels : [];
        const labelText = labels.length > 0 ? labels.slice(0, 2).join('、') : '当前账号资料';
        return `查看了${labelText}`;
      }
    }),
    createBohAIConnector({
      id: BOHAI_CONNECTOR_IDS.health,
      planKey: 'health',
      label: 'BOH Health 数据',
      source: 'BOH Health 本机健康记录',
      evidencePrefix: 'H',
      // 数据存在用户本机 localStorage，不要求登录
      requiresLogin: false,
      read: getHealthContext,
      describeAction: (result) => {
        const total = Number(result?.total || 0);
        return total > 0 ? `查看了你的 BOH Health 数据 ${total} 组` : '查看了你的 BOH Health 数据';
      }
    })
  ];

  // ============================================================
  // 自动知识上下文构建
  // ============================================================

  const buildAutoKnowledgeContext = async (queryText, { forceTreehole = false } = {}) => {
    const routingDecision = resolveKnowledgeRoutingPlan(queryText);
    const retrievalPlan = routingDecision.plan;
    if (forceTreehole && isLoggedIn.value && userInfo.value?.id && isTreeholeMemoryEnabled.value) {
      retrievalPlan.treehole = true;
    }
    if (isForumSearchEnabled.value) {
      retrievalPlan.forum = true;
    }
    // 健康分析由用户显式开启（/health 或输入框 chip）时强制读取本机健康数据，
    // 无需问题里恰好出现健康关键词。
    if (isHealthAnalysisEnabled?.value) {
      retrievalPlan.health = true;
    } else if (isHealthAnalysisDismissed?.value) {
      // 用户显式关闭过健康分析：即使命中健康关键词也不再读取健康数据
      retrievalPlan.health = false;
    }
    // 统一开关过滤：未开启的知识源强制关闭
    if (!isSharedMemoryEnabled.value) {
      retrievalPlan.sharedMemory = false;
    }
    if (!isKnowledgeBaseEnabled.value) {
      retrievalPlan.memory = false;
      retrievalPlan.siteGuide = false;
    }
    const routingReasons = Array.isArray(routingDecision.reasons) ? routingDecision.reasons : [];
    const connectorResults = await runBohAIReadConnectors({
      connectors: createReadConnectors(),
      plan: retrievalPlan,
      queryText,
      logger
    });
    const connectorSummary = summarizeBohAIConnectorResults(connectorResults);
    const rankedContextBlocks = rankEvidenceContextBlocks(connectorResults, queryText).map((item) => item.context);

    const contextText = compressKnowledgeContextBlocks(rankedContextBlocks.length > 0 ? rankedContextBlocks : connectorSummary.contextBlocks, {
      maxChars: KNOWLEDGE_CONTEXT_MAX_CHARS,
      maxPerBlock: KNOWLEDGE_CONTEXT_MAX_BLOCK_CHARS
    });
    const evidenceRefs = connectorSummary.evidenceRefs.length > 0
      ? connectorSummary.evidenceRefs
      : extractCitationIdsFromText(contextText);
    const retrievalTrace = createBohAIRetrievalTrace({
      queryText,
      retrievalPlan,
      routingReasons,
      connectorResults
    });

    return {
      retrievalPlan,
      routingReasons,
      connectorResults,
      retrievalTrace,
      treeholeTotal: Number(connectorSummary.totalsById[BOHAI_CONNECTOR_IDS.cloud] || 0),
      sharedMemoryTotal: Number(connectorSummary.totalsById[BOHAI_CONNECTOR_IDS.sharedMemory] || 0),
      userPrivateLabels: connectorSummary.labelsById[BOHAI_CONNECTOR_IDS.userPrivate] || [],
      evidenceRefs,
      contextText
    };
  };

  return {
    resolveKnowledgeRoutingPlan,
    buildAutoKnowledgeContext,
    createReadConnectors,
    getMemoryContext,
    getSharedMemoryContext,
    getSharedMemoriesCached,
    getSharedMemoriesByQuery,
    getTreeholeContext,
    getTreeholeMemoriesCached,
    getSiteGuideContext,
    getForumContext,
    getUserPrivateContext,
    getUserPrivateSnapshotCached,
    getVectorKnowledgeChunks,
    buildKnowledgeContextBlock,
    buildVectorKnowledgeContext,
    getRetrievalTargetLabels,
    buildVisibleRetrievalActionNote,
    // 内部辅助（仍导出以供 useChatEngine 解构）
    selectSharedMemoriesByQuery,
    selectTreeholeMemoriesByQuery,
    shouldUseTreeholeContext,
    // 论坛摘要纯函数（从 useForumSummary.js 透传）
    rankForumPostsByQuery,
    getForumTagFilterFromQuery,
    getForumSortModeFromQuery,
    filterRecentForumPosts,
    isLatestForumSummaryQuery,
    sortForumPostsByCreatedAtDesc,
    normalizeForumSummaryText,
    buildForumPostNaturalSummary,
    buildExtractiveForumSummaryAnswer,
    buildForumNarrativeSummaryPrompt,
    removeForumSummaryLinks,
    getForumSummarySourceText,
    detectForumSummaryPolarityConflicts,
    buildForumSearchQueries,
    mergeForumPosts
  };
}
