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
  BOHAI_MODEL_MIN_TIER_OPTIONS,
  LOTTERY_STATUS_OPTIONS,
  LOTTERY_COMMUNITY_VISIBLE_OPTIONS,
  LOTTERY_FULFILLMENT_STATUS_OPTIONS,
  NEWS_CATEGORY_OPTIONS
} from './fields.js';

export const PRODUCTS_CACHE_KEY = 'boh_products_cache_v1';

export const invalidateProductsCache = () => {
  try {
    [PRODUCTS_CACHE_KEY, 'boh_products_cache_v2', 'boh_products_cache_v3', 'boh_products_cache_v4']
      .forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    logger.warn('DataConfig', '清理商品缓存失败:', error);
  }
};

// 封禁状态选项
const BAN_STATUS_OPTIONS = [
  { value: false, label: '正常' },
  { value: true, label: '已封禁' }
];

// 禁言状态选项
const MUTE_STATUS_OPTIONS = [
  { value: false, label: '正常' },
  { value: true, label: '已禁言' }
];

export const dataConfig = {
  users: {
    table: 'profiles',
    columns: [
      { key: 'id', label: 'ID', maxLength: 24 },
      { key: 'username', label: '用户名' },
      { key: 'email', label: '邮箱' },
      { key: 'role', label: '角色', type: 'badge' },
      { key: 'is_banned', label: '封禁', type: 'badge' },
      { key: 'is_muted', label: '禁言', type: 'badge' },
      { key: 'points', label: '积分', type: 'number' },
      { key: 'created_at', label: '注册时间', type: 'date' }
    ],
    fields: [
      { key: 'id', label: '用户ID', type: 'text', disabled: true, hint: 'UUID 主键由系统生成，不可手动修改。', group: 'basic' },
      { key: 'username', label: '用户名', type: 'text', required: true, maxLength: 32, group: 'basic' },
      { key: 'email', label: '邮箱', type: 'email', maxLength: 100, placeholder: 'example@domain.com', group: 'basic' },
      { key: 'role', label: '角色', type: 'select', options: USER_ROLE_OPTIONS, group: 'basic' },
      { key: 'points', label: '积分', type: 'number', min: 0, group: 'stats' },
      { key: 'experience', label: '经验值', type: 'number', min: 0, group: 'stats' },
      { key: 'join_date', label: '加群时间', type: 'date', group: 'time' },
      { key: 'bio', label: '简介', type: 'textarea', group: 'extra' },
      { key: 'avatar_url', label: '头像URL', type: 'text', group: 'extra' },
      { key: 'tags', label: '标签', type: 'tags', group: 'extra' },
      // 封禁相关字段
      { key: 'is_banned', label: '封禁状态', type: 'select', options: BAN_STATUS_OPTIONS, group: 'ban' },
      { key: 'ban_reason', label: '封禁原因', type: 'textarea', rows: 2, placeholder: '请输入封禁原因', group: 'ban' },
      { key: 'banned_until', label: '封禁到期', type: 'datetime', hint: '留空表示永久封禁', group: 'ban' },
      { key: 'banned_at', label: '封禁时间', type: 'datetime', disabled: true, group: 'ban' },
      // 禁言相关字段
      { key: 'is_muted', label: '禁言状态', type: 'select', options: MUTE_STATUS_OPTIONS, group: 'mute' },
      { key: 'mute_reason', label: '禁言原因', type: 'textarea', rows: 2, placeholder: '请输入禁言原因', group: 'mute' },
      { key: 'muted_until', label: '禁言到期', type: 'datetime', hint: '留空表示永久禁言', group: 'mute' },
      { key: 'muted_at', label: '禁言时间', type: 'datetime', disabled: true, group: 'mute' }
    ]
  },
  points: {
    table: 'profiles',
    columns: [
      { key: 'id', label: 'ID', maxLength: 24 },
      { key: 'username', label: '用户名' },
      { key: 'role', label: '角色', type: 'badge' },
      { key: 'is_banned', label: '封禁', type: 'badge' },
      { key: 'is_muted', label: '禁言', type: 'badge' },
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
      { key: 'gift_content', label: '礼物内容', type: 'product-picker', hint: '可从商城商品中选择，或直接手动填写礼物名称。选择商品后会自动填充名称、图片和金额。', group: 'detail' },
      { key: 'gift_no', label: '快递单号', type: 'text', group: 'detail' },
      { key: 'gift_price', label: '礼物金额', type: 'number', group: 'detail' },
      { key: 'gift_image', label: '礼物图片', type: 'text', group: 'detail' },
      { key: 'is_active', label: '是否当前礼物', type: 'select', options: [
        { value: true, label: '当前礼物' },
        { value: false, label: '历史礼物' }
      ], group: 'time' },
      { key: 'completed_at', label: '完成日期', type: 'datetime', placeholder: '可自定义完成日期', group: 'time' }
    ],
    cardView: {
      imageKey: 'gift_image',
      placeholderIcon: '📦',
      titleKey: 'gift_content',
      subtitleKey: 'username',
      subtitleLabel: '用户',
      statusKey: 'gift_status',
      statusMeta: {
        preparing: { label: '准备中', tone: 'muted' },
        processing: { label: '处理中', tone: 'info' },
        shipped: { label: '已发货', tone: 'warning' },
        completed: { label: '已完成', tone: 'success' }
      },
      stats: [
        { label: '类型', key: 'gift_scope_label' },
        { label: '金额', key: 'gift_price', format: 'price' },
        { label: '快递单号', key: 'gift_no' }
      ],
      meta: [
        { label: '收件人', key: 'shipping_recipient' },
        { label: '联系电话', key: 'shipping_phone' },
        { label: '收货地址', key: 'shipping_address' },
        { label: '完成日期', key: 'completed_at', format: 'datetime' }
      ]
    }
  },
  addresses: {
    table: 'user_addresses',
    columns: [
      { key: 'username', label: '用户名' },
      { key: 'recipient', label: '收件人' },
      { key: 'phone', label: '联系电话' },
      { key: 'detail', label: '详细地址', maxLength: 28 },
      { key: 'tag', label: '标签', type: 'badge' },
      { key: 'is_default', label: '默认', type: 'badge' },
      { key: 'created_at', label: '创建时间', type: 'datetime' }
    ],
    fields: [
      { key: 'id', label: '地址ID', type: 'text', disabled: true, group: 'basic' },
      { key: 'user_id', label: '所属用户', type: 'user-picker', required: true, group: 'user' },
      { key: 'username', label: '用户名', type: 'text', disabled: true, group: 'user' },
      { key: 'recipient', label: '收件人', type: 'text', required: true, group: 'basic' },
      { key: 'phone', label: '联系电话', type: 'text', required: true, group: 'basic' },
      { key: 'region', label: '地区', type: 'text', placeholder: '如：广东省深圳市', group: 'detail' },
      { key: 'detail', label: '详细地址', type: 'textarea', required: true, rows: 2, group: 'detail' },
      { key: 'tag', label: '标签', type: 'select', options: [
        { value: '', label: '无' },
        { value: 'home', label: '家' },
        { value: 'company', label: '公司' },
        { value: 'school', label: '学校' }
      ], group: 'detail' },
      { key: 'is_default', label: '默认地址', type: 'select', options: [
        { value: true, label: '默认' },
        { value: false, label: '非默认' }
      ], group: 'detail' }
    ],
    cardView: {
      placeholderIcon: '📍',
      titleKey: 'recipient',
      subtitleKey: 'username',
      subtitleLabel: '用户',
      statusKey: 'is_default',
      statusMeta: {
        true: { label: '默认', tone: 'success' },
        false: { label: '', tone: 'muted' }
      },
      stats: [
        { label: '标签', key: 'tag', values: { home: '家', company: '公司', school: '学校', '': '无' } },
        { label: '地区', key: 'region' }
      ],
      meta: [
        { label: '联系电话', key: 'phone', copyable: true },
        { label: '详细地址', key: 'detail', copyable: true, copyText: 'fullAddress' }
      ]
    }
  },
  posterRequests: {
    table: 'poster_requests',
    columns: [
      { key: 'username', label: '用户名' },
      { key: 'recipient', label: '收件人' },
      { key: 'phone', label: '联系电话' },
      { key: 'address', label: '收货地址', maxLength: 28 },
      { key: 'material_fee', label: '物料费', type: 'price' },
      { key: 'status', label: '状态', type: 'badge' },
      { key: 'created_at', label: '申请时间', type: 'datetime' }
    ],
    fields: [
      { key: 'id', label: '申请ID', type: 'text', disabled: true, group: 'detail' },
      { key: 'user_id', label: '用户', type: 'user-picker', required: true, group: 'user' },
      { key: 'username', label: '用户名', type: 'text', disabled: true, group: 'user' },
      { key: 'recipient', label: '收件人', type: 'text', disabled: true, group: 'detail' },
      { key: 'phone', label: '联系电话', type: 'text', disabled: true, group: 'detail' },
      { key: 'address', label: '收货地址', type: 'textarea', disabled: true, group: 'detail' },
      { key: 'material_fee', label: '物料费 (RMB)', type: 'number', disabled: true, min: 0, group: 'detail' },
      { key: 'campaign_code', label: '活动代号', type: 'text', disabled: true, group: 'detail' },
      {
        key: 'status', label: '申请状态', type: 'select', options: [
          { value: 'pending', label: '已收到申请' },
          { value: 'processing', label: '处理中' },
          { value: 'shipped', label: '已寄出' },
          { value: 'completed', label: '已送达' }
        ], group: 'time'
      },
      { key: 'created_at', label: '申请时间', type: 'datetime', disabled: true, group: 'time' }
    ],
    cardView: {
      placeholderIcon: '🖼️',
      titleKey: 'recipient',
      subtitleKey: 'username',
      subtitleLabel: '用户',
      statusKey: 'status',
      statusMeta: {
        pending: { label: '已收到', tone: 'muted' },
        processing: { label: '处理中', tone: 'info' },
        shipped: { label: '已寄出', tone: 'warning' },
        completed: { label: '已送达', tone: 'success' }
      },
      stats: [
        { label: '物料费', key: 'material_fee', format: 'price' },
        { label: '活动代号', key: 'campaign_code' }
      ],
      meta: [
        { label: '收件人', key: 'recipient' },
        { label: '联系电话', key: 'phone' },
        { label: '收货地址', key: 'address' },
        { label: '申请时间', key: 'created_at', format: 'datetime' }
      ]
    }
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
      { key: 'min_tier', label: '最低档位', type: 'badge' },
      { key: 'status', label: '状态', type: 'badge' },
      { key: 'temperature', label: '温度', type: 'number' },
      { key: 'max_tokens', label: '输出上限', type: 'number' },
      { key: 'quota_multiplier', label: '额度倍率', type: 'number' },
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
      { key: 'model_id', label: '模型ID', type: 'select', required: true, optionsSource: 'freemodels', hint: '只能从免费模型库中选择。', group: 'provider' },
      { key: 'api_url', label: '接口地址', type: 'text', maxLength: 600, placeholder: '留空会按供应商自动填默认地址。', group: 'provider' },
      { key: 'capability', label: '能力类型', type: 'select', required: true, options: BOHAI_MODEL_CAPABILITY_OPTIONS, group: 'provider' },
      { key: 'icon', label: '图标', type: 'select', required: true, options: BOHAI_MODEL_ICON_OPTIONS, group: 'basic' },
      { key: 'temperature', label: 'Temperature', type: 'number', min: 0, max: 1.2, required: true, group: 'params' },
      { key: 'top_p', label: 'Top P', type: 'number', min: 0.1, max: 1, required: true, group: 'params' },
      { key: 'frequency_penalty', label: 'Frequency Penalty', type: 'number', min: 0, max: 2, required: true, group: 'params' },
      { key: 'max_tokens', label: '最大输出 tokens', type: 'number', min: 256, max: 4096, required: true, group: 'params' },
      { key: 'quota_multiplier', label: '额度消耗倍率', type: 'number', min: 0.1, max: 100, step: 0.1, required: true, hint: '实际 Token × 此倍率计入今日额度。', group: 'params' },
      { key: 'sort_order', label: '显示排序', type: 'number', min: 0, max: 10000, required: true, group: 'extra' },
      { key: 'min_tier', label: '最低订阅档位', type: 'select', required: true, options: BOHAI_MODEL_MIN_TIER_OPTIONS, hint: '普通档位按订阅等级校验；Coding 档位仅订阅对应（或更高）Coding 附加包的用户可用。', group: 'extra' },
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
    ],
    cardView: {
      imageKey: 'cover_image_url',
      placeholderIcon: '🎲',
      titleKey: 'title',
      subtitleKey: 'prize_title',
      subtitleLabel: '奖品',
      statusKey: 'status',
      statusMeta: {
        draft: { label: '草稿', tone: 'muted' },
        open: { label: '报名中', tone: 'info' },
        drawn: { label: '已开奖', tone: 'success' },
        closed: { label: '已关闭', tone: 'neutral' }
      },
      stats: [
        { label: '报名', key: 'entry_count' },
        { label: '中奖', key: 'winner_count' },
        { label: '处理', key: 'fulfillment_status', values: {
          pending_contact: '待联系', confirmed: '已确认', fulfilled: '已发放', voided: '已作废'
        } }
      ],
      meta: [
        { label: '首位中奖', key: 'winner_username' },
        { label: '报名截止', key: 'entry_deadline_at', format: 'datetime' },
        { label: '计划开奖', key: 'draw_at', format: 'datetime' },
        { label: '实际开奖', key: 'drawn_at', format: 'datetime' }
      ]
    }
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
    ],
    cardView: {
      imageKey: 'image',
      placeholderIcon: '📰',
      titleKey: 'title',
      subtitleKey: 'author',
      subtitleLabel: '作者',
      statusKey: 'category',
      statusMeta: {
        event: { label: '活动公告', tone: 'info' },
        update: { label: '功能更新', tone: 'success' },
        community: { label: '社区动态', tone: 'warning' },
        announce: { label: '站内公告', tone: 'danger' }
      },
      meta: [
        { label: '发布日期', key: 'date', format: 'date' },
        { label: '摘要', key: 'excerpt' }
      ]
    }
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
    ],
    cardView: {
      imageKey: 'image',
      placeholderIcon: '🎉',
      titleKey: 'title',
      subtitleKey: 'date',
      subtitleLabel: '活动日期',
      subtitleFormat: 'date',
      meta: [
        { label: '描述', key: 'description' }
      ]
    }
  },
  products: {
    table: 'products',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'image', label: '图片', type: 'image' },
      { key: 'title', label: '商品名称', maxLength: 25 },
      { key: 'category', label: '分类', type: 'badge' },
      { key: 'points_cost', label: '积分定价', type: 'number' },
      { key: 'stock', label: '库存', type: 'number' },
      { key: 'is_active', label: '商城展示', type: 'badge' },
      { key: 'is_purchasable', label: '允许购买', type: 'badge' }
    ],
    fields: [
      { key: 'id', label: '商品ID', type: 'number', disabled: true, hint: '新增商品自动生成 ID。', group: 'basic' },
      { key: 'title', label: '商品名称', type: 'text', required: true, group: 'basic' },
      { key: 'category', label: '分类', type: 'select', required: true, options: PRODUCT_CATEGORY_OPTIONS, group: 'basic' },
      { key: 'description', label: '商品描述', type: 'textarea', placeholder: '直接写给用户看的商品介绍。', group: 'detail' },
      { key: 'points_cost', label: '积分定价', type: 'number', placeholder: '例如：40', required: true, min: 0, group: 'pricing' },
      { key: 'stock', label: '库存', type: 'number', required: true, min: 0, group: 'pricing' },
      { key: 'is_active', label: '商城展示', type: 'select', options: [{ value: true, label: '显示' }, { value: false, label: '隐藏' }], group: 'pricing' },
      { key: 'is_purchasable', label: '允许购买', type: 'select', options: [{ value: true, label: '允许购买' }, { value: false, label: '不可购买' }], group: 'pricing' },
      { key: 'image', label: '商品图片', type: 'image', placeholder: '上传后自动填入，也可以粘贴 https:// 图片链接', hint: '推荐使用"上传到 Cloud"。', group: 'media' },
      { key: 'specifications', label: '规格选项', type: 'specifications', group: 'specs' }
    ],
    cardView: {
      imageKey: 'image',
      placeholderIcon: '🎁',
      titleKey: 'title',
      subtitleKey: 'category',
      subtitleType: 'badge',
      statusKey: 'is_active',
      statusMeta: {
        true: { label: '上架', tone: 'success' },
        false: { label: '隐藏', tone: 'muted' }
      },
      stats: [
        { label: '积分', key: 'points_cost' },
        { label: '库存', key: 'stock' },
        { label: '可购', key: 'is_purchasable', values: { true: '允许', false: '禁止' } }
      ]
    }
  }
};
