import { supabase } from '../supabase-client.js';

/**
 * 用户数据导出 API（Edge Function: user-data-export）
 * 返回统一为 { ok, data, error }
 */

/**
 * functions-js 对非 2xx 响应抛 FunctionsHttpError，其中文文案与 nextAvailableAt
 * 藏在 error.context（Response 对象）的 body 里，需要异步解析提取。
 */
const extractFunctionError = async (error, fallbackMessage) => {
  if (error?.name === 'FunctionsHttpError' && error?.context) {
    const body = await error.context.clone().json().catch(() => null);
    if (body) {
      return {
        message: String(body.error || '').trim() || fallbackMessage,
        nextAvailableAt: body.nextAvailableAt || null
      };
    }
  }
  return { message: error?.message || fallbackMessage, nextAvailableAt: null };
};

const invokeExport = async (payload = {}) => {
  const { data, error } = await supabase.functions.invoke('user-data-export', {
    body: payload
  });

  if (error) {
    return {
      ok: false,
      data: null,
      error: await extractFunctionError(error, '数据导出服务调用失败')
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
