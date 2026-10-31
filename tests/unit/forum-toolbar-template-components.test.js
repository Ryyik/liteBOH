import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { squeezeSource, stripComments } from '../helpers/source.js';

// ─────────────────────────────────────────────────────────────────────────────
// ForumToolbar 模板组件守卫（2026-10-31 事故）：
// 4a8f3699 重构时把 `Search` 从 lucide 导入里删了，但同提交引入的 hero 圆形搜索钮
// 模板里仍写着 <Search />。Vue 对未导入的 PascalCase 标签按「未知原生元素」渲染成
// 空的 <search>，不报编译错、lint 也不红 ⇒ 用户看到「黑圆钮里没有放大镜」。
// 本守卫通则化：模板里出现的每个 PascalCase 组件标签，必须出现在 script 的导入
// 绑定里（Vue 内置组件白名单除外）。防的是「删导入漏改模板」这一整类洞。
// ⚠️ 归一用 tests/helpers/source.js（prettier 会重排源码，别做逐字断言）。
// ─────────────────────────────────────────────────────────────────────────────

const read = (relPath) => readFileSync(resolve(import.meta.dirname, '../..', relPath), 'utf8');
const SOURCE = 'src/views/Forum/components/ForumToolbar.vue';

// Vue 内置（可不经导入直接用的组件形态）
const BUILTIN_COMPONENTS = new Set([
  'Transition',
  'TransitionGroup',
  'KeepAlive',
  'Teleport',
  'Suspense',
]);

const extractImportedBindings = (script) => {
  const bindings = new Set();
  for (const m of script.matchAll(/import\s*\{([^}]+)\}\s*from/g)) {
    for (const name of m[1].split(',')) {
      const cleaned = name
        .trim()
        .split(/\s+as\s+/)
        .pop()
        .trim();
      if (cleaned) bindings.add(cleaned);
    }
  }
  for (const m of script.matchAll(/import\s+([A-Z][A-Za-z0-9]*)\s+from/g)) {
    bindings.add(m[1]);
  }
  return bindings;
};

describe('ForumToolbar 模板组件守卫', () => {
  it('模板里用到的每个 PascalCase 组件都已被导入（导入与模板不许脱节）', () => {
    const raw = read(SOURCE);
    const source = squeezeSource(stripComments(raw));
    const scriptMatch = source.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    expect(scriptMatch, '组件文件应含 <script> 段').toBeTruthy();
    const templateMatch = source.match(/<template>([\s\S]*)<\/template>/);
    expect(templateMatch, '组件文件应含 <template> 段').toBeTruthy();

    const imported = extractImportedBindings(scriptMatch[1]);
    const usedComponents = new Set(
      [...templateMatch[1].matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)].map((m) => m[1]),
    );

    const missing = [...usedComponents].filter(
      (name) => !BUILTIN_COMPONENTS.has(name) && !imported.has(name),
    );
    expect(missing, `模板使用了未导入的组件: ${missing.join(', ')}`).toEqual([]);
  });

  it('hero 搜索按钮的 Search 图标在导入清单里（本次事故的直接断言）', () => {
    const source = squeezeSource(stripComments(read(SOURCE)));
    expect(source).toMatch(/<Search\s/); // 模板确实在用
    expect(source).toMatch(/import\s*\{[^}]*\bSearch\b[^}]*\}\s*from\s*['"]lucide-vue-next['"]/);
  });
});
