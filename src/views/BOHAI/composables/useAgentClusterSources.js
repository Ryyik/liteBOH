import {
  searchBohAIKnowledgeForAI,
  searchSharedAIMemoriesForAI,
} from '@/utils/api/treehole-api.js';
import { getMyCloudEntriesForAI } from '@/utils/api/boh-cloud-api.js';
import { logger } from '@/utils/logger.js';

// Agent 集群数据源桥接层。
// getCluster 注册了 RetrieverAgent / MemoryAgent，但历史上从未传入任何数据源，
// 导致 agent-cluster 模式下检索与记忆两个 Agent 的 connectors 恒为空数组、长期空转。
// 这里只做「已有 API 封装 → worker connector 返回形状 { evidence, context }」的适配：
//   - invokeRetriever    → searchBohAIKnowledgeForAI（boh-ai-retrieval 向量检索，RAG 总入口）
//   - invokeSharedMemory → searchSharedAIMemoriesForAI（公共记忆 RPC）
//   - invokeCloud        → getMyCloudEntriesForAI（Cloud+ 最近条目直读）
// 不在此处实现新的检索逻辑；用户开关口径与主链路 useKnowledgeRetrieval 保持一致：
// 个人记忆（isTreeholeMemoryEnabled）管 cloud_entry/core_memory，社区知识（isSharedMemoryEnabled）管 shared_memory。
// knowledge_base 在主链路被硬关闭（useModelConfig 中 isKnowledgeBaseEnabled 恒为 false），此处保持一致不检索。

const RAG_LIMIT = 8;
const SHARED_MEMORY_LIMIT = 8;
const CLOUD_MEMORY_MAX_ITEMS = 10;
const EVIDENCE_TEXT_MAX_CHARS = 600;
const CONTEXT_TEXT_MAX_CHARS = 400;
const CONTEXT_MAX_ITEMS = 5;

const safeQuery = (value) =>
  String(value || '')
    .trim()
    .slice(0, 220);

const buildContext = (evidence) =>
  evidence
    .slice(0, CONTEXT_MAX_ITEMS)
    .map((item) => `[${item.source}] ${item.text.slice(0, CONTEXT_TEXT_MAX_CHARS)}`)
    .join('\n');

export const useAgentClusterSources = ({
  isTreeholeMemoryEnabled,
  isSharedMemoryEnabled,
  getUserId,
} = {}) => {
  const invokeRetriever = async ({ query } = {}) => {
    const q = safeQuery(query);
    if (!q) return { evidence: [], context: '' };
    const sourceTypes = [];
    if (isTreeholeMemoryEnabled?.value) sourceTypes.push('cloud_entry', 'core_memory');
    if (isSharedMemoryEnabled?.value) sourceTypes.push('shared_memory');
    if (!sourceTypes.length) {
      return { evidence: [], context: '', notes: ['个人记忆与社区知识开关均未开启，跳过向量检索'] };
    }
    try {
      const result = await searchBohAIKnowledgeForAI({
        query: q,
        sourceTypes,
        limit: RAG_LIMIT,
        ensureIndexed: true,
      });
      if (!result?.ok) {
        return { evidence: [], context: '', error: result?.error || null };
      }
      const chunks = Array.isArray(result.data?.chunks) ? result.data.chunks : [];
      const evidence = chunks
        .map((chunk) => ({
          text: String(chunk?.content || '')
            .trim()
            .slice(0, EVIDENCE_TEXT_MAX_CHARS),
          source: String(chunk?.source_type || chunk?.sourceType || 'RAG'),
          confidence: Number.isFinite(Number(chunk?.similarity))
            ? Number(chunk.similarity)
            : undefined,
        }))
        .filter((item) => item.text);
      return { evidence, context: buildContext(evidence) };
    } catch (error) {
      logger.warn('bohai-cluster', '集群向量检索桥接失败', error);
      return { evidence: [], context: '', error };
    }
  };

  const invokeSharedMemory = async ({ query } = {}) => {
    if (!isSharedMemoryEnabled?.value) return { evidence: [] };
    const q = safeQuery(query);
    if (!q) return { evidence: [] };
    try {
      const result = await searchSharedAIMemoriesForAI({ query: q, limit: SHARED_MEMORY_LIMIT });
      if (!result?.ok) {
        return { evidence: [], error: result?.error || null };
      }
      const rows = Array.isArray(result.data) ? result.data : [];
      const evidence = rows
        .map((row) => ({
          text: String(row?.content || '')
            .trim()
            .slice(0, EVIDENCE_TEXT_MAX_CHARS),
          source: 'AI 公共记忆',
        }))
        .filter((item) => item.text);
      return { evidence, context: buildContext(evidence) };
    } catch (error) {
      logger.warn('bohai-cluster', '集群公共记忆桥接失败', error);
      return { evidence: [], error };
    }
  };

  const invokeCloud = async ({ userId } = {}) => {
    const uid = String(userId || (typeof getUserId === 'function' ? getUserId() : '') || '');
    if (!uid || !isTreeholeMemoryEnabled?.value) return { evidence: [] };
    try {
      const result = await getMyCloudEntriesForAI(uid, { limit: 40 });
      if (!result?.ok) {
        return { evidence: [], error: result?.error || null };
      }
      const rows = Array.isArray(result.data) ? result.data : [];
      const evidence = rows
        .slice(0, CLOUD_MEMORY_MAX_ITEMS)
        .map((row) => ({
          text: String(row?.content || '')
            .trim()
            .slice(0, EVIDENCE_TEXT_MAX_CHARS),
          source: 'BOH Cloud+',
        }))
        .filter((item) => item.text);
      return { evidence, context: buildContext(evidence) };
    } catch (error) {
      logger.warn('bohai-cluster', '集群 Cloud+ 记忆桥接失败', error);
      return { evidence: [], error };
    }
  };

  return { invokeRetriever, invokeSharedMemory, invokeCloud };
};
