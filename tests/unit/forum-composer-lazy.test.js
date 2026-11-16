import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * 守住「发帖编辑器不进首屏」这条（2026-11-16）。
 *
 * 为什么要有源码级守卫：`PostComposer.vue` 只在 `isMobileComposerOpen` 为真时
 * 才渲染（模板里 `<Transition>` + `v-if`），但它是静态 import —— 于是
 * 编辑器 + ImageEditModal 一起被打进 `forum-feed-cache` chunk，首访多下
 * 23KB JS + 13KB CSS（实测 36KB gzip / 约 180ms）。绝大多数访客只来看帖子。
 *
 * 这件事**没有任何运行时症状**：构建成功、页面正常、点开面板也正常，
 * 只有抓 waterfall 才看得见 —— 所以用源码断言钉住。
 *
 * ⚠️ 断言按「能被 prettier 重排」的写法来：引号可能变、可能换行、可能有
 * 尾随逗号。统一用 /s + 宽松空白匹配，不要写逐字字符串。
 */

const SRC = readFileSync(resolve(__dirname, '../../src/views/Forum/ForumMain.vue'), 'utf8');

describe('发帖编辑器必须是按需加载', () => {
  it('不得静态 import PostComposer（静态即回到首屏闭包）', () => {
    const staticImport =
      /(^|\n)\s*import\s+(?!\()[\w{][\s\S]{0,200}?from\s*['"][^'"]*components\/PostComposer\.vue['"]/;
    expect(staticImport.test(SRC)).toBe(false);
  });

  it('必须通过动态 import 取它', () => {
    expect(/import\(\s*['"][^'"]*components\/PostComposer\.vue['"]\s*\)/.test(SRC)).toBe(true);
  });

  it('必须走 createPanelAsync（项目唯一实现：退避重试 + 失败上报）', () => {
    expect(/createPanelAsync\s*\(/.test(SRC)).toBe(true);
    // 包装对象要真的赋给 PostComposer，而不是定义了没用
    expect(/const\s+PostComposer\s*=\s*createPanelAsync\s*\(/.test(SRC)).toBe(true);
  });

  it('必须带 label（失败上报要靠它区分面板）', () => {
    const block = SRC.match(
      /createPanelAsync\([\s\S]{0,400}?components\/PostComposer\.vue['"]\s*\)\s*,\s*\{[\s\S]{0,200}?\}\s*\)/,
    );
    expect(block, '找不到 createPanelAsync 的调用块').toBeTruthy();
    expect(/label\s*:/.test(block[0])).toBe(true);
  });

  it('必须是 silent 兜底（失败时不该在整屏浮层里留加载占位）', () => {
    const block = SRC.match(
      /createPanelAsync\([\s\S]{0,400}?components\/PostComposer\.vue['"]\s*\)\s*,\s*\{[\s\S]{0,200}?\}\s*\)/,
    );
    expect(block).toBeTruthy();
    expect(/silent\s*:\s*true/.test(block[0])).toBe(true);
  });

  it('模板里仍然渲染它（别把组件删了只剩一个空 wrapper）', () => {
    expect(/<PostComposer[\s\S]{0,80}/.test(SRC)).toBe(true);
  });

  it('离场过渡的 name 不得改动（离场动画靠 .mobile-composer-* 这几个 class）', () => {
    expect(/<Transition\s+name="mobile-composer"/.test(SRC)).toBe(true);
  });
});
