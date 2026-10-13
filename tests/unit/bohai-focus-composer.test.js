import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scriptSection, squeezeSource, stripComments } from '../helpers/source.js';

// ─────────────────────────────────────────────────────────────────────────────
// ⌘K **二次触发**（AI 浮层已开着 ⇒ 聚焦输入框）的接线守卫（2026-10-12 接上）。
//
// 事故：`App.vue` 的 `handleGlobalAiKeydown` 在浮层已开时派发 `boh-ai-focus-composer`，
// 但**全仓零监听** ⇒ 按 ⌘K 第二次没有任何反应（2026-10-08 登记为死链，
// 判据 `grep -rn <事件名> src/ | wc -l` → 1）。
// 这类「只有派发没有监听」的缺陷不报错、只是没反应 ⇒ 按本仓惯例由**源码守卫**锁两端。
// ⚠️ 取断言前先 `scriptSection` + `stripComments`：注释里会合法地复述事件名。
// ─────────────────────────────────────────────────────────────────────────────

const read = (relPath) => readFileSync(resolve(import.meta.dirname, '../..', relPath), 'utf8');
const APP = 'src/App.vue';
// plans/025 v2 · Step 7：监听端（挂载/卸载监听）随状态搬进
// `composables/useBohShell.js` ⇒ 断言改指新文件。
// 「壳仍接线」（导入 + 解构 + exposedApi 转发）由 bohai-shell-structure.test.js 锁定。
const SHELL = 'src/views/BOHAI/composables/useBohShell.js';
const COMPOSER = 'src/views/BOHAI/BOHAI/components/BohComposer.vue';
const EVENT = 'boh-ai-focus-composer';

const codeOf = (relPath) => squeezeSource(stripComments(scriptSection(read(relPath))));
const countOf = (text, needle) => text.split(needle).length - 1;

describe('⌘K 二次触发 · 派发端（App.vue）', () => {
  const app = codeOf(APP);

  it('浮层**已经开着**时才派发（不是无条件派发）', () => {
    const at = app.indexOf(`dispatchEvent(new CustomEvent('${EVENT}'))`);
    expect(at).toBeGreaterThan(-1);
    // 守卫（globalAiOpen）必须紧邻在派发之前 —— 否则「没开时也派发」这条链是空的
    const guard = app.lastIndexOf('globalAiOpen.value', at);
    expect(guard).toBeGreaterThan(-1);
    expect(at - guard).toBeLessThan(120);
  });

  it('派发点只有一个（避免同一事件被派发多次）', () => {
    expect(countOf(app, EVENT)).toBe(1);
  });
});

describe('⌘K 二次触发 · 监听端（useBohShell）', () => {
  const shell = codeOf(SHELL);

  it('挂载时监听、卸载时摘掉（成对）', () => {
    expect(shell).toContain(`addEventListener('${EVENT}', focusComposer)`);
    expect(shell).toContain(`removeEventListener('${EVENT}', focusComposer)`);
    expect(countOf(shell, EVENT)).toBe(2);
  });

  it('监听回调真的聚焦输入框', () => {
    expect(shell).toContain('composerRef.value?.focus()');
    expect(codeOf(COMPOSER)).toContain('focus: () => textareaEl.value?.focus()');
  });
});
