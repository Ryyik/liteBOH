import { describe, expect, it } from 'vitest';
import {
  AGENT_CLUSTER_MODE,
  AGENT_CLUSTER_PLAN_STRATEGY,
  AGENT_CLUSTER_BUDGET_TIER,
  isFanoutTrigger,
  resolveClusterMode,
  estimateClusterBudget,
} from '../../src/views/BOHAI/agents/core/agent-cluster-config.js';

describe('agent-cluster-config: isFanoutTrigger', () => {
  it('returns false for empty string', () => {
    expect(isFanoutTrigger('')).toBe(false);
  });

  it('returns true for summary keywords', () => {
    expect(isFanoutTrigger('帮我总结一下最近的生活')).toBe(true);
  });

  it('returns true for analysis keywords', () => {
    expect(isFanoutTrigger('帮我分析一下最近的状态')).toBe(true);
  });

  it('returns true for forum post keywords', () => {
    expect(isFanoutTrigger('帮我发个帖子')).toBe(true);
  });

  it('returns true for comparison keywords', () => {
    expect(isFanoutTrigger('对比一下这两个方案')).toBe(true);
  });

  it('returns true for design/architecture keywords', () => {
    expect(isFanoutTrigger('给我一个设计方案')).toBe(true);
  });

  it('returns false for simple chat', () => {
    expect(isFanoutTrigger('你好')).toBe(false);
    expect(isFanoutTrigger('今天天气怎么样')).toBe(false);
  });
});

describe('agent-cluster-config: resolveClusterMode', () => {
  it('returns SINGLE when user prefers single', () => {
    expect(resolveClusterMode('single', true)).toBe('single');
    expect(resolveClusterMode('single', false)).toBe('single');
  });

  it('returns MULTI when user prefers multi', () => {
    expect(resolveClusterMode('multi', false)).toBe('multi');
    expect(resolveClusterMode('multi', true)).toBe('multi');
  });

  it('returns MULTI for auto when fanout trigger', () => {
    expect(resolveClusterMode('auto', true)).toBe('multi');
  });

  it('returns SINGLE for auto when not fanout', () => {
    expect(resolveClusterMode('auto', false)).toBe('single');
  });

  it('defaults to auto mode', () => {
    expect(resolveClusterMode(undefined, true)).toBe('multi');
    expect(resolveClusterMode(undefined, false)).toBe('single');
  });
});

describe('agent-cluster-config: estimateClusterBudget', () => {
  it('returns HIGH for 5+ agents', () => {
    expect(estimateClusterBudget({ agentCount: 5 })).toBe(AGENT_CLUSTER_BUDGET_TIER.HIGH);
  });

  it('returns HIGH for 12000+ chars', () => {
    expect(estimateClusterBudget({ agentCount: 1, totalInputChars: 12000 })).toBe(AGENT_CLUSTER_BUDGET_TIER.HIGH);
  });

  it('returns NORMAL for 3-4 agents', () => {
    expect(estimateClusterBudget({ agentCount: 3 })).toBe(AGENT_CLUSTER_BUDGET_TIER.NORMAL);
    expect(estimateClusterBudget({ agentCount: 4 })).toBe(AGENT_CLUSTER_BUDGET_TIER.NORMAL);
  });

  it('returns NORMAL for 6000-11999 chars', () => {
    expect(estimateClusterBudget({ agentCount: 1, totalInputChars: 6000 })).toBe(AGENT_CLUSTER_BUDGET_TIER.NORMAL);
  });

  it('returns LOW for small inputs', () => {
    expect(estimateClusterBudget({ agentCount: 1, totalInputChars: 100 })).toBe(AGENT_CLUSTER_BUDGET_TIER.LOW);
  });

  it('returns LOW for empty defaults', () => {
    expect(estimateClusterBudget()).toBe(AGENT_CLUSTER_BUDGET_TIER.LOW);
  });
});

describe('agent-cluster-config: constants', () => {
  it('AGENT_CLUSTER_MODE has expected values', () => {
    expect(AGENT_CLUSTER_MODE.SINGLE).toBe('single');
    expect(AGENT_CLUSTER_MODE.MULTI).toBe('multi');
    expect(AGENT_CLUSTER_MODE.AUTO).toBe('auto');
  });

  it('AGENT_CLUSTER_PLAN_STRATEGY has expected values', () => {
    expect(AGENT_CLUSTER_PLAN_STRATEGY.SINGLE).toBe('single_worker');
    expect(AGENT_CLUSTER_PLAN_STRATEGY.FANOUT).toBe('fanout');
    expect(AGENT_CLUSTER_PLAN_STRATEGY.DEGRADED).toBe('degraded');
  });
});