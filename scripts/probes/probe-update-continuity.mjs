/**
 * probe-update-continuity.mjs —— 「切换构建后不让用户看见」的端到端验收（2026-11-23）
 *
 * 为什么要独立一个探针：
 *   `probe-silent-update.mjs` 验证「不弹窗 + 空闲静默切换」，但它**测不了接续** ——
 *   它用 route 伪造 version.json 与 index.html 的 meta，却伪造不了 SW 预缓存里的
 *   index.html ⇒ readPrecachedShellBuildId 判定「落地失败」⇒ 必进硬重置 ⇒ 位置归零。
 *   那是探针环境的固有局限（假构建永远落不了地），不是代码缺陷。
 *
 *   所以接续单独在这里验：**直接预置一条现场记录，重载，断言滚动被复原**。
 *   这正是 update-continuity.js 的全部职责 —— 上游谁写入记录（空闲切换 / 硬重置 /
 *   切回）不影响这一步的正确性。
 *
 * 场景：
 *   S1 带记录重载 ⇒ 复原到目标位置
 *   S2 记录被消费掉（用后即焚，否则用户自己按 F5 会被拽回旧位置）
 *   S3 hash 不符 ⇒ 不套用（A 页的位置不能塞进 B 页）
 *   S4 过期记录 ⇒ 不套用
 *
 * 用法：
 *   npx vite preview --outDir dist-check --port 4181 --strictPort --host 127.0.0.1
 *   BASE=http://127.0.0.1:4181 node scripts/probes/probe-update-continuity.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:4181';
const KEY = 'boh_update_continuity';
const TARGET_Y = 700;

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail: String(detail || '').slice(0, 200) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

/** 预置记录 → 重载 → 读最终位置。每个场景用独立 context，互不污染。 */
const runScenario = async ({ hashMatches, ageMs = 0, scrollY = TARGET_Y }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForTimeout(5000); // 等首屏与开屏门控落定

  const docCanHold = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );

  await page.evaluate(
    ({ key, hashMatches, ageMs, scrollY }) => {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          // hashMatches=false 时故意写一个不相符的 hash
          hash: hashMatches ? location.hash || '#/' : '#/definitely-not-here',
          scrollY,
          containers: [],
          savedAt: Date.now() - ageMs,
        }),
      );
    },
    { key: KEY, hashMatches, ageMs, scrollY },
  );

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(5000); // 等首屏内容长出来 + 接续跑完

  const out = await page.evaluate(
    (key) => ({
      y: window.scrollY,
      leftover: sessionStorage.getItem(key),
      docH: document.documentElement.scrollHeight,
    }),
    KEY,
  );

  await ctx.close();
  return { ...out, docCanHold };
};

try {
  /* ---- S1：正常复原 ----
     容差 120px：不同次构建的页面高度可能略变，复原目标是「大致同一处」；
     完全失败会是 0（差 700px），很容易区分。 */
  const s1 = await runScenario({ hashMatches: true });
  check(
    'S1 带记录重载 ⇒ 滚动被复原',
    Math.abs(s1.y - TARGET_Y) <= 120,
    `目标 ${TARGET_Y}px，实际 ${s1.y}px（可滚 ${s1.docCanHold}px）`,
  );

  /* ---- S2：用后即焚 ----
     不清掉的话，用户下次自己按 F5 会被莫名其妙拽到上次位置 —— 比回顶更糟。 */
  check('S2 记录被消费掉（用后即焚）', s1.leftover === null, `残留=${s1.leftover}`);

  /* ---- S3：hash 不符不套用 ---- */
  const s3 = await runScenario({ hashMatches: false });
  check('S3 hash 不符 ⇒ 不套用，停在顶部', s3.y === 0, `实际 ${s3.y}px`);

  /* ---- S4：过期记录不套用（60s TTL）---- */
  const s4 = await runScenario({ hashMatches: true, ageMs: 61 * 1000 });
  check('S4 过期记录（>60s）⇒ 不套用', s4.y === 0, `实际 ${s4.y}px`);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n[continuity] ${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.error('[continuity] 失败项：');
  failed.forEach((f) => console.error(`  · ${f.name}  ${f.detail}`));
  process.exit(1);
}
