import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

/*
用途: 认证 + 论坛 + 通知 + 签到的端到端链路测试

运行示例:

k6 run \
  -e BASE_URL="https://YOUR_PROJECT.supabase.co" \
  -e SUPABASE_ANON_KEY="YOUR_ANON_KEY" \
  -e TEST_MODE="smoke" \
  -e TEST_EMAIL="demo@example.com" \
  -e TEST_PASSWORD="your-password" \
  scripts/loadtest/k6-end-to-end-journey.js

可选环境变量:
- TEST_USER_ID: 跳过登录直接使用此 userId（需已认证）
- FORUM_POST_CONTENT_LENGTH (默认: 60)
- COMMENT_CONTENT_LENGTH (默认: 30)
- INSECURE_SKIP_TLS_VERIFY (默认: 0)
*/

const baseUrl = String(__ENV.BASE_URL || '').replace(/\/$/, '');
if (!baseUrl) throw new Error('BASE_URL is required');

const apiKey = String(__ENV.SUPABASE_ANON_KEY || '').trim();
const testMode = String(__ENV.TEST_MODE || 'smoke').trim().toLowerCase();
const testEmail = String(__ENV.TEST_EMAIL || '').trim();
const testPassword = String(__ENV.TEST_PASSWORD || '').trim();
const testUserId = String(__ENV.TEST_USER_ID || '').trim();
const insecureSkipTlsVerify = String(__ENV.INSECURE_SKIP_TLS_VERIFY || '0').trim() === '1';
const postContentLength = Math.min(Math.max(Number(__ENV.FORUM_POST_CONTENT_LENGTH) || 60, 20), 500);
const commentContentLength = Math.min(Math.max(Number(__ENV.COMMENT_CONTENT_LENGTH) || 30, 10), 300);

// ---- Metrics ----
const journeySuccessRate = new Rate('journey_success_rate');
const authLoginDuration = new Trend('auth_login_duration', true);
const forumCreatePostDuration = new Trend('forum_create_post_duration', true);
const forumListDuration = new Trend('forum_list_duration', true);
const commentCreateDuration = new Trend('comment_create_duration', true);
const toggleLikeDuration = new Trend('toggle_like_duration', true);
const notificationListDuration = new Trend('notification_list_duration', true);
const checkinStatusDuration = new Trend('checkin_status_duration', true);
const skippedAuthLogins = new Counter('skipped_auth_logins');
const journeyStepsCompleted = new Counter('journey_steps_completed');
const journeyAborts = new Counter('journey_aborts');

// ---- Scenarios ----
function buildScenarios(mode) {
  if (mode === 'smoke') {
    return {
      smoke: {
        executor: 'shared-iterations',
        exec: 'main',
        vus: 1,
        iterations: 5,
        maxDuration: '5m',
      },
    };
  }
  if (mode === 'spike') {
    return {
      spike: {
        executor: 'ramping-arrival-rate',
        exec: 'main',
        startRate: 3,
        timeUnit: '1s',
        preAllocatedVUs: 30,
        maxVUs: 200,
        stages: [
          { target: 5, duration: '30s' },
          { target: 30, duration: '90s' },
          { target: 5, duration: '60s' },
          { target: 0, duration: '30s' },
        ],
      },
    };
  }
  if (mode === 'soak') {
    return {
      soak: {
        executor: 'constant-arrival-rate',
        exec: 'main',
        rate: 8,
        timeUnit: '1s',
        duration: '20m',
        preAllocatedVUs: 30,
        maxVUs: 150,
      },
    };
  }
  return {
    ramp: {
      executor: 'ramping-arrival-rate',
      exec: 'main',
      startRate: 2,
      timeUnit: '1s',
      preAllocatedVUs: 20,
      maxVUs: 120,
      stages: [
        { target: 5, duration: '1m' },
        { target: 15, duration: '3m' },
        { target: 25, duration: '3m' },
        { target: 0, duration: '1m' },
      ],
    },
  };
}

export const options = {
  insecureSkipTLSVerify,
  scenarios: buildScenarios(testMode),
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000', 'p(99)<2500'],
    journey_success_rate: ['rate>0.90'],
    auth_login_duration: ['p(95)<600'],
    forum_create_post_duration: ['p(95)<1200'],
    forum_list_duration: ['p(95)<500'],
    comment_create_duration: ['p(95)<800'],
    toggle_like_duration: ['p(95)<600'],
    notification_list_duration: ['p(95)<700'],
    checkin_status_duration: ['p(95)<600'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// ---- Helpers ----
function safeJson(res) {
  try { return res.json(); }
  catch (_) { return null; }
}

function markJourneyStep(ok) {
  journeySuccessRate.add(ok ? 0 : 1);
  if (ok) journeyStepsCompleted.add(1);
}

function encodeQuery(value) {
  return encodeURIComponent(value).replace(/%2C/g, ',').replace(/%28/g, '(').replace(/%29/g, ')');
}

function buildHeaders(accessToken = '') {
  const token = String(accessToken || apiKey).trim();
  return {
    apikey: apiKey,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function randomSuffix() {
  return `${Date.now()}_${__VU}_${__ITER}`;
}

// ---- Auth: login ----
function loginWithPassword() {
  if (!testEmail || !testPassword) {
    if (!testUserId) throw new Error('需要 TEST_EMAIL+TEST_PASSWORD 或 TEST_USER_ID');
    skippedAuthLogins.add(1);
    return { accessToken: '', userId: testUserId };
  }

  const res = http.post(
    `${baseUrl}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: testEmail, password: testPassword }),
    { headers: buildHeaders(), tags: { endpoint: 'auth_login' } },
  );

  authLoginDuration.add(res.timings.duration);
  const body = safeJson(res);
  const ok = check(res, {
    '[Auth] 登录 200': (r) => r.status === 200,
    '[Auth] 有 access_token': () => Boolean(body?.access_token),
    '[Auth] 有 user.id': () => Boolean(body?.user?.id),
  });

  if (!ok) {
    console.error(`登录失败 status=${res.status}: ${String(res.body || '').slice(0, 200)}`);
    return null;
  }

  return { accessToken: body.access_token, userId: body.user.id };
}

export function setup() {
  return loginWithPassword();
}

// ---- Step 1: 获取帖子列表 ----
function getPostList(context) {
  const payload = {
    p_page: 1,
    p_page_size: 5,
    p_sort: 'latest',
    p_author_id: null,
    p_include_author_non_approved: false,
    p_search_query: null,
  };

  const res = http.post(
    `${baseUrl}/rest/v1/rpc/list_forum_posts`,
    JSON.stringify(payload),
    { headers: buildHeaders(context.accessToken), tags: { endpoint: 'forum_list' } },
  );

  forumListDuration.add(res.timings.duration);
  const body = safeJson(res);
  const ok = check(res, {
    '[论坛] 帖子列表 200': (r) => r.status === 200,
    '[论坛] 帖子列表是数组': () => Array.isArray(body),
  });
  markJourneyStep(ok);

  return { ok, data: Array.isArray(body) ? body : [] };
}

// ---- Step 2: 获取签到状态 ----
function getCheckinStatus(context) {
  const res = http.post(
    `${baseUrl}/rest/v1/rpc/get_weekly_checkin_status`,
    '{}',
    { headers: buildHeaders(context.accessToken), tags: { endpoint: 'checkin_status' } },
  );

  checkinStatusDuration.add(res.timings.duration);
  const body = safeJson(res);
  const ok = check(res, {
    '[签到] 状态查询 200': (r) => r.status === 200,
  });
  markJourneyStep(ok);

  return { ok, data: body };
}

// ---- Step 3: 创建帖子 ----
function createPost(context) {
  const suffix = randomSuffix();
  const title = `自动化测试帖子_${suffix}`;
  const content = `这是自动化测试内容_${suffix}_${'x'.repeat(Math.max(0, postContentLength - 30))}`;
  const postContent = `【${title}】\n${content}`;

  const payload = {
    content: postContent,
    author_id: context.userId,
    author_username: `test_user_${suffix.slice(0, 8)}`,
    status: 'approved',
  };

  let res;
  try {
    res = http.post(
      `${baseUrl}/rest/v1/rpc/create_forum_post_with_images`,
      JSON.stringify({
        p_title: title,
        p_body: content,
        p_author_username: payload.author_username,
        p_images: [],
        p_tag: null,
      }),
      { headers: buildHeaders(context.accessToken), tags: { endpoint: 'forum_create_post' } },
    );
  } catch (e) {
    // Fallback: 可能 RPC 未部署，尝试直接写入 posts 表
    res = http.post(
      `${baseUrl}/rest/v1/posts`,
      JSON.stringify(payload),
      {
        headers: {
          ...buildHeaders(context.accessToken),
          Prefer: 'return=representation',
        },
        tags: { endpoint: 'forum_create_post_fallback' },
      },
    );
  }

  forumCreatePostDuration.add(res.timings.duration);
  const body = safeJson(res);
  const createdPost = Array.isArray(body) ? body[0] : body;
  const postId = createdPost?.id || null;
  const ok = check(res, {
    '[发帖] 创建 200/201': (r) => r.status === 200 || r.status === 201,
    '[发帖] 有帖子 ID': () => Boolean(postId),
  });
  markJourneyStep(ok);

  return { ok, postId, post: createdPost };
}

// ---- Step 4: 点赞帖子 ----
function toggleLike(context, postId) {
  if (!postId) {
    markJourneyStep(false);
    return { ok: false };
  }

  let res;
  try {
    res = http.post(
      `${baseUrl}/rest/v1/rpc/toggle_forum_like`,
      JSON.stringify({ p_post_id: postId }),
      { headers: buildHeaders(context.accessToken), tags: { endpoint: 'toggle_like' } },
    );
  } catch (_) {
    // Fallback: RPC 未部署，直接查询 likes
    res = http.post(
      `${baseUrl}/rest/v1/likes`,
      JSON.stringify({ post_id: postId, user_id: context.userId }),
      {
        headers: {
          ...buildHeaders(context.accessToken),
          Prefer: 'return=minimal',
        },
        tags: { endpoint: 'toggle_like_fallback' },
      },
    );
  }

  toggleLikeDuration.add(res.timings.duration);
  const body = safeJson(res);
  const rpcResult = Array.isArray(body) ? body[0] : body;
  const ok = check(res, {
    '[点赞] 请求 200/201': (r) => r.status === 200 || r.status === 201,
  });
  markJourneyStep(ok);

  return { ok, action: rpcResult?.action || (res.status === 201 ? 'liked' : 'unliked') };
}

// ---- Step 5: 发表评论 ----
function createComment(context, postId) {
  if (!postId) {
    markJourneyStep(false);
    return { ok: false };
  }

  const suffix = randomSuffix();
  const content = `自动化评论_${suffix.slice(0, Math.min(commentContentLength, 20))}`;

  const res = http.post(
    `${baseUrl}/rest/v1/comments`,
    JSON.stringify({
      post_id: postId,
      content,
      author_id: context.userId,
      author_username: 'test_user',
      status: 'approved',
    }),
    {
      headers: {
        ...buildHeaders(context.accessToken),
        Prefer: 'return=representation',
      },
      tags: { endpoint: 'comment_create' },
    },
  );

  commentCreateDuration.add(res.timings.duration);
  const body = safeJson(res);
  const comment = Array.isArray(body) ? body[0] : body;
  const ok = check(res, {
    '[评论] 创建 201': (r) => r.status === 201,
    '[评论] 有评论 ID': () => Boolean(comment?.id),
  });
  markJourneyStep(ok);

  return { ok, commentId: comment?.id || null };
}

// ---- Step 6: 获取通知列表 ----
function getNotifications(context) {
  const select = 'id,type,status,created_at,sender:sender_id(id,username,avatar_url)';
  const url = `${baseUrl}/rest/v1/notifications`
    + `?select=${encodeQuery(select)}`
    + `&recipient_id=eq.${encodeURIComponent(context.userId)}`
    + '&order=created_at.desc'
    + '&limit=10';

  const res = http.get(url, {
    headers: buildHeaders(context.accessToken),
    tags: { endpoint: 'notification_list' },
  });

  notificationListDuration.add(res.timings.duration);
  const body = safeJson(res);
  const ok = check(res, {
    '[通知] 列表 200': (r) => r.status === 200,
    '[通知] 是数组': () => Array.isArray(body),
  });
  markJourneyStep(ok);

  return { ok, data: Array.isArray(body) ? body : [] };
}

// ---- Step 7: 获取论坛标签统计 ----
function getTagStats(context) {
  const res = http.post(
    `${baseUrl}/rest/v1/rpc/get_forum_tag_stats`,
    '{}',
    { headers: buildHeaders(context.accessToken), tags: { endpoint: 'tag_stats' } },
  );
  const body = safeJson(res);
  const ok = check(res, {
    '[标签] 统计 200': (r) => r.status === 200,
  });
  markJourneyStep(ok);
  return { ok, data: body };
}

// ---- Complete journey ----
function runFullJourney(context) {
  if (!context) {
    journeyAborts.add(1);
    return;
  }

  // Step 1: Get posts
  sleep(0.3);
  const listResult = getPostList(context);
  if (!listResult.ok) return;

  // Step 2: Check-in status
  sleep(0.3);
  getCheckinStatus(context);

  // Step 3: Get tag stats
  sleep(0.2);
  getTagStats(context);

  // Step 4: Create post
  sleep(0.5);
  const postResult = createPost(context);
  if (!postResult.ok || !postResult.postId) return;

  // Step 5: Like the post
  sleep(0.3);
  toggleLike(context, postResult.postId);

  // Step 6: Comment on the post
  sleep(0.3);
  createComment(context, postResult.postId);

  // Step 7: Get notifications (to see like/comment notifications)
  sleep(0.5);
  getNotifications(context);
}

export function main(context) {
  runFullJourney(context);
}

export default function (context) {
  runFullJourney(context);
}