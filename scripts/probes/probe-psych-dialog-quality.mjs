/**
 * 心理访谈 · 对话质量评估探针
 *
 * 做法：探针扮演一个来访者，按「剧本」逐轮回答，每轮抓下 AI 的提问并自动判分。
 * 剧本每一轮都针对一项具体能力，不是随便聊：
 *
 *   轮1 给具体事件      → 检验是否展开细节（而不是跳到"你感觉怎么样"）
 *   轮2 回一个词「烦」  → 检验是否把这个词展开（而不是换下一个维度）
 *   轮3 说「不知道」    → 检验是否换更小的入口（而不是重复同一个问题）
 *   轮4 说绝对化的话    → 检验是否往下追意义 / 追「别人」是谁
 *   轮5 递出一个例外    → 检验 P1「例外优先」：是否停下主线放大它 ★最关键
 *   轮6 给出自我矛盾    → 检验是否把两句并置
 *   轮7 表达不适        → 检验是否放缓、不追问
 *   轮8 主动换话题      → 检验是否顺着走
 *   轮9 要求出报告      → 检验是否给出结构完整的报告
 *
 * 判据直接 import 产品里的 guards.js —— 测的就是产品真正用的标准。
 *
 * ⚠️ 本探针会**真实调用模型**（要测质量就不能拦截），会消耗账号额度。轮数可用 ROUNDS 控制。
 *
 * 用法（从仓库根跑，dev server 需在 5173）：
 *   node scripts/probes/probe-psych-dialog-quality.mjs
 *   ROUNDS=5 node scripts/probes/probe-psych-dialog-quality.mjs   # 只跑前 5 轮
 */
import { chromium } from 'playwright';
import { detectViolations, splitQuestions } from '../../src/views/BOHAI/expert-roles/guards.js';

const BASE = process.env.BASE || 'http://localhost:5173';
const MAX_ROUNDS = Math.max(1, Math.min(9, Number(process.env.ROUNDS) || 9));
const PROBE_UID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';

/** 剧本：text = 我要说的话；probe = 这一轮在测什么；expectHook = 下一问里应出现的词（命中任一即算钩住） */
const SCRIPT = [
  {
    text: '上周三晚上我列了特别详细的一周计划，周四中午就全废了，晚上刷手机刷到两点。',
    probe: '给具体事件 → 应展开细节',
    expectHook: ['周四', '计划', '两点', '刷手机', '周三']
  },
  {
    text: '烦。',
    probe: '回一个词 → 应把这个词展开，不该换维度',
    expectHook: ['烦']
  },
  {
    text: '不知道，想不起来了。',
    probe: '说不知道 → 应换更小的入口，不该重复同一问',
    expectHook: []
  },
  {
    text: '我可能就是那种只会想不会做的人吧，别人都能坚持，我不能。',
    probe: '绝对化 → 应往下追意义或追「别人」是谁',
    expectHook: ['别人', '意味着', '说明', '那种人', '只会想']
  },
  {
    text: '不过上个月做海报那次不一样，从下午三点做到晚上十一点，中间一次都没停。',
    probe: '★例外优先：下一问应停在这个例外上',
    expectHook: ['海报', '那次', '十一点', '三点', '没停']
  },
  {
    text: '其实我答应别人的事基本都能做到，就是自己的计划老废。',
    probe: '自我矛盾 → 应把两句并置',
    expectHook: ['别人', '自己', '答应', '计划']
  },
  {
    text: '说到这个我胸口有点闷，不太想继续聊这个了。',
    probe: '表达不适 → 应放缓、不追问同一话题',
    expectHook: []
  },
  {
    text: '那我们聊别的吧，我最近跟室友关系有点紧张。',
    probe: '主动换话题 → 应顺着走',
    expectHook: ['室友', '关系', '紧张']
  },
  {
    text: '差不多了，帮我把这次的整理成一份报告吧。',
    probe: '要求出报告 → 应给出结构完整的报告',
    expectHook: ['我听到', '模式', '下一步', '例外']
  }
];

// 额度/网络类错误不是「回答」——必须识别出来并中止，否则会把「服务暂时繁忙」当成
// AI 的提问去评分，整份报告全是假的（第一版就踩了这个：8/10「问题」里有 7 个是假的）。
const ERROR_PATTERNS = /(服务暂时繁忙|额度已用完|请稍后重试|请求失败|网络异常|服务异常|响应超时)/;

const normalize = (text) => String(text || '').replace(/\s+/g, '');

const evaluate = (reply, { prevReply, prevUserText, expectHook, isReport }) => {
  // 判据直接用产品里的 guards（复述 / 重复上一问 / 选项 / 一轮多问 / 术语 / 建议），不另维护一套
  const issues = [...detectViolations(reply, { prevReply, prevUserText }).map((item) => item.type)];
  const questions = splitQuestions(reply);

  if (/(通常|平常|一般来说|大部分时候)/.test(reply)) issues.push('泛化提问');
  if (expectHook && expectHook.length) {
    const hooked = expectHook.some((word) => reply.includes(word));
    if (!hooked && reply.length > 0) issues.push('未钩住上一句');
  }
  if (isReport) {
    const needed = ['我听到', '模式'];
    needed.forEach((key) => {
      if (!reply.includes(key)) issues.push(`报告缺「${key}」`);
    });
  }
  return { issues: Array.from(new Set(issues)), questionCount: questions.length };
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 160)));

// 真实 BOHAI 的消息结构（与 demo 不同）：
//   .message-wrapper.{assistant|user} > .message-content-inner > .message.{role} > .message-content
const readState = () => page.evaluate(() => {
  const bubbles = Array.from(document.querySelectorAll('.message-wrapper.assistant .message-content'));
  const users = Array.from(document.querySelectorAll('.message-wrapper.user'));
  const lastAi = bubbles[bubbles.length - 1];
  return {
    aiCount: bubbles.length,
    userCount: users.length,
    text: lastAi ? lastAi.textContent.trim() : '',
    loading: false
  };
});

/** 等一条新的 AI 回复并稳定下来（内容连续多次不变 + 无 loading） */
const waitForReply = async (minAiCount, timeoutMs = 120000) => {
  const started = Date.now();
  let lastText = '';
  let stable = 0;
  while (Date.now() - started < timeoutMs) {
    const state = await readState();
    if (state.aiCount >= minAiCount && state.text && !state.loading) {
      if (state.text === lastText) {
        stable += 1;
        if (stable >= 4) return state.text;
      } else {
        stable = 0;
      }
      lastText = state.text;
    }
    await page.waitForTimeout(1200);
  }
  return lastText;
};

const rounds = [];
let aborted = null;
const started = Date.now();

try {
  await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.evaluate((uid) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const auth = pinia.state.value.auth;
    auth.isLoggedIn = true;
    if (auth.userInfo) Object.assign(auth.userInfo, { username: 'probe_user', id: uid });
  }, PROBE_UID);
  await page.waitForTimeout(800);

  // 清掉旧会话，保证从空开始
  await page.evaluate(() => localStorage.removeItem('boh_chat_sessions'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.evaluate((uid) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const auth = pinia.state.value.auth;
    auth.isLoggedIn = true;
    if (auth.userInfo) Object.assign(auth.userInfo, { username: 'probe_user', id: uid });
  }, PROBE_UID);
  await page.waitForTimeout(800);

  // 入口：加号 → 心理分析
  await page.waitForSelector('.features-btn', { timeout: 20000 });
  await page.click('.features-btn');
  await page.waitForSelector('.feature-action-row', { timeout: 10000 });
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.feature-action-row'));
    rows.find((el) => (el.textContent || '').includes('心理分析'))?.click();
  });

  // 开场：AI 的主动提问
  const opening = await waitForReply(1);
  rounds.push({ round: 0, user: '（点击「心理分析」入口）', probe: '主动开场', reply: opening, ...evaluate(opening, {}) });
  console.log(`\n[轮 0 · 主动开场]\nAI: ${opening.slice(0, 300)}\n`);

  let prevReply = opening;
  for (let i = 0; i < MAX_ROUNDS; i += 1) {
    const step = SCRIPT[i];
    const targetAiCount = rounds[rounds.length - 1].aiCount
      ? rounds[rounds.length - 1].aiCount + 1
      : (await readState()).aiCount + 1;

    await page.fill('textarea.input-textarea', step.text);
    await page.click('.send-btn');
    const reply = await waitForReply(targetAiCount);
    if (!reply || ERROR_PATTERNS.test(reply)) {
      aborted = { at: i + 1, reply: String(reply || '(空回复)').slice(0, 140) };
      console.log(`\n⚠️ 轮 ${i + 1} 遇到模型错误，提前中止（不计入评分）：${aborted.reply}`);
      break;
    }

    const result = evaluate(reply, {
      prevReply,
      prevUserText: step.text,
      expectHook: step.expectHook,
      isReport: i === SCRIPT.length - 1
    });
    const state = await readState();
    rounds.push({ round: i + 1, user: step.text, probe: step.probe, reply, aiCount: state.aiCount, ...result });
    prevReply = reply;
    console.log(`[轮 ${i + 1}] ${step.probe}`);
    console.log(`  我：${step.text}`);
    console.log(`  AI：${reply.slice(0, 260)}${reply.length > 260 ? '…' : ''}`);
    console.log(`  判定：${result.issues.length ? result.issues.join(' / ') : 'OK'}\n`);
  }

  await page.screenshot({ path: 'debug-screenshots/psych-dialog-quality.png', fullPage: true });
} catch (error) {
  console.log('探针异常：', error?.message || error);
} finally {
  const scored = rounds.filter((r) => r.reply);
  const hardIssues = scored.filter((r) => r.issues.some((x) => ['options', 'multi_question', 'repeat', 'parrot', '未钩住上一句', '泛化提问', 'advice'].includes(x)));
  const hookRounds = scored.filter((r) => SCRIPT[r.round - 1]?.expectHook?.length);
  const hooked = hookRounds.filter((r) => !r.issues.includes('未钩住上一句'));

  console.log('════════ 汇总 ════════');
  if (aborted) {
    console.log(`⚠️ 测试在第 ${aborted.at} 轮中断（模型报错，多半是额度）：${aborted.reply}`);
    console.log('   中断后的轮次未计入，报告只反映中断之前的对话。');
  }
  console.log(`轮数：${scored.length}　耗时：${Math.round((Date.now() - started) / 1000)}s`);
  console.log(`有问题轮次：${hardIssues.length} / ${scored.length}`);
  console.log(`钩住上一句：${hooked.length} / ${hookRounds.length}`);
  const counter = {};
  scored.forEach((r) => r.issues.forEach((x) => { counter[x] = (counter[x] || 0) + 1; }));
  console.log('问题分布：', JSON.stringify(counter));
  const last = scored[scored.length - 1];
  console.log('报告是否生成：', last?.reply?.includes('我听到') || last?.reply?.includes('##') ? '是' : '否');
  if (pageErrors.length) console.log('pageerrors:', pageErrors.slice(0, 3));
  await browser.close();
  process.exit(0);
}
