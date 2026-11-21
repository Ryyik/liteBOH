#!/usr/bin/env node
/**
 * check-doc-links.mjs — 文档相对链接的存在性门禁
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────
 * 这个仓库的文档是**资产**（AGENTS.md §1 把 docs/ 当必读通道），而文档之间的引用
 * 全是相对路径。搬目录、改名、删旧报告都不会报错 —— 链接只是在读者点下去时 404。
 * 2026-11-21 复核时 docs/ 根下平铺 97 个 md，正要按主题归拢：**没有这条门禁，
 * 搬迁就是一次静默的批量失链**。所以先有检查、再搬。
 *
 * ── 口径（刻意写窄，避免假阳性）────────────────────────────────────
 *   · 只查**被 git 跟踪**的 md：根目录 `*.md`、`docs/**`、`plans/**`。
 *     `.workbuddy/memory/` 是历史日志（记录"当时"的事实），不查 —— 改历史日志
 *     比失链更糟。
 *   · 只查**行内链接** `[text](target)`；`![img](src)` 同样检查。
 *   · 跳过：外链（http/https/mailto/tel/data）、纯锚点（`#xxx`）、空链接。
 *   · 跳过**代码块与行内代码**：文档里大量「示例写法」本身就是 `[x](y)` 形态，
 *     查它们只会制造噪声（噪声一多，门禁就会被习惯性绕过）。
 *
 * ── 为什么不是棘轮而是硬门禁 ────────────────────────────────────────
 * 存量失链数在 2026-11-21 首次跑时就很低（见下方首跑记录）；对一个"本来就干净"
 * 的集合，棘轮只会变成"允许新增一点点坏"，而修一条链接的成本是秒级。
 *
 * 用法：
 *   node scripts/check-doc-links.mjs            # 判红模式
 *   node scripts/check-doc-links.mjs --json     # 机读出口（供 check-ratchet-summary 汇总）
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const JSON_OUT = process.argv.includes('--json');

/**
 * ⚠️ 这里刻意用**文件系统**而不是 `git ls-files`（与 check-doc-truth 相反）：
 * 失链是"提交后才 404"的问题，越早发现越好 —— 未 `git add` 的新文档也该被查。
 * 同时这也让 `check:gates-self-test` 能用**临时文件**造违规样本（未跟踪文件在
 * `git ls-files` 口径下根本不可见，门禁会假绿）。
 */
const walk = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md')) out.push(relative(ROOT, p));
  }
  return out;
};

const files = [
  ...readdirSync(ROOT)
    .filter((n) => n.endsWith('.md'))
    .map((n) => n),
  ...walk(join(ROOT, 'docs')),
  ...walk(join(ROOT, 'plans')),
].sort();

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const LINK_RE = /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;

/** 去掉行内代码（`...`），避免把示例写法当链接。 */
const stripInlineCode = (line) => line.replace(/`[^`]*`/g, '');

const problems = [];
let checkedLinks = 0;

for (const rel of files) {
  const abs = join(ROOT, rel);
  const text = readFileSync(abs, 'utf8');
  const lines = text.split('\n');
  let inFence = false;

  lines.forEach((rawLine, i) => {
    if (/^\s*(```|~~~)/.test(rawLine)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const line = stripInlineCode(rawLine);
    for (const m of line.matchAll(LINK_RE)) {
      const target = m[1].trim();
      if (!target || target.startsWith('#')) continue;
      if (EXTERNAL.test(target)) continue;

      // 去掉锚点与查询串，再做 URL 解码（中文路径常写成 %E4%B8%AD…）
      const bare = target.split('#')[0].split('?')[0];
      if (!bare) continue;
      let decoded = bare;
      try {
        decoded = decodeURIComponent(bare);
      } catch {
        /* 非法转义就按原样比对 */
      }

      const resolved = decoded.startsWith('/')
        ? join(ROOT, decoded)
        : resolve(dirname(abs), decoded);
      checkedLinks += 1;

      if (!existsSync(resolved)) {
        problems.push({ file: rel, line: i + 1, target });
        continue;
      }
      // 目录链接要求真的存在（existsSync 已覆盖）；文件链接顺带排除"指向自己"
      if (statSync(resolved).isFile() && resolve(abs) === resolved) continue;
    }
  });
}

if (JSON_OUT) {
  console.log(JSON.stringify({ files: files.length, links: checkedLinks, problems }, null, 2));
} else if (problems.length) {
  console.error(
    `❌ 文档失链：${problems.length} 处（共检查 ${files.length} 个 md / ${checkedLinks} 条链接）`,
  );
  for (const p of problems) console.error(`   · ${p.file}:${p.line} → ${p.target}`);
  console.error('\n修法：改链接，或把文件补回；若链接指向的是本该删除的东西，删掉这条引用。');
} else {
  console.log(`✅ 文档链接完整：${files.length} 个 md / ${checkedLinks} 条相对链接全部可达`);
}

process.exit(problems.length ? 1 : 0);
