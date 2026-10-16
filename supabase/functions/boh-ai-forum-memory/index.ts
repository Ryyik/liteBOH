/**
 * boh-ai-forum-memory — 论坛记忆增量摄取（每日 pg_cron 触发，也可手动调）。
 *
 * 做什么（用户口径 2026-10-16：全部公开帖 + 每日定时抽事实卡）：
 *   1. 找出 `status = 'approved'` 且**尚未进过摄取账本**的帖子（最早的优先）。
 *   2. 逐条交给 LLM 抽「事实卡」—— 一句话事实 + 涉及成员 + 时间 + 原文证据 + 置信度。
 *   3. 写入 `boh_ai_forum_memories`，并把该帖记进 `boh_ai_forum_memory_scans`
 *      （**含抽出 0 条事实的帖子**，否则那些帖子每轮都会被重扫）。
 *   4. 复查：已被扫过、但帖子不再是 approved 的（被驳回/隐藏），其事实卡一并归档。
 *   5. 最后调 `boh-ai-retrieval` 的 `action=sync, sourceTypes=['forum_memory']`
 *      触发向量索引 —— 复用既有 embedding 管道，不在这里重复实现一份。
 *
 * 为什么不在前端做：事实抽取是**离线批处理**，与聊天请求无关；
 * 放前端会让每个用户各自调用一遍 LLM，成本与结果都不受控。
 *
 * 鉴权（与 forum-async-worker / push-send 同款两通道）：
 *   ① `Authorization: Bearer <BOH_PUSH_DISPATCH_KEY>`（pg_cron 通道 —— cron 命令从
 *      `vault.decrypted_secrets` 取 `push_dispatch_key`，命令文本里不含明文密钥）
 *   ② `x-forum-memory-secret: <FORUM_MEMORY_SECRET>`（手动触发通道，可选）
 *   service_role key 也接受，便于服务端互调与调试。
 *
 * 调用：
 *   POST /functions/v1/boh-ai-forum-memory                # 异步，立即 202
 *   POST /functions/v1/boh-ai-forum-memory  {"wait":true}  # 同步等待，返回本轮统计
 *   POST .../boh-ai-forum-memory  {"limit":3,"wait":true}  # 只处理 3 条（调试用）
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0';
import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';

const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim();
const serviceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
/** 与 vault 里 `push_dispatch_key` 同值的专用投递凭证（push-send 已在用同一套）。 */
const dispatchKey = String(Deno.env.get('BOH_PUSH_DISPATCH_KEY') || '').trim();
const siliconApiKey = String(
  Deno.env.get('SILICON_CLOUD_API_KEY') || Deno.env.get('VITE_SILICON_CLOUD_API_KEY') || '',
).trim();
const chatApiUrl = String(
  Deno.env.get('BOH_AI_FORUM_MEMORY_API_URL') || 'https://api.siliconflow.cn/v1/chat/completions',
).trim();
const chatModelId = String(
  Deno.env.get('BOH_AI_FORUM_MEMORY_MODEL_ID') || 'Qwen/Qwen2.5-7B-Instruct',
).trim();
const retrievalSyncSecret = String(Deno.env.get('BOH_AI_RETRIEVAL_SYNC_SECRET') || '').trim();
const manualSecret = String(Deno.env.get('FORUM_MEMORY_SECRET') || '').trim();

/** 单轮最多处理多少帖：Edge Function 有执行时长上限，宁可多跑几轮也不要把整站一次吞掉。 */
const DEFAULT_MAX_POSTS_PER_RUN = 12;
/** 单轮总预算，超了就提前收工，把剩下的留给下一轮。 */
const RUN_BUDGET_MS = 110000;
const LLM_TIMEOUT_MS = 45000;
const POST_BODY_MAX_CHARS = 1800;
const MAX_FACTS_PER_POST = 3;
const MAX_PEOPLE_PER_FACT = 8;

const createServiceClient = (): SupabaseClient =>
  createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

const toText = (value: unknown, max = 0) => {
  const text = String(value ?? '').trim();
  return max > 0 && text.length > max ? text.slice(0, max) : text;
};

const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

/** 与前端 `getPostTitleAndBody`（`views/BOHAI/utils/format/post.js`）同一口径：先看显式 title/body，再退回 content。 */
const resolvePostText = (post: Record<string, unknown>) => {
  const title = toText(post.title, 200);
  const body = toText(post.body, POST_BODY_MAX_CHARS);
  if (title || body) {
    return { title: title || '无标题', body: body || toText(post.content, POST_BODY_MAX_CHARS) };
  }
  const raw = toText(post.content, POST_BODY_MAX_CHARS);
  const firstLine =
    raw
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) || '';
  return { title: toText(firstLine, 200) || '无标题', body: raw };
};

const EXTRACTION_SYSTEM_PROMPT = [
  '你是「方块之家（BOH）」社区的记忆整理员。给你一条论坛帖子，请抽出**值得长期记住的事实**。',
  '硬规则：',
  '1. 只抽帖子里**明确写了**的内容，严禁推测、补全、联想、美化。',
  '2. 事实必须与社区、成员、活动、地点、偏好相关；纯闲聊、纯表情、纯提问、纯广告、纯转贴一律返回空数组。',
  '3. 每条事实一句话（不超过 60 字），用第三人称陈述，例如「小牛在联机侠开设了苦力怕服务器」。',
  '4. evidence 必须是帖子里的**原文片段**（逐字摘录，可截断），不许改写。',
  '5. occurred_at 只在帖子里明确提到时间时才填（如「2026 年 7 月」「上周六」），没提就留空字符串。',
  '6. confidence 是你对这条事实的把握，0~1 之间的小数。',
  `7. 最多 ${MAX_FACTS_PER_POST} 条，宁缺毋滥；一条都没有就返回空数组。`,
  '只输出 JSON，不要解释、不要 markdown 代码块、不要前后缀：',
  '{"facts":[{"fact":"...","category":"member|event|place|preference|general","people":["..."],"occurred_at":"","confidence":0.8,"evidence":"..."}]}',
].join('\n');

const VALID_CATEGORIES = new Set(['member', 'event', 'place', 'preference', 'general']);

/** 从模型回复里抠出 JSON（容忍代码块围栏与前后噪声）。 */
const parseFactsPayload = (raw: string): unknown[] => {
  const text = String(raw || '')
    .replace(/```json/gi, '```')
    .replace(/```/g, '')
    .trim();
  if (!text) return [];
  const objectStart = text.indexOf('{');
  const arrayStart = text.indexOf('[');
  const start =
    objectStart >= 0 && (arrayStart < 0 || objectStart < arrayStart) ? objectStart : arrayStart;
  if (start < 0) return [];
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (Array.isArray(parsed)) return parsed;
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { facts?: unknown }).facts)
    ) {
      return (parsed as { facts: unknown[] }).facts;
    }
    return [];
  } catch (_error) {
    return [];
  }
};

const normalizeFactKey = (value: string) =>
  String(value || '')
    .replace(/\s+/g, '')
    .trim();

const callFactExtraction = async (post: {
  title: string;
  body: string;
  author: string;
  createdAt: string;
}): Promise<{ ok: boolean; facts: unknown[]; error?: string }> => {
  if (!siliconApiKey) return { ok: false, facts: [], error: 'missing_api_key' };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const response = await fetch(chatApiUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${siliconApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: chatModelId,
        temperature: 0.1,
        max_tokens: 900,
        messages: [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              `帖子标题：${post.title}`,
              `发帖人：${post.author || '未知'}`,
              `发布时间：${post.createdAt || '未知'}`,
              `正文：${post.body || '（无正文）'}`,
            ].join('\n'),
          },
        ],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, facts: [], error: `api_${response.status}` };
    }
    const content = String(payload?.choices?.[0]?.message?.content || '');
    return { ok: true, facts: parseFactsPayload(content) };
  } catch (error) {
    return { ok: false, facts: [], error: error instanceof Error ? error.message : 'llm_failed' };
  } finally {
    clearTimeout(timeoutId);
  }
};

const normalizeFacts = (rawFacts: unknown[], fallbackAuthor: string) => {
  const facts: Array<{
    fact: string;
    category: string;
    people: string[];
    occurred_at: string;
    confidence: number;
    evidence: string;
  }> = [];

  for (const item of rawFacts.slice(0, MAX_FACTS_PER_POST)) {
    if (!item || typeof item !== 'object') continue;
    const source = item as Record<string, unknown>;
    const fact = toText(source.fact, 600);
    if (fact.length < 6) continue;

    const rawCategory = toText(source.category, 60).toLowerCase();
    const category = VALID_CATEGORIES.has(rawCategory) ? rawCategory : 'general';

    const people = Array.isArray(source.people)
      ? source.people
          .map((person) => toText(person, 40))
          .filter(Boolean)
          .slice(0, MAX_PEOPLE_PER_FACT)
      : fallbackAuthor && fallbackAuthor !== '未知'
        ? [fallbackAuthor]
        : [];

    const rawConfidence = Number(source.confidence);
    const confidence = Number.isFinite(rawConfidence)
      ? Math.min(1, Math.max(0, rawConfidence))
      : 0.6;

    facts.push({
      fact,
      category,
      people,
      occurred_at: toText(source.occurred_at, 60),
      confidence,
      evidence: toText(source.evidence, 600),
    });
  }

  return facts;
};

type RunStats = {
  scanned: number;
  inserted: number;
  skipped: number;
  failed: number;
  archivedStale: number;
  indexed: boolean;
  indexError: string;
  errors: string[];
};

const runIngestion = async (client: SupabaseClient, limit: number): Promise<RunStats> => {
  const startedAt = Date.now();
  const stats: RunStats = {
    scanned: 0,
    inserted: 0,
    skipped: 0,
    failed: 0,
    archivedStale: 0,
    indexed: false,
    indexError: '',
    errors: [],
  };

  // 1) 候选帖：approved + 未进账本（账本让「抽不出事实」的帖子也不会被重扫）
  const { data: scannedRows } = await client
    .from('boh_ai_forum_memory_scans')
    .select('post_id')
    .limit(5000);
  const scannedIds = new Set(
    (Array.isArray(scannedRows) ? scannedRows : []).map((row) => String(row.post_id)),
  );

  const { data: postRows, error: postError } = await client
    .from('posts')
    .select('id, title, body, content, author_username, created_at, status')
    .eq('status', 'approved')
    .order('created_at', { ascending: true })
    .limit(Math.min(200, limit * 8));
  if (postError) throw postError;

  const candidates = (Array.isArray(postRows) ? postRows : [])
    .filter((post) => !scannedIds.has(String(post.id)))
    .slice(0, limit);

  // 2) 逐帖抽取（串行：单轮总预算有限，串行比并发更好控且不会打爆限流）
  for (const post of candidates) {
    if (Date.now() - startedAt > RUN_BUDGET_MS) {
      stats.errors.push('run_budget_exceeded');
      break;
    }

    const postId = String(post.id);
    const author = toText(post.author_username, 80);
    const { title, body } = resolvePostText(post as Record<string, unknown>);

    if (!body && title === '无标题') {
      await client
        .from('boh_ai_forum_memory_scans')
        .upsert(
          { post_id: postId, fact_count: 0, model: chatModelId, note: 'empty_post' },
          { onConflict: 'post_id' },
        );
      stats.skipped += 1;
      continue;
    }

    const result = await callFactExtraction({
      title,
      body,
      author,
      createdAt: toText(post.created_at, 40),
    });

    if (!result.ok) {
      // 失败**不写账本** ⇒ 下一轮自动重试该帖
      stats.failed += 1;
      stats.errors.push(`${postId}:${result.error || 'unknown'}`);
      continue;
    }

    const facts = normalizeFacts(result.facts, author);

    let insertedForPost = 0;
    if (facts.length > 0) {
      // 去重：同一帖重跑（手动触发）时不重复入库
      const { data: existingRows } = await client
        .from('boh_ai_forum_memories')
        .select('fact')
        .eq('source_post_id', postId);
      const existingKeys = new Set(
        (Array.isArray(existingRows) ? existingRows : []).map((row) =>
          normalizeFactKey(String(row.fact || '')),
        ),
      );
      const fresh = facts.filter((item) => !existingKeys.has(normalizeFactKey(item.fact)));

      if (fresh.length > 0) {
        const { error: insertError } = await client.from('boh_ai_forum_memories').insert(
          fresh.map((item) => ({
            source_post_id: postId,
            source_post_title: title,
            source_post_author: author,
            fact: item.fact,
            category: item.category,
            people: item.people,
            occurred_at: item.occurred_at,
            confidence: item.confidence,
            evidence: item.evidence,
            model: chatModelId,
            status: 'active',
          })),
        );
        if (insertError) {
          stats.failed += 1;
          stats.errors.push(`${postId}:insert:${insertError.message}`);
          continue;
        }
        insertedForPost = fresh.length;
      }
    }

    await client.from('boh_ai_forum_memory_scans').upsert(
      {
        post_id: postId,
        fact_count: insertedForPost,
        model: chatModelId,
        note: insertedForPost === 0 ? 'no_fact' : '',
      },
      { onConflict: 'post_id' },
    );

    stats.scanned += 1;
    stats.inserted += insertedForPost;
  }

  // 3) 复查：帖子不再 approved（被驳回/隐藏）时，其事实卡一并归档
  try {
    const { data: staleRows } = await client
      .from('boh_ai_forum_memories')
      .select('id, posts!inner(status)')
      .eq('status', 'active')
      .neq('posts.status', 'approved');
    const staleIds = (Array.isArray(staleRows) ? staleRows : []).map((row) => String(row.id));
    if (staleIds.length > 0) {
      await client.from('boh_ai_forum_memories').update({ status: 'archived' }).in('id', staleIds);
      stats.archivedStale = staleIds.length;
    }
  } catch (error) {
    stats.errors.push(`stale_check:${error instanceof Error ? error.message : 'failed'}`);
  }

  // 4) 触发向量索引同步（复用 boh-ai-retrieval 的 embedding 管道）
  if (retrievalSyncSecret) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/boh-ai-retrieval`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'x-retrieval-sync-secret': retrievalSyncSecret,
        },
        body: JSON.stringify({ action: 'sync', sourceTypes: ['forum_memory'], syncLimit: 80 }),
      });
      const payload = await response.json().catch(() => ({}));
      stats.indexed = Boolean(response.ok && payload?.ok !== false);
      if (!stats.indexed)
        stats.indexError = toText(payload?.message, 200) || `http_${response.status}`;
    } catch (error) {
      stats.indexError = error instanceof Error ? error.message : 'sync_failed';
    }
  } else {
    stats.indexError = 'missing_retrieval_sync_secret';
  }

  return stats;
};

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS')
    return new Response('ok', { headers: buildCorsHeaders(origin) });
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405, origin);
  }
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { ok: false, code: 'CONFIG_MISSING', message: '后台服务暂不可用' },
      500,
      origin,
    );
  }

  const authHeader = request.headers.get('authorization') || '';
  const suppliedSecret = request.headers.get('x-forum-memory-secret') || '';
  const isCron = Boolean(
    (manualSecret && suppliedSecret === manualSecret) ||
    (dispatchKey && authHeader === `Bearer ${dispatchKey}`) ||
    (serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`),
  );
  if (!isCron) {
    return jsonResponse(
      { ok: false, code: 'UNAUTHORIZED', message: '仅允许后台任务调用' },
      401,
      origin,
    );
  }

  const body = await request.json().catch(() => ({}));
  const limit = clampInt(body?.limit, DEFAULT_MAX_POSTS_PER_RUN, 1, 60);
  const client = createServiceClient();

  // pg_net 的 http_post 默认 5s 超时：cron 通道必须**立即回 202**，
  // 真正干活交给 EdgeRuntime.waitUntil；手动调试传 wait:true 才同步等结果。
  if (body?.wait !== true) {
    EdgeRuntime.waitUntil(
      runIngestion(client, limit)
        .then((stats) => console.log('[boh-ai-forum-memory] 摄取完成', JSON.stringify(stats)))
        .catch((error) => console.error('[boh-ai-forum-memory] 摄取失败', error)),
    );
    return jsonResponse({ ok: true, accepted: true, limit }, 202, origin);
  }

  const stats = await runIngestion(client, limit).catch((error) => ({
    scanned: 0,
    inserted: 0,
    skipped: 0,
    failed: 0,
    archivedStale: 0,
    indexed: false,
    indexError: '',
    errors: [error instanceof Error ? error.message : String(error)],
  }));
  return jsonResponse({ ok: stats.errors.length === 0, data: stats }, 200, origin);
});
