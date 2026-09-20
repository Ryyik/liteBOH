import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file) => readFileSync(resolve(import.meta.dirname, `../../${file}`), 'utf8');

// 源码文本型守卫必须先剥离块注释，只看生效代码
const stripCssComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

describe('frontend performance guardrails', () => {
  it('does not initialize the third-party AI SDK during app boot', () => {
    const source = read('src/main.js');
    expect(source).not.toMatch(/initHiagentWidget\(/);
    expect(read('src/utils/hiagent-widget.js')).toMatch(/首次打开时初始化|toggleHiagentChat/);
  });

  // 机制变更（2026-09）：行级延迟渲染已移除，首屏优先改为向下传 :priority 标记。
  // 移除依据见 HomeHeroRow.vue 顶部注释：iOS Safari WebKit bug 321501
  // （content-visibility:auto 令行保持过期的零高度布局，真实触摸滚动才复现）+ 318216。
  // 此用例转为守卫：既验证首屏标记仍在，也禁止重新引入行级虚拟化。
  // 注意：守卫必须先剥离注释，否则会匹配到"解释为什么不用它"的说明文字。
  it('marks the first home hero row as priority without row-level virtualization', () => {
    expect(read('src/views/Home/index.vue')).toMatch(/:priority="heroIndex === 0"/);

    const rowSource = stripCssComments(read('src/views/Home/components/HomeHeroRow.vue'));
    expect(rowSource).not.toContain('content-visibility');
    expect(rowSource).not.toContain('IntersectionObserver');
  });

  it('keeps document and PPT engines behind user actions', () => {
    expect(read('src/views/Lab/composables/usePPTGenerator.js')).not.toMatch(/from ['"]\.\.\/engine\/ppt-renderer/);
    expect(read('src/views/Lab/composables/useWordGenerator.js')).not.toMatch(/from ['"]\.\.\/engine\/word-builder/);
    expect(read('src/views/Lab/index.vue')).toMatch(/import\('\.\/engine\/docx-parser\.js'\)/);
  });

  it('pre-caches app shell plus first-screen dependency chunks', () => {
    const source = read('vite.config.js');
    // 离线白屏回归修复：main.js 静态依赖 @vueuse/motion 与首页 supabase，
    // 首屏依赖 chunk（supabase-vendor/ui-icons/vue-utils-vendor）必须随应用壳预缓存。
    //
    // 2026-09-20（P0-1 加载性能审计）：名单由字面量收按到单一常量 SHELL_CHUNKS，
    // globPatterns 改为消费该常量（CSS 部分另经 manifestTransforms 按壳样式收窄）。
    // 本用例的意图不变 —— 仍是"这 8 个 chunk 一个都不能少"，只是改成校验常量内容，
    // 这样以后调整 glob 写法不会再误报，而删掉任一 chunk 依然会红。
    const block = source.match(/const\s+SHELL_CHUNKS\s*=\s*\[([\s\S]*?)\]/);
    expect(block, 'vite.config.js 里找不到 SHELL_CHUNKS 常量').toBeTruthy();
    const names = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    for (const required of [
      'vue-vendor',
      'state-vendor',
      'auth-store',
      'ui-components',
      'supabase-vendor',
      'ui-icons',
      'vue-utils-vendor',
      'ui-sanitize',
    ]) {
      expect(names, `壳 chunk 名单缺少 ${required}`).toContain(required);
    }

    // 入口 chunk 固定产出为 app-[hash].js，且必须与上述名单一起进 globPatterns
    expect(source).toMatch(/entryFileNames:\s*'static\/js\/app-\[hash\]\.js'/);
    expect(source).toMatch(/SHELL_CHUNKS_WITH_ENTRY\s*=\s*\['app',\s*\.\.\.SHELL_CHUNKS\]/);
    expect(source).toMatch(/\$\{SHELL_CHUNKS_WITH_ENTRY\.join\(','\)\}/);
  });
});
