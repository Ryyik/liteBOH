#!/usr/bin/env node
/**
 * check-shell-grep.mjs — 拦截「会在 toybox shim 上静默 0 命中的 grep」
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────
 * 本环境 PATH 上的 `grep` 是 WorkBuddy CLI 的 **toybox shim**（既不是 BSD 也不是 GNU），
 * 它缺 BRE 交替 `\|` 和 GNU 扩展 `\s`/`\w`/`\d`/`\b` —— 而且**静默失败**：
 * 不报错、返回 1，看起来就是「没有匹配」。2026-10-15 一天之内本仓库的会话
 * 被这条坑咬了 3 次（其中一次发生在「正在查这条坑的文档」的命令里）。
 *
 * 咬在 AI 的手写命令上，最多浪费几分钟；咬在 **CI workflow / 构建脚本** 里，
 * 就是一条**永远绿的检查** —— 它持续签发「已验证」的假签名，正是本仓库
 * `gate-fixtures.mjs` 头注里写的那类事故。
 *
 * 所以这道门禁只扫「会被真实执行的面」：
 *   · `.github/workflows/*.yml|yaml`（CI 每条都跑）
 *   · `scripts/*.sh`（npm script 直接 bash 执行）
 *   · `package.json` 的 scripts 值（npm run 原样交给 shell）
 *
 * 判定（保守优先：宁可漏一个假阳性低的，也别误伤正常使用）：
 *   · 行里出现裸 `grep`（不是 `/usr/bin/grep`、不是 `egrep`、不是注释行）
 *   · 且其模式里含 shim 会静默吞掉的构造 —— `\|`（BRE 交替）、`\s`/`\w`/`\d`/`\b`
 *     （GNU 扩展，**加 `-E` 也救不了**）、`\+`/`\?`（BRE 量词扩展）
 *   · 命中即 exit 1，并给出「这行在这里会静默失败」的逐条证据。
 *
 * 正确写法（门禁不会拦）：
 *   · `grep -E 'a|b'`（裸交替）· `grep -E 'a[[:space:]]b'`（POSIX 类）· `grep -F '字面量'`
 *   · 富正则直接 `/usr/bin/grep`（系统自带的 BSD grep 反而全功能，实测 2026-10-15）
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

/** shim 上会静默吞掉的构造（匹配源码里的字面序列）。 */
const BAD_SEQS = [
  { re: /\\\|/, label: 'BRE 交替 \\|' },
  { re: /\\s/, label: 'GNU 扩展 \\s（-E 也救不了）' },
  { re: /\\w/, label: 'GNU 扩展 \\w（-E 也救不了）' },
  { re: /\\d/, label: 'GNU 扩展 \\d（-E 也救不了）' },
  { re: /\\b/, label: 'GNU 扩展 \\b（-E 也救不了）' },
  { re: /\\\+/, label: 'BRE 量词扩展 \\+' },
  { re: /\\\?/, label: 'BRE 量词扩展 \\?' },
];

const isComment = (line) => /^\s*#/.test(line) || /^\s*\/\//.test(line);
const invokesShimGrep = (line) =>
  /\bgrep\b/.test(line) &&
  !/\/usr\/bin\/grep/.test(line) &&
  !/\begrep\b/.test(line) &&
  !isComment(line);

/** 收集一个文本里的违规：返回 [{ at, line, hits }]。 */
const scanText = (label, text) => {
  const out = [];
  text.split('\n').forEach((raw, i) => {
    if (!invokesShimGrep(raw)) return;
    const hits = BAD_SEQS.filter(({ re }) => re.test(raw)).map(({ label: l }) => l);
    if (hits.length) out.push({ at: `${label}:${i + 1}`, line: raw.trim(), hits });
  });
  return out;
};

const violations = [];

// 1) CI workflows
const wfDir = join(ROOT, '.github', 'workflows');
if (existsSync(wfDir)) {
  for (const f of readdirSync(wfDir)) {
    if (!/\.(yml|yaml)$/.test(f)) continue;
    violations.push(...scanText(`.github/workflows/${f}`, readFileSync(join(wfDir, f), 'utf8')));
  }
}

// 2) shell 脚本（npm script 直接 bash 执行的那些）
for (const f of readdirSync(join(ROOT, 'scripts'))) {
  if (!f.endsWith('.sh')) continue;
  violations.push(...scanText(`scripts/${f}`, readFileSync(join(ROOT, 'scripts', f), 'utf8')));
}

// 3) package.json 的 scripts 值（npm run 原样交给 shell）
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
  violations.push(...scanText(`package.json#scripts.${name}`, cmd));
}

if (violations.length) {
  console.error(`❌ 发现 ${violations.length} 处「会在 toybox shim 上静默 0 命中」的 grep：\n`);
  for (const v of violations) {
    console.error(`   ${v.at}`);
    console.error(`     ${v.line}`);
    console.error(`     ⚠️ ${v.hits.join('、')}`);
  }
  console.error(`\n修法（任选其一，按复杂度升序）：`);
  console.error(`   · 交替用裸 | 并加 -E：grep -E 'a|b'`);
  console.error(`   · 空白/词边界用 POSIX 类：grep -E 'a[[:space:]]b'`);
  console.error(`   · 字面量用 -F；富正则直接用 /usr/bin/grep（全功能）`);
  process.exit(1);
}

console.log('✅ check:shell-grep 通过：可执行 shell 面没有 shim 上会静默失败的 grep。');
