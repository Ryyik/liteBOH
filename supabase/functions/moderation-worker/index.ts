import { createClient } from 'npm:@supabase/supabase-js@2.99.1';

type ModerationJob = {
  id: string;
  target_type: 'post' | 'comment' | 'message';
  target_id: string;
  content_snapshot: string;
  content_hash: string;
  attempt_count: number;
  max_attempts: number;
};

type ModerationResult = {
  status: 'approved' | 'rejected';
  message: string;
  reason: string;
  reasonCode: string;
  confidence: number;
  source: string;
  model: string;
};

const MODERATION_API_URL = String(
  Deno.env.get('MODERATION_API_URL')
    || Deno.env.get('SILICON_CLOUD_URL')
    || Deno.env.get('VITE_SILICON_CLOUD_URL')
    || 'https://api.siliconflow.cn/v1/chat/completions',
).trim();
const MODERATION_API_KEY = String(
  Deno.env.get('MODERATION_API_KEY')
    || Deno.env.get('SILICON_CLOUD_API_KEY')
    || Deno.env.get('VITE_SILICON_CLOUD_API_KEY')
    || Deno.env.get('VITE_GLM_MODERATION_API_KEY')
    || '',
).trim();
const MODERATION_MODEL_ID = String(
  Deno.env.get('MODERATION_MODEL_ID')
    || Deno.env.get('VITE_MODERATION_MODEL_ID')
    || 'Qwen/Qwen2.5-7B-Instruct',
).trim();
const WORKER_SECRET = String(Deno.env.get('MODERATION_WORKER_SECRET') || '').trim();
const DEFAULT_WORKER_ID = `edge-${crypto.randomUUID()}`;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_LOCK_SECONDS = 180;
const REQUEST_TIMEOUT_MS = 12000;
const RETRY_DELAY_MS = 350;
const REJECT_DECISION_MIN_CONFIDENCE = 0.96;
const STRONG_REJECT_CONFIDENCE = 0.995;

const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim();
const supabaseServiceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();

const buildCorsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-worker-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Origin': origin || '*',
  'Cache-Control': 'no-store',
  Vary: 'Origin',
});

const jsonResponse = (
  body: unknown,
  status = 200,
  origin: string | null = null,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...buildCorsHeaders(origin),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

const createServiceClient = () => {
  if (!supabaseUrl) {
    throw new Error('缺少环境变量 SUPABASE_URL');
  }
  if (!supabaseServiceRoleKey) {
    throw new Error('缺少环境变量 SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'boh-moderation-worker',
      },
    },
  });
};

const moderationSystemPrompt = [
  '<role>你是内容安全审查助手。</role>',
  '<constraints>',
  '- 仅在"非常确定"存在严重违规时才拒绝，尽量降低误判',
  '- 严重违规示例：暴恐煽动、明确违法交易（毒品/枪支/爆炸物）、未成年人性相关内容、组织性仇恨攻击',
  '- 普通吐槽、一般争论、游戏讨论、新闻转述、学术讨论、引用他人观点，默认应通过',
  '</constraints>',
  '<output_format>',
  '严格只输出 JSON：{"status":"approved|rejected","confidence":0~1,"reason_code":"...","reason":"..."}',
  '</output_format>',
].join('\n');

const HARD_BLOCK_PATTERNS = [
  /枪支买卖/u,
  /买卖枪支/u,
  /出售枪支/u,
  /购买枪支/u,
  /制作炸弹教程/u,
  /炸药配方/u,
  /儿童色情/u,
  /未成年(人)?色(情|图|片|视频)/u,
  /贩卖毒品/u,
  /出售毒品/u,
  /购买毒品/u,
];

const SEVERE_REASON_MARKERS = [
  '暴恐',
  '恐怖',
  '未成年',
  '儿童',
  '色情',
  '毒品',
  '枪支',
  '炸弹',
  '爆炸物',
  '仇恨',
  '违法交易',
  'illegal',
  'terror',
  'sexual_minor',
  'child',
  'weapon',
  'drug',
];

const BENIGN_CONTEXT_MARKERS = [
  '新闻',
  '报道',
  '转述',
  '引用',
  '学术',
  '历史',
  '科普',
  '电影',
  '游戏剧情',
  '小说',
  '谴责',
  '反对',
  '防范',
  '案例分析',
  '讨论',
];

const MALICIOUS_INTENT_MARKERS = [
  '怎么买',
  '怎么卖',
  '怎么做',
  '教程',
  '配方',
  '联系方式',
  '代购',
  '渠道',
  '交易',
  '出售',
  '贩卖',
  '求购',
  '带价',
];

const clamp01 = (value: unknown) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(1, Math.max(0, num));
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const includesAny = (text: string, markers: string[]) =>
  markers.some((marker) => text.includes(marker.toLowerCase()));

const hasLikelyBenignContext = (content: string) => {
  const text = content.toLowerCase();
  return includesAny(text, BENIGN_CONTEXT_MARKERS) && !includesAny(text, MALICIOUS_INTENT_MARKERS);
};

const hasSevereReasonSignal = (reasonCode = '', reason = '') => {
  const text = `${reasonCode} ${reason}`.toLowerCase();
  return includesAny(text, SEVERE_REASON_MARKERS);
};

const normalizeStatus = (status: unknown): 'approved' | 'rejected' => {
  const normalized = String(status || '').trim().toLowerCase();
  if (['rejected', 'reject', 'blocked', 'block', 'needs_review', 'pending', 'review'].includes(normalized)) {
    return 'rejected';
  }
  return 'approved';
};

const extractJsonObject = (raw: string) => {
  const text = String(raw || '').trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_error) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (_error2) {
      return null;
    }
  }
};

const resolveDecision = (parsed: Record<string, unknown>) => {
  const rawDecision = parsed.status || parsed.decision || parsed.result;
  if (String(rawDecision || '').trim()) return rawDecision;

  for (const field of ['is_safe', 'safe', 'allowed', 'pass']) {
    if (typeof parsed[field] === 'boolean') {
      return parsed[field] ? 'approved' : 'rejected';
    }
  }

  return 'approved';
};

const parseModerationPayload = (rawText: string, content: string): ModerationResult => {
  const parsed = extractJsonObject(rawText);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('AI 审核返回无法解析');
  }

  const payload = parsed as Record<string, unknown>;
  const normalizedStatus = normalizeStatus(resolveDecision(payload));
  const confidence = clamp01(payload.confidence ?? payload.score ?? payload.probability ?? payload.risk_score);
  const reasonCode = String(payload.reason_code || payload.code || '').trim().slice(0, 48);
  const reason = String(payload.reason || payload.message || payload.detail || '').trim().slice(0, 200);

  if (normalizedStatus === 'rejected' && confidence >= REJECT_DECISION_MIN_CONFIDENCE) {
    const severeReason = hasSevereReasonSignal(reasonCode, reason);
    const benignContext = hasLikelyBenignContext(content);
    const strongConfidence = confidence >= STRONG_REJECT_CONFIDENCE;

    if (strongConfidence || (severeReason && !benignContext)) {
      return {
        status: 'rejected',
        message: reason || '包含严重违规内容，已拒绝',
        reason: reason || '包含严重违规内容，已拒绝',
        reasonCode: reasonCode || 'AI_HIGH_RISK',
        confidence,
        source: 'ai',
        model: MODERATION_MODEL_ID,
      };
    }
  }

  return {
    status: 'approved',
    message: '通过',
    reason: reason || '通过',
    reasonCode: reasonCode || 'AI_ALLOW',
    confidence,
    source: 'ai',
    model: MODERATION_MODEL_ID,
  };
};

const localModeration = (content: string): ModerationResult | null => {
  const cleanContent = content.toLowerCase();
  for (const pattern of HARD_BLOCK_PATTERNS) {
    if (pattern.test(cleanContent)) {
      return {
        status: 'rejected',
        message: '命中高风险违禁词，已拒绝',
        reason: '命中高风险违禁词，已拒绝',
        reasonCode: 'LOCAL_KEYWORD_BLOCK',
        confidence: 1,
        source: 'local',
        model: MODERATION_MODEL_ID,
      };
    }
  }
  return null;
};

const callAIModerationOnce = async (content: string, targetType: string): Promise<ModerationResult> => {
  if (!MODERATION_API_KEY) {
    throw new Error('缺少 MODERATION_API_KEY / SILICON_CLOUD_API_KEY');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(MODERATION_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MODERATION_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODERATION_MODEL_ID,
        messages: [
          { role: 'system', content: moderationSystemPrompt },
          { role: 'user', content: `场景: ${targetType}\n内容: ${content}` },
        ],
        stream: false,
        temperature: 0,
        max_tokens: 120,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`AI 审核请求失败: ${response.status}`);
    }

    const data = await response.json().catch(() => ({}));
    const aiText = String(data?.choices?.[0]?.message?.content || '');
    return parseModerationPayload(aiText, content);
  } finally {
    clearTimeout(timeoutId);
  }
};

const moderateContent = async (content: string, targetType: string): Promise<ModerationResult> => {
  const localResult = localModeration(content);
  if (localResult) return localResult;

  try {
    return await callAIModerationOnce(content, targetType);
  } catch (firstError) {
    await sleep(RETRY_DELAY_MS);
    try {
      return await callAIModerationOnce(content, targetType);
    } catch (secondError) {
      const firstMessage = firstError instanceof Error ? firstError.message : String(firstError);
      const secondMessage = secondError instanceof Error ? secondError.message : String(secondError);
      throw new Error(`审核服务失败: ${firstMessage}; retry: ${secondMessage}`);
    }
  }
};

const isAuthorized = (request: Request) => {
  if (!WORKER_SECRET) {
    return { ok: false, code: 'WORKER_SECRET_MISSING', message: '缺少 MODERATION_WORKER_SECRET 环境变量。' };
  }

  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerSecret = request.headers.get('x-worker-secret') || '';
  const provided = bearerToken || headerSecret;
  if (provided !== WORKER_SECRET) {
    return { ok: false, code: 'UNAUTHORIZED', message: '无效的 worker 调用凭证。' };
  }

  return { ok: true };
};

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: buildCorsHeaders(origin),
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST 请求。' }, 405, origin);
  }

  const auth = isAuthorized(request);
  if (!auth.ok) {
    return jsonResponse(auth, auth.code === 'WORKER_SECRET_MISSING' ? 500 : 401, origin);
  }

  const body = await request.json().catch(() => ({}));
  const batchSize = Math.min(Math.max(Number(body?.limit || DEFAULT_BATCH_SIZE), 1), 50);
  const workerId = String(body?.workerId || DEFAULT_WORKER_ID).trim().slice(0, 120) || DEFAULT_WORKER_ID;
  const serviceClient = createServiceClient();

  const { data: jobs, error: claimError } = await serviceClient.rpc('claim_moderation_jobs', {
    p_limit: batchSize,
    p_worker_id: workerId,
    p_lock_seconds: DEFAULT_LOCK_SECONDS,
  });

  if (claimError) {
    return jsonResponse({
      ok: false,
      code: 'CLAIM_JOBS_FAILED',
      message: claimError.message,
    }, 500, origin);
  }

  const claimedJobs = Array.isArray(jobs) ? jobs as ModerationJob[] : [];
  const results = [];

  for (const job of claimedJobs) {
    try {
      const moderation = await moderateContent(job.content_snapshot, job.target_type);
      const { data: completeData, error: completeError } = await serviceClient.rpc('complete_moderation_job', {
        p_job_id: job.id,
        p_worker_id: workerId,
        p_ai_result: moderation.status,
        p_ai_reason: moderation.reason || moderation.message || moderation.reasonCode,
        p_ai_model: moderation.model,
      });

      if (completeError) {
        throw completeError;
      }

      results.push({
        jobId: job.id,
        targetType: job.target_type,
        targetId: job.target_id,
        result: moderation.status,
        complete: completeData,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '审核任务失败');
      const { data: failData, error: failError } = await serviceClient.rpc('fail_moderation_job', {
        p_job_id: job.id,
        p_worker_id: workerId,
        p_error: message,
      });

      results.push({
        jobId: job.id,
        targetType: job.target_type,
        targetId: job.target_id,
        result: 'failed',
        message,
        fail: failData,
        failError: failError?.message || null,
      });
    }
  }

  return jsonResponse({
    ok: true,
    workerId,
    claimed: claimedJobs.length,
    results,
  }, 200, origin);
});
