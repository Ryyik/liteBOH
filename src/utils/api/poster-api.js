import { supabase } from '../supabase-client.js';
import { normalizeDbError, invalidateByTags } from '../request-core.js';

export const POSTER_MATERIAL_FEE_RMB = 5;
export const POSTER_DELIVERY_DAYS = 5;

const POSTER_REQUEST_MESSAGES = {
  NOT_AUTHENTICATED: '请先登录，再提交海报申请。',
  INVALID_RECIPIENT: '请填写收件人姓名（40 字以内）。',
  INVALID_PHONE: '请填写正确的联系电话（5-20 位）。',
  INVALID_ADDRESS: '请填写详细收货地址（5-200 字）。'
};

export async function submitPosterRequest({ recipient = '', phone = '', address = '' } = {}) {
  const normalizedRecipient = String(recipient || '').trim();
  const normalizedPhone = String(phone || '').trim().replace(/\s+/g, '');
  const normalizedAddress = String(address || '').trim();

  if (!normalizedRecipient || !normalizedPhone || !normalizedAddress) {
    return {
      ok: false,
      data: null,
      error: { message: '请填写完整的收件信息。', code: 'MISSING_FIELDS' }
    };
  }

  const { data, error } = await supabase.rpc('submit_boh_poster_request', {
    p_recipient: normalizedRecipient,
    p_phone: normalizedPhone,
    p_address: normalizedAddress
  });

  if (error) {
    return { ok: false, data: null, error: normalizeDbError(error) };
  }

  if (!data?.ok) {
    const code = String(data?.message || 'SUBMIT_FAILED');
    return {
      ok: false,
      data: null,
      error: { message: POSTER_REQUEST_MESSAGES[code] || '海报申请提交失败，请稍后重试。', code }
    };
  }

  invalidateByTags(['poster-requests']);
  return { ok: true, data, error: null };
}
