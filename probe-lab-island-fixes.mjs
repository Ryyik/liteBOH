import { chromium } from 'playwright';
import fs from 'node:fs';

// 探针：灵动岛交互修复回归
//  1) 仲裁：任务卡显示时自定义岛（配额岛）让位隐藏，任务卡收起后回归（修复进度条重叠）
//  2) 生成前澄清：意图「我想生成PPT」首条不扣费不生成，回澄清要点；第二条消息才进入生成
//  3) IME 守卫：isComposing Enter 不发送；普通 Enter 发送
const BASE = 'http://localhost:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));

await page.goto(`${BASE}/#/lab`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
await page.waitForTimeout(3000);

// ---- 1) 仲裁：任务卡 ↔ 自定义岛互斥 ----
const arbitrate = await page.evaluate(async () => {
  const { showIsland } = await import('/src/composables/useIsland.js');
  const host = document.querySelector('#unified-nav-container .island-custom-host');
  const hostVisibleBefore = host ? getComputedStyle(host).display !== 'none' : null;
  // 开一张任务卡（模拟生成中）
  const handle = showIsland.task({ title: '正在生成PPT', message: '仲裁测试', progress: 40 });
  await new Promise((r) => setTimeout(r, 500));
  const hostVisibleDuring = host ? getComputedStyle(host).display !== 'none' : null;
  const taskVisible = !!document.querySelector('#unified-nav-container .global-nav-task-card');
  handle.close();
  await new Promise((r) => setTimeout(r, 600));
  const hostVisibleAfter = host ? getComputedStyle(host).display !== 'none' : null;
  return { hostVisibleBefore, hostVisibleDuring, hostVisibleAfter, taskVisible };
});
check('任务卡出现前配额岛可见', arbitrate.hostVisibleBefore === true);
check('任务卡显示时自定义岛让位隐藏（修复重叠）', arbitrate.taskVisible && arbitrate.hostVisibleDuring === false, `task=${arbitrate.taskVisible} host=${arbitrate.hostVisibleDuring}`);
check('任务卡收起后配额岛回归', arbitrate.hostVisibleAfter === true);

// ---- 2) 生成前澄清 ----
// mock 配额 RPC（预扣=record_lab_usage，退还=refund_lab_usage）与 vault 流，分别计数
let consumeCalls = 0;
await page.route('**/rest/v1/rpc/record_lab_usage**', (route) => {
  consumeCalls += 1;
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
});
await page.route('**/rest/v1/rpc/refund_lab_usage**', (route) => {
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
});
// 匿名用量计数归零（防止 dev 库真实计数导致 isExceeded 短路）
await page.route('**/rest/v1/rpc/get_lab_usage_count**', (route) => {
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ count: 0 }]) });
});
let chatCalled = 0;
const vaultRequests = [];
await page.route('**/functions/v1/**', (route) => {
  const post = route.request().postData() || '';
  if (!post.includes('runtime-chat-stream')) {
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: [DONE]\n\n' });
  }
  chatCalled += 1;
  let userPrompt = '';
  let kind = 'chat';
  try {
    const body = JSON.parse(post);
    userPrompt = body.payload?.messages?.[1]?.content || '';
    const sys = body.payload?.messages?.[0]?.content || '';
    kind = sys.includes('演示文稿策划师') ? 'outline' : (sys.includes('质检师') ? 'fix' : 'page');
  } catch { /* ignore */ }
  vaultRequests.push({ kind, userPrompt });
  return route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: [DONE]\n\n' });
});

// ① 第一段：意图命中 → AI 主动询问细节（零扣费零 AI 调用）
await page.fill('.composer-input', '我想生成PPT');
await page.press('.composer-input', 'Enter');
await page.waitForTimeout(700);

const clarifyState = await page.evaluate(() => {
  const msgs = Array.from(document.querySelectorAll('.message-content'));
  const last = (msgs[msgs.length - 1]?.textContent || '').trim();
  return { last, msgCount: msgs.length };
});
check('① 意图命中 → AI 主动询问细节（不生成）', clarifyState.last.includes('对齐几个细节') && clarifyState.last.includes('页数'), clarifyState.last.slice(0, 40));
check('① 澄清轮零扣费零 AI 调用', consumeCalls === 0 && chatCalled === 0, `consume=${consumeCalls} chat=${chatCalled}`);

// IME：isComposing Enter 不应发送
await page.fill('.composer-input', '补充细节测试');
await page.locator('.composer-input').dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, keyCode: 229 });
await page.waitForTimeout(400);
const inputAfterIme = await page.inputValue('.composer-input');
check('IME 选词回车（isComposing）不发送', inputAfterIme === '补充细节测试', `inputValue="${inputAfterIme}"`);

// ② 第二段：用户补充细节 → AI 汇总「已记录你的要求」并主动询问是否可以开始
await page.fill('.composer-input', '季度业务回顾，给管理层看，12 页左右，重点讲增长');
await page.press('.composer-input', 'Enter');
await page.waitForTimeout(700);

const confirmState = await page.evaluate(() => {
  const msgs = Array.from(document.querySelectorAll('.message-content'));
  const last = (msgs[msgs.length - 1]?.textContent || '').trim();
  return { last };
});
check('② 补充后 AI 汇总「已记录你的要求」并主动询问', confirmState.last.includes('已记录你的要求') && confirmState.last.includes('开始生成'), confirmState.last.slice(0, 50));
check('② 汇总牢记用户细节（12 页/管理层）', confirmState.last.includes('12 页') && confirmState.last.includes('管理层'), confirmState.last.slice(0, 90));
check('② 确认前仍零扣费', consumeCalls === 0 && chatCalled === 0, `consume=${consumeCalls} chat=${chatCalled}`);

// ③ 第三段：用户继续补充 → 要求更新并再次确认（仍不生成）
await page.fill('.composer-input', '再补一页风险分析');
await page.press('.composer-input', 'Enter');
await page.waitForTimeout(700);
const updateState = await page.evaluate(() => {
  const msgs = Array.from(document.querySelectorAll('.message-content'));
  const last = (msgs[msgs.length - 1]?.textContent || '').trim();
  return { last };
});
check('③ 继续补充 → 更新记录并再次确认', updateState.last.includes('已记录你的要求') && updateState.last.includes('风险分析'), updateState.last.slice(0, 60));
check('③ 补充轮依旧零扣费', consumeCalls === 0, `consume=${consumeCalls}`);

// ④ 第四段：用户确认「开始生成」→ 预扣 + 真实生成（vault 被 mock，大纲会失败但不影响断言）
await page.fill('.composer-input', '开始生成');
await page.press('.composer-input', 'Enter');
await page.waitForTimeout(1500);

const genState = await page.evaluate(() => {
  const msgs = Array.from(document.querySelectorAll('.message-content'));
  const texts = msgs.map((el) => (el.textContent || '').trim());
  const hasProgress = texts.some((t) => t.includes('大纲') || t.includes('正在') || t.includes('生成'));
  return { hasProgress, msgCount: msgs.length };
});
check('④ 确认「开始生成」后触发生成流程', genState.hasProgress, `msgs=${genState.msgCount}`);
check('④ 确认后才预扣（record_lab_usage）', consumeCalls >= 1, `calls=${consumeCalls}`);
check('④ 生成轮发起大纲 AI 调用', chatCalled >= 1, `chat=${chatCalled}`);
// 牢记要求：大纲请求的 userPrompt 必须携带此前补充的全部细节
const outlineReq = vaultRequests.find((r) => r.kind === 'outline');
check('④ 生成输入牢记全部提示词要求', !!outlineReq && outlineReq.userPrompt.includes('12 页') && outlineReq.userPrompt.includes('风险分析') && outlineReq.userPrompt.includes('管理层'), outlineReq ? outlineReq.userPrompt.slice(0, 90) : '无大纲请求');
await page.screenshot({ path: `${OUT}/lab-clarify-flow.png` });

check('无页面运行时错误', errors.length === 0, errors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} passed ====`);
process.exit(failed.length ? 1 : 0);
