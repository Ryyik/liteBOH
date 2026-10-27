/**
 * 依赖审计「严格档 / 告警档」守卫（2026-10-27）。
 *
 * 背景：`security:audit` 的判据是 npm 公告库，不是本仓代码 —— 同一份 lock 昨天绿、今天红。
 * 10-27 三条新公告把一次纯 CSS 推送卡红，main 一直红到有人手动升包。
 * 修法是按**变更域**分档（改了依赖清单才阻断），本文件锁住两件事：
 *
 *  1. 分档纯函数 `decideScope` 的每个分支 —— 它一旦判反，要么又回到「无关改动被卡」，
 *     要么把「明明改了依赖」的推送放过（漏判的兜底是每日定时审计，但不该靠兜底）；
 *  2. 工作流的**接线** —— ci.yml 必须用 `security:audit:ci`（不是裸严格档），
 *     定时工作流必须存在且拿到 `issues: write`，以及所有工作流引用的 `npm run x`
 *     都真实存在于 package.json。最后一个是最容易静默失败的一类：脚本改名后 CI 才红。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { decideScope, SCOPE_ADVISORY, SCOPE_STRICT } from '../../scripts/lib/audit-scope.mjs';

const ROOT = process.cwd();
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');

describe('decideScope —— 变更域判定', () => {
  it('改了 package.json / package-lock.json ⇒ 严格档', () => {
    expect(decideScope(['package.json'])).toBe(SCOPE_STRICT);
    expect(decideScope(['package-lock.json'])).toBe(SCOPE_STRICT);
    expect(decideScope(['src/App.vue', 'package-lock.json', 'docs/a.md'])).toBe(SCOPE_STRICT);
  });

  it('没动依赖清单 ⇒ 告警档（这是本轮要保住的行为）', () => {
    expect(decideScope(['src/App.vue'])).toBe(SCOPE_ADVISORY);
    expect(decideScope(['src/styles/a.css', 'docs/x.md'])).toBe(SCOPE_ADVISORY);
  });

  it('空/缺失输入 ⇒ 告警档（无改动可判，不制造红）', () => {
    expect(decideScope([])).toBe(SCOPE_ADVISORY);
    expect(decideScope(null)).toBe(SCOPE_ADVISORY);
    expect(decideScope(undefined)).toBe(SCOPE_ADVISORY);
  });

  it('列表被截断 ⇒ 严格档（无法断言「没碰依赖」）', () => {
    expect(decideScope(['src/App.vue'], { truncated: true })).toBe(SCOPE_STRICT);
  });

  it('只认仓库根的清单，同名的子路径/备份文件不算', () => {
    // 否则 `docs/package.json` 或 `package.json.bak` 会误触发严格档
    expect(decideScope(['docs/package.json'])).toBe(SCOPE_ADVISORY);
    expect(decideScope(['package.json.bak'])).toBe(SCOPE_ADVISORY);
    expect(decideScope(['some/package-lock.json'])).toBe(SCOPE_ADVISORY);
  });
});

describe('工作流接线', () => {
  const ci = parse(read('.github/workflows/ci.yml'));
  const scripts = JSON.parse(read('package.json')).scripts;

  it('ci.yml 的审计步走 security:audit:ci（不退回裸严格档）', () => {
    const steps = ci.jobs.quality.steps;
    const audit = steps.find((s) => s.name === 'Dependency audit (ratchet)');
    expect(audit, '审计步骤丢了？').toBeTruthy();
    expect(audit.run).toContain('security:audit:ci');
    // 反向：裸 `security:audit` 会让无关改动又被卡死
    expect(audit.run).not.toMatch(/(^|\s)security:audit(\s|$)/);
    // 判定依赖这两个环境变量，缺一个就静默降级成告警档
    expect(audit.env?.BASE_SHA, 'BASE_SHA 没传 ⇒ 永远告警档').toBeTruthy();
    expect(audit.env?.GH_TOKEN, 'GH_TOKEN 没传 ⇒ compare 调不通').toBeTruthy();
  });

  it('定时兜底工作流存在，跑严格档且能开 issue', () => {
    const path = '.github/workflows/audit-scheduled.yml';
    const wf = parse(read(path));
    // 定时触发：没有它，「新公告」就只能等下次改依赖才被发现
    expect(wf.on?.schedule?.[0]?.cron).toMatch(/^\S+ \S+ \S+ \S+ \S+$/);
    // 开 issue 需要写权限；缺了会在 create 时才失败（静默）
    expect(wf.permissions?.issues).toBe('write');

    const runs = wf.jobs.audit.steps.map((s) => s.run || '').join('\n');
    expect(runs).toContain('npm run security:audit'); // 严格档
    expect(runs).not.toContain('security:audit:advisory');
    expect(runs).toContain('gh issue create');
  });

  it('所有工作流引用的 npm 脚本都真实存在（改名后不许静默红）', () => {
    const files = ['ci.yml', 'deploy.yml', 'audit-scheduled.yml', 'codeql.yml', 'deno-check.yml'];
    const missing = [];
    for (const f of files) {
      const text = read(`.github/workflows/${f}`)
        // 注释里会合法地提到脚本名，先去掉整行注释再匹配
        .split('\n')
        .filter((line) => !line.trim().startsWith('#'))
        .join('\n');
      for (const m of text.matchAll(/npm run (?:--silent )?([a-zA-Z0-9:_.-]+)/g)) {
        const name = m[1];
        if (!(name in scripts)) missing.push(`${f}: npm run ${name}`);
      }
    }
    expect(missing, `工作流引用了不存在的脚本：\n${missing.join('\n')}`).toEqual([]);
  });
});
