import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createAnonClient, createServiceClient } from '../_shared/supabase.ts';
import { validateLoginId } from '../_shared/auth-validation.ts';
import { checkRateLimitDb } from '../_shared/rate-limiter.ts';
import { getClientIp } from '../_shared/client-ip.ts';
// 登录标识解析：邮箱唯一真源是 auth.users（profiles.email 已 drop）。
// 抽到 _shared 是为了可被 vitest 覆盖（本文件含 Deno.serve，无法直接单测）。
import { resolveEmailFromLoginId } from '../_shared/resolve-login-id.ts';
// 登录风控三件套。必须同时用：决策依赖计数，而计数表曾 5 个月零写入，
// 只接验证器的话 requireAltcha 恒为 false（见 _shared/auth-attempt.ts 文件头）。
import {
  evaluateLoginGate,
  hashClientIp,
  hashLoginKey,
  recordLoginAttempt,
} from '../_shared/auth-attempt.ts';
import { verifyAndConsumeAltchaProof } from '../_shared/altcha.ts';

const normalizeErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: buildCorsHeaders(origin),
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      { ok: false, code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST 请求。' },
      405,
      origin,
    );
  }

  // 限流 key 的 IP 口径统一走 _shared/client-ip.ts：xff 首段是客户端可写的，
  // 取首段等于「自己给自己发通行证」（2026-11-05 审查补）。
  const clientIp = getClientIp(request);
  const rateCheck = await checkRateLimitDb(clientIp, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);
  if (!rateCheck.ok) {
    return jsonResponse(
      {
        ok: false,
        code: 'RATE_LIMITED',
        message: `请求过于频繁，请在 ${rateCheck.retryAfter} 秒后重试。`,
      },
      429,
      origin,
    );
  }

  try {
    const body = await request.json();
    const loginId = String(body?.loginId || '').trim();
    const password = String(body?.password || '');
    const altchaPayload = String(body?.altchaPayload || '').trim();
    const deviceIdHash = String(body?.deviceIdHash || '')
      .trim()
      .slice(0, 128);
    const userAgent = request.headers.get('user-agent') || '';
    if (!loginId || !password) {
      return jsonResponse(
        { ok: false, code: 'INVALID_INPUT', message: '请输入账号和密码。' },
        400,
        origin,
      );
    }

    const loginIdValidationMessage = validateLoginId(loginId);
    if (loginIdValidationMessage) {
      return jsonResponse(
        { ok: false, code: 'INVALID_LOGIN_ID', message: loginIdValidationMessage },
        400,
        origin,
      );
    }

    const serviceClient = createServiceClient();
    // 账号与 IP 都以哈希入表：表里不留明文账号，IP 无盐哈希等于可逆
    const loginKey = await hashLoginKey(loginId);
    const ipHash = await hashClientIp(clientIp);

    // ── 闸门①：先判是否该拦 / 是否该要人机验证 ────────────────────────────
    // 这一步读的是 auth_attempt_events 的近 15 分钟计数，所以下面每次尝试
    // 结束时都必须 recordLoginAttempt，否则计数恒 0、闸门永远放行。
    const gate = await evaluateLoginGate(serviceClient, { loginKey, ipHash, deviceIdHash });

    if (gate.blocked) {
      await recordLoginAttempt(serviceClient, {
        loginKey,
        ipHash,
        deviceIdHash,
        succeeded: false,
        usedAltcha: false,
        failureCode: 'ACCOUNT_THROTTLED',
        userAgent,
      });
      const retryAfter = gate.retryAfterSeconds || 60;
      return jsonResponse(
        {
          ok: false,
          code: 'ACCOUNT_THROTTLED',
          message: `尝试过于频繁，请在 ${retryAfter} 秒后重试。`,
          requireCaptcha: true,
          retryAfterSeconds: retryAfter,
        },
        429,
        origin,
      );
    }

    // ── 闸门②：需要时校验人机证明（失败不消耗密码校验次数）─────────────────
    let altchaVerified = false;
    if (gate.requireAltcha) {
      const verifyResult = await verifyAndConsumeAltchaProof(serviceClient, {
        payload: altchaPayload,
        scope: 'login',
        loginKey,
        deviceIdHash,
      });

      if (!verifyResult.ok) {
        await recordLoginAttempt(serviceClient, {
          loginKey,
          ipHash,
          deviceIdHash,
          succeeded: false,
          usedAltcha: Boolean(altchaPayload),
          failureCode: verifyResult.code || 'ALTCHA_FAILED',
          userAgent,
        });
        return jsonResponse(
          {
            ok: false,
            code: verifyResult.code || 'ALTCHA_REQUIRED',
            message: verifyResult.message || '请先完成人机验证。',
            requireCaptcha: true,
          },
          400,
          origin,
        );
      }
      altchaVerified = true;
    }

    const emailLookup = await resolveEmailFromLoginId(serviceClient, loginId);
    if (!emailLookup.ok || !emailLookup.email) {
      // 账号不存在也计数：否则攻击者换随机账号就能永远不触发闸门
      // （IP 维度仍会累计，两者是正交的）
      await recordLoginAttempt(serviceClient, {
        loginKey,
        ipHash,
        deviceIdHash,
        succeeded: false,
        usedAltcha: altchaVerified,
        failureCode: 'INVALID_CREDENTIALS',
        userAgent,
      });
      return jsonResponse(
        {
          ok: false,
          code: 'INVALID_CREDENTIALS',
          message: '登录失败：账号或密码错误',
        },
        401,
        origin,
      );
    }

    const anonClient = createAnonClient();
    const { data: authData, error: authError } = await anonClient.auth.signInWithPassword({
      email: emailLookup.email,
      password,
    });

    if (authError) {
      const normalizedMessage = String(authError.message || '').toLowerCase();
      let message = '登录失败，请稍后再试。';
      let code = 'LOGIN_FAILED';

      if (normalizedMessage.includes('invalid login credentials')) {
        message = '登录失败：账号或密码错误';
        code = 'INVALID_CREDENTIALS';
      } else if (normalizedMessage.includes('email not confirmed')) {
        message = '请先验证邮箱后再登录。';
        code = 'EMAIL_NOT_CONFIRMED';
      }

      await recordLoginAttempt(serviceClient, {
        loginKey,
        ipHash,
        deviceIdHash,
        succeeded: false,
        usedAltcha: altchaVerified,
        failureCode: code,
        userAgent,
      });

      return jsonResponse(
        {
          ok: false,
          code,
          message,
        },
        code === 'INVALID_CREDENTIALS' ? 401 : 400,
        origin,
      );
    }

    // 安全：密码校验通过后，立即在服务端查询封禁状态。
    // 客户端 login() 也会查一次，但客户端检查可被绕过（直接 curl 拿 token），
    // 此处是服务端根本防线：命中封禁则立刻撤销刚签发的 session，并返回 403。
    const authUserId = authData.user?.id;
    if (authUserId) {
      const { data: profileRow } = await serviceClient
        .from('profiles')
        .select('is_banned, ban_reason, banned_until')
        .eq('id', authUserId)
        .maybeSingle();

      const isBanned = Boolean(profileRow?.is_banned);
      const bannedUntil = profileRow?.banned_until ? String(profileRow.banned_until) : null;
      const isPermanentBan = isBanned && !bannedUntil;
      const isTempBanActive = isBanned && bannedUntil && new Date(bannedUntil) > new Date();

      if (isPermanentBan || isTempBanActive) {
        // 立即撤销刚签发的 session，避免泄漏有效 token
        try {
          await serviceClient.auth.admin.signOut(authUserId);
        } catch (signOutError) {
          // 撤销失败不阻断错误返回，仍以 403 拒绝登录
          console.error('banned-user signOut failed:', signOutError);
        }

        let banMessage = '您的账号已被封禁，无法登录。';
        if (profileRow?.ban_reason) {
          banMessage += ` 原因：${profileRow.ban_reason}`;
        }
        if (bannedUntil) {
          try {
            const expiryDate = new Date(bannedUntil).toLocaleDateString('zh-CN');
            banMessage += ` 解封时间：${expiryDate}`;
          } catch {
            banMessage += ` 解封时间：${bannedUntil}`;
          }
        } else {
          banMessage += '（永久封禁）';
        }

        await recordLoginAttempt(serviceClient, {
          loginKey,
          ipHash,
          deviceIdHash,
          succeeded: false,
          usedAltcha: altchaVerified,
          failureCode: 'USER_BANNED',
          userAgent,
        });

        return jsonResponse(
          {
            ok: false,
            code: 'USER_BANNED',
            message: banMessage,
          },
          403,
          origin,
        );
      }
    }

    // 成功也要计一笔：闸门用「近 15 分钟失败数」做判定，
    // 成功行不进失败计数，但能让 1 分钟突发上限（≥20）反映真实流量
    await recordLoginAttempt(serviceClient, {
      loginKey,
      ipHash,
      deviceIdHash,
      succeeded: true,
      usedAltcha: altchaVerified,
      failureCode: null,
      userAgent,
    });

    return jsonResponse(
      {
        ok: true,
        user: authData.user,
        session: authData.session,
      },
      200,
      origin,
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        code: 'AUTH_LOGIN_FAILED',
        message: normalizeErrorMessage(error, '登录失败，请稍后再试。'),
      },
      500,
      origin,
    );
  }
});
