import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MAX_PAGE_CONTEXT_CHARS,
  buildPageContextBlock,
  captureCurrentPageContext,
} from '../../src/views/BOHAI/utils/page-context.js';
import { estimateTokens } from '../../src/views/BOHAI/utils/tokens.js';

// ─────────────────────────────────────────────────────────────────────────────
// 「引用当前页面」的数据契约 + 接线守卫（2026-10-12）。
//
// 背景：`attachedContext` / `setAttachedContext` 在 useChatEngine 里定义、且
// `buildPageContextBlock(attachedContext.value)` **早就有消费方**（请求体拼装），
// 但 UI 侧**从来没有调用点** ⇒ 输入框顶部那条 `.boh-ctx` 元信息条恒不渲染。
// 这次补的是入口（工具菜单第 5 项，仅灵动岛形态）与采集真源。
//
// ⚠️ 三条设计口径（断言钉住）：
//   1. **不采整页正文（`content`）** —— 又长又噪，糊进 prompt 不是用户要的。
//      只采标题 / 地址 / meta description / **用户选中的内容**（选区是用户主动表达过的）。
//   2. **独立页形态不开这个入口** —— 那时「当前页面」就是 AI 自己，没有另一页可引。
//   3. token 估算复用 `utils/tokens.js` 的 `estimateTokens`（单源，含 CJK 加权）。
// ─────────────────────────────────────────────────────────────────────────────

const read = (relPath) => readFileSync(resolve(import.meta.dirname, '../..', relPath), 'utf8');

/** node 环境没有 DOM ⇒ 按需桩出 `document` / `window`（只桩本模块实际读的那几个面） */
const stubDom = ({ title, url, selection = '', description = '' }) => {
  globalThis.window = {
    getSelection: () => ({ toString: () => selection }),
    location: { href: url },
  };
  globalThis.document = {
    title,
    querySelector: (selector) =>
      selector === 'meta[name="description"]' && description
        ? { getAttribute: () => description }
        : null,
  };
};

describe('captureCurrentPageContext：采集当前页面', () => {
  it('采标题 / 地址 / 描述 / 选中内容', () => {
    stubDom({
      title: 'iPhone Duo 参数',
      url: 'https://example.com/duo?tab=spec',
      description: '机型对比与发售信息',
      selection: '256GB 版本 ¥8,999',
    });
    const ctx = captureCurrentPageContext();
    expect(ctx.title).toBe('iPhone Duo 参数');
    expect(ctx.url).toBe('https://example.com/duo?tab=spec');
    expect(ctx.description).toBe('机型对比与发售信息');
    expect(ctx.selection).toBe('256GB 版本 ¥8,999');
  });

  it('token 估算复用 utils/tokens.js 的单源（不是另写一套）', () => {
    stubDom({ title: '方块之家', url: 'https://x.test', selection: '今晚联机' });
    const ctx = captureCurrentPageContext();
    expect(ctx.tokenEstimate).toBe(Math.max(1, Math.round(estimateTokens('方块之家\n\n今晚联机'))));
    expect(ctx.tokenEstimate).toBeGreaterThan(0);
  });

  it('标题/地址/选区全空时返回 null（让调用方能给提示，而不是塞空对象）', () => {
    stubDom({ title: '   ', url: '', selection: '' });
    expect(captureCurrentPageContext()).toBeNull();
  });

  it('⚠️ 刻意不采整页正文：`content` 恒为空串', () => {
    stubDom({ title: '某页', url: 'https://x.test', selection: '一段' });
    expect(captureCurrentPageContext().content).toBe('');
  });

  it('过长选区截到 MAX_PAGE_CONTEXT_CHARS', () => {
    stubDom({ title: 't', url: 'u', selection: 'x'.repeat(MAX_PAGE_CONTEXT_CHARS + 500) });
    expect(captureCurrentPageContext().selection).toHaveLength(MAX_PAGE_CONTEXT_CHARS);
  });

  it('没有 document 时安全返回 null（SSR / 非浏览器上下文）', () => {
    delete globalThis.document;
    delete globalThis.window;
    expect(captureCurrentPageContext()).toBeNull();
  });
});

describe('buildPageContextBlock：契约没变', () => {
  it('空上下文 ⇒ 空串（不产出空标签）', () => {
    expect(buildPageContextBlock(null)).toBe('');
    expect(buildPageContextBlock({ title: '', url: '', selection: '', content: '' })).toBe('');
  });

  it('有内容 ⇒ `<page_context>` 结构化块', () => {
    const block = buildPageContextBlock({
      title: '题目',
      url: 'https://x.test/a',
      description: '描述',
      selection: '选中的',
    });
    expect(block).toContain('<page_context>');
    expect(block).toContain('页面标题：题目');
    expect(block).toContain('页面地址：https://x.test/a');
    expect(block).toContain('页面描述：描述');
    expect(block).toContain('选中的内容：\n选中的');
    expect(block).toContain('</page_context>');
  });

  it('正文仍按 4000 字截断（老契约不许悄悄放宽）', () => {
    const block = buildPageContextBlock({
      title: 't',
      content: 'y'.repeat(MAX_PAGE_CONTEXT_CHARS + 9),
    });
    expect(block).toContain('y'.repeat(MAX_PAGE_CONTEXT_CHARS));
  });
});

describe('接线守卫：入口存在、且只在灵动岛形态出现', () => {
  const composer = read('src/views/BOHAI/BOHAI/components/BohComposer.vue');
  const shell = read('src/views/BOHAI/BOHAI/BOHAIMain.vue');

  it('工具菜单第 5 项挂了 `v-if="overlayMode"`（独立页不开这个入口）', () => {
    expect(composer).toContain('v-if="overlayMode"');
    // 那一项必须是「引用当前页面」本身，不是别的按钮（中间隔着一条说明注释，
    // 所以判据放宽到 reach 700 字 —— 仍是「同一个 <button> 里」的量级）
    expect(composer).toMatch(/v-if="overlayMode"[\s\S]{0,700}?引用当前页面/);
  });

  it('组件侧：emit 了 attach-page，且发完就收起工具菜单', () => {
    expect(composer).toContain("'attach-page',");
    expect(composer).toMatch(/const requestAttachPage = \(\) => \{[\s\S]*activeMenu\.value = null/);
    expect(composer).toMatch(/const requestAttachPage = \(\) => \{[\s\S]*emit\('attach-page'\)/);
  });

  it('壳侧：导入采集真源 + 监听 attach-page + 走到 setAttachedContext', () => {
    expect(shell).toContain("import { captureCurrentPageContext } from '../utils/page-context.js'");
    expect(shell).toContain('@attach-page="handleAttachPage"');
    expect(shell).toMatch(/const handleAttachPage = \(\) => \{[\s\S]*setAttachedContext\(/);
    // 移除按钮原先就接好了（`@clear-context`），这次别碰坏它
    expect(shell).toContain('@clear-context="clearAttachedContext"');
  });

  it('采集真源自己 import 了 estimateTokens（不在组件里另写估算）', () => {
    expect(read('src/views/BOHAI/utils/page-context.js')).toContain(
      "import { estimateTokens } from './tokens.js'",
    );
  });
});
