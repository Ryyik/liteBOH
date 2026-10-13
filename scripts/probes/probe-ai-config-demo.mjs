import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

// =====================================================================
// 探针：AI 配置改版原型（ai-config-demo.html）行为验收
//
//   用法：node scripts/probes/probe-ai-config-demo.mjs
//   反证（把某处实现改回去后单跑一条）：
//     DEMO_FILE=file:///abs/ai-config-demo.html EXPECT_RED=预设平台的界面不出现 node scripts/probes/probe-ai-config-demo.mjs
//     EXPECT_RED 用**子串 includes** 匹配断言名（不切词 —— 断言名里有 / 和 ：）
//
//   覆盖：结构渲染 / tab 与状态卫生 / 标注挂点齐全 + elementFromPoint 可见性 /
//         主题与视口真重排 / 对比度（浅+暗，阈值 4.5）/ 添加平台向导（含"不出现 base_url"）/
//         手动平台三字段 / 添加模型弹窗不含平台配置 / 注入错误态 / [hidden] 不变式
//
//   ⚠️ 这条探针刻意带三类「反假绿」断言：
//     ① 标注挂点：从 window.__aiConfigDemo.getAnnos() 拿全量标注，
//        逐条在当前 panel 里查 DOM。**找不到即 FAIL** —— 不允许静默跳过。
//     ② elementFromPoint：chip 中心点必须命中自己（尺寸和 visibility 都测不出被裁）。
//     ③ [hidden] 不变式：带 hidden 的元素 getComputedStyle 必须 display:none
//        （.modal{display:flex} 与 [hidden]{display:none} 同特异性，靠源序决胜）。
// =====================================================================

const FILE = process.env.DEMO_FILE || 'file://' + path.resolve('ai-config-demo.html');
const OUT = process.env.SHOT_DIR || 'debug-screenshots';
const EXPECT_RED = String(process.env.EXPECT_RED || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: [
    '--no-proxy-server',
    '--proxy-server=direct://',
    '--proxy-bypass-list=*',
    '--allow-file-access-from-files',
  ],
});
const context = await browser.newContext({ viewport: { width: 1320, height: 940 } });
const page = await context.newPage();

const errors = [];
const failedRequests = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160));
});
page.on('requestfailed', (r) => failedRequests.push(r.url().slice(0, 140)));

await page.goto(FILE, { waitUntil: 'load', timeout: 60000 });
await page.waitForSelector('#platformList .pf-card', { timeout: 15000 });
await page.waitForTimeout(300);

const hasDemoHook = await page.evaluate(() => Boolean(window.__aiConfigDemo));
check(
  '原型暴露了探针钩子（否则后面的标注断言无法成立）',
  hasDemoHook === true,
  String(hasDemoHook),
);

// ==================== A. 结构 ====================
const s = await page.evaluate(() => ({
  tabs: [...document.querySelectorAll('.page-tab')].map((t) => t.textContent.trim()),
  platforms: document.querySelectorAll('#platformList .pf-card').length,
  activeName: (document.querySelector('#detail h2') || {}).textContent,
  keys: document.querySelectorAll('.key-row').length,
  models: document.querySelectorAll('.model-row').length,
  free: document.querySelectorAll('.model-row .badge.is-free').length,
  paid: document.querySelectorAll('.model-row .badge.is-paid').length,
  caps: document.querySelectorAll('.model-row .badge.is-cap').length,
  tiers: document.querySelectorAll('.model-row .model-tier').length,
  paidTexts: [...document.querySelectorAll('.model-row .badge.is-paid')].map((el) =>
    el.textContent.trim(),
  ),
  sceneCells: [...document.querySelectorAll('.model-scenes')].map((e) => e.textContent.trim()),
  switches: document.querySelectorAll('.model-row .switch').length,
  keyMask: (document.querySelector('.key-mask') || {}).textContent,
}));
check('三个分区标签', s.tabs.length === 3 && s.tabs[0] === '密钥与模型', s.tabs.join(' / '));
check('左栏 3 个平台卡', s.platforms === 3, String(s.platforms));
check('默认选中 SiliconFlow', (s.activeName || '').trim() === 'SiliconFlow', String(s.activeName));
check('该平台 3 个密钥', s.keys === 3, String(s.keys));
check('该平台 4 个模型', s.models === 4, String(s.models));
check('免费 / 按量徽标各 2 个', s.free === 2 && s.paid === 2, `${s.free}/${s.paid}`);
check(
  '模型行标出场景引用（含未被引用态）',
  s.sceneCells.some((t) => t.includes('BOHAI 对话')) &&
    s.sceneCells.some((t) => t.includes('未被任何场景引用')),
  s.sceneCells.join(' | '),
);
check('每个模型行有启停开关', s.switches === 4, String(s.switches));
check('密钥只显示脱敏值', String(s.keyMask || '').includes('····'), String(s.keyMask));
check(
  '模型行标出能力 / 计费 / 可用档位',
  s.caps === 4 && s.tiers === 4 && s.free === 2 && s.paid === 2,
  `能力=${s.caps} 档位=${s.tiers} 免费=${s.free} 按量=${s.paid}`,
);
check(
  '按量模型把倍率写在徽标上（不是笼统的「按量」）',
  s.paidTexts.every((t) => /\d/.test(t)),
  s.paidTexts.join(' | '),
);

// ==================== B. 标注：挂点 + 可见性 ====================
const annoAudit = await page.evaluate(() => {
  const annos = window.__aiConfigDemo.getAnnos();
  const tab = window.__aiConfigDemo.getState().tab;
  const root = document.querySelector('#page');
  const forTab = annos.filter((a) => a.tab === tab);
  const missing = forTab
    .filter((a) => {
      const el = root.querySelector('[data-anno="' + a.id + '"]');
      return !el || el.getClientRects().length === 0;
    })
    .map((a) => a.id);
  // 关键：断言「chip 真的画出来了」而不是「模板里写了 data-anno」。
  // 前者能抓到 layoutAnnotations 的查找范围被改错（撤掉修复会红），后者只能抓漏写挂点。
  const noChip = forTab
    .filter((a) => !document.querySelector('.anno-chip[data-anno-chip="' + a.id + '"]'))
    .map((a) => a.id);
  return {
    expected: forTab.length,
    missing,
    noChip,
    chips: document.querySelectorAll('.anno-chip').length,
  };
});
check(
  '每条标注都渲染出了对应 chip（按 id 对齐，撤掉渲染逻辑即红）',
  annoAudit.noChip.length === 0,
  annoAudit.noChip.join(',') || 'ok',
);
check(
  '标注挂点齐全（漏写 data-anno 会被点名）',
  annoAudit.missing.length === 0,
  annoAudit.missing.join(',') || 'ok',
);
check(
  'chip 数与当前页标注数一致',
  annoAudit.chips === annoAudit.expected,
  `${annoAudit.chips}/${annoAudit.expected}`,
);

const chipGeo = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.anno-chip').forEach((c) => {
    const r = c.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    out.push({ hit: el === c, size: Math.round(r.width) + 'x' + Math.round(r.height) });
  });
  return out;
});
check(
  '每个 chip 都能被 elementFromPoint 命中自己（未被裁 / 未压在别的层下）',
  chipGeo.length > 0 && chipGeo.every((h) => h.hit),
  chipGeo.length + ' chips, miss=' + chipGeo.filter((h) => !h.hit).length,
);
check(
  'chip 尺寸稳定 20x20',
  chipGeo.every((h) => h.size === '20x20'),
  chipGeo.map((h) => h.size).join(','),
);

await page.click('.anno-chip');
await page.waitForSelector('.anno-pop', { timeout: 3000 });
const popText = await page.textContent('.anno-pop');
check(
  '点开标注气泡含「原来 / 现在」',
  popText.includes('原来') && popText.includes('现在'),
  popText.slice(0, 40),
);

// ==================== C. 平台切换 + 状态卫生 ====================
await page.click('[data-pf="zhipu"]');
await page.waitForTimeout(220);
const sw = await page.evaluate(() => ({
  name: (document.querySelector('#detail h2') || {}).textContent,
  keys: document.querySelectorAll('.key-row').length,
  models: document.querySelectorAll('.model-row').length,
  pops: document.querySelectorAll('.anno-pop').length,
  activeCards: document.querySelectorAll('.pf-card.is-active').length,
}));
check('切到智谱：详情换成「智谱 AI」', (sw.name || '').trim() === '智谱 AI', String(sw.name));
check('密钥 / 模型数随平台变化', sw.keys === 1 && sw.models === 2, `${sw.keys}/${sw.models}`);
check('状态类卫生：切平台后旧气泡已关闭', sw.pops === 0, String(sw.pops));
check('高亮的平台卡唯一', sw.activeCards === 1, String(sw.activeCards));

await page.click('[data-pf="custom"]');
await page.waitForTimeout(220);
const noKey = await page.evaluate(() => ({
  badge: (document.querySelector('#detail .badge') || {}).textContent,
  empty: document.body.textContent.includes('还没有密钥'),
  badgeClass: (document.querySelector('#detail .badge') || {}).className,
}));
check(
  '未配密钥的平台走「未配置」分支（不是「已连接」）',
  String(noKey.badge).includes('未配置') &&
    noKey.empty &&
    !String(noKey.badgeClass).includes('is-ok'),
  String(noKey.badge),
);
await page.click('[data-pf="siliconflow"]');
await page.waitForTimeout(220);

// ==================== D. tab 切换 ====================
await page.click('.page-tab[data-tab="scenes"]');
await page.waitForTimeout(250);
const scenes = await page.evaluate(() => ({
  assetDisplay: getComputedStyle(document.querySelector('.panel[data-panel="assets"]')).display,
  sceneDisplay: getComputedStyle(document.querySelector('.panel[data-panel="scenes"]')).display,
  rows: document.querySelectorAll('.scene-row').length,
  groups: document.querySelectorAll('.scene-select optgroup').length,
  saveDisabled: document.querySelector('#btnSceneSave').disabled,
  chipCount: document.querySelectorAll('.anno-chip').length,
  affects: document.querySelectorAll('.scene-affects').length,
  switches: document.querySelectorAll('[data-scene-active]').length,
  needHints: document.querySelectorAll('.sub-need').length,
  warns: document.querySelectorAll('.sub-warn').length,
}));
check(
  '切到场景页：旧面板 display:none',
  scenes.assetDisplay === 'none' && scenes.sceneDisplay !== 'none',
  `${scenes.assetDisplay}/${scenes.sceneDisplay}`,
);
check('场景 4 行', scenes.rows === 4, String(scenes.rows));
check('模型下拉按平台分组（≥2 个 optgroup）', scenes.groups >= 2, String(scenes.groups));
check('每个场景写明「影响什么」', scenes.affects === 4, String(scenes.affects));
check('每个场景有独立启停', scenes.switches === 4, String(scenes.switches));
check(
  '子场景标注所需能力（需要「能看图」的模型）',
  scenes.needHints >= 2,
  String(scenes.needHints),
);
check('能力不匹配时给出警示（不是静默失败）', scenes.warns >= 2, String(scenes.warns));
check('未改动时保存按钮不可点', scenes.saveDisabled === true, String(scenes.saveDisabled));
check('标注随 tab 重绘（切页后 chip 仍在）', scenes.chipCount > 0, String(scenes.chipCount));

await page.evaluate(() => document.querySelector('#btnSceneSave').click());
await page.waitForTimeout(200);
const stillDisabled = await page.$eval('#btnSceneSave', (el) => el.disabled);
check('禁用按钮被点后仍禁用（无副作用）', stillDisabled === true, String(stillDisabled));

const subsBefore = await page.$$eval('.sub-row', (els) => els.length);
await page.click('[data-tree="lab"]');
await page.waitForTimeout(250);
const subsAfter = await page.$$eval('.sub-row', (els) => els.length);
check('实验室展开后多出 4 个子项', subsAfter - subsBefore === 4, `${subsBefore} → ${subsAfter}`);

// 场景级参数：展开后能改，且改动会激活保存按钮
await page.click('[data-params="chat"]');
await page.waitForTimeout(250);
const paramOpen = await page.evaluate(() => ({
  inputs: document.querySelectorAll('.scene-params input').length,
  temp: document.querySelector('.scene-params input[data-param="temperature"]') ? true : false,
}));
check(
  '场景参数区展开出温度与最大输出',
  paramOpen.inputs === 2 && paramOpen.temp,
  String(paramOpen.inputs),
);

await page.fill('.scene-params input[data-param="temperature"]', '0.2');
await page.waitForTimeout(250);
const paramDirty = await page.$eval('#btnSceneSave', (el) => !el.disabled);
check('改场景参数会激活保存按钮', paramDirty === true, '');

await page.selectOption('[data-scene="chat"]', { index: 1 });
await page.waitForTimeout(250);
const dirty = await page.$eval('#btnSceneSave', (el) => !el.disabled);
check('改动下拉后保存按钮激活', dirty === true, '');
await page.click('#btnSceneReset');
await page.waitForTimeout(250);
const reset = await page.$eval('#btnSceneSave', (el) => el.disabled);
check('放弃改动后保存按钮回到禁用', reset === true, String(reset));

// ==================== E. 主题 / 视口 ====================
await page.click('.page-tab[data-tab="assets"]');
await page.waitForTimeout(250);
const lightColor = await page.evaluate(
  () => getComputedStyle(document.querySelector('#railFoot')).color,
);

const measureContrast = () =>
  page.evaluate(() => {
    const parse = (raw) => {
      const t = String(raw).trim();
      if (t.startsWith('#')) {
        const h = t.slice(1);
        const full =
          h.length === 3
            ? h
                .split('')
                .map((x) => x + x)
                .join('')
            : h;
        return [
          parseInt(full.slice(0, 2), 16),
          parseInt(full.slice(2, 4), 16),
          parseInt(full.slice(4, 6), 16),
        ];
      }
      return (t.match(/[\d.]+/g) || []).map(Number);
    };
    const over = (fg, bg) => {
      const a = fg.length > 3 ? fg[3] : 1;
      return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
    };
    const lum = (c) => {
      const f = c
        .slice(0, 3)
        .map((v) => v / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
      return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
    };
    const ratio = (a, b) => {
      const l1 = lum(a);
      const l2 = lum(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    const bgOf = (el) => {
      const stack = [];
      let node = el;
      while (node && node !== document.documentElement) {
        const cs = getComputedStyle(node);
        if (node.classList && node.classList.contains('page')) {
          stack.push(parse(cs.getPropertyValue('--surface-composited')));
          break;
        }
        const c = parse(cs.backgroundColor);
        if (c.length >= 3 && (c.length < 4 || c[3] > 0.001)) stack.push(c);
        node = node.parentElement;
      }
      stack.push([255, 255, 255]);
      let base = stack.pop();
      while (stack.length) base = over(stack.pop(), base);
      return base;
    };
    const sels = [
      '.model-id',
      '.key-mask',
      '#railFoot',
      '.model-scenes',
      '.page-head p',
      '.detail-url',
    ];
    const out = [];
    sels.forEach((sel) => {
      const el = document.querySelector('.panel.is-on ' + sel);
      if (!el || el.getClientRects().length === 0) return;
      const cs = getComputedStyle(el);
      const bg = bgOf(el);
      out.push({ sel, ratio: +ratio(over(parse(cs.color), bg), bg).toFixed(2) });
    });
    return out;
  });

const lightC = await measureContrast();
check(
  '浅色：次要文字对比度全部 ≥ 4.5',
  lightC.length > 0 && lightC.every((x) => x.ratio >= 4.5),
  lightC.map((x) => x.sel + '=' + x.ratio).join(' '),
);

await page.click('[data-theme-set="dark"]');
await page.waitForTimeout(300);
const darkInfo = await page.evaluate(() => ({
  attr: document.querySelector('#page').getAttribute('data-theme'),
  color: getComputedStyle(document.querySelector('#railFoot')).color,
  surface: getComputedStyle(document.querySelector('#page'))
    .getPropertyValue('--surface-composited')
    .trim(),
}));
check('切暗色写入 data-theme=dark', darkInfo.attr === 'dark', String(darkInfo.attr));
check('暗色下文字色确实翻转', darkInfo.color !== lightColor, `${lightColor} → ${darkInfo.color}`);
check('暗色合成底色变量已切换', darkInfo.surface === '#1c1c24', darkInfo.surface);

const darkC = await measureContrast();
check(
  '暗色：次要文字对比度全部 ≥ 4.5',
  darkC.length > 0 && darkC.every((x) => x.ratio >= 4.5),
  darkC.map((x) => x.sel + '=' + x.ratio).join(' '),
);
await page.screenshot({ path: path.join(OUT, 'ai-config-demo-dark.png') });

await page.click('[data-theme-set="light"]');
await page.waitForTimeout(300);

const deskCols = await page.evaluate(
  () =>
    getComputedStyle(document.querySelector('.assets-grid')).gridTemplateColumns.split(' ').length,
);
await page.click('[data-vp-set="mobile"]');
await page.waitForTimeout(420);
const mob = await page.evaluate(() => ({
  cols: getComputedStyle(document.querySelector('.assets-grid')).gridTemplateColumns.split(' ')
    .length,
  frameWidth: Math.round(document.querySelector('#frame').getBoundingClientRect().width),
  headDir: getComputedStyle(document.querySelector('.page-head')).flexDirection,
  keyRowCols: getComputedStyle(document.querySelector('.key-row')).gridTemplateColumns.split(' ')
    .length,
}));
check('桌面档：左栏 + 详情两列', deskCols === 2, String(deskCols));
check('移动档：真的重排成单列（不是缩放）', mob.cols === 1, String(mob.cols));
check('移动档：容器宽度收窄到手机档', mob.frameWidth <= 400, String(mob.frameWidth));
check('移动档：页头改纵向堆叠', mob.headDir === 'column', mob.headDir);
check('移动档：密钥行重排为两列', mob.keyRowCols === 2, String(mob.keyRowCols));
await page.screenshot({ path: path.join(OUT, 'ai-config-demo-mobile.png') });
await page.click('[data-vp-set="desktop"]');
await page.waitForTimeout(420);

// ==================== F. 添加平台向导（预设 + 无 base_url） ====================
await page.click('#btnAddPlatform');
await page.waitForSelector('#wizard:not([hidden])', { timeout: 5000 });
const w1 = await page.evaluate(() => ({
  presets: document.querySelectorAll('[data-preset]').length,
  steps: document.querySelectorAll('.step').length,
  hasManualOption: [...document.querySelectorAll('[data-preset]')].some((el) =>
    el.textContent.includes('手动添加平台'),
  ),
}));
check('向导第一步列出 4 个预设', w1.presets === 4, String(w1.presets));
check('向导共 3 步', w1.steps === 3, String(w1.steps));
check('预设里含「手动添加平台」入口', w1.hasManualOption === true, String(w1.hasManualOption));

await page.click('[data-preset="siliconflow"]');
await page.waitForTimeout(260);
const w2 = await page.evaluate(() => ({
  inputs: [...document.querySelectorAll('#wizBody input')].map((i) => i.id),
  text: document.querySelector('#wizBody').textContent,
  step:
    [...document.querySelectorAll('.step')].findIndex((el) => el.classList.contains('is-now')) + 1,
}));
check('选完预设直接进第 2 步（少一次点击）', w2.step === 2, String(w2.step));
check(
  '第 2 步只有密钥一个输入框',
  w2.inputs.length === 1 && w2.inputs[0] === 'wizKey',
  w2.inputs.join(','),
);
check('预设平台界面完全不出现 base_url', !/https?:\/\//.test(w2.text), w2.text.slice(0, 60));

await page.fill('#wizKey', 'sk-demo-0123456789abcdefghij');
await page.click('#wizVerify');
await page.waitForTimeout(1500);
const w3 = await page.evaluate(() => ({
  step:
    [...document.querySelectorAll('.step')].findIndex((el) => el.classList.contains('is-now')) + 1,
  picks: document.querySelectorAll('[data-pick]').length,
  checked: document.querySelectorAll('[data-pick]:checked').length,
  ok: (document.querySelector('.wiz-ok') || {}).textContent || '',
}));
check('验证通过后自动跳到第 3 步（自动检测）', w3.step === 3, String(w3.step));
check('自动拉回到 6 个模型', w3.picks === 6, String(w3.picks));
check('免费档默认勾选 4 个', w3.checked === 4, String(w3.checked));
check('给出「自动检测到 N 个」反馈', w3.ok.includes('自动检测'), w3.ok.slice(0, 40));

const beforeModels = await page.evaluate(
  () => window.__aiConfigDemo.getPlatforms().find((p) => p.id === 'siliconflow').models.length,
);
await page.click('#wizFinish');
await page.waitForTimeout(400);
const done = await page.evaluate(() => {
  const p = window.__aiConfigDemo.getPlatforms().find((x) => x.id === 'siliconflow');
  return {
    models: p.models.length,
    keys: p.keys.length,
    hidden: document.querySelector('#wizard').hidden,
  };
});
check(
  '完成后只写入默认勾选的免费模型（4 → 5；付费的 DeepSeek-R1 没被带进来）',
  done.models === beforeModels + 1,
  `${beforeModels} → ${done.models}`,
);
check('完成后密钥 +1', done.keys === 4, String(done.keys));
check('完成后弹窗关闭', done.hidden === true, String(done.hidden));

// ==================== G. 手动添加平台：恰好三个字段 ====================
await page.click('#btnAddPlatform');
await page.waitForSelector('#wizard:not([hidden])', { timeout: 5000 });
await page.click('[data-preset="custom"]');
await page.waitForTimeout(260);
const manual = await page.evaluate(() => ({
  inputs: [...document.querySelectorAll('#wizBody input')].map((i) => i.id),
  labels: [...document.querySelectorAll('#wizBody label')].map((l) => l.textContent.trim()),
}));
check(
  '手动平台恰好三个字段（名称 / 地址 / 密钥）',
  manual.inputs.join(',') === 'wizName,wizUrl,wizKey',
  manual.inputs.join(','),
);
check(
  '三个字段的标签正确',
  manual.labels.join('|').includes('平台名称') && manual.labels.join('|').includes('API 地址'),
  manual.labels.join('|'),
);

await page.click('#wizVerify');
await page.waitForTimeout(250);
const nameErr = (await page.textContent('.wiz-error')) || '';
check('空平台名被拦截', nameErr.includes('平台名称不能为空'), nameErr.slice(0, 40));

await page.fill('#wizName', '内网网关');
await page.click('#wizVerify');
await page.waitForTimeout(250);
const urlErr = (await page.textContent('.wiz-error')) || '';
check('地址缺协议头被拦截', urlErr.includes('http'), urlErr.slice(0, 40));

await page.fill('#wizUrl', 'https://gw.internal/v1');
await page.fill('#wizKey', 'sk-internal-9876543210zyxwvuts');
await page.click('#wizVerify');
await page.waitForTimeout(1500);
const mStep = await page.evaluate(
  () =>
    [...document.querySelectorAll('.step')].findIndex((el) => el.classList.contains('is-now')) + 1,
);
check('手动平台校验通过后进入选模型', mStep === 3, String(mStep));
await page.click('#wizFinish');
await page.waitForTimeout(400);
const manualAdded = await page.evaluate(() => {
  const ps = window.__aiConfigDemo.getPlatforms();
  const p = ps.find((x) => x.name === '内网网关');
  return { count: ps.length, url: p ? p.baseUrl : '', keys: p ? p.keys.length : -1 };
});
check('手动平台已加入（平台数 3 → 4）', manualAdded.count === 4, String(manualAdded.count));
check('手动平台带上了用户填的地址', manualAdded.url === 'https://gw.internal/v1', manualAdded.url);

// ==================== H. 添加模型弹窗：不碰平台配置 ====================
await page.click('#btnAddModel');
await page.waitForSelector('#modelWizard:not([hidden])', { timeout: 5000 });
const mw = await page.evaluate(() => ({
  inputs: [...document.querySelectorAll('#mwBody input')].map((i) => i.id),
  selects: [...document.querySelectorAll('#mwBody select')].map((el) => el.id),
  text: document.querySelector('#mwBody').textContent,
  platformValue: document.querySelector('#mwPlatform').value,
}));
check(
  '添加模型只有「平台下拉 + 模型信息」，没有别的输入框',
  mw.inputs.length === 0 && mw.selects.join(',') === 'mwPlatform',
  `${mw.inputs.join(',')} / ${mw.selects.join(',')}`,
);
check('添加模型弹窗里不出现接口地址', !/https?:\/\//.test(mw.text), mw.text.slice(0, 70));
check('平台默认选中当前平台', mw.platformValue.length > 0, mw.platformValue);

await page.click('[data-mw-src="manual"]');
await page.waitForTimeout(220);
const mwManual = await page.evaluate(() =>
  [...document.querySelectorAll('#mwBody input')].map((i) => i.id),
);
check(
  '手动填写只有模型 ID 与显示名称',
  mwManual.join(',') === 'mwModelId,mwName',
  mwManual.join(','),
);

const beforeM = await page.evaluate(
  () => window.__aiConfigDemo.getState().platforms.find((p) => p.name === '内网网关').models.length,
);
await page.fill('#mwModelId', 'internal/llm-7b');
await page.click('#mwSubmit');
await page.waitForTimeout(400);
const afterM = await page.evaluate(() => {
  const p = window.__aiConfigDemo.getState().platforms.find((x) => x.name === '内网网关');
  return { models: p.models.length, hidden: document.querySelector('#modelWizard').hidden };
});
check('手动模型已加入', afterM.models === beforeM + 1, `${beforeM} → ${afterM.models}`);
check('加入后弹窗关闭', afterM.hidden === true, String(afterM.hidden));

// ==================== H2. 模型设置：字段是否「说得清」 ====================
await page.click('.page-tab[data-tab="assets"]');
await page.waitForTimeout(300);
await page.click('.model-row [data-model-edit]');
await page.waitForSelector('#modelEditor:not([hidden])', { timeout: 5000 });
const me = await page.evaluate(() => {
  const fields = [...document.querySelectorAll('#meBody .field')];
  return {
    sections: [...document.querySelectorAll('#meBody .msection > h4')].map((h) =>
      h.textContent.trim(),
    ),
    fields: fields.length,
    withHint: fields.filter((f) => f.querySelector('.hint')).length,
    readonlyPlatform: (document.querySelector('#meBody .me-ro') || {}).textContent || '',
    noUrlInput: [...document.querySelectorAll('#meBody input')].every(
      (i) => i.getAttribute('data-me') !== 'api_url',
    ),
    selects: [...document.querySelectorAll('#meBody select')].map((el) =>
      el.getAttribute('data-me'),
    ),
    capTexts: [...document.querySelectorAll('#meBody select[data-me="capability"] option')].map(
      (el) => el.textContent.trim(),
    ),
    tierCount: document.querySelectorAll('#meBody select[data-me="minTier"] option').length,
  };
});
check('模型设置按「人的心智」分 4 组', me.sections.length === 4, me.sections.join(' / '));
check(
  '每个字段都带一句说明（没有裸字段）',
  me.fields > 0 && me.fields === me.withHint,
  `${me.withHint}/${me.fields}`,
);
check(
  '平台地址是只读继承（模型上不再有地址输入框）',
  me.readonlyPlatform.length > 0 && me.noUrlInput,
  me.readonlyPlatform.slice(0, 44),
);
check(
  '能力 / 档位是下拉选择，不是手填字符串',
  me.selects.join(',') === 'capability,minTier',
  me.selects.join(','),
);
check(
  '能力选项用「能干什么」描述，不暴露内部枚举名',
  me.capTexts.some((t) => t.includes('能看图')) &&
    me.capTexts.every((t) => !t.includes('multimodal')),
  me.capTexts.join(' | '),
);
check(
  '档位收成可读阶梯（≤6 项，而不是 10 个扁平值）',
  me.tierCount > 0 && me.tierCount <= 6,
  String(me.tierCount),
);

await page.fill('#meBody input[data-me="multiplier"]', '2');
await page.click('#meSave');
await page.waitForTimeout(400);
const afterPaid = await page.evaluate(() => {
  const row = document.querySelector('.model-row');
  return {
    hidden: document.querySelector('#modelEditor').hidden,
    isPaid: Boolean(row.querySelector('.badge.is-paid')),
    meta: row.querySelector('.model-meta').textContent,
  };
});
check('保存后弹窗关闭', afterPaid.hidden === true, String(afterPaid.hidden));
check(
  '倍率调到 2 后徽标自动变「按量 ×2」（联动，不用另填字段）',
  afterPaid.isPaid && afterPaid.meta.includes('2'),
  afterPaid.meta,
);

await page.click('.model-row [data-model-edit]');
await page.waitForSelector('#modelEditor:not([hidden])', { timeout: 5000 });
await page.fill('#meBody input[data-me="name"]', '');
await page.click('#meSave');
await page.waitForTimeout(300);
const nameGuard = await page.evaluate(() => ({
  open: !document.querySelector('#modelEditor').hidden,
  err: (document.querySelector('#modelEditor .wiz-error') || {}).textContent || '',
}));
check(
  '显示名清空被拦下，并说明「用户看到的就是这个名字」',
  nameGuard.open && nameGuard.err.includes('显示名称不能为空'),
  nameGuard.err.slice(0, 46),
);
await page.click('#meCancel');
await page.waitForTimeout(300);

// ==================== I. 注入错误态 ====================
await page.click('#btnInject');
await page.waitForTimeout(450);
const inj = await page.evaluate(() => ({
  open: !document.querySelector('#wizard').hidden,
  step:
    [...document.querySelectorAll('.step')].findIndex((el) => el.classList.contains('is-now')) + 1,
  err: (document.querySelector('#wizard .wiz-error') || {}).textContent || '',
}));
check(
  '注入错误态打开向导并停在密钥步',
  inj.open && inj.step === 2,
  `open=${inj.open} step=${inj.step}`,
);
check('非法密钥被拦下', inj.err.includes('密钥格式不正确'), inj.err.slice(0, 50));
await page.click('#wizCancel');
await page.waitForTimeout(250);

// ==================== J. 不变式 + 截图 ====================
const hiddenViolations = await page.evaluate(() =>
  [...document.querySelectorAll('[hidden]')]
    .filter((el) => getComputedStyle(el).display !== 'none')
    .map((el) => el.id || el.className),
);
check(
  '[hidden] 不变式：带 hidden 的元素都不可见',
  hiddenViolations.length === 0,
  hiddenViolations.join(','),
);

const backToTop = await page.evaluate(() => {
  document.documentElement.scrollTop = 0;
  return document.querySelectorAll('.page-tab').length;
});
check('页面结构仍完整', backToTop === 3, String(backToTop));

check('无 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));

await page.click('.page-tab[data-tab="assets"]');
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(OUT, 'ai-config-demo-assets.png') });
await page.click('.page-tab[data-tab="scenes"]');
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(OUT, 'ai-config-demo-scenes.png') });
await page.click('.page-tab[data-tab="quota"]');
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(OUT, 'ai-config-demo-quota.png') });

await browser.close();

if (failedRequests.length) {
  console.log(`\n[warn] 有资源加载失败：${failedRequests.slice(0, 3).join(' | ')}`);
  console.log('       若为背景图，玻璃材质无从体现，反证环境可能与真实环境不一致。');
}

const failed = results.filter((r) => r.pass === false);
console.log('\n' + '='.repeat(64));
console.log(
  `总计 ${results.length} 项，通过 ${results.filter((r) => r.pass).length}，失败 ${failed.length}`,
);
if (failed.length) {
  console.log('失败项：');
  failed.forEach((f) => console.log('  - ' + f.name + (f.detail ? '  :: ' + f.detail : '')));
}

if (EXPECT_RED.length) {
  const hit = EXPECT_RED.filter((k) => failed.some((f) => f.name.includes(k)));
  const missing = EXPECT_RED.filter((k) => !failed.some((f) => f.name.includes(k)));
  console.log(`\n[反证] 期望变红 ${EXPECT_RED.length} 项，命中 ${hit.length} 项`);
  if (missing.length) {
    console.log('  未变红（说明这条断言是摆设）：' + missing.join(' | '));
    process.exit(1);
  }
  console.log('  反证成立：目标断言确实依赖被撤掉的实现');
  process.exit(0);
}

process.exit(failed.length ? 1 : 0);
