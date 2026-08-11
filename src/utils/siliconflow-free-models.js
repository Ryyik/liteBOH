import { supabase } from '@/utils/supabase-client.js'

let cachedFreemodels = null;
let inflightPromise = null;

export async function loadFreemodelsFromDB() {
  if (cachedFreemodels) return cachedFreemodels;
  if (inflightPromise) return inflightPromise;
  inflightPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('freemodels')
        .select('model_id, name, family_label, best_for, provider, provider_label, api_base_url')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      if (data && data.length > 0) {
        cachedFreemodels = Object.freeze(data.map(item => ({
          id: item.model_id,
          name: item.name,
          familyLabel: item.family_label,
          bestFor: item.best_for,
          provider: item.provider || 'siliconflow',
          providerLabel: item.provider_label,
          apiBaseUrl: item.api_base_url
        })));
        return cachedFreemodels;
      }
      cachedFreemodels = Object.freeze([]);
      return cachedFreemodels;
    } catch (e) {
      console.warn('从数据库加载免费模型失败:', e.message);
      return [];
    } finally {
      inflightPromise = null;
    }
  })();
  return inflightPromise;
}

export function clearFreemodelsCache() {
  cachedFreemodels = null;
}

export function getFreeChatModels() {
  return cachedFreemodels || [];
}

export async function isSiliconFlowFreeModelAsync(modelId = '') {
  const safeModelId = String(modelId || '').trim();
  const models = await loadFreemodelsFromDB();
  const modelIds = new Set(models.map(m => m.id));
  return modelIds.has(safeModelId);
}
