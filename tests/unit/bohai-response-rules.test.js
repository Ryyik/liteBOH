/**
 * bohai-response-rules.test.js — 锁回答约束块拼装（plans/025 v2 · Step 5-2）
 *
 * 关键口径：
 *   ① `responseRules` 恒存在（通用 4 句），条件段按开关点亮；
 *   ② `actualExtraChars` **只算** 两上下文 + 三段条件规则，**不含** responseRules
 *      （这是「实际注入字符数」的观测口径，改了历史数据就不可比）。
 */
import { describe, expect, it } from 'vitest';
import { buildResponseRuleBlocks } from '../../src/views/BOHAI/engine/stages/response-rules';

const BASE = {
  hasForumEvidence: false,
  personalSupportMode: false,
  isPlanMode: false,
  latestForumSummaryMode: false,
  bohInternalFactualQuestion: false,
  shouldEnforceGrounding: false,
  operationQuestion: false,
  internalEvidenceChars: 0,
  webEvidenceChars: 0,
};

describe('BOHAI 回答约束块阶段（Step 5-2）', () => {
  it('通用 responseRules 恒存在；条件段默认不出现', () => {
    const r = buildResponseRuleBlocks(BASE);
    expect(r.responseRules).toContain('<constraints>');
    expect(r.responseRules).toContain('涉及社区事实时，优先依据检索内容回答。');
    expect(r.responseRules).not.toContain('发帖者信息指代');
    expect(r.responseRules).not.toContain('接住他的处境');
    expect(r.responseRules).not.toContain('Plan 模式下需要提问');
    expect(r.responseRules).not.toContain('[F5]');
  });

  it('四个开关各自点亮 responseRules 的对应条件段', () => {
    expect(buildResponseRuleBlocks({ ...BASE, hasForumEvidence: true }).responseRules).toContain(
      '发帖者信息指代',
    );
    expect(buildResponseRuleBlocks({ ...BASE, personalSupportMode: true }).responseRules).toContain(
      '接住他的处境',
    );
    expect(buildResponseRuleBlocks({ ...BASE, isPlanMode: true }).responseRules).toContain(
      'Plan 模式下需要提问',
    );
    expect(
      buildResponseRuleBlocks({ ...BASE, latestForumSummaryMode: true }).responseRules,
    ).toContain('[F5]');
  });

  it('三段条件规则各自按标志开关（默认空串）', () => {
    const off = buildResponseRuleBlocks(BASE);
    expect(off.communityRules).toBe('');
    expect(off.evidenceRules).toBe('');
    expect(off.operationRules).toBe('');

    expect(
      buildResponseRuleBlocks({ ...BASE, bohInternalFactualQuestion: true }).communityRules,
    ).toContain('依据检索到的资料回答');
    expect(
      buildResponseRuleBlocks({ ...BASE, shouldEnforceGrounding: true }).evidenceRules,
    ).toContain('优先基于检索到的资料回答');
    expect(buildResponseRuleBlocks({ ...BASE, operationQuestion: true }).operationRules).toContain(
      '给出入口路径和操作步骤',
    );
  });

  it('actualExtraChars = 两上下文 + 三段条件规则；全关且零字符时为 0', () => {
    expect(buildResponseRuleBlocks(BASE).actualExtraChars).toBe(0);

    const r = buildResponseRuleBlocks({
      ...BASE,
      bohInternalFactualQuestion: true,
      shouldEnforceGrounding: true,
      operationQuestion: true,
      internalEvidenceChars: 100,
      webEvidenceChars: 50,
    });
    expect(r.actualExtraChars).toBe(
      100 + 50 + r.communityRules.length + r.evidenceRules.length + r.operationRules.length,
    );
  });
});
