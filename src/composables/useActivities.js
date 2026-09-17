import { ref } from "vue";
import { supabase } from "@/utils/supabase-client.js";
import { executeRead } from "@/utils/request-core.js";
import { CACHE_TTL_LEVELS } from "@/utils/cache-strategy.js";
import { logger } from "@/utils/logger.js";
import { groupActivitiesByMonth } from "@/utils/activity-date.js";

// 活动数据
export const activitiesData = ref([]);

// 按日期降序平铺（保留给需要一维列表的消费方）
export const sortedActivities = ref([]);

// 按月分组：[{ monthKey, monthLabel, monthOrd, items }]，月份降序
export const groupedActivities = ref([]);

// 日期无法解析的记录（不参与分组，也不丢弃）
export const undatedActivities = ref([]);

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
          .select('id, title, date, image, description');
        return { data, error };
      },
      { ttlMs: CACHE_TTL_LEVELS.LIST_DATA, tags: ['activities'], timeoutMs: 8000, retry: 1 }
    );

    if (fetchError) {
      throw fetchError;
    }

    const rows = data || [];
    activitiesData.value = rows;

    // 分组与排序统一走 utils/activity-date.js。原实现是
    // `new Date(a.date.replace(/\//g,'-'))` 手工兜底——它之所以「看起来对」，
    // 是因为 V8 把 '2024-7' 宽松补成 7 月 1 日而不报错；缺「日」的语义就此丢失。
    // 同时 DB 侧 order=date.desc 是字符串比较（'2025/7/21' > '2025/12/12'），不可依赖。
    const { groups, undated } = groupActivitiesByMonth(rows);
    groupedActivities.value = groups;
    undatedActivities.value = undated;
    sortedActivities.value = [...groups.flatMap((group) => group.items), ...undated];
  } catch (err) {
    logger.error('activities', '获取活动数据失败:', err);
    error.value = err?.message || String(err);
    activitiesData.value = [];
    sortedActivities.value = [];
    groupedActivities.value = [];
    undatedActivities.value = [];
  } finally {
    loading.value = false;
  }
};

// 获取所有活动
export const getAllActivities = () => {
  return sortedActivities.value;
};

// 获取按月分组的活动
export const getGroupedActivities = () => {
  return groupedActivities.value;
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
    groupedActivities,
    undatedActivities,
    loading,
    error,
    initActivities,
    getAllActivities,
    getGroupedActivities,
    getLatestActivity
  };
};
