import { chromium } from 'playwright';

/* 圣诞参与头像飞行（plans/052，Task 2）。
 *
 * 前置：Vite dev server 已启动（默认 http://[::1]:5173，可用 BASE 覆盖）。
 * 运行：node scripts/probes/probe-xmas-avatar-flight.mjs
 *
 * 所有 xmas_* RPC 都由一条路由接管；不种 auth token，不写真实数据库。
 * 每个场景使用全新 context，页面内 MutationObserver + rAF 记录克隆生命周期与矩形。
 */

const BASE = process.env.BASE || 'http://[::1]:5173';
const VIEWPORT = { width: 1440, height: 900 };
const PROBE_USER_ID = 'a1b2c3d4-0520-4000-8000-000000000052';
const REVEAL_AT = '2099-12-20T20:00:00+08:00';
const SIGNUP_DEADLINE = '2099-12-20T19:30:00+08:00';
const CLONE_SELECTOR = '.xmas-flight-clone';
const SELF_SELECTOR = '.hanger[data-self="true"]';
// 观测窗口覆盖 delay + fade 的 CSS token 总量；额外留一小段调度 / nextTick 抖动余量。
const FALLBACK_OBSERVATION_MARGIN_MS = 80;

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const otherParticipants = () =>
  Array.from({ length: 8 }, (_, slot) => ({
    user_id: `xmas-probe-${slot}`,
    slot,
    status: 'joined',
    name: `探针成员 ${slot + 1}`,
    avatar_url: '',
    frame_url: '',
    joined_at: '2026-12-01T00:00:00+08:00',
    left_at: null,
  }));

function rosterPayload(joined) {
  const participants = otherParticipants();
  if (joined) {
    participants.push({
      user_id: PROBE_USER_ID,
      slot: 8,
      status: 'joined',
      name: '探针自己',
      avatar_url: '',
      frame_url: '',
      joined_at: '2026-12-02T00:00:00+08:00',
      left_at: null,
    });
  }
  return {
    ok: true,
    event: {
      slug: 'christmas-2026',
      title: '圣诞交换礼物',
      reveal_at: REVEAL_AT,
      signup_deadline: SIGNUP_DEADLINE,
      capacity: 20,
      status: 'open',
      is_visible: true,
      santa_user_id: null,
      revealed_at: null,
      updated_at: null,
    },
    participants,
    joined_count: participants.length,
    slot_count: participants.length,
    me: { joined, slot: joined ? 8 : null },
  };
}

const jsonHeaders = { 'Content-Type': 'application/json', 'Content-Range': '0-0/1' };

async function mockXmasRpcs(page, { joinDelayMs = 0 } = {}) {
  const mock = { joined: false, calls: [], rosters: [], joinResponses: [] };

  // 精确覆盖全部 xmas_*，不注册 catch-all；必须早于任何可能的兜底路由。
  await page.route('**/rest/v1/rpc/xmas_*', async (route) => {
    const rpc = new URL(route.request().url()).pathname.split('/').pop();
    mock.calls.push(rpc);
    let payload;

    switch (rpc) {
      case 'xmas_roster':
        payload = rosterPayload(mock.joined);
        mock.rosters.push(structuredClone(payload));
        break;
      case 'xmas_join':
        mock.joined = true;
        if (joinDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, joinDelayMs));
        }
        payload = { ok: true, slot: 8, joined_count: 9 };
        mock.joinResponses.push(structuredClone(payload));
        break;
      case 'xmas_leave':
        mock.joined = false;
        payload = { ok: true };
        break;
      case 'xmas_my_result':
        payload = { ok: true, revealed: false, reveal_at: REVEAL_AT };
        break;
      default:
        payload = { ok: false, code: 'FORBIDDEN', message: 'Probe forbids admin Xmas RPCs' };
    }

    await route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify(payload) });
  });

  return mock;
}

async function injectAuth(page) {
  await page.waitForFunction(
    () => Boolean(document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia),
    null,
    { timeout: 30000 },
  );
  await page.waitForFunction(
    () =>
      document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia?.state.value
        .auth?.isInitialized === true,
    null,
    { timeout: 30000 },
  );
  await page.evaluate((userId) => {
    const auth =
      document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.auth;
    auth.isInitialized = true;
    auth.isLoggedIn = true;
    Object.assign(auth.userInfo, {
      id: userId,
      username: 'xmas_flight_probe',
      role: 'user',
      avatarUrl: '',
    });
  }, PROBE_USER_ID);
}

async function installFlightTrace(page) {
  await page.evaluate(
    ({ cloneSelector, selfSelector }) => {
      const center = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      const trace = {
        additions: 0,
        removals: 0,
        maxClones: 0,
        addedAt: null,
        removedAt: null,
        confirmRequestedAt: null,
        observationWindowMs: null,
        observationCompletedAt: null,
        fadeStarts: 0,
        fadeStartedAt: null,
        sourceCenter: null,
        targetCenter: null,
        frames: [],
        animation: null,
      };
      window.__xmasFlightTrace = trace;

      const observer = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node.nodeType !== 1 || !node.matches(cloneSelector)) continue;
            trace.additions += 1;
            if (trace.addedAt === null) {
              trace.addedAt = performance.now();
              trace.sourceCenter = center(
                document.querySelector('.xmas-cta').getBoundingClientRect(),
              );
              trace.targetCenter = center(
                document.querySelector(selfSelector).getBoundingClientRect(),
              );
              const animation = node
                .getAnimations()
                .find((candidate) => candidate.effect?.target === node);
              if (animation) {
                trace.animation = {
                  duration: animation.effect.getTiming().duration,
                  easing: animation.effect.getTiming().easing,
                };
              }
            }
          }
          for (const node of record.removedNodes) {
            if (node.nodeType === 1 && node.matches(cloneSelector)) {
              trace.removals += 1;
              if (trace.removedAt === null) trace.removedAt = performance.now();
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      // reduced / lite 的真实挂饰会用 WAAPI 淡入；只在动画确实启动后计入，
      // 不能用“最后可见”反推动画确实发生过。排除克隆，并核对 opacity 关键帧。
      const countedFadeAnimations = new WeakSet();
      const recordFadeStart = (animation) => {
        const target = animation?.effect?.target;
        if (
          !Number.isFinite(trace.confirmRequestedAt) ||
          performance.now() < trace.confirmRequestedAt ||
          !target?.matches(selfSelector) ||
          target.matches(cloneSelector) ||
          target !== document.querySelector(selfSelector) ||
          !animation.effect.getKeyframes().some((frame) => Object.hasOwn(frame, 'opacity')) ||
          countedFadeAnimations.has(animation)
        ) {
          return;
        }
        countedFadeAnimations.add(animation);
        trace.fadeStarts += 1;
        if (trace.fadeStartedAt === null) trace.fadeStartedAt = performance.now();
      };
      document.addEventListener('animationstart', (event) => recordFadeStart(event.animation), {
        capture: true,
      });

      // 部分 Chrome 版本不为 Element.animate() 派发 DOM animationstart；ready 解析是
      // 同一动画已结束 pending、进入可播放状态的 WAAPI 证据。用 WeakSet 与事件去重。
      const originalAnimate = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        const animation = originalAnimate.apply(this, args);
        animation.ready
          .then(() => {
            if (animation.playState !== 'idle' && animation.playState !== 'paused') {
              recordFadeStart(animation);
            }
          })
          .catch(() => {});
        return animation;
      };

      const sampleFrame = () => {
        const clone = document.querySelector(cloneSelector);
        trace.maxClones = Math.max(
          trace.maxClones,
          document.querySelectorAll(cloneSelector).length,
        );
        if (clone) {
          trace.frames.push({
            at: performance.now(),
            rect: clone.getBoundingClientRect().toJSON(),
          });
        }
        requestAnimationFrame(sampleFrame);
      };
      requestAnimationFrame(sampleFrame);
    },
    { cloneSelector: CLONE_SELECTOR, selfSelector: SELF_SELECTOR },
  );
}

async function openXmas(page) {
  await page.goto(`${BASE}/#/xmas`, { waitUntil: 'domcontentloaded' });
  await injectAuth(page);
  await page.getByRole('button', { name: '参与交换', exact: true }).waitFor({ timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('.hanger').length === 8, null, {
    timeout: 30000,
  });
  await installFlightTrace(page);
}

async function joinFromSheet(page, { repeatWhilePending = false } = {}) {
  await page.getByRole('button', { name: '参与交换', exact: true }).click();
  const confirm = page.getByRole('button', { name: '确认参与', exact: true });
  await confirm.waitFor({ state: 'visible', timeout: 10000 });
  await page.evaluate((marginMs) => {
    const trace = window.__xmasFlightTrace;
    const rootStyle = getComputedStyle(document.documentElement);
    const tokenMs = (name) => {
      const match = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(rootStyle.getPropertyValue(name).trim());
      if (!match) return NaN;
      const value = Number(match[1]);
      return match[2] === 's' ? value * 1000 : value;
    };
    const delayMs = tokenMs('--duration-fast');
    const fadeMs = tokenMs('--duration-press');
    if (!Number.isFinite(delayMs) || !Number.isFinite(fadeMs)) {
      throw new Error(`Unable to derive fallback observation window: ${delayMs}, ${fadeMs}`);
    }
    trace.confirmRequestedAt = performance.now();
    trace.observationWindowMs = delayMs + fadeMs + marginMs;
  }, FALLBACK_OBSERVATION_MARGIN_MS);
  await confirm.click();
  if (repeatWhilePending) {
    // 真实 click 已把 submitting 置 true；后续 dispatch 模拟 pending 期间的重复点击，
    // 不依赖 Playwright 等 disabled 按钮重新可用（那会错过 pending 窗口）。
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find(
        (candidate) => candidate.textContent.trim() === '处理中…',
      );
      if (!button) throw new Error('确认参与未进入 pending 态');
      for (let index = 0; index < 5; index += 1) {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    });
  }
}

const waitForFlightRemoval = (page) =>
  page.waitForFunction(() => Number.isFinite(window.__xmasFlightTrace?.removedAt), null, {
    timeout: 10000,
  });

const waitForFallbackFlightSettled = (page) =>
  page.waitForFunction(
    ({ selfSelector, cloneSelector }) => {
      const trace = window.__xmasFlightTrace;
      const target = document.querySelector(selfSelector);
      if (
        !trace ||
        !Number.isFinite(trace.confirmRequestedAt) ||
        !Number.isFinite(trace.observationWindowMs) ||
        trace.fadeStarts < 1 ||
        trace.additions !== 0 ||
        !target ||
        target.matches(cloneSelector)
      ) {
        return false;
      }
      const style = getComputedStyle(target);
      const rect = target.getBoundingClientRect();
      const settled =
        target.style.opacity === '1' &&
        style.opacity === '1' &&
        style.visibility === 'visible' &&
        style.display !== 'none' &&
        rect.width > 0 &&
        rect.height > 0 &&
        target.getAnimations().length === 0;
      const observedLongEnough =
        performance.now() - trace.confirmRequestedAt >= trace.observationWindowMs;
      if (settled && observedLongEnough) {
        trace.observationCompletedAt = performance.now();
        return true;
      }
      return false;
    },
    { selfSelector: SELF_SELECTOR, cloneSelector: CLONE_SELECTOR },
    { timeout: 10000 },
  );

const readTrace = (page) => page.evaluate(() => window.__xmasFlightTrace);
const centerOf = (rect) =>
  rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
const centerError = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity);
const rounded = (value) => (Number.isFinite(value) ? value.toFixed(2) : String(value));

function verifyMockContract(mock) {
  const initial = mock.rosters[0];
  const final = mock.rosters.at(-1);
  const event = initial?.event;
  return Boolean(
    initial?.me?.joined === false &&
    final?.me?.joined === true &&
    final?.me?.slot === 8 &&
    final?.participants?.some((person) => person.user_id === PROBE_USER_ID && person.slot === 8) &&
    event?.status === 'open' &&
    event?.is_visible === true &&
    event?.capacity === 20 &&
    new Date(event?.reveal_at).getTime() > Date.now() &&
    new Date(event?.signup_deadline).getTime() > Date.now() &&
    new Date(event?.reveal_at).getTime() > new Date(event?.signup_deadline).getTime() &&
    mock.joinResponses.length === 1 &&
    mock.joinResponses[0]?.ok === true &&
    mock.joinResponses[0]?.slot === 8 &&
    mock.joinResponses[0]?.joined_count === 9 &&
    mock.calls.every((rpc) => rpc.startsWith('xmas_')),
  );
}

let browser;
try {
  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });

  // mock 句柄只留在 Node 路由闭包中，不向页面暴露可写状态。
  async function createScenario(name, options, body) {
    let context;
    const pageErrors = [];
    console.log(`\n--- ${name} ---`);
    try {
      context = await browser.newContext({ viewport: VIEWPORT, ...options });
      const page = await context.newPage();
      page.on('pageerror', (error) => pageErrors.push(error.message));
      const mock = await mockXmasRpcs(page, options);
      await openXmas(page);
      await body(page, mock);
    } catch (error) {
      check(`${name} harness completes`, false, error.stack || String(error));
    } finally {
      check(`${name} has no pageerror`, pageErrors.length === 0, pageErrors.join(' | '));
      if (context) await context.close();
    }
  }

  await createScenario('A normal flight', {}, async (page, mock) => {
    await joinFromSheet(page);
    await waitForFlightRemoval(page);
    const trace = await readTrace(page);
    const lifetime = trace.removedAt - trace.addedAt;
    const first = trace.frames[0];
    const last = trace.frames.at(-1);
    const midpointAt = (trace.addedAt + trace.removedAt) / 2;
    const middle = trace.frames.reduce(
      (best, frame) =>
        !best || Math.abs(frame.at - midpointAt) < Math.abs(best.at - midpointAt) ? frame : best,
      null,
    );
    const firstError = centerError(centerOf(first?.rect), trace.sourceCenter);
    const finalError = centerError(centerOf(last?.rect), trace.targetCenter);
    const linearMidY =
      trace.sourceCenter && trace.targetCenter
        ? (trace.sourceCenter.y + trace.targetCenter.y) / 2
        : NaN;
    const lift = linearMidY - (centerOf(middle?.rect)?.y ?? NaN);
    const cloneCount = await page.locator(CLONE_SELECTOR).count();
    const opacity = await page
      .locator(SELF_SELECTOR)
      .evaluate((target) => getComputedStyle(target).opacity);

    check(
      'A1 clone addition and removal observed',
      trace.additions === 1 && trace.removals === 1,
      `added=${trace.additions}, removed=${trace.removals}`,
    );
    check(
      'A2 first-frame center matches CTA within 8px',
      firstError < 8,
      `error=${rounded(firstError)}px`,
    );
    check(
      'A3 mid-frame is at least 24px above linear midpoint',
      lift >= 24,
      `lift=${rounded(lift)}px`,
    );
    check(
      'A4 final-frame center matches self hanger within 8px',
      finalError < 8,
      `error=${rounded(finalError)}px`,
    );
    check(
      'A5 clone lifetime is 600–800ms',
      lifetime >= 600 && lifetime <= 800,
      `${rounded(lifetime)}ms`,
    );
    check('A6 clone count is zero after completion', cloneCount === 0, `count=${cloneCount}`);
    check('A7 real self hanger opacity is 1', opacity === '1', `opacity=${opacity}`);
    check('A8 Xmas mock contract is valid and join flips roster', verifyMockContract(mock));
  });

  await createScenario('B reduced motion', { reducedMotion: 'reduce' }, async (page) => {
    await joinFromSheet(page);
    await waitForFallbackFlightSettled(page);
    const trace = await readTrace(page);
    check(
      'B1 no flight clone ever appears',
      trace.additions === 0,
      `added=${trace.additions}, fadeStarts=${trace.fadeStarts}, observed=${rounded(trace.observationCompletedAt - trace.confirmRequestedAt)}ms/${rounded(trace.observationWindowMs)}ms`,
    );
    const selfState = await page.locator(SELF_SELECTOR).evaluate((target) => ({
      opacity: getComputedStyle(target).opacity,
      activeAnimations: target.getAnimations().length,
    }));
    check(
      'B2 real self hanger eventually reaches opacity 1',
      selfState.opacity === '1' && selfState.activeAnimations === 0 && trace.fadeStarts >= 1,
      `opacity=${selfState.opacity}, activeAnimations=${selfState.activeAnimations}, fadeStarts=${trace.fadeStarts}`,
    );
  });

  await createScenario('C lite performance', {}, async (page) => {
    await page.evaluate(() => document.documentElement.classList.add('boh-perf-lite'));
    await joinFromSheet(page);
    await waitForFallbackFlightSettled(page);
    const trace = await readTrace(page);
    check(
      'C1 no long-distance flight clone appears',
      trace.additions === 0,
      `added=${trace.additions}, fadeStarts=${trace.fadeStarts}, observed=${rounded(trace.observationCompletedAt - trace.confirmRequestedAt)}ms/${rounded(trace.observationWindowMs)}ms`,
    );
    const selfState = await page.locator(SELF_SELECTOR).evaluate((target) => ({
      opacity: getComputedStyle(target).opacity,
      activeAnimations: target.getAnimations().length,
    }));
    check(
      'C2 real self hanger eventually reaches opacity 1',
      selfState.opacity === '1' && selfState.activeAnimations === 0 && trace.fadeStarts >= 1,
      `opacity=${selfState.opacity}, activeAnimations=${selfState.activeAnimations}, fadeStarts=${trace.fadeStarts}`,
    );
  });

  await createScenario('D route interruption', {}, async (page) => {
    await joinFromSheet(page);
    await page.waitForSelector(CLONE_SELECTOR, { state: 'attached', timeout: 10000 });
    await page.evaluate(() => {
      location.hash = '/';
    });
    await page.waitForFunction(
      () =>
        !document.querySelector('.xmas-page') &&
        document.querySelectorAll('.xmas-flight-clone').length === 0,
      null,
      { timeout: 10000 },
    );
    const trace = await readTrace(page);
    check(
      'D1 flight started before interruption',
      trace.additions === 1,
      `added=${trace.additions}`,
    );
    check(
      'D2 clone count returns to zero after route change',
      (await page.locator(CLONE_SELECTOR).count()) === 0,
    );
  });

  await createScenario('E duplicate prevention', { joinDelayMs: 800 }, async (page, mock) => {
    await joinFromSheet(page, { repeatWhilePending: true });
    await waitForFlightRemoval(page);
    const trace = await readTrace(page);
    check(
      'E1 repeated pending confirm sends one join RPC',
      mock.calls.filter((rpc) => rpc === 'xmas_join').length === 1,
    );
    check(
      'E2 max simultaneous clone count is at most 1',
      trace.maxClones <= 1,
      `max=${trace.maxClones}`,
    );
    check(
      'E3 duplicate prevention still completes with no clone residue',
      (await page.locator(CLONE_SELECTOR).count()) === 0,
    );
  });
} catch (error) {
  check('probe startup completes', false, error.stack || String(error));
} finally {
  if (browser) await browser.close();
}

console.log(`\nprobe-xmas-avatar-flight: ${pass}/${pass + fail} PASS`);
if (fail > 0) process.exitCode = 1;
