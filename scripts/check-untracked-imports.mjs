#!/usr/bin/env node
/**
 * check-untracked-imports.mjs — 漏交防线：被引用的源文件必须在 git 跟踪集合里。
 *
 * 背景（2026-10-17/18）：DataAdmin.vue 引用 resolveInitialAdminTab.js，但该文件
 * 是并行会话留下的**未跟踪文件**，随提交推上去后 CI vite build
 * `Could not resolve` → Deploy 三连红。这类「本地能跑、推上去构建炸」的漏交，
 * doc-truth / self-test / lock 同步都拦不住（它们各管一摊），只有构建失败后才现形。
 *
 * 本检查的判据：**磁盘上存在、git 未跟踪、且不被 .gitignore 忽略**的文件，
 * 只要被任何已跟踪源文件的 import/@import 引用 → 红（推送必然构建失败）。
 * 报错文案给出两条出路：提交它，或确认它不该被引用。
 *
 * 纪律对齐：宁报勿漏。并行会话在途的「新文件 + 引用它的在途改动」会报——
 * 那正是「若现在推送就会构建失败」的准确预告；提交后自然转绿。
 *
 * 运行：node scripts/check-untracked-imports.mjs（verify 链内 + prepush --quick）
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

const git = (args) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 }).trim();

// 被跟踪的源文件（只扫这些的 import —— 未跟踪文件自己的引用不产生新信息）
const tracked = new Set(git(['ls-files']).split('\n'));
const trackedSources = [...tracked]
  .filter((f) => /^src\/.+\.(vue|js|mjs|ts|tsx|jsx|scss|css)$/.test(f))
  .filter((f) => existsSync(join(ROOT, f)));

// gitignore 判定：被忽略的未跟踪文件（构建产物等）不是「漏交」
const isIgnored = (rel) => {
  try {
    git(['check-ignore', '-q', rel]);
    return true; // exit 0 = 被忽略
  } catch {
    return false;
  }
};

// import 目标解析：无后缀名时按 Vite/TS 解析顺序猜后缀
const CANDIDATES = [
  '',
  '.js',
  '.mjs',
  '.ts',
  '.tsx',
  '.vue',
  '.json',
  '.css',
  '.scss',
  '/index.js',
  '/index.ts',
  '/index.vue',
];

const violations = [];

// import 提取正则：静态 import/export-from、动态 import()、css @import、vue <script src>
// 只取引号内的路径，路径必须以 ./ ../ 或 @/ 开头（裸包名是依赖，不管）
// 分支：① 静态/重导出（from）② 动态 import() ③ **side-effect 裸 import**（无 from，
// self-test 的注入样本用的就是它——漏掉会让 fixture 永远无法自证）④ css @import
const IMPORT_RE =
  /(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]|@import\s+(?:url\()?['"]([^'"]+)['"]/g;

for (const file of trackedSources) {
  const abs = join(ROOT, file);
  const content = readFileSync(abs, 'utf8');
  for (const m of content.matchAll(IMPORT_RE)) {
    const spec = m[1] || m[2] || m[3] || m[4]; // side-effect 分支落在 m[3]
    if (!spec) continue;
    if (!/^\.\.?\//.test(spec) && !spec.startsWith('@/')) continue;

    let base;
    if (spec.startsWith('@/')) base = join('src', spec.slice(2));
    else base = join(dirname(file), spec).replace(/\\/g, '/');

    // 命中判定：任一后缀候选「磁盘存在 + 未跟踪 + 未被忽略」即违规
    for (const suffix of CANDIDATES) {
      const rel = base + suffix;
      if (!existsSync(join(ROOT, rel))) continue;
      let isDir = false;
      try {
        isDir = statSync(join(ROOT, rel)).isDirectory();
      } catch {}
      if (isDir) continue;
      if (tracked.has(rel)) break; // 已跟踪：合法引用，本条 spec 结束
      if (isIgnored(rel)) break; // 被忽略（产物）：不算漏交
      violations.push({ from: file, spec, missing: rel });
      break;
    }
  }
}

if (violations.length) {
  console.error(`❌ 漏交防线：${violations.length} 个被引用的文件不在 git 跟踪集合里 —— 推送后 CI 构建必红：`);
  for (const v of violations.slice(0, 20)) {
    console.error(`   · ${v.missing}`);
    console.error(`     ↳ 被 ${v.from} 引用（'${v.spec}'）`);
  }
  if (violations.length > 20) console.error(`   …以及另外 ${violations.length - 20} 个`);
  console.error('   修法：git add <文件> 与引用方一起提交；或移除该引用。');
  process.exit(1);
}

console.log(`✅ 漏交防线通过：${trackedSources.length} 个已跟踪源文件的 import 全部落在跟踪集合内。`);
