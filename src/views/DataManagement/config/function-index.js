/**
 * 后台「功能索引」—— 面板里每一个可跳转的落点（模块 / 页签 / 装订页 / 系统子页）的唯一清单。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────
 * 2026-11-12 用户反馈：「数据管理面板还是不能通过搜索来查找功能」。
 * 实测三条搜索路径各有一套口径，且**没有一条能搜到「功能」**：
 *   1. 侧栏「筛选模块…」只看 `tabModules` 的 label/description（10 个模块），
 *      搜「积分发放」「补发」「头像框」一律「无匹配模块」—— 而这是屏幕上最像
 *      搜索框的那个框，用户必然先试它；
 *   2. 工具栏搜索框搜的是**记录**，功能名只在「全部表」范围下才顺带出现；
 *   3. ⌘K 自己写了一段 `for (const tab of tabs)` 匹配，最多 3 条、走不到
 *      独立控制台页（商城装修 / 资讯编辑 / 开屏管理 / 头像框），也不认别名。
 *
 * 所以这里把「有哪些功能」收成一份索引，侧栏与 ⌘K 共用同一份 ——
 * 单一真源，外加 `addAliases` 解决「用户记得意思、不记得叫法」这个真问题
 * （「补发」要能找到「积分发放」，「banner」要能找到「广告管理」）。
 *
 * ⚠️ 这份索引**不含权限过滤后的删除**：无权项保留并标 `denied`，与侧栏
 *    现有口径一致（置灰可审计，而不是凭空消失）。点击时的拦截在宿主里做。
 */
import { ADMIN_PAGE_META, tabModules, tabs } from './tabs.js';
import { canViewModule } from './rbac.js';

/**
 * 页签别名：用户嘴里的叫法 → 真实页签名。
 * 只放「与 label 完全不同字」的词；同字词靠 includes 就能命中，写了只是噪声。
 */
export const TAB_ALIASES = {
  users: ['账号', '封禁', '禁言', '会员管理'],
  points: ['余额', '加星', '星星'],
  'points-grant': ['补发', '加分', '送积分', '给积分', '发积分'],
  pointsTransactions: ['流水', '积分记录'],
  subscriptions: ['会员', 'vip', '套餐'],
  'subscriptions-grant': ['补发', '补会员', '补订阅', '送会员', '开会员', '开通订阅'],
  anniversaryClaims: ['周年', '纪念日'],
  gifts: ['礼品', '礼物进度'],
  addresses: ['收货', '快递', '发货地址'],
  shopOrders: ['订单', '发货', '退款', '售后'],
  products: ['商品', '上架', 'sku', '规格'],
  forum: ['帖子', '论坛'],
  ads: ['banner', '横幅', '广告位', '信息流'],
  forumWeeklyCheckins: ['签到', '周签到'],
  forumPostImages: ['图片审核', 'nsfw', '涩图', '鉴黄'],
  forumPostReports: ['举报', '投诉'],
  photoAlbums: ['相册', '照片'],
  news: ['资讯', '公告'],
  activities: ['活动', '报名'],
  postReward: ['发帖奖励', '发帖有奖'],
  coreMemories: ['知识库', '官方事实'],
  aiMemories: ['记忆', '沉淀记忆'],
  forumMemories: ['事实卡'],
  bohCreatorShows: ['创作者'],
  birthdayEvents: ['生日'],
  birthdayWishes: ['生日祝福'],
  campaigns: ['活动平台', 'campaign'],
  campaignEntries: ['报名明细'],
  campaignRewards: ['发放台账'],
  posterRequests: ['海报'],
  reportedPosts: ['下架', '违规帖', '举报下架'],
  reviewPosts: ['驳回', '拒绝', '复核'],
  reviewComments: ['评论复核', '驳回评论'],
  moderationLogs: ['审核日志'],
  notifications: ['推送', '站内信', '通知'],
  lotteries: ['抽奖', '开奖'],
  'lottery-join-grant': ['代报名', '帮报名', '补报名'],
  lotteryFulfillments: ['履约', '中奖通知', '发货'],
  lotteryEntries: ['报名名单'],
  lotteryAuditLogs: ['抽奖审计'],
  'pity-grant': ['保底', '井', '抽卡保底'],
  'keys-models': ['api key', 'apikey', 'key', '密钥', '免费模型', '模型库'],
  bohaiModels: ['bohai', '对话模型'],
  'ai-quota': ['额度', 'token', '配额'],
  'moderation-model': ['内容审核模型', '机审'],
  'lab-ai-model': ['实验室', '实验模型'],
  aiWebSearchLog: ['联网', 'websearch', '搜索日志'],
  apiKeyAuditLogs: ['key 审计'],
  labUsageRecords: ['实验室用量'],
  userFollows: ['关注', '粉丝'],
  userImpressions: ['访客', '浏览记录'],
  lotterySchedulerLogs: ['定时任务', 'cron', '调度'],
  adminAuditLogs: ['操作审计', '审计'],
  userDataExportJobs: ['数据导出', '导出任务'],
};

/** 模块别名（侧栏一级模块 + 独立控制台页） */
export const MODULE_ALIASES = {
  overview: ['总览', '首页', 'dashboard'],
  users: ['账号', '会员'],
  gifts: ['礼品', '快递'],
  shop: ['商城', '店铺'],
  community: ['论坛', '社区'],
  operations: ['运营', '活动'],
  'shop-console': ['商城装修', '装修', '可视化编辑'],
  'shop-editor': ['就地编辑', '直接改商品', '改价格'],
  'news-editor': ['资讯编辑', '直接改资讯', '改新闻'],
  'hero-console': ['首页装修', '英雄区', 'hero', '首屏'],
  'gate-console': ['开屏', '开场', '入场浮层', 'gate', '启动页'],
  'avatar-console': ['头像框', '头像', 'avatar'],
  moderation: ['举报', '复核', '审核'],
  lottery: ['抽奖', '开奖', '保底'],
  'ai-config': ['ai', '密钥', '模型', 'key'],
  logs: ['日志', '监控'],
  system: ['设置', '媒体', '配置'],
};

/** 系统模块的两个「占位 section」（PLACEHOLDER_ADMIN_SECTIONS） */
export const SECTION_ALIASES = {
  media: ['媒体', '图片', '素材', '资源'],
  settings: ['网站设置', '站点配置', 'setting'],
};

const toList = (value) => (Array.isArray(value) ? value.filter(Boolean).map(String) : []);

/**
 * 构建功能索引。
 * @param {{ role?: string }} options - 当前角色，用于给无权项打 denied 标记
 * @returns {Array<{ key: string, kind: 'module'|'tab'|'section', id: string, label: string,
 *   icon: string, iconComponent: any, moduleId: string, moduleLabel: string,
 *   type: string, description: string, keywords: string[], denied: boolean }>}
 */
export const buildAdminFunctionIndex = ({ role = 'admin' } = {}) => {
  const entries = [];
  const tabById = new Map(tabs.map((tab) => [tab.id, tab]));

  for (const mod of tabModules) {
    const meta = ADMIN_PAGE_META[mod.id] || {};
    const denied = !canViewModule(role, mod.id);

    entries.push({
      key: `module:${mod.id}`,
      kind: 'module',
      id: mod.id,
      label: mod.label,
      icon: '',
      iconComponent: mod.icon || null,
      moduleId: mod.id,
      moduleLabel: mod.label,
      type: mod.type || 'module',
      description: [mod.description, meta.description].filter(Boolean).join(' ') || '',
      keywords: [...toList(MODULE_ALIASES[mod.id]), mod.id],
      denied,
    });

    for (const tabId of mod.tabIds || []) {
      const tab = tabById.get(tabId);
      /* 只认 tabIds 里登记过的：像 api-keys / freemodels 这种
         「已并入其它页、仅留 label 供旧深链」的条目不在任何 tabIds 里，
         列进搜索结果只会把人带到一份过渡页上。 */
      if (!tab) continue;
      entries.push({
        key: `tab:${tabId}`,
        kind: 'tab',
        id: tabId,
        label: tab.label,
        icon: tab.icon || '📄',
        iconComponent: null,
        moduleId: mod.id,
        moduleLabel: mod.label,
        type: tab.type || 'table',
        description: '',
        keywords: [...toList(TAB_ALIASES[tabId]), tabId],
        denied,
      });
    }

    for (const sub of mod.subNav || []) {
      entries.push({
        key: `section:${sub.id}`,
        kind: 'section',
        id: sub.id,
        label: sub.label,
        icon: '🗂️',
        iconComponent: null,
        moduleId: mod.id,
        moduleLabel: mod.label,
        type: 'section',
        description: '',
        keywords: [...toList(SECTION_ALIASES[sub.id]), sub.id],
        denied,
      });
    }
  }

  return entries;
};

/** 搜索用的归一化：小写 + 去首尾空白（中文没有大小写，但 id / 英文别名有） */
export const normalizeFunctionQuery = (query) =>
  String(query ?? '')
    .trim()
    .toLowerCase();

/**
 * 打分：0 = 不匹配。**功能（tab）比模块优先** —— 搜「积分」的人多半想打开
 * 「积分发放」这一页，而不是回到「用户」模块首页。
 */
export const scoreFunctionMatch = (entry, rawQuery) => {
  const query = normalizeFunctionQuery(rawQuery);
  if (!query || !entry) return 0;

  const tokens = query.split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;

  const label = String(entry.label || '').toLowerCase();
  const haystack = [
    label,
    String(entry.moduleLabel || '').toLowerCase(),
    String(entry.description || '').toLowerCase(),
    ...toList(entry.keywords).map((k) => k.toLowerCase()),
  ].join(' ');

  // 多词查询按 AND 处理：搜「积分 发放」不该命中「积分管理」
  if (!tokens.every((token) => haystack.includes(token))) return 0;

  let score = 20;
  if (label === query) score = 100;
  else if (label.startsWith(query)) score = 80;
  else if (tokens.every((token) => label.includes(token))) score = 65;
  else if (toList(entry.keywords).some((k) => k.toLowerCase().includes(query))) score = 55;
  else if (label.includes(query)) score = 50;

  if (entry.kind === 'tab') score += 5;
  return score;
};

/**
 * 按相关性取前 N 条。
 * @param {Array} entries - buildAdminFunctionIndex 的结果
 * @param {string} query
 * @param {{ limit?: number, includeDenied?: boolean }} options
 */
export const searchAdminFunctions = (entries, query, { limit = 8, includeDenied = true } = {}) => {
  const list = Array.isArray(entries) ? entries : [];
  return list
    .map((entry, index) => ({ entry, index, score: scoreFunctionMatch(entry, query) }))
    .filter((item) => item.score > 0 && (includeDenied || !item.entry.denied))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map((item) => item.entry);
};
