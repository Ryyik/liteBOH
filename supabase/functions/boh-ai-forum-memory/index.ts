/**
 * boh-ai-forum-memory — 论坛记忆增量摄取（每日 pg_cron 触发，也可手动调）。
 *
 * 做什么（用户口径 2026-10-16：全部公开帖 + 每日定时抽事实卡）：
 *   1. 找出 `status = 'approved'` 且**尚未进过摄取账本**的帖子（最早的优先）。
 *   2. 逐条交给 LLM 抽「事实卡」—— 一句话事实 + 涉及成员 + 时间 + 原文证据 + 置信度。
 *   2b. 入库闸门（2026-10-19）：evidence 必须是原文子串 → fact 必须被 evidence 支持
 *       （entailed/partial/not）→ people 归一成 entity slug。partial / 低置信进
 *       `pending_review`，不建索引；not 直接丢弃。跨帖同 fact_key 的新事实会归档旧事实。
 *   3. 写入 `boh_ai_forum_memories`，并把该帖记进 `boh_ai_forum_memory_scans`
 *      （**含抽出 0 条事实的帖子**，否则那些帖子每轮都会被重扫）。
 *   4. 复查：已被扫过、但帖子不再是 approved 的（被驳回/隐藏），其事实卡一并归档。
 *   5. 最后调 `boh-ai-retrieval` 的 `action=sync, sourceTypes=['forum_memory']`
 *      触发向量索引 —— 复用既有 embedding 管道，不在这里重复实现一份。
 *
 * 为什么不在前端做：事实抽取是**离线批处理**，与聊天请求无关；
 * 放前端会让每个用户各自调用一遍 LLM，成本与结果都不受控。
 *
 * 鉴权（2026-10-18 起三通道 + 管理员）：
 *   ① `Authorization: Bearer <BOH_PUSH_DISPATCH_KEY>`（pg_cron 通道 —— cron 命令从
 *      `vault.decrypted_secrets` 取 `push_dispatch_key`，命令文本里不含明文密钥）
 *   ② `x-forum-memory-secret: <FORUM_MEMORY_SECRET>`（手动触发通道，可选）
 *   ③ 管理员用户 JWT（Bearer <access_token>，服务端查 profiles.role='admin'）——
 *      数据管理面板「论坛事实卡」的「补扫存量」按钮用（同 boh-ai-retrieval 的 isAdmin 模式）
 *   service_role key 也接受，便于服务端互调与调试。
 *
 * 调用：
 *   POST /functions/v1/boh-ai-forum-memory                # 异步，立即 202
 *   POST /functions/v1/boh-ai-forum-memory  {"wait":true}  # 同步等待，返回本轮统计
 *   POST .../boh-ai-forum-memory  {"limit":3,"wait":true}  # 只处理 3 条（调试用）
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0';
import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';

/**
 * Supabase Edge Runtime 提供的全局，**Deno 的类型库里没有声明** ⇒ `deno check` 会报
 * TS2304 Cannot find name 'EdgeRuntime'。本地声明一次即可（push-send / forum-async-worker
 * 踩的是同一个坑，一并补了声明）。
 */
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

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
/**
 * 事实蕴含校验开关（2026-10-19）：默认开。关掉只保留「证据必须是原文子串」，
 * 用于供应商模型不可用时的应急降级 —— 但会重新引入「模型抽什么就 active 什么」的风险，
 * 只应在确认 verifier 不可用时临时改。
 */
const FACT_VERIFY_ENABLED =
  String(Deno.env.get('BOH_AI_FACT_VERIFY_ENABLED') || 'true').trim() !== 'false';
/** entailed 事实自动 active 的最低抽取置信度；低于它进 pending_review。 */
const FACT_AUTO_ACTIVE_MIN_CONFIDENCE = Math.min(
  1,
  Math.max(0, Number(Deno.env.get('BOH_AI_FACT_AUTO_ACTIVE_MIN_CONFIDENCE') || 0.75) || 0.75),
);

/** 单轮最多处理多少帖：Edge Function 有执行时长上限，宁可多跑几轮也不要把整站一次吞掉。 */
const DEFAULT_MAX_POSTS_PER_RUN = 12;
/** 单轮总预算，超了就提前收工，把剩下的留给下一轮。 */
const RUN_BUDGET_MS = 110000;
const LLM_TIMEOUT_MS = 45000;
/** 相邻两帖之间的间隔：补扫是逐帖串行打 LLM，连续 12 发容易触发供应商限流（api_429）。 */
const POST_SPACING_MS = 400;
/** 瞬时错误（限流/5xx/网络/超时）的重试间隔。 */
const LLM_RETRY_DELAY_MS = 1600;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
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

/** 瞬时错误判定：限流 / 5xx / 网络 / 超时 —— 值得重试一次；解析失败不值得。 */
const isTransientLlmError = (error: string) =>
  error === 'api_429' ||
  /^api_5\d\d$/.test(error) ||
  /abort|timeout|fetch|network|reset/i.test(error);

/**
 * 带一次重试的事实抽取（2026-10-19 补扫成功率修复）：
 * 补扫是逐帖串行打 LLM，供应商限流（api_429）与偶发超时很常见；单次失败就让
 * 该帖留到下一轮，会让「12 帖/轮」的有效吞吐掉一半。瞬时错误这里退避 1.6s 重试一次；
 * 非瞬时错误（如缺 key / 4xx 参数错）直接返回，不做无谓等待。
 */
const callFactExtractionWithRetry = async (post: {
  title: string;
  body: string;
  author: string;
  createdAt: string;
}) => {
  const first = await callFactExtraction(post);
  if (first.ok || !isTransientLlmError(String(first.error || ''))) return first;
  await sleep(LLM_RETRY_DELAY_MS);
  return callFactExtraction(post);
};

type NormalizedFact = {
  fact: string;
  category: string;
  people: string[];
  occurred_at: string;
  confidence: number;
  evidence: string;
};

const normalizeFacts = (rawFacts: unknown[], fallbackAuthor: string): NormalizedFact[] => {
  const facts: NormalizedFact[] = [];

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

/**
 * 实体别名（2026-10-19）：把模型自由输出的 `people[]` 归一到 entity_id。
 * 表不存在（迁移未应用）时返回空数组，摄入流程照旧，只是少了 people_ids。
 */
type EntityAliasEntry = {
  entityId: string;
  normalizedAlias: string;
  ambiguous: boolean;
};

let entityAliasCache: { at: number; entries: EntityAliasEntry[] } | null = null;
const ENTITY_ALIAS_CACHE_TTL_MS = 5 * 60 * 1000;

const normalizeEntityText = (text: string) =>
  String(text || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\u3000，。！？、,.!?;；:：'"“”‘’（）()【】[\]《》<>·~～\-_/\\|]+/g, '');

const loadEntityAliases = async (client: SupabaseClient): Promise<EntityAliasEntry[]> => {
  const now = Date.now();
  if (entityAliasCache && now - entityAliasCache.at < ENTITY_ALIAS_CACHE_TTL_MS) {
    return entityAliasCache.entries;
  }
  try {
    const [{ data: aliases, error }, { data: entities }] = await Promise.all([
      client
        .from('boh_ai_entity_aliases')
        .select('entity_id, alias, normalized_alias, is_ambiguous')
        .limit(2000),
      client.from('boh_ai_entities').select('id, slug, status').eq('status', 'active').limit(500),
    ]);
    if (error) return entityAliasCache?.entries || [];
    const slugById = new Map(
      (Array.isArray(entities) ? entities : []).map((row) => [
        String(row.id),
        toText(row.slug, 80),
      ]),
    );
    const entries = (Array.isArray(aliases) ? aliases : [])
      .map((row) => ({
        entityId: slugById.get(String(row.entity_id || '')) || '',
        normalizedAlias:
          toText(row.normalized_alias, 120) || normalizeEntityText(String(row.alias || '')),
        ambiguous: Boolean(row.is_ambiguous),
      }))
      .filter((entry) => entry.entityId && entry.normalizedAlias);
    entityAliasCache = { at: now, entries };
    return entries;
  } catch (_error) {
    return entityAliasCache?.entries || [];
  }
};

const resolvePeopleIds = (people: string[], entries: EntityAliasEntry[]) => {
  if (entries.length === 0) return [];
  const ids = new Set<string>();
  for (const person of people) {
    const normalized = normalizeEntityText(person);
    if (!normalized) continue;
    let best: EntityAliasEntry | null = null;
    for (const entry of entries) {
      const exact = entry.normalizedAlias === normalized;
      if (entry.ambiguous && !exact) continue;
      if (!exact && !normalized.includes(entry.normalizedAlias)) continue;
      if (!best || entry.normalizedAlias.length > best.normalizedAlias.length) best = entry;
    }
    if (best) ids.add(best.entityId);
  }
  return [...ids];
};

const normalizeEvidenceText = (text: string) =>
  String(text || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');

/** 证据必须是原文子串（逐字优先；逐字失败时用去标点归一化再比）。 */
const locateEvidence = (postText: string, evidence: string) => {
  const raw = String(evidence || '').trim();
  if (!raw) return { grounded: false, start: null as number | null, end: null as number | null };
  const rawIndex = postText.indexOf(raw);
  if (rawIndex >= 0) {
    return { grounded: true, start: rawIndex, end: rawIndex + raw.length };
  }
  const normalizedPost = normalizeEvidenceText(postText);
  const normalizedEvidence = normalizeEvidenceText(raw);
  if (normalizedEvidence && normalizedPost.includes(normalizedEvidence)) {
    return { grounded: true, start: null, end: null };
  }
  return { grounded: false, start: null, end: null };
};

/**
 * 事实蕴含校验：一次调用核对一帖的全部候选事实。
 * 失败/缺 key 一律按 `partial` 处理（fail closed）—— 宁可进待审，不要自动发布。
 */
const VERIFICATION_SYSTEM_PROMPT = [
  '你是事实核对员。给定一段原文和若干候选事实，逐条判断候选事实是否被原文支持。',
  '只输出 JSON，不要解释、不要 markdown 代码块：',
  '{"results":[{"index":0,"support":"entailed|partial|not"}]}',
  '判定口径：',
  '- entailed：原文明确支持这条事实，不需要额外推断；',
  '- partial：原文只支持一部分，或需要推断/补全；',
  '- not：原文不支持、或与原文矛盾。',
  '禁止使用原文之外的知识。',
].join('\n');

const parseVerificationPayload = (raw: string) => {
  const text = String(raw || '')
    .replace(/```json/gi, '```')
    .replace(/```/g, '')
    .trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed?.results) ? parsed.results : [];
  } catch (_error) {
    return [];
  }
};

const verifyFactsAgainstEvidence = async (
  postText: string,
  facts: Array<{ fact: string; evidence: string }>,
): Promise<Array<'entailed' | 'partial' | 'not'>> => {
  if (facts.length === 0) return [];
  if (!siliconApiKey) return facts.map(() => 'partial');

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
        temperature: 0,
        max_tokens: Math.max(300, facts.length * 120),
        messages: [
          { role: 'system', content: VERIFICATION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              `原文：${postText}`,
              '候选事实：',
              ...facts.map(
                (item, index) => `${index}. 事实：${item.fact}\n   证据：${item.evidence}`,
              ),
            ].join('\n'),
          },
        ],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return facts.map(() => 'partial');
    const results = parseVerificationPayload(String(payload?.choices?.[0]?.message?.content || ''));
    const byIndex = new Map<number, string>();
    for (const item of results) {
      const index = Number((item as { index?: unknown })?.index);
      const support = String((item as { support?: unknown })?.support || '').toLowerCase();
      if (!Number.isInteger(index)) continue;
      if (support === 'entailed' || support === 'partial' || support === 'not') {
        byIndex.set(index, support);
      }
    }
    return facts.map((_item, index) => {
      const support = byIndex.get(index);
      return support === 'entailed' || support === 'not' ? support : 'partial';
    });
  } catch (_error) {
    return facts.map(() => 'partial');
  } finally {
    clearTimeout(timeoutId);
  }
};

const buildFactKey = (fact: string, peopleIds: string[]) =>
  `${normalizeFactKey(fact).toLowerCase()}|${[...peopleIds].sort().join(',')}`;

type GroundedFact = {
  fact: string;
  category: string;
  people: string[];
  peopleIds: string[];
  occurred_at: string;
  confidence: number;
  evidence: string;
  evidenceStart: number | null;
  evidenceEnd: number | null;
  supportLevel: 'entailed' | 'partial' | 'not';
  status: 'active' | 'pending_review' | 'rejected';
  factKey: string;
  /** 跨帖同事实取代：新事实 active 时，归档旧的那条 */
  supersedesId?: string | null;
};

/**
 * 入库闸门：证据子串 → 事实蕴含 → 实体归一 → 状态判定。
 * 2026-10-19 之前这里什么都没有：模型抽出什么就 active 什么，
 * 一条编造事实会立刻被 embedding 索引，之后每次都被当 [K1] 证据引用。
 */
const groundFacts = async (
  post: { title: string; body: string; author: string },
  facts: NormalizedFact[],
  aliasEntries: EntityAliasEntry[],
): Promise<{ grounded: GroundedFact[]; dropped: number }> => {
  const postText = `${post.title}\n${post.body}`;
  const evidenceChecked: Array<
    NormalizedFact & { evidenceStart: number | null; evidenceEnd: number | null }
  > = [];
  let dropped = 0;

  for (const item of facts) {
    const located = locateEvidence(postText, item.evidence);
    if (!located.grounded) {
      dropped += 1;
      continue;
    }
    evidenceChecked.push({
      ...item,
      evidenceStart: located.start,
      evidenceEnd: located.end,
    });
  }

  const supports = FACT_VERIFY_ENABLED
    ? await verifyFactsAgainstEvidence(
        postText,
        evidenceChecked.map((item) => ({ fact: item.fact, evidence: item.evidence })),
      )
    : evidenceChecked.map(() => 'entailed' as const);

  const grounded: GroundedFact[] = [];
  evidenceChecked.forEach((item, index) => {
    const supportLevel = supports[index] || 'partial';
    if (supportLevel === 'not') {
      dropped += 1;
      return;
    }
    const people = item.people.length > 0 ? item.people : post.author ? [post.author] : [];
    const peopleIds = resolvePeopleIds(people, aliasEntries);
    const status =
      supportLevel === 'entailed' && item.confidence >= FACT_AUTO_ACTIVE_MIN_CONFIDENCE
        ? 'active'
        : 'pending_review';
    grounded.push({
      ...item,
      people,
      peopleIds,
      supportLevel,
      status,
      factKey: buildFactKey(item.fact, peopleIds),
    });
  });

  return { grounded, dropped };
};

type RunStats = {
  scanned: number;
  inserted: number;
  /** 证据不成立 / 严格不支持而被丢弃的事实数 */
  dropped: number;
  /** 进入待审队列的事实数 */
  pending: number;
  skipped: number;
  failed: number;
  archivedStale: number;
  indexed: boolean;
  indexError: string;
  /** 预算到点提前收工（正常行为，不算失败；剩余帖子留给下一轮） */
  budgetExceeded: boolean;
  errors: string[];
};

const runIngestion = async (client: SupabaseClient, limit: number): Promise<RunStats> => {
  const startedAt = Date.now();
  const stats: RunStats = {
    scanned: 0,
    inserted: 0,
    dropped: 0,
    pending: 0,
    skipped: 0,
    failed: 0,
    archivedStale: 0,
    indexed: false,
    indexError: '',
    budgetExceeded: false,
    errors: [],
  };

  // 1) 候选帖：approved + 未进账本（账本让「抽不出事实」的帖子也不会被重扫）
  //
  // ⚠️ 2026-10-19 修「窗口饿死」：旧实现只取**最旧的 limit*8 = 96 条**再过滤已扫，
  //    而扫描同样是 created_at 升序 ⇒ 扫满前 96 条后，这个窗口里全是已扫帖，
  //    candidates 永远为空 —— 表现是「连续 N 轮零进展、errors 为空、永远卡在 96/150」。
  //    改为：先按页只取 id（轻量），凑够 limit 个未扫 id 就停；再按 id 取完整行。
  const scannedIds = new Set<string>();
  const SCAN_LEDGER_PAGE = 1000;
  for (let offset = 0; ; offset += SCAN_LEDGER_PAGE) {
    const { data: page, error: scanError } = await client
      .from('boh_ai_forum_memory_scans')
      .select('post_id')
      .range(offset, offset + SCAN_LEDGER_PAGE - 1);
    if (scanError) throw scanError;
    const rows = Array.isArray(page) ? page : [];
    rows.forEach((row) => scannedIds.add(String(row.post_id)));
    if (rows.length < SCAN_LEDGER_PAGE) break;
    // 账本上限保护：5 万帖以内全量比对；超出后按「未扫」处理（宁可重扫也不漏扫）
    if (offset >= 49000) break;
  }

  const CANDIDATE_PAGE_SIZE = 200;
  const candidateIds: string[] = [];
  for (
    let offset = 0;
    candidateIds.length < limit && offset < 50000;
    offset += CANDIDATE_PAGE_SIZE
  ) {
    const { data: page, error: pageError } = await client
      .from('posts')
      .select('id')
      .eq('status', 'approved')
      .order('created_at', { ascending: true })
      .range(offset, offset + CANDIDATE_PAGE_SIZE - 1);
    if (pageError) throw pageError;
    const rows = Array.isArray(page) ? page : [];
    for (const row of rows) {
      if (!scannedIds.has(String(row.id))) candidateIds.push(String(row.id));
      if (candidateIds.length >= limit) break;
    }
    if (rows.length < CANDIDATE_PAGE_SIZE) break;
  }

  const candidates: Array<Record<string, unknown>> = [];
  if (candidateIds.length > 0) {
    const { data: postRows, error: postError } = await client
      .from('posts')
      .select('id, title, body, content, author_username, created_at, status')
      .in('id', candidateIds);
    if (postError) throw postError;
    const byId = new Map(
      (Array.isArray(postRows) ? postRows : []).map((row) => [String(row.id), row]),
    );
    // 保持「最早优先」的候选顺序
    candidateIds.forEach((id) => {
      const row = byId.get(id);
      if (row) candidates.push(row as Record<string, unknown>);
    });
  }

  // 2) 逐帖抽取（串行：单轮总预算有限，串行比并发更好控且不会打爆限流）
  // 别名表只读一次，整轮复用（5 分钟缓存，表不存在时返回空数组）。
  const aliasEntries = await loadEntityAliases(client);
  for (const post of candidates) {
    if (Date.now() - startedAt > RUN_BUDGET_MS) {
      // 预算到点 = 正常收工（本轮剩下的下一轮再扫），**不进 errors** ——
      // 旧实现把它 push 进 errors，导致每轮 ok=false、面板永远显示「有失败」。
      stats.budgetExceeded = true;
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

    const result = await callFactExtractionWithRetry({
      title,
      body,
      author,
      createdAt: toText(post.created_at, 40),
    });
    // 相邻两帖之间留一点间隔，避免连续 12 发打爆供应商限流
    await sleep(POST_SPACING_MS);

    if (!result.ok) {
      // 失败**不写账本** ⇒ 下一轮自动重试该帖
      stats.failed += 1;
      stats.errors.push(`${postId}:${result.error || 'unknown'}`);
      continue;
    }

    const facts = normalizeFacts(result.facts, author);
    // 入库闸门（2026-10-19）：证据必须是原文子串、事实必须被证据支持、人名必须能归一。
    // 不通过的不建索引；partial/低置信进 pending_review，等后台确认。
    const groundedResult = await groundFacts({ title, body, author }, facts, aliasEntries);
    const groundedFacts = groundedResult.grounded;
    stats.dropped += groundedResult.dropped;

    let insertedForPost = 0;
    if (groundedFacts.length > 0) {
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
      const fresh = groundedFacts.filter((item) => !existingKeys.has(normalizeFactKey(item.fact)));

      if (fresh.length > 0) {
        // 跨帖同事实取代（2026-10-19）：fact_key 相同的旧 active 事实先归档，
        // 新事实记 supersedes_id。只对 active 的新事实做 —— pending_review 不能把旧证据顶掉。
        const supersededIds: string[] = [];
        for (const item of fresh) {
          if (item.status !== 'active' || !item.factKey || item.factKey.length < 8) continue;
          try {
            const { data: priorRows } = await client
              .from('boh_ai_forum_memories')
              .select('id')
              .eq('fact_key', item.factKey)
              .eq('status', 'active')
              .neq('source_post_id', postId)
              .order('updated_at', { ascending: false })
              .limit(1);
            const priorId =
              Array.isArray(priorRows) && priorRows[0]?.id ? String(priorRows[0].id) : '';
            if (priorId) {
              item.supersedesId = priorId;
              supersededIds.push(priorId);
            }
          } catch (_error) {
            // fact_key 列不存在（迁移未应用）时跳过取代，不影响入库
          }
        }

        const rows = fresh.map((item) => ({
          source_post_id: postId,
          source_post_title: title,
          source_post_author: author,
          fact: item.fact,
          category: item.category,
          people: item.people,
          people_ids: item.peopleIds,
          people_surface: item.people,
          occurred_at: item.occurred_at,
          confidence: item.confidence,
          evidence: item.evidence,
          evidence_start: item.evidenceStart,
          evidence_end: item.evidenceEnd,
          support_level: item.supportLevel,
          fact_key: item.factKey,
          supersedes_id: item.supersedesId || null,
          model: chatModelId,
          status: item.status,
        }));

        let { error: insertError } = await client.from('boh_ai_forum_memories').insert(rows);

        // 迁移未应用时的降级：退回旧列；pending_review 在新 CHECK 不存在时写 archived
        //（archived 不参与 vector sync，等价于「先不发布」）。
        if (
          insertError &&
          /people_ids|people_surface|fact_key|support_level|evidence_start|evidence_end|status/i.test(
            insertError.message,
          )
        ) {
          const legacyRows = rows.map((row) => ({
            source_post_id: row.source_post_id,
            source_post_title: row.source_post_title,
            source_post_author: row.source_post_author,
            fact: row.fact,
            category: row.category,
            people: row.people,
            occurred_at: row.occurred_at,
            confidence: row.confidence,
            evidence: row.evidence,
            model: row.model,
            status: row.status === 'active' ? 'active' : 'archived',
          }));
          ({ error: insertError } = await client.from('boh_ai_forum_memories').insert(legacyRows));
        }

        if (insertError) {
          stats.failed += 1;
          stats.errors.push(`${postId}:insert:${insertError.message}`);
          continue;
        }
        insertedForPost = fresh.length;
        stats.pending += fresh.filter((item) => item.status === 'pending_review').length;

        if (supersededIds.length > 0) {
          const { error: archiveError } = await client
            .from('boh_ai_forum_memories')
            .update({ status: 'archived' })
            .in('id', supersededIds);
          if (archiveError) stats.errors.push(`${postId}:supersede:${archiveError.message}`);
        }
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
        body: JSON.stringify({
          action: 'sync',
          // 2026-10-17：同一轮顺带同步官方新闻/活动 —— 每晚一次覆盖全部官方内容源
          sourceTypes: ['forum_memory', 'site_news', 'site_activity'],
          syncLimit: 80,
        }),
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
  const client = createServiceClient();

  // 管理员面板通道（2026-10-18）：Bearer 是**用户 JWT**（不是 dispatch/service_role 固定值）
  // 时解出 uid 查 profiles.role —— 与 boh-ai-retrieval 的 isAdmin 同款。放在 cron 判定后，
  // 三个既有通道零成本直通，不为它们多付一次 getUser 往返。
  let isAdmin = false;
  if (!isCron && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer && bearer !== serviceRoleKey && bearer !== dispatchKey) {
      const { data: userData, error: userError } = await client.auth.getUser(bearer);
      const userId = userError ? '' : String(userData?.user?.id || '');
      if (userId) {
        const { data: profileRow } = await client
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .maybeSingle();
        isAdmin = String(profileRow?.role || '').trim() === 'admin';
      }
    }
  }
  if (!isCron && !isAdmin) {
    return jsonResponse(
      { ok: false, code: 'UNAUTHORIZED', message: '仅允许后台任务或管理员调用' },
      401,
      origin,
    );
  }

  const body = await request.json().catch(() => ({}));
  const limit = clampInt(body?.limit, DEFAULT_MAX_POSTS_PER_RUN, 1, 60);

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
    budgetExceeded: false,
    errors: [error instanceof Error ? error.message : String(error)],
  }));
  return jsonResponse({ ok: stats.errors.length === 0, data: stats }, 200, origin);
});
