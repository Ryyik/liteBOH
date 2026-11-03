// 探针：周边结算页「识别」按钮 —— 剪贴板读取 + 读不到时的粘贴兜底
//
// 覆盖两条真实路径（浏览器权限不同，行为必须都可用）：
//   A) clipboard-read 已授权 → 点「识别」应直接读剪贴板并拆成 省/市/详细地址
//   B) clipboard-read 被拒（iOS WKWebView / iframe / 未授权）→ 按钮进入「等待粘贴」，
//      此时用户随手 Ctrl+V（paste 事件）也要能被捕获并拆分，不依赖焦点位置
//
// 2026-11-03 改版：结算从「确认收货信息」弹窗换成了整页的「确认订单」层，
// 粘贴识别搬进它的「新增收货地址」表单。断言因此全部改成**读 DOM 值**，不再读组件
// setupState —— 表单状态现在住在 CheckoutSheet 里，从页面实例上已经够不着了。
//
// 用法：先 `npm run dev`（默认 5173），再 `node scripts/probes/probe-shop-address-paste.mjs`
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE || 'http://localhost:5173';
const SHOP_URL = `${BASE}/#/shop`;
const ADDRESS_A = '江苏省苏州市姑苏区人民路 200 号 3 栋 501';
const ADDRESS_B = '浙江省杭州市西湖区文三路 100 号';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  | ${detail}` : ''}`);
  if (!ok) failed += 1;
};

/* 打开结算页：无凭据下直接置位页面状态。
   未登录 ⇒ 地址簿读不到、也没有 profiles 回落 ⇒ 结算页会自动把「新增收货地址」
   表单摆出来，正好是识别按钮所在的那一屏。 */
const openCheckout = async (page) => {
  await page.goto(SHOP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.store-page', { timeout: 20000 });
  await page.evaluate(() => {
    const el = document.querySelector('.store-page');
    el.__vueParentComponent.setupState.showCheckout = true;
  });
  await page.waitForSelector('.ck-paste-btn', { timeout: 10000 });
};

/** 读表单三段 —— 直接从 DOM 读，避开 v-model 回写时序 */
const readForm = (page) =>
  page.evaluate(() => ({
    province: document.querySelector('.ck-select select')?.value || '',
    city: document.querySelector('.ck-addr-grid input[aria-label="城市"]')?.value || '',
    detail: document.querySelector('.ck-field textarea[aria-label="详细地址"]')?.value || '',
    pasteText: document.querySelector('.ck-paste input')?.value || '',
    awaiting: document.querySelector('.ck-paste-btn')?.classList.contains('is-awaiting'),
    button: document.querySelector('.ck-paste-btn')?.innerText?.trim() || '',
  }));

const browser = await chromium.launch({ args: ['--no-sandbox'] });

// ---------- A) 已授权：点按钮直接读剪贴板 ----------
{
  const context = await browser.newContext();
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await context.newPage();
  await openCheckout(page);
  await page.evaluate((text) => navigator.clipboard.writeText(text), ADDRESS_A);
  await page.click('.ck-paste-btn');
  await page.waitForTimeout(500);
  const form = await readForm(page);
  check('A1 剪贴板授权后点「识别」填出省份', form.province === '江苏省', JSON.stringify(form));
  check('A2 城市识别为苏州市', form.city === '苏州市');
  check('A3 详细地址保留区县与门牌', form.detail.includes('姑苏区') && form.detail.includes('501'));
  check('A4 识别成功后清空粘贴框', form.pasteText === '');
  check('A5 未进入等待粘贴态', form.awaiting === false);
  await context.close();
}

// ---------- B) 拒绝授权：进入等待粘贴，靠 paste 事件兜底 ----------
{
  const context = await browser.newContext();
  // 不授予 clipboard-read：readText 会抛 NotAllowedError
  const page = await context.newPage();
  await openCheckout(page);
  await page.click('.ck-paste-btn');
  await page.waitForTimeout(500);
  const armed = await readForm(page);
  check('B1 读不到剪贴板时进入等待粘贴态', armed.awaiting === true, JSON.stringify(armed));
  check('B2 按钮文案切换为「等待粘贴」', armed.button.includes('等待粘贴'), armed.button);
  check('B3 等待态下三段仍为空（不误填）', !armed.province && !armed.city && !armed.detail);

  // 模拟用户在弹层任意位置 Ctrl+V：paste 事件冒泡到 document 捕获阶段
  await page.evaluate((text) => {
    const dt = new DataTransfer();
    dt.setData('text', text);
    document
      .querySelector('.ck-picker')
      .dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
  }, ADDRESS_B);
  await page.waitForTimeout(500);
  const filled = await readForm(page);
  check('B4 粘贴事件兜底后填出省份', filled.province === '浙江省', JSON.stringify(filled));
  check('B5 城市识别为杭州市', filled.city === '杭州市');
  check('B6 兜底完成后退出等待态', filled.awaiting === false);
  check('B7 按钮文案回到「识别」', filled.button.trim() === '识别', filled.button);
  await context.close();
}

await browser.close();
console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
