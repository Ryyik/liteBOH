import { jsonResponse } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase.ts';

const CLOUDINARY_CLOUD_NAME = String(Deno.env.get('CLOUDINARY_CLOUD_NAME') || '').trim();
const CLOUDINARY_API_KEY = String(Deno.env.get('CLOUDINARY_API_KEY') || '').trim();
const CLOUDINARY_API_SECRET = String(Deno.env.get('CLOUDINARY_API_SECRET') || '').trim();

const sha1Hex = async (input: string) => {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const hasServiceRoleAuthorization = (request: Request) => {
  const serviceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  return Boolean(serviceRoleKey) && request.headers.get('authorization') === `Bearer ${serviceRoleKey}`;
};

const destroyAsset = async (publicId: string) => {
  if (!publicId) return true;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sha1Hex(`public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`);
  const formData = new FormData();
  formData.append('public_id', publicId);
  formData.append('timestamp', String(timestamp));
  formData.append('api_key', CLOUDINARY_API_KEY);
  formData.append('signature', signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`, {
    method: 'POST',
    body: formData,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !['ok', 'not found'].includes(String(data?.result || '').toLowerCase())) {
    throw new Error(String(data?.error?.message || 'Cloudinary 删除失败'));
  }
  return true;
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  }
  if (!hasServiceRoleAuthorization(request)) {
    return jsonResponse({ ok: false, code: 'UNAUTHORIZED' }, 401);
  }
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    return jsonResponse({ ok: false, code: 'CLOUDINARY_ENV_MISSING' }, 500);
  }

  const serviceClient = createServiceClient();
  const { data: presets, error: claimError } = await serviceClient.rpc('claim_expired_points_card_presets', { p_limit: 50 });
  if (claimError) {
    console.error('purge-points-card-presets claim failed:', claimError);
    return jsonResponse({ ok: false, code: 'CLAIM_FAILED' }, 500);
  }

  let deleted = 0;
  const failed: Array<{ id: string; message: string }> = [];
  for (const preset of presets || []) {
    const id = String(preset?.id || '').trim();
    if (!id) continue;
    try {
      await destroyAsset(String(preset?.image_public_id || '').trim());
      const { error } = await serviceClient.rpc('complete_points_card_preset_purge', {
        p_preset_id: id,
        p_deleted: true,
        p_error: null,
      });
      if (error) throw error;
      deleted += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cloudinary 删除失败';
      failed.push({ id, message });
      await serviceClient.rpc('complete_points_card_preset_purge', {
        p_preset_id: id,
        p_deleted: false,
        p_error: message,
      });
    }
  }

  return jsonResponse({ ok: failed.length === 0, claimed: (presets || []).length, deleted, failed }, failed.length ? 207 : 200);
});
