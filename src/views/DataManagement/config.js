// ==================== 标签页配置 ====================
export const tabs = [
  { id: 'users', label: '用户管理', icon: '👤' },
  { id: 'points', label: '积分管理', icon: '⭐' },
  { id: 'subscriptions', label: '订阅管理', icon: '💎' },
  { id: 'gifts', label: '礼物管理', icon: '📦' },
  { id: 'forum', label: '论坛帖子', icon: '💬' },
  { id: 'reportedPosts', label: '举报下架', icon: '🚩' },
  { id: 'reviewPosts', label: '已拒绝帖子', icon: '🧾' },
  { id: 'reviewComments', label: '已拒绝评论', icon: '🗨️' },
  { id: 'reviewMessages', label: '被拒绝私信', icon: '📨' },
  { id: 'coreMemories', label: '官方事实', icon: '📚' },
  { id: 'lotteries', label: '抽奖管理', icon: '🎲' },
  { id: 'lotteryEntries', label: '抽奖报名', icon: '🧾' },
  { id: 'lotteryDrawLogs', label: '开奖日志', icon: '🏆' },
  { id: 'lotterySchedulerLogs', label: '开奖调度', icon: '⏱️' },
  { id: 'lotteryNotificationJobs', label: '中奖通知', icon: '📣' },
  { id: 'lotteryJoinAttempts', label: '报名风控', icon: '🛡️' },
  { id: 'news', label: '新闻管理', icon: '📰' },
  { id: 'activities', label: '活动管理', icon: '🎉' },
  { id: 'products', label: '商品管理', icon: '🎁' }
];

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
  { value: 'birthday-party', label: '方块生日会' },
  { value: 'gift-custom', label: '礼物定制' },
  { value: 'boh-ai-plus', label: 'BOH Plus' },
  { value: 'boh-pro', label: 'BOH Pro' },
  { value: 'boh-max', label: 'BOH Max' }
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

export const TABS_KEEP_ID_ON_INSERT = new Set(['news', 'activities', 'products']);
export const PRODUCTS_CACHE_KEY = 'boh_products_cache_v1';

export const invalidateProductsCache = () => {
  try {
    localStorage.removeItem(PRODUCTS_CACHE_KEY);
  } catch (error) {
    console.warn('清理商品缓存失败:', error);
  }
};

export const TAB_WRITABLE_FIELDS = {
  users: ['username', 'email', 'role', 'points', 'experience', 'join_date', 'bio', 'avatar_url', 'tags'],
  points: ['role', 'points', 'experience', 'join_date'],
  subscriptions: ['user_id', 'plan_code', 'plan_name', 'billing_cycle', 'points_cost', 'duration_months', 'started_at', 'expires_at', 'status', 'metadata', 'updated_at'],
  gifts: ['user_id', 'gift_no', 'gift_content', 'gift_price', 'gift_image', 'gift_status', 'is_active', 'completed_at', 'updated_at'],
  forum: ['content', 'author_id', 'author_username', 'status', 'updated_at'],
  coreMemories: ['title', 'content', 'category', 'tags', 'priority', 'source_label', 'source_url', 'status', 'updated_by'],
  lotteries: ['title', 'description', 'prize_title', 'prize_description', 'cover_image_url', 'status', 'is_community_visible', 'max_entries', 'winner_count', 'entry_deadline_at', 'draw_at', 'fulfillment_status', 'created_by', 'updated_by'],
  news: ['id', 'category', 'title', 'excerpt', 'content', 'date', 'author', 'image'],
  activities: ['id', 'title', 'date', 'image', 'description'],
  products: ['id', 'title', 'category', 'description', 'points_cost', 'stock', 'image', 'specifications']
};

// ==================== 数据配置 ====================
export const dataConfig = {
  users: {
    table: 'profiles',
    columns: [
      { key: 'id', label: 'ID', maxLength: 12 },
      { key: 'username', label: '用户名' },
      { key: 'email', label: '邮箱' },
      { key: 'role', label: '角色', type: 'badge' },
      { key: 'points', label: '积分', type: 'number' },
      { key: 'created_at', label: '注册时间', type: 'date' }
    ],
    fields: [
      { key: 'id', label: '用户ID', type: 'text', disabled: true, hint: 'UUID 主键由系统生成，不可手动修改。' },
      { key: 'username', label: '用户名', type: 'text', required: true, maxLength: 32 },
      { key: 'email', label: '邮箱', type: 'email', maxLength: 100, placeholder: 'example@domain.com' },
      { key: 'role', label: '角色', type: 'select', options: USER_ROLE_OPTIONS },
      { key: 'points', label: '积分', type: 'number', min: 0 },
      { key: 'experience', label: '经验值', type: 'number', min: 0 },
      { key: 'join_date', label: '加群时间', type: 'date' },
      { key: 'bio', label: '简介', type: 'textarea' },
      { key: 'avatar_url', label: '头像URL', type: 'text' },
      { key: 'tags', label: '标签', type: 'tags' }
    ]
  },
  points: {
    table: 'profiles',
    columns: [
      { key: 'id', label: 'ID', maxLength: 12 },
      { key: 'username', label: '用户名' },
      { key: 'role', label: '角色', type: 'badge' },
      { key: 'points', label: '当前积分', type: 'number' },
      { key: 'experience', label: '经验值', type: 'number' },
      { key: 'join_date', label: '加群时间', type: 'date' }
    ],
    fields: [
      { key: 'id', label: '用户ID', type: 'text', disabled: true, hint: 'UUID 主键不可编辑。' },
      { key: 'username', label: '用户名', type: 'text', disabled: true },
      { key: 'points', label: '当前积分', type: 'number', required: true, min: 0 },
      { key: 'experience', label: '经验值', type: 'number', min: 0 },
      { key: 'role', label: '角色', type: 'select', options: USER_ROLE_OPTIONS },
      { key: 'join_date', label: '加群时间', type: 'date' }
    ]
  },
  subscriptions: {
    table: 'user_subscriptions',
    columns: [
      { key: 'id', label: 'ID', maxLength: 12 },
      { key: 'username', label: '用户名' },
      { key: 'email', label: '邮箱', maxLength: 22 },
      { key: 'plan_name', label: '订阅内容' },
      { key: 'plan_code', label: '方案代码', maxLength: 16 },
      { key: 'billing_cycle', label: '周期', type: 'badge' },
      { key: 'status', label: '状态', type: 'badge' },
      { key: 'started_at', label: '订阅时间', type: 'datetime' },
      { key: 'expires_at', label: '到期时间', type: 'datetime' },
      { key: 'points_cost', label: '积分成本', type: 'number' }
    ],
    fields: [
      { key: 'id', label: '订阅ID', type: 'text', disabled: true, hint: 'UUID 主键由系统生成，不可手动修改。' },
      { key: 'user_id', label: '订阅用户', type: 'user-picker', required: true },
      { key: 'username', label: '用户名', type: 'text', disabled: true },
      { key: 'email', label: '邮箱', type: 'text', disabled: true },
      { key: 'plan_code', label: '订阅内容', type: 'select', required: true, options: SUBSCRIPTION_PLAN_OPTIONS },
      { key: 'plan_name', label: '订阅名称', type: 'text', required: true, hint: '切换订阅内容后会自动填入，可按需改显示名。' },
      { key: 'billing_cycle', label: '订阅周期', type: 'select', required: true, options: SUBSCRIPTION_BILLING_OPTIONS },
      { key: 'points_cost', label: '积分成本', type: 'number', required: true, min: 0 },
      { key: 'duration_months', label: '订阅月数', type: 'number', required: true, min: 1, max: 120 },
      { key: 'started_at', label: '订阅时间', type: 'datetime', required: true },
      { key: 'expires_at', label: '到期时间', type: 'datetime', required: true },
      { key: 'status', label: '订阅状态', type: 'select', required: true, options: SUBSCRIPTION_STATUS_OPTIONS },
      { key: 'metadata', label: '附加信息', type: 'json' }
    ]
  },
  gifts: {
    table: 'user_gifts',
    columns: [
      { key: 'id', label: 'ID', maxLength: 12 },
      { key: 'gift_scope_label', label: '礼物类型', type: 'badge' },
      { key: 'username', label: '用户名' },
      { key: 'shipping_recipient', label: '收件人' },
      { key: 'shipping_phone', label: '联系电话' },
      { key: 'shipping_address', label: '收货地址', maxLength: 24 },
      { key: 'created_at', label: '创建时间', type: 'datetime' },
      { key: 'completed_at', label: '完成日期', type: 'datetime' },
      { key: 'gift_status', label: '礼物状态', type: 'badge' },
      { key: 'gift_content', label: '礼物内容', maxLength: 20 },
      { key: 'gift_no', label: '快递单号', maxLength: 18 },
      { key: 'gift_price', label: '礼物金额', type: 'price' }
    ],
    fields: [
      { key: 'id', label: '礼物ID', type: 'text', disabled: true },
      { key: 'user_id', label: '用户', type: 'user-picker', required: true },
      { key: 'username', label: '用户名', type: 'text', disabled: true },
      { key: 'shipping_recipient', label: '收件人', type: 'text', disabled: true },
      { key: 'shipping_phone', label: '联系电话', type: 'text', disabled: true },
      { key: 'shipping_address', label: '收货地址', type: 'textarea', disabled: true },
      {
        key: 'gift_status', label: '礼物状态', type: 'select', options: [
          { value: 'preparing', label: '准备中' },
          { value: 'processing', label: '处理中' },
          { value: 'shipped', label: '已发货' },
          { value: 'completed', label: '已完成' }
        ]
      },
      { key: 'gift_content', label: '礼物内容', type: 'text' },
      { key: 'gift_no', label: '快递单号', type: 'text' },
      { key: 'gift_price', label: '礼物金额', type: 'number' },
      { key: 'gift_image', label: '礼物图片', type: 'text' },
      { key: 'is_active', label: '是否当前礼物', type: 'select', options: [
        { value: true, label: '当前礼物' },
        { value: false, label: '历史礼物' }
      ] },
      { key: 'completed_at', label: '完成日期', type: 'datetime', placeholder: '可自定义完成日期' }
    ]
  },
  forum: {
    table: 'posts',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'title', label: '标题', maxLength: 30 },
      { key: 'author_username', label: '作者' },
      { key: 'status', label: '状态', type: 'badge' },
      { key: 'likes_count', label: '点赞', type: 'number' },
      { key: 'created_at', label: '发布时间', type: 'date' }
    ],
    fields: [
      { key: 'id', label: '帖子ID', type: 'text', disabled: true },
      { key: 'title', label: '标题', type: 'text', required: true },
      { key: 'content', label: '正文', type: 'textarea', required: true, rows: 8, placeholder: '仅填写正文，保存时会自动组合标题。' },
      { key: 'author_id', label: '作者ID', type: 'text', placeholder: 'UUID，可留空' },
      { key: 'author_username', label: '作者用户名', type: 'text' },
      { key: 'status', label: '帖子状态', type: 'select', options: FORUM_STATUS_OPTIONS }
    ]
  },
  reviewPosts: {
    table: 'posts',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'author_username', label: '作者' },
      { key: 'content', label: '内容', maxLength: 48 },
      { key: 'status', label: '状态', type: 'badge' },
      { key: 'created_at', label: '发布时间', type: 'date' }
    ],
    fields: []
  },
  reportedPosts: {
    table: 'posts',
    columns: [
      { key: 'id', label: 'ID', maxLength: 12 },
      { key: 'title', label: '标题', maxLength: 28 },
      { key: 'author_username', label: '作者' },
      { key: 'active_report_count', label: '举报数', type: 'number' },
      { key: 'report_reasons', label: '举报原因', type: 'tags' },
      { key: 'status', label: '状态', type: 'badge' },
      { key: 'latest_report_at', label: '最近举报', type: 'datetime' },
      { key: 'created_at', label: '发布时间', type: 'date' },
      { key: 'content', label: '内容', maxLength: 48 }
    ],
    fields: []
  },
  reviewComments: {
    table: 'comments',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'post_id', label: '帖子ID', maxLength: 12 },
      { key: 'author_username', label: '作者' },
      { key: 'content', label: '内容', maxLength: 48 },
      { key: 'status', label: '状态', type: 'badge' },
      { key: 'created_at', label: '发布时间', type: 'date' }
    ],
    fields: []
  },
  reviewMessages: {
    table: 'messages',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'sender_name', label: '发件人' },
      { key: 'receiver_name', label: '收件人' },
      { key: 'subject', label: '主题', maxLength: 24 },
      { key: 'content', label: '内容', maxLength: 48 },
      { key: 'moderation_status', label: '审核状态', type: 'badge' },
      { key: 'moderation_reason', label: '原因', maxLength: 32 },
      { key: 'created_at', label: '发送时间', type: 'date' }
    ],
    fields: []
  },
  coreMemories: {
    table: 'boh_ai_core_memories',
    columns: [
      { key: 'id', label: 'ID', maxLength: 12 },
      { key: 'title', label: '标题', maxLength: 32 },
      { key: 'category', label: '分类', type: 'badge' },
      { key: 'priority', label: '优先级', type: 'number' },
      { key: 'status', label: '状态', type: 'badge' },
      { key: 'updated_at', label: '更新时间', type: 'datetime' },
      { key: 'content', label: '内容', maxLength: 60 }
    ],
    fields: [
      { key: 'id', label: '事实ID', type: 'text', disabled: true, hint: 'UUID 主键由系统生成，不可手动修改。' },
      { key: 'title', label: '标题', type: 'text', required: true, maxLength: 160, placeholder: '例如：方块之家社区起源' },
      { key: 'category', label: '分类', type: 'select', required: true, options: CORE_MEMORY_CATEGORY_OPTIONS },
      { key: 'status', label: '状态', type: 'select', required: true, options: CORE_MEMORY_STATUS_OPTIONS },
      { key: 'priority', label: '优先级', type: 'number', required: true, min: 0, max: 100, hint: '0-100，越高越优先进入检索候选。' },
      { key: 'source_label', label: '来源名称', type: 'text', maxLength: 120, placeholder: '例如：BOH 官方 / 周年资料 / 管理员整理' },
      { key: 'source_url', label: '来源链接', type: 'text', maxLength: 600, placeholder: '可留空，建议填写可核验资料链接。' },
      { key: 'tags', label: '标签', type: 'tags', hint: '用于检索召回，例如：起源、Ryyik、周年庆。' },
      { key: 'content', label: '官方事实内容', type: 'textarea', required: true, rows: 10, maxLength: 12000, placeholder: '写确定、可复用的官方事实。避免把用户主观回忆混入这里。' }
    ]
  },
  lotteries: {
    table: 'lotteries',
    columns: [
      { key: 'id', label: 'ID', maxLength: 12 },
      { key: 'title', label: '抽奖标题', maxLength: 28 },
      { key: 'prize_title', label: '奖品', maxLength: 24 },
      { key: 'status', label: '状态', type: 'badge' },
      { key: 'fulfillment_status', label: '处理状态', type: 'badge' },
      { key: 'is_community_visible_label', label: '社区展示', type: 'badge' },
      { key: 'entry_count', label: '报名人数', type: 'number' },
      { key: 'max_entries_label', label: '人数上限' },
      { key: 'winner_count', label: '中奖人数', type: 'number' },
      { key: 'entry_deadline_at', label: '报名截止', type: 'datetime' },
      { key: 'draw_at', label: '计划开奖', type: 'datetime' },
      { key: 'drawn_at', label: '实际开奖', type: 'datetime' },
      { key: 'draw_delay_label', label: '开奖延迟', type: 'badge' },
      { key: 'draw_entry_count_snapshot', label: '开奖人数快照', type: 'number' },
      { key: 'winner_username', label: '首位中奖者', maxLength: 18 },
      { key: 'created_at', label: '创建时间', type: 'datetime' }
    ],
    fields: [
      { key: 'id', label: '抽奖ID', type: 'text', disabled: true, hint: 'UUID 主键由系统生成，不可手动修改。' },
      { key: 'title', label: '抽奖标题', type: 'text', required: true, maxLength: 120, placeholder: '例如：八周年纪念抽奖' },
      { key: 'description', label: '抽奖说明', type: 'textarea', rows: 4, maxLength: 1200, placeholder: '写给社区抽奖页和首页映射模块看的活动说明。' },
      { key: 'prize_title', label: '奖品名称', type: 'text', required: true, maxLength: 120, placeholder: '例如：BOH 纪念礼盒' },
      { key: 'prize_description', label: '奖品说明', type: 'textarea', rows: 3, maxLength: 800, placeholder: '可写规格、数量、发放方式等。' },
      { key: 'cover_image_url', label: '抽奖封面', type: 'image', placeholder: '上传后自动填入，也可以粘贴 https:// 图片链接' },
      { key: 'status', label: '抽奖状态', type: 'select', required: true, options: LOTTERY_STATUS_OPTIONS },
      { key: 'fulfillment_status', label: '中奖处理状态', type: 'select', required: true, options: LOTTERY_FULFILLMENT_STATUS_OPTIONS, hint: '开奖后用于跟踪联系、确认和发放进度。' },
      { key: 'is_community_visible', label: '前台展示', type: 'select', required: true, options: LOTTERY_COMMUNITY_VISIBLE_OPTIONS, hint: '首页会自动映射社区抽奖页中最新一条报名中的抽奖；关闭后不会出现在首页、社区抽奖页或历史抽奖。' },
      { key: 'max_entries', label: '报名人数上限', type: 'number', min: 1, placeholder: '留空表示不限制', hint: '不填写即不限人数。' },
      { key: 'winner_count', label: '中奖人数', type: 'number', required: true, min: 1, placeholder: '默认 1', hint: '开奖时会从报名名单中随机抽取这么多名中奖用户。' },
      { key: 'entry_deadline_at', label: '报名截止时间', type: 'datetime', hint: '到达该时间后用户不能再报名；留空表示报名直到开奖前。报名截止时间必须早于或等于自动开奖时间。' },
      { key: 'draw_at', label: '自动开奖时间', type: 'datetime', hint: '到达该时间后，数据库定时任务会自动随机开奖；用户打开抽奖页或报名时也会兜底触发。' },
      { key: 'drawn_at', label: '实际开奖时间', type: 'datetime', disabled: true },
      { key: 'draw_attempted_at', label: '最近开奖尝试', type: 'datetime', disabled: true },
      { key: 'draw_failed_at', label: '最近失败时间', type: 'datetime', disabled: true },
      { key: 'draw_failure_message', label: '失败原因', type: 'textarea', disabled: true },
      { key: 'draw_candidate_hash', label: '候选名单 Hash', type: 'text', disabled: true, hint: '开奖时按报名名单生成的 MD5 摘要，用于事后审计候选池是否变化。' },
      { key: 'draw_algorithm_version', label: '随机算法版本', type: 'text', disabled: true },
      { key: 'winner_username', label: '首位中奖者', type: 'text', disabled: true }
    ]
  },
  lotteryEntries: {
    table: 'lottery_entries',
    columns: [
      { key: 'lottery_title', label: '抽奖', maxLength: 28 },
      { key: 'username', label: '报名用户' },
      { key: 'user_id', label: '用户ID', maxLength: 12 },
      { key: 'user_created_at', label: '加入日期', type: 'date' },
      { key: 'entry_number', label: '报名序号', type: 'number' },
      { key: 'created_at', label: '报名时间', type: 'datetime' },
      { key: 'lottery_id', label: '抽奖ID', maxLength: 12 }
    ],
    fields: []
  },
  lotteryDrawLogs: {
    table: 'lottery_draw_logs',
    columns: [
      { key: 'lottery_title', label: '抽奖', maxLength: 28 },
      { key: 'draw_no', label: '开奖次数', type: 'number' },
      { key: 'winner_position', label: '中奖序号', type: 'number' },
      { key: 'username_snapshot', label: '中奖用户' },
      { key: 'user_id', label: '用户ID', maxLength: 12 },
      { key: 'drawn_by_username', label: '操作人' },
      { key: 'reason', label: '原因', maxLength: 28 },
      { key: 'created_at', label: '开奖时间', type: 'datetime' },
      { key: 'lottery_id', label: '抽奖ID', maxLength: 12 }
    ],
    fields: []
  },
  lotterySchedulerLogs: {
    table: 'lottery_scheduler_logs',
    columns: [
      { key: 'started_at', label: '开始时间', type: 'datetime' },
      { key: 'finished_at', label: '结束时间', type: 'datetime' },
      { key: 'status', label: '状态', type: 'badge' },
      { key: 'run_source_label', label: '来源', type: 'badge' },
      { key: 'due_count', label: '到期数', type: 'number' },
      { key: 'checked_count', label: '扫描数', type: 'number' },
      { key: 'drawn_count', label: '开奖数', type: 'number' },
      { key: 'failed_count', label: '失败数', type: 'number' },
      { key: 'duration_label', label: '耗时' },
      { key: 'error_message', label: '错误', maxLength: 36 }
    ],
    fields: []
  },
  lotteryNotificationJobs: {
    table: 'lottery_notification_jobs',
    columns: [
      { key: 'created_at', label: '创建时间', type: 'datetime' },
      { key: 'lottery_title', label: '抽奖', maxLength: 28 },
      { key: 'username', label: '中奖用户' },
      { key: 'draw_no', label: '开奖次数', type: 'number' },
      { key: 'winner_position', label: '中奖序号', type: 'number' },
      { key: 'status', label: '状态', type: 'badge' },
      { key: 'attempt_count', label: '尝试次数', type: 'number' },
      { key: 'last_error', label: '错误', maxLength: 36 }
    ],
    fields: []
  },
  lotteryJoinAttempts: {
    table: 'lottery_join_attempts',
    columns: [
      { key: 'lottery_title', label: '抽奖', maxLength: 28 },
      { key: 'username', label: '用户' },
      { key: 'user_id', label: '用户ID', maxLength: 12 },
      { key: 'result_code', label: '结果', type: 'badge' },
      { key: 'message', label: '说明', maxLength: 36 },
      { key: 'created_at', label: '请求时间', type: 'datetime' },
      { key: 'lottery_id', label: '抽奖ID', maxLength: 12 }
    ],
    fields: []
  },
  news: {
    table: 'news',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'title', label: '标题', maxLength: 25 },
      { key: 'category', label: '分类', type: 'badge' },
      { key: 'author', label: '作者' },
      { key: 'date', label: '日期', type: 'date' }
    ],
    fields: [
      { key: 'id', label: 'ID', type: 'number', disabled: true, hint: '新增新闻时自动生成，可点击上方按钮重新生成。' },
      {
        key: 'category',
        label: '分类',
        type: 'select',
        required: true,
        options: NEWS_CATEGORY_OPTIONS,
        hint: '必须使用系统内置分类，避免保存时报约束错误。'
      },
      { key: 'title', label: '标题', type: 'text', required: true, placeholder: '例如：春季活动正式开启' },
      { key: 'date', label: '发布日期', type: 'date', required: true },
      { key: 'author', label: '作者', type: 'text', required: true, placeholder: '例如：Ryyik' },
      { key: 'excerpt', label: '摘要', type: 'textarea', required: true, rows: 3, placeholder: '用 1-2 句话写新闻列表预览，建议 30-80 字。' },
      { key: 'content', label: '正文内容', type: 'textarea', required: true, rows: 9, placeholder: '直接写正文即可。空行会分段，以“- ”开头会自动变成列表。' },
      { key: 'image', label: '封面图', type: 'image', placeholder: '上传后自动填入，也可以粘贴 https:// 图片链接', hint: '推荐使用“上传到 Cloud”，也支持 @/assets 路径或远程图片地址。' }
    ]
  },
  activities: {
    table: 'activities',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'title', label: '标题', maxLength: 25 },
      { key: 'date', label: '日期', type: 'date' },
      { key: 'created_at', label: '创建时间', type: 'date' }
    ],
    fields: [
      { key: 'id', label: 'ID', type: 'number', disabled: true, hint: '新增活动自动生成 ID。' },
      { key: 'title', label: '标题', type: 'text', required: true, maxLength: 255 },
      { key: 'date', label: '日期', type: 'date', required: true },
      { key: 'description', label: '描述', type: 'textarea', placeholder: '直接写活动介绍，不需要填写任何代码。' },
      { key: 'image', label: '活动图', type: 'image', placeholder: '上传后自动填入，也可以粘贴 https:// 图片链接', hint: '推荐使用“上传到 Cloud”。' }
    ]
  },
  products: {
    table: 'products',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'image', label: '图片', type: 'image' },
      { key: 'title', label: '商品名称', maxLength: 25 },
      { key: 'category', label: '分类', type: 'badge' },
      { key: 'points_cost', label: '积分定价', type: 'number' },
      { key: 'stock', label: '库存', type: 'number' }
    ],
    fields: [
      { key: 'id', label: '商品ID', type: 'number', disabled: true, hint: '新增商品自动生成 ID。' },
      { key: 'title', label: '商品名称', type: 'text', required: true },
      { key: 'category', label: '分类', type: 'select', required: true, options: PRODUCT_CATEGORY_OPTIONS },
      { key: 'description', label: '商品描述', type: 'textarea', placeholder: '直接写给用户看的商品介绍。' },
      { key: 'points_cost', label: '积分定价', type: 'number', placeholder: '例如：40', required: true, min: 0 },
      { key: 'stock', label: '库存', type: 'number', required: true, min: 0 },
      { key: 'image', label: '商品图片', type: 'image', placeholder: '上传后自动填入，也可以粘贴 https:// 图片链接', hint: '推荐使用“上传到 Cloud”。' },
      { key: 'specifications', label: '规格选项', type: 'specifications' }
    ]
  }
};
