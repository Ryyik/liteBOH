/**
 * 灵动岛冒烟测试（Playwright，无头 Chromium）
 *
 * 覆盖 useIsland 统一调度中心的核心行为：
 *  1. notify    通知岛展示 + 自动消失
 *  2. notify    通知岛排队（前一张未收起时后一张等待）
 *  3. task      任务岛生命周期（progress → success 自动收起）
 *  4. task      任务岛排队（先进先出）
 *  5. AI 岛优先级仲裁（任务卡隐藏 → 关闭 AI 岛后恢复）
 *
 * 前置：Vite dev server 已启动（默认 http://localhost:5174，可用 BASE_URL 覆盖）。
 * 运行：npm run island:smoke
 *
 * 说明：为避免 Vite HMR 导致的模块实例分裂，这里从 navbar 转换产物中
 * 提取带 ?t= 时间戳的真实 useIsland.js URL 再动态 import，确保拿到的是
 * navbar 正在使用的同一个调度中心实例。
 */

import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5174';

/** 依次尝试：CHROMIUM_PATH 环境变量 > 项目 playwright 默认浏览器 > 本机已装的任意 chromium 版本 */
const launchBrowser = async () => {
  const candidates = [];
  if (process.env.CHROMIUM_PATH) candidates.push(process.env.CHROMIUM_PATH);
  try {
    return await chromium.launch({ headless: true });
  } catch {
    // 继续尝试本机已有浏览器
  }
  const cacheDir = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  if (existsSync(cacheDir)) {
    const dirs = readdirSync(cacheDir)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const dir of dirs) {
      candidates.push(
        join(cacheDir, dir, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        join(cacheDir, dir, 'chrome-mac', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing')
      );
    }
  }
  for (const executablePath of candidates) {
    if (executablePath && existsSync(executablePath)) {
      try {
        return await chromium.launch({ headless: true, executablePath });
      } catch {
        // 尝试下一个
      }
    }
  }
  throw new Error('no chromium available');
};

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const main = async () => {
  let browser;
  try {
    browser = await launchBrowser();
  } catch (err) {
    console.error('无法启动 Chromium（可先执行 `npx playwright install chromium`）:', err.message);
    process.exit(2);
  }

  const page = await browser.newPage();
  page.setDefaultTimeout(8000);

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  } catch (err) {
    console.error(`无法访问 ${BASE_URL}，请先启动 dev server（npm run dev）:`, err.message);
    await browser.close();
    process.exit(2);
  }

  // ---- 从 navbar 源码中提取真实 useIsland 模块 URL，注入到页面全局 ----
  const islandInjected = await page.evaluate(async () => {
    try {
      const res = await fetch('/src/components/UnifiedNavbar/index.vue');
      const src = await res.text();
      const m = src.match(/["'](\/src\/composables\/useIsland\.js[^"']*)["']/);
      const url = m ? m[1] : '/src/composables/useIsland.js';
      const mod = await import(/* @vite-ignore */ url);
      window.__island = mod.showIsland;
      return Boolean(mod.showIsland);
    } catch {
      return false;
    }
  });

  if (!islandInjected) {
    record('useIsland 模块注入', false, '无法从 navbar 提取并加载 useIsland.js');
    await browser.close();
    process.exit(1);
  }
  record('useIsland 模块注入（与 navbar 同实例）', true, 'window.__island');

  const notify = (payload) => page.evaluate((p) => window.__island.notify(p), payload);

  // ---- T1: 通知岛展示 + 自动消失 ----
  try {
    await notify({ title: '冒烟通知', message: 'T1 展示与自动消失', icon: 'success', durationMs: 2200 });
    await page.waitForSelector('.global-nav-status-card', { state: 'visible' });
    await page.waitForSelector('.global-nav-status-card', { state: 'detached', timeout: 8000 });
    record('T1 notify 展示与自动消失', true);
  } catch (err) {
    record('T1 notify 展示与自动消失', false, err.message.split('\n')[0]);
  }

  // ---- T2: 通知岛排队（A 未收起时 B 入队，A 收起后 B 展示） ----
  try {
    await notify({ title: '通知A', message: 'T2 先入', icon: 'success', durationMs: 2200 });
    await page.waitForSelector('.global-nav-status-card', { state: 'visible' });
    await notify({ title: '通知B', message: 'T2 后入排队', icon: 'success', durationMs: 1800 });
    const aTitle = await page.textContent('.global-nav-status-card');
    if (!aTitle.includes('通知A')) throw new Error(`队列首应展示 A，实际: ${aTitle.slice(0, 40)}`);
    await page.waitForFunction(
      () => document.querySelector('.global-nav-status-card')?.textContent?.includes('通知B'),
      { timeout: 9000 }
    );
    record('T2 notify 排队先进先出', true);
    await page.waitForSelector('.global-nav-status-card', { state: 'detached', timeout: 8000 });
  } catch (err) {
    record('T2 notify 排队先进先出', false, err.message.split('\n')[0]);
  }

  // ---- T3: 任务岛生命周期 progress → success 自动收起 ----
  try {
    await page.evaluate(() => {
      const t = window.__island.task({ id: 'smoke-t3', title: '冒烟任务', message: '处理中' });
      t.progress(50, '一半了');
      window.__smokeTask = t;
    });
    await page.waitForSelector('.global-nav-task-card', { state: 'visible' });
    const cardText = await page.textContent('.global-nav-task-card');
    if (!cardText.includes('冒烟任务')) throw new Error('任务卡未展示任务标题');
    await page.evaluate(() => window.__smokeTask.success({ message: '完成' }));
    await page.waitForSelector('.global-nav-task-card', { state: 'detached', timeout: 8000 });
    record('T3 task 生命周期 progress→success', true);
  } catch (err) {
    record('T3 task 生命周期 progress→success', false, err.message.split('\n')[0]);
  }

  // ---- T4: 任务岛排队（第二张任务等待第一张收起） ----
  try {
    await page.evaluate(() => {
      const a = window.__island.task({ id: 'smoke-t4a', title: '任务A', message: '先' });
      const b = window.__island.task({ id: 'smoke-t4b', title: '任务B', message: '后' });
      window.__smokeA = a;
      window.__smokeB = b;
    });
    await page.waitForSelector('.global-nav-task-card', { state: 'visible' });
    let txt = await page.textContent('.global-nav-task-card');
    if (!txt.includes('任务A')) throw new Error('应先展示任务A');
    await page.evaluate(() => window.__smokeA.success({ durationMs: 800 }));
    await page.waitForFunction(
      () => document.querySelector('.global-nav-task-card')?.textContent?.includes('任务B'),
      { timeout: 9000 }
    );
    record('T4 task 排队先进先出', true);
    await page.evaluate(() => window.__smokeB.close());
    await page.waitForSelector('.global-nav-task-card', { state: 'detached', timeout: 8000 });
  } catch (err) {
    record('T4 task 排队先进先出', false, err.message.split('\n')[0]);
  }

  // ---- T5: AI 岛优先级仲裁（任务卡隐藏，关闭 AI 岛后恢复） ----
  try {
    await page.evaluate(() => {
      window.__smokeT5 = window.__island.task({ id: 'smoke-t5', title: '仲裁任务', message: '运行中' });
    });
    await page.waitForSelector('.global-nav-task-card', { state: 'visible' });

    await page.evaluate(() => {
      const ok = window.__island.ai();
      if (!ok) throw new Error('showIsland.ai() 返回 false（opener 未注册或路由不可开）');
    });
    const navHasAiClass = await page.waitForFunction(
      () => document.querySelector('.unified-nav-surface')?.classList.contains('has-bohai-island'),
      { timeout: 6000 }
    );
    if (!navHasAiClass) throw new Error('AI 岛未占用 surface');
    await page.waitForSelector('.global-nav-task-card', { state: 'hidden', timeout: 6000 });
    record('T5a AI 岛占用时任务卡隐藏', true);

    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => !document.querySelector('.unified-nav-surface')?.classList.contains('has-bohai-island'),
      { timeout: 6000 }
    );
    await page.waitForSelector('.global-nav-task-card', { state: 'visible', timeout: 6000 });
    record('T5b 关闭 AI 岛后任务卡恢复', true);

    await page.evaluate(() => window.__smokeT5.close());
    await page.waitForSelector('.global-nav-task-card', { state: 'detached', timeout: 8000 });
  } catch (err) {
    record('T5 AI 岛优先级仲裁', false, err.message.split('\n')[0]);
    // 兜底清理，避免残留岛影响后续
    await page.evaluate(() => window.__smokeT5?.close?.()).catch(() => {});
  }

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n结果: ${results.length - failed.length}/${results.length} 通过`);
  if (failed.length) {
    process.exit(1);
  }
};

main().catch((err) => {
  console.error('冒烟测试异常:', err);
  process.exit(2);
});
