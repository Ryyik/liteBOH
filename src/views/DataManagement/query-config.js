export const ADMIN_SECTION_DEFAULT_TABS = {
  data: 'users'
};

export const DATA_CONSOLE_SECTIONS = new Set(['data', 'api-keys', 'freemodels', 'moderation-model', 'lab-ai-model']);
export const PLACEHOLDER_ADMIN_SECTIONS = new Set(['media', 'settings']);
export const STATUS_FILTER_FIELDS = {
  users: 'role',
  points: 'role',
  subscriptions: 'status',
  gifts: 'gift_status',
  posterRequests: 'status',
  forum: 'status',
  ads: 'status',
  reportedPosts: 'status',
  reviewPosts: 'status',
  reviewComments: 'status',
  coreMemories: 'status',
  bohaiModels: 'status',
  lotteries: 'status',
  lotteryFulfillments: 'status',
  lotterySchedulerLogs: 'status',
  lotteryNotificationJobs: 'status',
  lotteryJoinAttempts: 'result_code',
  lotteryAuditLogs: 'action',
  news: 'category',
  products: 'category',
  shopOrders: 'status',
  pointsTransactions: 'reason',
  notifications: 'type',
  moderationLogs: 'target_type',
  forumPostReports: 'status',
  forumPostImages: 'moderation_status',
  cloudinaryUploads: 'status',
  birthdayEvents: 'is_active',
  birthdayWishes: 'status',
  blockWallItems: 'item_type',
  bohCreatorShows: 'creator_platform',
  aiWebSearchLog: 'status',
  postReward: 'status'
};

export const DATE_FILTER_FIELDS = {
  users: 'created_at',
  points: 'join_date',
  subscriptions: 'expires_at',
  gifts: 'created_at',
  posterRequests: 'created_at',
  forum: 'created_at',
  ads: 'created_at',
  reportedPosts: 'updated_at',
  reviewPosts: 'created_at',
  reviewComments: 'created_at',
  coreMemories: 'updated_at',
  bohaiModels: 'updated_at',
  lotteries: 'draw_at',
  lotteryFulfillments: 'updated_at',
  lotteryEntries: 'created_at',
  lotteryDrawLogs: 'created_at',
  lotteryFailureStats: 'last_participated_at',
  lotterySchedulerLogs: 'started_at',
  lotteryNotificationJobs: 'created_at',
  lotteryJoinAttempts: 'created_at',
  lotteryAuditLogs: 'created_at',
  news: 'date',
  activities: 'date',
  postReward: 'start_at',
  shopOrders: 'created_at',
  pointsTransactions: 'created_at',
  notifications: 'created_at',
  moderationLogs: 'created_at',
  forumPostReports: 'created_at',
  forumWeeklyCheckins: 'signed_at',
  forumPostImages: 'created_at',
  cloudinaryUploads: 'created_at',
  apiKeyAuditLogs: 'created_at',
  aiWebSearchLog: 'created_at',
  anniversaryClaims: 'created_at',
  blockWallItems: 'created_at',
  bohCreatorShows: 'created_at',
  birthdayEvents: 'celebration_date',
  birthdayWishes: 'created_at',
  userFollows: 'created_at',
  userImpressions: 'created_at',
  labUsageRecords: 'created_at'
};

export const TAB_SELECT_COLUMNS = {
  // H-1 修复：profiles 敏感字段已通过列级权限收窄，
  // users tab 的 email/shipping_* 改由 fetchTabData 中调用 admin_list_users_with_sensitive RPC 获取
  users: 'id, username, role, points, experience, join_date, bio, avatar_url, tags',
  points: 'id, username, role, points, experience, join_date',
  subscriptions: `
    id,
    user_id,
    plan_code,
    plan_name,
    billing_cycle,
    points_cost,
    duration_months,
    started_at,
    expires_at,
    status,
    metadata,
    created_at,
    updated_at,
    profile:user_id(username)
  `,
  gifts: `
    id,
    user_id,
    gift_no,
    gift_content,
    gift_price,
    gift_points,
    gift_image,
    gift_status,
    is_active,
    address_id,
    created_at,
    completed_at,
    updated_at,
    profile:user_id(username)
  `,
  addresses: `
    id,
    user_id,
    recipient,
    phone,
    region,
    detail,
    tag,
    is_default,
    created_at,
    updated_at,
    profile:user_id(username)
  `,
  posterRequests: `
    id,
    campaign_code,
    user_id,
    recipient,
    phone,
    address,
    material_fee,
    status,
    created_at,
    profile:user_id(username)
  `,
  forum: `
    id,
    content,
    author_id,
    author_username,
    created_at,
    updated_at,
    status,
    likes_count:likes(count)
  `,
  ads: `
    id,
    title,
    placement,
    status,
    image_url,
    link_url,
    sort_order,
    feed_interval,
    clicks,
    created_at,
    updated_at
  `,
  reportedPosts: `
    id,
    content,
    author_id,
    author_username,
    created_at,
    updated_at,
    status,
    reports:forum_post_reports(id, reason, status, created_at, reporter_id)
  `,
  reviewPosts: 'id, content, author_id, author_username, created_at, updated_at, status',
  reviewComments: 'id, post_id, author_id, author_username, content, created_at, status, parent_id, reply_to_username',
  coreMemories: 'id, title, content, category, tags, priority, source_label, source_url, status, updated_by, created_at, updated_at',
  bohaiModels: 'id, mode_id, display_name, tagline, description, provider, provider_label, model_id, api_url, capability, icon, temperature, top_p, frequency_penalty, max_tokens, quota_multiplier, min_tier, status, sort_order, notes, created_by, updated_by, created_at, updated_at',
  lotteries: 'id, title, description, prize_title, prize_description, pity_reward_title, pity_reward_description, pity_overflow_reward_title, pity_overflow_reward_description, cover_image_url, status, is_community_visible, is_home_visible, enforce_account_age_check, max_entries, winner_count, pity_mode, entry_deadline_at, draw_at, drawn_at, draw_attempted_at, draw_failed_at, draw_failure_message, draw_entry_count_snapshot, draw_candidate_hash, draw_algorithm_version, winner_entry_id, winner_user_id, winner_username, fulfillment_status, created_by, updated_by, created_at, updated_at',
  lotteryFulfillments: `
    id,
    lottery_id,
    draw_no,
    winner_position,
    entry_id,
    user_id,
    username_snapshot,
    award_kind,
    award_title,
    award_description,
    status,
    is_current,
    replacement_of,
    disqualification_reason,
    contact_note,
    address_id,
    shipping_carrier,
    tracking_number,
    contacted_at,
    confirmed_at,
    fulfilled_at,
    created_at,
    updated_at,
    lottery:lottery_id(title),
    profile:user_id(username, email)
  `,
  lotteryEntries: `
    id,
    lottery_id,
    user_id,
    username_snapshot,
    created_at,
    lottery:lottery_id(title),
    profile:user_id(username, email, join_date)
  `,
  lotteryDrawLogs: `
    id,
    lottery_id,
    draw_no,
    winner_position,
    entry_id,
    user_id,
    username_snapshot,
    drawn_by,
    reason,
    created_at,
    lottery:lottery_id(title),
    drawer:drawn_by(username, email)
  `,
  lotteryFailureStats: 'id, user_id, username, total_participations, win_count, failure_count, current_failure_streak, failure_rate, last_result_label, last_participated_at, latest_lottery_id, latest_lottery_title',
  lotterySchedulerLogs: `
    id,
    run_source,
    status,
    checked_count,
    drawn_count,
    failed_count,
    due_count,
    started_at,
    finished_at,
    duration_ms,
    error_message,
    details,
    created_at
  `,
  lotteryNotificationJobs: `
    id,
    lottery_id,
    draw_no,
    winner_position,
    user_id,
    type,
    content,
    status,
    notification_id,
    attempt_count,
    last_error,
    created_at,
    updated_at,
    lottery:lottery_id(title),
    profile:user_id(username, email)
  `,
  lotteryJoinAttempts: `
    id,
    lottery_id,
    user_id,
    result_code,
    message,
    created_at,
    lottery:lottery_id(title),
    profile:user_id(username, email)
  `,
  lotteryAuditLogs: `
    id,
    lottery_id,
    fulfillment_id,
    actor_id,
    action,
    detail,
    created_at,
    lottery:lottery_id(title),
    actor:actor_id(username, email)
  `,
  news: 'id, category, title, excerpt, date, author, image, content, created_at, updated_at',
  activities: 'id, title, date, image, description, created_at, updated_at',
  postReward: 'id, title, status, points_per_post, daily_limit, monthly_limit, start_at, end_at, created_at',
  products: 'id, title, category, description, points_cost, rmb_price, payment_mode, stock, image, specifications, is_active, is_purchasable',

  // ========== 商城订单 ==========
  shopOrders: `
    id,
    order_no,
    user_id,
    contact_type,
    contact_value,
    items,
    total_points,
    rmb_total,
    payment_mode,
    points_used,
    status,
    created_at,
    updated_at,
    profile:user_id(username)
  `,

  // ========== 积分流水 ==========
  pointsTransactions: `
    id,
    user_id,
    amount,
    balance_after,
    reason,
    remark,
    operator_id,
    batch_id,
    created_at,
    profile:user_id(username),
    operator:operator_id(username)
  `,

  // ========== 通知管理 ==========
  notifications: `
    id,
    recipient_id,
    sender_id,
    type,
    content,
    status,
    post_id,
    comment_id,
    archived_at,
    created_at,
    recipient:recipient_id(username),
    sender:sender_id(username)
  `,

  // ========== 审核日志 ==========
  moderationLogs: `
    id,
    target_type,
    target_id,
    ai_result,
    ai_reason,
    moderator_id,
    moderator_name,
    created_at
  `,

  // ========== 举报明细 ==========
  forumPostReports: `
    id,
    post_id,
    reporter_id,
    reason,
    detail,
    status,
    resolved_by,
    resolution_note,
    created_at,
    resolved_at,
    reporter:reporter_id(username),
    resolver:resolved_by(username),
    post:post_id(content, author_username)
  `,

  // ========== 每周签到 ==========
  forumWeeklyCheckins: `
    id,
    user_id,
    week_start_date,
    signed_at,
    created_at,
    profile:user_id(username)
  `,

  // ========== 论坛图片审核 ==========
  forumPostImages: `
    id,
    post_id,
    user_id,
    url,
    moderation_status,
    moderation_source,
    moderation_score,
    moderation_reason,
    created_at,
    profile:user_id(username)
  `,

  // ========== Cloudinary 待上传 ==========
  cloudinaryUploads: `
    id,
    user_id,
    status,
    error_message,
    retry_count,
    created_at,
    updated_at,
    profile:user_id(username)
  `,

  // ========== API Key 审计日志 ==========
  apiKeyAuditLogs: `
    id,
    action,
    provider,
    purpose,
    operator_id,
    operator_name,
    created_at
  `,

  // ========== AI 联网搜索日志 ==========
  aiWebSearchLog: `
    id,
    user_id,
    tier,
    status,
    settled_at,
    created_at,
    profile:user_id(username)
  `,

  // ========== 周年订阅领取 ==========
  anniversaryClaims: `
    id,
    user_id,
    plan_code,
    started_at,
    expires_at,
    created_at,
    profile:user_id(username)
  `,

  // ========== 方块墙 ==========
  blockWallItems: `
    id,
    author_id,
    author_username,
    item_type,
    content,
    color,
    image_url,
    image_public_id,
    position_x,
    position_y,
    rotation,
    created_at,
    author:author_id(username)
  `,

  // ========== 创作者展示 ==========
  bohCreatorShows: `
    id,
    author_id,
    author_username,
    creator_platform,
    creator_platform_id,
    title,
    description,
    video_url,
    created_at,
    author:author_id(username)
  `,

  // ========== 生日活动 ==========
  birthdayEvents: `
    id,
    target_user_id,
    target_username,
    title,
    subtitle,
    hero_quote,
    page_copy,
    celebration_date,
    is_active,
    sort_order,
    created_at
  `,

  // ========== 生日祝福 ==========
  birthdayWishes: `
    id,
    event_id,
    author_id,
    author_name,
    content,
    status,
    is_featured,
    likes,
    created_at,
    updated_at
  `,

  // ========== 用户关注关系 ==========
  userFollows: `
    id,
    follower_id,
    following_id,
    created_at,
    follower:follower_id(username),
    following:following_id(username)
  `,

  // ========== 用户访客记录 ==========
  userImpressions: `
    id,
    author_id,
    target_id,
    created_at,
    author:author_id(username),
    target:target_id(username)
  `,

  // ========== 实验室使用记录 ==========
  labUsageRecords: `
    id,
    user_id,
    username,
    device_id,
    flow_type,
    expires_at,
    created_at,
    profile:user_id(username)
  `
};

export const LOTTERY_LEGACY_SELECT_COLUMNS = 'id, title, description, prize_title, prize_description, cover_image_url, status, is_community_visible, is_home_visible, enforce_account_age_check, max_entries, winner_count, entry_deadline_at, draw_at, drawn_at, winner_entry_id, winner_user_id, winner_username, fulfillment_status, created_by, updated_by, created_at, updated_at';

export const isMissingLotteryObservabilitySchemaError = (error) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return code === '42703'
    || message.includes('draw_attempted_at')
    || message.includes('draw_failed_at')
    || message.includes('draw_candidate_hash')
    || message.includes('lottery_scheduler_logs')
    || message.includes('lottery_notification_jobs');
};

export const TAB_DEFAULT_SORT = {
  users: { column: 'join_date', ascending: false },
  points: { column: 'points', ascending: false },
  subscriptions: { column: 'expires_at', ascending: false },
  gifts: { column: 'created_at', ascending: false },
  posterRequests: { column: 'created_at', ascending: false },
  forum: { column: 'created_at', ascending: false },
  ads: { column: 'sort_order', ascending: true },
  reportedPosts: { column: 'updated_at', ascending: false },
  reviewPosts: { column: 'created_at', ascending: false },
  reviewComments: { column: 'created_at', ascending: false },
  coreMemories: { column: 'priority', ascending: false, secondary: { column: 'updated_at', ascending: false } },
  bohaiModels: { column: 'sort_order', ascending: true, secondary: { column: 'display_name', ascending: true } },
  lotteries: { column: 'created_at', ascending: false },
  lotteryEntries: { column: 'created_at', ascending: true },
  lotteryDrawLogs: { column: 'created_at', ascending: false },
  lotteryFailureStats: { column: 'failure_count', ascending: false },
  lotterySchedulerLogs: { column: 'started_at', ascending: false },
  lotteryFulfillments: { column: 'updated_at', ascending: false },
  lotteryNotificationJobs: { column: 'created_at', ascending: false },
  lotteryJoinAttempts: { column: 'created_at', ascending: false },
  lotteryAuditLogs: { column: 'created_at', ascending: false },
  news: { column: 'date', ascending: false },
  activities: { column: 'date', ascending: false },
  postReward: { column: 'start_at', ascending: false },
  products: { column: 'id', ascending: true },
  shopOrders: { column: 'created_at', ascending: false },
  pointsTransactions: { column: 'created_at', ascending: false },
  notifications: { column: 'created_at', ascending: false },
  moderationLogs: { column: 'created_at', ascending: false },
  forumPostReports: { column: 'created_at', ascending: false },
  forumWeeklyCheckins: { column: 'signed_at', ascending: false },
  forumPostImages: { column: 'created_at', ascending: false },
  cloudinaryUploads: { column: 'created_at', ascending: false },
  apiKeyAuditLogs: { column: 'created_at', ascending: false },
  aiWebSearchLog: { column: 'created_at', ascending: false },
  anniversaryClaims: { column: 'created_at', ascending: false },
  blockWallItems: { column: 'created_at', ascending: false },
  bohCreatorShows: { column: 'created_at', ascending: false },
  birthdayEvents: { column: 'celebration_date', ascending: false },
  birthdayWishes: { column: 'created_at', ascending: false },
  userFollows: { column: 'created_at', ascending: false },
  userImpressions: { column: 'created_at', ascending: false },
  labUsageRecords: { column: 'created_at', ascending: false }
};

export const TAB_SORT_COLUMNS = {
  users: new Set(['username', 'email', 'role', 'points', 'join_date']),
  points: new Set(['username', 'role', 'points', 'experience', 'join_date']),
  subscriptions: new Set(['plan_code', 'billing_cycle', 'status', 'started_at', 'expires_at', 'points_cost']),
  gifts: new Set(['created_at', 'completed_at', 'gift_status', 'gift_price']),
  posterRequests: new Set(['created_at', 'status', 'recipient']),
  forum: new Set(['created_at', 'status', 'author_username']),
  ads: new Set(['sort_order', 'status', 'placement', 'created_at']),
  reportedPosts: new Set(['updated_at', 'created_at', 'status', 'author_username']),
  reviewPosts: new Set(['created_at', 'status', 'author_username']),
  reviewComments: new Set(['created_at', 'status', 'author_username']),
  coreMemories: new Set(['priority', 'updated_at', 'category', 'status']),
  bohaiModels: new Set(['sort_order', 'display_name', 'provider', 'capability', 'min_tier', 'status', 'updated_at']),
  lotteries: new Set(['created_at', 'status', 'fulfillment_status', 'draw_at', 'drawn_at']),
  lotteryEntries: new Set(['created_at', 'lottery_id', 'user_id']),
  lotteryDrawLogs: new Set(['created_at', 'draw_no', 'lottery_id']),
  lotteryFailureStats: new Set(['username', 'total_participations', 'win_count', 'failure_count', 'current_failure_streak', 'failure_rate', 'last_participated_at']),
  lotterySchedulerLogs: new Set(['started_at', 'status', 'run_source', 'due_count', 'failed_count']),
  lotteryFulfillments: new Set(['updated_at', 'status', 'lottery_id', 'user_id', 'winner_position']),
  lotteryNotificationJobs: new Set(['created_at', 'status', 'lottery_id', 'user_id', 'draw_no']),
  lotteryJoinAttempts: new Set(['created_at', 'result_code', 'lottery_id', 'user_id']),
  lotteryAuditLogs: new Set(['created_at', 'action', 'lottery_id', 'actor_id']),
  news: new Set(['id', 'date', 'category', 'author']),
  activities: new Set(['id', 'date', 'created_at']),
  postReward: new Set(['id', 'status', 'points_per_post', 'daily_limit', 'monthly_limit', 'start_at', 'end_at', 'created_at']),
  products: new Set(['id', 'category', 'points_cost', 'rmb_price', 'payment_mode', 'stock']),
  shopOrders: new Set(['created_at', 'status', 'payment_mode', 'total_points', 'rmb_total']),
  pointsTransactions: new Set(['created_at', 'amount', 'reason', 'batch_id']),
  notifications: new Set(['created_at', 'type', 'status']),
  moderationLogs: new Set(['created_at', 'target_type', 'ai_result']),
  forumPostReports: new Set(['created_at', 'status', 'reason']),
  forumWeeklyCheckins: new Set(['signed_at', 'week_start_date']),
  forumPostImages: new Set(['created_at', 'moderation_status']),
  cloudinaryUploads: new Set(['created_at', 'status', 'retry_count']),
  apiKeyAuditLogs: new Set(['created_at', 'action', 'provider']),
  aiWebSearchLog: new Set(['created_at', 'status', 'tier']),
  anniversaryClaims: new Set(['created_at', 'expires_at']),
  blockWallItems: new Set(['created_at', 'item_type']),
  bohCreatorShows: new Set(['created_at', 'creator_platform']),
  birthdayEvents: new Set(['celebration_date', 'is_active', 'sort_order']),
  birthdayWishes: new Set(['created_at', 'status', 'is_featured']),
  userFollows: new Set(['created_at']),
  userImpressions: new Set(['created_at']),
  labUsageRecords: new Set(['created_at', 'flow_type'])
};

export const TAB_SEARCH_FIELDS = {
  // H-1 修复：email 已通过列级权限收窄，从搜索字段中移除
  users: [{ column: 'id', type: 'uuid' }, { column: 'username', type: 'text' }, { column: 'role', type: 'text' }],
  points: [{ column: 'id', type: 'uuid' }, { column: 'username', type: 'text' }, { column: 'role', type: 'text' }],
  subscriptions: [{ column: 'id', type: 'uuid' }, { column: 'user_id', type: 'uuid' }, { column: 'plan_code', type: 'text' }, { column: 'plan_name', type: 'text' }, { column: 'status', type: 'text' }],
  gifts: [{ column: 'id', type: 'uuid' }, { column: 'user_id', type: 'uuid' }, { column: 'gift_no', type: 'text' }, { column: 'gift_content', type: 'text' }, { column: 'gift_status', type: 'text' }],
  posterRequests: [{ column: 'id', type: 'uuid' }, { column: 'user_id', type: 'uuid' }, { column: 'recipient', type: 'text' }, { column: 'phone', type: 'text' }, { column: 'status', type: 'text' }],
  forum: [{ column: 'id', type: 'uuid' }, { column: 'author_id', type: 'uuid' }, { column: 'author_username', type: 'text' }, { column: 'content', type: 'text' }, { column: 'status', type: 'text' }],
  ads: [{ column: 'id', type: 'uuid' }, { column: 'title', type: 'text' }, { column: 'placement', type: 'text' }, { column: 'status', type: 'text' }],
  reportedPosts: [{ column: 'id', type: 'uuid' }, { column: 'author_id', type: 'uuid' }, { column: 'author_username', type: 'text' }, { column: 'content', type: 'text' }, { column: 'status', type: 'text' }],
  reviewPosts: [{ column: 'id', type: 'uuid' }, { column: 'author_id', type: 'uuid' }, { column: 'author_username', type: 'text' }, { column: 'content', type: 'text' }, { column: 'status', type: 'text' }],
  reviewComments: [{ column: 'id', type: 'uuid' }, { column: 'post_id', type: 'uuid' }, { column: 'author_id', type: 'uuid' }, { column: 'author_username', type: 'text' }, { column: 'content', type: 'text' }, { column: 'status', type: 'text' }],
  coreMemories: [{ column: 'id', type: 'uuid' }, { column: 'title', type: 'text' }, { column: 'content', type: 'text' }, { column: 'category', type: 'text' }, { column: 'status', type: 'text' }],
  bohaiModels: [{ column: 'id', type: 'uuid' }, { column: 'mode_id', type: 'text' }, { column: 'display_name', type: 'text' }, { column: 'provider', type: 'text' }, { column: 'model_id', type: 'text' }, { column: 'capability', type: 'text' }, { column: 'min_tier', type: 'text' }, { column: 'status', type: 'text' }],
  lotteries: [{ column: 'id', type: 'uuid' }, { column: 'title', type: 'text' }, { column: 'prize_title', type: 'text' }, { column: 'status', type: 'text' }, { column: 'fulfillment_status', type: 'text' }, { column: 'winner_username', type: 'text' }],
  lotteryEntries: [{ column: 'id', type: 'uuid' }, { column: 'lottery_id', type: 'uuid' }, { column: 'user_id', type: 'uuid' }, { column: 'username_snapshot', type: 'text' }],
  lotteryDrawLogs: [{ column: 'id', type: 'uuid' }, { column: 'lottery_id', type: 'uuid' }, { column: 'user_id', type: 'uuid' }, { column: 'username_snapshot', type: 'text' }, { column: 'reason', type: 'text' }],
  lotteryFailureStats: [{ column: 'id', type: 'uuid' }, { column: 'user_id', type: 'uuid' }, { column: 'username', type: 'text' }, { column: 'latest_lottery_title', type: 'text' }],
  lotterySchedulerLogs: [{ column: 'id', type: 'uuid' }, { column: 'run_source', type: 'text' }, { column: 'status', type: 'text' }, { column: 'error_message', type: 'text' }],
  lotteryFulfillments: [{ column: 'id', type: 'uuid' }, { column: 'lottery_id', type: 'uuid' }, { column: 'user_id', type: 'uuid' }, { column: 'username_snapshot', type: 'text' }, { column: 'status', type: 'text' }, { column: 'tracking_number', type: 'text' }],
  lotteryNotificationJobs: [{ column: 'id', type: 'uuid' }, { column: 'lottery_id', type: 'uuid' }, { column: 'user_id', type: 'uuid' }, { column: 'status', type: 'text' }, { column: 'last_error', type: 'text' }],
  lotteryJoinAttempts: [{ column: 'id', type: 'uuid' }, { column: 'lottery_id', type: 'uuid' }, { column: 'user_id', type: 'uuid' }, { column: 'result_code', type: 'text' }, { column: 'message', type: 'text' }],
  lotteryAuditLogs: [{ column: 'id', type: 'uuid' }, { column: 'lottery_id', type: 'uuid' }, { column: 'actor_id', type: 'uuid' }, { column: 'action', type: 'text' }],
  news: [{ column: 'id', type: 'number' }, { column: 'category', type: 'text' }, { column: 'title', type: 'text' }, { column: 'excerpt', type: 'text' }, { column: 'author', type: 'text' }],
  activities: [{ column: 'id', type: 'number' }, { column: 'title', type: 'text' }, { column: 'date', type: 'text' }, { column: 'description', type: 'text' }],
  postReward: [{ column: 'id', type: 'number' }, { column: 'title', type: 'text' }, { column: 'status', type: 'text' }, { column: 'start_at', type: 'text' }, { column: 'end_at', type: 'text' }],
  products: [{ column: 'id', type: 'number' }, { column: 'title', type: 'text' }, { column: 'category', type: 'text' }, { column: 'description', type: 'text' }, { column: 'payment_mode', type: 'text' }],
  shopOrders: [{ column: 'id', type: 'uuid' }, { column: 'order_no', type: 'text' }, { column: 'username', type: 'text' }, { column: 'contact_value', type: 'text' }, { column: 'status', type: 'text' }, { column: 'payment_mode', type: 'text' }],
  pointsTransactions: [{ column: 'id', type: 'uuid' }, { column: 'username', type: 'text' }, { column: 'reason', type: 'text' }, { column: 'remark', type: 'text' }, { column: 'batch_id', type: 'uuid' }],
  notifications: [{ column: 'id', type: 'uuid' }, { column: 'type', type: 'text' }, { column: 'content', type: 'text' }, { column: 'status', type: 'text' }],
  moderationLogs: [{ column: 'id', type: 'uuid' }, { column: 'target_type', type: 'text' }, { column: 'target_id', type: 'uuid' }, { column: 'ai_result', type: 'text' }, { column: 'moderator_name', type: 'text' }],
  forumPostReports: [{ column: 'id', type: 'uuid' }, { column: 'post_id', type: 'uuid' }, { column: 'reason', type: 'text' }, { column: 'detail', type: 'text' }, { column: 'status', type: 'text' }],
  forumWeeklyCheckins: [{ column: 'id', type: 'uuid' }, { column: 'username', type: 'text' }, { column: 'week_start_date', type: 'date' }],
  forumPostImages: [{ column: 'id', type: 'uuid' }, { column: 'post_id', type: 'uuid' }, { column: 'username', type: 'text' }, { column: 'moderation_status', type: 'text' }],
  cloudinaryUploads: [{ column: 'id', type: 'uuid' }, { column: 'username', type: 'text' }, { column: 'status', type: 'text' }, { column: 'error_message', type: 'text' }],
  apiKeyAuditLogs: [{ column: 'id', type: 'uuid' }, { column: 'action', type: 'text' }, { column: 'provider', type: 'text' }, { column: 'operator_name', type: 'text' }],
  aiWebSearchLog: [{ column: 'id', type: 'uuid' }, { column: 'username', type: 'text' }, { column: 'status', type: 'text' }, { column: 'tier', type: 'text' }],
  anniversaryClaims: [{ column: 'id', type: 'uuid' }, { column: 'username', type: 'text' }, { column: 'plan_code', type: 'text' }],
  blockWallItems: [{ column: 'id', type: 'uuid' }, { column: 'author_username', type: 'text' }, { column: 'content', type: 'text' }, { column: 'item_type', type: 'text' }],
  bohCreatorShows: [{ column: 'id', type: 'uuid' }, { column: 'author_username', type: 'text' }, { column: 'title', type: 'text' }, { column: 'creator_platform', type: 'text' }],
  birthdayEvents: [{ column: 'id', type: 'uuid' }, { column: 'title', type: 'text' }, { column: 'target_username', type: 'text' }],
  birthdayWishes: [{ column: 'id', type: 'uuid' }, { column: 'author_name', type: 'text' }, { column: 'content', type: 'text' }, { column: 'status', type: 'text' }],
  userFollows: [{ column: 'id', type: 'uuid' }, { column: 'follower_id', type: 'uuid' }, { column: 'following_id', type: 'uuid' }],
  userImpressions: [{ column: 'id', type: 'uuid' }, { column: 'author_id', type: 'uuid' }, { column: 'target_id', type: 'uuid' }],
  labUsageRecords: [{ column: 'id', type: 'uuid' }, { column: 'username', type: 'text' }, { column: 'device_id', type: 'text' }, { column: 'flow_type', type: 'text' }]
};
