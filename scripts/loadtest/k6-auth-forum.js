import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

/*
Run examples:

k6 run \
  -e BASE_URL="https://YOUR_PROJECT.supabase.co" \
  -e SUPABASE_ANON_KEY="YOUR_ANON_KEY" \
  -e TEST_MODE="ramp" \
  -e TEST_LOGIN_ID="demo@example.com" \
  -e TEST_LOGIN_PASSWORD="your-password" \
  scripts/loadtest/k6-auth-forum.js

Optional:
- AUTH_LOGIN_PATH (default: /functions/v1/auth-login)
- AUTH_REGISTER_PATH (default: /functions/v1/auth-register)
- FORUM_RPC_PATH (default: /rest/v1/rpc/list_forum_posts)
- ENABLE_REGISTER (default: 0)
- REGISTER_PASSWORD (default: Passw0rd!123)
- INSECURE_SKIP_TLS_VERIFY (default: 0)
*/

const baseUrl = String(__ENV.BASE_URL || '').replace(/\/$/, '');
if (!baseUrl) {
  throw new Error('BASE_URL is required');
}

const apiKey = String(__ENV.SUPABASE_ANON_KEY || '').trim();
const authLoginPath = String(__ENV.AUTH_LOGIN_PATH || '/functions/v1/auth-login').trim();
const authRegisterPath = String(__ENV.AUTH_REGISTER_PATH || '/functions/v1/auth-register').trim();
const forumRpcPath = String(__ENV.FORUM_RPC_PATH || '/rest/v1/rpc/list_forum_posts').trim();
const testMode = String(__ENV.TEST_MODE || 'ramp').trim().toLowerCase();
const enableRegister = String(__ENV.ENABLE_REGISTER || '0').trim() === '1';
const insecureSkipTlsVerify = String(__ENV.INSECURE_SKIP_TLS_VERIFY || '0').trim() === '1';

const testLoginId = String(__ENV.TEST_LOGIN_ID || '').trim();
const testLoginPassword = String(__ENV.TEST_LOGIN_PASSWORD || '').trim();
const registerPassword = String(__ENV.REGISTER_PASSWORD || 'Passw0rd!123').trim();

const businessErrorRate = new Rate('business_error_rate');
const authLoginDuration = new Trend('auth_login_duration', true);
const authRegisterDuration = new Trend('auth_register_duration', true);
const forumListDuration = new Trend('forum_list_duration', true);
const skippedLoginRequests = new Counter('skipped_login_requests');

function buildHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers.apikey = apiKey;
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

const headers = buildHeaders();

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
        maxVUs: 400,
        stages: [
          { target: 10, duration: '30s' },
          { target: 100, duration: '90s' },
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
        rate: 25,
        timeUnit: '1s',
        duration: '30m',
        preAllocatedVUs: 80,
        maxVUs: 400,
      },
    };
  }

  return {
    ramp: {
      executor: 'ramping-arrival-rate',
      exec: 'main',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 300,
      stages: [
        { target: 10, duration: '1m' },
        { target: 30, duration: '3m' },
        { target: 60, duration: '3m' },
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
    http_req_duration: ['p(95)<500', 'p(99)<1200'],
    business_error_rate: ['rate<0.005'],
    auth_login_duration: ['p(95)<400', 'p(99)<1000'],
    auth_register_duration: ['p(95)<700', 'p(99)<1500'],
    forum_list_duration: ['p(95)<300', 'p(99)<800'],
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

function randomSuffix() {
  const now = Date.now();
  const randomInt = Math.floor(Math.random() * 100000);
  return `${now}_${__VU}_${__ITER}_${randomInt}`;
}

function performForumList() {
  const url = `${baseUrl}${forumRpcPath}`;
  const payload = {
    p_page: 1,
    p_page_size: 10,
    p_sort: 'latest',
    p_author_id: null,
    p_include_author_non_approved: false,
    p_search_query: null,
  };

  const res = http.post(url, JSON.stringify(payload), {
    headers,
    tags: { endpoint: 'forum_list' },
  });

  forumListDuration.add(res.timings.duration);

  const body = safeJson(res);
  const ok = check(res, {
    'forum list status is 200': (r) => r.status === 200,
    'forum list body is array': () => Array.isArray(body),
  });

  markBusinessResult(ok);
}

function performLogin() {
  if (!testLoginId || !testLoginPassword) {
    skippedLoginRequests.add(1);
    performForumList();
    return;
  }

  const url = `${baseUrl}${authLoginPath}`;
  const payload = {
    loginId: testLoginId,
    password: testLoginPassword,
  };

  const res = http.post(url, JSON.stringify(payload), {
    headers,
    tags: { endpoint: 'auth_login' },
  });

  authLoginDuration.add(res.timings.duration);

  const body = safeJson(res);
  const ok = check(res, {
    'auth login status is 200': (r) => r.status === 200,
    'auth login body ok=true': () => Boolean(body && body.ok === true),
  });

  markBusinessResult(ok);
}

function performRegister() {
  if (!enableRegister) {
    performForumList();
    return;
  }

  const url = `${baseUrl}${authRegisterPath}`;
  const suffix = randomSuffix();
  const payload = {
    username: `k6_user_${suffix}`,
    email: `k6_${suffix}@example.com`,
    password: registerPassword,
    metadata: {
      role: 'user',
    },
  };

  const res = http.post(url, JSON.stringify(payload), {
    headers,
    tags: { endpoint: 'auth_register' },
  });

  authRegisterDuration.add(res.timings.duration);

  const body = safeJson(res);
  const ok = check(res, {
    'auth register status is 200': (r) => r.status === 200,
    'auth register body ok=true': () => Boolean(body && body.ok === true),
  });

  markBusinessResult(ok);
}

function runUserJourney() {
  const roll = Math.random();

  if (enableRegister && roll < 0.10) {
    performRegister();
  } else if (roll < 0.45) {
    performLogin();
  } else {
    performForumList();
  }

  sleep(0.2 + Math.random() * 0.8);
}

export function main() {
  runUserJourney();
}

export default function () {
  runUserJourney();
}
