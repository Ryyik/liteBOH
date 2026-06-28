import { Database, Gauge, Image, Settings } from 'lucide-vue-next';

export const tabs = [
  { id: 'users', label: '用户管理', icon: '👤' },
  { id: 'points', label: '积分管理', icon: '⭐' },
  { id: 'subscriptions', label: '订阅管理', icon: '💎' },
  { id: 'gifts', label: '礼物管理', icon: '📦' },
  { id: 'forum', label: '论坛帖子', icon: '💬' },
  { id: 'reportedPosts', label: '举报下架', icon: '🚩' },
  { id: 'reviewPosts', label: '已拒绝帖子', icon: '🧾' },
  { id: 'reviewComments', label: '已拒绝评论', icon: '🗨️' },
  { id: 'coreMemories', label: '官方事实', icon: '📚' },
  { id: 'bohaiModels', label: 'BOHAI 模型', icon: '🤖' },
  { id: 'lotteries', label: '抽奖管理', icon: '🎲' },
  { id: 'lotteryEntries', label: '抽奖报名', icon: '🧾' },
  { id: 'lotteryDrawLogs', label: '开奖日志', icon: '🏆' },
  { id: 'lotteryNotificationJobs', label: '中奖通知', icon: '📣' },
  { id: 'lotteryJoinAttempts', label: '报名风控', icon: '🛡️' },
  { id: 'news', label: '新闻管理', icon: '📰' },
  { id: 'activities', label: '活动管理', icon: '🎉' },
  { id: 'products', label: '商品管理', icon: '🎁' }
];

export const tabGroups = [
  {
    id: 'people',
    label: '用户',
    description: '账号、积分、订阅和礼物履约',
    tabIds: ['users', 'points', 'subscriptions', 'gifts']
  },
  {
    id: 'content',
    label: '内容',
    description: '论坛、官方事实、新闻、活动和商品',
    tabIds: ['forum', 'coreMemories', 'news', 'activities', 'products']
  },
  {
    id: 'ai',
    label: 'AI',
    description: 'BOHAI 模型和官方知识配置',
    tabIds: ['bohaiModels']
  },
  {
    id: 'moderation',
    label: '审核',
    description: '举报与拒绝内容复核',
    tabIds: ['reportedPosts', 'reviewPosts', 'reviewComments']
  },
  {
    id: 'lottery',
    label: '抽奖',
    description: '抽奖配置、开奖、通知和报名风控',
    tabIds: ['lotteries', 'lotteryEntries', 'lotteryDrawLogs', 'lotteryNotificationJobs', 'lotteryJoinAttempts']
  }
];

export const TABS_KEEP_ID_ON_INSERT = new Set(['news', 'activities', 'products']);

export const ADMIN_PAGE_META = {
  overview: {
    eyebrow: 'Overview',
    title: '站点运行概览',
    description: '查看核心数据规模、异常诊断和最近活动。',
    icon: Gauge
  },
  data: {
    eyebrow: 'Data Console',
    title: '数据管理',
    description: '通过用户、内容、审核和抽奖分组，集中管理所有站点数据表。',
    icon: Database
  },
  media: {
    eyebrow: 'Media',
    title: '媒体资源',
    description: '汇总商品、新闻、活动、抽奖封面等图片资源入口。',
    placeholder: '媒体库页面已独立出来，先提供常用图片数据入口。',
    icon: Image
  },
  settings: {
    eyebrow: 'Settings',
    title: '网站设置',
    description: '集中查看后台配置、权限状态和自动任务入口。',
    placeholder: '设置页目前提供管理状态和关键任务入口，后续可继续拆出站点配置表单。',
    icon: Settings
  }
};
