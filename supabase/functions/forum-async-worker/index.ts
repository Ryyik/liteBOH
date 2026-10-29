import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0';
import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';

// Supabase Edge Runtime 提供的全局，Deno 类型库未声明 ⇒ deno check 报 TS2304（本地声明一次）
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim();
const serviceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
const anonKey = String(
  Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '',
).trim();
const workerSecret = String(Deno.env.get('FORUM_WORKER_SECRET') || '').trim();
const moderationUrl = String(
  Deno.env.get('MODERATION_API_URL') || 'https://api.siliconflow.cn/v1/chat/completions',
).trim();
const moderationKey = String(
  Deno.env.get('MODERATION_API_KEY') || Deno.env.get('SILICON_CLOUD_API_KEY') || '',
).trim();
const moderationModel = String(
  Deno.env.get('MODERATION_MODEL_ID') || 'Qwen/Qwen2.5-7B-Instruct',
).trim();
const requestTimeoutMs = 12000;
// 图片复审走独立的视觉模型配置：文本链用的 Qwen2.5-7B-Instruct 不认图，
// 若回落到它会得到「看不懂图但硬答 approved」的假绿 —— 比不审更危险。
// 因此**没有单独配置时宁可跳过**（图片保持 pending 可见），绝不借用文本模型。
const imageApiUrl = String(
  Deno.env.get('MODERATION_IMAGE_API_URL') || Deno.env.get('MODERATION_API_URL') || '',
).trim();
const imageApiKey = String(
  Deno.env.get('MODERATION_IMAGE_API_KEY') || Deno.env.get('MODERATION_API_KEY') || '',
).trim();
const imageModelId = String(Deno.env.get('MODERATION_IMAGE_MODEL_ID') || '').trim();
const imageRequestTimeoutMs = 20000;
const brevoApiKey = String(Deno.env.get('BREVO_API_KEY') || '').trim();
const mailSenderEmail = String(
  Deno.env.get('MAIL_SENDER_EMAIL') || 'noreply@blockofhome.cn',
).trim();
const mailSenderName = String(Deno.env.get('MAIL_SENDER_NAME') || '方块之家 BOH').trim();
const siteOrigin = String(Deno.env.get('VITE_SITE_URL') || 'https://www.blockofhome.cn')
  .trim()
  .replace(/\/+$/, '');
const workerId = `forum-${crypto.randomUUID()}`;

type Job = {
  id: string;
  job_type: string;
  post_id: string;
  user_id: string;
  attempt_count: number;
};

const createServiceClient = () =>
  createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

const localReject = (content: string) => {
  const patterns = [
    /枪支买卖/u,
    /制作炸弹教程/u,
    /炸药配方/u,
    /儿童色情/u,
    /未成年(人)?色(情|图|片|视频)/u,
    /贩卖毒品/u,
    /出售毒品/u,
  ];
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
          {
            role: 'system',
            content:
              '你是内容安全审查助手。仅在非常确定存在严重违规时拒绝。只输出 JSON：{"status":"approved|rejected","reason":"简短原因"}。',
          },
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
    const status =
      String(parsed.status || '').toLowerCase() === 'rejected' ? 'rejected' : 'approved';
    return {
      status,
      reason: String(
        parsed.reason || (status === 'rejected' ? '内容未通过审核' : '审核通过'),
      ).slice(0, 200),
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

// ────────────────────────── 图片异步复审 ──────────────────────────
// 触发条件：客户端两级审核（云端 + 本地 nsfwjs）都没能给出有效裁决，
// 图片以 approved 落库放行可见，同时 recheck_status='pending'。
// 本任务在约 6 分钟内给出真实裁决：拒绝则软删该图（moderation_status='rejected'）。
//
// prompt 必须与客户端 src/utils/image-moderation-pipeline.js 的
// IMAGE_MODERATION_SYSTEM_PROMPT **保持同一口径**：两边从宽标准不一致会导致
// 「客户端放行、服务端又撤」的体验断裂，用户会觉得莫名其妙。
const IMAGE_REVIEW_PROMPT = [
  '<role>你是图片内容安全审查助手，负责判断图片是否适合在社区公开发布。</role>',
  '<constraints>',
  '- 仅在明确包含严重违规内容时才拒绝：色情/性行为/未成年人性相关、暴恐血腥、毒品或枪支交易展示',
  '- 以下内容必须通过：健身/运动肌肉照、泳装海滩照、艺术人体雕塑、哺乳/医疗图片、美食、风景、人物合影',
  '- 存疑时一律通过，尽量降低误判',
  '</constraints>',
  '<output_format>',
  '严格只输出 JSON：{"status":"approved|rejected","confidence":0~1,"reason":"..."}',
  '</output_format>',
].join('\n');

type ImageVerdict = { status: 'approved' | 'rejected'; score: number; reason: string };

const parseImageVerdict = (raw: string): ImageVerdict | null => {
  const match = String(raw || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }

  const status = String(parsed.status || '').toLowerCase();
  if (status === 'rejected' || status === 'approved') {
    const score = Number(parsed.confidence ?? parsed.score);
    return {
      status: status as 'approved' | 'rejected',
      score: Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0,
      reason: String(
        parsed.reason || (status === 'rejected' ? '图片未通过复审' : '复审通过'),
      ).slice(0, 160),
    };
  }

  // 实测兼容：gemini-3.6-flash 带图时可能只回 {"nsfw":false}（见 2026102905 迁移注释）。
  // 不兼容它等于所有图都「解析失败」→ 复审永远不生效。
  if (typeof parsed.nsfw === 'boolean') {
    return {
      status: parsed.nsfw ? 'rejected' : 'approved',
      score: 0,
      reason: parsed.nsfw ? '复审判定为不适宜内容' : '复审通过',
    };
  }

  return null;
};

const moderateImageUrl = async (url: string): Promise<ImageVerdict> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), imageRequestTimeoutMs);
  try {
    const response = await fetch(imageApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${imageApiKey}` },
      body: JSON.stringify({
        model: imageModelId,
        messages: [
          { role: 'system', content: IMAGE_REVIEW_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: '请审核这张图片是否适合在社区公开发布。' },
              { type: 'image_url', image_url: { url } },
            ],
          },
        ],
        stream: false,
        temperature: 0,
        max_tokens: 200,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`图片复审服务返回 ${response.status}`);
    const payload = await response.json().catch(() => ({}));
    const raw = String(payload?.choices?.[0]?.message?.content || '').trim();
    const verdict = parseImageVerdict(raw);
    // 解析不出裁决时抛错（重试），绝不默认 approved —— 否则复审形同虚设。
    if (!verdict) throw new Error('图片复审结果无法解析');
    return verdict;
  } finally {
    clearTimeout(timeoutId);
  }
};

const notifyImageRejected = async (
  client: SupabaseClient,
  job: Job,
  postTitle: string,
  rejectedCount: number,
) => {
  // 站内通知：同一帖子只留一条（多张图同时被拒不该刷屏）
  const { data: existing } = await client
    .from('notifications')
    .select('id')
    .eq('recipient_id', job.user_id)
    .eq('post_id', job.post_id)
    .eq('type', 'post_image_rejected')
    .limit(1)
    .maybeSingle();
  if (!existing) {
    await client.from('notifications').insert({
      recipient_id: job.user_id,
      sender_id: null,
      type: 'post_image_rejected',
      post_id: job.post_id,
      status: 'unread',
    });
  }

  // 邮件：独立开关（moderation_mail_enabled），与关注邮件互不影响
  const { data: profile } = await client
    .from('profiles')
    .select('moderation_mail_enabled, username')
    .eq('id', job.user_id)
    .maybeSingle<{ moderation_mail_enabled: boolean | null; username: string | null }>();
  if (!profile?.moderation_mail_enabled) return;
  if (!brevoApiKey) return;

  const { data: emailRows } = await client.rpc('boh_get_user_emails', {
    p_ids: [job.user_id],
  });
  const to = String((Array.isArray(emailRows) ? emailRows[0]?.email : '') || '').trim();
  if (!to) return;

  const targetUrl = `${siteOrigin}/#/post/${job.post_id}`;
  const safeTitle = String(postTitle || '你的帖子')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#f5f6f8;font-family:-apple-system,'PingFang SC',sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:26px 24px">
    <div style="font-size:16px;font-weight:600;color:#1f2329;margin-bottom:14px">图片未通过复审</div>
    <p style="font-size:14px;line-height:1.8;color:#4a5058;margin:0 0 14px">
      你在帖子《${safeTitle}》中上传的 ${rejectedCount} 张图片未通过内容安全复审，已从帖子中移除。
      帖子本身与其余内容不受影响。
    </p>
    <p style="font-size:14px;line-height:1.8;color:#4a5058;margin:0 0 20px">
      如果你认为这是误判，可以重新上传该图片；若仍被拦截，请联系管理员。
    </p>
    <a href="${targetUrl}" style="display:inline-block;padding:10px 18px;background:#2f6fed;color:#fff;border-radius:8px;text-decoration:none;font-size:14px">查看帖子</a>
    <div style="margin-top:22px;padding-top:14px;border-top:0.5px solid #eef0f3;font-size:12px;color:#9aa0a6;line-height:1.7">
      你在「通知设置」开启了审核结果邮件通知 · <a href="${siteOrigin}/#/user-space/pushplus-settings" style="color:#2f6fed">去关闭</a>
    </div>
  </div>
</body></html>`;

  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': brevoApiKey,
      },
      body: JSON.stringify({
        sender: { email: mailSenderEmail, name: mailSenderName },
        to: [{ email: to }],
        subject: `图片未通过复审 · ${postTitle || '你的帖子'}`,
        htmlContent: html,
      }),
    });
  } catch {
    // 邮件失败不影响复审结果：图已撤、站内通知已发。
    // 不做重投账本 —— 审核拒绝是低频事件，多一封账本表的复杂度不值得。
  }
};

const processImageRecheck = async (client: SupabaseClient, job: Job) => {
  if (!imageApiUrl || !imageApiKey || !imageModelId) {
    // 配置缺失时**不重试**：配置不会在重试窗口内出现，重试只会把 job 拖成 failed，
    // 反而掩盖真实原因。图片保持 pending（可见），等配置补齐后再入队即可。
    return { skipped: 'image_moderation_not_configured', rechecked: 0, rejected: 0 };
  }

  const { data: images, error: imageError } = await client
    .from('forum_post_images')
    .select('id, url')
    .eq('post_id', job.post_id)
    .eq('recheck_status', 'pending')
    .order('sort_order', { ascending: true })
    .limit(6);
  if (imageError) throw imageError;
  const pending = (images || []) as Array<{ id: string; url: string }>;
  if (pending.length === 0) return { rechecked: 0, rejected: 0 };

  const { data: post } = await client
    .from('posts')
    .select('title')
    .eq('id', job.post_id)
    .maybeSingle<{ title: string | null }>();

  let rejected = 0;
  // 串行：上游是限流敏感的付费接口，且单帖最多 6 张，串行的绝对延迟可接受。
  for (const image of pending) {
    const verdict = await moderateImageUrl(String(image.url || ''));
    const { data: applied } = await client.rpc('apply_forum_image_recheck_verdict', {
      p_image_id: image.id,
      p_verdict: verdict.status,
      p_score: verdict.score,
      p_reason: verdict.reason,
    });
    if (applied === true && verdict.status === 'rejected') rejected += 1;
  }

  if (rejected > 0) {
    await notifyImageRejected(client, job, String(post?.title || ''), rejected);
  }
  return { rechecked: pending.length, rejected };
};

const processPostModeration = async (client: SupabaseClient, job: Job) => {
  const { data: post, error: postError } = await client
    .from('posts')
    .select('id, content, status')
    .eq('id', job.post_id)
    .maybeSingle();
  if (postError) throw postError;
  if (!post) throw new Error('帖子不存在');

  const result = await moderate(String(post.content || ''));
  if (result.status === 'rejected') {
    const { error } = await client
      .from('posts')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', job.post_id)
      .eq('status', 'approved');
    if (error) throw error;
  }
  return { status: result.status, reason: result.reason };
};

const processOne = async (client: SupabaseClient) => {
  const { data: jobs, error: claimError } = await client.rpc('claim_forum_async_jobs', {
    p_limit: 1,
    p_worker_id: workerId,
    p_lock_seconds: 45,
  });
  if (claimError) throw claimError;
  const job = (Array.isArray(jobs) ? jobs[0] : null) as Job | null;
  if (!job) return { claimed: 0 };

  try {
    const result =
      job.job_type === 'image_recheck'
        ? await processImageRecheck(client, job)
        : await processPostModeration(client, job);
    await client.rpc('complete_forum_async_job', {
      p_job_id: job.id,
      p_worker_id: workerId,
      p_result: result,
    });
    return { claimed: 1, jobId: job.id, jobType: job.job_type, postId: job.post_id, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 退避：图片复审按 1/5/15 分钟（30s→60s→300s→900s），文本审核保持 30s。
    // 复审是「事后撤」，晚几分钟比误撤安全得多。
    const retrySeconds =
      job.job_type === 'image_recheck' ? ([60, 300, 900][job.attempt_count - 1] ?? 900) : 30;
    await client.rpc('fail_forum_async_job', {
      p_job_id: job.id,
      p_worker_id: workerId,
      p_error: message,
      p_retry_seconds: retrySeconds,
    });
    return {
      claimed: 1,
      jobId: job.id,
      jobType: job.job_type,
      postId: job.post_id,
      status: 'retrying',
    };
  }
};

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS')
    return new Response('ok', { headers: buildCorsHeaders(origin) });
  if (request.method !== 'POST')
    return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405, origin);
  if (!supabaseUrl || !serviceRoleKey)
    return jsonResponse(
      { ok: false, code: 'WORKER_CONFIG_MISSING', message: '后台服务暂不可用' },
      500,
      origin,
    );

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
    (serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`),
  );
  let postId = String(body?.postId || '').trim();

  if (!isCron) {
    if (!authHeader.startsWith('Bearer '))
      return jsonResponse({ ok: false, code: 'UNAUTHORIZED', message: '请先登录' }, 401, origin);
    if (!anonKey)
      return jsonResponse(
        { ok: false, code: 'WORKER_CONFIG_MISSING', message: '后台服务暂不可用' },
        500,
        origin,
      );
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user)
      return jsonResponse(
        { ok: false, code: 'UNAUTHORIZED', message: '登录状态已过期' },
        401,
        origin,
      );
    if (!postId)
      return jsonResponse(
        { ok: false, code: 'POST_ID_REQUIRED', message: '缺少帖子 ID' },
        400,
        origin,
      );
    const { data: jobId, error: enqueueError } = await userClient.rpc(
      'enqueue_forum_post_moderation',
      { p_post_id: postId },
    );
    if (enqueueError)
      return jsonResponse(
        { ok: false, code: 'ENQUEUE_FAILED', message: '后台任务提交失败' },
        500,
        origin,
      );
    EdgeRuntime.waitUntil(processOne(client).catch(() => undefined));
    return jsonResponse(
      { ok: true, jobId, status: 'queued', message: '已提交，后台处理中' },
      202,
      origin,
    );
  }

  // cron 通道：一次多捞几个。
  // 原来只处理 1 个，而 cron 是 */5 —— 5 分钟内进来 3 个待复审帖就要 15 分钟才排完，
  // 与「最坏 6 分钟给裁决」的承诺矛盾。上限 3 是 RPC 允许的最大值，
  // 也是 3 × 20s 图片超时 ≈ 60s 的执行时间预算上限。
  const results: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 3; i += 1) {
    const one = await processOne(client).catch((error) => ({
      claimed: 0,
      error: error instanceof Error ? error.message : String(error),
    }));
    results.push(one as Record<string, unknown>);
    if (!one || (one as { claimed?: number }).claimed === 0) break;
  }
  const failed = results.some((item) => 'error' in item);
  return jsonResponse({ ok: !failed, workerId, results }, failed ? 500 : 200, origin);
});
