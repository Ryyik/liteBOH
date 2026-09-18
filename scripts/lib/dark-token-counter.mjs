/**
 * dark-token-counter.mjs — 暗色字面量计数的**单一实现**
 *
 * 背景：全站暗色样式以裸色值为主（token 化率约 9%），而每加一个裸值都要在
 * 90 个文件里重新对齐，导致"一次调色改 ≈2800 处"。为了能棘轮式收敛，需要
 * 一个稳定、可复现的计数口径。
 *
 * 口径（brace-depth 扫描）：把注释剥成等长空白后，按花括号深度判断某条声明
 * 是否位于"暗色规则块"内；暗色块的判定 = 该块或其任一祖先块的 prelude 命中
 *   [data-theme="dark"] / [data-boh-theme="dark"] / .dark-mode
 * 位于暗色块内的声明里，每个颜色字面量（#hex / rgb() / rgba() / hsl() /
 * white / black）计 1；!important 单独计数。
 *
 * 被 scripts/dark-token-scan.mjs（出报告）与 scripts/check-dark-tokens.mjs
 * （棘轮门禁）共用 —— 两边必须永远给出同一个数，不要各自实现一份。
 */
import { readFileSync, globSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|\b(?:white|black)\b/g;
const DARK = /\[data-theme=["']?dark|\[data-boh-theme=["']?dark|\.dark-mode/;

/**
 * 列出待扫描文件（相对 cwd）。
 *
 * 默认只取 **git 已跟踪** 的 src/**\/*.{css,scss,vue}，与 check-important-budget.mjs 同款：
 *   - 同一份代码在任何机器 / CI 上给同一个数（本地 in-flight 的未跟踪文件不会让基线漂移）；
 *   - PR 里新增的文件在 CI 上是已跟踪的，照样被门禁拦住。
 * tracked: false 时退化为 globSync 全量扫描（审计用，能看见尚未入库的文件）。
 */
export function listDarkScanFiles({ root = process.cwd(), files, tracked = true } = {}) {
  if (files) return files;
  if (tracked) {
    return execSync('git ls-files "src/**/*.css" "src/**/*.scss" "src/**/*.vue" "src/*.css"', {
      cwd: root,
      encoding: 'utf-8',
    })
      .split('\n')
      .filter(Boolean)
      .filter((f) => !f.includes('node_modules'));
  }
  return globSync('src/**/*.{css,scss,vue}', { cwd: root, recursive: true, nodir: true })
    .filter((f) => !f.includes('node_modules'));
}

/**
 * @returns {{
 *   filesScanned: number,
 *   darkLiterals: number,
 *   darkFiles: string[],
 *   literalPerFile: Map<string, number>,
 *   importantPerFile: Map<string, number>,
 *   importantTotal: number,
 *   hexCount: Map<string, number>,
 *   rgbaCount: Map<string, number>,
 * }}
 */
export function scanDarkTokens({ root = process.cwd(), files, tracked = true } = {}) {
  const list = listDarkScanFiles({ root, files, tracked });

  let darkLiterals = 0;
  let importantTotal = 0;
  const darkFiles = new Set();
  const hexCount = new Map();
  const rgbaCount = new Map();
  const literalPerFile = new Map();
  const importantPerFile = new Map();

  for (const f of list) {
    let src;
    try {
      src = readFileSync(path.join(root, f), 'utf8');
    } catch {
      continue;
    }
    // 注释剥成等长空白：既不影响括号深度，也不会把注释里的色值算进来
    src = src.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));

    let depth = 0;
    const stack = [];
    let prelude = '';
    let inDark = false;
    let darkDepthAtEntry = -1;

    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch === '{') {
        depth++;
        const isDark = inDark || DARK.test(prelude);
        stack.push(isDark);
        if (isDark && darkDepthAtEntry === -1) darkDepthAtEntry = depth;
        prelude = '';
      } else if (ch === '}') {
        stack.pop();
        depth--;
        if (depth < darkDepthAtEntry) darkDepthAtEntry = -1;
        prelude = '';
      } else if (depth === 0) {
        prelude += ch;
      } else if (ch === ';') {
        const decl = prelude;
        prelude = '';
        const dark = stack[stack.length - 1] || darkDepthAtEntry !== -1;
        if (!dark) continue;
        if (/!important/.test(decl)) {
          importantPerFile.set(f, (importantPerFile.get(f) || 0) + 1);
          importantTotal++;
        }
        const lits = decl.match(COLOR) || [];
        if (lits.length) {
          darkFiles.add(f);
          literalPerFile.set(f, (literalPerFile.get(f) || 0) + lits.length);
          darkLiterals += lits.length;
          for (const l of lits) {
            if (l.startsWith('#')) hexCount.set(l.toLowerCase(), (hexCount.get(l.toLowerCase()) || 0) + 1);
            else rgbaCount.set(l, (rgbaCount.get(l) || 0) + 1);
          }
        }
      } else {
        prelude += ch;
      }
    }
  }

  return {
    filesScanned: list.length,
    darkLiterals,
    darkFiles: [...darkFiles].sort(),
    literalPerFile,
    importantPerFile,
    importantTotal,
    hexCount,
    rgbaCount,
  };
}
