/**
 * bolek-activity-host-index.test.js — 活动行宿主下标口径（2026-11-22 回归）
 *
 * 背景：2026-11-22 把活动行的宿主判断从「流级布尔」改成「逐消息判 idx」时，
 * `activityHostIdx` 返回的是**可见列表内的下标**（`props.messages.length - 1`），
 * 而模板 `v-for="{ message: msg, index: idx } in messages"` 里的 `idx` 是
 * **全局下标**（useBohShell 的 visibleMessageItems 用 `start + offset` 构造）。
 *
 * 两者只在「消息总数 ≤ visibleMessageLimit(80)」时相等 —— 也就是所有单轮探针
 * 的口径。一旦对话超过 80 条，`start > 0`，活动行永远匹配不到任何一条消息：
 * 用户看到的是「发了问题，头顶没有等待动画/角色」，而且没有任何报错。
 *
 * 本测试锁两件事：
 *   ① 宿主必须用**与模板同源的下标**（取最后一条条目的 `index`），不是数组长度；
 *   ② 用真实构造逻辑跑一遍 >80 条的长对话，断言能命中最后一条。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { squeezeSource, scriptSection, stripComments } from '../helpers/source.js';

const streamPath = resolve(
  import.meta.dirname,
  '../../src/views/Bolek/Bolek/components/BohChatStream.vue',
);
const shellPath = resolve(import.meta.dirname, '../../src/views/Bolek/composables/useBohShell.js');

/**
 * 复刻两侧的下标构造（真源都在仓库里，这里只做最小复算，避免为一个纯几何问题
 * 引入整棵 Vue 运行时）：
 *   · useBohShell.visibleMessageItems：`list.slice(start).map((m, o) => ({ index: start + o }))`
 *   · BohChatStream 模板：`v-for="{ message: msg, index: idx } in messages"`
 */
const buildVisibleItems = (list, limit) => {
  const start = Math.max(0, list.length - limit);
  return list.slice(start).map((message, offset) => ({ message, index: start + offset }));
};

/** 现行（错误）实现：返回数组下标 */
const hostIdxByLength = (items) => {
  const n = items.length;
  const last = items[n - 1];
  if (!last || last.message?.role !== 'assistant') return -1;
  return n - 1;
};

/** 正确实现：返回最后一条条目的全局下标（与模板 idx 同源） */
const hostIdxByEntryIndex = (items) => {
  const n = items.length;
  const last = items[n - 1];
  if (!last || last.message?.role !== 'assistant') return -1;
  return last.index;
};

const makeConversation = (total) =>
  Array.from({ length: total }, (_, i) => ({
    id: `m${i}`,
    role: i % 2 === 0 ? 'user' : 'assistant',
  }));

describe('活动行宿主下标（2026-11-22 长对话回归）', () => {
  it('⭐ 短对话（≤80 条）：两种实现等价 —— 探针全绿的原因', () => {
    const items = buildVisibleItems(makeConversation(6), 80);
    expect(hostIdxByLength(items)).toBe(5);
    expect(hostIdxByEntryIndex(items)).toBe(5);
  });

  it('⭐ 长对话（>80 条）：数组下标命中不到任何消息（活动行整条消失）', () => {
    const items = buildVisibleItems(makeConversation(180), 80);
    const idxSet = new Set(items.map((it) => it.index));

    const buggy = hostIdxByLength(items);
    expect(buggy).toBe(79);
    /* 关键断言：模板里 idx 取值是 100..179，79 不在其中 ⇒ v-if 恒假 */
    expect(idxSet.has(buggy)).toBe(false);

    const fixed = hostIdxByEntryIndex(items);
    expect(fixed).toBe(179);
    expect(idxSet.has(fixed)).toBe(true);
  });

  it('最后一条是用户消息（AI 泡未落）：两种实现都返回 -1', () => {
    const list = makeConversation(5).concat([{ id: 'q', role: 'user' }]);
    const items = buildVisibleItems(list, 80);
    expect(hostIdxByLength(items)).toBe(-1);
    expect(hostIdxByEntryIndex(items)).toBe(-1);
  });

  it('源码守卫：activityHostIdx 必须取条目自身的 index，不能用数组长度-1', () => {
    const script = stripComments(scriptSection(readFileSync(streamPath, 'utf8')));
    const code = squeezeSource(script);
    /* 取最后一条条目 */
    expect(code).toContain('props.messages[props.messages.length - 1]');
    /* ⭐ 核心：返回值必须来自 last.index（全局下标），不是 props.messages.length - 1 */
    expect(code).toContain('last.index');
    expect(code).not.toContain('return n - 1');
    expect(code).not.toContain('return props.messages.length - 1');
  });

  it('两侧下标语义同源：visibleMessageItems 构造的是 start + offset（不是 0 基）', () => {
    const shell = stripComments(readFileSync(shellPath, 'utf8'));
    const code = squeezeSource(shell);
    expect(code).toContain('index: start + offset');
  });
});
