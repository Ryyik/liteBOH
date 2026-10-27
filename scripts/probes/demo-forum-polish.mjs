/**
 * demo-forum-polish.mjs —— 打开一个保持打开的浏览器，让用户亲手试「智能整理」文字流光
 *
 * 与 probe-forum-polish-sweep.mjs 的区别：那个跑完就关、输出数据；这个不关，
 * 登录态/示例文字/模型拦截全部就绪，用户在窗口里自己点「智能整理」反复看。
 *
 * 模型被拦截成 6 秒延迟 + 固定结果 —— 正好够看完两个流光周期，也不会真打 API。
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const ORIGINAL = {
  title: '今天去图书馆了一天写论文',
  content:
    '今天去图书馆了一天写论文，去的时候早上八点多了，人很多了已经。\n\n论文写了两个小时先，然后咖啡去买了一杯楼下，接着写。下午看书来着，城市设计的书，讲街道尺度那章挺有意思的觉得。\n\n走的时候六点多了晚上，效率还行感觉，宿舍比强。',
};
const POLISHED = {
  title: '图书馆里赶论文的一天',
  content:
    '早上八点多到图书馆时，人已经不少了。\n\n先写了两小时论文，中途下楼买了杯咖啡再继续。下午读了本讲城市设计的书，其中讨论街道尺度的那一章很有意思。\n\n傍晚六点多离开，效率比在宿舍高。',
};

const b = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
p.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 160)));

// 模型拦截：延迟 6 秒再返回（看完两个呼吸周期），其余请求照常放行
await p.route('**/functions/v1/**', async (route) => {
  const url = route.request().url();
  if (url.includes('runtime-chat') || url.includes('api-key-vault')) {
    await new Promise((r) => setTimeout(r, 6000));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: { choices: [{ message: { content: JSON.stringify(POLISHED) } }] },
      }),
    });
  }
  return route.continue();
});

await p.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'load' });
await p.waitForTimeout(1500);
await p.evaluate((uid) => {
  const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
  const a = pinia.state.value.auth;
  a.isLoggedIn = true;
  if (a.userInfo) Object.assign(a.userInfo, { username: 'demo_user', id: uid });
}, '00ac36b4-6594-440f-a9c1-38b7bd47ee8b');
await p.waitForTimeout(1200);
// 发帖唯一入口是发布会话：从内容页 FAB 打开，横竖屏复用同一套 DOM
await p.waitForSelector('.mobile-compose-fab', { timeout: 20000 });
await p.click('.mobile-compose-fab');
await p.waitForSelector('.mobile-composer-overlay', { state: 'visible', timeout: 8000 });
await p.locator('.mobile-composer-overlay .post-title-input').fill(ORIGINAL.title);
await p.locator('.mobile-composer-overlay .post-content-input').fill(ORIGINAL.content);
await p.locator('.mobile-composer-overlay .post-content-input').scrollIntoViewIfNeeded();
await p.waitForTimeout(200);

// 自动开始一次整理 —— 用户打开窗口就能直接看到文字流光，
// 看完后可以点「撤销」恢复原文、再自己点「智能整理」反复看。
await p.locator('.composer-polish-action').click();

console.log('DEMO READY —— 浏览器保持打开。已自动开始一次「智能整理」；看完可点「撤销」再自己点按钮反复看。');
// 永不 resolve，让浏览器一直开着
await new Promise(() => {});
