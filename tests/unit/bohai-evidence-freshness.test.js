/**
 * bohai-evidence-freshness.test.js — 锁证据排序的时间衰减（2026-10-08）
 *
 * 背景：`rankEvidenceContextBlocks` 原排序是 `词面×5 + 源权重 + 置信度×10`，
 * **日期完全不参与**。于是半年前的论坛帖与昨天的另一条，条件相当时得分完全一样。
 *
 * 三条关键口径：
 *   ① 惩罚是**减法**，且有上限 `freshnessMaxPenalty=8` —— 不会把新证据压到垫底
 *   ② **没有 latestAt ⇒ 惩罚 0**。缺失不等于过期，这是本文件最重要的一条
 *   ③ 半衰期按源区分：论坛 14 天 < 健康 21 < Cloud+/记忆 30 << 手册/知识库 365
 */
import { describe, expect, it } from 'vitest';
import {
  freshnessPenalty,
  rankEvidenceContextBlocks,
} from '@/views/BOHAI/utils/retrieval/scoring.js';
import { RANKING_SCORE_WEIGHTS } from '@/views/BOHAI/domain/evidence.js';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-08T00:00:00.000Z');
const daysAgo = (n) => new Date(NOW - n * DAY).toISOString();

describe('BOHAI 证据时间衰减', () => {
  describe('freshnessPenalty', () => {
    it('无 latestAt ⇒ 0（缺失 ≠ 过期，站点手册/知识库不会被系统性打死）', () => {
      expect(freshnessPenalty('siteGuide', '', NOW)).toBe(0);
      expect(freshnessPenalty('knowledge', undefined, NOW)).toBe(0);
      expect(freshnessPenalty('forum', null, NOW)).toBe(0);
    });

    it('无法解析的日期 ⇒ 0（坏数据不该被当成 1970 年）', () => {
      expect(freshnessPenalty('forum', 'not-a-date', NOW)).toBe(0);
    });

    it('今天/昨天的帖子几乎不扣分', () => {
      expect(freshnessPenalty('forum', daysAgo(0), NOW)).toBe(0);
      expect(freshnessPenalty('forum', daysAgo(1), NOW)).toBeLessThan(0.5);
    });

    it('同一天数下，论坛比知识库扣得狠（半衰期按源区分）', () => {
      const forum = freshnessPenalty('forum', daysAgo(60), NOW);
      const knowledge = freshnessPenalty('knowledge', daysAgo(60), NOW);
      expect(forum).toBeGreaterThan(knowledge);
    });

    it('惩罚单调递增且有上限，不发散', () => {
      const p1 = freshnessPenalty('forum', daysAgo(10), NOW);
      const p2 = freshnessPenalty('forum', daysAgo(30), NOW);
      const p3 = freshnessPenalty('forum', daysAgo(3650), NOW);
      expect(p2).toBeGreaterThan(p1);
      expect(p3).toBeGreaterThanOrEqual(p2);
      expect(p3).toBeLessThanOrEqual(RANKING_SCORE_WEIGHTS.freshnessMaxPenalty);
    });

    it('未来时间（时钟漂移）⇒ 0，不给负分', () => {
      expect(freshnessPenalty('forum', new Date(NOW + 5 * DAY).toISOString(), NOW)).toBe(0);
    });

    it('未知源走兜底半衰期（接近不惩罚）', () => {
      const unknown = freshnessPenalty('someNewConnector', daysAgo(60), NOW);
      expect(unknown).toBeGreaterThan(0);
      expect(unknown).toBeLessThan(freshnessPenalty('forum', daysAgo(60), NOW));
    });
  });

  describe('rankEvidenceContextBlocks 集成', () => {
    const mk = (over) => ({
      ok: true,
      connectorId: 'forum',
      context: 'Vue 性能优化相关的社区讨论内容',
      confidence: 0.8,
      ...over,
    });

    it('同等条件下，新的证据排在旧的之前', () => {
      const ranked = rankEvidenceContextBlocks(
        [mk({ latestAt: daysAgo(400) }), mk({ latestAt: daysAgo(1) })],
        'Vue 性能优化',
      );
      expect(ranked[0].result.latestAt).toBe(daysAgo(1));
      expect(ranked[0].freshnessPenalty).toBeLessThan(ranked[1].freshnessPenalty);
    });

    it('⚠️ 反证：把旧的换成「无日期」，排序不该被它挤到后面（不是按最旧处理）', () => {
      const withDate = rankEvidenceContextBlocks(
        [mk({ latestAt: daysAgo(1) }), mk({})],
        'Vue 性能优化',
      );
      const fresh = withDate.find((r) => r.result.latestAt === daysAgo(1));
      const undated = withDate.find((r) => !r.result.latestAt);
      expect(undated.freshnessPenalty).toBe(0);
      // 无日期那条仍是 0 惩罚，与新鲜那条同分区间（差值只来自 1 天的微小惩罚）
      expect(Math.abs(fresh.score - undated.score)).toBeLessThan(1);
    });

    it('源权重仍然压过时间衰减：私域旧数据不会被论坛新帖超过', () => {
      const ranked = rankEvidenceContextBlocks(
        [
          mk({ connectorId: 'forum', latestAt: daysAgo(1) }),
          mk({ connectorId: 'userPrivate', latestAt: daysAgo(200) }),
        ],
        '我的资料',
      );
      // userPrivate 源权重 22 高于 forum 16，衰减上限只有 8 ⇒ 私域仍在前
      expect(ranked[0].result.connectorId).toBe('userPrivate');
    });

    it('过滤掉失败/空 context 的结果（既有行为不变）', () => {
      const ranked = rankEvidenceContextBlocks(
        [mk({ ok: false }), mk({ context: '' }), mk({})],
        'Vue',
      );
      expect(ranked).toHaveLength(1);
    });
  });
});
