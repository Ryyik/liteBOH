import {
  Database,
  Gauge,
  Image,
  Settings,
  ShieldCheck,
  Users,
  FileText,
  Flag,
  Sparkles,
  Gift,
  Store,
  Layout,
  MessageCircle,
  Megaphone,
  Activity
} from 'lucide-vue-next';

export const tabs = [
  { id: 'users', label: '用户管理', icon: '👤', module: 'users' },
  { id: 'points', label: '积分管理', icon: '⭐', module: 'users' },
  { id: 'points-grant', label: '积分发放', icon: '🎁', module: 'users', type: 'page' },
  { id: 'pointsTransactions', label: '积分流水', icon: '📋', module: 'users' },
  { id: 'subscriptions', label: '订阅管理', icon: '💎', module: 'users' },
  { id: 'subscriptions-grant', label: '订阅发放', icon: '💳', module: 'users', type: 'page' },
  { id: 'anniversaryClaims', label: '周年领取', icon: '🎈', module: 'users' },
  { id: 'gifts', label: '礼物管理', icon: '📦', module: 'gifts' },
  { id: 'addresses', label: '地址管理', icon: '📍', module: 'gifts' },
  { id: 'shopOrders', label: '商城订单', icon: '🛒', module: 'shop' },
  { id: 'products', label: '商品管理', icon: '🎁', module: 'shop' },
  { id: 'forum', label: '论坛帖子', icon: '💬', module: 'community' },
  { id: 'ads', label: '广告管理', icon: '📢', module: 'community' },
  { id: 'forumWeeklyCheckins', label: '每周签到', icon: '📅', module: 'community' },
  { id: 'forumPostImages', label: '图片审核', icon: '🖼️', module: 'community' },
  { id: 'forumPostReports', label: '举报明细', icon: '🚩', module: 'community' },
  { id: 'blockWallItems', label: '方块墙', icon: '🧱', module: 'community' },
  { id: 'news', label: '新闻管理', icon: '📰', module: 'operations' },
  { id: 'activities', label: '活动管理', icon: '🎉', module: 'operations' },
  { id: 'postReward', label: '发帖有奖', icon: '🎁', module: 'operations' },
  { id: 'coreMemories', label: '官方事实', icon: '📚', module: 'operations' },
  { id: 'bohCreatorShows', label: '创作者展示', icon: '🎬', module: 'operations' },
  { id: 'birthdayEvents', label: '生日活动', icon: '🎂', module: 'operations' },
  { id: 'birthdayWishes', label: '生日祝福', icon: '💌', module: 'operations' },
  { id: 'posterRequests', label: '海报申请', icon: '🖼️', module: 'operations' },
  { id: 'reportedPosts', label: '举报下架', icon: '🚩', module: 'moderation' },
  { id: 'reviewPosts', label: '已拒绝帖子', icon: '🧾', module: 'moderation' },
  { id: 'reviewComments', label: '已拒绝评论', icon: '🗨️', module: 'moderation' },
  { id: 'moderationLogs', label: '审核日志', icon: '📝', module: 'moderation' },
  { id: 'notifications', label: '通知管理', icon: '🔔', module: 'moderation' },
  { id: 'lotteries', label: '抽奖管理', icon: '🎲', module: 'lottery' },
  { id: 'lotteryFulfillments', label: '履约与通知', icon: '📦', module: 'lottery' },
  { id: 'lotteryEntries', label: '报名明细', icon: '🧾', module: 'lottery' },
  { id: 'lotteryAuditLogs', label: '运行审计', icon: '📜', module: 'lottery' },
  { id: 'pity-grant', label: '保底中心', icon: '🛡️', module: 'lottery', type: 'page' },
  { id: 'api-keys', label: 'API Key', icon: '🔑', module: 'ai-config', type: 'page' },
  { id: 'freemodels', label: '免费模型库', icon: '🆓', module: 'ai-config', type: 'page' },
  { id: 'bohaiModels', label: 'BOHAI 模型', icon: '🤖', module: 'ai-config', type: 'table' },
  { id: 'ai-quota', label: 'AI 额度', icon: '📊', module: 'ai-config', type: 'page' },
  { id: 'moderation-model', label: '审核模型', icon: '🛡️', module: 'ai-config', type: 'page' },
  { id: 'lab-ai-model', label: '实验室模型', icon: '🧪', module: 'ai-config', type: 'page' },
  { id: 'aiWebSearchLog', label: '联网搜索日志', icon: '🔍', module: 'logs' },
  { id: 'apiKeyAuditLogs', label: 'Key审计日志', icon: '📜', module: 'logs' },
  { id: 'labUsageRecords', label: '实验室用量', icon: '🧪', module: 'logs' },
  { id: 'cloudinaryUploads', label: '上传队列', icon: '☁️', module: 'logs' },
  { id: 'userFollows', label: '关注关系', icon: '👥', module: 'logs' },
  { id: 'userImpressions', label: '访客记录', icon: '👁️', module: 'logs' },
  { id: 'lotterySchedulerLogs', label: '抽奖调度', icon: '⚙️', module: 'logs' },
  { id: 'userDataExportJobs', label: '用户数据导出', icon: '📤', module: 'logs' }
];

export const tabModules = [
  {
    id: 'overview',
    label: '概览',
    icon: Gauge,
    section: 'overview',
    defaultTab: null,
    description: '站点运行总览'
  },
  {
    id: 'users',
    label: '用户',
    icon: Users,
    section: 'data',
    defaultTab: 'users',
    tabIds: ['users', 'points', 'points-grant', 'pointsTransactions', 'subscriptions', 'subscriptions-grant', 'anniversaryClaims'],
    description: '账号、积分、订阅和领取记录'
  },
  {
    id: 'gifts',
    label: '礼物',
    icon: Gift,
    section: 'data',
    defaultTab: 'gifts',
    tabIds: ['gifts', 'addresses'],
    description: '管理用户礼物、地址和快递信息'
  },
  {
    id: 'shop',
    label: '商城',
    icon: Store,
    section: 'data',
    defaultTab: 'shopOrders',
    tabIds: ['shopOrders', 'products'],
    subPages: ['shop-console'],
    description: '商品、订单和商城装修'
  },
  {
    id: 'community',
    label: '社区',
    icon: MessageCircle,
    section: 'data',
    defaultTab: 'forum',
    tabIds: ['forum', 'ads', 'forumWeeklyCheckins', 'forumPostImages', 'forumPostReports', 'blockWallItems'],
    description: '论坛、签到、图片审核、举报和方块墙'
  },
  {
    id: 'operations',
    label: '运营',
    icon: Megaphone,
    section: 'data',
    defaultTab: 'news',
    tabIds: ['news', 'activities', 'postReward', 'coreMemories', 'bohCreatorShows', 'birthdayEvents', 'birthdayWishes', 'posterRequests'],
    description: '新闻、活动、官方事实、创作者和生日运营'
  },
  {
    id: 'shop-console',
    label: '商城装修',
    icon: Store,
    section: 'data',
    type: 'page',
    description: '可视化编辑商城商品与展示'
  },
  {
    id: 'hero-console',
    label: '首页装修',
    icon: Layout,
    section: 'data',
    type: 'page',
    description: '可视化编辑首页英雄区，支持模板/预览/裁切/发布'
  },
  {
    id: 'moderation',
    label: '审核',
    icon: Flag,
    section: 'data',
    defaultTab: 'reportedPosts',
    tabIds: ['reportedPosts', 'reviewPosts', 'reviewComments', 'moderationLogs', 'notifications'],
    description: '举报、内容复核、审核日志和通知管理'
  },
  {
    id: 'lottery',
    label: '抽奖',
    icon: Gift,
    section: 'data',
    defaultTab: 'lotteries',
    tabIds: ['lotteries', 'lotteryFulfillments', 'lotteryEntries', 'lotteryAuditLogs', 'pity-grant'],
    description: '抽奖配置、履约与通知、报名明细、运行审计和保底中心'
  },
  {
    id: 'ai-config',
    label: 'AI 配置',
    icon: Sparkles,
    section: 'data',
    defaultTab: 'api-keys',
    tabIds: ['api-keys', 'freemodels', 'bohaiModels', 'ai-quota', 'moderation-model', 'lab-ai-model'],
    description: 'API Key、免费模型库与各场景模型配置'
  },
  {
    id: 'logs',
    label: '日志监控',
    icon: Activity,
    section: 'data',
    defaultTab: 'aiWebSearchLog',
    tabIds: ['aiWebSearchLog', 'apiKeyAuditLogs', 'labUsageRecords', 'cloudinaryUploads', 'userFollows', 'userImpressions', 'lotterySchedulerLogs', 'userDataExportJobs'],
    description: 'AI搜索、Key审计、实验室、上传、关注、访客与抽奖调度日志'
  },
  {
    id: 'system',
    label: '系统',
    icon: Settings,
    section: 'system',
    defaultTab: null,
    subNav: [
      { id: 'media', label: '媒体资源' },
      { id: 'settings', label: '网站设置' }
    ],
    description: '媒体资源与站点设置'
  }
];

export const TABS_ACTIONS = {
  users: ['view', 'create', 'edit', 'delete', 'ban', 'mute'],
  points: ['view', 'edit'],
  pointsTransactions: ['view'],
  subscriptions: ['view', 'create', 'edit', 'delete'],
  'subscriptions-grant': ['view'],
  anniversaryClaims: ['view'],
  gifts: ['view', 'create', 'edit', 'delete'],
  addresses: ['view', 'create', 'edit', 'delete'],
  posterRequests: ['view', 'edit'],
  shopOrders: ['view', 'edit'],
  forum: ['view', 'create', 'edit', 'delete'],
  ads: ['view', 'create', 'edit', 'delete'],
  forumWeeklyCheckins: ['view'],
  forumPostImages: ['view'],
  forumPostReports: ['view'],
  news: ['view', 'create', 'edit', 'delete'],
  activities: ['view', 'create', 'edit', 'delete'],
  postReward: ['view', 'create', 'edit', 'delete'],
  products: ['view', 'create', 'edit', 'delete'],
  coreMemories: ['view', 'create', 'edit', 'delete'],
  blockWallItems: ['view', 'create', 'edit', 'delete'],
  bohCreatorShows: ['view', 'create', 'edit', 'delete'],
  birthdayEvents: ['view', 'create', 'edit', 'delete'],
  birthdayWishes: ['view', 'edit'],
  reportedPosts: ['view', 'moderate'],
  reviewPosts: ['view', 'moderate'],
  reviewComments: ['view', 'moderate'],
  moderationLogs: ['view'],
  notifications: ['view'],
  lotteries: ['view', 'create', 'edit', 'delete', 'close'],
  lotteryFulfillments: ['view', 'manage'],
  lotteryEntries: ['view'],
  lotteryDrawLogs: ['view'],
  lotteryFailureStats: ['view'],
  lotterySchedulerLogs: ['view'],
  lotteryNotificationJobs: ['view'],
  lotteryJoinAttempts: ['view'],
  lotteryAuditLogs: ['view'],
  'api-keys': ['view', 'create', 'edit', 'delete'],
  freemodels: ['view', 'create', 'edit', 'delete'],
  bohaiModels: ['view', 'create', 'edit', 'delete'],
  'ai-quota': ['view', 'edit'],
  aiWebSearchLog: ['view'],
  apiKeyAuditLogs: ['view'],
  'moderation-model': ['view', 'edit'],
  'lab-ai-model': ['view', 'edit'],
  labUsageRecords: ['view'],
  cloudinaryUploads: ['view', 'delete'],
  userFollows: ['view'],
  userImpressions: ['view'],
  userDataExportJobs: ['view']
};

export const TABS_KEEP_ID_ON_INSERT = new Set(['news', 'activities', 'products']);

export const ADMIN_PAGE_META = {
  overview: {
    eyebrow: 'Overview',
    title: '站点运行概览',
    description: '查看核心数据规模、异常诊断和最近活动。',
    icon: Gauge
  },
  users: {
    eyebrow: 'Users',
    title: '用户管理',
    description: '管理用户账号、积分、订阅和礼物履约。',
    icon: Users
  },
  gifts: {
    eyebrow: 'Gifts',
    title: '礼物管理',
    description: '管理用户礼物、进度和快递信息。',
    icon: Gift
  },
  content: {
    eyebrow: 'Content',
    title: '内容管理',
    description: '管理论坛帖子、新闻、活动、商品和官方知识。',
    icon: FileText
  },
  community: {
    eyebrow: 'Community',
    title: '社区管理',
    description: '管理论坛帖子、签到、图片审核、举报和方块墙。',
    icon: MessageCircle
  },
  operations: {
    eyebrow: 'Operations',
    title: '运营管理',
    description: '管理新闻、活动、官方事实、创作者展示、生日运营和海报申请。',
    icon: Megaphone
  },
  shop: {
    eyebrow: 'Shop',
    title: '商城管理',
    description: '管理商品、订单处理和商城装修。',
    icon: Store
  },
  logs: {
    eyebrow: 'Logs',
    title: '日志监控',
    description: '查看 AI 搜索、Key 审计、实验室用量、上传队列、关注关系和访客记录。',
    icon: Activity
  },
  'shop-console': {
    eyebrow: 'Shop Console',
    title: '商城装修',
    description: '可视化编辑商城商品与展示，保存后立即生效。',
    icon: Store
  },
  'hero-console': {
    eyebrow: 'Hero Console',
    title: '首页装修',
    description: '可视化编辑首页英雄区，支持模板选择、实时预览、图片裁切、草稿/发布分离。',
    icon: Layout
  },
  moderation: {
    eyebrow: 'Moderation',
    title: '内容审核',
    description: '处理举报、复核已拒绝的帖子和评论。',
    icon: Flag
  },
  lottery: {
    eyebrow: 'Lottery',
    title: '抽奖管理',
    description: '抽奖管理、履约与通知、报名明细、运行审计与保底中心。',
    icon: Gift
  },
  'ai-config': {
    eyebrow: 'AI Config',
    title: 'AI 配置',
    description: '以免费模型库为基础，统一管理 API Key、BOHAI 模型、审核模型与实验室模型。',
    icon: Sparkles
  },
  system: {
    eyebrow: 'System',
    title: '系统设置',
    description: '媒体资源管理和网站配置。',
    icon: Settings
  }
};
