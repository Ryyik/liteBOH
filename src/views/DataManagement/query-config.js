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
  forum: 'status',
  reportedPosts: 'status',
  reviewPosts: 'status',
  reviewComments: 'status',
  coreMemories: 'status',
  bohaiModels: 'status',
  lotteries: 'status',
  lotterySchedulerLogs: 'status',
  lotteryNotificationJobs: 'status',
  lotteryJoinAttempts: 'result_code',
  news: 'category',
  products: 'category'
};

export const DATE_FILTER_FIELDS = {
  users: 'created_at',
  points: 'join_date',
  subscriptions: 'expires_at',
  gifts: 'created_at',
  forum: 'created_at',
  reportedPosts: 'updated_at',
  reviewPosts: 'created_at',
  reviewComments: 'created_at',
  coreMemories: 'updated_at',
  bohaiModels: 'updated_at',
  lotteries: 'draw_at',
  lotteryEntries: 'created_at',
  lotteryDrawLogs: 'created_at',
  lotterySchedulerLogs: 'started_at',
  lotteryNotificationJobs: 'created_at',
  lotteryJoinAttempts: 'created_at',
  news: 'date',
  activities: 'date'
};

export const TAB_SELECT_COLUMNS = {
  users: 'id, username, email, role, points, experience, join_date, bio, avatar_url, tags, shipping_recipient, shipping_phone, shipping_address',
  points: 'id, username, email, role, points, experience, join_date',
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
    profile:user_id(username, email)
  `,
  gifts: `
    id,
    user_id,
    gift_no,
    gift_content,
    gift_price,
    gift_image,
    gift_status,
    is_active,
    created_at,
    completed_at,
    updated_at,
    profile:user_id(username, shipping_recipient, shipping_phone, shipping_address)
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
  bohaiModels: 'id, mode_id, display_name, tagline, description, provider, provider_label, model_id, api_url, capability, icon, temperature, top_p, frequency_penalty, max_tokens, status, sort_order, notes, created_by, updated_by, created_at, updated_at',
  lotteries: 'id, title, description, prize_title, prize_description, cover_image_url, status, is_community_visible, max_entries, winner_count, entry_deadline_at, draw_at, drawn_at, draw_attempted_at, draw_failed_at, draw_failure_message, draw_entry_count_snapshot, draw_candidate_hash, draw_algorithm_version, winner_entry_id, winner_user_id, winner_username, fulfillment_status, created_by, updated_by, created_at, updated_at',
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
  news: 'id, category, title, excerpt, date, author, image, content, created_at, updated_at',
  activities: 'id, title, date, image, description, created_at, updated_at',
  products: 'id, title, category, description, points_cost, stock, image, specifications'
};

export const LOTTERY_LEGACY_SELECT_COLUMNS = 'id, title, description, prize_title, prize_description, cover_image_url, status, is_community_visible, max_entries, winner_count, entry_deadline_at, draw_at, drawn_at, winner_entry_id, winner_user_id, winner_username, fulfillment_status, created_by, updated_by, created_at, updated_at';

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
  forum: { column: 'created_at', ascending: false },
  reportedPosts: { column: 'updated_at', ascending: false },
  reviewPosts: { column: 'created_at', ascending: false },
  reviewComments: { column: 'created_at', ascending: false },
  coreMemories: { column: 'priority', ascending: false, secondary: { column: 'updated_at', ascending: false } },
  bohaiModels: { column: 'sort_order', ascending: true, secondary: { column: 'display_name', ascending: true } },
  lotteries: { column: 'created_at', ascending: false },
  lotteryEntries: { column: 'created_at', ascending: true },
  lotteryDrawLogs: { column: 'created_at', ascending: false },
  lotterySchedulerLogs: { column: 'started_at', ascending: false },
  lotteryNotificationJobs: { column: 'created_at', ascending: false },
  lotteryJoinAttempts: { column: 'created_at', ascending: false },
  news: { column: 'date', ascending: false },
  activities: { column: 'date', ascending: false },
  products: { column: 'id', ascending: true }
};

export const TAB_SORT_COLUMNS = {
  users: new Set(['username', 'email', 'role', 'points', 'join_date']),
  points: new Set(['username', 'role', 'points', 'experience', 'join_date']),
  subscriptions: new Set(['plan_code', 'billing_cycle', 'status', 'started_at', 'expires_at', 'points_cost']),
  gifts: new Set(['created_at', 'completed_at', 'gift_status', 'gift_price']),
  forum: new Set(['created_at', 'status', 'author_username']),
  reportedPosts: new Set(['updated_at', 'created_at', 'status', 'author_username']),
  reviewPosts: new Set(['created_at', 'status', 'author_username']),
  reviewComments: new Set(['created_at', 'status', 'author_username']),
  coreMemories: new Set(['priority', 'updated_at', 'category', 'status']),
  bohaiModels: new Set(['sort_order', 'display_name', 'provider', 'capability', 'status', 'updated_at']),
  lotteries: new Set(['created_at', 'status', 'fulfillment_status', 'draw_at', 'drawn_at']),
  lotteryEntries: new Set(['created_at', 'lottery_id', 'user_id']),
  lotteryDrawLogs: new Set(['created_at', 'draw_no', 'lottery_id']),
  lotterySchedulerLogs: new Set(['started_at', 'status', 'run_source', 'due_count', 'failed_count']),
  lotteryNotificationJobs: new Set(['created_at', 'status', 'lottery_id', 'user_id', 'draw_no']),
  lotteryJoinAttempts: new Set(['created_at', 'result_code', 'lottery_id', 'user_id']),
  news: new Set(['id', 'date', 'category', 'author']),
  activities: new Set(['id', 'date', 'created_at']),
  products: new Set(['id', 'category', 'points_cost', 'stock'])
};

export const TAB_SEARCH_FIELDS = {
  users: [{ column: 'id', type: 'uuid' }, { column: 'username', type: 'text' }, { column: 'email', type: 'text' }, { column: 'role', type: 'text' }],
  points: [{ column: 'id', type: 'uuid' }, { column: 'username', type: 'text' }, { column: 'email', type: 'text' }, { column: 'role', type: 'text' }],
  subscriptions: [{ column: 'id', type: 'uuid' }, { column: 'user_id', type: 'uuid' }, { column: 'plan_code', type: 'text' }, { column: 'plan_name', type: 'text' }, { column: 'status', type: 'text' }],
  gifts: [{ column: 'id', type: 'uuid' }, { column: 'user_id', type: 'uuid' }, { column: 'gift_no', type: 'text' }, { column: 'gift_content', type: 'text' }, { column: 'gift_status', type: 'text' }],
  forum: [{ column: 'id', type: 'uuid' }, { column: 'author_id', type: 'uuid' }, { column: 'author_username', type: 'text' }, { column: 'content', type: 'text' }, { column: 'status', type: 'text' }],
  reportedPosts: [{ column: 'id', type: 'uuid' }, { column: 'author_id', type: 'uuid' }, { column: 'author_username', type: 'text' }, { column: 'content', type: 'text' }, { column: 'status', type: 'text' }],
  reviewPosts: [{ column: 'id', type: 'uuid' }, { column: 'author_id', type: 'uuid' }, { column: 'author_username', type: 'text' }, { column: 'content', type: 'text' }, { column: 'status', type: 'text' }],
  reviewComments: [{ column: 'id', type: 'uuid' }, { column: 'post_id', type: 'uuid' }, { column: 'author_id', type: 'uuid' }, { column: 'author_username', type: 'text' }, { column: 'content', type: 'text' }, { column: 'status', type: 'text' }],
  coreMemories: [{ column: 'id', type: 'uuid' }, { column: 'title', type: 'text' }, { column: 'content', type: 'text' }, { column: 'category', type: 'text' }, { column: 'status', type: 'text' }],
  bohaiModels: [{ column: 'id', type: 'uuid' }, { column: 'mode_id', type: 'text' }, { column: 'display_name', type: 'text' }, { column: 'provider', type: 'text' }, { column: 'model_id', type: 'text' }, { column: 'capability', type: 'text' }, { column: 'status', type: 'text' }],
  lotteries: [{ column: 'id', type: 'uuid' }, { column: 'title', type: 'text' }, { column: 'prize_title', type: 'text' }, { column: 'status', type: 'text' }, { column: 'fulfillment_status', type: 'text' }, { column: 'winner_username', type: 'text' }],
  lotteryEntries: [{ column: 'id', type: 'uuid' }, { column: 'lottery_id', type: 'uuid' }, { column: 'user_id', type: 'uuid' }, { column: 'username_snapshot', type: 'text' }],
  lotteryDrawLogs: [{ column: 'id', type: 'uuid' }, { column: 'lottery_id', type: 'uuid' }, { column: 'user_id', type: 'uuid' }, { column: 'username_snapshot', type: 'text' }, { column: 'reason', type: 'text' }],
  lotterySchedulerLogs: [{ column: 'id', type: 'uuid' }, { column: 'run_source', type: 'text' }, { column: 'status', type: 'text' }, { column: 'error_message', type: 'text' }],
  lotteryNotificationJobs: [{ column: 'id', type: 'uuid' }, { column: 'lottery_id', type: 'uuid' }, { column: 'user_id', type: 'uuid' }, { column: 'status', type: 'text' }, { column: 'last_error', type: 'text' }],
  lotteryJoinAttempts: [{ column: 'id', type: 'uuid' }, { column: 'lottery_id', type: 'uuid' }, { column: 'user_id', type: 'uuid' }, { column: 'result_code', type: 'text' }, { column: 'message', type: 'text' }],
  news: [{ column: 'id', type: 'number' }, { column: 'category', type: 'text' }, { column: 'title', type: 'text' }, { column: 'excerpt', type: 'text' }, { column: 'author', type: 'text' }],
  activities: [{ column: 'id', type: 'number' }, { column: 'title', type: 'text' }, { column: 'date', type: 'text' }, { column: 'description', type: 'text' }],
  products: [{ column: 'id', type: 'number' }, { column: 'title', type: 'text' }, { column: 'category', type: 'text' }, { column: 'description', type: 'text' }]
};
