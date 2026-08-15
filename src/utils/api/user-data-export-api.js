import { supabase } from '../supabase-client.js';

/**
 * 用户数据导出 API（Edge Function: user-data-export）
 * 返回统一为 { ok, data, error }
 */

const invokeExport = async (payload = {}) => {
  const { data, error } = await supabase.functions.invoke('user-data-export', {
    body: payload
  });

  if (error) {
    return {
      ok: false,
      data: null,
      error: { message: error.message || '数据导出服务调用失败' }
    };
  }

  if (!data?.ok) {
    return {
      ok: false,
      data: null,
      error: { message: data?.error || '数据导出服务返回失败', nextAvailableAt: data?.nextAvailableAt || null }
    };
  }

  return { ok: true, data, error: null };
};

export const getExportStatus = () => invokeExport({ action: 'status' });

export const createExportRequest = () => invokeExport({ action: 'create' });

export const getExportDownloadUrl = () => invokeExport({ action: 'download' });

export const cancelExport = () => invokeExport({ action: 'cancel' });
