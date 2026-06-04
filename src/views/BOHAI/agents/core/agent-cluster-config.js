export const AGENT_CLUSTER_MODE = Object.freeze({
  SINGLE: 'single',
  MULTI: 'multi',
  AUTO: 'auto'
});

export const AGENT_CLUSTER_AGENT_STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  OK: 'ok',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled'
});

export const AGENT_CLUSTER_PLAN_STRATEGY = Object.freeze({
  SINGLE: 'single_worker',
  FANOUT: 'fanout',
  DEGRADED: 'degraded'
});

export const AGENT_CLUSTER_DEFAULT_MAX_CONCURRENCY = 4;
export const AGENT_CLUSTER_DEFAULT_AGENT_TIMEOUT_MS = 25000;
export const AGENT_CLUSTER_DEFAULT_TOTAL_TIMEOUT_MS = 60000;

export const AGENT_CLUSTER_BUDGET_TIER = Object.freeze({
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high'
});

export const AGENT_CLUSTER_BUDGET_THRESHOLDS = Object.freeze({
  LOW_MAX_TOKENS: 1200,
  NORMAL_MAX_TOKENS: 6000,
  ENABLE_CRITIC_MIN_TOKENS: 8000
});

export const AGENT_CLUSTER_SETTING_KEY = 'boh_ai_agent_cluster_mode_v1';
export const AGENT_CLUSTER_BUDGET_SETTING_KEY = 'boh_ai_agent_cluster_budget_v1';

export const AGENT_CLUSTER_FANOUT_TRIGGERS = Object.freeze([
  /(总结|复盘|回顾|梳理).{0,12}(我的|我).{0,16}(最近|近期|日常|生活|状态|近况|记录|cloud\+|cloud|笔记|日记)/i,
  /(根据|结合|参考|看看|读取|分析).{0,18}(我的|我).{0,18}(cloud\+|cloud|随手记|笔记|日记|记录|近况|最近|近期|状态|情绪|生活)/i,
  /(发帖|发个帖|发(?:一条|一篇|个)?.{0,8}帖子|发布.{0,8}帖子|论坛发帖|论坛发布|起草.{0,12}(论坛|社区|帖子|发布文案)|写.{0,12}(论坛|社区|帖子|发布文案))/i,
  /(发邮件|发私信|写邮件|写信|寄信)/i,
  /(分析|推理|思考|权衡|方案|设计|架构|规划|复盘|诊断|排查|定位|优化|策略|路线图|复杂|深度|详细|全面|比较|对比|评估|拆解|判断|决策|选择|取舍|利弊|优缺点|风险|优先级|可行性|可能性|原因|怎么设计|如何落地|实现方案|技术方案|给我一个方案)/i
]);

export const AGENT_CLUSTER_FANOUT_KEYWORDS = Object.freeze([
  '帮我整理', '帮我梳理', '帮我分析', '帮我看看', '帮我总结', '帮我复盘',
  '对比一下', '综合考虑', '需要参考', '结合上下文', '基于我的', '根据我的',
  '在社区里', '在论坛里', '在记忆库', '在 Cloud+', '在cloud+', '查一下',
  '最近发生', '最近活动', '社区动态', '历史记录', '帮我起草', '帮我写',
  '帮我发', '帮我总结一下', '帮我汇总'
]);

export const isFanoutTrigger = (text = '') => {
  const safe = String(text || '');
  if (!safe) return false;
  if (AGENT_CLUSTER_FANOUT_TRIGGERS.some((pattern) => pattern.test(safe))) return true;
  return AGENT_CLUSTER_FANOUT_KEYWORDS.some((keyword) => safe.includes(keyword));
};

export const resolveClusterMode = (userPreference, isFanout) => {
  const pref = String(userPreference || AGENT_CLUSTER_MODE.AUTO).toLowerCase();
  if (pref === AGENT_CLUSTER_MODE.SINGLE) return AGENT_CLUSTER_MODE.SINGLE;
  if (pref === AGENT_CLUSTER_MODE.MULTI) return AGENT_CLUSTER_MODE.MULTI;
  return isFanout ? AGENT_CLUSTER_MODE.MULTI : AGENT_CLUSTER_MODE.SINGLE;
};

export const estimateClusterBudget = ({ agentCount = 0, totalInputChars = 0 } = {}) => {
  if (agentCount >= 5 || totalInputChars >= 12000) return AGENT_CLUSTER_BUDGET_TIER.HIGH;
  if (agentCount >= 3 || totalInputChars >= 6000) return AGENT_CLUSTER_BUDGET_TIER.NORMAL;
  return AGENT_CLUSTER_BUDGET_TIER.LOW;
};

export const readClusterSetting = (key, fallback = null) => {
  if (typeof window === 'undefined' || !window.localStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (_error) {
    return fallback;
  }
};

export const writeClusterSetting = (key, value) => {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    if (value == null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
    return true;
  } catch (_error) {
    return false;
  }
};
