/**
 * bohai-memory-supersede-capture.test.js — 锁自动沉淀路径的「同主题改口」写决策（plans/044 · 阶段 0 B）
 *
 * 背景：自动沉淀（captureTreeholeMemoriesFromDialogue）此前只有「重复 → 跳过」一个出口，
 * 用户改口后旧公共记忆永久占位、AI 持续答错。显式指令路径 2026-10-08 已补 supersede
 * （归档旧 + 写新），本测试锁的是自动沉淀路径接上的同一套判定 —— 真源
 * `src/utils/memory/memory-supersede.js`（从 views/BOHAI/utils/memory/dedupe.js 下沉）。
 *
 * 三条关键契约：
 *   - exact  ⇒ 跳过（与现行 isLikelyDuplicateText 命中同语义，只提前短路）
 *   - supersede ⇒ supersededMemory 必须是**带 id 的那条**（无 id 时调用方退化成并存写入）
 *   - none   ⇒ 走原有联合去重闸（现行跳过行为全部保留，本改动只新增 supersede 分支）
 */
import { describe, expect, it } from 'vitest';
import { resolveSharedCandidateWrite } from '@/utils/memory/memory-supersede.js';
// 下沉后 dedupe.js 必须 re-export 同一批函数（useChatEngine / useActionDraft 的 import 一行没改）
import { classifyMemoryWrite } from '@/views/BOHAI/utils/memory/dedupe.js';

describe('resolveSharedCandidateWrite（自动沉淀的写决策）', () => {
  const SHARED_ROWS = [
    { id: 'row-1', content: '我现在住在上海' },
    { id: 'row-2', content: '我养了一只猫' },
  ];

  it('同一句话说两遍 ⇒ exact（跳过，不归档不重写）', () => {
    expect(resolveSharedCandidateWrite('我现在住在上海', SHARED_ROWS)).toEqual({
      kind: 'exact',
      supersededMemory: null,
    });
  });

  it('标点/语气词差异也算 exact（真重复不受影响）', () => {
    expect(resolveSharedCandidateWrite('我现在住在上海！', SHARED_ROWS).kind).toBe('exact');
    expect(resolveSharedCandidateWrite('我现在住在上海哈', SHARED_ROWS).kind).toBe('exact');
  });

  it('同主题改口 ⇒ supersede，且定位到带 id 的旧行', () => {
    const result = resolveSharedCandidateWrite('我现在住在北京', SHARED_ROWS);
    expect(result.kind).toBe('supersede');
    expect(result.supersededMemory?.id).toBe('row-1');
    expect(result.supersededMemory?.content).toBe('我现在住在上海');
  });

  it('多条同主题时选「最同主题」的那条，不按顺序归档错对象', () => {
    const rows = [
      { id: 'row-a', content: '我养了一只猫' },
      { id: 'row-b', content: '我现在住在上海市浦东新区' },
    ];
    const result = resolveSharedCandidateWrite('我现在住在广州', rows);
    expect(result.kind).toBe('supersede');
    expect(result.supersededMemory?.id).toBe('row-b');
  });

  it('完全无关的新事实 ⇒ none（走原有写新流程，不碰任何旧行）', () => {
    expect(resolveSharedCandidateWrite('我这周开始学吉他', SHARED_ROWS)).toEqual({
      kind: 'none',
      supersededMemory: null,
    });
  });

  it('无关事实不得误判成改口（2026-10-08 长度比教训的回归锁）', () => {
    // 长度相近（8 vs 7，比值 0.875）但主题无关 —— 旧第一版算法在这里误归档「住上海」
    const rows = [{ id: 'row-x', content: '我现在住在上海' }];
    expect(resolveSharedCandidateWrite('我这周开始学吉他', rows).kind).toBe('none');
  });

  it('空输入 ⇒ none（不抛）', () => {
    expect(resolveSharedCandidateWrite('', SHARED_ROWS).kind).toBe('none');
    expect(resolveSharedCandidateWrite('我现在住在北京', [])).toEqual({
      kind: 'none',
      supersededMemory: null,
    });
  });

  it('旧行缺 id 时照常返回 supersede 行，由调用方按 supersededMemory.id 判退化（并存写入）', () => {
    const result = resolveSharedCandidateWrite('我现在住在北京', [{ content: '我现在住在上海' }]);
    expect(result.kind).toBe('supersede');
    // 契约只要求 id falsy ⇒ 调用方退化成并存写入（真实 API 行经 normalizeSharedMemoryRow
    // 归一化后 id 为 ''，裸对象测试下为 undefined —— 两者都必须 falsy）
    expect(result.supersededMemory?.id).toBeFalsy();
  });
});

describe('下沉后的单一真源（dedupe.js re-export 与 utils 层同源）', () => {
  it('views 侧 re-export 的 classifyMemoryWrite 与 utils 层判定一致', () => {
    // 改口场景走 re-export 入口（useChatEngine 显式指令路径的 import 路径）必须拿到同一套语义
    expect(
      classifyMemoryWrite('我现在住在北京', [{ id: 'row-1', content: '我现在住在上海' }]),
    ).toBe('supersede');
    expect(classifyMemoryWrite('我现在住在上海', [{ content: '我现在住在上海' }])).toBe('exact');
    expect(classifyMemoryWrite('我这周开始学吉他', [{ content: '我现在住在上海' }])).toBe('none');
  });
});
