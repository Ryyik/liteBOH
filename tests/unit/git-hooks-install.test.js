/**
 * `scripts/install-git-hooks.sh` 的 worktree 闸。
 *
 * 事故背景（2026-11-09）：`npm run prepush` 会建临时 worktree，再在里面跑
 * `npm ci --dry-run`，触发 npm `prepare` → 本脚本。临时 worktree 与主仓**共享**
 * 同一个 .git/hooks，而脚本的 SRC_DIR 在临时目录里 ⇒ 主仓的 pre-commit / pre-push
 * 被改写成「指向临时目录」的软链 ⇒ prepush 收尾删目录 ⇒ 两个钩子静默失效，
 * 提交不再跑 lint-staged、推送不再跑漏配快速档。
 *
 * 这里用**假 git**（只回答脚本要问的三个问题）验证两个分支，不碰真实 .git：
 *   · linked worktree（git-dir ≠ common-dir）→ 一个钩子都不许写
 *   · 主检出（两者相同）→ 正常写入
 */
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = join(process.cwd(), 'scripts', 'install-git-hooks.sh');
const sandboxes = [];

afterEach(() => {
  while (sandboxes.length) {
    rmSync(sandboxes.pop(), { recursive: true, force: true });
  }
});

/**
 * 造沙箱：假 git + 空的 hooks 目录。
 * 假 git 只认脚本问的三个问题，其余一律失败（脚本靠 || 兜底，不会误伤）。
 */
const makeSandbox = () => {
  const root = mkdtempSync(join(tmpdir(), 'boh-hooks-test-'));
  sandboxes.push(root);
  const bin = join(root, 'bin');
  const hooks = join(root, 'hooks');
  mkdirSync(bin, { recursive: true });
  mkdirSync(hooks, { recursive: true });

  const fakeGit = join(bin, 'git');
  writeFileSync(
    fakeGit,
    `#!/bin/sh
case "$*" in
  *--git-common-dir) echo "$FAKE_GIT_COMMON" ;;
  *--git-dir) echo "$FAKE_GIT_DIR" ;;
  *--git-path\\ hooks) echo "$FAKE_HOOKS" ;;
  *) exit 1 ;;
esac
`,
  );
  chmodSync(fakeGit, 0o755);

  const run = (gitDir, commonDir) =>
    execFileSync('sh', [SCRIPT], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        FAKE_GIT_DIR: gitDir,
        FAKE_GIT_COMMON: commonDir,
        FAKE_HOOKS: hooks,
      },
    });

  return { root, hooks, run };
};

describe('install-git-hooks 的 worktree 闸', () => {
  it('linked worktree 里一个钩子都不写（否则主仓钩子会被改成临时路径）', () => {
    const { hooks, run } = makeSandbox();
    const out = run('/repo/.git/worktrees/boh-prepush-abc', '/repo/.git');

    expect(out).toContain('linked worktree');
    expect(readdirSync(hooks)).toEqual([]);
  });

  it('主检出（git-dir == common-dir）照常安装 pre-commit / pre-push', () => {
    const { hooks, run } = makeSandbox();
    run('/repo/.git', '/repo/.git');

    // 软链目标指向仓库源文件：断链即「已失效」，用 existsSync 跟随校验
    for (const name of ['pre-commit', 'pre-push']) {
      const dst = join(hooks, name);
      expect(existsSync(dst), `${name} 应已安装且软链有效`).toBe(true);
    }
  });
});
