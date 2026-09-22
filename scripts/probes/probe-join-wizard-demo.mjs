import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

// 探针：注册页方案 B（三步向导）demo 的行为验收
// 用法：node scripts/probes/probe-join-wizard-demo.mjs
//   反证：DEMO_FILE=file:///tmp/rev-A.html node scripts/probes/probe-join-wizard-demo.mjs
//   期望红：EXPECT_RED=birth_feb_days node ...（命中则退出码 0，否则 1）
const FILE = process.env.DEMO_FILE
  || 'file://' + path.resolve('join-wizard-demo.html');
const OUT = process.env.SHOT_DIR || 'debug-screenshots';
const EXPECT_RED = String(process.env.EXPECT_RED || '').split(',').map((s) => s.trim()).filter(Boolean);
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  // --allow-file-access-from-files：让 canvas 能读回 file:// 截图做像素比对（玻璃材质是否真的在渲染）
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*', '--allow-file-access-from-files'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });

await page.goto(FILE, { waitUntil: 'load', timeout: 60000 });
await page.waitForSelector('#form', { timeout: 15000 });
await page.waitForTimeout(300);

const backToStep1 = async () => {
  await page.click('#btnReset');
  await page.waitForTimeout(500);
};

// 1. 结构渲染
const struct = await page.evaluate(() => ({
  pages: document.querySelectorAll('.page').length,
  dots: document.querySelectorAll('[data-dot]').length,
  links: document.querySelectorAll('[data-link]').length,
  years: document.querySelectorAll('#jwYear option').length,
  months: document.querySelectorAll('#jwMonth option').length,
  days: document.querySelectorAll('#jwDay option').length,
  chips: document.querySelectorAll('.chip').length,
  labels: [...document.querySelectorAll('.fld-label')].map((l) => l.textContent.trim()),
  autocompletes: [...document.querySelectorAll('.page input:not([type=file]):not([type=checkbox]),.page select')].map((i) => i.getAttribute('autocomplete')),
  nextText: document.querySelector('#btnNext').textContent.trim(),
  placeholderIsLabel: document.querySelectorAll('.page label[for]').length,
  pkSwitchChecked: document.querySelector('#passkeySwitch').checked,
  pkSwitchRole: document.querySelector('#passkeySwitch').getAttribute('role'),
}));
check('3 个步骤页', struct.pages === 3, String(struct.pages));
check('进度 3 点 2 连线', struct.dots === 3 && struct.links === 2, `${struct.dots}/${struct.links}`);
check('年份选项 102 条（101 年 + 占位）', struct.years === 102, String(struct.years));
check('月份选项 13 条', struct.months === 13, String(struct.months));
check('日期选项 32 条（默认 31 天）', struct.days === 32, String(struct.days));
check('6 个字段都有常驻 label', struct.labels.length === 6, struct.labels.join(' | '));
check('输入型字段用 label[for] 关联（开关用包裹式 label + role=switch）', struct.placeholderIsLabel === 5, String(struct.placeholderIsLabel));
check('每个输入都有 autocomplete', struct.autocompletes.every((a) => a && a.length > 0), JSON.stringify(struct.autocompletes));
check('第 1 步渲染 9 枚修复标注', struct.chips === 9, String(struct.chips));

// 标注必须真的看得见（不是塞进 input 这种 void 元素里被吞掉）
// 标注必须真的看得见 —— elementFromPoint 是唯一客观判据
// （塞进 input 这种 void 元素、或被 .viewport{overflow:hidden} 裁掉都会在这里暴露）
const hit = await page.evaluate(() => {
  const bad = [];
  document.querySelectorAll('.chip').forEach((c) => {
    const b = c.getBoundingClientRect();
    const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    if (at !== c) bad.push(c.textContent + '→' + (at ? (at.className || at.tagName).toString().slice(0, 24) : 'none'));
  });
  return bad;
});
check('标注都在最上层可点（elementFromPoint 命中自身）', hit.length === 0, hit.join(' , '));

const chipPlacement = await page.evaluate(() => {
  const jw = document.querySelector('#jw').getBoundingClientRect();
  const bad = [];
  document.querySelectorAll('.chip').forEach((c) => {
    const r = c.getBoundingClientRect();
    if (c.offsetWidth === 0) { bad.push('zero-size'); return; }
    if (r.left < jw.left - 2 || r.right > jw.right + 2 || r.top < jw.top - 2 || r.bottom > jw.bottom + 2) {
      bad.push(JSON.stringify({ l: Math.round(r.left), t: Math.round(r.top) }));
    }
  });
  return bad;
});
check('标注都在容器可见区内', chipPlacement.length === 0, chipPlacement.join(' , '));

// 2. 步骤推进 + 侧栏文案跟随
await backToStep1();
const t1 = await page.textContent('#asideTitle');
await page.fill('#jwAccount', 'boh_newbie');
await page.fill('#jwEmail', 'newbie@example.com');
await page.waitForTimeout(600);
await page.click('#btnNext');
await page.waitForTimeout(600);
const t2 = await page.textContent('#asideTitle');
check('第 1 步 → 第 2 步', (await page.getAttribute('.page[data-page="2"]', 'class')).includes('active'));
check('侧栏文案随步骤变化', t1 !== t2 && t1.indexOf('BOH ID') >= 0 && t2.indexOf('密码') >= 0, `${t1} → ${t2}`);
check('第 2 步出现「上一步」', !(await page.getAttribute('#btnBack', 'hidden')));
// 回归守卫：进度点曾经因为状态类叫 done、与成功页容器 .done{display:flex} 撞名而被撑成 80x112
const dotSizes = await page.evaluate(() => {
  const bad = [];
  document.querySelectorAll('.p-dot').forEach((d) => {
    const b = d.getBoundingClientRect();
    if (Math.round(b.width) > 16 || Math.round(b.height) > 16) {
      bad.push(`dot.${d.className}=${Math.round(b.width)}x${Math.round(b.height)}`);
    }
  });
  document.querySelectorAll('.p-link').forEach((l) => {
    const b = l.getBoundingClientRect();
    if (Math.round(b.width) !== 26 || Math.round(b.height) > 6) {
      bad.push(`link=${Math.round(b.width)}x${Math.round(b.height)}`);
    }
  });
  return bad;
});
check('进度点/连线尺寸未被其它 class 污染', dotSizes.length === 0, dotSizes.join(' , '));
// 标注随步骤重绘：第 2 步应出现挂在密码字段上的标注，且不再有第 1 步专属的
const step2Notes = await page.evaluate(() => ({
  total: document.querySelectorAll('.chip').length,
  sels: [...document.querySelectorAll('.chip')].map((c) => c.getAttribute('data-sel')),
}));
check('第 2 步标注重绘到密码字段',
  step2Notes.sels.includes('.fld[data-field="password"] .ctrl')
  && !step2Notes.sels.some((s) => s && s.includes('data-field="account"')),
  JSON.stringify(step2Notes.sels));

// 3. 非活动页 inert（不可操作）
const inert = await page.evaluate(() => ({
  p1: document.querySelector('.page[data-page="1"]').inert,
  p2: document.querySelector('.page[data-page="2"]').inert,
  p3: document.querySelector('.page[data-page="3"]').inert,
}));
check('非活动页 inert 且活动页不 inert', inert.p1 === true && inert.p2 === false && inert.p3 === true, JSON.stringify(inert));

// 4. 密码强度
await page.fill('#jwPassword', 'abc');
await page.waitForTimeout(200);
const lv1 = await page.getAttribute('[data-meter]', 'data-lv');
await page.fill('#jwPassword', 'Abcdef12!');
await page.waitForTimeout(200);
const lv3 = await page.getAttribute('[data-meter]', 'data-lv');
const hitRules = await page.evaluate(() => document.querySelectorAll('#rulesPassword li.hit').length);
check('弱密码 lv=1', lv1 === '1', lv1);
check('强密码 lv=3', lv3 === '3', lv3);
check('强密码 4 条要求全打勾', hitRules === 4, String(hitRules));

// 5. 密码短于 8 位被拒（原来只要求 6 位）
await page.fill('#jwPassword', 'abc123');
await page.waitForTimeout(150);
await page.click('#btnNext');
await page.waitForTimeout(400);
const shortMsg = await page.textContent('#msgPassword');
const alertsOn = await page.evaluate(() => document.querySelector('#alerts').classList.contains('on'));
check('6 位密码被拒并给出字段级提示', shortMsg.indexOf('8 位') >= 0, shortMsg.replace(/\s+/g, ' ').slice(0, 50));
check('错误摘要同步出现', alertsOn === true);

// 6. 生日日期随年月动态
await page.fill('#jwPassword', 'Abcdef12!');
await page.waitForTimeout(150);
await page.click('#btnNext');
await page.waitForTimeout(600);
check('推进到第 3 步', (await page.getAttribute('.page[data-page="3"]', 'class')).includes('active'));
await page.selectOption('#jwYear', '2023');
await page.selectOption('#jwMonth', '2');
await page.waitForTimeout(250);
const feb2023 = await page.$$eval('#jwDay option', (o) => o.length - 1);
await page.selectOption('#jwYear', '2024');
await page.waitForTimeout(250);
const feb2024 = await page.$$eval('#jwDay option', (o) => o.length - 1);
check('birth_feb_days 2023 年 2 月 = 28 天', feb2023 === 28, String(feb2023));
check('2024 年 2 月 = 29 天（闰年）', feb2024 === 29, String(feb2024));

// 7. 协议门槛：主按钮不做 disabled 挡人，点了才告诉差什么
await page.waitForTimeout(200);
const disabled = await page.getAttribute('#btnNext', 'disabled');
check('主按钮不用 disabled 挡人', disabled === null, String(disabled));
await page.click('#btnNext');
await page.waitForTimeout(500);
const gate = await page.evaluate(() => ({
  doneHidden: document.querySelector('#done').hidden,
  termsInvalid: document.querySelector('#terms').classList.contains('invalid'),
  note: document.querySelector('#termsNote').textContent.trim(),
  alerts: document.querySelector('#alertsList').textContent.trim(),
  focusIsAgree: document.activeElement === document.querySelector('#agreeBox'),
}));
check('未勾选协议被拦下并指出原因',
  gate.doneHidden === true && gate.termsInvalid === true
  && gate.note.indexOf('勾选协议') >= 0 && gate.alerts.indexOf('协议') >= 0,
  JSON.stringify(gate).slice(0, 140));
check('焦点落到协议勾选框', gate.focusIsAgree === true);

// 8. 勾选后提交 → 成功页（直登分支）
await page.check('#agreeBox');
await page.waitForTimeout(200);
await page.click('#btnNext');
await page.waitForTimeout(700);
const direct = await page.evaluate(() => ({
  doneVisible: !document.querySelector('#done').hidden,
  title: document.querySelector('#doneTitle').textContent.trim(),
  body: document.querySelector('#doneBody').textContent.trim(),
  resendHidden: document.querySelector('#doneResend').hidden,
  termsHidden: getComputedStyle(document.querySelector('#terms')).display === 'none',
}));
check('成功页出现', direct.doneVisible === true);
check('直登分支文案正确', direct.title === '注册成功' && direct.resendHidden === true, direct.title);
check('成功页带出注册的 ID', direct.body.indexOf('boh_newbie') >= 0, direct.body.slice(0, 40));
check('成功页隐藏协议条', direct.termsHidden === true);

// 9. 邮箱确认分支差异
await page.click('#segMail [data-mail="confirm"]');
await page.waitForTimeout(400);
const confirmBranch = await page.evaluate(() => ({
  title: document.querySelector('#doneTitle').textContent.trim(),
  body: document.querySelector('#doneBody').textContent.trim(),
  resendHidden: document.querySelector('#doneResend').hidden,
}));
check('邮箱确认分支文案不同', confirmBranch.title !== direct.title && confirmBranch.resendHidden === false,
  `${direct.title} → ${confirmBranch.title}`);
check('邮箱确认分支带出邮箱', confirmBranch.body.indexOf('newbie@example.com') >= 0, confirmBranch.body.slice(0, 44));

// 10. ID 实时查重：占用 → 候选；可用 → 通过
await page.click('#segJump [data-jump="1"]');
await page.waitForTimeout(500);
await page.fill('#jwAccount', 'ryyik');
await page.waitForTimeout(900);
const taken = await page.evaluate(() => ({
  state: document.querySelector('.fld[data-field="account"] [data-state]').className,
  stateText: document.querySelector('.fld[data-field="account"] [data-state]').textContent.trim(),
  suggestOn: document.querySelector('.fld[data-field="account"] [data-suggest]').classList.contains('on'),
  cands: [...document.querySelectorAll('.fld[data-field="account"] [data-suggest] button')].map((b) => b.textContent),
}));
check('id_taken_suggest 占用后给候选', taken.suggestOn === true && taken.cands.length === 3,
  `${taken.stateText} / ${taken.cands.join(', ')}`);
check('占用态标红', taken.state.indexOf('err') >= 0, taken.state);
await page.fill('#jwAccount', 'boh_newbie_2');
await page.waitForTimeout(900);
const free = await page.evaluate(() => ({
  state: document.querySelector('.fld[data-field="account"] [data-state]').className,
  text: document.querySelector('.fld[data-field="account"] [data-state]').textContent.trim(),
  suggestOn: document.querySelector('.fld[data-field="account"] [data-suggest]').classList.contains('on'),
}));
check('可用 ID 标绿且无候选', free.state.indexOf('ok') >= 0 && free.suggestOn === false, free.text);

// 11. 注入错误态 → 摘要条目
await backToStep1();
await page.click('#btnInject');
await page.waitForTimeout(900);
const injected = await page.evaluate(() => ({
  on: document.querySelector('#alerts').classList.contains('on'),
  items: document.querySelectorAll('#alertsList li').length,
  texts: [...document.querySelectorAll('#alertsList li')].map((l) => l.textContent.trim()),
}));
check('注入错误态生成多条摘要', injected.on === true && injected.items >= 3, String(injected.items));
check('摘要覆盖 3 个字段（ID/邮箱/密码）',
  injected.texts.join('|').indexOf('方块 ID') >= 0
  && injected.texts.join('|').indexOf('电子邮件') >= 0
  && injected.texts.join('|').indexOf('密码') >= 0,
  injected.texts.join(' ; ').slice(0, 90));

// 11.5 通行密钥：注册时可选 + 成功页执行仪式
const pkState = () => page.evaluate(() => {
  const f = document.querySelector('#passkeyField');
  const sw = document.querySelector('#passkeySwitch');
  return {
    step3RowHidden: f ? !!f.hidden : null,
    hasSwitch: !!sw,
    role: sw ? sw.getAttribute('role') : null,
    describedBy: sw ? sw.getAttribute('aria-describedby') : null,
    checked: sw ? sw.checked : null,
    hasDisabledAttr: sw ? sw.hasAttribute('disabled') : null,
    cardHidden: !!document.querySelector('#pkCard').hidden,
    deferredHidden: !!document.querySelector('#pkDeferred').hidden,
    addDisabled: document.querySelector('#pkAdd').disabled,
    addText: document.querySelector('#pkAdd').textContent.trim(),
    actionsHidden: !!document.querySelector('#pkActions').hidden,
    doneHidden: !!document.querySelector('#pkDone').hidden,
    stateText: document.querySelector('#pkState').textContent.trim(),
  };
});
const gotoStep3 = async () => {
  await page.click('#segMail [data-mail="direct"]');
  await page.click('#segPk [data-pk="ok"]');
  await page.waitForTimeout(250);
  await backToStep1();
  await page.click('#segJump [data-jump="3"]');
  await page.waitForTimeout(600);
};
const fillValidForm = async () => {
  await backToStep1();
  await page.fill('#jwAccount', 'boh_passkey');
  await page.fill('#jwEmail', 'pk@example.com');
  await page.waitForTimeout(700);
  await page.click('#btnNext');
  await page.waitForTimeout(600);
  await page.fill('#jwPassword', 'Abcdef12!');
  await page.waitForTimeout(200);
  await page.click('#btnNext');
  await page.waitForTimeout(700);
};

await gotoStep3();
const pk0 = await pkState();
check('第 3 步有通行密钥开关', pk0.hasSwitch === true && pk0.step3RowHidden === false, JSON.stringify(pk0));
check('重置后开关回到未勾选', pk0.checked === false, String(pk0.checked));
check('通行密钥开关默认关闭（首屏、未做任何交互）', struct.pkSwitchChecked === false, String(struct.pkSwitchChecked));
check('通行密钥开关是 role=switch', struct.pkSwitchRole === 'switch', String(struct.pkSwitchRole));
check('开关 aria-describedby 关联说明',
  pk0.role === 'switch' && pk0.describedBy === 'passkeyHint', `${pk0.role} / ${pk0.describedBy}`);

await page.click('#segPk [data-pk="unsupported"]');
await page.waitForTimeout(350);
const pkUnsupported = await pkState();
check('本机不支持时整行隐藏（而不是置灰）',
  pkUnsupported.step3RowHidden === true, JSON.stringify(pkUnsupported));
await page.click('#segPk [data-pk="ok"]');
await page.waitForTimeout(350);

await page.click('#segMail [data-mail="confirm"]');
await page.waitForTimeout(350);
const pkNoSession = await pkState();
check('邮箱确认模式（注册后无会话）不给开关，避免点了必然失败',
  pkNoSession.step3RowHidden === true, JSON.stringify(pkNoSession));
await page.click('#segMail [data-mail="direct"]');
await page.waitForTimeout(350);

// 不勾选 → 成功页不该出现卡片（尊重用户的选择，不做二次打扰）
await fillValidForm();
await page.check('#agreeBox');
await page.waitForTimeout(200);
await page.click('#btnNext');
await page.waitForTimeout(800);
const pkSkippedByChoice = await pkState();
check('没勾选就不打扰：成功页不出现通行密钥卡片',
  pkSkippedByChoice.cardHidden === true && pkSkippedByChoice.deferredHidden === true,
  JSON.stringify(pkSkippedByChoice));

// 勾选 → 成功页出现卡片 → 跑仪式 → ok
await fillValidForm();
await page.check('#passkeySwitch');
await page.waitForTimeout(200);
const pkOn = await pkState();
check('勾选后开关状态被记住', pkOn.checked === true, String(pkOn.checked));
await page.check('#agreeBox');
await page.waitForTimeout(200);
await page.click('#btnNext');
await page.waitForTimeout(900);
const pkCardShown = await pkState();
check('直登模式 + 本机可用 + 已勾选 → 成功页出现添加卡片',
  pkCardShown.cardHidden === false && pkCardShown.deferredHidden === true, JSON.stringify(pkCardShown));

await page.click('#pkAdd');
await page.waitForTimeout(300);
const pkRunning = await pkState();
check('点击后有等待设备验证的运行态（按钮禁用）',
  pkRunning.addDisabled === true && pkRunning.addText.indexOf('请在设备上完成验证') >= 0 && pkRunning.actionsHidden === false,
  `${pkRunning.addText} / disabled=${pkRunning.addDisabled}`);
await page.waitForTimeout(1500);
const pkOk = await pkState();
check('验证成功后收起按钮、显示已添加',
  pkOk.doneHidden === false && pkOk.actionsHidden === true, JSON.stringify(pkOk));
await page.screenshot({ path: `${OUT}/jw-passkey-added.png`, fullPage: false });

// 不变式：任何带 hidden 的元素，computed display 必须是 none。
// 这条抓的是「class 里的 display 压过 [hidden]」这类 bug —— 可能是层叠顺序，也可能是**特异性**
// （实测踩过：.done-actions .btn{display:block} 是 (0,2,0)，压过了 [hidden]{display:none} 的 (0,1,0)，
//  结果直登模式下「重新发送验证邮件」照样显示）。带 hidden 却看得见，肉眼很容易漏。
const hiddenViolations = await page.evaluate(() => {
  const bad = [];
  document.querySelectorAll('[hidden]').forEach((el) => {
    const d = getComputedStyle(el).display;
    if (d !== 'none') bad.push((el.id || el.className || el.tagName).toString().trim().slice(0, 34) + ' → ' + d);
  });
  return bad;
});
check('带 hidden 的元素真的被隐藏（无更高特异性 display 压过）',
  hiddenViolations.length === 0, hiddenViolations.join(' , '));

// 验证失败分支：可重试、可跳过
await page.click('#segPk [data-pk="fail"]');
await page.waitForTimeout(400);
await fillValidForm();
await page.check('#passkeySwitch');
await page.check('#agreeBox');
await page.waitForTimeout(200);
await page.click('#btnNext');
await page.waitForTimeout(900);
await page.click('#pkAdd');
await page.waitForTimeout(1700);
const pkFail = await pkState();
check('验证失败给出可读原因且可重试', pkFail.addText === '重试' && pkFail.addDisabled === false
  && pkFail.stateText.indexOf('已取消注册') >= 0, `${pkFail.addText} / ${pkFail.stateText.slice(0, 24)}`);
await page.click('#pkSkip');
await page.waitForTimeout(300);
const pkSkipped = await pkState();
check('「以后再说」静默收起卡片，不影响其它成功页动作',
  pkSkipped.cardHidden === true && !(await page.getAttribute('#doneGo', 'hidden') === ''),
  JSON.stringify(pkSkipped));

// 邮箱确认模式：给延后提示而不是死按钮
await page.click('#segPk [data-pk="ok"]');
await page.click('#segMail [data-mail="confirm"]');
await page.waitForTimeout(400);
const pkDeferred = await pkState();
check('邮箱确认模式改为延后提示（不给必然失败的按钮）',
  pkDeferred.deferredHidden === false && pkDeferred.cardHidden === true, JSON.stringify(pkDeferred));
await page.screenshot({ path: `${OUT}/jw-passkey-deferred.png`, fullPage: false });
await page.click('#segMail [data-mail="direct"]');
await page.waitForTimeout(300);
await backToStep1();

// 12. 主题切换 + 文字对比度（含 alpha 合成，::placeholder 单独取色）
const contrastPairs = () => page.evaluate(() => {
  const parse = (c) => { const m = String(c).match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const blend = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const chan = (v) => { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
  const surfaceOf = (el) => {
    const chain = []; let e = el;
    while (e) { chain.push(parse(getComputedStyle(e).backgroundColor)); e = e.parentElement; }
    chain.push({ r: 255, g: 255, b: 255, a: 1 });
    let acc = chain[chain.length - 1];
    for (let i = chain.length - 2; i >= 0; i--) acc = blend(chain[i], acc);
    return acc;
  };
  const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg); const hi = Math.max(a, b), lo = Math.min(a, b); return (hi + 0.05) / (lo + 0.05); };
  const pairs = [
    ['摘要标题', '.alerts p', false], ['摘要条目', '.alerts button', false],
    ['字段错误', '.fld[data-field="account"] .msg', false],
    ['字段提示', '.fld[data-field="account"] .hint', false],
    ['必填角标', '.tag-req', false], ['选填角标', '.tag-opt', false],
    ['输入文字', '#jwAccount', false], ['placeholder', '#jwAccount', true],
    ['字段标签', '.fld-label', false], ['步骤文本', '.progress-text', false],
    ['品牌标语', '.aside-hero p', false], ['隐私行', '.aside-privacy', false],
    ['协议文本', '.terms .t-text', false], ['协议小注', '.terms .t-note', false],
  ];
  return pairs.map(([name, sel, ph]) => {
    const el = document.querySelector(sel);
    if (!el) return { name, ratio: null };
    const cs = ph ? getComputedStyle(el, '::placeholder') : getComputedStyle(el);
    return { name, ratio: ratio(parse(cs.color), surfaceOf(el)) };
  });
});
const lowContrast = (list) => list.filter((p) => p.ratio !== null && p.ratio < 4.5)
  .map((p) => `${p.name}=${p.ratio.toFixed(2)}`);

await backToStep1();
await page.click('#btnInject');
await page.waitForTimeout(900);
const lightContrast = await contrastPairs();
check('浅色：所有正文 ≥ 4.5:1', lowContrast(lightContrast).length === 0, lowContrast(lightContrast).join(' , '));

await page.click('#segTheme [data-theme-set="dark"]');
await page.waitForTimeout(400);
const dark = await page.evaluate(() => {
  const cs = getComputedStyle(document.body);
  const inp = getComputedStyle(document.querySelector('#jwAccount'));
  return { bg: cs.backgroundColor, fg: cs.color, inpBg: inp.backgroundColor, inpFg: inp.color };
});
const lum = (rgb) => {
  const m = rgb.match(/\d+/g).map(Number);
  return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
};
check('暗色：页面背景变暗', lum(dark.bg) < 0.12, dark.bg);
check('暗色：文字变亮且输入框可见', lum(dark.fg) > 0.85 && lum(dark.inpBg) > 0.08 && lum(dark.inpBg) < 0.25,
  `${dark.fg} / ${dark.inpBg}`);
const darkContrast = await contrastPairs();
check('暗色：所有正文 ≥ 4.5:1', lowContrast(darkContrast).length === 0, lowContrast(darkContrast).join(' , '));
await page.screenshot({ path: `${OUT}/jw-dark-desktop.png`, fullPage: false });
await page.click('#segTheme [data-theme-set="light"]');
await page.waitForTimeout(350);

// 12.5 液态玻璃材质（对齐 src/styles/common/tokens.css 的 --liquid-* 与「一层活跃模糊」约束）
const mat = () => page.evaluate(() => {
  const alpha = (c) => { const m = String(c).match(/[\d.]+/g).map(Number); return m.length > 3 ? m[3] : 1; };
  const jw = document.querySelector('#jw');
  const cs = getComputedStyle(jw);
  const blurs = [];
  jw.querySelectorAll('*').forEach((el) => {
    const bf = getComputedStyle(el).backdropFilter;
    if (bf && bf !== 'none') blurs.push((el.className || el.tagName).toString().slice(0, 26) + ' → ' + bf);
  });
  return {
    cardFilter: cs.backdropFilter,
    cardBg: cs.backgroundColor,
    cardAlpha: alpha(cs.backgroundColor),
    cardRadius: cs.borderRadius,
    cardShadow: cs.boxShadow.slice(0, 90),
    innerBlurCount: blurs.length,
    innerBlurs: blurs,
    bodyImages: getComputedStyle(document.body).backgroundImage.split('url(').length - 1,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    panelBg: getComputedStyle(document.querySelector('.aside-panel')).backgroundColor,
    inputBg: getComputedStyle(document.querySelector('#jwAccount')).backgroundColor,
    tokens: ['--liquid-bg-strong', '--liquid-blur-lg', '--liquid-filter-lg', '--liquid-radius-lg']
      .map((t) => t + '=' + getComputedStyle(document.documentElement).getPropertyValue(t).trim()).join(' | '),
  };
});
const glass = await mat();
check('外卡是液态玻璃（backdrop-filter 解析出 blur）', /blur\(36px\)/.test(glass.cardFilter), glass.cardFilter);
check('外卡底色来自半透明材质 token', glass.cardAlpha > 0.6 && glass.cardAlpha < 1,
  `${glass.cardBg} α=${glass.cardAlpha}`);
check('外卡圆角走 --liquid-radius-lg（28px）', glass.cardRadius === '28px', glass.cardRadius);
check('外卡有 inset 高光（玻璃边缘）', glass.cardShadow.indexOf('inset') >= 0, glass.cardShadow);
check('页面底有可模糊的图（玻璃才看得见）', glass.bodyImages >= 1, `背景图层数 ${glass.bodyImages}`);
check('one-active-blur-layer：子树内活跃模糊层为 0', glass.innerBlurCount === 0, glass.innerBlurs.join(' , '));
check('嵌套面用材质填充而非纯色', /rgba?\(/.test(glass.panelBg) && /rgba?\(/.test(glass.inputBg),
  `panel=${glass.panelBg} input=${glass.inputBg}`);
console.log('   tokens: ' + glass.tokens);

// 材质两态：液态 vs 降级实色。两张截图必须来自**同一次会话的内存截图** ——
// 早先从 SHOT_DIR 读文件比对，而 SHOT_DIR 在反证轮次间是共享的 → 结果依赖用例执行顺序，
// 反证会时红时绿（实测踩过）。
const grabShot = async () => (await page.screenshot()).toString('base64');
const shotLiquid = await grabShot();

await page.click('#segMat [data-mat="flat"]');
await page.waitForTimeout(450);
const flat = await mat();
check('降级实色：外卡模糊关闭', flat.cardFilter === 'none', flat.cardFilter);
check('降级实色：外卡底色变不透明', flat.cardAlpha >= 0.95, `${flat.cardBg} α=${flat.cardAlpha}`);
const shotFlat = await grabShot();
await page.screenshot({ path: `${OUT}/jw-flat-desktop.png`, fullPage: false });

await page.click('#segMat [data-mat="liquid"]');
await page.waitForTimeout(450);
const back = await mat();
check('切回液态玻璃可复原', /blur\(36px\)/.test(back.cardFilter) && back.cardAlpha < 1, back.cardFilter);

// 像素级取证：材质必须真的改变渲染结果，而不只是 CSS 里写了一行 backdrop-filter。
// computed style 只能证明属性被设置 —— 属性写在被遮住的层上、或底色不透明时模糊根本看不见。
const diff = await page.evaluate(async (pair) => {
  const load = (b64) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('decode failed'));
    img.src = 'data:image/png;base64,' + b64;
  });
  let a, b;
  try { [a, b] = await Promise.all([load(pair[0]), load(pair[1])]); } catch (e) { return { error: String(e.message) }; }
  if (!a.width || a.width !== b.width || a.height !== b.height) return { error: '尺寸不一致' };
  // 取卡片内部「有图像结构、无文字」的一块（左栏面板上方的空白区）
  const box = { x: 160, y: 112, w: 240, h: 190 };
  const grab = (img) => {
    const c = document.createElement('canvas');
    c.width = box.w; c.height = box.h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    return g.getImageData(0, 0, box.w, box.h).data;
  };
  let da, db;
  try { da = grab(a); db = grab(b); } catch (e) { return { error: 'readback: ' + e.message }; }
  let sum = 0, max = 0, n = 0;
  for (let i = 0; i < da.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const d = Math.abs(da[i + k] - db[i + k]);
      sum += d; n++; if (d > max) max = d;
    }
  }
  return { mean: sum / n, max };
}, [shotLiquid, shotFlat]);
if (diff.error) {
  check('材质真的改变了渲染像素（液态 vs 降级）', false, diff.error);
} else {
  check('材质真的改变了渲染像素（液态 vs 降级）', diff.mean >= 3 && diff.max >= 12,
    `平均差 ${diff.mean.toFixed(2)} / 最大差 ${diff.max}`);
}

// 13. 视口切换 → 容器查询生效（单列）
const deskCols = await page.evaluate(() => getComputedStyle(document.querySelector('#jw')).gridTemplateColumns);
await page.click('#segVp [data-vp="mobile"]');
await page.waitForTimeout(600);
const mob = await page.evaluate(() => {
  const jw = document.querySelector('#jw');
  return {
    cols: getComputedStyle(jw).gridTemplateColumns,
    w: Math.round(jw.getBoundingClientRect().width),
    asideStats: getComputedStyle(document.querySelector('.aside-stats')).display,
  };
});
check('移动视口收窄到 390', mob.w === 390, String(mob.w));
check('移动视口变单列（容器查询生效）', mob.cols.split(' ').length === 1, `桌面 ${deskCols} → 移动 ${mob.cols}`);
check('移动视口隐藏装饰数据条', mob.asideStats === 'none', mob.asideStats);
await backToStep1();
await page.screenshot({ path: `${OUT}/jw-mobile-step1.png`, fullPage: true });
await page.click('#segVp [data-vp="desktop"]');
await page.waitForTimeout(600);

// 14. 三张正式截图（桌面 3 步 + 成功页）
await backToStep1();
await page.screenshot({ path: `${OUT}/jw-step1.png` });
await page.fill('#jwAccount', 'boh_newbie');
await page.fill('#jwEmail', 'newbie@example.com');
await page.waitForTimeout(700);
await page.click('#btnNext');
await page.waitForTimeout(600);
await page.fill('#jwPassword', 'Abcdef12!');
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/jw-step2.png` });
await page.click('#btnNext');
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/jw-step3.png` });

// 15. 无运行时错误
check('无 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();

const failed = results.filter((r) => !r.pass);
const failedNames = failed.map((r) => r.name);
const redNames = new Set(failedNames.map((r) => r.split(' ')[0]));
console.log(`\n${results.length - failed.length}/${results.length} PASS`);

if (EXPECT_RED.length) {
  // 用子串匹配，不要按空格切词 —— 断言名里有「/」和「：」时切词会误判为未变红
  const missing = EXPECT_RED.filter((n) => !failedNames.some((name) => name.includes(n)));
  console.log(`\n反证目标 ${EXPECT_RED.join(', ')} → ${missing.length ? '未变红（断言是摆设）' : '全部变红 ✓'}`);
  if (missing.length) { console.log('未变红：' + missing.join(', ')); process.exit(1); }
  process.exit(0);
}
process.exit(failed.length ? 1 : 0);
