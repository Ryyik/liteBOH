import { ref } from "vue";
import { supabase } from "@/utils/supabase-client.js";
import { executeRead } from "@/utils/request-core.js";

// 新闻数据
export const newsData = ref([]);

// 按日期降序排序
export const sortedNews = ref([]);

// 加载状态
export const loading = ref(true);
export const error = ref(null);

// 从 Supabase 初始化新闻数据
export const initNews = async () => {
  try {
    loading.value = true;
    error.value = null;

    const { data, error: fetchError } = await executeRead(
      'news.initNews',
      {},
      async () => {
        const { data, error } = await supabase
          .from('news')
          .select('*')
          .order('date', { ascending: false });
        return { data, error };
      },
      { ttlMs: 10000, tags: ['news'], timeoutMs: 8000, retry: 1 }
    );

    if (fetchError) {
      throw fetchError;
    }

    newsData.value = data || [];
    sortedNews.value = data || [];
  } catch (err) {
    console.error('获取新闻数据失败:', err);
    error.value = err.message;
    newsData.value = [];
    sortedNews.value = [];
  } finally {
    loading.value = false;
  }
};

// 获取最新新闻
export const getLatestNews = () => {
  return sortedNews.value[0] || null;
};

// 获取所有新闻
export const getAllNews = () => {
  return sortedNews.value;
};

// 获取分类名称
export const getCategoryName = (category) => {
  const names = {
    event: "活动公告",
    update: "更新日志",
    community: "社区动态",
    announce: "官方通知",
  };
  return names[category] || "其他";
};

// 导出 Supabase 相关函数供其他地方使用
export const useNews = () => {
  return {
    newsData,
    sortedNews,
    loading,
    error,
    initNews,
    getLatestNews,
    getAllNews,
    getCategoryName
  };
};
