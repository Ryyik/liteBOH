import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase.ts';

/**
 * mail-keepalive — Brevo SMTP 链路保活（每月定时 + 可手动探活）
 *
 * 背景：Supabase 的 SMTP 走 Brevo 免费档（smtp-relay.brevo.com:587，2026-09-22 接入），
 * 用于注册确认 / 密码重置等认证邮件。Brevo 的 SMTP key **90 天不活跃会被回收**，
 * 一旦回收，认证邮件全链路哑火。本函数由 pg_cron 每月触发一次（见迁移
 * 2026100801_mail_keepalive.sql），用一封真实的密码重置邮件打穿
 * Supabase → Brevo SMTP → 收件箱 全链路，刷新活跃窗口。
 *
 * 注册模式与 scripts/register-forum-weekly-report-cron.sql（论坛周报）一致：
 *   pg_cron → net.http_post → 本函数（Authorization: Bearer <service_role_key>）。
 *
 * 行为：
 *   1. 校验 Authorization: Bearer === MAIL_KEEPALIVE_TOKEN（ops 脚本生成的专用 token，
 *      写在 EF secrets 与 cron 命令文本两侧）。⚠️ 用 Authorization 头携带而非自定义
 *      x- 头：实测 pg_cron→pg_net→EF 链路上自定义 header **到不了函数**（got=(空)），
 *      只有 Authorization 能穿过来。故意不认 anon：匿名可触发 =
 *      任何人都能给站长邮箱无限刷保活邮件。
 *   2. POST /auth/v1/recover（anon key + MAIL_KEEPALIVE_RECIPIENT）。
 *   3. 结果写 public.mail_keepalive_log 留底账（失败也写，断链可查）。
 *
 * ⚠️ /auth/v1/recover 有防枚举特性：对不存在的邮箱同样返回 200 + {}。
 *    所以日志里的 200 只证明「请求被接受、进入发信流程」；
 *    链路的最终证据 = 收件箱收到邮件 / Brevo 后台（Transactions）的送达记录。
 */

const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim();
const anonKey = String(Deno.env.get('SUPABASE_ANON_KEY') || '').trim();
const recipient = String(Deno.env.get('MAIL_KEEPALIVE_RECIPIENT') || '').trim();
// 专用保活 token（ops 脚本生成 → POST /secrets → cron 命令烘焙同值）。
// ⚠️ 不用 SUPABASE_SERVICE_ROLE_KEY 做调用方鉴权：实测（2026-10-08）Management API
// GET /secrets 返回的该值与 EF 运行时注入的值**指纹不一致**（got=70783c62… want=sb_secre…，
// 新 API key 体系切换期），比对恒失败。token 单值源 = ops 脚本，两边必然一致。
const keepaliveToken = String(Deno.env.get('MAIL_KEEPALIVE_TOKEN') || '').trim();

const RECOVER_TIMEOUT_MS = 15_000;
const RESPONSE_SNIPPET_MAX = 500;

type LogEntry = {
  recipient: string;
  httpStatus: number | null;
  responseBody: string | null;
  ok: boolean;
  error: string | null;
};

/** 底账写入是 best-effort：写日志失败不能吞掉 recover 本身的结果（body 里仍有）。 */
const writeLog = async (entry: LogEntry) => {
  try {
    const client = createServiceClient();
    const { error: dbError } = await client.from('mail_keepalive_log').insert({
      recipient: entry.recipient,
      http_status: entry.httpStatus,
      response_body: entry.responseBody,
      ok: entry.ok,
      error: entry.error,
    });
    if (dbError) console.error('[mail-keepalive] 日志写入失败：', dbError.message);
  } catch (error) {
    // 日志表不可达 / service key 缺失都不阻断返回值。
    console.error(
      '[mail-keepalive] 日志写入异常：',
      error instanceof Error ? error.message : error,
    );
  }
};

const bearer = (request: Request) =>
  String(request.headers.get('authorization') || '')
    .replace(/^Bearer\s+/i, '')
    .trim();

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCorsHeaders(origin) });
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      { ok: false, code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST 请求。' },
      405,
      origin,
    );
  }

  // 仅接受持有保活 token 的调用方（pg_cron / 运维手动探活；token 见顶部注释）。
  // ⚠️ 鉴权失败也写底账（error=UNAUTHORIZED_TOKEN + 前 8 位指纹）：把「请求没到 EF」
  //    与「到了但没过鉴权」区分开，并留下排查 token 差异的线索（不泄露全文）。
  const token = bearer(request);
  if (!keepaliveToken || !token || token !== keepaliveToken) {
    await writeLog({
      recipient: '',
      httpStatus: null,
      responseBody: null,
      ok: false,
      error: `UNAUTHORIZED_TOKEN got=${token.slice(0, 8) || '(空)'} want=${keepaliveToken.slice(0, 8) || '(空)'}`,
    });
    return jsonResponse(
      { ok: false, code: 'UNAUTHORIZED', message: '缺少有效的服务凭证。' },
      401,
      origin,
    );
  }

  if (!recipient) {
    await writeLog({
      recipient: '',
      httpStatus: null,
      responseBody: null,
      ok: false,
      error: 'MISSING_MAIL_KEEPALIVE_RECIPIENT',
    });
    return jsonResponse(
      { ok: false, code: 'RECIPIENT_MISSING', message: '未配置 MAIL_KEEPALIVE_RECIPIENT。' },
      500,
      origin,
    );
  }

  let httpStatus: number | null = null;
  let responseBody: string | null = null;
  let error: string | null = null;
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/recover`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: recipient }),
      signal: AbortSignal.timeout(RECOVER_TIMEOUT_MS),
    });
    httpStatus = response.status;
    responseBody = (await response.text()).slice(0, RESPONSE_SNIPPET_MAX);
    if (!response.ok) error = `RECOVER_HTTP_${response.status}`;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e).slice(0, 200);
  }

  const ok = httpStatus === 200 && error === null;
  await writeLog({ recipient, httpStatus, responseBody, ok, error });

  // 链路结果放 body 与底账；函数自身故障才用 5xx（cron 侧 net 响应也能看到）。
  return jsonResponse({ ok, httpStatus, error }, ok ? 200 : 502, origin);
});
