#!/usr/bin/env node
/**
 * probe-account-bind-prompt.mjs —— 账户绑定引导弹窗（AccountBindPrompt）的可视化探针
 *
 * 用途：把底部弹窗的各个分支渲染出来截图，供人肉眼复核视觉与文案。
 * 之所以需要它：该弹窗的正常触发条件是「**尚未**注册通行密钥」，
 * 已经注册过的人（包括开发者自己）永远不会看到它 —— 没有探针就没有复查手段。
 *
 * 走 `?bindPrompt=1` 自测活口进入（绕过全部触发条件），页面为项目根的
 * account-bind-prompt-demo.html：它直接挂载真实组件 + 注入预览登录态，
 * 因此截图里的观感与线上一致，不存在「第二份仿制样式」。
 *
 * 用法：
 *   node scripts/probes/probe-account-bind-prompt.mjs
 *   BASE_URL=http://localhost:5173 node scripts/probes/probe-account-bind-prompt.mjs
 *
 * ⚠️ 本机约定（见 memory）：必须禁代理，否则 playwright 会走系统代理导致连不上本地服务。
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://[::1]:5173';
const OUT_DIR = process.env.OUT_DIR || 'debug-screenshots/account-bind-prompt';

/**
 * 等待时长。必须覆盖两段：
 *   · 组件自身的首屏延迟 900ms + 入场动画 ~400ms；
 *   · 通知项解析里的 Service Worker 就绪判定（dev 环境没有 SW，会走满 3s 兜底超时）。
 * 所以取 ≥4.5s，否则截图会停在中途的「检查中…」状态而不是最终形态。
 */
const SETTLE_MS = 4500;

const SCENARIOS = [
  {
    name: '01-desktop',
    desc: '桌面默认：通行密钥 + 消息通知，两项都可开启',
    url: `${BASE_URL}/account-bind-prompt-demo.html?bindPrompt=1`,
    viewport: { width: 430, height: 900 },
  },
  {
    name: '02-ios-needs-install',
    desc: 'iPhone 未添加到主屏幕：通知项渲染成三步图文引导',
    url: `${BASE_URL}/account-bind-prompt-demo.html?bindPrompt=1&variant=ios`,
    viewport: { width: 390, height: 844 },
  },
  {
    name: '03-dark',
    desc: '深色主题下的同一弹窗',
    url: `${BASE_URL}/account-bind-prompt-demo.html?bindPrompt=1&variant=dark`,
    viewport: { width: 430, height: 900 },
  },
];

const main = async () => {
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    // 本机没装 playwright 自带内核时用系统 Chrome；禁代理避免连不上本地服务
    channel: 'chrome',
    args: [
      '--no-proxy-server',
      '--proxy-server=direct://',
      '--proxy-bypass-list=*',
    ],
  });

  const results = [];

  for (const scenario of SCENARIOS) {
    const context = await browser.newContext({
      viewport: scenario.viewport,
      deviceScaleFactor: 2,
      locale: 'zh-CN',
    });
    const page = await context.newPage();

    try {
      // 固定掉「读取推送配置」这一步：否则 dev 下会真去请求线上 Edge Function，
      // 截图结果随 CORS 与网络波动（实测会卡在「检查中…」），不稳定。
      // mock 一份 enabled:true 即可 —— 本地无订阅，组件会据此走到「可开启」态。
      await page.route('**/functions/v1/push-send**', (route) => {
        if (route.request().method() === 'OPTIONS') {
          return route.fulfill({
            status: 204,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': '*',
              'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
            },
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ ok: true, enabled: true, vapidPublicKey: 'B'.repeat(87) }),
        });
      });

      await page.goto(scenario.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // 弹窗是 Teleport 到 body 的，等它真出现再截
      await page.waitForSelector('.bind-prompt-sheet', { timeout: 20000 });
      await page.waitForTimeout(SETTLE_MS);

      const file = path.join(OUT_DIR, `${scenario.name}.png`);
      await page.screenshot({ path: file });

      // 顺带抓一份断言用的文本，确认分支真的走对了（截图之外的第二重证据）
      const sheetText = (await page.locator('.bind-prompt-sheet').innerText()).replace(/\s+/g, ' ').trim();
      const stepsCount = await page.locator('.bind-prompt-steps li').count();
      const buttons = await page.locator('.bind-prompt-sheet button').allInnerTexts();

      results.push({
        name: scenario.name,
        desc: scenario.desc,
        file,
        stepsCount,
        buttons: buttons.map((b) => b.replace(/\s+/g, ' ').trim()),
        text: sheetText.slice(0, 220),
        ok: true,
      });
    } catch (error) {
      results.push({ name: scenario.name, desc: scenario.desc, ok: false, error: String(error?.message || error) });
    } finally {
      await context.close();
    }
  }

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    if (r.ok) {
      console.log(`✓ ${r.name} — ${r.desc}`);
      console.log(`  截图: ${r.file}`);
      console.log(`  按钮: ${JSON.stringify(r.buttons)}  步骤项: ${r.stepsCount}`);
      console.log(`  文本: ${r.text}`);
    } else {
      console.error(`✗ ${r.name} — ${r.error}`);
    }
  }

  console.log(`\n[probe-account-bind-prompt] ${results.length - failed.length}/${results.length} 通过`);
  if (failed.length) process.exitCode = 1;
};

main().catch((error) => {
  console.error('[probe-account-bind-prompt] 运行失败：', error);
  process.exit(1);
});
