import { describe, expect, it } from 'vitest';
import {
  getUserOverviewContext,
  resolveUserPrivateRetrievalPlan,
} from '../../src/views/BOHAI/composables/useUserPrivateRetrieval.js';

// ─────────────────────────────────────────────────────────────────────────────
// 2026-10-04：用户私域检索计划此前**零测试覆盖**。
//
// 为什么值得锁：**「我多少积分」能不能拿到数字，完全取决于这里** ——
// 「当前积分」是 `getUserOverviewContext` 输出的（读 `profiles.points`），
// 而 overview 是否触发由本文件的判定决定。判定一退化，症状是
// 「AI 答不出我的积分」而不是报错。
//
// ⚠️ 常见误解（我 2026-10-04 自己踩过）：以为积分要走 `points-admin-api`。
// 那是**管理端**接口（grantPoints / revokeGrant），用户侧积分走的是
// `userPrivate` 连接器的 overview 分支，**不需要新建 connector**。
// ─────────────────────────────────────────────────────────────────────────────

describe('BOH AI 用户私域检索计划', () => {
  describe('积分问法必须触发 overview', () => {
    it('「我多少积分」→ overview（overview 里带 profiles.points）', () => {
      const plan = resolveUserPrivateRetrievalPlan('我多少积分');
      expect(plan.shouldUse).toBe(true);
      expect(plan.overview).toBe(true);
    });

    it('「我的积分还有多少」→ overview', () => {
      const plan = resolveUserPrivateRetrievalPlan('我的积分还有多少');
      expect(plan.overview).toBe(true);
    });

    it('问账号信息同样走 overview', () => {
      const plan = resolveUserPrivateRetrievalPlan('我的账号信息');
      expect(plan.shouldUse).toBe(true);
      expect(plan.overview).toBe(true);
    });
  });

  describe('overview 的产物含当前积分', () => {
    it('getUserOverviewContext 输出「当前积分」', () => {
      const result = getUserOverviewContext({
        profile: { username: 'ryyik', role: 'admin', points: 1234, join_date: '2024-01-01' },
      });
      expect(result.context).toContain('当前积分: 1234');
      expect(result.context).toContain('ryyik');
    });

    it('缺 profile 时不抛错，积分回落为 0', () => {
      const result = getUserOverviewContext({});
      expect(result.context).toContain('当前积分: 0');
    });
  });

  describe('无关输入不读私域', () => {
    it('闲聊不触发', () => {
      expect(resolveUserPrivateRetrievalPlan('你好').shouldUse).toBe(false);
      expect(resolveUserPrivateRetrievalPlan('今天天气不错').shouldUse).toBe(false);
    });

    it('空输入不触发', () => {
      expect(resolveUserPrivateRetrievalPlan('').shouldUse).toBe(false);
      expect(resolveUserPrivateRetrievalPlan(null).shouldUse).toBe(false);
    });
  });

  describe('⚠️ 已知宽判定（记录现状，不是期望行为）', () => {
    it('「积分怎么获得」也会读私域', () => {
      // 「怎么获得」是操作类问题，理想上应走 siteGuide；但 `积分` 命中
      // USER_PRIVATE_SUBSCRIPTION_KEYWORDS，而该判定**不要求人称代词** ⇒ 仍读私域。
      // 影响可控（多读一次 profiles，模型能区分「规则」与「余额」），
      // 但要收紧的话改的是 subscriptions 判定 —— 动之前先把这里的守卫补全。
      const plan = resolveUserPrivateRetrievalPlan('积分怎么获得');
      expect(plan.shouldUse).toBe(true);
      expect(plan.subscriptions).toBe(true);
    });
  });
});
