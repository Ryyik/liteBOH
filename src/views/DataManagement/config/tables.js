import { logger } from '../../../utils/logger';
import {
  USER_ROLE_OPTIONS,
  FORUM_STATUS_OPTIONS,
  PRODUCT_CATEGORY_OPTIONS,
  SUBSCRIPTION_PLAN_OPTIONS,
  SUBSCRIPTION_BILLING_OPTIONS,
  SUBSCRIPTION_STATUS_OPTIONS,
  CORE_MEMORY_CATEGORY_OPTIONS,
  CORE_MEMORY_STATUS_OPTIONS,
  BOHAI_MODEL_PROVIDER_OPTIONS,
  BOHAI_MODEL_CAPABILITY_OPTIONS,
  BOHAI_MODEL_STATUS_OPTIONS,
  BOHAI_MODEL_ICON_OPTIONS,
  LOTTERY_STATUS_OPTIONS,
  LOTTERY_COMMUNITY_VISIBLE_OPTIONS,
  LOTTERY_FULFILLMENT_STATUS_OPTIONS,
  NEWS_CATEGORY_OPTIONS
} from './fields.js';

export const PRODUCTS_CACHE_KEY = 'boh_products_cache_v1';

export const invalidateProductsCache = () => {
  try {
    localStorage.removeItem(PRODUCTS_CACHE_KEY);
  } catch (error) {
    logger.warn('DataConfig', '清理商品缓存失败:', error);
  }
};

export const dataConfig = {
  users: {
    table: 'profiles',
    columns: [
      { key: 'id', label: 'ID', maxLength: 24 },
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
      { key: 'id', label: 'ID', maxLength: 24 },
      { key: 'username', label: '用户名' },
      { key: 'role', label: '角色', type: 'badge' },
      { key: 'points', label: '当前积分', type: 'number' },
      { key: 'experience', label: '经验值', type: 'number' },
      { key: 'join_date', label: '加群时间', type: 'date' }
    ],
    fields: [
      { key: 'id', label: '用户ID', type: 'text', disabled: true, hint: 'UUID 主键不可编辑。', group: 'basic' },
      { key: 'username', label: '用户名', type: 'text', disabled: true, group: 'basic' },
      { key: 'points', label: '当前积分', type: 'number', required: true, min: 0, group: 'stats' },
      { key: 'experience', label: '经验值', type: 'number', min: 0, group: 'stats' },
      { key: 'role', label: '角色', type: 'select', options: USER_ROLE_OPTIONS, group: 'basic' },
      { key: 'join_date', label: '加群时间', type: 'date', group: 'time' }
    ]
  },
  subscriptions: {
    table: 'user_subscriptions',
    columns: [
      { key: 'id', label: 'ID', maxLength: 24 },
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
      { key: 'id', label: '订阅ID', type: 'text', disabled: true, hint: 'UUID 主键由系统生成，不可手动修改。', group: 'basic' },
      { key: 'user_id', label: '订阅用户', type: 'user-picker', required: true, group: 'user' },
      { key: 'username', label: '用户名', type: 'text', disabled: true, group: 'user' },
      { key: 'email', label: '邮箱', type: 'text', disabled: true, group: 'user' },
      { key: 'plan_code', label: '订阅内容', type: 'select', required: true, options: SUBSCRIPTION_PLAN_OPTIONS, group: 'plan' },
      { key: 'plan_name', label: '订阅名称', type: 'text', required: true, hint: '切换订阅内容后会自动填入，可按需改显示名。', group: 'plan' },
      { key: 'billing_cycle', label: '订阅周期', type: 'select', required: true, options: SUBSCRIPTION_BILLING_OPTIONS, group: 'plan' },
      { key: 'points_cost', label: '积分成本', type: 'number', required: true, min: 0, group: 'plan' },
      { key: 'duration_months', label: '订阅月数', type: 'number', required: true, min: 1, max: 120, group: 'plan' },
      { key: 'started_at', label: '订阅时间', type: 'datetime', required: true, group: 'time' },
      { key: 'expires_at', label: '到期时间', type: 'datetime', required: true, group: 'time' },
      { key: 'status', label: '订阅状态', type: 'select', required: true, options: SUBSCRIPTION_STATUS_OPTIONS, group: 'time' },
      { key: 'metadata', label: '附加信息', type: 'json', group: 'extra' }
    ]
  },
  gifts: {
    table: 'user_gifts',
    columns: [
      { key: 'gift_scope_label', label: '礼物类型', type: 'badge' },
      { key: 'username', label: '用户名' },
      { key: 'shipping_recipient', label: '收件人' },
      { key: 'shipping_address', label: '收货地址', maxLength: 24 },
      { key: 'gift_status', label: '礼物状态', type: 'badge' },
      { key: 'gift_content', label: '礼物内容', maxLength: 20 },
      { key: 'gift_no', label: '快递单号', maxLength: 18 },
      { key: 'gift_price', label: '礼物金额', type: 'price' },
      { key: 'created_at', label: '创建时间', type: 'datetime' },
      { key: 'completed_at', label: '完成日期', type: 'datetime' }
    ],
    fields: [
      { key: 'id', label: '礼物ID', type: 'text', disabled: true, group: 'detail' },
      { key: 'user_id', label: '用户', type: 'user-picker', required: true, group: 'user' },
      { key: 'username', label: '用户名', type: 'text', disabled: true, group: 'user' },
      { key: 'shipping_recipient', label: '收件人', type: 'text', disabled: true, group: 'user' },
      { key: 'shipping_phone', label: '联系电话', type: 'text', disabled: true, group: 'user' },
      { key: 'shipping_address', label: '收货地址', type: 'textarea', disabled: true, group: 'user' },
      {
        key: 'gift_status', label: '礼物状态', type: 'select', options: [
          { value: 'preparing', label: '准备中' },
          { value: 'processing', label: '处理中' },
          { value: 'shipped', label: '已发货' },
          { value: 'completed', label: '已完成' }
        ], group: 'time'
      },
      { key: 'gift_content', label: '礼物内容', type: 'text', group: 'detail' },
      { key: 'gift_no', label: '快递单号', type: 'text', group: 'detail' },
      { key: 'gift_price', label: '礼物金额', type: 'number', group: 'detail' },
      { key: 'gift_image', label: '礼物图片', type: 'text', group: 'detail' },
      { key: 'is_active', label: '是否当前礼物', type: 'select', options: [
        { value: true, label: '当前礼物' },
        { value: false, label: '历史礼物' }
      ], group: 'time' },
      { key: 'completed_at', label: '完成日期', type: 'datetime', placeholder: '可自定义完成日期', group: 'time' }
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
      { key: 'id', label: '帖子ID', type: 'text', disabled: true, group: 'meta' },
      { key: 'title', label: '标题', type: 'text', required: true, group: 'content' },
      { key: 'content', label: '正文', type: 'textarea', required: true, rows: 8, placeholder: '仅填写正文，保存时会自动组合标题。', group: 'content' },
      { key: 'author_id', label: '作者ID', type: 'text', placeholder: 'UUID，可留空', group: 'meta' },
      { key: 'author_username', label: '作者用户名', type: 'text', group: 'meta' },
      { key: 'status', label: '帖子状态', type: 'select', options: FORUM_STATUS_OPTIONS, group: 'meta' }
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
      { key: 'id', label: 'ID', maxLength: 24 },
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
      { key: 'post_id', label: '帖子ID', maxLength: 24 },
      { key: 'author_username', label: '作者' },
      { key: 'content', label: '内容', maxLength: 48 },
      { key: 'status', label: '状态', type: 'badge' },
      { key: 'created_at', label: '发布时间', type: 'date' }
    ],
    fields: []
  },
  coreMemories: {
    table: 'boh_ai_core_memories',
    columns: [
      { key: 'id', label: 'ID', maxLength: 24 },
      { key: 'title', label: '标题', maxLength: 32 },
      { key: 'category', label: '分类', type: 'badge' },
      { key: 'priority', label: '优先级', type: 'number' },
      { key: 'status', label: '状态', type: 'badge' },
      { key: 'updated_at', label: '更新时间', type: 'datetime' },
      { key: 'content', label: '内容', maxLength: 60 }
    ],
    fields: [
      { key: 'id', label: '事实ID', type: 'text', disabled: true, hint: 'UUID 主键由系统生成，不可手动修改。', group: 'basic' },
      { key: 'title', label: '标题', type: 'text', required: true, maxLength: 160, placeholder: '例如：方块之家社区起源', group: 'basic' },
      { key: 'category', label: '分类', type: 'select', required: true, options: CORE_MEMORY_CATEGORY_OPTIONS, group: 'source' },
      { key: 'status', label: '状态', type: 'select', required: true, options: CORE_MEMORY_STATUS_OPTIONS, group: 'source' },
      { key: 'priority', label: '优先级', type: 'number', required: true, min: 0, max: 100, hint: '0-100，越高越优先进入检索候选。', group: 'source' },
      { key: 'source_label', label: '来源名称', type: 'text', maxLength: 120, placeholder: '例如：BOH 官方 / 周年资料 / 管理员整理', group: 'source' },
      { key: 'source_url', label: '来源链接', type: 'text', maxLength: 600, placeholder: '可留空，建议填写可核验资料链接。', group: 'source' },
      { key: 'tags', label: '标签', type: 'tags', hint: '用于检索召回，例如：起源、Ryyik、周年庆。', group: 'source' },
      { key: 'content', label: '官方事实内容', type: 'textarea', required: true, rows: 10, maxLength: 12000, placeholder: '写确定、可复用的官方事实。避免把用户主观回忆混入这里。', group: 'content' }
    ]
  },
  bohaiModels: {
    table: 'bohai_model_configs',
    columns: [
      { key: 'sort_order', label: '排序', type: 'number' },
      { key: 'display_name', label: '模式名', maxLength: 18 },
      { key: 'mode_id', label: '模式ID', maxLength: 18 },
      { key: 'provider_label', label: '供应商', type: 'badge' },
      { key: 'model_id', label: '模型ID', maxLength: 30 },
      { key: 'capability', label: '能力', type: 'badge' },
      { key: 'status', label: '状态', type: 'badge' },
      { key: 'temperature', label: '温度', type: 'number' },
      { key: 'max_tokens', label: '输出上限', type: 'number' },
      { key: 'updated_at', label: '更新时间', type: 'datetime' }
    ],
    fields: [
      { key: 'id', label: '配置ID', type: 'text', disabled: true, hint: 'UUID 主键由系统生成，不可手动修改。', group: 'basic' },
      { key: 'mode_id', label: '模式ID', type: 'text', required: true, maxLength: 64, placeholder: '例如：fast / pro / multimodal / plan / agent-cluster', group: 'basic' },
      { key: 'display_name', label: '显示名称', type: 'text', required: true, maxLength: 40, placeholder: '例如：Fast', group: 'basic' },
      { key: 'tagline', label: '短说明', type: 'text', maxLength: 120, placeholder: '显示在 BOHAI 模式菜单里的简短说明。', group: 'basic' },
      { key: 'description', label: '详细说明', type: 'textarea', rows: 3, maxLength: 500, group: 'basic' },
      { key: 'provider', label: '供应商标识', type: 'select', required: true, options: BOHAI_MODEL_PROVIDER_OPTIONS, group: 'provider' },
      { key: 'provider_label', label: '供应商显示名', type: 'text', maxLength: 80, placeholder: '例如：智谱 AI / SiliconFlow', group: 'provider' },
      { key: 'model_id', label: '模型ID', type: 'text', required: true, maxLength: 160, placeholder: '例如：glm-4.6v-flash', group: 'provider' },
      { key: 'api_url', label: '接口地址', type: 'text', maxLength: 600, placeholder: '留空会按供应商自动填默认地址。', group: 'provider' },
      { key: 'capability', label: '能力类型', type: 'select', required: true, options: BOHAI_MODEL_CAPABILITY_OPTIONS, group: 'provider' },
      { key: 'icon', label: '图标', type: 'select', required: true, options: BOHAI_MODEL_ICON_OPTIONS, group: 'basic' },
      { key: 'temperature', label: 'Temperature', type: 'number', min: 0, max: 1.2, required: true, group: 'params' },
      { key: 'top_p', label: 'Top P', type: 'number', min: 0.1, max: 1, required: true, group: 'params' },
      { key: 'frequency_penalty', label: 'Frequency Penalty', type: 'number', min: 0, max: 2, required: true, group: 'params' },
      { key: 'max_tokens', label: '最大输出 tokens', type: 'number', min: 256, max: 4096, required: true, group: 'params' },
      { key: 'sort_order', label: '显示排序', type: 'number', min: 0, max: 10000, required: true, group: 'extra' },
      { key: 'status', label: '状态', type: 'select', required: true, options: BOHAI_MODEL_STATUS_OPTIONS, group: 'extra' },
      { key: 'notes', label: '管理员备注', type: 'textarea', rows: 3, maxLength: 1000, group: 'extra' }
    ]
  },
  lotteries: {
    table: 'lotteries',
    columns: [
      { key: 'title', label: '抽奖标题', maxLength: 28 },
      { key: 'prize_title', label: '奖品', maxLength: 24 },
      { key: 'status', label: '状态', type: 'badge' },
      { key: 'fulfillment_status', label: '处理状态', type: 'badge' },
      { key: 'entry_count', label: '报名人数', type: 'number' },
      { key: 'max_entries_label', label: '人数上限' },
      { key: 'winner_count', label: '中奖人数', type: 'number' },
      { key: 'winner_username', label: '中奖者', maxLength: 18 },
      { key: 'entry_deadline_at', label: '报名截止', type: 'datetime' },
      { key: 'draw_at', label: '计划开奖', type: 'datetime' },
      { key: 'drawn_at', label: '实际开奖', type: 'datetime' },
      { key: 'created_at', label: '创建时间', type: 'datetime' }
    ],
    fields: [
      { key: 'id', label: '抽奖ID', type: 'text', disabled: true, hint: 'UUID 主键由系统生成，不可手动修改。', group: 'basic' },
      { key: 'title', label: '抽奖标题', type: 'text', required: true, maxLength: 120, placeholder: '例如：八周年纪念抽奖', group: 'basic' },
      { key: 'description', label: '抽奖说明', type: 'textarea', rows: 4, maxLength: 1200, placeholder: '写给社区抽奖页和首页映射模块看的活动说明。', group: 'prize' },
      { key: 'prize_title', label: '奖品名称', type: 'text', required: true, maxLength: 120, placeholder: '例如：BOH 纪念礼盒', group: 'prize' },
      { key: 'prize_description', label: '奖品说明', type: 'textarea', rows: 3, maxLength: 800, placeholder: '可写规格、数量、发放方式等。', group: 'prize' },
      { key: 'cover_image_url', label: '抽奖封面', type: 'image', placeholder: '上传后自动填入，也可以粘贴 https:// 图片链接', group: 'prize' },
      { key: 'status', label: '抽奖状态', type: 'select', required: true, options: LOTTERY_STATUS_OPTIONS, group: 'rule' },
      { key: 'fulfillment_status', label: '中奖处理状态', type: 'select', required: true, options: LOTTERY_FULFILLMENT_STATUS_OPTIONS, hint: '开奖后用于跟踪联系、确认和发放进度。', group: 'rule' },
      { key: 'is_community_visible', label: '前台展示', type: 'select', required: true, options: LOTTERY_COMMUNITY_VISIBLE_OPTIONS, hint: '首页会自动映射社区抽奖页中最新一条报名中的抽奖；关闭后不会出现在首页、社区抽奖页或历史抽奖。', group: 'rule' },
      { key: 'max_entries', label: '报名人数上限', type: 'number', min: 1, placeholder: '留空表示不限制', hint: '不填写即不限人数。', group: 'rule' },
      { key: 'winner_count', label: '中奖人数', type: 'number', required: true, min: 1, placeholder: '默认 1', hint: '开奖时会从报名名单中随机抽取这么多名中奖用户。', group: 'rule' },
      { key: 'entry_deadline_at', label: '报名截止时间', type: 'datetime', hint: '到达该时间后用户不能再报名；留空表示报名直到开奖前。报名截止时间必须早于或等于自动开奖时间。', group: 'rule' },
      { key: 'draw_at', label: '自动开奖时间', type: 'datetime', hint: '到达该时间后，数据库定时任务会自动随机开奖；用户打开抽奖页或报名时也会兜底触发。', group: 'rule' },
      { key: 'drawn_at', label: '实际开奖时间', type: 'datetime', disabled: true, group: 'draw' },
      { key: 'draw_attempted_at', label: '最近开奖尝试', type: 'datetime', disabled: true, group: 'draw' },
      { key: 'draw_failed_at', label: '最近失败时间', type: 'datetime', disabled: true, group: 'draw' },
      { key: 'draw_failure_message', label: '失败原因', type: 'textarea', disabled: true, group: 'draw' },
      { key: 'draw_candidate_hash', label: '候选名单 Hash', type: 'text', disabled: true, hint: '开奖时按报名名单生成的 MD5 摘要，用于事后审计候选池是否变化。', group: 'draw' },
      { key: 'draw_algorithm_version', label: '随机算法版本', type: 'text', disabled: true, group: 'draw' },
      { key: 'winner_username', label: '首位中奖者', type: 'text', disabled: true, group: 'draw' }
    ]
  },
  lotteryEntries: {
    table: 'lottery_entries',
    columns: [
      { key: 'lottery_title', label: '抽奖', maxLength: 28 },
      { key: 'username', label: '报名用户' },
      { key: 'user_id', label: '用户ID', maxLength: 24 },
      { key: 'user_created_at', label: '加入日期', type: 'date' },
      { key: 'entry_number', label: '报名序号', type: 'number' },
      { key: 'created_at', label: '报名时间', type: 'datetime' },
      { key: 'lottery_id', label: '抽奖ID', maxLength: 24 }
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
      { key: 'user_id', label: '用户ID', maxLength: 24 },
      { key: 'drawn_by_username', label: '操作人' },
      { key: 'reason', label: '原因', maxLength: 28 },
      { key: 'created_at', label: '开奖时间', type: 'datetime' },
      { key: 'lottery_id', label: '抽奖ID', maxLength: 24 }
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
      { key: 'user_id', label: '用户ID', maxLength: 24 },
      { key: 'result_code', label: '结果', type: 'badge' },
      { key: 'message', label: '说明', maxLength: 36 },
      { key: 'created_at', label: '请求时间', type: 'datetime' },
      { key: 'lottery_id', label: '抽奖ID', maxLength: 24 }
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
      { key: 'id', label: 'ID', type: 'number', disabled: true, hint: '新增新闻时自动生成，可点击上方按钮重新生成。', group: 'basic' },
      {
        key: 'category',
        label: '分类',
        type: 'select',
        required: true,
        options: NEWS_CATEGORY_OPTIONS,
        hint: '必须使用系统内置分类，避免保存时报约束错误。',
        group: 'basic'
      },
      { key: 'title', label: '标题', type: 'text', required: true, placeholder: '例如：春季活动正式开启', group: 'content' },
      { key: 'date', label: '发布日期', type: 'date', required: true, group: 'basic' },
      { key: 'author', label: '作者', type: 'text', required: true, placeholder: '例如：Ryyik', group: 'content' },
      { key: 'excerpt', label: '摘要', type: 'textarea', required: true, rows: 3, placeholder: '用 1-2 句话写新闻列表预览，建议 30-80 字。', group: 'content' },
      { key: 'content', label: '正文内容', type: 'textarea', required: true, rows: 9, placeholder: '直接写正文即可。空行会分段，以“- ”开头会自动变成列表。', group: 'content' },
      { key: 'image', label: '封面图', type: 'image', placeholder: '上传后自动填入，也可以粘贴 https:// 图片链接', hint: '推荐使用"上传到 Cloud"，也支持 @/assets 路径或远程图片地址。', group: 'media' }
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
      { key: 'id', label: 'ID', type: 'number', disabled: true, hint: '新增活动自动生成 ID。', group: 'basic' },
      { key: 'title', label: '标题', type: 'text', required: true, maxLength: 255, group: 'basic' },
      { key: 'date', label: '日期', type: 'date', required: true, group: 'basic' },
      { key: 'description', label: '描述', type: 'textarea', placeholder: '直接写活动介绍，不需要填写任何代码。', group: 'basic' },
      { key: 'image', label: '活动图', type: 'image', placeholder: '上传后自动填入，也可以粘贴 https:// 图片链接', hint: '推荐使用"上传到 Cloud"。', group: 'media' }
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
      { key: 'id', label: '商品ID', type: 'number', disabled: true, hint: '新增商品自动生成 ID。', group: 'basic' },
      { key: 'title', label: '商品名称', type: 'text', required: true, group: 'basic' },
      { key: 'category', label: '分类', type: 'select', required: true, options: PRODUCT_CATEGORY_OPTIONS, group: 'basic' },
      { key: 'description', label: '商品描述', type: 'textarea', placeholder: '直接写给用户看的商品介绍。', group: 'detail' },
      { key: 'points_cost', label: '积分定价', type: 'number', placeholder: '例如：40', required: true, min: 0, group: 'pricing' },
      { key: 'stock', label: '库存', type: 'number', required: true, min: 0, group: 'pricing' },
      { key: 'image', label: '商品图片', type: 'image', placeholder: '上传后自动填入，也可以粘贴 https:// 图片链接', hint: '推荐使用"上传到 Cloud"。', group: 'media' },
      { key: 'specifications', label: '规格选项', type: 'specifications', group: 'specs' }
    ]
  }
};
