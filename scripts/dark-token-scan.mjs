// 暗色字面量盘点（出报告用）。
// 计数口径的**单一实现**在 scripts/lib/dark-token-counter.mjs —— 与棘轮门禁
// scripts/check-dark-tokens.mjs 共用，保证两边永远是同一个数。
//
// 用法：
//   node scripts/dark-token-scan.mjs          只扫 git 已跟踪文件（与棘轮门禁同一口径）
//   node scripts/dark-token-scan.mjs --all    连未跟踪文件一起扫（审计本地 in-flight 修改）
import { scanDarkTokens } from './lib/dark-token-counter.mjs';

const tracked = !process.argv.includes('--all');

const {
  filesScanned,
  darkLiterals,
  darkFiles,
  literalPerFile,
  importantTotal,
  hexCount,
  rgbaCount,
} = scanDarkTokens({ tracked });

const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const fmt = (m, n, f = (k, v) => `${v}×${k}`) => top(m, n).map(([k, v]) => f(k, v)).join('  ');

console.log('files scanned        :', filesScanned, tracked ? '(git 已跟踪)' : '(含未跟踪)');
console.log('dark color literals  :', darkLiterals, 'across', darkFiles.length, 'files');
console.log(
  'per-file top 12      :',
  top(literalPerFile, 12)
    .map(([k, v]) => `${v} ${k}`)
    .join('\n                         ')
);
console.log('\ntop hex inside dark  :', fmt(hexCount, 22));
console.log('\ndistinct hex        :', hexCount.size);
console.log('distinct dark SURFACE hex (background-ish, L<=40%):');

const isDarkish = (h) => {
  let x = h.slice(1);
  if (x.length === 3) x = x.split('').map((c) => c + c).join('');
  if (x.length !== 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return (mx + mn) / 2 <= 0.28 && (hexCount.get(h) || 0) >= 2;
};

const surf = [...hexCount.entries()].filter(([h]) => isDarkish(h)).sort((a, b) => b[1] - a[1]);
console.log('  count', surf.length, '->', surf.slice(0, 30).map(([k, v]) => `${v}×${k}`).join('  '));
console.log('\ntop rgba() inside dark:', fmt(rgbaCount, 14, (k, v) => `${v}×${k.replace(/\s+/g, '')}`));
console.log('\n!important in dark decls:', importantTotal);
