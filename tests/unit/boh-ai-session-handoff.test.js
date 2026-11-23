import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  consumePendingBolekSessionOpen,
  requestBolekSessionOpen,
} from '../../src/utils/boh-ai-session-handoff.js';
import { squeezeSource } from '../helpers/source.js';

/* 论坛内联卡片 → /ai-chat 的会话交接（2026-11-22）。
   模块级单例状态会跨用例残留，所以每个断言都走「先 request 再 consume」，
   或显式消费一次把状态清干净。 */

describe('boh-ai-session-handoff：交接通道', () => {
  it('request → consume 原样取回 timestamp（读后即清）', () => {
    expect(requestBolekSessionOpen(1730000000000)).toBe(true);
    expect(consumePendingBolekSessionOpen()).toBe(1730000000000);
    // 再 consume 一次必须是 0 —— 不清掉会让下一次进全页误开旧会话
    expect(consumePendingBolekSessionOpen()).toBe(0);
  });

  it('没有待交接时 consume 恒为 0', () => {
    expect(consumePendingBolekSessionOpen()).toBe(0);
  });

  it('非法 timestamp（0 / 负数 / 非数值）拒绝受理', () => {
    expect(requestBolekSessionOpen(0)).toBe(false);
    expect(requestBolekSessionOpen(-1)).toBe(false);
    expect(requestBolekSessionOpen('abc')).toBe(false);
    expect(requestBolekSessionOpen(null)).toBe(false);
    expect(consumePendingBolekSessionOpen()).toBe(0);
  });

  it('后一次 request 覆盖前一次（只保留最新意图）', () => {
    expect(requestBolekSessionOpen(111)).toBe(true);
    expect(requestBolekSessionOpen(222)).toBe(true);
    expect(consumePendingBolekSessionOpen()).toBe(222);
    expect(consumePendingBolekSessionOpen()).toBe(0);
  });
});

/* 消费侧（useBohShell）的两条硬口径 —— 源码级锁，运行时行为靠 probe-forum-search 场景 J。
   2026-11-22 复核时补：重试窗口原本没有任何「用户已手动切换」的守卫。 */
describe('消费侧纪律（useBohShell.consumeSessionHandoff）', () => {
  const shellSrc = () =>
    squeezeSource(
      readFileSync(
        resolve(import.meta.dirname, '../../src/views/Bolek/composables/useBohShell.js'),
        'utf8',
      ),
    );

  it('重试窗口内用户手动切换会话 ⇒ 放弃交接（不许把用户弹回被交接的那条）', () => {
    const code = shellSrc();
    expect(code).toContain('sessionIndexAtStart');
    expect(code).toContain('currentSessionIndex.value !== sessionIndexAtStart');
  });

  it('流式中绝不换状态：reload 返回 false 时立刻停手', () => {
    const code = shellSrc();
    expect(code).toContain('if (!reloadSessionsFromStorage()) return;');
    // 重试链里也必须再判一次（2s 窗口内可能刚好进入流式）
    expect(code).toContain('if (!reloadSessionsFromStorage()) return; // 进入流式就停手');
  });

  it('两个入口（onMounted + onActivated）都消费，且 isStandalone 门控', () => {
    const code = shellSrc();
    /* `consumeSessionHandoff()` 精确匹配的是**调用点**（定义处是 `const consumeSessionHandoff =`，
       不带括号）⇒ 恰好 2 处：onActivated 一次、onMounted 一次。 */
    const calls = code.match(/consumeSessionHandoff\(\)/g) || [];
    expect(calls).toHaveLength(2);
    expect(code).toContain('if (!isStandalone.value) return;');
  });
});
