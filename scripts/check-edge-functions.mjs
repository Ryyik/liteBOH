#!/usr/bin/env node
/**
 * check-edge-functions.mjs — 本地预验 Edge Functions 的类型（deno check 封装）
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────
 * 本仓的 EF 类型检查只存在于 CI（`.github/workflows/deno-check.yml`，**阻断门禁**）。
 * 本地过去用 esbuild 做「语法检查」顶替，但 **esbuild 只删类型、不查类型**：
 * 2026-10-29 实测就漏了一个 —— `runtimeChatCompletion` 的返回被 TS 推断成
 * 「成功无 message / 失败有 message」的联合体，调用点的 `result.message` 类型不存在，
 * esbuild 全绿，`deno check` 当场红。这类错只有真类型检查能拦。
 *
 * ── 为什么是一层封装，不直接写 `deno check` ──────────────────────────
 * **deno 装好了也不在 PATH 上**：官方安装脚本把它放在 `~/.deno/bin/deno`，
 * 而非交互式 shell（CI、Agent 工具调用的那种）不会加载 `~/.zshrc` 里那行 export
 * ⇒ `command -v deno` 空、`deno check` 报 command not found（2026-10-29 实测）。
 * 本脚本按 `DENO_BIN` → `~/.deno/bin/deno` → PATH 的顺序自己找。
 *
 * ── 刻意不进 verify 主链 ────────────────────────────────────────────
 * `deno check` 要联网解析 `npm:@supabase/supabase-js@2` 等外部说明符（首次）。
 * 本地有 DENO_DIR 缓存时是离线的，但 CI/新机器冷缓存必联网 ⇒ 放进 verify 会把
 * 「网络抖动」变成「门禁红」。CI 的 deno-check.yml 是最终裁定，这里只做推送前预验。
 *
 * 用法：
 *   npm run check:ef                 # 检查 supabase/functions/*\/index.ts 全部
 *   npm run check:ef -- --only=vault # 只跑名字含 vault 的（子串匹配）
 *   DENO_BIN=/path/to/deno npm run check:ef
 *
 * ⚠️ 找不到 deno **必须 fail 而不是跳过** —— 「找不到就跳过」是假绿温床（本仓纪律）。
 */
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const FN_DIR = join(ROOT, 'supabase', 'functions');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length) : '';

/** deno 查找顺序：显式指定 > 官方安装位置 > PATH。 */
const resolveDeno = () => {
  const explicit = process.env.DENO_BIN;
  if (explicit && existsSync(explicit)) return explicit;
  const installed = join(homedir(), '.deno', 'bin', 'deno');
  if (existsSync(installed)) return installed;
  const onPath = spawnSync('sh', ['-c', 'command -v deno'], { encoding: 'utf-8' });
  const found = (onPath.stdout || '').trim();
  return found || null;
};

const deno = resolveDeno();
if (!deno) {
  console.error(
    [
      '[check:ef] ❌ 没找到 deno —— 无法本地预验 EF 类型。',
      '',
      '   装：curl -fsSL https://deno.land/install.sh | sh',
      '   或指定：DENO_BIN=/path/to/deno npm run check:ef',
      '',
      '   ⚠️ 这里刻意判失败而不是跳过：跳过会给出「本地绿」的错觉，',
      '      而 CI 的 deno-check.yml 是阻断门禁，推上去照样红。',
    ].join('\n'),
  );
  process.exit(1);
}

const version = spawnSync(deno, ['--version'], { encoding: 'utf-8' });
console.log(`[check:ef] deno = ${deno}  (${(version.stdout || '').split('\n')[0] || '版本未知'})`);

const targets = readdirSync(FN_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .map((d) => d.name)
  .filter((name) => (only ? name.includes(only) : true))
  .filter((name) => existsSync(join(FN_DIR, name, 'index.ts')))
  .sort();

if (!targets.length) {
  console.error(`[check:ef] ❌ 没有匹配的 Edge Function（--only=${only || '无'}）。`);
  process.exit(1);
}

const failures = [];
for (const name of targets) {
  const file = join('supabase', 'functions', name, 'index.ts');
  const started = Date.now();
  const res = spawnSync(deno, ['check', file], { cwd: ROOT, encoding: 'utf-8' });
  const ms = Date.now() - started;
  const output = `${res.stdout || ''}${res.stderr || ''}`.trim();
  if (res.status === 0) {
    console.log(`  ✅ ${name.padEnd(28)} ${ms}ms`);
  } else {
    failures.push({ name, output });
    console.log(`  ❌ ${name.padEnd(28)} ${ms}ms`);
  }
}

if (failures.length) {
  console.error(`\n[check:ef] ${failures.length}/${targets.length} 个 EF 类型检查失败：\n`);
  for (const f of failures) {
    console.error(`──── ${f.name} ────`);
    console.error(f.output || '（deno 无输出，退出码非 0）');
    console.error('');
  }
  process.exit(1);
}

console.log(`\n[check:ef] ${targets.length} 个 Edge Function 类型检查通过。`);
