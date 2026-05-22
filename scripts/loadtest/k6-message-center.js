import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

/*
Run examples:

k6 run \
  -e BASE_URL="https://YOUR_PROJECT.supabase.co" \
  -e SUPABASE_ANON_KEY="YOUR_PUBLISHABLE_KEY" \
  -e TEST_MODE="smoke" \
  -e TEST_EMAIL="demo@example.com" \
  -e TEST_PASSWORD="your-password" \
  scripts/loadtest/k6-message-center.js

Optional:
- TEST_USER_ID: skip auth login and use this user id with the publishable key.
- NOTIFICATION_LIMIT (default: 24)
- MESSAGE_LIMIT (default: 24)
- INSECURE_SKIP_TLS_VERIFY (default: 0)
*/

const baseUrl = String(__ENV.BASE_URL || '').replace(/\/$/, '');
if (!baseUrl) {
  throw new Error('BASE_URL is required');
}

function normalizeHeaderToken(value = '') {
  return String(value || '').replace(/\s+/g, '').trim();
}

const apiKey = normalizeHeaderToken(__ENV.SUPABASE_ANON_KEY || '');
if (!apiKey) {
  throw new Error('SUPABASE_ANON_KEY is required');
}

const testMode = String(__ENV.TEST_MODE || 'ramp').trim().toLowerCase();
const testEmail = String(__ENV.TEST_EMAIL || __ENV.TEST_LOGIN_ID || '').trim();
const testPassword = String(__ENV.TEST_PASSWORD || __ENV.TEST_LOGIN_PASSWORD || '').trim();
const testUserId = String(__ENV.TEST_USER_ID || '').trim();
const notificationLimit = Math.min(Math.max(Number(__ENV.NOTIFICATION_LIMIT) || 24, 1), 100);
const messageLimit = Math.min(Math.max(Number(__ENV.MESSAGE_LIMIT) || 24, 1), 100);
const insecureSkipTlsVerify = String(__ENV.INSECURE_SKIP_TLS_VERIFY || '0').trim() === '1';

const businessErrorRate = new Rate('business_error_rate');
const authLoginDuration = new Trend('auth_login_duration', true);
const notificationListDuration = new Trend('notification_list_duration', true);
const messageListDuration = new Trend('message_list_duration', true);
const unreadCountDuration = new Trend('unread_count_duration', true);
const skippedAuthLogins = new Counter('skipped_auth_logins');

function buildScenarios(mode) {
  if (mode === 'smoke') {
    return {
      smoke: {
        executor: 'shared-iterations',
        exec: 'main',
        vus: 1,
        iterations: 20,
        maxDuration: '3m',
      },
    };
  }

  if (mode === 'spike') {
    return {
      spike: {
        executor: 'ramping-arrival-rate',
        exec: 'main',
        startRate: 5,
        timeUnit: '1s',
        preAllocatedVUs: 50,
        maxVUs: 300,
        stages: [
          { target: 10, duration: '30s' },
          { target: 80, duration: '90s' },
          { target: 10, duration: '60s' },
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
        rate: 15,
        timeUnit: '1s',
        duration: '30m',
        preAllocatedVUs: 50,
        maxVUs: 250,
      },
    };
  }

  return {
    ramp: {
      executor: 'ramping-arrival-rate',
      exec: 'main',
      startRate: 3,
      timeUnit: '1s',
      preAllocatedVUs: 30,
      maxVUs: 200,
      stages: [
        { target: 8, duration: '1m' },
        { target: 20, duration: '3m' },
        { target: 40, duration: '3m' },
        { target: 0, duration: '1m' },
      ],
    },
  };
}

export const options = {
  insecureSkipTLSVerify: insecureSkipTlsVerify,
  scenarios: buildScenarios(testMode),
  thresholds: {
    http_req_failed: ['rate<0.005'],
    http_req_duration: ['p(95)<700', 'p(99)<1500'],
    business_error_rate: ['rate<0.005'],
    auth_login_duration: ['p(95)<800', 'p(99)<1500'],
    notification_list_duration: ['p(95)<500', 'p(99)<1200'],
    message_list_duration: ['p(95)<600', 'p(99)<1500'],
    unread_count_duration: ['p(95)<700', 'p(99)<1500'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

function safeJson(res) {
  try {
    return res.json();
  } catch (_error) {
    return null;
  }
}

function markBusinessResult(ok) {
  businessErrorRate.add(ok ? 0 : 1);
}

function buildHeaders(accessToken = '') {
  const bearerToken = normalizeHeaderToken(accessToken || apiKey);
  return {
    apikey: apiKey,
    Authorization: `Bearer ${bearerToken}`,
    'Content-Type': 'application/json',
  };
}

function encodeQueryValue(value) {
  return encodeURIComponent(value).replace(/%2C/g, ',').replace(/%28/g, '(').replace(/%29/g, ')');
}

function loginWithPassword() {
  if (!testEmail || !testPassword) {
    if (!testUserId) {
      throw new Error('TEST_EMAIL and TEST_PASSWORD are required unless TEST_USER_ID is provided');
    }
    skippedAuthLogins.add(1);
    return {
      accessToken: '',
      userId: testUserId,
    };
  }

  const res = http.post(
    `${baseUrl}/auth/v1/token?grant_type=password`,
    JSON.stringify({
      email: testEmail,
      password: testPassword,
    }),
    {
      headers: buildHeaders(),
      tags: { endpoint: 'auth_login' },
    },
  );

  authLoginDuration.add(res.timings.duration);
  const body = safeJson(res);
  const ok = check(res, {
    'auth login status is 200': (r) => r.status === 200,
    'auth login has access token': () => Boolean(body?.access_token),
    'auth login has user id': () => Boolean(body?.user?.id),
  });

  if (!ok) {
    throw new Error(`Auth login failed with status ${res.status}: ${String(res.body || '').slice(0, 300)}`);
  }

  return {
    accessToken: body.access_token,
    userId: body.user.id,
  };
}

export function setup() {
  return loginWithPassword();
}

function performNotificationList(context) {
  const select = 'id,type,status,created_at,sender:sender_id(id,username,avatar_url),post:post_id(id,title,body,content),comment:comment_id(id,content,parent_id,author_username)';
  const url = `${baseUrl}/rest/v1/notifications`
    + `?select=${encodeQueryValue(select)}`
    + `&recipient_id=eq.${encodeURIComponent(context.userId)}`
    + '&order=created_at.desc'
    + `&limit=${notificationLimit}`;

  const res = http.get(url, {
    headers: buildHeaders(context.accessToken),
    tags: { endpoint: 'notification_list' },
  });

  notificationListDuration.add(res.timings.duration);
  const body = safeJson(res);
  const ok = check(res, {
    'notification list status is 200': (r) => r.status === 200,
    'notification list body is array': () => Array.isArray(body),
  });

  markBusinessResult(ok);
}

function performMessageList(context) {
  const filter = `sender_id.eq.${context.userId},and(receiver_id.eq.${context.userId},moderation_status.eq.approved)`;
  const url = `${baseUrl}/rest/v1/messages`
    + '?select=*'
    + `&or=(${encodeQueryValue(filter)})`
    + '&order=created_at.desc'
    + `&limit=${messageLimit}`;

  const res = http.get(url, {
    headers: buildHeaders(context.accessToken),
    tags: { endpoint: 'message_list' },
  });

  messageListDuration.add(res.timings.duration);
  const body = safeJson(res);
  const ok = check(res, {
    'message list status is 200': (r) => r.status === 200,
    'message list body is array': () => Array.isArray(body),
  });

  markBusinessResult(ok);
}

function performUnreadCount(context) {
  const notificationUrl = `${baseUrl}/rest/v1/notifications`
    + '?select=id,sender_id,recipient_id,type'
    + `&recipient_id=eq.${encodeURIComponent(context.userId)}`
    + '&status=eq.unread';
  const messageUrl = `${baseUrl}/rest/v1/messages`
    + '?select=id'
    + `&receiver_id=eq.${encodeURIComponent(context.userId)}`
    + '&status=eq.unread'
    + '&moderation_status=eq.approved';

  const responses = http.batch([
    ['GET', notificationUrl, null, {
      headers: buildHeaders(context.accessToken),
      tags: { endpoint: 'unread_notifications' },
    }],
    ['GET', messageUrl, null, {
      headers: {
        ...buildHeaders(context.accessToken),
        Prefer: 'count=exact',
      },
      tags: { endpoint: 'unread_messages' },
    }],
  ]);

  const duration = Math.max(
    responses[0]?.timings?.duration || 0,
    responses[1]?.timings?.duration || 0,
  );
  unreadCountDuration.add(duration);

  const notificationBody = safeJson(responses[0]);
  const messageBody = safeJson(responses[1]);
  const ok = check(responses[0], {
    'unread notifications status is 200': (r) => r.status === 200,
    'unread notifications body is array': () => Array.isArray(notificationBody),
  }) && check(responses[1], {
    'unread messages status is 200': (r) => r.status === 200,
    'unread messages body is array': () => Array.isArray(messageBody),
  });

  markBusinessResult(ok);
}

function runUserJourney(context) {
  const roll = Math.random();

  if (roll < 0.40) {
    performNotificationList(context);
  } else if (roll < 0.75) {
    performMessageList(context);
  } else {
    performUnreadCount(context);
  }

  sleep(0.3 + Math.random() * 0.9);
}

export function main(context) {
  runUserJourney(context);
}
