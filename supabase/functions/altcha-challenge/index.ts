import { createScopedAltchaChallenge } from '../_shared/altcha.ts';
import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: buildCorsHeaders(origin),
    });
  }

  if (request.method !== 'GET') {
    return jsonResponse(
      { ok: false, code: 'METHOD_NOT_ALLOWED', message: '仅支持 GET 请求。' },
      405,
      origin,
    );
  }

  try {
    const url = new URL(request.url);
    const scope = String(url.searchParams.get('scope') || 'login').trim().toLowerCase();
    const challenge = await createScopedAltchaChallenge(scope);
    return jsonResponse(challenge, 200, origin);
  } catch (error) {
    if (error instanceof Error && error.message === 'ALTCHA_DISABLED') {
      return jsonResponse(
        {
          ok: false,
          code: 'ALTCHA_DISABLED',
          message: '人机验证已临时关闭。',
        },
        503,
        origin,
      );
    }

    return jsonResponse(
      {
        ok: false,
        code: 'ALTCHA_CHALLENGE_FAILED',
        message: error instanceof Error ? error.message : '生成人机验证挑战失败。',
      },
      500,
      origin,
    );
  }
});
