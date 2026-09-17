/**
 * 心理访谈接线验证探针
 *
 * 验证「点加号 → 心理分析」之后，真正发给模型的 payload 是否符合设计：
 *   ① 角色切换（心理专家提示附录在 system 里）
 *   ② 状态块注入（<interview_state>）
 *   ③ 分层规则注入（<psych_interview_rules>，含 L0 硬护栏）
 *   ④ 末尾锚定（【本轮唯一动作】在最后一条 user 里）
 *   ⑤ sandbox：不注入任何站内检索证据（健康/社区/记忆）
 *   ⑥ expertState 被写进会话（会话白名单通过，刷新不丢）
 *
 * 做法：拦住含 runtime-chat-stream 的请求，**抓到 payload 就 abort** ——
 * 不发真实请求，所以不消耗额度、也不会影响用户在另一个窗口里的会话。
 *
 * 注意：因为请求被 abort，模型不会有响应，所以本探针**不验证守门重写**
 * （守门需要 mock SSE 响应才能触发）。守门的检测逻辑由
 * tests/unit/psych-guards.test.js 的 15 项用例覆盖。
 *
 * 用法（从仓库根跑，需要 dev server 已在 5173）：
 *   node scripts/probes/probe-psych-interview-wiring.mjs
 *   BASE=http://[::1]:5173 node scripts/probes/probe-psych-interview-wiring.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const PROBE_UID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail: String(detail || '').slice(0, 160) });
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
});
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
const pageErrors = [];
const captured = [];

page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)));

await page.route('**/*', async (route) => {
  const req = route.request();
  const post = req.postData() || '';
  if (post.includes('runtime-chat-stream')) {
    try {
      captured.push(JSON.parse(post));
    } catch {
      captured.push({ parseFail: post.slice(0, 400) });
    }
    await route.abort(); // 不发真实请求
    return;
  }
  await route.continue();
});

try {
  await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForTimeout(3000); // 等 init 期会话检查放完

  await page.evaluate((uid) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const state = pinia.state.value.auth;
    state.isLoggedIn = true;
    if (state.userInfo) Object.assign(state.userInfo, { username: 'probe_user', id: uid });
  }, PROBE_UID);
  await page.waitForTimeout(800);

  await page.waitForSelector('.features-btn', { timeout: 20000 });

  // ① 加号菜单里得有这一项
  await page.click('.features-btn');
  await page.waitForSelector('.feature-action-row', { timeout: 10000 });
  const menuNames = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.feature-action-row'))
      .map((el) => (el.querySelector('strong')?.textContent || '').trim())
  );
  check('加号菜单有「心理分析」入口', menuNames.includes('心理分析'), menuNames.join(' / '));

  // ② 点它
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.feature-action-row'));
    const target = rows.find((el) => (el.textContent || '').includes('心理分析'));
    if (target) target.click();
  });
  await page.waitForTimeout(1500);

  // ③ 菜单应关闭、风格应切换
  const styleAfter = await page.evaluate(() => localStorage.getItem('boh_ai_response_style_v1'));
  check('角色已切到 psychologist（localStorage）', styleAfter === 'psychologist', String(styleAfter));

  await page.waitForTimeout(2500);

  // ④ 抓到的请求体
  check('点击后确实发起了模型请求', captured.length > 0, `captured=${captured.length}`);

  const body = captured[0] || {};
  const messages = body.payload?.messages || [];
  const systemText = messages
    .filter((m) => m.role === 'system')
    .map((m) => String(m.content || ''))
    .join('\n');
  const userMessages = messages.filter((m) => m.role === 'user');
  const lastUser = String(userMessages[userMessages.length - 1]?.content || '');

  check('system 注入访谈状态块 <interview_state>', systemText.includes('<interview_state>'), `systemLen=${systemText.length}`);
  check('状态块带轨道自查清单', systemText.includes('应覆盖的面'));
  check('system 注入分层规则 <psych_interview_rules>', systemText.includes('<psych_interview_rules>'));
  check('L0 硬护栏在册（一次只问一个问题）', systemText.includes('一次只问一个问题'));
  check('L0 硬护栏在册（绝不给选项）', systemText.includes('绝不给用户列选项'));
  check('心理专家提示附录在 system 里', systemText.includes('interview_protocol'));
  check('末尾锚定在最后一条 user 消息里', lastUser.includes('【本轮唯一动作】'), lastUser.slice(-90));
  check('锚定含当前状态行', lastUser.includes('【当前状态】'));
  check('sandbox：未注入健康数据', !systemText.includes('BOH Health') && !systemText.includes('health_analysis'));
  // 注意：BASE_SYSTEM_PROMPT 自带的 <conversation_continuity> 里就写着「[W1]/[W2] 是网络搜索编号、
  // [F1]/[F2] 是论坛帖子编号」——那是编号体系说明，不是真实证据，别把它当注入（第一版断言在这里误报过）。
  // [H1] 只可能来自健康连接器的证据块，是可靠的判据。
  const memIdx = systemText.indexOf('boh_ai_shared_memories');
  const hasForumEvidence = /\[F1\](?!\/)/.test(systemText);
  const hasHealthEvidence = /\[H1\]/.test(systemText);
  check(
    'sandbox：开场请求未注入检索证据',
    memIdx === -1 && !hasForumEvidence && !hasHealthEvidence,
    `mem@${memIdx} forum=${hasForumEvidence} health=${hasHealthEvidence}`
  );

  // ── sandbox 的关键验证：发一条会命中「健康 / 情绪」关键词的消息 ──
  // 未接线时这里会注入 BOH Health 证据（用户实测气泡下方出现「来源 BOH Health 数据」）。
  // 开场语本身不含触发词，所以必须补这一条，否则等于没验证到 sandbox。
  await page.waitForTimeout(2500);
  const composer = await page.$('textarea.input-textarea');
  if (composer) {
    await page.fill('textarea.input-textarea', '我最近心情很差，晚上睡不着，老是想哭，朋友说我状态不太对');
    await page.click('.send-btn');
    await page.waitForTimeout(3500);
  }
  const keywordRequest = captured.find((item) => {
    const text = JSON.stringify(item.payload?.messages || []);
    return text.includes('睡不着') && text.includes('心情很差');
  }) || null;
  check('已发出第二条（含健康/情绪触发词）请求', Boolean(keywordRequest), `captured=${captured.length}`);
  if (keywordRequest) {
    const systemKeyword = (keywordRequest.payload?.messages || [])
      .filter((m) => m.role === 'system')
      .map((m) => String(m.content || ''))
      .join('\n');
    check(
      '★ sandbox：命中健康关键词时仍未注入健康证据',
      !systemKeyword.includes('BOH Health') && !/\[H1\]/.test(systemKeyword),
      `health=${/\[H1\]/.test(systemKeyword)}`
    );
    check('★ sandbox：命中关键词时也未注入社区/记忆证据', !/\[F1\](?!\/)/.test(systemKeyword) && !systemKeyword.includes('boh_ai_shared_memories'));
    check('状态块在第二轮仍被注入（轮次已推进）', systemKeyword.includes('<interview_state>'));
  }

  // ⑤ expertState 落盘（会话白名单）
  const sessions = await page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('boh_chat_sessions') || '[]');
    } catch {
      return [];
    }
  });
  const withExpert = sessions.find((session) => session?.expertState) || null;
  check('expertState 已写入会话（白名单通过）', Boolean(withExpert), withExpert ? JSON.stringify(withExpert.expertState).slice(0, 130) : 'none');
  check('expertState.roleId = psychologist', withExpert?.expertState?.roleId === 'psychologist');
  check('expertState.askedCount 已随两轮对话推进到 2', Number(withExpert?.expertState?.askedCount) === 2, String(withExpert?.expertState?.askedCount));

  await page.screenshot({ path: 'debug-screenshots/psych-interview-wiring.png' });
} catch (error) {
  check('探针执行未抛异常', false, error?.message || String(error));
} finally {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log('\n=== 心理访谈接线探针 ===');
  results.forEach((r) => console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  [${r.detail}]` : ''}`));
  console.log(`\n${passed} passed / ${failed.length} failed`);
  if (pageErrors.length) console.log('pageerrors:', pageErrors.slice(0, 4));
  await browser.close();
  process.exit(failed.length ? 1 : 0);
}
