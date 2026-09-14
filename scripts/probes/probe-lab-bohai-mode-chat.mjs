import { chromium } from 'playwright';

// 实测：Lab 选 BOHAI 模型（Air）后发普通聊天 → 抓 vault runtime 请求验证 provider/mode/model 分流
const BASE = 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const vaultCalls = [];
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
page.on('request', (req) => {
  const post = req.postData() || '';
  if (post.includes('runtime-chat-stream')) {
    try {
      const body = JSON.parse(post);
      vaultCalls.push({
        provider: body.provider,
        mode: body.mode,
        model: body.payload?.model,
        apiUrl: body.apiUrl,
        msgCount: (body.payload?.messages || []).length,
      });
    } catch { vaultCalls.push({ parse: 'fail' }); }
  }
});

await page.goto(`${BASE}/#/lab`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
await page.waitForTimeout(3000);

// 展开 → 选 Air
await page.click('#unified-nav-container .lab-quota-island .lq-compact');
await page.waitForFunction(() => document.querySelectorAll('#unified-nav-container .lab-quota-island .lq-model-item').length > 1, null, { timeout: 15000 }).catch(() => {});
const picked = await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll('#unified-nav-container .lab-quota-island .lq-model-item'));
  const target = items.find((el) => el.querySelector('.lq-model-name')?.textContent.trim() === 'Air');
  target?.click();
  return !!target;
});
console.log('picked Air:', picked);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// 发送普通聊天
await page.fill('.composer-input', '用一句话介绍你自己');
await page.click('.composer-send');
await page.waitForTimeout(9000);

console.log('vault calls:', JSON.stringify(vaultCalls, null, 2));
const replyShown = await page.evaluate(() => {
  const msgs = Array.from(document.querySelectorAll('.message-content'));
  return msgs.length > 0 && msgs.some((el) => (el.textContent || '').trim().length > 4);
});
console.log('reply rendered:', replyShown);
console.log('pageerrors:', errors.slice(0, 4));
await page.screenshot({ path: 'debug-screenshots/lab-bohai-mode-chat.png' });
await browser.close();
