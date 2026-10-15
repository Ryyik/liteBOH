#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('src');
const ignored = new Set(['node_modules', 'dist']);
const extensions = /\.(css|scss|vue)$/;
const violations = [];

/* ── 折射级（2026-10-14 §21.11）：材质与实例都要收口 ──────────────────────────
   折射级的材质来自 `@wxperia/liquid-glass-vue`（JS 内联），**不经过** `--liquid-filter-*`
   ⇒ 上面那组「材质串」正则扫不到它。这里补两条它专属的规则 —— 否则「站点级单源登记」
   只是个说法，没有任何门禁兜底（本仓吃过「检查在跑、但永远绿」的亏，见 AGENTS.md）。 */
const REFRACT_PKG = '@wxperia/liquid-glass-vue';
const REFRACT_COMPONENT = path.join('components', 'ui', 'BohGlassRefract.vue');
/** 每个 .vue（≈每棵页面/组件树）允许的折射实例上限：每实例一个 SVG filter，批量上会拖垮合成 */
const REFRACT_INSTANCE_BUDGET = 6;

const walk = (dir) => {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && extensions.test(entry.name)) {
      const source = readFileSync(file, 'utf8');
      const patterns = [
        /--glass-filter-(?:light|medium|heavy)\s*:\s*var\(--glass-filter-/,
        /blur\(18px\)\s+saturate\(180%\)\s+brightness\(1\.02\)/,
        /blur\(28px\)\s+saturate\(180%\)\s+brightness\(1\.02\)/,
        /blur\(36px\)\s+saturate\(180%\)\s+brightness\(1\.02\)/,
      ];
      const isLiquidImplementation = file.endsWith(path.join('common', 'liquid-glass.css'));
      if (!isLiquidImplementation) {
        patterns.push(/(?:-webkit-)?backdrop-filter\s*:\s*blur\((?:1[4-9]|[2-9]\d)px\)/);
      }
      patterns.forEach((pattern) => {
        if (pattern.test(source))
          violations.push(`${path.relative(process.cwd(), file)}: ${pattern}`);
      });

      /* ── 折射级两条规则（只对 .vue 生效）── */
      if (file.endsWith('.vue')) {
        const rel = path.relative(process.cwd(), file);
        // ① 单源：只有共享组件可以 import 那个包；别处出现 = 第二材质源
        if (source.includes(REFRACT_PKG) && !file.endsWith(REFRACT_COMPONENT)) {
          violations.push(
            `${rel}: 折射级材质只允许在 src/components/ui/BohGlassRefract.vue 里引用（第二材质源）`,
          );
        }
        // ② 实例预算：剥掉 HTML 注释再数（注释里的示例不该计数）
        const template = source.replace(/<!--[\s\S]*?-->/g, '');
        const count = (template.match(/<BohGlassRefract\b/g) || []).length;
        if (count > REFRACT_INSTANCE_BUDGET) {
          violations.push(
            `${rel}: 折射级实例 ${count} 个 > 预算 ${REFRACT_INSTANCE_BUDGET}（每实例一个 SVG filter）`,
          );
        }
      }
    }
  }
};

walk(root);

if (violations.length) {
  console.error('[check:liquid-glass] Found duplicate glass material definitions:');
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exitCode = 1;
} else {
  console.log('[check:liquid-glass] Liquid Glass material checks passed.');
}
