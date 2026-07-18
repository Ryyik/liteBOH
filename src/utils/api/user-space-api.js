import { supabase } from '../supabase-client.js';
import { normalizeDbError } from '../request-core.js';

const isMissingSummaryRpc = (error) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return code === 'PGRST202'
    || code === '42883'
    || (message.includes('get_my_user_space_summary') && (
      message.includes('not find')
      || message.includes('does not exist')
      || message.includes('schema cache')
    ));
};

export async function getMyUserSpaceSummary() {
  try {
    const { data, error } = await supabase.rpc('get_my_user_space_summary');
    if (error) {
      return {
        ok: false,
        data: null,
        unsupported: isMissingSummaryRpc(error),
        error: normalizeDbError(error, 'User Space 摘要加载失败')
      };
    }
    return { ok: true, data: data || {}, unsupported: false, error: null };
  } catch (error) {
    return {
      ok: false,
      data: null,
      unsupported: isMissingSummaryRpc(error),
      error: normalizeDbError(error, 'User Space 摘要加载失败')
    };
  }
}

