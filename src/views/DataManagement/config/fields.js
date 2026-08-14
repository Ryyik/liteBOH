export const TAB_WRITABLE_FIELDS = {
  users: ['username', 'email', 'role', 'points', 'experience', 'join_date', 'bio', 'avatar_url', 'tags', 'birth_month', 'birth_day', 'pushplus_enabled', 'is_boh_creator', 'creator_platform_ids', 'creator_platform_visibility', 'creator_platform_order', 'showcase_post_ids', 'profile_background_url', 'profile_background_public_id', 'hide_online_status', 'hide_follow_data'],
  points: ['role', 'points', 'experience', 'join_date'],
  subscriptions: ['user_id', 'plan_code', 'plan_name', 'billing_cycle', 'points_cost', 'duration_months', 'started_at', 'expires_at', 'status', 'metadata', 'updated_at'],
  gifts: ['user_id', 'gift_no', 'gift_content', 'gift_price', 'gift_points', 'gift_image', 'gift_status', 'is_active', 'address_id', 'completed_at', 'updated_at'],
  addresses: ['user_id', 'recipient', 'phone', 'region', 'detail', 'tag', 'is_default', 'updated_at'],
  posterRequests: ['user_id', 'status', 'updated_at'],
  forum: ['content', 'author_id', 'author_username', 'status', 'tag', 'cover_image_url', 'location_name', 'updated_at'],
  coreMemories: ['title', 'content', 'category', 'tags', 'priority', 'source_label', 'source_url', 'status', 'updated_by'],
  bohaiModels: ['mode_id', 'display_name', 'tagline', 'description', 'provider', 'provider_label', 'model_id', 'api_url', 'capability', 'icon', 'temperature', 'top_p', 'frequency_penalty', 'max_tokens', 'quota_multiplier', 'min_tier', 'status', 'sort_order', 'notes', 'created_by', 'updated_by'],
  lotteries: ['title', 'description', 'prize_title', 'prize_description', 'cover_image_url', 'status', 'is_community_visible', 'is_home_visible', 'enforce_account_age_check', 'max_entries', 'winner_count', 'entry_deadline_at', 'draw_at', 'fulfillment_status', 'created_by', 'updated_by'],
  news: ['id', 'category', 'title', 'excerpt', 'content', 'date', 'author', 'image'],
  activities: ['id', 'title', 'date', 'image', 'description'],
  products: ['id', 'title', 'category', 'description', 'points_cost', 'stock', 'image', 'specifications', 'is_active', 'is_purchasable', 'payment_mode', 'rmb_price'],
  shopOrders: ['status', 'updated_at'],
  birthdayEvents: ['title', 'subtitle', 'hero_quote', 'page_copy', 'celebration_date', 'is_active', 'sort_order', 'updated_at'],
  birthdayWishes: ['status', 'is_featured', 'updated_at'],
  blockWallItems: ['content', 'color', 'image_url', 'image_public_id', 'position_x', 'position_y', 'rotation', 'updated_at'],
  bohCreatorShows: ['title', 'description', 'video_url', 'creator_platform', 'creator_platform_id', 'updated_at']
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
  { value: 'ultra', label: 'Ultra' },
  { value: 'coding-lite', label: 'Coding Lite（¥5/月）' },
  { value: 'coding-plus', label: 'Coding Plus（¥12/月）' },
  { value: 'coding-pro', label: 'Coding Pro（¥20/月）' },
  { value: 'coding-ultra', label: 'Coding Ultra（¥35/月）' }
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

export const BOHAI_MODEL_MIN_TIER_OPTIONS = [
  { value: 'guest', label: '游客（guest）' },
  { value: 'free', label: 'Free' },
  { value: 'plus', label: 'Plus' },
  { value: 'pro', label: 'Pro' },
  { value: 'max', label: 'Max' },
  { value: 'ultra', label: 'Ultra' },
  { value: 'coding-lite', label: 'Coding Lite（附加包）' },
  { value: 'coding-plus', label: 'Coding Plus（附加包）' },
  { value: 'coding-pro', label: 'Coding Pro（附加包）' },
  { value: 'coding-ultra', label: 'Coding Ultra（附加包）' }
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

export const POSTER_REQUEST_STATUS_OPTIONS = [
  { value: 'pending', label: '已收到申请（pending）' },
  { value: 'processing', label: '处理中（processing）' },
  { value: 'shipped', label: '已寄出（shipped）' },
  { value: 'completed', label: '已送达（completed）' }
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

// 商品支付模式
export const PRODUCT_PAYMENT_MODE_OPTIONS = [
  { value: 'points', label: '纯积分（points）' },
  { value: 'rmb', label: '纯人民币（rmb）' },
  { value: 'mixed', label: '积分+人民币（mixed）' }
];

// 商城订单状态
export const ORDER_STATUS_OPTIONS = [
  { value: 'pending', label: '待处理（pending）' },
  { value: 'processing', label: '处理中（processing）' },
  { value: 'shipped', label: '已发货（shipped）' },
  { value: 'completed', label: '已完成（completed）' },
  { value: 'cancelled', label: '已取消（cancelled）' }
];

// 订单联系类型
export const ORDER_CONTACT_TYPE_OPTIONS = [
  { value: 'qq', label: 'QQ' },
  { value: 'wechat', label: '微信' },
  { value: 'phone', label: '电话' }
];

// 通知类型
export const NOTIFICATION_TYPE_OPTIONS = [
  { value: 'like', label: '点赞' },
  { value: 'comment', label: '评论' },
  { value: 'reply', label: '回复' },
  { value: 'follow', label: '关注' },
  { value: 'impression', label: '访客' },
  { value: 'lottery', label: '抽奖' },
  { value: 'system', label: '系统' }
];

// 通知状态
export const NOTIFICATION_STATUS_OPTIONS = [
  { value: 'unread', label: '未读' },
  { value: 'read', label: '已读' }
];

// 生日祝福状态
export const BIRTHDAY_WISH_STATUS_OPTIONS = [
  { value: 'pending', label: '待审核（pending）' },
  { value: 'approved', label: '已通过（approved）' },
  { value: 'rejected', label: '已拒绝（rejected）' }
];

// 论坛帖子标签
export const FORUM_POST_TAG_OPTIONS = [
  { value: '', label: '无标签' },
  { value: 'share', label: '分享' },
  { value: 'question', label: '提问' },
  { value: 'discussion', label: '讨论' },
  { value: 'guide', label: '教程' },
  { value: 'news', label: '资讯' }
];

// 布尔展示选项
export const BOOLEAN_DISPLAY_OPTIONS = [
  { value: true, label: '是' },
  { value: false, label: '否' }
];
