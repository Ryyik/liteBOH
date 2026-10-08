/**
 * probe-bohai-slash-commands.mjs — 斜杠命令**执行语义**探针
 *
 * 背景（2026-10-08 用户报障，已复现）：
 *   用户输入 `/cloud` 后，AI 回复「你发送了 /cloud 指令」—— 说明命令被当成**普通文本**发给了模型。
 *   代码勘察（`grep -rn "runSlashCommand" src/`）显示执行逻辑只有 2 个调用点：
 *     ① `BOHAIMain.vue:171`  菜单项 mousedown
 *     ② `BOHAIMain.vue:1764` keydown 拦截器里的 Enter（仅菜单开着时）
 *   而发送按钮走的是完全独立的另一条线（`BohComposer.vue:325 emit('send')` → `BOHAIMain.vue:164`
 *   → `useChatEngine.js:1128 sendMessage`），**零斜杠分支** ⇒ 点发送键必然把字面量发给模型。
 *
 * ⚠️ **本探针是「判据」不是「回归」**：在当前代码上**预期红**（见 §预期状态）。
 *   修复（`docs/2026-10-08-BOHAI对齐Codex优化方案与斜杠命令修复.md` §3）之后应转全绿。
 *   为什么现在就落成探针：判据必须能随仓库重跑 —— 只放在 gitignored 的 `output/` 里等于跑不了。
 *
 * ⚠️ 原 `probe-bohai-composer.mjs` 的 A8 **只断言菜单里的文案存在**、从未点过任何命令项
 *   （`grep -c "boh-slash-item" scripts/probes/probe-bohai-composer.mjs` → 0），
 *   也从未验证命令是否真的执行 —— 这正是「22 条断言全绿、功能却不可用」的原因。
 *   本探针补的就是这一层：**只断言「命令被执行」与「字面量没进模型」**。
 *
 * 三个场景：
 *   A 桌面 1440×900 —— 发送键 / 带参数 / 未知命令
 *   B 竖屏 390×844 + hasTouch —— 移动端（Enter 语义被接管，只剩发送键一条路）
 *   C 桌面 Work 形态 —— 空态建议卡（UI 主动填入 `/cloud …`，教出的用法本身就走漏）
 *
 * 用法（dev server 需在 5173；脚本自带登录注入，不需要真账号）：
 *   node scripts/probes/probe-bohai-slash-commands.mjs
 *   BASE=http://[::1]:5173 node scripts/probes/probe-bohai-slash-commands.mjs
 *
 * 反证（修复后必须做，否则不算自证）：
 *   · 把 `handleSend` 里的斜杠分支删掉 → A1 / A3 / A4 / B1 必红；
 *   · 把「剥掉命令字」改成原样透传 → A3 必红；
 *   · 把 `unknown` 分支改成放行 → A4 必红。
 *
 * 环境事实（本仓踩过的坑，照抄）：
 *   · Playwright 必须 `channel: 'chrome'` + 三个 proxy 参数（否则连不上 dev server）；
 *   · dev server 只监听 IPv6（`http://[::1]:5173`），`localhost` 在某些环境解析到 IPv4 会失败；
 *   · 一个 browser + 每场景新 context；mock 必须回 `Content-Range`（本探针不查列表，无需）；
 *   · 伪造登录注入 pinia，**不要**种 `sb-*-auth-token`。
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://[::1]:5173';
const PROBE_UID = '00ac36b4-6594-440f-a9c1-38b7bd47ee8b';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail: String(detail || '').slice(0, 240) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const SEL = {
  input: '.boh-composer-input',
  send: '.boh-send',
  slash: '.boh-slash',
  slashItem: '.boh-slash-item',
  userBubble: '.boh-msg.is-user .boh-bubble',
  webToggle: '.boh-cp-icon',
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

/**
 * 本探针**不调用真实模型**：拦截 `api-key-vault`，把凡是带 `payload.messages` 的请求
 * 记进 `chatReqs`（这就是「哪些内容真的进了模型」的唯一可信来源 —— 读气泡只能证明
 * 消息落了 UI，读请求体才能证明它到了模型），然后一律回失败。
 */
const installModelSpy = async (page, chatReqs) => {
  await page.route('**/functions/v1/api-key-vault**', async (route) => {
    let body = {};
    try {
      body = route.request().postDataJSON() || {};
    } catch {
      body = {};
    }
    if (body?.payload?.messages) chatReqs.push(body);

    if (body?.action === 'quota-status') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: { usedTokens: 1000, tokenLimit: 100000, webSearchUsed: 0, webSearchLimit: 10 },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, message: '探针环境不调用真实模型' }),
    });
  });
};

const injectAuth = async (page) => {
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(600);
  await page.evaluate((uid) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const auth = pinia.state.value.auth;
    auth.isLoggedIn = true;
    if (auth.userInfo) Object.assign(auth.userInfo, { username: 'probe_user', id: uid });
  }, PROBE_UID);
  await page.waitForTimeout(600);
};

/** 只有「带 payload.messages 的请求」才算模型调用（quota-status 等不算） */
const chatCount = (chatReqs) => chatReqs.filter((r) => r?.payload?.messages).length;

/** 取「送进模型的最后一条 user 消息」的 <task> 段（BOH 的 prompt 装配格式） */
const lastTaskSegment = (chatReqs) => {
  const hit = chatReqs.find((r) => r?.payload?.messages);
  if (!hit) return null;
  const lastUser = [...hit.payload.messages].reverse().find((m) => m.role === 'user');
  const content = String(lastUser?.content || '');
  const m = content.match(/<task>([\s\S]*?)<\/task>/);
  return (m ? m[1] : content).trim();
};

const isSlashMenuOpen = (page) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return !!el && getComputedStyle(el).display !== 'none';
  }, SEL.slash);

const bubbleTexts = (page) =>
  page.evaluate(
    (sel) => [...document.querySelectorAll(sel)].map((n) => n.textContent.trim()),
    SEL.userBubble,
  );

// ===================== 场景 A：桌面 1440×900 =====================
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  const chatReqs = [];
  await installModelSpy(page, chatReqs);

  await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'load' });
  await injectAuth(page);
  await page.waitForSelector(SEL.input, { timeout: 20000 });
  await page.waitForTimeout(700);

  // ── A1 点发送键：`/web` 应**本地执行**（开联网），而不是把 "web" 当消息发出去 ──
  chatReqs.length = 0;
  await page.fill(SEL.input, '/web');
  await page.waitForTimeout(400);
  const menuBeforeSend = await isSlashMenuOpen(page);
  await page.locator(SEL.send).click();
  await page.waitForTimeout(1400);
  const webOn = await page.evaluate(
    (sel) => document.querySelector(sel)?.classList.contains('is-on') || false,
    SEL.webToggle,
  );
  const a1Bubbles = await bubbleTexts(page);
  check(
    'A1 点发送键执行 /web（不把字面量发给模型，且联网真的打开）',
    chatCount(chatReqs) === 0 && webOn && a1Bubbles.length === 0,
    `菜单=${menuBeforeSend} chat请求=${chatCount(chatReqs)} 联网on=${webOn} 气泡=${JSON.stringify(a1Bubbles)}`,
  );

  // ── A2 带参数：`/cloud 素材盘点成表格` ⇒ 应剥掉命令字，只把参数当消息发 ──
  chatReqs.length = 0;
  await page.fill(SEL.input, '');
  await page.waitForTimeout(300);
  await page.fill(SEL.input, '/cloud 素材盘点成表格');
  await page.waitForTimeout(400);
  const a2Menu = await isSlashMenuOpen(page);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1400);
  const a2Task = lastTaskSegment(chatReqs);
  check(
    'A2 带参数 /cloud 剥掉命令字（送进模型的 <task> 不含 "/cloud"）',
    chatCount(chatReqs) > 0 &&
      !!a2Task &&
      !a2Task.includes('/cloud') &&
      a2Task.includes('素材盘点'),
    `菜单=${a2Menu} chat请求=${chatCount(chatReqs)} <task>=${JSON.stringify(a2Task)}`,
  );

  // ── A3 未知命令：不应静默当普通文本发出去（否则未来加命令时必然再漏入口） ──
  chatReqs.length = 0;
  await page.fill(SEL.input, '');
  await page.waitForTimeout(300);
  await page.fill(SEL.input, '/zzz-not-a-command');
  await page.waitForTimeout(400);
  await page.locator(SEL.send).click();
  await page.waitForTimeout(1400);
  const a3Task = lastTaskSegment(chatReqs);
  check(
    'A3 未知命令不静默放行（chat 请求 0）',
    chatCount(chatReqs) === 0,
    `chat请求=${chatCount(chatReqs)} <task>=${JSON.stringify(a3Task)}`,
  );

  // ── A4 护栏不误伤：普通消息里含 "/" 仍要正常发出 ──
  chatReqs.length = 0;
  await page.fill(SEL.input, '');
  await page.waitForTimeout(300);
  await page.fill(SEL.input, '路径是 /user-space?tab=posts 怎么走');
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1400);
  const a4Task = lastTaskSegment(chatReqs);
  check(
    'A4 非命令输入的 "/" 不被误判（含 "/" 的普通消息正常发出）',
    chatCount(chatReqs) > 0 && !!a4Task && a4Task.includes('user-space'),
    `chat请求=${chatCount(chatReqs)} <task>=${JSON.stringify(a4Task)}`,
  );

  await ctx.close();
}

// ===================== 场景 B：竖屏 390×844 + 触屏 =====================
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  const chatReqs = [];
  await installModelSpy(page, chatReqs);

  await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'load' });
  await injectAuth(page);
  await page.waitForSelector(SEL.input, { timeout: 20000 });
  await page.waitForTimeout(700);

  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);

  // ── B1 触屏上没有 Enter 可用（COARSE 下 handleEnter 直接 return）⇒ 发送键是唯一路径，
  //       它必须执行命令，否则移动端 / 命令彻底不可用 ──
  chatReqs.length = 0;
  await page.fill(SEL.input, '/web');
  await page.waitForTimeout(400);
  const b1Menu = await isSlashMenuOpen(page);
  await page.locator(SEL.send).click();
  await page.waitForTimeout(1400);
  const b1WebOn = await page.evaluate(
    (sel) => document.querySelector(sel)?.classList.contains('is-on') || false,
    SEL.webToggle,
  );
  const b1Bubbles = await bubbleTexts(page);
  check(
    'B1 触屏：点发送键执行 /web（移动端唯一可用路径）',
    coarse && chatCount(chatReqs) === 0 && b1WebOn && b1Bubbles.length === 0,
    `coarse=${coarse} 菜单=${b1Menu} chat请求=${chatCount(chatReqs)} 联网on=${b1WebOn} 气泡=${JSON.stringify(b1Bubbles)}`,
  );

  // ── B2 触屏 + 带参数：菜单必关（含空格）⇒ 同样只能靠发送键，必须剥前缀 ──
  chatReqs.length = 0;
  await page.fill(SEL.input, '');
  await page.waitForTimeout(300);
  await page.fill(SEL.input, '/cloud 素材盘点成表格');
  await page.waitForTimeout(400);
  await page.locator(SEL.send).click();
  await page.waitForTimeout(1400);
  const b2Task = lastTaskSegment(chatReqs);
  check(
    'B2 触屏：带参数命令剥掉命令字',
    chatCount(chatReqs) > 0 &&
      !!b2Task &&
      !b2Task.includes('/cloud') &&
      b2Task.includes('素材盘点'),
    `chat请求=${chatCount(chatReqs)} <task>=${JSON.stringify(b2Task)}`,
  );

  await ctx.close();
}

// ===================== 场景 C：Work 形态空态建议卡 =====================
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  const chatReqs = [];
  await installModelSpy(page, chatReqs);

  await page.goto(`${BASE}/#/ai-chat`, { waitUntil: 'load' });
  await injectAuth(page);
  await page.waitForSelector(SEL.input, { timeout: 20000 });
  await page.waitForTimeout(700);

  // 建议卡只出现在 Work 形态（`BohEmptyState` 的 WORK_SUGGESTIONS）⇒ 先切形态。
  // 形态切换器在会话侧栏头部（≥1024 时侧栏默认展开）。
  const switched = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((n) =>
      /^(Chat|Work)$/.test((n.textContent || '').trim()),
    );
    if (!btn) return null;
    const label = btn.textContent.trim();
    btn.click();
    return label;
  });
  await page.waitForTimeout(400);
  if (switched === 'Chat') {
    await page.evaluate(() => {
      const opt = [...document.querySelectorAll('button')].find((n) =>
        /^Work/.test((n.textContent || '').trim()),
      );
      opt?.click();
    });
    await page.waitForTimeout(600);
  }

  // ── C1 空态里带 `/cloud` 前缀的建议卡：「点击 → 填入 → 发出」整条链必须剥掉命令字 ──
  //    这条最容易被忽略：UI 用它**主动暗示**「这是命令」，若走漏则等于产品教用户写出错误用法。
  const cardExists = await page.evaluate(() =>
    [...document.querySelectorAll('.boh-empty__suggestions button')].some((n) =>
      /素材盘点/.test(n.textContent || ''),
    ),
  );
  if (cardExists) {
    await page.evaluate(() => {
      const hit = [...document.querySelectorAll('.boh-empty__suggestions button')].find((n) =>
        /素材盘点/.test(n.textContent || ''),
      );
      hit?.click();
    });
    await page.waitForTimeout(500);
    const filled = await page.evaluate(
      (sel) => document.querySelector(sel)?.value ?? null,
      SEL.input,
    );
    chatReqs.length = 0;
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1400);
    const c1Task = lastTaskSegment(chatReqs);
    check(
      'C1 空态建议卡「/cloud 素材…」剥掉命令字',
      chatCount(chatReqs) > 0 &&
        !!c1Task &&
        !c1Task.includes('/cloud') &&
        c1Task.includes('素材盘点'),
      `填入=${JSON.stringify(filled)} chat请求=${chatCount(chatReqs)} <task>=${JSON.stringify(c1Task)}`,
    );
  } else {
    check(
      'C1 空态建议卡「/cloud 素材…」剥掉命令字',
      false,
      '未找到带 /cloud 的建议卡（形态或文案变了？）',
    );
  }

  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.log('\n失败项（**修复前预期红**，见文件头说明）：');
  for (const f of failed) console.log(`  · ${f.name}\n    ${f.detail}`);
  process.exitCode = 1;
}
