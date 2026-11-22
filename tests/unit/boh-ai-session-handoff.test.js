import { describe, expect, it } from 'vitest';
import {
  consumePendingBohAISessionOpen,
  requestBohAISessionOpen,
} from '../../src/utils/boh-ai-session-handoff.js';

/* 论坛内联卡片 → /ai-chat 的会话交接（2026-11-22）。
   模块级单例状态会跨用例残留，所以每个断言都走「先 request 再 consume」，
   或显式消费一次把状态清干净。 */

describe('boh-ai-session-handoff：交接通道', () => {
  it('request → consume 原样取回 timestamp（读后即清）', () => {
    expect(requestBohAISessionOpen(1730000000000)).toBe(true);
    expect(consumePendingBohAISessionOpen()).toBe(1730000000000);
    // 再 consume 一次必须是 0 —— 不清掉会让下一次进全页误开旧会话
    expect(consumePendingBohAISessionOpen()).toBe(0);
  });

  it('没有待交接时 consume 恒为 0', () => {
    expect(consumePendingBohAISessionOpen()).toBe(0);
  });

  it('非法 timestamp（0 / 负数 / 非数值）拒绝受理', () => {
    expect(requestBohAISessionOpen(0)).toBe(false);
    expect(requestBohAISessionOpen(-1)).toBe(false);
    expect(requestBohAISessionOpen('abc')).toBe(false);
    expect(requestBohAISessionOpen(null)).toBe(false);
    expect(consumePendingBohAISessionOpen()).toBe(0);
  });

  it('后一次 request 覆盖前一次（只保留最新意图）', () => {
    expect(requestBohAISessionOpen(111)).toBe(true);
    expect(requestBohAISessionOpen(222)).toBe(true);
    expect(consumePendingBohAISessionOpen()).toBe(222);
    expect(consumePendingBohAISessionOpen()).toBe(0);
  });
});
