import { logger } from '../../../utils/logger';
import {
  USER_ROLE_OPTIONS,
  FORUM_STATUS_OPTIONS,
  PRODUCT_CATEGORY_OPTIONS,
  PRODUCT_PAYMENT_MODE_OPTIONS,
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
  LOTTERY_PITY_MODE_OPTIONS,
  NEWS_CATEGORY_OPTIONS,
  ORDER_STATUS_OPTIONS,
  ORDER_CONTACT_TYPE_OPTIONS,
  BIRTHDAY_WISH_STATUS_OPTIONS,
  FORUM_POST_TAG_OPTIONS,
  BOOLEAN_DISPLAY_OPTIONS,
  POST_REWARD_STATUS_OPTIONS
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
      // 生日信息
      { key: 'birth_month', label: '生日月份', type: 'number', min: 1, max: 12, placeholder: '1-12', group: 'extra' },
      { key: 'birth_day', label: '生日日期', type: 'number', min: 1, max: 31, placeholder: '1-31', group: 'extra' },
      // 推送通知
      { key: 'pushplus_enabled', label: 'PushPlus推送', type: 'select', options: [
        { value: true, label: '已启用' },
        { value: false, label: '未启用' }
      ], group: 'extra' },
      // 个人主页背景
      { key: 'profile_background_url', label: '主页背景图', type: 'text', placeholder: '图片URL', group: 'extra' },
      { key: 'profile_background_public_id', label: '背景图Public ID', type: 'text', disabled: true, group: 'extra' },
      // 隐私设置
      { key: 'hide_online_status', label: '隐藏在线状态', type: 'select', options: [
        { value: true, label: '隐藏' },
        { value: false, label: '显示' }
      ], group: 'privacy' },
      { key: 'hide_follow_data', label: '隐藏关注数据', type: 'select', options: [
        { value: true, label: '隐藏' },
        { value: false, label: '显示' }
      ], group: 'privacy' },
      // 创作者认证
      { key: 'is_boh_creator', label: 'BOH创作者', type: 'select', options: [
        { value: true, label: '已认证' },
        { value: false, label: '未认证' }
      ], group: 'creator' },
      { key: 'creator_platform_ids', label: '创作者平台ID', type: 'json', group: 'creator' },
      { key: 'creator_platform_visibility', label: '平台可见性', type: 'json', group: 'creator' },
      { key: 'creator_platform_order', label: '平台排序', type: 'json', group: 'creator' },
      { key: 'showcase_post_ids', label: '展示帖ID列表', type: 'json', group: 'creator' },
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
      { key: 'gift_points', label: '消耗积分', type: 'number' },
      { key: 'created_at', label: '创建时间', type: 'datetime' },
      { key: 'completed_at', label: '完成日期', type: 'datetime' }
    ],
    fields: [
      { key: 'id', label: '礼物ID', type: 'text', disabled: true, group: 'detail' },
      { key: 'user_id', label: '用户', type: 'user-picker', required: true, group: 'user' },
      { key: 'username', label: '用户名', type: 'text', disabled: true, group: 'user' },
      { key: 'address_id', label: '收货地址', type: 'address-picker', hint: '选择该用户的一个收货地址；若不选择则使用默认地址', group: 'user' },
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
      { key: 'gift_points', label: '消耗积分', type: 'number', min: 0, hint: '该礼物对应的积分消耗（如有）。', group: 'detail' },
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
      { key: 'tag', label: '标签', type: 'badge' },
      { key: 'status', label: '状态', type: 'badge' },
      { key: 'like_count', label: '点赞', type: 'number' },
      { key: 'comment_count', label: '评论', type: 'number' },
      { key: 'image_count', label: '图片', type: 'number' },
      { key: 'created_at', label: '发布时间', type: 'date' }
    ],
    fields: [
      { key: 'id', label: '帖子ID', type: 'text', disabled: true, group: 'meta' },
      { key: 'title', label: '标题', type: 'text', required: true, group: 'content' },
      { key: 'content', label: '正文', type: 'textarea', required: true, rows: 8, placeholder: '仅填写正文，保存时会自动组合标题。', group: 'content' },
      { key: 'tag', label: '帖子标签', type: 'select', options: FORUM_POST_TAG_OPTIONS, hint: '帖子分类标签。', group: 'content' },
      { key: 'cover_image_url', label: '封面图', type: 'image', placeholder: '可粘贴图片链接', group: 'content' },
      { key: 'location_name', label: '位置名称', type: 'text', placeholder: '如：广东省深圳市', group: 'content' },
      { key: 'author_id', label: '作者ID', type: 'text', placeholder: 'UUID，可留空', group: 'meta' },
      { key: 'author_username', label: '作者用户名', type: 'text', group: 'meta' },
      { key: 'status', label: '帖子状态', type: 'select', options: FORUM_STATUS_OPTIONS, group: 'meta' }
    ],
    cardView: {
      imageKey: 'cover_image_url',
      placeholderIcon: '💬',
      titleKey: 'title',
      subtitleKey: 'author_username',
      subtitleLabel: '作者',
      statusKey: 'status',
      statusMeta: {
        approved: { label: '已通过', tone: 'success' },
        pending: { label: '待审核', tone: 'warning' },
        rejected: { label: '已拒绝', tone: 'error' },
        deleted: { label: '已删除', tone: 'muted' }
      },
      stats: [
        { label: '标签', key: 'tag', values: { share: '分享', question: '提问', discussion: '讨论', guide: '教程', news: '资讯', '': '无' } },
        { label: '点赞', key: 'like_count' },
        { label: '评论', key: 'comment_count' },
        { label: '图片', key: 'image_count' }
      ],
      meta: [
        { label: '位置', key: 'location_name' },
        { label: '发布时间', key: 'created_at', format: 'date' }
      ]
    }
  },
  ads: {
    table: 'advertisements',
    columns: [
      { key: 'title', label: '广告名称', maxLength: 28 },
      { key: 'placement', label: '广告位', type: 'badge' },
      { key: 'status', label: '状态', type: 'badge' },
      { key: 'sort_order', label: '排序', type: 'number' },
      { key: 'feed_interval', label: '间隔', type: 'number' },
      { key: 'clicks', label: '点击', type: 'number' },
      { key: 'image_url', label: '图片', type: 'image' },
      { key: 'created_at', label: '创建时间', type: 'datetime' }
    ],
    fields: [
      { key: 'id', label: '广告ID', type: 'text', disabled: true, hint: 'UUID 主键由系统生成，不可手动修改。', group: 'basic' },
      { key: 'title', label: '广告名称', type: 'text', required: true, maxLength: 120, placeholder: '例如：BOH 订阅计划推广', group: 'basic' },
      { key: 'placement', label: '广告位', type: 'select', required: true, options: [
        { value: 'list_feed', label: '列表信息流' },
        { value: 'top_banner', label: '顶部横幅' },
        { value: 'bottom_banner', label: '底部横幅' },
        { value: 'detail_between', label: '详情信息流' },
        { value: 'sidebar', label: '侧边栏' }
      ], hint: '当前已落地"列表信息流"，其余广告位为预留。', group: 'basic' },
      { key: 'status', label: '状态', type: 'select', required: true, options: [
        { value: 'active', label: '启用' },
        { value: 'inactive', label: '停用' }
      ], group: 'basic' },
      { key: 'image_url', label: '广告图片', type: 'image', hint: '建议使用 16:9 或帖子同宽的横向图。', group: 'creative' },
      { key: 'link_url', label: '跳转链接', type: 'text', placeholder: '例如：/user-space/subscriptions', hint: '点击广告后跳转的地址，可填完整 URL 或站内路径。', group: 'creative' },
      { key: 'sort_order', label: '排序', type: 'number', min: 0, required: true, hint: '同广告位内展示顺序，越小越靠前。', group: 'target' },
      { key: 'feed_interval', label: '信息流间隔', type: 'number', min: 2, required: true, hint: '列表信息流中每隔多少条帖子插入一条广告，最小 2。', group: 'target' },
      { key: 'clicks', label: '点击量', type: 'number', disabled: true, hint: '由前端点击自动累计，仅用于统计。', group: 'stats' },
      { key: 'created_at', label: '创建时间', type: 'datetime', disabled: true, group: 'stats' }
    ],
    cardView: {
      imageKey: 'image_url',
      placeholderIcon: '📢',
      titleKey: 'title',
      subtitleKey: 'placement',
      subtitleLabel: '广告位',
      statusKey: 'status',
      statusMeta: {
        active: { label: '启用', tone: 'success' },
        inactive: { label: '停用', tone: 'muted' }
      },
      stats: [
        { label: '广告位', key: 'placement', values: {
          list_feed: '列表信息流', top_banner: '顶部横幅', bottom_banner: '底部横幅',
          detail_between: '详情信息流', sidebar: '侧边栏'
        } },
        { label: '排序', key: 'sort_order' },
        { label: '间隔', key: 'feed_interval' },
        { label: '点击', key: 'clicks' }
      ],
      meta: [
        { label: '跳转链接', key: 'link_url', copyable: true },
        { label: '创建时间', key: 'created_at', format: 'datetime' }
      ]
    }
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
    fields: [],
    kanban: {
      statusKey: 'status',
      statusMeta: {
        approved: { label: '已通过', tone: 'success' },
        limited: { label: '仅作者可见', tone: 'warning' },
        rejected: { label: '已拒绝', tone: 'danger' }
      }
    }
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
    fields: [],
    kanban: {
      statusKey: 'status',
      statusMeta: {
        approved: { label: '已通过', tone: 'success' },
        limited: { label: '仅作者可见', tone: 'warning' },
        rejected: { label: '已拒绝', tone: 'danger' }
      }
    }
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
    fields: [],
    kanban: {
      statusKey: 'status',
      statusMeta: {
        approved: { label: '已通过', tone: 'success' },
        limited: { label: '仅作者可见', tone: 'warning' },
        rejected: { label: '已拒绝', tone: 'danger' }
      }
    }
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
    cardView: {
      placeholderIcon: '📚',
      titleKey: 'title',
      subtitleKey: 'category',
      subtitleLabel: '分类',
      statusKey: 'status',
      statusMeta: {
        active: { label: '启用', tone: 'success' },
        draft: { label: '草稿', tone: 'warning' },
        archived: { label: '归档', tone: 'muted' }
      },
      stats: [
        { label: '优先级', key: 'priority' }
      ],
      meta: [
        { label: '更新时间', key: 'updated_at', format: 'datetime' }
      ]
    },
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
      { key: 'pity_reward_title', label: '保底礼', maxLength: 24 },
      { key: 'pity_mode', label: '保底失败计算' },
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
      { key: 'pity_reward_title', label: '保底礼', type: 'text', maxLength: 120, placeholder: '例如：BOH 基础礼盒', hint: '仅限 1 位达到保底且未获得普通奖的用户获得。', visibleWhen: (item) => item.pity_mode === 'eligible', group: 'prize' },
      { key: 'pity_reward_description', label: '保底礼说明', type: 'textarea', rows: 2, maxLength: 800, placeholder: '写明规格、发放方式或使用条件。', visibleWhen: (item) => item.pity_mode === 'eligible', group: 'prize' },
      { key: 'cover_image_url', label: '抽奖封面', type: 'image', placeholder: '上传后自动填入，也可以粘贴 https:// 图片链接', group: 'prize' },
      { key: 'status', label: '抽奖状态', type: 'select', required: true, options: LOTTERY_STATUS_OPTIONS, group: 'rule' },
      { key: 'fulfillment_status', label: '中奖处理状态', type: 'select', required: true, options: LOTTERY_FULFILLMENT_STATUS_OPTIONS, hint: '开奖后用于跟踪联系、确认和发放进度。', group: 'rule' },
      { key: 'is_community_visible', label: '社区展示', type: 'select', required: true, options: LOTTERY_COMMUNITY_VISIBLE_OPTIONS, hint: '首页会自动映射社区抽奖页中最新一条报名中的抽奖；关闭后不会出现在首页、社区抽奖页或历史抽奖。', group: 'rule' },
      { key: 'is_home_visible', label: '首页展示', type: 'select', required: true, options: LOTTERY_COMMUNITY_VISIBLE_OPTIONS, hint: '独立控制是否在首页轮播展示。', group: 'rule' },
      { key: 'enforce_account_age_check', label: '账号年龄校验', type: 'select', required: true, options: [
        { value: true, label: '启用' },
        { value: false, label: '不启用' }
      ], hint: '启用后仅满足账号年龄要求的用户可报名。', group: 'rule' },
      { key: 'max_entries', label: '报名人数上限', type: 'number', min: 1, placeholder: '留空表示不限制', hint: '不填写即不限人数。', group: 'rule' },
      { key: 'winner_count', label: '中奖人数', type: 'number', required: true, min: 1, max: 2, placeholder: '默认 1', hint: '不兑现保底时固定 1 人；兑现保底时固定 2 人：1 位普通中奖人和至多 1 位保底中奖人。', group: 'rule' },
      { key: 'pity_mode', label: '保底规则', type: 'select', required: true, options: LOTTERY_PITY_MODE_OPTIONS, hint: '所有中奖都会重置保底次数；保底中奖人与普通中奖人必定不同。', group: 'rule' },
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
        { label: '中奖人数', key: 'winner_count' },
        { label: '保底礼', key: 'pity_reward_title' },
        { label: '保底', key: 'pity_mode', values: { none: '不计入', count_only: '仅计入', eligible: '计入并兑现' } },
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
  lotteryFulfillments: {
    table: 'lottery_winner_fulfillments',
    columns: [
      { key: 'lottery_title', label: '抽奖', maxLength: 24 },
      { key: 'username', label: '中奖用户' },
      { key: 'award_kind', label: '奖项类型', type: 'badge' },
      { key: 'award_title', label: '实际奖品', maxLength: 24 },
      { key: 'winner_position', label: '席位', type: 'number' },
      { key: 'status', label: '履约状态', type: 'badge' },
      { key: 'is_current_label', label: '当前资格', type: 'badge' },
      { key: 'tracking_number', label: '物流单号', maxLength: 22 },
      { key: 'contacted_at', label: '首次联系', type: 'datetime' },
      { key: 'updated_at', label: '更新时间', type: 'datetime' }
    ],
    fields: [],
    kanban: {
      statusKey: 'status',
      statusMeta: {
        pending_contact: { label: '待联系', tone: 'warning' },
        confirmed: { label: '已确认', tone: 'info' },
        fulfilled: { label: '已发放', tone: 'success' },
        voided: { label: '已作废', tone: 'muted' }
      }
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
  lotteryFailureStats: {
    table: 'lottery_failure_stats',
    columns: [
      { key: 'username', label: '用户' },
      { key: 'total_participations', label: '历史参与', type: 'number' },
      { key: 'win_count', label: '中奖次数', type: 'number' },
      { key: 'failure_count', label: '失败次数', type: 'number' },
      { key: 'current_failure_streak', label: '当前连续失败', type: 'number' },
      { key: 'failure_rate', label: '失败率', type: 'number' },
      { key: 'last_result_label', label: '最近结果', type: 'badge' },
      { key: 'last_participated_at', label: '最近参与', type: 'datetime' },
      { key: 'latest_lottery_title', label: '最近抽奖', maxLength: 28 }
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
  lotteryAuditLogs: {
    table: 'lottery_admin_audit_logs',
    columns: [
      { key: 'created_at', label: '时间', type: 'datetime' },
      { key: 'lottery_title', label: '抽奖', maxLength: 24 },
      { key: 'action', label: '操作', type: 'badge' },
      { key: 'actor_username', label: '操作人' },
      { key: 'detail_preview', label: '详情', maxLength: 48 }
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
  postReward: {
    table: 'post_reward_campaigns',
    columns: [
      { key: 'id', label: '活动ID' },
      { key: 'title', label: '活动标题', maxLength: 30 },
      { key: 'status', label: '状态', type: 'badge' },
      { key: 'lifecycle', label: '生命周期', type: 'badge', virtual: true },
      { key: 'points_per_post', label: '每帖积分', type: 'number' },
      { key: 'daily_limit', label: '每日上限', type: 'number' },
      { key: 'monthly_limit', label: '每月上限', type: 'number' },
      { key: 'start_at', label: '开始', type: 'datetime' },
      { key: 'end_at', label: '结束', type: 'datetime' }
    ],
    fields: [
      { key: 'id', label: '活动ID', type: 'number', disabled: true, hint: '新增活动自动生成 ID。', group: 'basic' },
      { key: 'title', label: '活动标题', type: 'text', required: true, maxLength: 255, placeholder: '例如：8月发帖有奖', group: 'basic' },
      { key: 'status', label: '状态', type: 'select', required: true, options: POST_REWARD_STATUS_OPTIONS, group: 'basic' },
      { key: 'points_per_post', label: '每帖积分', type: 'number', required: true, min: 1, max: 1000, placeholder: '每成功发帖发放的积分', group: 'rule' },
      { key: 'daily_limit', label: '每日上限(次)', type: 'number', min: 0, placeholder: '0 = 不限制', hint: '单个用户每日最多可领次数，0 表示不限制。', group: 'rule' },
      { key: 'monthly_limit', label: '每月上限(次)', type: 'number', min: 0, placeholder: '0 = 不限制', hint: '单个用户每月最多可领次数，0 表示不限制。', group: 'rule' },
      { key: 'start_at', label: '开始时间', type: 'datetime', required: true, hint: '活动生效开始时间，用户在此之后发帖可领奖。', group: 'time' },
      { key: 'end_at', label: '结束时间', type: 'datetime', required: true, hint: '活动结束时间，用户在此之前发帖可领奖。', group: 'time' }
    ],
    // 生命周期：按起止时间 + 状态派生的只读展示字段（virtual = 不入库、不进高级筛选）
    rowDecorator: (row) => {
      const now = Date.now();
      const start = row?.start_at ? new Date(row.start_at).getTime() : NaN;
      const end = row?.end_at ? new Date(row.end_at).getTime() : NaN;
      const LABELS = { upcoming: '即将开始', ongoing: '进行中', paused: '已停用', ended: '已结束' };
      let lifecycle = 'ended';
      if (Number.isFinite(start) && Number.isFinite(end)) {
        if (now < start) lifecycle = 'upcoming';
        else if (now > end) lifecycle = 'ended';
        else lifecycle = row?.status === 'active' ? 'ongoing' : 'paused';
      }
      return { ...row, lifecycle: LABELS[lifecycle] };
    },
    cardView: {
      placeholderIcon: '🎁',
      titleKey: 'title',
      subtitleKey: 'status',
      subtitleLabel: '状态',
      meta: [
        { label: '生命周期', key: 'lifecycle' }
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
      { key: 'payment_mode', label: '支付模式', type: 'badge' },
      { key: 'points_cost', label: '积分定价', type: 'number' },
      { key: 'rmb_price', label: 'RMB定价', type: 'price' },
      { key: 'stock', label: '库存', type: 'number' },
      { key: 'is_active', label: '商城展示', type: 'badge' },
      { key: 'is_purchasable', label: '允许购买', type: 'badge' }
    ],
    fields: [
      { key: 'id', label: '商品ID', type: 'number', disabled: true, hint: '新增商品自动生成 ID。', group: 'basic' },
      { key: 'title', label: '商品名称', type: 'text', required: true, group: 'basic' },
      { key: 'category', label: '分类', type: 'select', required: true, options: PRODUCT_CATEGORY_OPTIONS, group: 'basic' },
      { key: 'description', label: '商品描述', type: 'textarea', placeholder: '直接写给用户看的商品介绍。', group: 'detail' },
      { key: 'payment_mode', label: '支付模式', type: 'select', required: true, options: PRODUCT_PAYMENT_MODE_OPTIONS, hint: '纯积分=仅积分购买；纯人民币=仅RMB购买；积分+人民币=需同时支付。', group: 'pricing' },
      { key: 'points_cost', label: '积分定价', type: 'number', placeholder: '例如：40', required: true, min: 0, group: 'pricing' },
      { key: 'rmb_price', label: 'RMB 定价(分)', type: 'number', placeholder: '单位：分，如 500 = ¥5.00', min: 0, hint: '支付模式为纯人民币或混合时必填，单位为分。', group: 'pricing' },
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
        { label: '支付', key: 'payment_mode', values: { points: '积分', rmb: 'RMB', mixed: '混合' } },
        { label: '积分', key: 'points_cost' },
        { label: 'RMB', key: 'rmb_price', format: 'price' },
        { label: '库存', key: 'stock' },
        { label: '可购', key: 'is_purchasable', values: { true: '允许', false: '禁止' } }
      ]
    }
  },
  // ========== 商城订单管理 ==========
  shopOrders: {
    table: 'shop_points_orders',
    columns: [
      { key: 'id', label: 'ID', maxLength: 24 },
      { key: 'order_no', label: '订单号', maxLength: 20 },
      { key: 'username', label: '用户名' },
      { key: 'contact_type', label: '联系方式', type: 'badge' },
      { key: 'contact_value', label: '联系账号', maxLength: 20 },
      { key: 'total_points', label: '积分总额', type: 'number' },
      { key: 'rmb_total', label: 'RMB总额', type: 'price' },
      { key: 'payment_mode', label: '支付模式', type: 'badge' },
      { key: 'status', label: '状态', type: 'badge' },
      { key: 'created_at', label: '下单时间', type: 'datetime' }
    ],
    fields: [
      { key: 'id', label: '订单ID', type: 'text', disabled: true, group: 'basic' },
      { key: 'order_no', label: '订单号', type: 'text', disabled: true, group: 'basic' },
      { key: 'user_id', label: '用户ID', type: 'text', disabled: true, group: 'basic' },
      { key: 'username', label: '用户名', type: 'text', disabled: true, group: 'basic' },
      { key: 'contact_type', label: '联系方式', type: 'select', options: ORDER_CONTACT_TYPE_OPTIONS, disabled: true, group: 'detail' },
      { key: 'contact_value', label: '联系账号', type: 'text', disabled: true, group: 'detail' },
      { key: 'items', label: '商品明细', type: 'textarea', disabled: true, rows: 4, group: 'detail' },
      { key: 'total_points', label: '积分总额', type: 'number', disabled: true, group: 'detail' },
      { key: 'rmb_total', label: 'RMB总额(分)', type: 'number', disabled: true, group: 'detail' },
      { key: 'payment_mode', label: '支付模式', type: 'text', disabled: true, group: 'detail' },
      { key: 'points_used', label: '已扣积分', type: 'number', disabled: true, group: 'detail' },
      { key: 'created_at', label: '下单时间', type: 'datetime', disabled: true, group: 'time' },
      {
        key: 'status', label: '订单状态', type: 'select', options: ORDER_STATUS_OPTIONS, group: 'time'
      }
    ],
    cardView: {
      placeholderIcon: '🛒',
      titleKey: 'order_no',
      subtitleKey: 'username',
      subtitleLabel: '用户',
      statusKey: 'status',
      statusMeta: {
        pending: { label: '待处理', tone: 'warning' },
        processing: { label: '处理中', tone: 'info' },
        shipped: { label: '已发货', tone: 'info' },
        completed: { label: '已完成', tone: 'success' },
        cancelled: { label: '已取消', tone: 'muted' }
      },
      stats: [
        { label: '支付', key: 'payment_mode', values: { points: '积分', rmb: 'RMB', mixed: '混合' } },
        { label: '积分', key: 'total_points' },
        { label: 'RMB', key: 'rmb_total', format: 'price' }
      ],
      meta: [
        { label: '联系方式', key: 'contact_type', values: { qq: 'QQ', wechat: '微信', phone: '电话' } },
        { label: '联系账号', key: 'contact_value', copyable: true },
        { label: '下单时间', key: 'created_at', format: 'datetime' }
      ]
    }
  },
  // ========== 积分流水 ==========
  pointsTransactions: {
    table: 'points_transactions',
    columns: [
      { key: 'id', label: 'ID', maxLength: 24 },
      { key: 'username', label: '用户名' },
      { key: 'amount', label: '变动', type: 'number' },
      { key: 'balance_after', label: '变动后余额', type: 'number' },
      { key: 'reason', label: '原因', maxLength: 20 },
      { key: 'remark', label: '备注', maxLength: 24 },
      { key: 'operator_name', label: '操作人' },
      { key: 'batch_id', label: '批次ID', maxLength: 20 },
      { key: 'created_at', label: '时间', type: 'datetime' }
    ],
    fields: [],
    cardView: {
      placeholderIcon: '📋',
      titleKey: 'username',
      titleLabel: '用户',
      subtitleKey: 'reason',
      subtitleType: 'badge',
      statusKey: 'reason',
      statusMeta: {
        grant: { label: '发放', tone: 'success' },
        revoke: { label: '撤销', tone: 'error' },
        spend: { label: '消费', tone: 'warning' },
        subscribe: { label: '订阅', tone: 'info' },
        checkin: { label: '签到', tone: 'success' },
        lottery: { label: '抽奖', tone: 'info' },
        adjust: { label: '调整', tone: 'muted' }
      },
      stats: [
        { label: '变动', key: 'amount', format: 'signedNumber' },
        { label: '余额', key: 'balance_after' }
      ],
      meta: [
        { label: '备注', key: 'remark' },
        { label: '操作人', key: 'operator_name' },
        { label: '批次ID', key: 'batch_id', copyable: true },
        { label: '时间', key: 'created_at', format: 'datetime' }
      ]
    }
  },
  // ========== 通知管理 ==========
  notifications: {
    table: 'notifications',
    columns: [
      { key: 'id', label: 'ID', maxLength: 24 },
      { key: 'recipient_name', label: '接收人' },
      { key: 'sender_name', label: '发送人' },
      { key: 'type', label: '类型', type: 'badge' },
      { key: 'content', label: '内容', maxLength: 40 },
      { key: 'status', label: '状态', type: 'badge' },
      { key: 'created_at', label: '创建时间', type: 'datetime' },
      { key: 'archived_at', label: '归档时间', type: 'datetime' }
    ],
    fields: [],
    cardView: {
      placeholderIcon: '🔔',
      titleKey: 'sender_name',
      titleLabel: '发送人',
      subtitleKey: 'type',
      subtitleType: 'badge',
      statusKey: 'status',
      statusMeta: {
        unread: { label: '未读', tone: 'warning' },
        read: { label: '已读', tone: 'muted' }
      },
      stats: [
        { label: '接收人', key: 'recipient_name' },
        { label: '类型', key: 'type', values: { like: '点赞', comment: '评论', reply: '回复', follow: '关注', impression: '访客', lottery: '抽奖', system: '系统' } }
      ],
      meta: [
        { label: '内容', key: 'content' },
        { label: '创建时间', key: 'created_at', format: 'datetime' },
        { label: '归档时间', key: 'archived_at', format: 'datetime' }
      ]
    }
  },
  // ========== 审核日志 ==========
  moderationLogs: {
    table: 'moderation_logs',
    columns: [
      { key: 'id', label: 'ID', maxLength: 24 },
      { key: 'target_type', label: '目标类型', type: 'badge' },
      { key: 'target_id', label: '目标ID', maxLength: 24 },
      { key: 'ai_result', label: 'AI结果', maxLength: 20 },
      { key: 'ai_reason', label: 'AI原因', maxLength: 30 },
      { key: 'moderator_name', label: '操作人' },
      { key: 'created_at', label: '时间', type: 'datetime' }
    ],
    fields: []
  },
  // ========== 举报明细 ==========
  forumPostReports: {
    table: 'forum_post_reports',
    columns: [
      { key: 'id', label: 'ID', maxLength: 24 },
      { key: 'post_id', label: '帖子ID', maxLength: 24 },
      { key: 'reporter_name', label: '举报人' },
      { key: 'reason', label: '原因', type: 'badge' },
      { key: 'detail', label: '详情', maxLength: 36 },
      { key: 'status', label: '状态', type: 'badge' },
      { key: 'resolver_name', label: '处理人' },
      { key: 'created_at', label: '举报时间', type: 'datetime' },
      { key: 'resolved_at', label: '处理时间', type: 'datetime' }
    ],
    fields: [],
    cardView: {
      placeholderIcon: '🚩',
      titleKey: 'reporter_name',
      titleLabel: '举报人',
      subtitleKey: 'reason',
      subtitleType: 'badge',
      statusKey: 'status',
      statusMeta: {
        pending: { label: '待处理', tone: 'warning' },
        resolved: { label: '已处理', tone: 'success' },
        dismissed: { label: '已驳回', tone: 'muted' }
      },
      stats: [
        { label: '帖子ID', key: 'post_id' }
      ],
      meta: [
        { label: '详情', key: 'detail' },
        { label: '处理人', key: 'resolver_name' },
        { label: '举报时间', key: 'created_at', format: 'datetime' },
        { label: '处理时间', key: 'resolved_at', format: 'datetime' }
      ]
    }
  },
  // ========== 每周签到 ==========
  forumWeeklyCheckins: {
    table: 'forum_weekly_checkins',
    columns: [
      { key: 'id', label: 'ID', maxLength: 24 },
      { key: 'username', label: '用户名' },
      { key: 'week_start_date', label: '周起始', type: 'date' },
      { key: 'signed_at', label: '签到时间', type: 'datetime' },
      { key: 'created_at', label: '创建时间', type: 'datetime' }
    ],
    fields: []
  },
  // ========== 论坛图片审核 ==========
  forumPostImages: {
    table: 'forum_post_images',
    columns: [
      { key: 'id', label: 'ID', maxLength: 24 },
      { key: 'post_id', label: '帖子ID', maxLength: 24 },
      { key: 'username', label: '上传者' },
      { key: 'url', label: '图片', type: 'image' },
      { key: 'moderation_status', label: '审核状态', type: 'badge' },
      { key: 'moderation_source', label: '审核来源', type: 'badge' },
      { key: 'moderation_score', label: '审核分数', type: 'number' },
      { key: 'moderation_reason', label: '审核原因', maxLength: 24 },
      { key: 'created_at', label: '上传时间', type: 'datetime' }
    ],
    fields: [],
    cardView: {
      imageKey: 'url',
      placeholderIcon: '🖼️',
      titleKey: 'username',
      titleLabel: '上传者',
      subtitleKey: 'moderation_status',
      subtitleType: 'badge',
      statusKey: 'moderation_status',
      statusMeta: {
        approved: { label: '已通过', tone: 'success' },
        rejected: { label: '已拒绝', tone: 'error' },
        pending: { label: '待审核', tone: 'warning' },
        reviewing: { label: '审核中', tone: 'info' }
      },
      stats: [
        { label: '来源', key: 'moderation_source', values: { auto: 'AI自动', manual: '人工' } },
        { label: '分数', key: 'moderation_score' }
      ],
      meta: [
        { label: '帖子ID', key: 'post_id', copyable: true },
        { label: '审核原因', key: 'moderation_reason' },
        { label: '上传时间', key: 'created_at', format: 'datetime' }
      ]
    }
  },
  // ========== Cloudinary 待上传 ==========
  cloudinaryUploads: {
    table: 'cloudinary_pending_uploads',
    columns: [
      { key: 'id', label: 'ID', maxLength: 24 },
      { key: 'username', label: '用户名' },
      { key: 'status', label: '状态', type: 'badge' },
      { key: 'error_message', label: '错误', maxLength: 30 },
      { key: 'retry_count', label: '重试次数', type: 'number' },
      { key: 'created_at', label: '创建时间', type: 'datetime' },
      { key: 'updated_at', label: '更新时间', type: 'datetime' }
    ],
    fields: []
  },
  // ========== API Key 审计日志 ==========
  apiKeyAuditLogs: {
    table: 'api_key_vault_audit_logs',
    columns: [
      { key: 'id', label: 'ID', maxLength: 24 },
      { key: 'action', label: '操作', type: 'badge' },
      { key: 'provider', label: '供应商' },
      { key: 'purpose', label: '用途' },
      { key: 'operator_name', label: '操作人' },
      { key: 'created_at', label: '时间', type: 'datetime' }
    ],
    fields: []
  },
  // ========== AI 联网搜索日志 ==========
  aiWebSearchLog: {
    table: 'ai_web_search_log',
    columns: [
      { key: 'id', label: 'ID', maxLength: 24 },
      { key: 'username', label: '用户名' },
      { key: 'tier', label: '档位', type: 'badge' },
      { key: 'status', label: '状态', type: 'badge' },
      { key: 'settled_at', label: '结算时间', type: 'datetime' },
      { key: 'created_at', label: '创建时间', type: 'datetime' }
    ],
    fields: []
  },
  // ========== 周年订阅领取 ==========
  anniversaryClaims: {
    table: 'anniversary_subscription_claims',
    columns: [
      { key: 'id', label: 'ID', maxLength: 24 },
      { key: 'username', label: '用户名' },
      { key: 'plan_code', label: '方案' },
      { key: 'started_at', label: '开始时间', type: 'datetime' },
      { key: 'expires_at', label: '到期时间', type: 'datetime' },
      { key: 'created_at', label: '领取时间', type: 'datetime' }
    ],
    fields: []
  },
  // ========== 方块墙 ==========
  blockWallItems: {
    table: 'block_wall_items',
    columns: [
      { key: 'id', label: 'ID', maxLength: 24 },
      { key: 'author_username', label: '作者' },
      { key: 'item_type', label: '类型', type: 'badge' },
      { key: 'content', label: '内容', maxLength: 24 },
      { key: 'color', label: '颜色', type: 'badge' },
      { key: 'image_url', label: '图片', type: 'image' },
      { key: 'created_at', label: '创建时间', type: 'datetime' }
    ],
    fields: [
      { key: 'id', label: 'ID', type: 'text', disabled: true, group: 'basic' },
      { key: 'author_id', label: '作者ID', type: 'text', disabled: true, group: 'basic' },
      { key: 'author_username', label: '作者', type: 'text', disabled: true, group: 'basic' },
      { key: 'item_type', label: '类型', type: 'select', options: [
        { value: 'text', label: '文字' },
        { value: 'image', label: '图片' }
      ], group: 'content' },
      { key: 'content', label: '内容', type: 'textarea', rows: 3, group: 'content' },
      { key: 'color', label: '颜色', type: 'text', placeholder: '如 #FF6B6B', group: 'content' },
      { key: 'image_url', label: '图片URL', type: 'image', group: 'media' },
      { key: 'image_public_id', label: '图片Public ID', type: 'text', disabled: true, group: 'media' },
      { key: 'position_x', label: 'X坐标', type: 'number', step: 0.1, group: 'position' },
      { key: 'position_y', label: 'Y坐标', type: 'number', step: 0.1, group: 'position' },
      { key: 'rotation', label: '旋转角度', type: 'number', step: 1, group: 'position' }
    ],
    cardView: {
      imageKey: 'image_url',
      placeholderIcon: '🧱',
      titleKey: 'author_username',
      titleLabel: '作者',
      subtitleKey: 'item_type',
      subtitleType: 'badge',
      statusKey: 'item_type',
      statusMeta: {
        text: { label: '文字', tone: 'info' },
        image: { label: '图片', tone: 'success' }
      },
      stats: [
        { label: '颜色', key: 'color' }
      ],
      meta: [
        { label: '内容', key: 'content' },
        { label: '位置', key: 'position_x', format: 'coord', pairKey: 'position_y' },
        { label: '旋转', key: 'rotation', suffix: '°' },
        { label: '创建时间', key: 'created_at', format: 'datetime' }
      ]
    }
  },
  // ========== 创作者展示 ==========
  bohCreatorShows: {
    table: 'boh_creator_shows',
    columns: [
      { key: 'id', label: 'ID', maxLength: 24 },
      { key: 'author_username', label: '作者' },
      { key: 'creator_platform', label: '平台', type: 'badge' },
      { key: 'title', label: '标题', maxLength: 24 },
      { key: 'description', label: '描述', maxLength: 30 },
      { key: 'video_url', label: '视频链接', maxLength: 24 },
      { key: 'created_at', label: '创建时间', type: 'datetime' }
    ],
    fields: [
      { key: 'id', label: 'ID', type: 'text', disabled: true, group: 'basic' },
      { key: 'author_id', label: '作者ID', type: 'text', disabled: true, group: 'basic' },
      { key: 'author_username', label: '作者', type: 'text', disabled: true, group: 'basic' },
      { key: 'creator_platform', label: '平台', type: 'select', options: [
        { value: 'bilibili', label: '哔哩哔哩' },
        { value: 'douyin', label: '抖音' },
        { value: 'youtube', label: 'YouTube' },
        { value: 'xiaohongshu', label: '小红书' },
        { value: 'other', label: '其他' }
      ], group: 'basic' },
      { key: 'creator_platform_id', label: '平台ID', type: 'text', group: 'basic' },
      { key: 'title', label: '标题', type: 'text', required: true, group: 'content' },
      { key: 'description', label: '描述', type: 'textarea', rows: 3, group: 'content' },
      { key: 'video_url', label: '视频链接', type: 'text', required: true, group: 'content' }
    ],
    cardView: {
      placeholderIcon: '🎬',
      titleKey: 'title',
      subtitleKey: 'author_username',
      subtitleLabel: '作者',
      statusKey: 'creator_platform',
      statusMeta: {
        bilibili: { label: '哔哩哔哩', tone: 'info' },
        douyin: { label: '抖音', tone: 'success' },
        youtube: { label: 'YouTube', tone: 'error' },
        xiaohongshu: { label: '小红书', tone: 'warning' },
        other: { label: '其他', tone: 'muted' }
      },
      stats: [
        { label: '平台ID', key: 'creator_platform_id' }
      ],
      meta: [
        { label: '描述', key: 'description' },
        { label: '视频链接', key: 'video_url', copyable: true },
        { label: '创建时间', key: 'created_at', format: 'datetime' }
      ]
    }
  },
  // ========== 生日活动 ==========
  birthdayEvents: {
    table: 'birthday_events',
    columns: [
      { key: 'id', label: 'ID', maxLength: 24 },
      { key: 'title', label: '标题', maxLength: 20 },
      { key: 'target_username', label: '寿星' },
      { key: 'celebration_date', label: '庆祝日期', type: 'date' },
      { key: 'is_active', label: '状态', type: 'badge' },
      { key: 'sort_order', label: '排序', type: 'number' },
      { key: 'created_at', label: '创建时间', type: 'datetime' }
    ],
    fields: [
      { key: 'id', label: 'ID', type: 'text', disabled: true, group: 'basic' },
      { key: 'target_user_id', label: '寿星用户ID', type: 'user-picker', required: true, group: 'basic' },
      { key: 'title', label: '标题', type: 'text', required: true, group: 'basic' },
      { key: 'subtitle', label: '副标题', type: 'text', group: 'basic' },
      { key: 'hero_quote', label: '英雄区引言', type: 'textarea', rows: 2, group: 'content' },
      { key: 'page_copy', label: '页面文案', type: 'json', group: 'content' },
      { key: 'celebration_date', label: '庆祝日期', type: 'date', required: true, group: 'time' },
      { key: 'is_active', label: '启用', type: 'select', options: BOOLEAN_DISPLAY_OPTIONS, group: 'time' },
      { key: 'sort_order', label: '排序', type: 'number', min: 0, group: 'time' }
    ],
    cardView: {
      placeholderIcon: '🎂',
      titleKey: 'title',
      subtitleKey: 'target_username',
      subtitleLabel: '寿星',
      statusKey: 'is_active',
      statusMeta: {
        true: { label: '进行中', tone: 'success' },
        false: { label: '已结束', tone: 'muted' }
      },
      stats: [
        { label: '庆祝日期', key: 'celebration_date', format: 'date' },
        { label: '排序', key: 'sort_order' }
      ],
      meta: [
        { label: '副标题', key: 'subtitle' },
        { label: '引言', key: 'hero_quote' },
        { label: '创建时间', key: 'created_at', format: 'datetime' }
      ]
    }
  },
  // ========== 生日祝福 ==========
  birthdayWishes: {
    table: 'birthday_wishes',
    columns: [
      { key: 'id', label: 'ID', maxLength: 24 },
      { key: 'author_name', label: '作者' },
      { key: 'content', label: '内容', maxLength: 36 },
      { key: 'status', label: '状态', type: 'badge' },
      { key: 'is_featured', label: '精选', type: 'badge' },
      { key: 'likes', label: '点赞', type: 'number' },
      { key: 'created_at', label: '创建时间', type: 'datetime' }
    ],
    fields: [
      { key: 'id', label: 'ID', type: 'text', disabled: true, group: 'basic' },
      { key: 'event_id', label: '活动ID', type: 'text', disabled: true, group: 'basic' },
      { key: 'author_name', label: '作者', type: 'text', disabled: true, group: 'basic' },
      { key: 'author_id', label: '作者ID', type: 'text', disabled: true, group: 'basic' },
      { key: 'content', label: '内容', type: 'textarea', rows: 4, disabled: true, group: 'content' },
      { key: 'status', label: '状态', type: 'select', options: BIRTHDAY_WISH_STATUS_OPTIONS, group: 'moderation' },
      { key: 'is_featured', label: '精选', type: 'select', options: BOOLEAN_DISPLAY_OPTIONS, group: 'moderation' }
    ],
    cardView: {
      placeholderIcon: '💌',
      titleKey: 'author_name',
      titleLabel: '作者',
      subtitleKey: 'status',
      subtitleType: 'badge',
      statusKey: 'status',
      statusMeta: {
        pending: { label: '待审核', tone: 'warning' },
        approved: { label: '已通过', tone: 'success' },
        rejected: { label: '已拒绝', tone: 'error' }
      },
      stats: [
        { label: '精选', key: 'is_featured', values: { true: '⭐ 精选', false: '普通' } },
        { label: '点赞', key: 'likes' }
      ],
      meta: [
        { label: '祝福内容', key: 'content' },
        { label: '活动ID', key: 'event_id', copyable: true },
        { label: '创建时间', key: 'created_at', format: 'datetime' }
      ]
    }
  },
  // ========== 用户关注关系 ==========
  userFollows: {
    table: 'user_follows',
    columns: [
      { key: 'id', label: 'ID', maxLength: 24 },
      { key: 'follower_name', label: '关注者' },
      { key: 'following_name', label: '被关注者' },
      { key: 'created_at', label: '关注时间', type: 'datetime' }
    ],
    fields: []
  },
  // ========== 用户访客记录 ==========
  userImpressions: {
    table: 'user_impressions',
    columns: [
      { key: 'id', label: 'ID', maxLength: 24 },
      { key: 'author_name', label: '访客' },
      { key: 'target_name', label: '被访者' },
      { key: 'created_at', label: '时间', type: 'datetime' }
    ],
    fields: []
  },
  // ========== 实验室使用记录 ==========
  labUsageRecords: {
    table: 'lab_usage_records',
    columns: [
      { key: 'id', label: 'ID', maxLength: 24 },
      { key: 'username', label: '用户名' },
      { key: 'device_id', label: '设备ID', maxLength: 20 },
      { key: 'flow_type', label: '流程类型', type: 'badge' },
      { key: 'expires_at', label: '过期时间', type: 'datetime' },
      { key: 'created_at', label: '创建时间', type: 'datetime' }
    ],
    fields: []
  }
};
