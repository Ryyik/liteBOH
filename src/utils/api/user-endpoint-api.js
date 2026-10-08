import { supabase } from '../supabase-client.js';

/**
 * 用户自定义厂商 / 模型（BYOK）的前端调用层。
 *
 * 全部走 api-key-vault Edge Function 的 `user-endpoint-*` action：
 *   · 表 `user_ai_endpoints` / `user_ai_models` **前端永不直连**（RLS 无 policy + 已撤
 *     anon/authenticated 权限），所以这里没有一处 supabase.from(...)；
 *   · API Key 只在 upsert 时**单向上行**，服务端只返回掩码 —— 前端任何地方都拿不到明文。
 *
 * ⚠️ 失败一律归一成 `{ ok: false, error: { message, code } }`，且 **message 直接来自服务端**
 * （校验类错误服务端回 400 + 可读文案，例如「Base URL 必须是 https 地址」）。
 * 调用方要把这句话原样展示给用户，不要替换成通用文案 —— 那会让用户永远改不对。
 */
/**
 * 从 `functions.invoke` 的错误里把**服务端的 body** 抠出来。
 *
 * ⚠️ 不抠的话，EF 回 400 + `{ ok:false, message:'Base URL 必须是 https 地址…' }` 时，
 *    前端只能拿到 `error.message = 'Edge Function returned a non-2xx status code'` ——
 *    用户看到的是这句废话，永远不知道该改哪里（探针 C1 就是靠这条转红抓到的）。
 *    `FunctionsHttpError` 会把原始 Response 挂在 `error.context` 上，读它。
 */
const readServerErrorBody = async (error) => {
  const response = error?.context;
  if (!response || typeof response.json !== 'function') return null;
  try {
    const body = await response.clone().json();
    if (!body || typeof body !== 'object') return null;
    return {
      message: typeof body.message === 'string' ? body.message : '',
      code: typeof body.code === 'string' ? body.code : '',
    };
  } catch {
    // 非 JSON（网关 502/504 之类）⇒ 调用方回落到通用文案
    return null;
  }
};

const invokeUserEndpoint = async (payload = {}) => {
  try {
    const { data, error } = await supabase.functions.invoke('api-key-vault', { body: payload });
    if (error) {
      const serverError = await readServerErrorBody(error);
      return {
        ok: false,
        data: null,
        error: {
          message: serverError?.message || error.message || '自定义模型服务调用失败',
          code: serverError?.code || error.name || 'FUNCTION_INVOKE_ERROR',
        },
      };
    }
    if (!data?.ok) {
      return {
        ok: false,
        data: null,
        error: {
          message: data?.message || '自定义模型服务返回失败',
          code: data?.code || 'USER_ENDPOINT_ERROR',
        },
      };
    }
    return { ok: true, data: data.data, error: null };
  } catch (error) {
    return {
      ok: false,
      data: null,
      error: {
        message: error?.message || '自定义模型服务调用异常',
        code: error?.name || 'USER_ENDPOINT_INVOKE_ERROR',
      },
    };
  }
};

/** 列表：`{ endpoints: [...], limits: { endpoints, modelsPerEndpoint } }`，Key 只有掩码 */
export const listUserAiEndpoints = () => invokeUserEndpoint({ action: 'user-endpoint-list' });

/** 新增 / 更新一个厂商（连同它的模型列表，整表替换；apiKey 留空 = 不改密钥） */
export const upsertUserAiEndpoint = (payload = {}) =>
  invokeUserEndpoint({ action: 'user-endpoint-upsert', ...payload });

export const deleteUserAiEndpoint = (id) =>
  invokeUserEndpoint({ action: 'user-endpoint-delete', id });

/** 测连通性：真发一次最小对话请求；可传已保存的 id，也可传表单里的 baseUrl/apiKey */
export const testUserAiEndpoint = (payload = {}) =>
  invokeUserEndpoint({ action: 'user-endpoint-test', ...payload });

/** 发现模型：拉上游 `GET /models` */
export const discoverUserAiEndpointModels = (payload = {}) =>
  invokeUserEndpoint({ action: 'user-endpoint-models', ...payload });
