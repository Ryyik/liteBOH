import { ref } from 'vue';
import { toSafeExternalHref } from '../../../utils/external-link.js';

/**
 * useWebSearchLifecycle — 联网搜索的**生命周期**包装（激活态 + 结果清单）。
 *
 * `webSearchActive`：搜索请求在途（true 的窗口 = 请求发出 → 响应返回），
 * 消息流据此隐藏思考黑点（2026-10-08 用户口径：「网络搜索的时候不显示黑点动画」）。
 *
 * `webSearchResults`：本轮命中的网页（{title, url}）。搜索是**单请求一次性返回**
 * （Tavily → 免费代理，无增量流），所以「实时」的口径是：结果一到位立即填充，
 * 由消息流的折叠面板轮换展示（BohChatStream 的 `.boh-search-pages`）。
 * ⚠️ 每轮 `runWebSearch` 开始时先清空 —— 否则关闭联网的那一轮会显示上一轮的旧标题。
 */
export function useWebSearchLifecycle({ search }) {
  const webSearchActive = ref(false);
  const webSearchResults = ref([]);

  const runWebSearch = async (query, signal) => {
    webSearchActive.value = true;
    webSearchResults.value = [];
    try {
      const result = await search(query, signal);
      if (result?.ok && Array.isArray(result.results)) {
        webSearchResults.value = result.results
          .map((item) => ({
            title: String(item?.title || '').trim(),
            /* 结果是第三方给的，url 可能被投毒成 `javascript:`（SEO 投毒 / 恶意结果）。
               下游两处都把它绑进 `<a :href>`，Vue 不会拦伪协议 ⇒ 在这里收一次。
               拿不到 http(s) 地址的结果对用户也没有价值（点不动），直接丢弃。 */
            url: toSafeExternalHref(item?.url),
          }))
          .filter((item) => item.url && (item.title || item.url))
          .slice(0, 8);
      }
      return result;
    } catch (error) {
      return {
        ok: false,
        disabled: false,
        count: 0,
        context: '',
        results: [],
        error,
        message: error?.message || '未知错误',
      };
    } finally {
      webSearchActive.value = false;
    }
  };

  const resetWebSearchLifecycle = () => {
    webSearchActive.value = false;
    webSearchResults.value = [];
  };

  return {
    webSearchActive,
    webSearchResults,
    runWebSearch,
    resetWebSearchLifecycle,
  };
}
