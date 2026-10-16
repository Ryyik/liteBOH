import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

// 直接请求数据管理页模块，让 vite 现场编译，验证修复后的文件无编译错误
const modResp = await page.request.get(
  'http://localhost:5173/src/views/DataManagement/DataAdmin.vue',
);
const modText = await modResp.text();
console.log(
  'DataAdmin.vue vite 编译:',
  modResp.status() === 200 ? '✅ 200' : '❌ ' + modResp.status(),
);
console.log(
  '修复代码已注入(HMR 源可查 NEWS_CATEGORY_VALUES):',
  modText.includes('NEWS_CATEGORY_VALUES') ? '✅' : '❌',
);

// 官方事实「一眼看到内容」视图（2026-10-16）：表格多行单元格 + 卡片正文预览
console.log(
  '内容视图标记已注入(cell-text-multiline / lottery-card-preview):',
  modText.includes('cell-text-multiline') && modText.includes('lottery-card-preview') ? '✅' : '❌',
);

const valResp = await page.request.get(
  'http://localhost:5173/src/views/DataManagement/composables/useDataAdminValidation.js',
);
console.log(
  'useDataAdminValidation.js vite 编译:',
  valResp.status() === 200 ? '✅ 200' : '❌ ' + valResp.status(),
);

// 打开应用首页，确认无全局崩溃（数据管理页需要管理员登录态，此处验证编译链路与运行时无错）
// ⚠️ waitUntil 用 domcontentloaded：本机到 *.supabase.co 的连接会被网络层拦掉（请求悬挂），
//    networkidle 永远等不到（2026-10-16 实测超时）。
await page.goto('http://localhost:5173/#/admin/data-management', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(2500);
console.log('页面加载 pageerror 数:', pageErrors.length, pageErrors.length ? pageErrors : '✅');
console.log('console.error 数:', consoleErrors.length, consoleErrors.slice(0, 3));
await page.screenshot({ path: 'debug-screenshots/datamanagement-smoke.png' });
await browser.close();
