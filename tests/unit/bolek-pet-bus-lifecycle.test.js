/**
 * bolek-pet-bus-lifecycle.test.js — 「小方」状态总线的复位契约（2026-11-22 回归）
 *
 * 背景：`boh-pet-bus` 是**模块单例 ref**，写入方是两个会随交互卸载的组件：
 *   · BohChatStream（`/ai-chat` 页，keepAlive；但岛外/退出页会 unmount）
 *   · BohIslandAnswer（App 级 BohIsland 回答面，`v-if="rendered"` —— **关岛即卸载**）
 *
 * 两者都只写不清：`watch(activityStage, s => setPetStage(s, ...))`。
 * 岛上在流式中途被关掉时（用户按 Esc / 点遮罩 / 跳页），组件直接卸载 ⇒
 * `activityStage` 的 watch 停了，最后一次写入的 `'thinking'` 永远留在单例里。
 *
 * 后果（都在 BohPetBlock 里读过 petStage）：
 *   · `busy: Boolean(petStage.value)` ⇒ **自主动作被永久拦死**（再也不打盹/蹦跳）
 *   · `petStage.value === ''` 的睡眠判定不成立 ⇒ **永不进入 sleeping**
 *   · `applyStage()` 一直把角色画成「正在思考」
 * 直到下次有人再发一条消息才可能复位 —— 用户感知是「小方卡在思考，不动了」。
 *
 * 本测试用「写入方卸载后总线必须自愈」这一条契约锁住它，两侧源码都要有卸载复位。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { petStage, petStageSource, setPetStage } from '../../src/utils/boh-pet-bus.js';
import { squeezeSource } from '../helpers/source.js';

const petPath = resolve(import.meta.dirname, '../../src/components/BohPetBlock.vue');
const streamPath = resolve(
  import.meta.dirname,
  '../../src/views/Bolek/Bolek/components/BohChatStream.vue',
);
const islandAnswerPath = resolve(import.meta.dirname, '../../src/components/BohIslandAnswer.vue');

describe('boh-pet-bus 基本语义', () => {
  it('写入后读得到；同值同源幂等', () => {
    setPetStage('thinking', 'island');
    expect(petStage.value).toBe('thinking');
    expect(petStageSource.value).toBe('island');
    setPetStage('thinking', 'island');
    expect(petStage.value).toBe('thinking');
  });

  it('空串 = 闲置（BohPetBlock 用它判 busy / 睡眠）', () => {
    setPetStage('', 'island');
    expect(Boolean(petStage.value)).toBe(false);
    setPetStage(null, 'island');
    expect(petStage.value).toBe('');
  });

  it('⭐ 复位到空串后，busy 守卫必须放行（否则自主动作永久停摆）', () => {
    setPetStage('thinking', 'island');
    expect(Boolean(petStage.value)).toBe(true);
    /* 卸载复位走的就是这一句 */
    setPetStage('', 'island');
    expect(Boolean(petStage.value)).toBe(false);
  });
});

describe('写入方卸载必须复位（否则单例卡在最后一次写入）', () => {
  /**
   * 断言方式：源码里卸载钩子内必须有 `setPetStage('')`。
   * 用 flatten 口径（去掉全部空白）避免 prettier 断行导致的假红。
   */
  const hasResetInUnmount = (file) => {
    const src = readFileSync(file, 'utf8');
    /* 取所有卸载钩子的回调体（onBeforeUnmount / onUnmounted / onDeactivated） */
    const bodies = [
      ...src.matchAll(
        /on(?:BeforeUnmount|Unmounted|Deactivated)\s*\(\s*\(\)\s*=>\s*\{([\s\S]*?)\n\}\);/g,
      ),
    ];
    /* 复位调用允许带第二参（source），只要求第一参是空串 */
    return bodies.some((m) => /setPetStage\(\s*''/.test(squeezeSource(m[1])));
  };

  it('BohIslandAnswer（关岛即卸载）：卸载时把总线复位', () => {
    expect(hasResetInUnmount(islandAnswerPath)).toBe(true);
  });

  it('BohChatStream（/ai-chat 卸载）：卸载时把总线复位', () => {
    expect(hasResetInUnmount(streamPath)).toBe(true);
  });

  it('两个写入方都要保留（别为了复位把写入删掉）', () => {
    for (const f of [islandAnswerPath, streamPath]) {
      expect(squeezeSource(readFileSync(f, 'utf8'))).toContain('setPetStage(');
    }
  });

  it('BohPetBlock 消费侧：busy 守卫与睡眠判定都读 petStage（改语义要一起改）', () => {
    const pet = squeezeSource(readFileSync(petPath, 'utf8'));
    expect(pet).toContain('busy: Boolean(petStage.value)');
    expect(pet).toContain("petStage.value === ''");
  });
});
