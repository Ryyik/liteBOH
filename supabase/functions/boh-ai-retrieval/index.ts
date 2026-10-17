import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import {
  buildCorsHeaders as buildSharedCorsHeaders,
  jsonResponse as jsonSharedResponse,
} from '../_shared/cors.ts';

type SourceType =
  | 'core_memory'
  | 'shared_memory'
  | 'cloud_entry'
  | 'knowledge_base'
  | 'forum_memory'
  | 'site_news'
  | 'site_activity';

type KnowledgeSource = {
  sourceType: SourceType;
  sourceId: string;
  ownerUserId: string | null;
  visibility: 'public' | 'private';
  title: string;
  content: string;
  metadata: Record<string, unknown>;
};

type ExistingChunk = {
  chunk_index: number;
  content_hash: string;
  embedding_model: string;
  status: string;
};

type RetrievalRow = Record<string, unknown> & {
  source_type?: string;
  source_id?: string;
  chunk_index?: number;
  content?: string;
  metadata?: Record<string, unknown>;
  similarity?: number;
  combinedScore?: number;
  retrievalMethod?: string;
};

type RerankResult = {
  rows: RetrievalRow[];
  used: boolean;
  skippedReason: string;
};

type KnowledgeBaseImportChunk = {
  chunkId: string;
  title: string;
  sectionPath: string[];
  content: string;
  summary: string;
  keywords: string[];
  tags: string[];
  priority: number;
  metadata: Record<string, unknown>;
};

const SILICON_API_KEY = String(
  Deno.env.get('SILICON_CLOUD_API_KEY') || Deno.env.get('VITE_SILICON_CLOUD_API_KEY') || '',
).trim();
const EMBEDDING_API_URL = String(
  Deno.env.get('BOH_AI_EMBEDDING_API_URL') || 'https://api.siliconflow.cn/v1/embeddings',
).trim();
const RERANK_API_URL = String(
  Deno.env.get('BOH_AI_RERANK_API_URL') || 'https://api.siliconflow.cn/v1/rerank',
).trim();
const EMBEDDING_MODEL_ID = String(
  Deno.env.get('BOH_AI_EMBEDDING_MODEL_ID') || 'BAAI/bge-m3',
).trim();
/* 重排模型：默认 bge-reranker-v2-m3（2026-10-16 从 bce-reranker-base 升级 —— 同为
   硅基流动免费档、v2 多语言版更强；bce 版保留在 FREE_RERANK_MODELS 里，可随时用
   env `BOH_AI_RERANK_MODEL_ID` 切回）。
   ⚠️ 换模型时同步检查：FREE_RERANK_MODELS 白名单 + callRerank 的 bce 专有参数开关。 */
const RERANK_MODEL_ID = String(
  Deno.env.get('BOH_AI_RERANK_MODEL_ID') || 'BAAI/bge-reranker-v2-m3',
).trim();
const RERANK_ENABLED = String(Deno.env.get('BOH_AI_RERANK_ENABLED') || 'true').trim() === 'true';
const ALLOW_PAID_RERANK = String(Deno.env.get('BOH_AI_ALLOW_PAID_RERANK') || '').trim() === 'true';
const SUPABASE_URL = String(Deno.env.get('SUPABASE_URL') || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
const BOH_AI_RETRIEVAL_SYNC_SECRET = String(
  Deno.env.get('BOH_AI_RETRIEVAL_SYNC_SECRET') || '',
).trim();

/* 知识源全集（2026-10-17 扩充：+site_news / site_activity —— 官方新闻与活动自动扩充知识库）。
   ⚠️ 三处一致性（任一漏加 = 检索静默少一类结果）：
   本集合 ↔ DB CHECK（migrations 2026101701）↔ 前端 ALLOWED_KNOWLEDGE_SOURCE_TYPES
   （守卫：tests/unit/bohai-knowledge-source-types-consistency.test.js） */
const SOURCE_TYPES = new Set<SourceType>([
  'core_memory',
  'shared_memory',
  'cloud_entry',
  'knowledge_base',
  'forum_memory',
  'site_news',
  'site_activity',
]);
/* 免费档重排模型白名单（不在名单里的模型会被 `ALLOW_PAID_RERANK` 挡下、重排整体跳过）。
   2026-10-16：bge-reranker-v2-m3 入选（硅基流动免费档，后台「免费模型库」同步登记）。 */
const FREE_RERANK_MODELS = new Set([
  'netease-youdao/bce-reranker-base_v1',
  'BAAI/bge-reranker-v2-m3',
]);
const MAX_SYNC_SOURCES = 80;
const MAX_MATCH_COUNT = 24;
const MAX_CHUNK_CHARS = 1800;
const CHUNK_OVERLAP_CHARS = 160;
const KEYWORD_CANDIDATE_LIMIT = 120;
const MAX_IMPORT_CHUNKS = 500;
const MAX_IMPORT_CHUNK_CHARS = 3000;

const buildCorsHeaders = (origin: string | null) =>
  buildSharedCorsHeaders(origin, ['x-retrieval-sync-secret']);

const jsonResponse = (body: unknown, status = 200, origin: string | null = null) =>
  jsonSharedResponse(body, status, origin, ['x-retrieval-sync-secret']);

const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

const toText = (value: unknown, max = 0) => {
  const text = String(value || '').trim();
  return max > 0 && text.length > max ? text.slice(0, max) : text;
};

const toSlug = (value: unknown) => {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return slug || `kb-${Date.now()}`;
};

const toStringArray = (value: unknown, maxItems = 20, maxItemChars = 80) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => toText(item, maxItemChars))
    .filter(Boolean)
    .slice(0, maxItems);
};

const normalizeMetadata = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const tokenizeQuery = (query: string) => {
  const normalized = query.toLowerCase();
  const tokens = normalized.match(/[a-z0-9_/-]{2,}|[\u4e00-\u9fa5]{2,}/g) || [];
  return [...new Set(tokens)].slice(0, 16);
};

const scoreKeywordMatch = (text: string, query: string, tokens: string[]) => {
  const haystack = text.toLowerCase();
  const safeQuery = query.toLowerCase();
  if (!haystack || (!safeQuery && tokens.length === 0)) return 0;

  let score = 0;
  if (safeQuery && haystack.includes(safeQuery)) score += 8;
  for (const token of tokens) {
    if (haystack.includes(token)) score += Math.min(4, Math.max(1, token.length / 2));
  }
  return score;
};

const createServiceClient = () => {
  if (!SUPABASE_URL) throw new Error('缺少环境变量 SUPABASE_URL');
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('缺少环境变量 SUPABASE_SERVICE_ROLE_KEY');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'X-Client-Info': 'boh-ai-retrieval' },
    },
  });
};

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
};

const hasSyncSecret = (request: Request) => {
  if (!BOH_AI_RETRIEVAL_SYNC_SECRET) return false;
  const headerSecret = request.headers.get('x-retrieval-sync-secret') || '';
  return headerSecret.trim() === BOH_AI_RETRIEVAL_SYNC_SECRET;
};

const isRequestAdmin = async (client: ReturnType<typeof createServiceClient>, userId: string) => {
  if (!userId) return false;
  const { data, error } = await client
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (error) return false;
  return String(data?.role || '').trim() === 'admin';
};

const getAllowedSyncSourceTypes = (
  sourceTypes: SourceType[],
  {
    userId = '',
    isAdmin = false,
    hasSecret = false,
  }: { userId?: string; isAdmin?: boolean; hasSecret?: boolean } = {},
) =>
  sourceTypes.filter((sourceType) => {
    // knowledge_base 走 import_knowledge_base 专用通道，不允许顺手 sync（会按位置重排切片）
    if (sourceType === 'knowledge_base') return false;
    // forum_memory 的索引同步由 boh-ai-forum-memory 摄取任务（带 sync secret）触发，
    // 普通用户搜一次就重算一遍全站论坛事实的 embedding 是不可接受的成本。
    if (sourceType === 'forum_memory') return hasSecret || isAdmin;
    if (hasSecret || isAdmin) return true;
    return sourceType === 'cloud_entry' && Boolean(userId);
  });

const getRequestUserId = async (
  client: ReturnType<typeof createServiceClient>,
  request: Request,
) => {
  const token = getBearerToken(request);
  if (!token) return '';
  const { data, error } = await client.auth.getUser(token);
  if (error) return '';
  return String(data?.user?.id || '').trim();
};

const sha256Hex = async (text: string) => {
  const encoded = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const chunkText = (text: string) => {
  const safeText = toText(text, 20000).replace(/\s{3,}/g, '\n\n');
  if (!safeText) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < safeText.length && chunks.length < 12) {
    const end = Math.min(safeText.length, start + MAX_CHUNK_CHARS);
    chunks.push(safeText.slice(start, end).trim());
    if (end >= safeText.length) break;
    start = Math.max(0, end - CHUNK_OVERLAP_CHARS);
  }
  return chunks.filter(Boolean);
};

const callEmbedding = async (inputs: string[]) => {
  if (!SILICON_API_KEY) throw new Error('缺少环境变量 SILICON_CLOUD_API_KEY');
  if (!Array.isArray(inputs) || inputs.length === 0) return [];

  const response = await fetch(EMBEDDING_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SILICON_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL_ID,
      input: inputs.length === 1 ? inputs[0] : inputs,
      encoding_format: 'float',
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.error?.message || payload?.message || `Embedding API failed: ${response.status}`;
    throw new Error(message);
  }

  const data = Array.isArray(payload?.data) ? payload.data : [];
  return data
    .sort(
      (a: { index?: number }, b: { index?: number }) =>
        Number(a?.index || 0) - Number(b?.index || 0),
    )
    .map((item: { embedding?: unknown }) => item?.embedding)
    .filter((embedding: unknown) => Array.isArray(embedding));
};

const callRerank = async (query: string, rows: RetrievalRow[]): Promise<RerankResult> => {
  if (!RERANK_ENABLED) return { rows, used: false, skippedReason: 'disabled' };
  if (!SILICON_API_KEY) return { rows, used: false, skippedReason: 'missing_api_key' };
  if (rows.length <= 1) return { rows, used: false, skippedReason: 'not_enough_rows' };
  if (!ALLOW_PAID_RERANK && !FREE_RERANK_MODELS.has(RERANK_MODEL_ID)) {
    return { rows, used: false, skippedReason: 'paid_model_blocked' };
  }

  const documents = rows.map((row) => toText(row.content, 3000));
  const response = await fetch(RERANK_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SILICON_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: RERANK_MODEL_ID,
      query,
      documents,
      return_documents: false,
      top_n: rows.length,
      /* ⚠️ `max_chunks_per_doc` / `overlap_tokens` 是 netease-youdao 系（bce）专有参数，
         bge-reranker 系不支持 ⇒ 按模型前缀条件携带（2026-10-16 随默认模型升级加）。 */
      ...(RERANK_MODEL_ID.startsWith('netease-youdao/')
        ? { max_chunks_per_doc: 64, overlap_tokens: 40 }
        : {}),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { rows, used: false, skippedReason: `api_${response.status}` };

  const results = Array.isArray(payload?.results) ? payload.results : [];
  if (results.length === 0) return { rows, used: false, skippedReason: 'empty_results' };

  const rerankedRows = results
    .map((item: { index?: number; relevance_score?: number }) => {
      const index = Number(item?.index);
      if (!Number.isInteger(index) || index < 0 || index >= rows.length) return null;
      return {
        ...rows[index],
        rerankScore: Number(item?.relevance_score || 0),
      };
    })
    .filter(Boolean) as RetrievalRow[];

  return { rows: rerankedRows, used: true, skippedReason: '' };
};

const upsertKnowledgeSource = async (
  client: ReturnType<typeof createServiceClient>,
  source: KnowledgeSource,
) => {
  const chunks = chunkText(source.content);
  if (chunks.length === 0) return 0;

  const { data: existingRows } = await client
    .from('boh_ai_knowledge_chunks')
    .select('chunk_index, content_hash, embedding_model, status')
    .eq('source_type', source.sourceType)
    .eq('source_id', source.sourceId);

  const existingByIndex = new Map<number, ExistingChunk>();
  for (const row of Array.isArray(existingRows) ? existingRows : []) {
    existingByIndex.set(Number(row.chunk_index), row as ExistingChunk);
  }

  const prepared = await Promise.all(
    chunks.map(async (content, index) => ({
      index,
      content,
      contentHash: await sha256Hex(`${source.sourceType}:${source.sourceId}:${index}:${content}`),
    })),
  );

  const changed = prepared.filter((chunk) => {
    const existing = existingByIndex.get(chunk.index);
    return (
      !existing ||
      existing.content_hash !== chunk.contentHash ||
      existing.embedding_model !== EMBEDDING_MODEL_ID ||
      existing.status !== 'active'
    );
  });

  if (changed.length === 0) {
    if (existingByIndex.size > chunks.length) {
      await client
        .from('boh_ai_knowledge_chunks')
        .update({ status: 'archived' })
        .eq('source_type', source.sourceType)
        .eq('source_id', source.sourceId)
        .gte('chunk_index', chunks.length);
    }
    return 0;
  }

  const embeddings = await callEmbedding(changed.map((chunk) => chunk.content));
  if (embeddings.length !== changed.length) {
    throw new Error('Embedding API returned an unexpected vector count');
  }
  const rows = changed.map((chunk, position) => ({
    source_type: source.sourceType,
    source_id: source.sourceId,
    owner_user_id: source.ownerUserId,
    visibility: source.visibility,
    chunk_index: chunk.index,
    title: source.title,
    content: chunk.content,
    content_hash: chunk.contentHash,
    metadata: {
      ...source.metadata,
      totalChunks: chunks.length,
    },
    embedding_model: EMBEDDING_MODEL_ID,
    embedding: embeddings[position],
    status: 'active',
  }));

  const { error } = await client
    .from('boh_ai_knowledge_chunks')
    .upsert(rows, { onConflict: 'source_type,source_id,chunk_index' });

  if (error) throw error;

  if (existingByIndex.size > chunks.length) {
    await client
      .from('boh_ai_knowledge_chunks')
      .update({ status: 'archived' })
      .eq('source_type', source.sourceType)
      .eq('source_id', source.sourceId)
      .gte('chunk_index', chunks.length);
  }

  return rows.length;
};

const EMBEDDING_BATCH_SIZE = 32;

const upsertKnowledgeSourcesBatch = async (
  client: ReturnType<typeof createServiceClient>,
  sources: KnowledgeSource[],
) => {
  if (sources.length === 0) return 0;

  // 1. 分块并计算哈希
  const allPrepared: Array<{
    source: KnowledgeSource;
    chunks: string[];
    prepared: Array<{ index: number; content: string; contentHash: string }>;
  }> = [];

  for (const source of sources) {
    const chunks = chunkText(source.content);
    if (chunks.length === 0) continue;
    const prepared = await Promise.all(
      chunks.map(async (content, index) => ({
        index,
        content,
        contentHash: await sha256Hex(`${source.sourceType}:${source.sourceId}:${index}:${content}`),
      })),
    );
    allPrepared.push({ source, chunks, prepared });
  }

  if (allPrepared.length === 0) return 0;

  // 2. 批量 SELECT 已存在的 chunks（按 source_type 分组查询，替代逐条查询）
  const existingBySourceKey = new Map<string, Map<number, ExistingChunk>>();
  const sourceIdsByType = new Map<string, string[]>();
  for (const item of allPrepared) {
    const ids = sourceIdsByType.get(item.source.sourceType) || [];
    ids.push(item.source.sourceId);
    sourceIdsByType.set(item.source.sourceType, ids);
  }

  for (const [sourceType, sourceIds] of sourceIdsByType) {
    const { data: existingRows } = await client
      .from('boh_ai_knowledge_chunks')
      .select('source_type, source_id, chunk_index, content_hash, embedding_model, status')
      .eq('source_type', sourceType)
      .in('source_id', sourceIds);
    for (const row of Array.isArray(existingRows) ? existingRows : []) {
      const key = `${row.source_type}:${row.source_id}`;
      let byIndex = existingBySourceKey.get(key);
      if (!byIndex) {
        byIndex = new Map();
        existingBySourceKey.set(key, byIndex);
      }
      byIndex.set(Number(row.chunk_index), row as ExistingChunk);
    }
  }

  // 3. 收集所有需要更新的 chunks（跨 source 批量化）
  const allChanged: Array<{
    source: KnowledgeSource;
    chunk: { index: number; content: string; contentHash: string };
    totalChunks: number;
  }> = [];
  const sourcesToArchive: Array<{
    sourceType: SourceType;
    sourceId: string;
    maxChunkIndex: number;
  }> = [];

  for (const item of allPrepared) {
    const sourceKey = `${item.source.sourceType}:${item.source.sourceId}`;
    const existingByIndex = existingBySourceKey.get(sourceKey) || new Map<number, ExistingChunk>();

    const changed = item.prepared.filter((chunk) => {
      const existing = existingByIndex.get(chunk.index);
      return (
        !existing ||
        existing.content_hash !== chunk.contentHash ||
        existing.embedding_model !== EMBEDDING_MODEL_ID ||
        existing.status !== 'active'
      );
    });

    for (const chunk of changed) {
      allChanged.push({ source: item.source, chunk, totalChunks: item.chunks.length });
    }

    if (existingByIndex.size > item.chunks.length) {
      sourcesToArchive.push({
        sourceType: item.source.sourceType,
        sourceId: item.source.sourceId,
        maxChunkIndex: item.chunks.length,
      });
    }
  }

  // 无变更时仍需归档旧 chunks
  if (allChanged.length === 0) {
    if (sourcesToArchive.length > 0) {
      await Promise.all(
        sourcesToArchive.map(({ sourceType, sourceId, maxChunkIndex }) =>
          client
            .from('boh_ai_knowledge_chunks')
            .update({ status: 'archived' })
            .eq('source_type', sourceType)
            .eq('source_id', sourceId)
            .gte('chunk_index', maxChunkIndex),
        ),
      );
    }
    return 0;
  }

  // 4. 批量调用 embedding API（分批避免单次请求过大）
  const allEmbeddings: unknown[][] = [];
  for (let i = 0; i < allChanged.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = allChanged.slice(i, i + EMBEDDING_BATCH_SIZE).map((item) => item.chunk.content);
    const embeddings = await callEmbedding(batch);
    allEmbeddings.push(embeddings);
  }
  const embeddings = allEmbeddings.flat();
  if (embeddings.length !== allChanged.length) {
    throw new Error('Embedding API returned an unexpected vector count');
  }

  // 5. 批量 UPSERT（单次写入所有变更）
  const rows = allChanged.map((item, position) => ({
    source_type: item.source.sourceType,
    source_id: item.source.sourceId,
    owner_user_id: item.source.ownerUserId,
    visibility: item.source.visibility,
    chunk_index: item.chunk.index,
    title: item.source.title,
    content: item.chunk.content,
    content_hash: item.chunk.contentHash,
    metadata: {
      ...item.source.metadata,
      totalChunks: item.totalChunks,
    },
    embedding_model: EMBEDDING_MODEL_ID,
    embedding: embeddings[position],
    status: 'active',
  }));

  const { error: upsertError } = await client
    .from('boh_ai_knowledge_chunks')
    .upsert(rows, { onConflict: 'source_type,source_id,chunk_index' });

  if (upsertError) throw upsertError;

  // 6. 并行归档旧 chunks
  if (sourcesToArchive.length > 0) {
    await Promise.all(
      sourcesToArchive.map(({ sourceType, sourceId, maxChunkIndex }) =>
        client
          .from('boh_ai_knowledge_chunks')
          .update({ status: 'archived' })
          .eq('source_type', sourceType)
          .eq('source_id', sourceId)
          .gte('chunk_index', maxChunkIndex),
      ),
    );
  }

  return rows.length;
};

const parseJsonlChunks = (value: unknown) => {
  const text = String(value || '').trim();
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (_error) {
        throw new Error(`JSONL 第 ${index + 1} 行不是合法 JSON`);
      }
    });
};

const normalizeImportChunks = (
  rawChunks: unknown[],
  {
    fallbackTitle = 'BOH AI 知识库',
    sourceSlug = '',
    version = '',
  }: { fallbackTitle?: string; sourceSlug?: string; version?: string } = {},
) =>
  rawChunks
    .slice(0, MAX_IMPORT_CHUNKS)
    .map((chunk, index): KnowledgeBaseImportChunk | null => {
      const source = chunk && typeof chunk === 'object' ? (chunk as Record<string, unknown>) : {};
      const title = toText(source.title, 160) || fallbackTitle;
      const sectionPath = toStringArray(source.section_path || source.sectionPath, 12, 80);
      const content = toText(source.content, MAX_IMPORT_CHUNK_CHARS);
      if (!content) return null;

      return {
        chunkId:
          toText(source.chunk_id || source.chunkId, 120) ||
          `${sourceSlug || 'kb'}_${String(index + 1).padStart(3, '0')}`,
        title,
        sectionPath,
        content,
        summary: toText(source.summary, 500),
        keywords: toStringArray(source.keywords, 30, 60),
        tags: toStringArray(source.tags, 30, 40),
        priority: clampInt(source.priority, 3, 1, 5),
        metadata: {
          ...normalizeMetadata(source.metadata),
          sourceKey: toText(source.source_id || source.sourceId || sourceSlug, 160),
          originalChunkId: toText(source.chunk_id || source.chunkId, 120),
          version: toText(source.version || version, 80),
        },
      };
    })
    .filter((chunk): chunk is KnowledgeBaseImportChunk => Boolean(chunk));

const buildKnowledgeBaseChunkContent = (chunk: KnowledgeBaseImportChunk) => {
  const section = chunk.sectionPath.length > 0 ? chunk.sectionPath.join(' / ') : '';
  const keywords = chunk.keywords.length > 0 ? chunk.keywords.join('、') : '';
  return toText(
    [
      `标题：${chunk.title}`,
      section ? `章节：${section}` : '',
      chunk.summary ? `摘要：${chunk.summary}` : '',
      keywords ? `关键词：${keywords}` : '',
      chunk.content,
    ]
      .filter(Boolean)
      .join('\n'),
    MAX_IMPORT_CHUNK_CHARS,
  );
};

const importKnowledgeBase = async (
  client: ReturnType<typeof createServiceClient>,
  body: Record<string, unknown>,
  {
    userId = '',
    isAdmin = false,
    hasSecret = false,
  }: { userId?: string; isAdmin?: boolean; hasSecret?: boolean } = {},
) => {
  if (!isAdmin && !hasSecret) {
    return { ok: false, status: 403, message: 'Not allowed to import knowledge base' };
  }

  const slug = toSlug(body.slug || body.sourceId || body.source_id);
  const title = toText(body.title, 160) || slug;
  const visibility =
    String(body.visibility || 'public').trim() === 'private' ? 'private' : 'public';
  const ownerUserId =
    visibility === 'private' ? toText(body.ownerUserId || body.owner_user_id || userId, 80) : null;
  if (visibility === 'private' && !ownerUserId) {
    return { ok: false, status: 400, message: 'Private knowledge base requires ownerUserId' };
  }

  const rawChunks = Array.isArray(body.chunks) ? body.chunks : parseJsonlChunks(body.jsonl);
  const chunks = normalizeImportChunks(rawChunks, {
    fallbackTitle: title,
    sourceSlug: slug,
    version: toText(body.version, 80),
  });
  if (chunks.length === 0) {
    return { ok: false, status: 400, message: 'No valid chunks to import' };
  }

  const { data: baseRow, error: baseError } = await client
    .from('boh_ai_knowledge_bases')
    .upsert(
      {
        slug,
        title,
        description: toText(body.description, 800),
        owner_user_id: ownerUserId,
        visibility,
        version: toText(body.version, 80),
        metadata: normalizeMetadata(body.metadata),
        status: 'active',
      },
      { onConflict: 'slug' },
    )
    .select('id, slug, title, visibility')
    .single();

  if (baseError) throw baseError;
  const sourceId = String(baseRow?.id || '').trim();
  if (!sourceId) throw new Error('Failed to create knowledge base source');

  const existingResult = await client
    .from('boh_ai_knowledge_chunks')
    .select('chunk_index, content_hash, embedding_model, status')
    .eq('source_type', 'knowledge_base')
    .eq('source_id', sourceId);
  if (existingResult.error) throw existingResult.error;

  const existingByIndex = new Map<number, ExistingChunk>();
  for (const row of Array.isArray(existingResult.data) ? existingResult.data : []) {
    existingByIndex.set(Number(row.chunk_index), row as ExistingChunk);
  }

  const prepared = await Promise.all(
    chunks.map(async (chunk, index) => {
      const content = buildKnowledgeBaseChunkContent(chunk);
      return {
        index,
        chunk,
        content,
        contentHash: await sha256Hex(`knowledge_base:${sourceId}:${index}:${content}`),
      };
    }),
  );

  const changed = prepared.filter((chunk) => {
    const existing = existingByIndex.get(chunk.index);
    return (
      !existing ||
      existing.content_hash !== chunk.contentHash ||
      existing.embedding_model !== EMBEDDING_MODEL_ID ||
      existing.status !== 'active'
    );
  });

  let upsertedCount = 0;
  if (changed.length > 0) {
    const embeddings = await callEmbedding(changed.map((chunk) => chunk.content));
    if (embeddings.length !== changed.length) {
      throw new Error('Embedding API returned an unexpected vector count');
    }

    const rows = changed.map((chunk, position) => ({
      source_type: 'knowledge_base',
      source_id: sourceId,
      owner_user_id: ownerUserId,
      visibility,
      chunk_index: chunk.index,
      title: chunk.chunk.title,
      content: chunk.content,
      content_hash: chunk.contentHash,
      metadata: {
        ...chunk.chunk.metadata,
        chunkId: chunk.chunk.chunkId,
        sectionPath: chunk.chunk.sectionPath,
        summary: chunk.chunk.summary,
        keywords: chunk.chunk.keywords,
        tags: chunk.chunk.tags,
        priority: chunk.chunk.priority,
        knowledgeBaseSlug: slug,
        totalChunks: chunks.length,
        retrievalMethod: 'vector',
      },
      embedding_model: EMBEDDING_MODEL_ID,
      embedding: embeddings[position],
      status: 'active',
    }));

    const upsertResult = await client
      .from('boh_ai_knowledge_chunks')
      .upsert(rows, { onConflict: 'source_type,source_id,chunk_index' });
    if (upsertResult.error) throw upsertResult.error;
    upsertedCount = rows.length;
  }

  if (existingByIndex.size > chunks.length) {
    const archiveResult = await client
      .from('boh_ai_knowledge_chunks')
      .update({ status: 'archived' })
      .eq('source_type', 'knowledge_base')
      .eq('source_id', sourceId)
      .gte('chunk_index', chunks.length);
    if (archiveResult.error) throw archiveResult.error;
  }

  return {
    ok: true,
    status: 200,
    data: {
      knowledgeBaseId: sourceId,
      slug,
      title,
      visibility,
      chunkCount: chunks.length,
      upsertedCount,
      embeddingModel: EMBEDDING_MODEL_ID,
    },
  };
};

/**
 * 论坛记忆（事实卡）→ 向量切片。
 *
 * 一条事实卡 = 一个 chunk（`chunk_index` 恒 0，`source_id` = 事实卡 id），
 * 这样事实卡被归档/删除时，既有 `archive_boh_ai_knowledge_chunks_for_source('forum_memory')`
 * 触发器能按 `source_id` 精确命中，不需要额外映射表。
 *
 * 切片正文里带上「出处帖子 + 发帖人 + 时间」，是为了让模型引用时能交代来源
 * （论坛内容属不可信外部内容，必须可溯源 —— 与 `useForumSummary` 同一口径）。
 */
const syncForumMemories = async (client: ReturnType<typeof createServiceClient>, limit: number) => {
  const { data, error } = await client
    .from('boh_ai_forum_memories')
    .select(
      'id, source_post_id, source_post_title, source_post_author, fact, category, people, occurred_at, confidence, evidence, model, updated_at, created_at',
    )
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return 0;

  const sources: KnowledgeSource[] = rows.map((row) => {
    const people = Array.isArray(row.people) ? row.people.join('、') : '';
    const title = toText(row.source_post_title, 120) || '论坛记忆';
    const postId = toText(row.source_post_id, 80);
    const content = [
      `事实：${toText(row.fact, 600)}`,
      row.category ? `分类：${toText(row.category, 60)}` : '',
      people ? `涉及成员：${people}` : '',
      row.occurred_at ? `时间：${toText(row.occurred_at, 60)}` : '',
      `出处帖子：${title}`,
      row.source_post_author ? `发帖人：${toText(row.source_post_author, 80)}` : '',
      row.evidence ? `原文片段：${toText(row.evidence, 600)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      sourceType: 'forum_memory',
      sourceId: String(row.id),
      ownerUserId: null,
      visibility: 'public',
      title,
      content,
      metadata: {
        category: row.category || 'general',
        people: Array.isArray(row.people) ? row.people : [],
        occurredAt: row.occurred_at || '',
        confidence: Number(row.confidence || 0),
        sourcePostId: postId,
        sourcePostUrl: postId ? `#/forum/post/${postId}` : '',
        sourcePostAuthor: row.source_post_author || '',
        model: row.model || '',
        updatedAt: row.updated_at || row.created_at || '',
      },
    };
  });

  return upsertKnowledgeSourcesBatch(client, sources);
};

/**
 * 归档「源已消失」的站点内容块（2026-10-17）：新闻被删除 / 活动下线后，
 * 其知识块不能继续被检索。与 forum-memory 侧的 archivedStale 同目的。
 * @returns 归档的 source 数
 */
const archiveStaleSiteContentChunks = async (
  client: ReturnType<typeof createServiceClient>,
  sourceType: 'site_news' | 'site_activity',
  keepSourceIds: string[],
): Promise<number> => {
  const { data, error } = await client
    .from('boh_ai_knowledge_chunks')
    .select('source_id')
    .eq('source_type', sourceType)
    .eq('status', 'active');
  if (error) throw error;
  const keep = new Set(keepSourceIds.map(String));
  const staleIds = [
    ...new Set((Array.isArray(data) ? data : []).map((row) => String(row.source_id))),
  ].filter((sourceId) => !keep.has(sourceId));
  if (staleIds.length === 0) return 0;
  const { error: archiveError } = await client
    .from('boh_ai_knowledge_chunks')
    .update({ status: 'archived' })
    .eq('source_type', sourceType)
    .eq('status', 'active')
    .in('source_id', staleIds);
  if (archiveError) throw archiveError;
  return staleIds.length;
};

/** 官方新闻 → 知识块（2026-10-17 自动扩充）：内容即事实，无需 LLM 抽取 */
const syncSiteNews = async (client: ReturnType<typeof createServiceClient>, limit: number) => {
  const { data, error } = await client
    .from('news')
    .select('id, category, title, excerpt, date, author, content, updated_at, created_at')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return 0;

  const sources: KnowledgeSource[] = rows.map((row) => {
    const title = toText(row.title, 160) || '站内新闻';
    const content = [
      `标题：${title}`,
      row.category ? `分类：${toText(row.category, 60)}` : '',
      row.date ? `发布日期：${toText(row.date, 60)}` : '',
      row.author ? `作者：${toText(row.author, 80)}` : '',
      toText(row.excerpt, 300),
      toText(row.content, 20000),
    ]
      .filter(Boolean)
      .join('\n');

    return {
      sourceType: 'site_news',
      sourceId: String(row.id),
      ownerUserId: null,
      visibility: 'public',
      title,
      content,
      metadata: {
        category: row.category || '',
        date: row.date || '',
        author: row.author || '',
        updatedAt: row.updated_at || row.created_at || '',
      },
    };
  });

  const indexed = await upsertKnowledgeSourcesBatch(client, sources);
  await archiveStaleSiteContentChunks(
    client,
    'site_news',
    sources.map((source) => source.sourceId),
  );
  return indexed;
};

/** 官方活动 → 知识块（2026-10-17 自动扩充）：同上，无需 LLM 抽取 */
const syncSiteActivities = async (
  client: ReturnType<typeof createServiceClient>,
  limit: number,
) => {
  const { data, error } = await client
    .from('activities')
    .select('id, title, date, description, updated_at, created_at')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return 0;

  const sources: KnowledgeSource[] = rows.map((row) => {
    const title = toText(row.title, 160) || '站内活动';
    const content = [
      `标题：${title}`,
      row.date ? `活动日期：${toText(row.date, 60)}` : '',
      toText(row.description, 20000),
    ]
      .filter(Boolean)
      .join('\n');

    return {
      sourceType: 'site_activity',
      sourceId: String(row.id),
      ownerUserId: null,
      visibility: 'public',
      title,
      content,
      metadata: {
        date: row.date || '',
        updatedAt: row.updated_at || row.created_at || '',
      },
    };
  });

  const indexed = await upsertKnowledgeSourcesBatch(client, sources);
  await archiveStaleSiteContentChunks(
    client,
    'site_activity',
    sources.map((source) => source.sourceId),
  );
  return indexed;
};

const syncSharedMemories = async (
  client: ReturnType<typeof createServiceClient>,
  limit: number,
) => {
  const { data, error } = await client
    .from('boh_ai_shared_memories')
    .select(
      'id, owner_user_id, content, mood, tags, confidence, evidence, source, updated_at, created_at',
    )
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return 0;

  const sources: KnowledgeSource[] = rows.map((row) => {
    const tags = Array.isArray(row.tags) ? row.tags.join('、') : '';
    const content = [
      toText(row.content, 1800),
      row.mood ? `心情：${toText(row.mood, 24)}` : '',
      tags ? `标签：${tags}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      sourceType: 'shared_memory',
      sourceId: String(row.id),
      ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null,
      visibility: 'public',
      title: 'AI公共记忆',
      content,
      metadata: {
        mood: row.mood || '',
        tags: Array.isArray(row.tags) ? row.tags : [],
        confidence: row.confidence ?? null,
        evidence: row.evidence || [],
        source: row.source || 'capture',
        updatedAt: row.updated_at || row.created_at || '',
      },
    };
  });

  return upsertKnowledgeSourcesBatch(client, sources);
};

const syncCoreMemories = async (client: ReturnType<typeof createServiceClient>, limit: number) => {
  const { data, error } = await client
    .from('boh_ai_core_memories')
    .select(
      'id, title, content, category, tags, priority, source_label, source_url, updated_at, created_at',
    )
    .eq('status', 'active')
    .order('priority', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return 0;

  const sources: KnowledgeSource[] = rows.map((row) => {
    const title = toText(row.title, 120) || 'BOH 官方事实';
    const tags = Array.isArray(row.tags) ? row.tags.join('、') : '';
    const content = [
      `标题：${title}`,
      row.category ? `分类：${toText(row.category, 60)}` : '',
      tags ? `标签：${tags}` : '',
      row.source_label ? `来源：${toText(row.source_label, 120)}` : '',
      toText(row.content, 20000),
    ]
      .filter(Boolean)
      .join('\n');

    return {
      sourceType: 'core_memory',
      sourceId: String(row.id),
      ownerUserId: null,
      visibility: 'public',
      title,
      content,
      metadata: {
        category: row.category || 'general',
        tags: Array.isArray(row.tags) ? row.tags : [],
        priority: Number(row.priority || 0),
        sourceLabel: row.source_label || 'BOH 官方',
        sourceUrl: row.source_url || '',
        updatedAt: row.updated_at || row.created_at || '',
      },
    };
  });

  return upsertKnowledgeSourcesBatch(client, sources);
};

const syncCloudEntries = async (
  client: ReturnType<typeof createServiceClient>,
  userId: string,
  limit: number,
) => {
  if (!userId) return 0;
  const { data, error } = await client
    .from('boh_cloud_entries')
    .select('id, user_id, entry_date, title, content_text, mood, source, updated_at, created_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return 0;

  const sources: KnowledgeSource[] = rows.map((row) => {
    const title = toText(row.title, 120) || toText(row.entry_date, 40) || 'BOH Cloud+';
    const content = [
      title ? `标题：${title}` : '',
      row.entry_date ? `日期：${toText(row.entry_date, 40)}` : '',
      row.mood ? `心情：${toText(row.mood, 24)}` : '',
      toText(row.content_text, 20000),
    ]
      .filter(Boolean)
      .join('\n');

    return {
      sourceType: 'cloud_entry',
      sourceId: String(row.id),
      ownerUserId: String(row.user_id),
      visibility: 'private',
      title,
      content,
      metadata: {
        entryDate: row.entry_date || '',
        mood: row.mood || '',
        source: row.source || 'manual',
        updatedAt: row.updated_at || row.created_at || '',
      },
    };
  });

  return upsertKnowledgeSourcesBatch(client, sources);
};

const buildKeywordRowsFromSharedMemories = async (
  client: ReturnType<typeof createServiceClient>,
  query: string,
  tokens: string[],
  limit: number,
) => {
  const { data, error } = await client
    .from('boh_ai_shared_memories')
    .select(
      'id, owner_user_id, content, mood, tags, confidence, evidence, source, updated_at, created_at',
    )
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(KEYWORD_CANDIDATE_LIMIT);

  if (error) return [];

  return (Array.isArray(data) ? data : [])
    .map((row) => {
      const tags = Array.isArray(row.tags) ? row.tags.join(' ') : '';
      const merged = `${row.content || ''}\n${row.mood || ''}\n${tags}`;
      const score = scoreKeywordMatch(merged, query, tokens);
      return {
        id: String(row.id),
        source_type: 'shared_memory',
        source_id: String(row.id),
        owner_user_id: row.owner_user_id ? String(row.owner_user_id) : null,
        visibility: 'public',
        chunk_index: 0,
        title: 'AI公共记忆',
        content: [
          toText(row.content, 1800),
          row.mood ? `心情：${toText(row.mood, 24)}` : '',
          tags ? `标签：${tags}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        metadata: {
          mood: row.mood || '',
          tags: Array.isArray(row.tags) ? row.tags : [],
          confidence: row.confidence ?? null,
          evidence: row.evidence || [],
          source: row.source || 'capture',
          updatedAt: row.updated_at || row.created_at || '',
          retrievalMethod: 'keyword',
        },
        embedding_model: '',
        updated_at: row.updated_at || row.created_at || '',
        similarity: Math.min(0.9, score / 12),
        combinedScore: score,
        retrievalMethod: 'keyword',
      } satisfies RetrievalRow;
    })
    .filter((row) => Number(row.combinedScore || 0) > 0)
    .sort((a, b) => Number(b.combinedScore || 0) - Number(a.combinedScore || 0))
    .slice(0, limit);
};

const buildKeywordRowsFromCoreMemories = async (
  client: ReturnType<typeof createServiceClient>,
  query: string,
  tokens: string[],
  limit: number,
) => {
  const { data, error } = await client
    .from('boh_ai_core_memories')
    .select(
      'id, title, content, category, tags, priority, source_label, source_url, updated_at, created_at',
    )
    .eq('status', 'active')
    .order('priority', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(KEYWORD_CANDIDATE_LIMIT);

  if (error) return [];

  return (Array.isArray(data) ? data : [])
    .map((row) => {
      const title = toText(row.title, 120) || 'BOH 官方事实';
      const tags = Array.isArray(row.tags) ? row.tags.join(' ') : '';
      const merged = `${title}\n${row.category || ''}\n${tags}\n${row.content || ''}`;
      const keywordScore = scoreKeywordMatch(merged, query, tokens);
      const score =
        keywordScore > 0 ? keywordScore + Math.min(4, Number(row.priority || 0) / 25) : 0;
      return {
        id: String(row.id),
        source_type: 'core_memory',
        source_id: String(row.id),
        owner_user_id: null,
        visibility: 'public',
        chunk_index: 0,
        title,
        content: [
          `标题：${title}`,
          row.category ? `分类：${toText(row.category, 60)}` : '',
          tags ? `标签：${tags}` : '',
          row.source_label ? `来源：${toText(row.source_label, 120)}` : '',
          toText(row.content, 3000),
        ]
          .filter(Boolean)
          .join('\n'),
        metadata: {
          category: row.category || 'general',
          tags: Array.isArray(row.tags) ? row.tags : [],
          priority: Number(row.priority || 0),
          sourceLabel: row.source_label || 'BOH 官方',
          sourceUrl: row.source_url || '',
          updatedAt: row.updated_at || row.created_at || '',
          retrievalMethod: 'keyword',
        },
        embedding_model: '',
        updated_at: row.updated_at || row.created_at || '',
        similarity: Math.min(0.95, score / 14),
        combinedScore: score,
        retrievalMethod: 'keyword',
      } satisfies RetrievalRow;
    })
    .filter((row) => Number(row.combinedScore || 0) > 0)
    .sort((a, b) => Number(b.combinedScore || 0) - Number(a.combinedScore || 0))
    .slice(0, limit);
};

const buildKeywordRowsFromCloudEntries = async (
  client: ReturnType<typeof createServiceClient>,
  userId: string,
  query: string,
  tokens: string[],
  limit: number,
) => {
  if (!userId) return [];
  const { data, error } = await client
    .from('boh_cloud_entries')
    .select('id, user_id, entry_date, title, content_text, mood, source, updated_at, created_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(KEYWORD_CANDIDATE_LIMIT);

  if (error) return [];

  return (Array.isArray(data) ? data : [])
    .map((row) => {
      const title = toText(row.title, 120) || toText(row.entry_date, 40) || 'BOH Cloud+';
      const merged = `${title}\n${row.entry_date || ''}\n${row.mood || ''}\n${row.content_text || ''}`;
      const score = scoreKeywordMatch(merged, query, tokens);
      return {
        id: String(row.id),
        source_type: 'cloud_entry',
        source_id: String(row.id),
        owner_user_id: String(row.user_id),
        visibility: 'private',
        chunk_index: 0,
        title,
        content: [
          title ? `标题：${title}` : '',
          row.entry_date ? `日期：${toText(row.entry_date, 40)}` : '',
          row.mood ? `心情：${toText(row.mood, 24)}` : '',
          toText(row.content_text, 20000),
        ]
          .filter(Boolean)
          .join('\n'),
        metadata: {
          entryDate: row.entry_date || '',
          mood: row.mood || '',
          source: row.source || 'manual',
          updatedAt: row.updated_at || row.created_at || '',
          retrievalMethod: 'keyword',
        },
        embedding_model: '',
        updated_at: row.updated_at || row.created_at || '',
        similarity: Math.min(0.9, score / 12),
        combinedScore: score,
        retrievalMethod: 'keyword',
      } satisfies RetrievalRow;
    })
    .filter((row) => Number(row.combinedScore || 0) > 0)
    .sort((a, b) => Number(b.combinedScore || 0) - Number(a.combinedScore || 0))
    .slice(0, limit);
};

/**
 * 论坛记忆的关键词兜底。
 *
 * ⚠️ 必须与 `syncForumMemories` 拼出的 chunk 正文保持**同一套字段**，且
 * `chunk_index` 都取 0 —— `mergeRetrievedRows` 以 `source_type:source_id:chunk_index`
 * 为键合并向量与关键词结果，键不一致会让同一张事实卡在结果里出现两次。
 */
const buildKeywordRowsFromForumMemories = async (
  client: ReturnType<typeof createServiceClient>,
  query: string,
  tokens: string[],
  limit: number,
) => {
  const { data, error } = await client
    .from('boh_ai_forum_memories')
    .select(
      'id, source_post_id, source_post_title, source_post_author, fact, category, people, occurred_at, confidence, evidence, updated_at, created_at',
    )
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(KEYWORD_CANDIDATE_LIMIT);

  if (error) return [];

  return (Array.isArray(data) ? data : [])
    .map((row) => {
      const people = Array.isArray(row.people) ? row.people.join('、') : '';
      const title = toText(row.source_post_title, 120) || '论坛记忆';
      const merged = [row.fact || '', row.category || '', people, row.evidence || '', title].join(
        '\n',
      );
      return { row, title, people, score: scoreKeywordMatch(merged, query, tokens) };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row, title, people, score }) => {
      const postId = toText(row.source_post_id, 80);
      return {
        id: String(row.id),
        source_type: 'forum_memory',
        source_id: String(row.id),
        owner_user_id: null,
        visibility: 'public',
        chunk_index: 0,
        title,
        content: [
          `事实：${toText(row.fact, 600)}`,
          row.category ? `分类：${toText(row.category, 60)}` : '',
          people ? `涉及成员：${people}` : '',
          row.occurred_at ? `时间：${toText(row.occurred_at, 60)}` : '',
          `出处帖子：${title}`,
          row.source_post_author ? `发帖人：${toText(row.source_post_author, 80)}` : '',
          row.evidence ? `原文片段：${toText(row.evidence, 600)}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        metadata: {
          category: row.category || 'general',
          people: Array.isArray(row.people) ? row.people : [],
          occurredAt: row.occurred_at || '',
          confidence: Number(row.confidence || 0),
          sourcePostId: postId,
          sourcePostUrl: postId ? `#/forum/post/${postId}` : '',
          sourcePostAuthor: row.source_post_author || '',
          updatedAt: row.updated_at || row.created_at || '',
          retrievalMethod: 'keyword',
        },
        embedding_model: '',
        updated_at: row.updated_at || row.created_at || '',
        similarity: Math.min(0.9, score / 12),
        combinedScore: score,
        retrievalMethod: 'keyword',
      } satisfies RetrievalRow;
    });
};

const buildKeywordRowsFromKnowledgeBases = async (
  client: ReturnType<typeof createServiceClient>,
  userId: string,
  query: string,
  tokens: string[],
  limit: number,
) => {
  const queryBuilder = client
    .from('boh_ai_knowledge_chunks')
    .select(
      'id, source_type, source_id, owner_user_id, visibility, chunk_index, title, content, metadata, embedding_model, updated_at',
    )
    .eq('source_type', 'knowledge_base')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(KEYWORD_CANDIDATE_LIMIT);

  const { data, error } = await queryBuilder;
  if (error) return [];

  return (Array.isArray(data) ? data : [])
    .filter((row) => row.visibility === 'public' || (userId && row.owner_user_id === userId))
    .map((row) => {
      const metadata = normalizeMetadata(row.metadata);
      const keywords = Array.isArray(metadata.keywords) ? metadata.keywords.join(' ') : '';
      const tags = Array.isArray(metadata.tags) ? metadata.tags.join(' ') : '';
      const sectionPath = Array.isArray(metadata.sectionPath) ? metadata.sectionPath.join(' ') : '';
      const merged = `${row.title || ''}\n${sectionPath}\n${metadata.summary || ''}\n${keywords}\n${tags}\n${row.content || ''}`;
      const score = scoreKeywordMatch(merged, query, tokens);
      return {
        id: String(row.id),
        source_type: 'knowledge_base',
        source_id: String(row.source_id),
        owner_user_id: row.owner_user_id ? String(row.owner_user_id) : null,
        visibility: row.visibility || 'public',
        chunk_index: Number(row.chunk_index || 0),
        title: toText(row.title, 120) || 'BOH AI 知识库',
        content: toText(row.content, 3000),
        metadata: {
          ...metadata,
          retrievalMethod: 'keyword',
        },
        embedding_model: row.embedding_model || '',
        updated_at: row.updated_at || '',
        similarity: Math.min(0.9, score / 14),
        combinedScore: score,
        retrievalMethod: 'keyword',
      } satisfies RetrievalRow;
    })
    .filter((row) => Number(row.combinedScore || 0) > 0)
    .sort((a, b) => Number(b.combinedScore || 0) - Number(a.combinedScore || 0))
    .slice(0, limit);
};

const buildKeywordFallbackRows = async (
  client: ReturnType<typeof createServiceClient>,
  query: string,
  sourceTypes: SourceType[],
  userId: string,
  limit: number,
) => {
  const tokens = tokenizeQuery(query);
  const [coreRows, sharedRows, cloudRows, knowledgeBaseRows, forumMemoryRows] = await Promise.all([
    sourceTypes.includes('core_memory')
      ? buildKeywordRowsFromCoreMemories(client, query, tokens, limit)
      : Promise.resolve([]),
    sourceTypes.includes('shared_memory')
      ? buildKeywordRowsFromSharedMemories(client, query, tokens, limit)
      : Promise.resolve([]),
    sourceTypes.includes('cloud_entry')
      ? buildKeywordRowsFromCloudEntries(client, userId, query, tokens, limit)
      : Promise.resolve([]),
    sourceTypes.includes('knowledge_base')
      ? buildKeywordRowsFromKnowledgeBases(client, userId, query, tokens, limit)
      : Promise.resolve([]),
    sourceTypes.includes('forum_memory')
      ? buildKeywordRowsFromForumMemories(client, query, tokens, limit)
      : Promise.resolve([]),
  ]);

  return [...coreRows, ...sharedRows, ...cloudRows, ...knowledgeBaseRows, ...forumMemoryRows]
    .sort((a, b) => Number(b.combinedScore || 0) - Number(a.combinedScore || 0))
    .slice(0, limit);
};

const mergeRetrievedRows = (
  vectorRows: RetrievalRow[],
  keywordRows: RetrievalRow[],
  limit: number,
) => {
  const byKey = new Map<string, RetrievalRow>();

  for (const row of vectorRows) {
    const key = `${row.source_type || ''}:${row.source_id || ''}:${Number(row.chunk_index || 0)}`;
    const similarity = Number(row.similarity || 0);
    byKey.set(key, {
      ...row,
      metadata: {
        ...normalizeMetadata(row.metadata),
        retrievalMethod: 'vector',
      },
      combinedScore: similarity * 100,
      retrievalMethod: 'vector',
    });
  }

  for (const row of keywordRows) {
    const key = `${row.source_type || ''}:${row.source_id || ''}:${Number(row.chunk_index || 0)}`;
    const existing = byKey.get(key);
    if (existing) {
      const keywordScore = Number(row.combinedScore || 0);
      byKey.set(key, {
        ...existing,
        metadata: {
          ...normalizeMetadata(existing.metadata),
          keywordScore,
          retrievalMethod: 'hybrid',
        },
        combinedScore: Number(existing.combinedScore || 0) + keywordScore,
        retrievalMethod: 'hybrid',
      });
      continue;
    }
    byKey.set(key, row);
  }

  return Array.from(byKey.values())
    .sort((a, b) => Number(b.combinedScore || 0) - Number(a.combinedScore || 0))
    .slice(0, limit);
};

const normalizeSourceTypes = (value: unknown, userId: string) => {
  const raw = Array.isArray(value)
    ? value
    : ['core_memory', 'shared_memory', 'cloud_entry', 'knowledge_base', 'forum_memory'];
  const sourceTypes = raw
    .map((item) => String(item || '').trim())
    .filter((item): item is SourceType => SOURCE_TYPES.has(item as SourceType));
  const unique = [...new Set(sourceTypes)];
  return userId ? unique : unique.filter((item) => item !== 'cloud_entry');
};

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCorsHeaders(origin) });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, message: 'Method not allowed' }, 405, origin);
  }

  try {
    const client = createServiceClient();
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || 'search').trim();
    const userId = await getRequestUserId(client, request);
    const requestHasSyncSecret = hasSyncSecret(request);
    const requestIsAdmin = await isRequestAdmin(client, userId);

    if (action === 'import_knowledge_base') {
      const result = await importKnowledgeBase(client, body as Record<string, unknown>, {
        userId,
        isAdmin: requestIsAdmin,
        hasSecret: requestHasSyncSecret,
      });
      return jsonResponse(
        result.ok ? { ok: true, data: result.data } : { ok: false, message: result.message },
        result.status,
        origin,
      );
    }

    if (action === 'sync') {
      const sourceTypes = normalizeSourceTypes(body?.sourceTypes, userId);
      const syncSourceTypes = getAllowedSyncSourceTypes(sourceTypes, {
        userId,
        isAdmin: requestIsAdmin,
        hasSecret: requestHasSyncSecret,
      });
      if (syncSourceTypes.length === 0) {
        return jsonResponse(
          { ok: false, message: 'Not allowed to sync requested sources' },
          403,
          origin,
        );
      }
      const syncLimit = clampInt(body?.syncLimit, 40, 1, MAX_SYNC_SOURCES);
      let indexedCount = 0;
      if (syncSourceTypes.includes('core_memory'))
        indexedCount += await syncCoreMemories(client, syncLimit);
      if (syncSourceTypes.includes('shared_memory'))
        indexedCount += await syncSharedMemories(client, syncLimit);
      if (syncSourceTypes.includes('cloud_entry'))
        indexedCount += await syncCloudEntries(client, userId, syncLimit);
      if (syncSourceTypes.includes('forum_memory'))
        indexedCount += await syncForumMemories(client, syncLimit);
      if (syncSourceTypes.includes('site_news'))
        indexedCount += await syncSiteNews(client, syncLimit);
      if (syncSourceTypes.includes('site_activity'))
        indexedCount += await syncSiteActivities(client, syncLimit);
      return jsonResponse(
        {
          ok: true,
          data: {
            indexedCount,
            sourceTypes,
            syncSourceTypes,
            canSync: syncSourceTypes.length > 0,
          },
        },
        200,
        origin,
      );
    }

    if (action !== 'search') {
      return jsonResponse({ ok: false, message: 'Unsupported action' }, 400, origin);
    }

    const query = toText(body?.query, 500);
    if (!query) {
      return jsonResponse({ ok: false, message: 'Missing query' }, 400, origin);
    }

    const sourceTypes = normalizeSourceTypes(body?.sourceTypes, userId);
    if (sourceTypes.length === 0) {
      return jsonResponse(
        { ok: true, data: { chunks: [], indexedCount: 0, sourceTypes } },
        200,
        origin,
      );
    }

    const syncSourceTypes = getAllowedSyncSourceTypes(sourceTypes, {
      userId,
      isAdmin: requestIsAdmin,
      hasSecret: requestHasSyncSecret,
    });
    const shouldSync = body?.ensureIndexed !== false && syncSourceTypes.length > 0;
    const syncLimit = clampInt(body?.syncLimit, 40, 1, MAX_SYNC_SOURCES);
    const indexedCount = 0;
    const matchCount = clampInt(body?.matchCount, 8, 1, MAX_MATCH_COUNT);
    const candidateCount = Math.min(MAX_MATCH_COUNT, Math.max(matchCount * 2, matchCount + 4));
    // 搜索路径：sync 改为 fire-and-forget，避免写入阻塞检索返回
    if (shouldSync) {
      void (async () => {
        try {
          if (syncSourceTypes.includes('core_memory')) await syncCoreMemories(client, syncLimit);
          if (syncSourceTypes.includes('shared_memory'))
            await syncSharedMemories(client, syncLimit);
          if (syncSourceTypes.includes('cloud_entry'))
            await syncCloudEntries(client, userId, syncLimit);
          if (syncSourceTypes.includes('forum_memory')) await syncForumMemories(client, syncLimit);
          if (syncSourceTypes.includes('site_news')) await syncSiteNews(client, syncLimit);
          if (syncSourceTypes.includes('site_activity'))
            await syncSiteActivities(client, syncLimit);
        } catch (syncError) {
          console.error('[boh-ai-retrieval] 后台索引同步失败', syncError);
        }
      })();
    }

    let vectorRows: RetrievalRow[] = [];
    let embeddingModel = '';
    if (userId || requestHasSyncSecret) {
      const [queryEmbedding] = await callEmbedding([query]);
      if (!Array.isArray(queryEmbedding)) {
        throw new Error('Embedding API did not return a query vector');
      }
      embeddingModel = EMBEDDING_MODEL_ID;
      const { data, error } = await client.rpc('match_boh_ai_knowledge_chunks', {
        p_query_embedding: queryEmbedding,
        p_match_count: candidateCount,
        p_source_types: sourceTypes,
        p_user_id: userId || null,
        p_min_similarity: Number(body?.minSimilarity || 0),
      });

      if (error) throw error;
      vectorRows = (Array.isArray(data) ? data : []) as RetrievalRow[];
    }

    const keywordRows = await buildKeywordFallbackRows(
      client,
      query,
      sourceTypes,
      userId,
      candidateCount,
    );
    const mergedRows = mergeRetrievedRows(vectorRows, keywordRows, candidateCount);
    const rerankResult = await callRerank(query, mergedRows);
    const finalRows = rerankResult.rows.slice(0, matchCount);
    const rerankAllowed = ALLOW_PAID_RERANK || FREE_RERANK_MODELS.has(RERANK_MODEL_ID);

    return jsonResponse(
      {
        ok: true,
        data: {
          chunks: finalRows,
          indexedCount,
          sourceTypes,
          syncSourceTypes,
          embeddingModel,
          vectorMatches: vectorRows.length,
          keywordMatches: keywordRows.length,
          rerankModel: rerankResult.used ? RERANK_MODEL_ID : '',
          rerankEnabled: RERANK_ENABLED,
          rerankAllowed,
          rerankUsed: rerankResult.used,
          rerankSkippedReason: rerankResult.skippedReason,
          syncAttempted: shouldSync,
          canSync: syncSourceTypes.length > 0,
        },
      },
      200,
      origin,
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        message: error instanceof Error ? error.message : String(error || 'Unknown error'),
      },
      500,
      origin,
    );
  }
});
