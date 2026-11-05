/**
 * 灵动岛冒烟测试（Playwright，无头 Chromium）
 *
 * 覆盖 useIsland 统一调度中心的核心行为：
 *  1. notify    通知岛展示 + 自动消失
 *  2. notify    通知岛排队（前一张未收起时后一张等待）
 *  3. task      任务岛生命周期（progress → success 自动收起）
 *  4. task      任务岛排队（先进先出）
 *  5. 岛与任务卡共存：P3 起 AI 岛是 App 级 BohIsland、不占 surface ⇒ 两者同时存在，
 *     且岛要跟着 surface 撑高下移（断言「共存 + 不重叠」，不是旧的「任务卡隐藏」）
 *  6. notify    被任务岛压制后恢复展示，且恢复时重新计时（不能永久驻留）
 *  7. notify    自定义岛压制通知卡（曾同屏重叠 52px），收起后通知补弹
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
        join(
          cacheDir,
          dir,
          'chrome-mac-arm64',
          'Google Chrome for Testing.app',
          'Contents',
          'MacOS',
          'Google Chrome for Testing',
        ),
        join(
          cacheDir,
          dir,
          'chrome-mac',
          'Google Chrome for Testing.app',
          'Contents',
          'MacOS',
          'Google Chrome for Testing',
        ),
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

  // 跳过首页开场画：开场画在场时 BohIsland 的 canOpen 恒 false（与 probe-nav-ask 同法）
  await page.addInitScript(() => {
    try {
      localStorage.setItem('boh-home-gate-passed', String(Date.now()));
    } catch {
      /* ignore */
    }
  });

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

  // ---- T0: 岛根容器必须透明 ----
  // 它 inset:0 全屏、z-index:90、pointer-events:none，且恒带 data-theme="dark"。
  // 任何泛化的 `[data-theme="dark"] { background: … }` 都会把它涂成整屏底色 ⇒
  // 页面全黑、只有导航栏可见，但 DOM 取点/交互/所有断言全部正常（指针穿透）。
  // 2026-11-04 事故：index.html 的骨架兜底是裸 [data-theme="dark"]，P1 给岛根加上
  // data-theme 的当天全站黑屏；40 条 nav-ask 断言、59 条搜索断言、40/40 全绿，
  // 没有一条能发现它 —— 因为它们都只看 DOM。这条锁专门盯「看得见」的那一层。
  try {
    const rootBg = await page.evaluate(() => {
      const el = document.querySelector('.boh-island-root');
      return el ? getComputedStyle(el).backgroundColor : null;
    });
    if (!rootBg) throw new Error('页面上没有 .boh-island-root');
    if (!/^(rgba\(0, 0, 0, 0\)|transparent)$/.test(rootBg)) {
      throw new Error(`岛根容器带背景 ${rootBg}（会整屏遮住页面）`);
    }
    record('T0 岛根容器透明（带底色会整屏遮黑）', true, rootBg);
  } catch (err) {
    record('T0 岛根容器透明', false, err.message.split('\n')[0]);
  }

  // ---- T1: 通知岛展示 + 自动消失 ----
  try {
    await notify({
      title: '冒烟通知',
      message: 'T1 展示与自动消失',
      icon: 'success',
      durationMs: 2200,
    });
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
      { timeout: 9000 },
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
      { timeout: 9000 },
    );
    record('T4 task 排队先进先出', true);
    await page.evaluate(() => window.__smokeB.close());
    await page.waitForSelector('.global-nav-task-card', { state: 'detached', timeout: 8000 });
  } catch (err) {
    record('T4 task 排队先进先出', false, err.message.split('\n')[0]);
  }

  // ---- T5: 岛与任务卡共存（plans/038 P3 仲裁退场） ----
  // P3 前：AI 岛占 surface，任务卡被 setIslandAiPaused 抑制（隐藏 + 队列暂停）。
  // P3 后：AI 岛是 App 级 BohIsland（Teleport 到 body），与 surface 零耦合 ⇒ 两者共存，
  //        岛靠 ResizeObserver 跟随 surface 撑高、把自己挪到卡片下方，而不是把卡片藏掉。
  // ⚠️ 这里断言的是「共存 + 不重叠」，不是旧的「任务卡隐藏」—— 改成后者会永远红。
  try {
    await page.evaluate(() => {
      window.__smokeT5 = window.__island.task({
        id: 'smoke-t5',
        title: '共存任务',
        message: '运行中',
      });
    });
    await page.waitForSelector('.global-nav-task-card', { state: 'visible' });

    // 不带 prompt：只开岛不触发对话（冒烟不该打真实模型请求）
    const opened = await page.evaluate(() => window.__island.ai({ prompt: '' }));
    if (!opened) throw new Error('showIsland.ai() 返回 false（AiChat 页 / 开场画在场）');
    await page.waitForFunction(
      () => document.querySelector('.boh-island-root')?.classList.contains('open'),
      { timeout: 6000 },
    );
    record('T5a AI 岛已开（App 级 BohIsland）', true);

    await page.waitForSelector('.global-nav-task-card', { state: 'visible', timeout: 3000 });
    record('T5b 任务卡不被 AI 岛抑制（P3 仲裁退场）', true);

    // 不重叠：岛顶必须落在卡片底边之下（surface 撑高后岛要跟着下移 —— 实测过重叠 52px）
    await page
      .waitForFunction(
        () => {
          const card = document.querySelector('.global-nav-task-card')?.getBoundingClientRect();
          const island = document.querySelector('.boh-card')?.getBoundingClientRect();
          return !!card && !!island && island.top >= card.bottom - 1;
        },
        { timeout: 4000 },
      )
      .catch(() => null);
    const geom = await page.evaluate(() => {
      const card = document.querySelector('.global-nav-task-card')?.getBoundingClientRect();
      const island = document.querySelector('.boh-card')?.getBoundingClientRect();
      return {
        cardBottom: Math.round(card?.bottom ?? -1),
        islandTop: Math.round(island?.top ?? -1),
      };
    });
    if (!(geom.cardBottom > 0 && geom.islandTop >= geom.cardBottom - 1)) {
      throw new Error(`岛与任务卡重叠 ${JSON.stringify(geom)}`);
    }
    record('T5c 岛不压任务卡（岛顶 ≥ 卡底 −1）', true, JSON.stringify(geom));

    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => !document.querySelector('.boh-island-root')?.classList.contains('open'),
      { timeout: 6000 },
    );
    await page.waitForSelector('.global-nav-task-card', { state: 'visible', timeout: 6000 });
    record('T5d 关岛后任务卡照常', true);

    await page.evaluate(() => window.__smokeT5.close());
    await page.waitForSelector('.global-nav-task-card', { state: 'detached', timeout: 8000 });
  } catch (err) {
    record('T5 岛与任务卡共存', false, err.message.split('\n')[0]);
    // 兜底清理，避免残留岛影响后续
    await page.evaluate(() => window.__smokeT5?.close?.()).catch(() => {});
  }

  // ---- T6: 通知被任务岛压制后必须恢复，且恢复时要重新计时 ----
  // 回归锁（2026-11-04）：压制是让卡片走完整离场动画，after-leave 会把本条通知自己的
  // dismiss 定时器清掉 ⇒ 不重排的话，任务收起后通知淡回来就永远不走（实测 10s 仍在屏）。
  try {
    await notify({ title: 'T6压制通知', message: '恢复后应自动收', durationMs: 2000 });
    await page.waitForSelector('.global-nav-status-card', { state: 'visible' });
    await page.evaluate(() => {
      window.__smokeT6 = window.__island.task({
        id: 'smoke-t6',
        title: 'T6任务',
        message: '压制中',
      });
    });
    await page.waitForSelector('.global-nav-status-card', { state: 'detached', timeout: 6000 });
    await page.evaluate(() => window.__smokeT6.close());
    await page.waitForSelector('.global-nav-status-card', { state: 'visible', timeout: 6000 });
    record('T6a 压制解除后通知恢复展示', true);

    // 2000ms 展示 + 620ms 离场动画；给 7s 余量。修复前这里必然超时。
    await page.waitForSelector('.global-nav-status-card', { state: 'detached', timeout: 7000 });
    record('T6b 恢复后重新计时并自动收起', true);
  } catch (err) {
    record('T6 压制后恢复 + 重新计时', false, err.message.split('\n')[0]);
    await page
      .evaluate(() => {
        window.__smokeT6?.close?.();
        window.__island.preempt();
      })
      .catch(() => {});
  }

  // ---- T7: 自定义岛与通知卡互斥（曾同屏重叠 52px）+ 收起后通知补弹 ----
  // 两者 top 都取 --global-nav-status-top，绝对定位；仲裁只判了任务岛时它们会直接叠在一起。
  try {
    // 先清场：T6 若失败会留下正在离场的通知卡，它会在下面被判成「通知卡也被渲染」（假红）
    await page.evaluate(() => window.__island.preempt());
    await page
      .waitForSelector('.global-nav-status-card', { state: 'detached', timeout: 3000 })
      .catch(() => {});

    const customOk = await page.evaluate(async () => {
      try {
        const mod = await import(
          /* @vite-ignore */ '/src/components/UnifiedNavbar/OverviewIslandLoading.vue'
        );
        window.__smokeCustom = window.__island.custom(mod.default, {});
        return Boolean(window.__smokeCustom);
      } catch {
        return false;
      }
    });
    if (!customOk) throw new Error('自定义岛挂载失败');
    await page.waitForSelector('.island-custom-host', { state: 'visible' });

    await notify({ title: 'T7排队通知', message: '自定义岛在场', durationMs: 1800 });
    await page.waitForTimeout(500);
    const leaked = await page.evaluate(() => !!document.querySelector('.global-nav-status-card'));
    if (leaked) throw new Error('自定义岛在场时通知卡也被渲染（应排队）');
    record('T7a 自定义岛压制通知卡（不重叠）', true);

    await page.evaluate(() => window.__smokeCustom.close());
    await page.waitForSelector('.global-nav-status-card', { state: 'visible', timeout: 6000 });
    record('T7b 自定义岛收起后通知补弹', true);
    await page.waitForSelector('.global-nav-status-card', { state: 'detached', timeout: 7000 });
  } catch (err) {
    record('T7 自定义岛与通知仲裁', false, err.message.split('\n')[0]);
    await page
      .evaluate(() => {
        window.__smokeCustom?.close?.();
        window.__island.preempt();
      })
      .catch(() => {});
  }

  // ---- T8: 通知已在屏时自定义岛插入 → 通知让位；岛收起后通知恢复并重计 ----
  // 与 T7 是两个时序：T7 锁 handleGlobalNavStatus 的 busy 判定（通知来时岛已在），
  // T8 锁 statusCardItem 里的 isCustomCardShown（通知上屏之后岛才挂上来，busy 已经来不及了）。
  try {
    // 时长必须明显长于下面的等待窗口，否则「自然到期」也会被判成「被压制」（假绿）
    await notify({ title: 'T8在屏通知', message: '随后插岛', durationMs: 6000 });
    await page.waitForSelector('.global-nav-status-card', { state: 'visible' });

    const mounted = await page.evaluate(async () => {
      try {
        const mod = await import(
          /* @vite-ignore */ '/src/components/UnifiedNavbar/OverviewIslandLoading.vue'
        );
        window.__smokeCustom8 = window.__island.custom(mod.default, {});
        return Boolean(window.__smokeCustom8);
      } catch {
        return false;
      }
    });
    if (!mounted) throw new Error('自定义岛挂载失败');
    await page.waitForSelector('.island-custom-host', { state: 'visible' });

    await page.waitForSelector('.global-nav-status-card', { state: 'detached', timeout: 2500 });
    record('T8a 通知在屏时插岛 → 通知让位', true);

    await page.evaluate(() => window.__smokeCustom8.close());
    await page.waitForSelector('.global-nav-status-card', { state: 'visible', timeout: 5000 });
    record('T8b 岛收起后通知恢复', true);

    // 恢复后必须重新计时（6000ms + 620ms 离场），否则会永久驻留
    await page.waitForSelector('.global-nav-status-card', { state: 'detached', timeout: 9000 });
    record('T8c 恢复后重新计时并自动收起', true);
  } catch (err) {
    record('T8 在屏通知遇插岛', false, err.message.split('\n')[0]);
    await page
      .evaluate(() => {
        window.__smokeCustom8?.close?.();
        window.__island.preempt();
      })
      .catch(() => {});
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
