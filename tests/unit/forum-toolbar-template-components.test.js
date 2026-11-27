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

// ─────────────────────────────────────────────────────────────────────────────
// 横屏细条几何守卫（2026-11-26 用户报障：「圆角不统一所以很丑」+「按钮应该放最右侧」）
//
// 两条都是**看起来像设计问题、其实是布局/取值错**的洞，且都不会让任何门禁变红：
//   ① 圆角：GlassPillButton 的默认曲率是 14px（卡片圆角）。它被放进 999px 的细条里，
//      与旁边 50% 的圆形搜索钮并排 —— 三者曲率各不相同，肉眼读成「拼贴」。
//      细条内必须显式覆盖成 999px（与容器同级曲率）。
//   ② 位置：≥1024 档的 `.toolbar-search-wrapper` 曾写 `flex: none`，wrapper 收缩到
//      输入框固有宽度（实测 680px 的条里只有 220px），右侧动作组停在 x≈792，
//      后面留 312px 空档 —— 用户看到的是「按钮悬在条中间」。必须 flex:1 撑满。
// ⚠️ 断言用归一后的源码（squeezeSource），不要逐字匹配缩进/换行。
// ─────────────────────────────────────────────────────────────────────────────
describe('ForumToolbar 横屏细条几何（圆角统一 + 按钮贴右）', () => {
  /** 取出 ≥1024 媒体查询块的源码（工具栏横屏档唯一落点） */
  const wideBlock = () => {
    const source = squeezeSource(stripComments(read(SOURCE)));
    const i = source.indexOf('@media (min-width: 1024px)');
    expect(i, '应存在 @media (min-width: 1024px) 横屏档').toBeGreaterThan(-1);
    return source.slice(i);
  };

  it('细条内的 pill 圆角跟随容器曲率（不许停在组件默认的 14px）', () => {
    const block = wideBlock();
    const rule = block.match(/\.toolbar-hero-pill\s*\{([^}]*)\}/);
    expect(rule, '横屏档应显式声明 .toolbar-hero-pill 的尺寸/曲率').toBeTruthy();
    expect(rule[1]).toMatch(/border-radius:\s*999px/);
  });

  it('搜索 wrapper 在横屏档必须 flex:1（flex:none 会让右侧动作组悬在条中间）', () => {
    const block = wideBlock();
    const rule = block.match(/\.toolbar-search-wrapper\s*\{([^}]*)\}/);
    expect(rule, '横屏档应声明 .toolbar-search-wrapper').toBeTruthy();
    const decl = rule[1].match(/flex:\s*([^;]+);/);
    expect(decl, '.toolbar-search-wrapper 必须显式声明 flex').toBeTruthy();
    expect(decl[1].trim()).not.toBe('none');
    expect(decl[1]).toMatch(/^1(\s|$)/); // flex: 1 / flex: 1 1 auto
  });
});
