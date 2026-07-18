export const TAB_WRITABLE_FIELDS = {
  users: ['username', 'email', 'role', 'points', 'experience', 'join_date', 'bio', 'avatar_url', 'tags'],
  points: ['role', 'points', 'experience', 'join_date'],
  subscriptions: ['user_id', 'plan_code', 'plan_name', 'billing_cycle', 'points_cost', 'duration_months', 'started_at', 'expires_at', 'status', 'metadata', 'updated_at'],
  gifts: ['user_id', 'gift_no', 'gift_content', 'gift_price', 'gift_image', 'gift_status', 'is_active', 'completed_at', 'updated_at'],
  forum: ['content', 'author_id', 'author_username', 'status', 'updated_at'],
  coreMemories: ['title', 'content', 'category', 'tags', 'priority', 'source_label', 'source_url', 'status', 'updated_by'],
  bohaiModels: ['mode_id', 'display_name', 'tagline', 'description', 'provider', 'provider_label', 'model_id', 'api_url', 'capability', 'icon', 'temperature', 'top_p', 'frequency_penalty', 'max_tokens', 'quota_multiplier', 'status', 'sort_order', 'notes', 'created_by', 'updated_by'],
  lotteries: ['title', 'description', 'prize_title', 'prize_description', 'cover_image_url', 'status', 'is_community_visible', 'max_entries', 'winner_count', 'entry_deadline_at', 'draw_at', 'fulfillment_status', 'created_by', 'updated_by'],
  news: ['id', 'category', 'title', 'excerpt', 'content', 'date', 'author', 'image'],
  activities: ['id', 'title', 'date', 'image', 'description'],
  products: ['id', 'title', 'category', 'description', 'points_cost', 'stock', 'image', 'specifications']
};

export const NEWS_CATEGORY_OPTIONS = [
  { value: 'event', label: '活动公告（event）' },
  { value: 'update', label: '功能更新（update）' },
  { value: 'community', label: '社区动态（community）' },
  { value: 'announce', label: '站内公告（announce）' }
];

export const NEWS_CATEGORY_VALUES = NEWS_CATEGORY_OPTIONS.map((item) => item.value);

export const USER_ROLE_OPTIONS = [
  { value: 'user', label: '普通用户（user）' },
  { value: 'admin', label: '管理员（admin）' },
  { value: 'moderator', label: '版主（moderator）' }
];

export const FORUM_STATUS_OPTIONS = [
  { value: 'approved', label: '已通过（approved）' },
  { value: 'limited', label: '仅作者可见（limited）' },
  { value: 'rejected', label: '已拒绝（rejected）' }
];

export const PRODUCT_CATEGORY_OPTIONS = [
  { value: 'BOH Bag', label: 'BOH Bag' },
  { value: 'BOH 装饰', label: 'BOH 装饰' },
  { value: 'BOH 虚拟', label: 'BOH 虚拟' },
  { value: 'BOH 定制', label: 'BOH 定制' }
];

export const SUBSCRIPTION_PLAN_OPTIONS = [
  { value: 'free', label: 'Free' },
  { value: 'plus', label: 'Plus' },
  { value: 'pro', label: 'Pro' },
  { value: 'max', label: 'Max' },
  { value: 'ultra', label: 'Ultra' }
];

export const SUBSCRIPTION_PLAN_NAMES = SUBSCRIPTION_PLAN_OPTIONS.reduce((map, item) => {
  map[item.value] = item.label;
  return map;
}, {});

export const SUBSCRIPTION_BILLING_OPTIONS = [
  { value: 'monthly', label: '月付（monthly）' },
  { value: 'yearly', label: '年付（yearly）' }
];

export const SUBSCRIPTION_STATUS_OPTIONS = [
  { value: 'active', label: '生效中（active）' },
  { value: 'expired', label: '已到期（expired）' },
  { value: 'cancelled', label: '已取消（cancelled）' }
];

export const CORE_MEMORY_CATEGORY_OPTIONS = [
  { value: 'community_overview', label: '社区概况' },
  { value: 'member_profile', label: '成员档案' },
  { value: 'timeline', label: '发展大事记' },
  { value: 'culture', label: '社区文化与梗' },
  { value: 'site_fact', label: '站点事实' },
  { value: 'rule', label: '规则原则' },
  { value: 'general', label: '通用事实' }
];

export const CORE_MEMORY_STATUS_OPTIONS = [
  { value: 'active', label: '生效中（active）' },
  { value: 'archived', label: '已归档（archived）' }
];

export const BOHAI_MODEL_PROVIDER_OPTIONS = [
  { value: 'siliconflow', label: 'SiliconFlow' },
  { value: 'zhipu', label: '智谱 AI' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'custom', label: '自定义兼容接口' }
];

export const FREEMODEL_PROVIDER_OPTIONS = [
  { value: 'siliconflow', label: 'SiliconFlow' },
  { value: 'zhipu', label: '智谱 AI' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'custom', label: '自定义' }
];

export const BOHAI_MODEL_CAPABILITY_OPTIONS = [
  { value: 'chat', label: '聊天（chat）' },
  { value: 'multimodal', label: '多模态（multimodal）' },
  { value: 'plan', label: '规划（plan）' },
  { value: 'agent', label: 'Agent（agent）' }
];

export const BOHAI_MODEL_STATUS_OPTIONS = [
  { value: 'active', label: '启用（active）' },
  { value: 'disabled', label: '停用（disabled）' }
];

export const BOHAI_MODEL_ICON_OPTIONS = [
  { value: 'zap', label: '闪电（Fast）' },
  { value: 'sparkles', label: '星光（Pro）' },
  { value: 'image', label: '图像（多模态）' },
  { value: 'list-checks', label: '清单（Plan）' },
  { value: 'users', label: '协作（Agent）' }
];

export const LOTTERY_STATUS_OPTIONS = [
  { value: 'draft', label: '草稿（draft）' },
  { value: 'open', label: '报名中（open）' },
  { value: 'drawn', label: '已开奖（drawn）' },
  { value: 'closed', label: '已关闭（closed）' }
];

export const LOTTERY_COMMUNITY_VISIBLE_OPTIONS = [
  { value: true, label: '显示在社区抽奖页' },
  { value: false, label: '不在社区抽奖页显示' }
];

export const LOTTERY_FULFILLMENT_STATUS_OPTIONS = [
  { value: 'pending_contact', label: '待联系（pending_contact）' },
  { value: 'confirmed', label: '已确认（confirmed）' },
  { value: 'fulfilled', label: '已发放（fulfilled）' },
  { value: 'voided', label: '已作废（voided）' }
];
