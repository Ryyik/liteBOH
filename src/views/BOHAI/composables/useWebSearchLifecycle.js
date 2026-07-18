import { ref } from 'vue';

export function useWebSearchLifecycle({ search }) {
  const webSearchActive = ref(false);

  const runWebSearch = async (query, signal) => {
    webSearchActive.value = true;
    try {
      return await search(query, signal);
    } catch (error) {
      return {
        ok: false,
        disabled: false,
        count: 0,
        context: '',
        results: [],
        error,
        message: error?.message || '未知错误'
      };
    } finally {
      webSearchActive.value = false;
    }
  };

  const resetWebSearchLifecycle = () => {
    webSearchActive.value = false;
  };

  return {
    webSearchActive,
    runWebSearch,
    resetWebSearchLifecycle
  };
}
