import { describe, it, expect } from 'vitest';
import {
  isLikelyBohInternalFactualQuestion,
  isLikelyBohInternalQuestion,
  isLikelyFactualQuestion,
  hasUnsupportedCommunityEvidenceClaim,
  sanitizeUnsupportedCommunityEvidenceClaims,
  shouldRepairUngroundedReply,
  resolveKnowledgeRoutingPlanCore
} from '../../src/utils/ai-chat-grounding.js';

describe('ai-chat-grounding: routing', () => {
  it('keeps operation priority and disables forum/memory/sharedMemory for operation questions', () => {
    const { plan, reasons } = resolveKnowledgeRoutingPlanCore({
      basePlan: {
        treehole: true,
        sharedMemory: true,
        memory: true,
        siteGuide: false,
        forum: true,
        userPrivate: false
      },
      operation: true,
      community: true,
      forumRealtime: true,
      communityHistory: true,
      hasSharedMemoryTrigger: true
    });

    expect(plan.siteGuide).toBe(true);
    expect(plan.sharedMemory).toBe(false);
    expect(plan.memory).toBe(false);
    expect(plan.forum).toBe(false);
    expect(plan.treehole).toBe(true);
    expect(reasons).toContain('操作问题 -> 优先读取站点操作知识库');
    expect(reasons).toContain('个人复盘/情绪习惯问题 -> 读取 BOH Cloud+ 私有内容');
    expect(reasons).not.toContain('社区实时动态问题 -> 读取论坛帖子');
  });

  it('keeps userPrivate in operation flow and uses operation-specific private reason', () => {
    const { plan, reasons } = resolveKnowledgeRoutingPlanCore({
      basePlan: {
        treehole: false,
        sharedMemory: false,
        memory: false,
        siteGuide: false,
        forum: false,
        userPrivate: true
      },
      operation: true,
      community: false,
      forumRealtime: false,
      communityHistory: false,
      hasSharedMemoryTrigger: false
    });

    expect(plan.userPrivate).toBe(true);
    expect(reasons).toContain('操作中包含账号诉求 -> 同步读取当前登录用户数据');
    expect(reasons).not.toContain('账号私域问题 -> 读取当前登录用户数据');
  });

  it('routes community history to shared memory without also pulling core memory', () => {
    const { plan, reasons } = resolveKnowledgeRoutingPlanCore({
      basePlan: {
        treehole: false,
        sharedMemory: false,
        memory: true,
        siteGuide: false,
        forum: false,
        userPrivate: false
      },
      operation: false,
      community: true,
      forumRealtime: false,
      communityHistory: true,
      hasSharedMemoryTrigger: false
    });

    expect(plan.sharedMemory).toBe(true);
    expect(plan.memory).toBe(false);
    expect(reasons).toContain('社区历史事实问题 -> 读取公共记忆库');
    expect(reasons).not.toContain('社区背景/成员问答 -> 读取核心记忆库');
  });
});

describe('ai-chat-grounding: repair gating', () => {
  it('accepts internal and search citations, but rejects generic numeric bracket refs', () => {
    const internalOk = shouldRepairUngroundedReply('结论来自内部资料 [S1]', {
      evidenceRefSet: new Set(['S1']),
      maxSearchRef: 0,
      minRequiredCitations: 1
    });
    const searchOk = shouldRepairUngroundedReply('结论来自联网结果 [W1]', {
      evidenceRefSet: new Set(),
      maxSearchRef: 2,
      minRequiredCitations: 1
    });
    const genericNumeric = shouldRepairUngroundedReply('结论见 [1]', {
      evidenceRefSet: new Set(),
      maxSearchRef: 2,
      minRequiredCitations: 1
    });

    expect(internalOk).toBe(false);
    expect(searchOk).toBe(false);
    expect(genericNumeric).toBe(true);
  });

  it('does not force repair for uncertainty-only reply, but repairs mixed uncertainty plus assertion', () => {
    const uncertaintyOnly = shouldRepairUngroundedReply('未检索到明确依据。', {
      evidenceRefSet: new Set(['S1']),
      maxSearchRef: 0,
      minRequiredCitations: 1
    });
    const mixedAssertion = shouldRepairUngroundedReply('未检索到明确依据。\n建议直接这样做。', {
      evidenceRefSet: new Set(['S1']),
      maxSearchRef: 0,
      minRequiredCitations: 1
    });

    expect(uncertaintyOnly).toBe(false);
    expect(mixedAssertion).toBe(true);
  });
});

describe('ai-chat-grounding: community evidence guard', () => {
  it('detects fabricated forum users and post links when no forum evidence is available', () => {
    const fabricated = '论坛里 @resonance_breath 分享过共振呼吸法，查看帖子：https://boh.community/post/123456 [F1]';

    expect(hasUnsupportedCommunityEvidenceClaim(fabricated, {
      availableEvidenceRefs: []
    })).toBe(true);

    expect(hasUnsupportedCommunityEvidenceClaim(fabricated, {
      availableEvidenceRefs: ['F1']
    })).toBe(false);
  });

  it('replaces unsupported forum evidence claims with a safe uncertainty notice', () => {
    const fabricated = '可以参考论坛用户 @resonance_breath 的分享。查看帖子：https://boh.community/post/123456';
    const cleaned = sanitizeUnsupportedCommunityEvidenceClaims(fabricated, {
      availableEvidenceRefs: []
    });

    expect(cleaned).toContain('这部分内容未经检索确认，已省略');
    expect(cleaned).not.toContain('@resonance_breath');
    expect(cleaned).not.toContain('boh.community/post/123456');
  });

  it('keeps ordinary unsupported-free guidance untouched', () => {
    const reply = '共振呼吸可以先从慢吸慢呼开始，找一个舒服节奏，不需要憋气。';

    expect(sanitizeUnsupportedCommunityEvidenceClaims(reply, {
      availableEvidenceRefs: []
    })).toBe(reply);
  });
});

describe('ai-chat-grounding: factual question detection', () => {
  it('marks operation questions and fact-seeking questions as factual, while leaving casual generation false', () => {
    expect(isLikelyFactualQuestion('如何进入用户空间', { operationQuestion: true })).toBe(true);
    expect(isLikelyFactualQuestion('最新公告是什么')).toBe(true);
    expect(isLikelyFactualQuestion('帮我写一段生日祝福')).toBe(false);
  });

  it('detects BOH internal factual questions for stricter grounding', () => {
    expect(isLikelyBohInternalQuestion('BOH Cloud+ 是什么')).toBe(true);
    expect(isLikelyBohInternalFactualQuestion('方块之家最近有什么活动')).toBe(true);
    expect(isLikelyBohInternalFactualQuestion('怎么查看我的礼物状态', { operationQuestion: true })).toBe(true);
    expect(isLikelyBohInternalFactualQuestion('帮我写一段 BOH 周年庆祝福文案')).toBe(false);
  });
});
