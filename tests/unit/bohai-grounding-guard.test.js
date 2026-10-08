/**
 * bohai-grounding-guard.test.js — 锁依据护栏（plans/025 v2 · Step 5-3）
 *
 * 关键口径（三条语义不可改）：
 *   ① 心理访谈是**封闭域** ⇒ `noInternalEvidence` 时**不加**「未检索到相关站内资料」尾巴；
 *   ② `needsInternalEvidence` 且零引用 ⇒ 返回**固定话术**（不凭印象补全 BOH 内部内容）；
 *   ③ 其余分支原样放行（只可能前置「联网未验证」）。
 */
import { describe, expect, it } from 'vitest';
import { buildGroundingGuards } from '../../src/views/BOHAI/engine/stages/grounding-guard';

const BASE = {
  groundingEvidenceRefs: [],
  searchResultCount: 0,
  enableSearch: false,
  factualQuestion: false,
  webSearchVerified: false,
  communityNeedsEvidence: false,
  bohInternalFactualQuestion: false,
  psychInterviewActive: false,
  shouldEnforceGrounding: false,
};

describe('BOHAI 依据护栏（Step 5-3）', () => {
  it('引用集合大写归一；联网引用数夹到 0~9', () => {
    const g = buildGroundingGuards({
      ...BASE,
      groundingEvidenceRefs: ['f1', 'F2'],
      searchResultCount: 42,
      enableSearch: true,
    });
    expect([...g.groundingRefSet].sort()).toEqual(['F1', 'F2']);
    expect(g.maxSearchCitationRef).toBe(9);
    expect(g.totalGroundingRefCount).toBe(11);
  });

  it('noInternalEvidence 分支**优先**：需内部证据且零引用 → 追加不确定声明（保留原回答）', () => {
    const g = buildGroundingGuards({ ...BASE, communityNeedsEvidence: true });
    expect(g.noInternalEvidence).toBe(true);
    const out = g.ensureGroundedReply('随便写点什么');
    expect(out).toContain('随便写点什么');
    expect(out).toContain('未检索到相关站内资料');
  });

  it('⭐ 「未检索到明确依据」固定话术分支**不可达**（noInternalEvidence 已先捕获）', () => {
    // 不变式：needsInternalEvidence && total<=0 ⇒ noInternalEvidence=true ⇒ 必走第一分支。
    // 而该分支要求 !noInternalEvidence 且 total<=0 且 needsInternalEvidence —— 三者矛盾。
    // ⇒ 逐字保留（行为不变），但**记录这是死分支**（如需启用须先改 noInternalEvidence 的判据）。
    for (const communityNeedsEvidence of [false, true]) {
      for (const bohInternalFactualQuestion of [false, true]) {
        for (const refs of [[], ['F1']]) {
          const g = buildGroundingGuards({
            ...BASE,
            communityNeedsEvidence,
            bohInternalFactualQuestion,
            groundingEvidenceRefs: refs,
            shouldEnforceGrounding: true,
          });
          expect(g.ensureGroundedReply('X')).not.toContain('未检索到明确依据');
        }
      }
    }
  });

  it('心理访谈封闭域 → 不加「未检索到相关站内资料」尾巴', () => {
    const g = buildGroundingGuards({
      ...BASE,
      communityNeedsEvidence: true,
      psychInterviewActive: true,
    });
    const out = g.ensureGroundedReply('访谈回答');
    expect(out).toBe('访谈回答');
  });

  it('非访谈且无内部证据 → 追加不确定声明', () => {
    const g = buildGroundingGuards({ ...BASE, communityNeedsEvidence: true });
    const out = g.ensureGroundedReply('普通回答');
    expect(out).toContain('普通回答');
    expect(out).toContain('未检索到相关站内资料');
  });

  it('联网未返回可用结果 → 前置「未经过实时网络验证」', () => {
    const g = buildGroundingGuards({
      ...BASE,
      enableSearch: true,
      factualQuestion: true,
      webSearchVerified: false,
    });
    expect(g.ensureGroundedReply('答案')).toContain('未经过实时网络验证');
  });

  it('空回复 → 只返回 note（trim）', () => {
    const g = buildGroundingGuards({ ...BASE });
    expect(g.ensureGroundedReply('')).toBe('');
  });

  it('有引用且需强制依据 → 原样放行', () => {
    const g = buildGroundingGuards({
      ...BASE,
      groundingEvidenceRefs: ['F1'],
      shouldEnforceGrounding: true,
    });
    expect(g.ensureGroundedReply('有依据的回答')).toBe('有依据的回答');
  });
});
