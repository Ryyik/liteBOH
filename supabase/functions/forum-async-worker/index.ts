import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.99.1';
import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';

const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim();
const serviceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
const anonKey = String(Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '').trim();
const workerSecret = String(Deno.env.get('FORUM_WORKER_SECRET') || '').trim();
const moderationUrl = String(Deno.env.get('MODERATION_API_URL') || 'https://api.siliconflow.cn/v1/chat/completions').trim();
const moderationKey = String(Deno.env.get('MODERATION_API_KEY') || Deno.env.get('SILICON_CLOUD_API_KEY') || '').trim();
const moderationModel = String(Deno.env.get('MODERATION_MODEL_ID') || 'Qwen/Qwen2.5-7B-Instruct').trim();
const requestTimeoutMs = 12000;
const workerId = `forum-${crypto.randomUUID()}`;

type Job = { id: string; post_id: string; user_id: string; attempt_count: number };

const createServiceClient = () => createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const localReject = (content: string) => {
  const patterns = [/枪支买卖/u, /制作炸弹教程/u, /炸药配方/u, /儿童色情/u, /未成年(人)?色(情|图|片|视频)/u, /贩卖毒品/u, /出售毒品/u];
  return patterns.some((pattern) => pattern.test(content.toLowerCase()));
};

const moderate = async (content: string) => {
  if (localReject(content)) return { status: 'rejected', reason: '命中高风险违禁词' };
  if (!moderationKey) return { status: 'approved', reason: '审核服务未配置，使用本地快速检查' };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(moderationUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${moderationKey}` },
      body: JSON.stringify({
        model: moderationModel,
        messages: [
          { role: 'system', content: '你是内容安全审查助手。仅在非常确定存在严重违规时拒绝。只输出 JSON：{"status":"approved|rejected","reason":"简短原因"}。' },
          { role: 'user', content: `场景：论坛帖子\n内容：${content}` },
        ],
        stream: false,
        temperature: 0,
        max_tokens: 120,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`审核服务返回 ${response.status}`);
    const payload = await response.json().catch(() => ({}));
    const raw = String(payload?.choices?.[0]?.message?.content || '').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : {};
    const status = String(parsed.status || '').toLowerCase() === 'rejected' ? 'rejected' : 'approved';
    return { status, reason: String(parsed.reason || (status === 'rejected' ? '内容未通过审核' : '审核通过')).slice(0, 200) };
  } finally {
    clearTimeout(timeoutId);
  }
};

const processOne = async (client: SupabaseClient) => {
  const { data: jobs, error: claimError } = await client.rpc('claim_forum_async_jobs', {
    p_limit: 1, p_worker_id: workerId, p_lock_seconds: 45,
  });
  if (claimError) throw claimError;
  const job = (Array.isArray(jobs) ? jobs[0] : null) as Job | null;
  if (!job) return { claimed: 0 };

  try {
    const { data: post, error: postError } = await client
      .from('posts').select('id, content, status').eq('id', job.post_id).maybeSingle();
    if (postError) throw postError;
    if (!post) throw new Error('帖子不存在');

    const result = await moderate(String(post.content || ''));
    if (result.status === 'rejected') {
      const { error } = await client.from('posts').update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', job.post_id).eq('status', 'approved');
      if (error) throw error;
    }
    await client.rpc('complete_forum_async_job', {
      p_job_id: job.id, p_worker_id: workerId,
      p_result: { status: result.status, reason: result.reason },
    });
    return { claimed: 1, jobId: job.id, postId: job.post_id, status: result.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await client.rpc('fail_forum_async_job', {
      p_job_id: job.id, p_worker_id: workerId, p_error: message, p_retry_seconds: 30,
    });
    return { claimed: 1, jobId: job.id, postId: job.post_id, status: 'retrying' };
  }
};

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return new Response('ok', { headers: buildCorsHeaders(origin) });
  if (request.method !== 'POST') return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405, origin);
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ ok: false, code: 'WORKER_CONFIG_MISSING', message: '后台服务暂不可用' }, 500, origin);

  const body = await request.json().catch(() => ({}));
  const client = createServiceClient();
  const authHeader = request.headers.get('authorization') || '';
  const suppliedSecret = request.headers.get('x-worker-secret') || '';
  // Cron 通道鉴权（二选一）：
  //  1. x-worker-secret === FORUM_WORKER_SECRET（预留的手动触发通道）
  //  2. Authorization: Bearer <service_role_key>（pg_cron 兜底通道，与周报 cron 同款，
  //     复用 DB 已配置的 app.settings.service_role_key，无需额外维护 DB 级密钥）
  const isCron = Boolean(
    (workerSecret && suppliedSecret === workerSecret) ||
    (serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`)
  );
  let postId = String(body?.postId || '').trim();

  if (!isCron) {
    if (!authHeader.startsWith('Bearer ')) return jsonResponse({ ok: false, code: 'UNAUTHORIZED', message: '请先登录' }, 401, origin);
    if (!anonKey) return jsonResponse({ ok: false, code: 'WORKER_CONFIG_MISSING', message: '后台服务暂不可用' }, 500, origin);
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return jsonResponse({ ok: false, code: 'UNAUTHORIZED', message: '登录状态已过期' }, 401, origin);
    if (!postId) return jsonResponse({ ok: false, code: 'POST_ID_REQUIRED', message: '缺少帖子 ID' }, 400, origin);
    const { data: jobId, error: enqueueError } = await userClient.rpc('enqueue_forum_post_moderation', { p_post_id: postId });
    if (enqueueError) return jsonResponse({ ok: false, code: 'ENQUEUE_FAILED', message: '后台任务提交失败' }, 500, origin);
    EdgeRuntime.waitUntil(processOne(client).catch(() => undefined));
    return jsonResponse({ ok: true, jobId, status: 'queued', message: '已提交，后台处理中' }, 202, origin);
  }

  const result = await processOne(client).catch((error) => ({ claimed: 0, error: error instanceof Error ? error.message : String(error) }));
  return jsonResponse({ ok: !('error' in result), workerId, ...result }, 'error' in result ? 500 : 200, origin);
});
