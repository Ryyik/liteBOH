import { ref } from "vue";
import { supabase } from "@/utils/supabase-client.js";
import { executeRead } from "@/utils/request-core.js";

// 活动数据
export const activitiesData = ref([]);

// 按日期降序排序
export const sortedActivities = ref([]);

// 加载状态
export const loading = ref(true);
export const error = ref(null);

// 从 Supabase 初始化活动数据
export const initActivities = async () => {
  try {
    loading.value = true;
    error.value = null;

    const { data, error: fetchError } = await executeRead(
      'activities.initActivities',
      {},
      async () => {
        const { data, error } = await supabase
          .from('activities')
          .select('*');
        return { data, error };
      },
      { ttlMs: 10000, tags: ['activities'], timeoutMs: 8000, retry: 1 }
    );

    if (fetchError) {
      throw fetchError;
    }

    activitiesData.value = data || [];
    sortedActivities.value = data ? [...data].sort((a, b) => {
      const dateA = new Date(a.date.replace(/\//g, '-'));
      const dateB = new Date(b.date.replace(/\//g, '-'));
      return dateB - dateA;
    }) : [];
  } catch (err) {
    console.error('获取活动数据失败:', err);
    error.value = err.message;
    activitiesData.value = [];
    sortedActivities.value = [];
  } finally {
    loading.value = false;
  }
};

// 获取所有活动
export const getAllActivities = () => {
  return sortedActivities.value;
};

// 获取最新活动
export const getLatestActivity = () => {
  return sortedActivities.value[0] || null;
};

// 导出 composable
export const useActivities = () => {
  return {
    activitiesData,
    sortedActivities,
    loading,
    error,
    initActivities,
    getAllActivities,
    getLatestActivity
  };
};
