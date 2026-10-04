import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { shouldUseSiteActivities } from '../../src/views/BOHAI/composables/useIntentDetection.js';
import { resolveKnowledgeRoutingPlanCore } from '../../src/utils/ai-chat-grounding.js';
import { BOHAI_CONNECTOR_IDS } from '../../src/utils/bohai-connectors.js';
import { squeezeSource } from '../helpers/source.js';

// ─────────────────────────────────────────────────────────────────────────────
// 2026-10-04：新增第 9 个读连接器 —— 站内活动 / 抽奖 / 演出（公开数据）。
// 本文件锁三件事：① 意图判定边界；② 路由计划里 activities 键的开关口径；
// ③ 连接器注册与路由键 planKey 必须一致（写错键 = connector 永远不跑，且不报错）。
// ─────────────────────────────────────────────────────────────────────────────

describe('BOHAI 站内活动读连接器', () => {
  describe('shouldUseSiteActivities', () => {
    it('命中活动 / 比赛 / 报名类问题', () => {
      expect(shouldUseSiteActivities('最近有什么活动')).toBe(true);
      expect(shouldUseSiteActivities('报名什么时候截止')).toBe(true);
      expect(shouldUseSiteActivities('这次比赛的结果出来了吗')).toBe(true);
    });

    it('命中抽奖类问题', () => {
      expect(shouldUseSiteActivities('抽奖结果出了吗')).toBe(true);
      expect(shouldUseSiteActivities('我中签了吗')).toBe(true);
    });

    it('命中演出类问题', () => {
      expect(shouldUseSiteActivities('最近有什么演出')).toBe(true);
    });

    it('普通闲聊与无关问题不命中', () => {
      expect(shouldUseSiteActivities('你好呀')).toBe(false);
      expect(shouldUseSiteActivities('今天天气不错')).toBe(false);
    });

    it('站点操作类问题交给 siteGuide，不读活动数据', () => {
      expect(shouldUseSiteActivities('活动页面在哪里')).toBe(false);
    });

    it('空输入安全', () => {
      expect(shouldUseSiteActivities('')).toBe(false);
      expect(shouldUseSiteActivities(null)).toBe(false);
      expect(shouldUseSiteActivities(undefined)).toBe(false);
    });
  });

  describe('路由计划', () => {
    it('basePlan.activities 会被保留', () => {
      const { plan } = resolveKnowledgeRoutingPlanCore({
        basePlan: { activities: true },
        operation: false,
      });
      expect(plan.activities).toBe(true);
    });

    it('操作类问题会关掉 activities（只要站点手册）', () => {
      const { plan } = resolveKnowledgeRoutingPlanCore({
        basePlan: { activities: true },
        operation: true,
      });
      expect(plan.siteGuide).toBe(true);
      expect(plan.activities).toBe(false);
    });

    it('未传 activities 时默认 false', () => {
      const { plan } = resolveKnowledgeRoutingPlanCore({ basePlan: {} });
      expect(plan.activities).toBe(false);
    });
  });

  describe('连接器注册', () => {
    const retrievalPath = resolve(
      import.meta.dirname,
      '../../src/views/BOHAI/composables/useKnowledgeRetrieval.js',
    );

    it('createReadConnectors 注册了 siteActivities，且 planKey 与路由键一致', () => {
      const code = squeezeSource(readFileSync(retrievalPath, 'utf8'));
      expect(code).toContain('id: BOHAI_CONNECTOR_IDS.siteActivities');
      expect(code).toContain("planKey: 'activities'");
      expect(code).toContain('read: () => getActivitiesContext()');
    });

    it('不要求登录（活动 / 抽奖 / 演出都是公开数据）', () => {
      const code = squeezeSource(readFileSync(retrievalPath, 'utf8'));
      const block = code.slice(code.indexOf('BOHAI_CONNECTOR_IDS.siteActivities'));
      const head = block.slice(0, block.indexOf('}),'));
      expect(head).toContain('requiresLogin: false');
    });

    it('connector id 常量存在', () => {
      expect(BOHAI_CONNECTOR_IDS.siteActivities).toBe('siteActivities');
    });
  });
});
