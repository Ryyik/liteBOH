import { chromium } from 'playwright';
import fs from 'node:fs';

// 探针：PPT 质量优化全链路回归（mock vault 流 + 模型配置，直调 usePPTGenerator）
// 断言：
//  1) 温度 clamp：服务端配置 0.9 → 实际 payload ≤ 0.5（结构化 JSON 稳定性）
//  2) 输出上限：max_tokens 走 FRONTEND_MAX_OUTPUT_TOKENS=4096 clamp
//  3) 要点字数下限：敷衍要点（<8 字）触发本地质检 → FIX 回路被调用 → 修正后含具体信息
//  4) 逐页衔接：第 2/3 页 userPrompt 注入「上一页版式」+「已生成页面概览（不得重复）」
//  5) 生成结果完整：3 页无降级
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

// ---- mock：lab_ai_model_configs（temperature 故意给 0.9，验证前端 clamp） ----
await page.route('**/rest/v1/lab_ai_model_configs**', (route) => {
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, body: '' });
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ model_id: 'Ultra', temperature: 0.9, max_tokens: 4096, api_key_purpose: 'chat' }]),
  });
});

// ---- mock：vault 流（SSE），按 systemPrompt 特征分流 ----
const requests = [];
let pageCallCount = 0;
const sse = (content) =>
  `event: meta\ndata: ${JSON.stringify({ keyInfo: null })}\n\ndata: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;

await page.route('**/functions/v1/**', (route) => {
  const req = route.request();
  const post = req.postData() || '';
  if (!post.includes('runtime-chat-stream')) return route.continue();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, body: '' });
  let payload = null;
  try { payload = JSON.parse(post).payload; } catch { return route.fulfill({ status: 400, body: '' }); }
  const sys = payload?.messages?.[0]?.content || '';
  const userPrompt = payload?.messages?.[1]?.content || '';
  const temperature = payload?.temperature;
  const maxTokens = payload?.max_tokens;

  let kind = 'page';
  let content = '';
  if (sys.includes('演示文稿策划师')) {
    kind = 'outline';
    content = JSON.stringify({
      title: '季度业务回顾', author: 'BOAHI', date: '2026 Q3',
      outline: [
        { type: 'cover', title: '季度业务回顾', summary: '开场与总体基调' },
        { type: 'bullets', title: '核心增长亮点', summary: '用数据说明本季增长' },
        { type: 'content', title: '下季度计划', summary: '明确下一步动作与目标' },
      ],
    });
  } else if (sys.includes('质检师')) {
    kind = 'fix';
    content = JSON.stringify({
      type: 'bullets', title: '核心增长亮点',
      points: [
        { text: '华东区营收增长 23%，超额完成目标', detail: '环比上季提升 8 个百分点' },
        { text: '新增企业客户 47 家，续约率 91%', detail: '大客户占比首次过半' },
        { text: '海外市场首单落地新加坡', detail: '' },
      ],
      speakerNotes: '本页用三组数据说明增长质量：区域、客户结构与国际化，重点强调续约率。',
    });
  } else {
    kind = 'page';
    pageCallCount += 1;
    if (pageCallCount === 1) {
      // 第一次故意返回敷衍要点（<8 字），必须触发质检 FIX 回路
      content = JSON.stringify({
        type: 'bullets', title: '核心增长亮点',
        points: [{ text: '市场很大' }, { text: '增长很快' }],
        speakerNotes: '本页讲增长情况。',
      });
    } else {
      content = JSON.stringify({
        type: 'content', title: '下季度计划',
        paragraphs: [
          { text: '下季度将围绕三条主线推进：华东区深耕、客户结构优化与海外市场复制，资源向已验证的增长路径倾斜。', style: 'body' },
          { text: '目标：营收环比增长 15%，新增企业客户 60 家，海外完成 3 个国家的落地。', style: 'body' },
        ],
        speakerNotes: '本页给出下季度目标与资源分配逻辑，承接上一页的增长数据。',
      });
    }
  }
  requests.push({ kind, temperature, maxTokens, userPrompt });
  return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(content) });
});

await page.goto(`${BASE}/#/lab`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
await page.waitForTimeout(2500);

// 直调生成器（绕过 UI sendPPT 的配额链路，聚焦生成质量逻辑）
const run = await page.evaluate(async () => {
  const mod = await import('/src/views/Lab/composables/usePPTGenerator.js');
  const gen = mod.usePPTGenerator();
  const outline = await gen.generateOutline('季度业务回顾', '', null, undefined);
  const result = await gen.generateSlidesPageByPage('季度业务回顾', '', outline, null, undefined);
  return {
    slides: result.slides.map((s) => ({
      type: s.type,
      title: s.title,
      firstPoint: Array.isArray(s.points) ? (typeof s.points[0] === 'object' ? s.points[0]?.text : s.points[0]) : null,
      degraded: result.qa?.degradedTitles?.includes(s.title) || false,
    })),
    qa: result.qa,
  };
});

check('生成完整 3 页且无降级', run.slides.length === 3 && run.qa.degradedPages === 0, JSON.stringify(run.qa));

// 1) 温度 clamp：配置 0.9 → payload ≤ 0.5
const temps = requests.filter((r) => r.kind !== 'outline').map((r) => r.temperature);
check('温度 clamp：配置 0.9 → 实际 ≤ 0.5', temps.length > 0 && temps.every((t) => Number(t) <= 0.5), `temps=${temps.join(',')}`);

// 2) 输出上限：max_tokens ≤ 4096 且生效
const maxTokensList = requests.map((r) => r.maxTokens);
check('max_tokens 走 FRONTEND_MAX_OUTPUT_TOKENS clamp', maxTokensList.length > 0 && maxTokensList.every((m) => Number(m) <= 4096), `max=${Math.max(...maxTokensList)}`);

// 3) 敷衍要点触发 FIX：第 1 页存在 fix 请求，且最终要点含具体信息
// （mock 页序：第 1 个 page 请求对应大纲首页 cover，敷衍 bullets 在 pageCallCount 分支返回后被 FIX）
const fixCalled = requests.some((r) => r.kind === 'fix');
check('敷衍要点（<8 字）触发质检 FIX 回路', fixCalled, `requests=${requests.map((r) => r.kind).join('→')}`);
const bulletsSlide = run.slides.find((s) => s.type === 'bullets');
check('FIX 后要点含具体信息（数字/主体）', /23%|91%/.test(String(bulletsSlide?.firstPoint || '')), `firstPoint="${bulletsSlide?.firstPoint}"`);

// 4) 逐页衔接：第 2 个 page 请求的 userPrompt 注入概览与上一页版式
const pageReqs = requests.filter((r) => r.kind === 'page');
const secondPage = pageReqs[1];
check('第 2 页 userPrompt 注入「上一页版式」', !!secondPage && secondPage.userPrompt.includes('上一页版式'));
check('第 2 页 userPrompt 注入「已生成页面概览」', !!secondPage && secondPage.userPrompt.includes('已生成页面概览') && secondPage.userPrompt.includes('不得重复'));
check('概览含上一页摘要（封面标题）', !!secondPage && secondPage.userPrompt.includes('季度业务回顾'), secondPage?.userPrompt.slice(0, 80));

check('无页面运行时错误', errors.length === 0, errors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} passed ====`);
process.exit(failed.length ? 1 : 0);
