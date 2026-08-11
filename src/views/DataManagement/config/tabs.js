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
  Layout
} from 'lucide-vue-next';

export const tabs = [
  { id: 'users', label: '用户管理', icon: '👤', module: 'users' },
  { id: 'points', label: '积分管理', icon: '⭐', module: 'users' },
  { id: 'points-grant', label: '积分发放', icon: '🎁', module: 'users', type: 'page' },
  { id: 'subscriptions', label: '订阅管理', icon: '💎', module: 'users' },
  { id: 'gifts', label: '礼物管理', icon: '📦', module: 'gifts' },
  { id: 'addresses', label: '地址管理', icon: '📍', module: 'gifts' },
  { id: 'posterRequests', label: '海报申请', icon: '🖼️', module: 'users' },
  { id: 'forum', label: '论坛帖子', icon: '💬', module: 'content' },
  { id: 'news', label: '新闻管理', icon: '📰', module: 'content' },
  { id: 'activities', label: '活动管理', icon: '🎉', module: 'content' },
  { id: 'products', label: '商品管理', icon: '🎁', module: 'content' },
  { id: 'coreMemories', label: '官方事实', icon: '📚', module: 'content' },
  { id: 'reportedPosts', label: '举报下架', icon: '🚩', module: 'moderation' },
  { id: 'reviewPosts', label: '已拒绝帖子', icon: '🧾', module: 'moderation' },
  { id: 'reviewComments', label: '已拒绝评论', icon: '🗨️', module: 'moderation' },
  { id: 'lotteries', label: '抽奖管理', icon: '🎲', module: 'lottery' },
  { id: 'lotteryEntries', label: '抽奖报名', icon: '🧾', module: 'lottery' },
  { id: 'lotteryDrawLogs', label: '开奖日志', icon: '🏆', module: 'lottery' },
  { id: 'lotteryNotificationJobs', label: '中奖通知', icon: '📣', module: 'lottery' },
  { id: 'lotteryJoinAttempts', label: '报名风控', icon: '🛡️', module: 'lottery' },
  { id: 'api-keys', label: 'API Key', icon: '🔑', module: 'ai-config', type: 'page' },
  { id: 'freemodels', label: '免费模型库', icon: '🆓', module: 'ai-config', type: 'page' },
  { id: 'bohaiModels', label: 'BOHAI 模型', icon: '🤖', module: 'ai-config', type: 'table' },
  { id: 'ai-quota', label: 'AI 额度', icon: '📊', module: 'ai-config', type: 'page' },
  { id: 'moderation-model', label: '审核模型', icon: '🛡️', module: 'ai-config', type: 'page' },
  { id: 'lab-ai-model', label: '实验室模型', icon: '🧪', module: 'ai-config', type: 'page' }
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
    tabIds: ['users', 'points', 'points-grant', 'subscriptions', 'posterRequests'],
    description: '账号、积分、订阅和礼物'
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
    id: 'content',
    label: '内容',
    icon: FileText,
    section: 'data',
    defaultTab: 'forum',
    tabIds: ['forum', 'news', 'activities', 'products', 'coreMemories'],
    description: '论坛、新闻、活动、商品和知识'
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
    tabIds: ['reportedPosts', 'reviewPosts', 'reviewComments'],
    description: '举报与内容复核'
  },
  {
    id: 'lottery',
    label: '抽奖',
    icon: Gift,
    section: 'data',
    defaultTab: 'lotteries',
    tabIds: ['lotteries', 'lotteryEntries', 'lotteryDrawLogs', 'lotteryNotificationJobs', 'lotteryJoinAttempts'],
    description: '抽奖配置、开奖和风控'
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
    id: 'system',
    label: '系统',
    icon: Settings,
    section: 'system',
    defaultTab: 'media',
    subNav: [
      { id: 'media', label: '媒体资源' },
      { id: 'settings', label: '网站设置' }
    ],
    description: '媒体资源和站点设置'
  }
];

export const TABS_ACTIONS = {
  users: ['view', 'create', 'edit', 'delete', 'ban', 'mute'],
  points: ['view', 'edit'],
  subscriptions: ['view', 'create', 'edit', 'delete'],
  gifts: ['view', 'create', 'edit', 'delete'],
  addresses: ['view', 'create', 'edit', 'delete'],
  posterRequests: ['view', 'edit'],
  forum: ['view', 'create', 'edit', 'delete'],
  news: ['view', 'create', 'edit', 'delete'],
  activities: ['view', 'create', 'edit', 'delete'],
  products: ['view', 'create', 'edit', 'delete'],
  coreMemories: ['view', 'create', 'edit', 'delete'],
  reportedPosts: ['view', 'moderate'],
  reviewPosts: ['view', 'moderate'],
  reviewComments: ['view', 'moderate'],
  lotteries: ['view', 'create', 'edit', 'delete', 'close'],
  lotteryEntries: ['view'],
  lotteryDrawLogs: ['view'],
  lotteryNotificationJobs: ['view'],
  lotteryJoinAttempts: ['view'],
  'api-keys': ['view', 'create', 'edit', 'delete'],
  freemodels: ['view', 'create', 'edit', 'delete'],
  bohaiModels: ['view', 'create', 'edit', 'delete'],
  'ai-quota': ['view', 'edit'],
  'moderation-model': ['view', 'edit'],
  'lab-ai-model': ['view', 'edit']
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
    description: '配置抽奖活动、查看报名和开奖记录。',
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
