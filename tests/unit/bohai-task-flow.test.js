import { describe, it, expect } from 'vitest';
import {
  extractTaskFlowFromText,
  shouldSuggestTaskFlow,
  buildTextFromTaskFlow,
  validateTaskFlow,
  TASK_FLOW_STEPS
} from '../../src/utils/bohai-task-flow.js';

describe('bohai-task-flow: extractTaskFlowFromText', () => {
  it('extracts from ## headings (Chinese)', () => {
    const text = `## 分析
项目结构老旧,代码耦合严重。

## 方案
分三步重构:抽公共组件、拆服务、加单测。

## 实施
- 删除 /legacy 目录
- 拆分 services/user.js

## 验证
跑 npm test,期望 100% 通过。`;
    const flow = extractTaskFlowFromText(text);
    expect(flow.hasStructure).toBe(true);
    expect(flow.analyze).toContain('项目结构老旧');
    expect(flow.plan).toContain('分三步重构');
    expect(flow.implement).toContain('删除 /legacy 目录');
    expect(flow.verify).toContain('跑 npm test');
  });

  it('extracts from ## headings (English)', () => {
    const text = `## Analyze
Memory leak in worker pool.

## Plan
Add explicit cleanup in shutdown handler.

## Implement
\`\`\`js
process.on('SIGTERM', cleanup);
\`\`\`

## Verify
Run load test, memory should plateau.`;
    const flow = extractTaskFlowFromText(text);
    expect(flow.analyze).toContain('Memory leak');
    expect(flow.plan).toContain('cleanup');
    expect(flow.implement).toContain('SIGTERM');
    expect(flow.verify).toContain('load test');
  });

  it('extracts from numbered **bold** pattern', () => {
    const text = `1. **根因分析**: null reference
2. **修复实施**: 加判空
3. **验证步骤**: 跑单测`;
    const flow = extractTaskFlowFromText(text);
    expect(flow.analyze).toContain('null reference');
    expect(flow.implement).toContain('加判空');
    expect(flow.verify).toContain('跑单测');
  });

  it('extracts from emoji-prefixed sections', () => {
    const text = `🔍 项目里有过期的 npm 包
📋 升级到最新 LTS
🛠 npm update 一下
✅ 重启服务确认无报错`;
    const flow = extractTaskFlowFromText(text);
    expect(flow.analyze).toContain('过期的 npm 包');
    expect(flow.plan).toContain('升级到最新 LTS');
    expect(flow.implement).toContain('npm update');
    expect(flow.verify).toContain('重启服务');
  });

  it('returns empty when no recognizable structure', () => {
    const flow = extractTaskFlowFromText('Just a regular paragraph.');
    expect(flow.hasStructure).toBe(false);
    expect(flow.analyze).toBe('');
    expect(flow.plan).toBe('');
    expect(flow.implement).toBe('');
    expect(flow.verify).toBe('');
  });

  it('handles partial structure', () => {
    const text = `## 分析
问题定位完毕

## 其他
剩下的内容`;
    const flow = extractTaskFlowFromText(text);
    expect(flow.analyze).toBeTruthy();
    expect(flow.plan).toBe('');
    expect(flow.implement).toBe('');
    expect(flow.verify).toBe('');
  });
});

describe('bohai-task-flow: shouldSuggestTaskFlow', () => {
  it('suggests when 2+ steps detected', () => {
    const text = `## 分析
x
## 方案
y`;
    const r = shouldSuggestTaskFlow(text);
    expect(r.suggest).toBe(true);
    expect(r.reason).toBe('multi-step-detected');
  });

  it('suggests when user asked for steps', () => {
    const r = shouldSuggestTaskFlow('随便聊两句', { userAskedForSteps: true });
    expect(r.suggest).toBe(true);
    expect(r.reason).toBe('user-or-plan-context');
  });

  it('suggests when last routed mode was Plan', () => {
    const r = shouldSuggestTaskFlow('随便聊两句', { lastRoutedMode: 'plan' });
    expect(r.suggest).toBe(true);
  });

  it('does NOT suggest for plain chat', () => {
    const r = shouldSuggestTaskFlow('今天天气真好');
    expect(r.suggest).toBe(false);
    expect(r.reason).toBe('not-applicable');
  });
});

describe('bohai-task-flow: buildTextFromTaskFlow', () => {
  it('rebuilds markdown from 4 steps', () => {
    const flow = {
      analyze: '问题',
      plan: '方案',
      implement: '实施',
      verify: '验证'
    };
    const text = buildTextFromTaskFlow(flow);
    expect(text).toContain('## 分析\n\n问题');
    expect(text).toContain('## 方案\n\n方案');
    expect(text).toContain('## 实施\n\n实施');
    expect(text).toContain('## 验证\n\n验证');
  });

  it('skips empty steps', () => {
    const flow = { analyze: 'a', plan: '', implement: '', verify: 'v' };
    const text = buildTextFromTaskFlow(flow);
    expect(text).not.toContain('## 方案');
    expect(text).toContain('## 分析');
    expect(text).toContain('## 验证');
  });
});

describe('bohai-task-flow: validateTaskFlow', () => {
  it('flags missing steps', () => {
    const r = validateTaskFlow({ analyze: 'a', plan: '', implement: 'i', verify: '' });
    expect(r.valid).toBe(false);
    expect(r.missing).toHaveLength(2);
    expect(r.missing.map((s) => s.id)).toEqual(['plan', 'verify']);
  });

  it('passes when all filled', () => {
    const r = validateTaskFlow({ analyze: 'a', plan: 'p', implement: 'i', verify: 'v' });
    expect(r.valid).toBe(true);
    expect(r.missing).toEqual([]);
  });
});

describe('bohai-task-flow: TASK_FLOW_STEPS', () => {
  it('exposes 4 steps in fixed order', () => {
    expect(TASK_FLOW_STEPS.map((s) => s.id)).toEqual(['analyze', 'plan', 'implement', 'verify']);
  });
});
