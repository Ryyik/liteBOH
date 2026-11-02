/**
 * verify 编排器的「不许悄悄退化」守卫（2026-11-02）
 *
 * 背景：`npm run verify` 从 18 段串行链改成 `node scripts/verify.mjs`（并行编排，
 * 单机 144s → 约 117s）。这类改动的风险**不在速度，在语义**：
 *
 *   ① 编排器要读 `verify:serial` 里的 `npm run X` 清单。如果有人顺手把
 *      `verify:serial` 删了/改成了非 `npm run` 形式，编排器会解析到 **0 道门禁**，
 *      然后打印「全绿」—— 最坏的假绿：什么都没跑，却告诉你可以提交。
 *   ② 如果有人把 `verify` 指回一条不含 `verify.mjs` 的链，本文件的并行承诺失效
 *      （不至于出人命，但下次有人想「为什么又变慢了」得重新考古）。
 *   ③ lint 的缓存目录必须落在 `node_modules/.cache` 下 —— 写到仓库根就会多出
 *      一个 `.eslintcache` 未跟踪文件，被 `check:root-clean` 判成沙盒增长。
 *
 * 这几条都只能靠「读源码 + 断言」来锁，属于本仓既有的 guards 风格。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (rel) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const pkg = JSON.parse(read('package.json'));

describe('verify 编排器：清单单一真源与失败语义', () => {
  it('verify 走编排器，串行链保留在 verify:serial 当逃生口', () => {
    expect(pkg.scripts.verify).toBe('node scripts/verify.mjs');
    expect(pkg.scripts['verify:serial']).toBeTruthy();
  });

  it('verify:serial 里的每一条 `npm run X` 都真的有对应的 script', () => {
    const names = [...pkg.scripts['verify:serial'].matchAll(/npm run ([A-Za-z0-9:_-]+)/g)].map(
      (m) => m[1],
    );
    // 少于 10 道就说明清单被削弱过 —— 这条断言防的是「静默跑空」而不是具体条数
    expect(names.length).toBeGreaterThan(10);
    const missing = names.filter((n) => !pkg.scripts[n]);
    expect(missing).toEqual([]);
  });

  it('编排器解析空清单时必须报错退出，不许打印全绿', () => {
    const src = read('scripts/verify.mjs');
    expect(src).toContain("pkg.scripts['verify:serial']");
    expect(src).toContain('拒绝静默跑空');
    expect(src).toMatch(/if \(!chain\.length\)[\s\S]{0,120}process\.exit\(1\)/);
  });

  it('任一门禁红 ⇒ 不跑重活，直接 exit 1（与 && 链同语义）', () => {
    const src = read('scripts/verify.mjs');
    expect(src).toMatch(/门禁未通过[\s\S]{0,80}process\.exit\(1\)/);
  });

  it('test 不与重活并行（project-structure 的同步全仓扫描会被饿死）', () => {
    const src = read('scripts/verify.mjs');
    // 轻活批里出现 test 就是回归：它是被刻意排除的那一个
    expect(src).toContain("const HEAVY = ['lint', 'type-check', 'test']");
    expect(src).toMatch(/const LIGHT = \[SUMMARY, 'lint', 'type-check'\]/);
  });
});

describe('缓存目录不许污染仓库', () => {
  it('eslint 缓存写在 node_modules/.cache 下', () => {
    expect(pkg.scripts.lint).toContain('--cache');
    expect(pkg.scripts.lint).toContain('node_modules/.cache');
  });

  it('roundup：上述缓存路径已被 .gitignore 覆盖（node_modules 整体忽略）', () => {
    expect(read('.gitignore')).toMatch(/node_modules/);
  });
});

describe('prepush 复用同一套编排（不写第二份门禁清单）', () => {
  const src = read('scripts/prepush.mjs');

  it('门禁批走 verify.mjs --gates-only', () => {
    expect(src).toContain("'scripts/verify.mjs', '--gates-only'");
  });

  it('--full 的 lint/type-check/test 走 --heavy-only', () => {
    expect(src).toContain("'scripts/verify.mjs', '--heavy-only'");
  });

  it('self-test 仍单独补跑（它不在 verify 链里）', () => {
    expect(src).toContain('check:gates-self-test');
  });

  it('门禁清单也从 verify:serial 解析（读 verify 会解析到 0 条 ⇒ 假绿）', () => {
    expect(src).toContain("pkg.scripts['verify:serial']");
  });
});
