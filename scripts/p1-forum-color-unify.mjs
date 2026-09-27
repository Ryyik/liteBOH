#!/usr/bin/env node
/**
 * P1 语义色单源化脚本（一次性迁移工具，v2：原位替换，不动空白结构）
 * 只做「值完全相等」的替换，浅色零视觉变化：
 *   color: #1d1d1f               -> var(--liquid-text-primary)
 *   color: #6e6e73               -> var(--liquid-text-secondary)
 *   color: #8b9098               -> var(--liquid-text-tertiary)
 *   border* rgba(15,23,42,.06)   -> var(--liquid-border-hairline)
 *   border* rgba(255,255,255,.65)-> var(--liquid-border)
 *   background rgba(255,255,255,.72)（整值）-> var(--liquid-bg)
 * 保护区（原样保留，绝不改写）：
 *   - 选择器含 data-theme="dark" 的规则体（含嵌套）
 *   - @keyframes 体
 *   - /* *\/ 块注释
 *   - 自定义属性（--x）声明
 * 用法：node scripts/p1-forum-color-unify.mjs [--dry]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILES = [
  'base',
  'composer',
  'feed',
  'replies-responsive',
  'drawers-skeletons',
  'anniversary',
  'weekly-report',
].map((f) => `src/views/Forum/styles/${f}.css`);
const DRY = process.argv.includes('--dry');

/** 收集需保护的字节区间 [start, end) */
function collectProtected(css) {
  const ranges = [];
  // 块注释
  for (const m of css.matchAll(/\/\*[\s\S]*?\*\//g)) ranges.push([m.index, m.index + m[0].length]);
  // 规则体（栈式扫描，正确处理嵌套）
  const stack = [];
  let preludeStart = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      stack.push({ bodyStart: i + 1, prelude: css.slice(preludeStart, i) });
      preludeStart = i + 1;
    } else if (ch === '}') {
      const top = stack.pop();
      preludeStart = i + 1;
      if (!top) continue;
      const prelude = top.prelude.trim();
      const isDark = /data-theme\s*=\s*["']?dark/.test(prelude);
      const isKeyframes = /^@(-[a-z]+-)?keyframes\b/.test(prelude);
      if (isDark || isKeyframes) ranges.push([top.bodyStart, i]);
    }
  }
  return ranges;
}

function inProtected(ranges, pos) {
  for (const [s, e] of ranges) if (pos >= s && pos < e) return true;
  return false;
}

const BORDER_PROP =
  /^(border(-top|-right|-bottom|-left)?(-color|-width|-style)?|outline(-color)?|border-inline-start|border-inline-end)$/;

function applyReplacements(css, ranges, stat) {
  return css.replace(/([a-zA-Z-]+)\s*:\s*[^;{}]+/g, (m0, prop, offset) => {
    if (inProtected(ranges, offset)) return m0;
    // 已 token 化的声明（含 var(--liquid-*)）整条跳过，保留既有「变量+字面量兜底」惯例
    if (/var\(--liquid-/.test(m0)) return m0;
    const p = prop.toLowerCase();
    let v = m0;
    const sub = (re, to) => {
      v = v.replace(re, to);
    };
    if (p === 'color') {
      sub(/#1d1d1f\b/gi, 'var(--liquid-text-primary, #1d1d1f)');
      sub(/#6e6e73\b/gi, 'var(--liquid-text-secondary, #6e6e73)');
      sub(/#8b9098\b/gi, 'var(--liquid-text-tertiary, #8b9098)');
    } else if (BORDER_PROP.test(p)) {
      sub(
        /rgba\(15,\s*23,\s*42,\s*0\.06\)/gi,
        'var(--liquid-border-hairline, rgba(15, 23, 42, 0.06))',
      );
      sub(
        /rgba\(255,\s*255,\s*255,\s*0\.65\)/gi,
        'var(--liquid-border, rgba(255, 255, 255, 0.65))',
      );
    } else if (p === 'background' || p === 'background-color') {
      // 仅整值玻璃白（值锚定 ^$），避免动渐变/复合值
      sub(
        /^([a-zA-Z-]+):\s*rgba\(255,\s*255,\s*255,\s*0\.72\)$/i,
        '$1: var(--liquid-bg, rgba(255, 255, 255, 0.72))',
      );
    }
    if (v !== m0) stat.count++;
    return v;
  });
}

const stat = { count: 0 };
for (const f of FILES) {
  const css = readFileSync(f, 'utf8');
  const ranges = collectProtected(css);
  const next = applyReplacements(css, ranges, stat);
  if (!DRY && next !== css) writeFileSync(f, next);
  console.log(DRY ? '[dry] ' : '[ok]  ', f, `(保护区 ${ranges.length} 段)`);
}
console.log(DRY ? '预计替换声明数:' : '实际替换声明数:', stat.count);
