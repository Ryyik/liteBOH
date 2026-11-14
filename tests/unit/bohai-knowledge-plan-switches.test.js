import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyKnowledgeSourceSwitches } from '@/views/BOHAI/composables/knowledge-plan-switches.js';
import {
  MEMORY_RERANK_FLOOR,
  filterChunksByRerankFloor,
} from '@/views/BOHAI/composables/chat-engine-config.js';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

// 官方记忆开关语义守卫（2026-10-17 用户报告：「官方记忆开着，第二次问 AI 就不从记忆库找了」）。
// 旧行为：开关只能"关"（off ⇒ memory/siteGuide 强制 false），"开"时仍由
// shouldUseMemoryContext 的关键词路由决定 ⇒ 第二问措辞没命中就静默跳过。
// 新语义：开关 ON = 显式用户意图，站内知识每条消息必查（压过路由）；OFF 维持强制关闭。
//
// 2026-10-19 合并：原「官方记忆」「社区搜索」「社区知识」三个开关合并为一个 ——
// 故 ON 时 memory（官方事实/知识库/论坛记忆）、forum（社区帖子）、sharedMemory（AI 公共记忆）
// 三者一并强制必查。
// 反证：把 knowledge-plan-switches.js 里 ON 分支的 `next.memory = true` 改成 false → 第 2 条必红。

describe('知识源开关 → 检索计划（applyKnowledgeSourceSwitches）', () => {
  const routedPlan = {
    treehole: false,
    sharedMemory: true,
    memory: false, // 路由判「这问不像社区问题」
    siteGuide: false,
    forum: false,
    userPrivate: false,
    activities: true,
  };

  it('开关 ON：memory / forum / sharedMemory 强制必查，压过路由的 false', () => {
    const next = applyKnowledgeSourceSwitches(routedPlan, { knowledgeBaseEnabled: true });
    expect(next.memory).toBe(true);
    expect(next.forum).toBe(true);
    expect(next.sharedMemory).toBe(true);
  });

  it('开关 ON：不越权改其余源（siteGuide / treehole / userPrivate / activities 保持路由判定）', () => {
    const next = applyKnowledgeSourceSwitches(routedPlan, { knowledgeBaseEnabled: true });
    expect(next.siteGuide).toBe(false);
    expect(next.activities).toBe(true);
    expect(next.treehole).toBe(false);
    expect(next.userPrivate).toBe(false);
  });

  it('开关 OFF：memory / siteGuide / forum / sharedMemory 强制关闭', () => {
    const next = applyKnowledgeSourceSwitches(
      { ...routedPlan, memory: true, siteGuide: true, forum: true, sharedMemory: true },
      { knowledgeBaseEnabled: false },
    );
    expect(next.memory).toBe(false);
    expect(next.siteGuide).toBe(false);
    expect(next.forum).toBe(false);
    expect(next.sharedMemory).toBe(false);
  });

  it('不原地修改传入计划（调用方可安全复用原对象）', () => {
    const original = { ...routedPlan };
    applyKnowledgeSourceSwitches(routedPlan, { knowledgeBaseEnabled: true });
    expect(routedPlan).toEqual(original);
  });

  it('接线守卫：buildAutoKnowledgeContext 确实调用了开关应用', () => {
    const retrieval = read('src/views/BOHAI/composables/useKnowledgeRetrieval.js');
    expect(retrieval).toContain('applyKnowledgeSourceSwitches');
    expect(retrieval).toMatch(
      /applyKnowledgeSourceSwitches\(retrievalPlan,\s*\{\s*knowledgeBaseEnabled:\s*isKnowledgeBaseEnabled\.value/,
    );
  });
});

describe('记忆上下文 · 重排地板（filterChunksByRerankFloor）', () => {
  // 2026-10-17 准确度实测：minSimilarity 0.1 宽召回下，负样本（天气/写诗）的噪声块
  // sim 仍达 0.34-0.46，但重排分归零（0.000-0.004）；真实命中最低 0.195。
  // ⇒ 注入前按 rerankScore >= 0.05 过滤，无 rerankScore（重排被跳过）的块不滤。
  it('滤掉重排分低于地板的噪声块，保留真实命中', () => {
    const chunks = [
      { content: '真实命中', rerankScore: 0.9 },
      { content: '噪声块 A', rerankScore: 0.004 },
      { content: '边界块', rerankScore: MEMORY_RERANK_FLOOR + 0.01 },
      { content: '噪声块 B', rerankScore: 0 },
    ];
    const kept = filterChunksByRerankFloor(chunks);
    expect(kept.map((c) => c.content)).toEqual(['真实命中', '边界块']);
  });

  it('无 rerankScore 的块不滤（重排被跳过时保持原召回）', () => {
    const chunks = [{ content: 'A' }, { content: 'B', rerankScore: undefined }];
    expect(filterChunksByRerankFloor(chunks)).toHaveLength(2);
  });

  it('非数组输入安全返回空数组', () => {
    expect(filterChunksByRerankFloor(null)).toEqual([]);
    expect(filterChunksByRerankFloor(undefined)).toEqual([]);
  });

  it('接线守卫：getMemoryContext 先过滤再注入（2026-11-12 起空召回不再无脑返回）', () => {
    const retrieval = read('src/views/BOHAI/composables/useKnowledgeRetrieval.js');
    // 2026-11-12：地板前插了一层「字面精确词重排」（年份 / 型号 / 英文专名），
    // 所以入参从 `chunks` 变成 `rankChunksByExactTerms(candidates, queryText)`。
    // 口径不变：**注入前必须过滤**，且注入的必须是过滤后那批。
    expect(retrieval).toMatch(
      /filterChunksByRerankFloor\(\s*rankChunksByExactTerms\(candidates, queryText\)\s*\)/,
    );
    // 注入进上下文的必须是**过滤后**的那批（不是宽召回原文）
    expect(retrieval).toMatch(/buildVectorKnowledgeContext\(\s*'[^']*',\s*relevantChunks/);
    // 口径变更：管理员调试态下要能看到「空召回」本身，所以不允许再直接 return ''
    // （这条与 bohai-knowledge-debug.test.js 的第三条接线断言互为双保险）
    expect(retrieval).not.toMatch(/relevantChunks\.length === 0\)\s*return\s*''\s*;/);
  });
});
