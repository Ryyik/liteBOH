import { supabase } from '../supabase-client.js';

const invokeVault = async (payload = {}) => {
  const { data, error } = await supabase.functions.invoke('api-key-vault', {
    body: payload
  });

  if (error) {
    return {
      ok: false,
      data: null,
      error: {
        message: error.message || 'API Key 管理服务调用失败',
        code: error.name || 'FUNCTION_INVOKE_ERROR'
      }
    };
  }

  if (!data?.ok) {
    return {
      ok: false,
      data: null,
      error: {
        message: data?.message || 'API Key 管理服务返回失败',
        code: data?.code || 'API_KEY_VAULT_ERROR'
      }
    };
  }

  return { ok: true, data: data.data, error: null };
};

export const listApiKeys = () => invokeVault({ action: 'list' });

export const upsertApiKey = (payload = {}) => invokeVault({
  action: 'upsert',
  ...payload
});

export const updateApiKeyStatus = (id, status) => invokeVault({
  action: 'status',
  id,
  status
});

export const testApiKey = (id, payload = {}) => invokeVault({
  action: 'test',
  id,
  ...payload
});

export const discoverModels = (payload = {}) => invokeVault({
  action: 'discover-models',
  ...payload
});

export const deleteApiKey = (id) => invokeVault({
  action: 'delete',
  id
});
