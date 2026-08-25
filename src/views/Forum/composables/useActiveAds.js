import { ref } from 'vue';
import { supabase } from '../../../utils/supabase-client.js';

/**
 * 获取指定广告位下处于"启用"状态的广告列表。
 * RLS 已限制普通用户仅能读到 list_feed 的 active 记录，
 * 这里显式加过滤，保证管理员读取其他广告位时同样只取启用项。
 */
export function useActiveAds(placement = 'list_feed') {
  const ads = ref([]);
  const isLoading = ref(false);
  const error = ref(null);
  let loadSeq = 0;

  const load = async () => {
    const seq = ++loadSeq;
    isLoading.value = true;
    error.value = null;
    try {
      const query = supabase
        .from('advertisements')
        .select('*')
        .eq('placement', placement)
        .eq('status', 'active')
        .order('sort_order', { ascending: true });

      const { data, error: err } = await query;
      if (seq !== loadSeq) return; // 忽略过期请求
      if (err) {
        error.value = buildMessage(err);
        return;
      }
      ads.value = Array.isArray(data) ? data : [];
    } catch (e) {
      if (seq !== loadSeq) return;
      error.value = buildMessage(e);
    } finally {
      if (seq === loadSeq) isLoading.value = false;
    }
  };

  const clear = () => {
    loadSeq += 1;
    ads.value = [];
    error.value = null;
    isLoading.value = false;
  };

  return { ads, isLoading, error, load, clear };
}

function buildMessage(err) {
  // 兼容 Edge/浏览器抛出的错误，返回可读文案
  return (err && (err.message || err.error_description || err.toString())) || '加载广告失败';
}