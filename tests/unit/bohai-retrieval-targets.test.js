/**
 * bohai-retrieval-targets.test.js — 锁检索目标标签阶段（plans/025 v2 · Step 5-2）
 *
 * 关键口径：**顺序 = 展示顺序**（Cloud+ → 公共记忆 → 记忆库 → 操作手册 → 社区帖子 → 私域 → Health），
 * 且 `healthAnalysisActive` 只在「health 命中且 total>0」时为 true（它决定要不要注入健康附录）。
 */
import { describe, expect, it } from 'vitest';
import { computeRetrievalTargets } from '../../src/views/BOHAI/engine/stages/retrieval-targets';

const base = (over = {}) => ({
  retrievalPlan: {},
  treeholeTotal: 0,
  sharedMemoryTotal: 0,
  userPrivateLabels: [],
  successfulConnectorResults: [],
  ...over,
});

describe('BOHAI 检索目标标签阶段（Step 5-2）', () => {
  it('空计划 → 无标签、健康开关关', () => {
    const r = computeRetrievalTargets(base());
    expect(r.targets).toEqual([]);
    expect(r.healthAnalysisActive).toBe(false);
  });

  it('Cloud+ 有条数带括号、无条数不带', () => {
    expect(
      computeRetrievalTargets(base({ retrievalPlan: { treehole: true }, treeholeTotal: 3 }))
        .targets,
    ).toEqual(['BOH Cloud+(3条)']);
    expect(
      computeRetrievalTargets(base({ retrievalPlan: { treehole: true }, treeholeTotal: 0 }))
        .targets,
    ).toEqual(['BOH Cloud+']);
  });

  it('标签顺序 = 展示顺序（全源命中）', () => {
    const r = computeRetrievalTargets(
      base({
        retrievalPlan: {
          treehole: true,
          sharedMemory: true,
          memory: true,
          siteGuide: true,
          forum: true,
          userPrivate: true,
          health: true,
        },
        treeholeTotal: 2,
        sharedMemoryTotal: 1,
        userPrivateLabels: ['健康记录', '日程', '笔记', '第四个不该出现'],
        successfulConnectorResults: [{ connectorId: 'health', ok: true, total: 5 }],
      }),
    );
    expect(r.targets).toEqual([
      'BOH Cloud+(2条)',
      'AI公共记忆(1条)',
      '记忆库',
      '操作手册',
      '社区帖子',
      '健康记录',
      '日程',
      '笔记',
      'BOH Health(5组)',
    ]);
    expect(r.healthAnalysisActive).toBe(true);
  });

  it('私域标签只取前 3 个', () => {
    const r = computeRetrievalTargets(
      base({ retrievalPlan: { userPrivate: true }, userPrivateLabels: ['a', 'b', 'c', 'd'] }),
    );
    expect(r.targets).toEqual(['a', 'b', 'c']);
  });

  it('health 命中但 total=0 → 不加标签也不开开关', () => {
    const r = computeRetrievalTargets(
      base({
        retrievalPlan: { health: true },
        successfulConnectorResults: [{ connectorId: 'health', ok: true, total: 0 }],
      }),
    );
    expect(r.targets).toEqual([]);
    expect(r.healthAnalysisActive).toBe(false);
  });
});
