/**
 * bohai-domain.test.js — 锁 BOHAI `domain/` 的**门面契约**（plans/025 v2 · Step 2）
 *
 * 为什么需要这组断言：
 *   - `domain/routing-patterns.js` 是**薄转出口**（真源在 `engine/`，红线 1 冻结）；
 *     一旦有人把它改成实体（复制一份）或改坏 re-export，这里立刻红。
 *   - `domain/evidence.js` 是**真外移**；必须证明全局 `bohai-constants.js` 里**不再有第二份**
 *     （否则「谁是真源」又变模糊 —— 这正是 `plans/025` 要消灭的那类缺陷）。
 */
import { describe, expect, it } from 'vitest';
import { ROUTING_PATTERNS as VIA_DOMAIN } from '@/views/BOHAI/domain/routing-patterns.js';
import { ROUTING_PATTERNS as VIA_ENGINE } from '@/views/BOHAI/engine/bohai-auto-router.js';
import { EVIDENCE_SOURCE_WEIGHTS, RANKING_SCORE_WEIGHTS } from '@/views/BOHAI/domain/evidence.js';

describe('BOHAI domain 门面契约', () => {
  it('routing-patterns 是 engine 的薄转出口（同一对象，不是副本）', () => {
    expect(VIA_DOMAIN).toBe(VIA_ENGINE);
    expect(Object.keys(VIA_DOMAIN).length).toBeGreaterThan(0);
  });

  it('routing-patterns 转出了「间接存活」的 5 个谓词', async () => {
    const mod = await import('@/views/BOHAI/domain/routing-patterns.js');
    for (const name of [
      'isLikelyCodeOrCommandRequest',
      'isLikelyDailySummaryRequest',
      'isLikelyCloudReferenceRequest',
      'isLikelyPersonalSupportRequest',
      'isLikelyCommunityMemoryShare',
    ]) {
      expect(typeof mod[name]).toBe('function');
    }
  });

  it('evidence 权重值逐字保留', () => {
    expect(EVIDENCE_SOURCE_WEIGHTS.userPrivate).toBe(22);
    expect(EVIDENCE_SOURCE_WEIGHTS.cloud).toBe(18);
    expect(EVIDENCE_SOURCE_WEIGHTS.forum).toBe(16);
    expect(EVIDENCE_SOURCE_WEIGHTS.sharedMemory).toBe(14);
    expect(EVIDENCE_SOURCE_WEIGHTS.health).toBe(15);
    expect(EVIDENCE_SOURCE_WEIGHTS.knowledge).toBe(12);
    expect(EVIDENCE_SOURCE_WEIGHTS.siteGuide).toBe(10);
    // 原有三项逐字不动（2026-10-08 加时间衰减时只**新增**字段，没改这三个值）
    expect(RANKING_SCORE_WEIGHTS.lexicalMultiplier).toBe(5);
    expect(RANKING_SCORE_WEIGHTS.defaultSourceScore).toBe(6);
    expect(RANKING_SCORE_WEIGHTS.confidenceMultiplier).toBe(10);
    // 时间衰减参数（2026-10-08 新增）
    expect(RANKING_SCORE_WEIGHTS.freshnessMaxPenalty).toBe(8);
    expect(RANKING_SCORE_WEIGHTS.freshnessReferenceDays).toBe(90);
    expect(RANKING_SCORE_WEIGHTS.freshnessHalfLifeDays).toEqual({
      forum: 14,
      health: 21,
      cloud: 30,
      sharedMemory: 30,
      userPrivate: 120,
      knowledge: 365,
      siteGuide: 365,
    });
    expect(RANKING_SCORE_WEIGHTS.freshnessFallbackHalfLifeDays).toBe(365);
  });

  it('全局 bohai-constants 里**不再有**第二份（单一真源）', async () => {
    const constants = await import('@/utils/bohai-constants.js');
    expect(constants.EVIDENCE_SOURCE_WEIGHTS).toBeUndefined();
    expect(constants.RANKING_SCORE_WEIGHTS).toBeUndefined();
  });
});
