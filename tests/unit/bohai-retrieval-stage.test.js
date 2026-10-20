/**
 * bohai-retrieval-stage.test.js — 锁检索主体阶段（plans/025 v2 · Step 5-2 核心）
 *
 * 关键口径：
 *   ① 知识检索命中 → 返回 internalEvidenceContext / hasKnowledgeContext / refs，并写 ragTrace；
 *   ② 联网搜索 ok → searchResultCount / webEvidenceContext / webSearchVerified + 写 searchContext meta；
 *   ③ 联网未配置 → 复位 isSearching + 会话级去重提示；
 *   ④ 心理访谈封闭域 → **连检索都不启动**（communitySearchActive=false，不调 buildAutoKnowledgeContext）；
 *   ⑤ 检索失败 → 进度文案降级但不抛；
 *   ⑥ **进度闭包留在壳里**（stage 只调用，不持有 currentContent）。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runRetrievalStage } from '../../src/views/BOHAI/engine/stages/retrieval';

const CHAT_ENGINE = 'src/views/BOHAI/composables/useChatEngine.js';
const read = (relPath) => readFileSync(resolve(import.meta.dirname, '../..', relPath), 'utf8');

const makeDeps = (over = {}) => ({
  setProgressContent: vi.fn(),
  appendProgressContent: vi.fn(),
  updateContent: vi.fn(),
  resetGenerationStallTimeout: vi.fn(),
  markGenerationProgress: vi.fn(),
  runWebSearch: vi.fn(async () => ({ ok: true, count: 0, context: '', results: [] })),
  resolveKnowledgeRoutingPlan: vi.fn(() => ({ plan: {} })),
  getRetrievalTargetLabels: vi.fn(() => []),
  buildAutoKnowledgeContext: vi.fn(async () => ({ ok: true })),
  isLatestForumSummaryQuery: vi.fn(() => false),
  mergeAssistantMessageMeta: vi.fn(),
  updateAssistantActionNotes: vi.fn(),
  webSearchDisabledNoticeShownFor: new Set(),
  communitySearchActive: { value: false },
  // 活动行（2026-10-19）：stage 会写 deps.communityActivity.value，缺 stub 会 TypeError
  communityActivity: { value: { active: false, postTitle: '' } },
  isKnowledgeBaseEnabled: { value: false },
  isSearching: { value: false },
  requestController: new AbortController(),
  communityNeedsEvidence: false,
  ...over,
});

const makeOptions = (over = {}) => ({
  sessionIndex: 0,
  messageIndex: 1,
  userText: '你好',
  routingQueryText: '你好',
  enableSearch: false,
  webSearchQueryText: '',
  psychInterviewActive: false,
  autoDecision: null,
  ...over,
});

describe('BOHAI 检索主体阶段（Step 5-2）', () => {
  it('知识检索命中 → 返回证据上下文并写 ragTrace', async () => {
    const deps = makeDeps({
      buildAutoKnowledgeContext: vi.fn(async () => ({
        ok: true,
        retrievalPlan: { forum: true },
        routingReasons: ['r1'],
        connectorResults: [{ ok: true, connectorId: 'forum' }],
        retrievalTrace: { t: 1 },
        treeholeTotal: 0,
        sharedMemoryTotal: 0,
        userPrivateLabels: [],
        evidenceRefs: [{ url: 'u1' }],
        contextText: 'CTX',
      })),
    });
    const r = await runRetrievalStage(deps, makeOptions());
    expect(r.hasKnowledgeContext).toBe(true);
    expect(r.internalEvidenceContext).toBe('CTX');
    expect(r.groundingEvidenceRefs).toEqual([{ url: 'u1' }]);
    expect(deps.mergeAssistantMessageMeta).toHaveBeenCalledWith(0, 1, { ragTrace: { t: 1 } });
    // 目标标签来自 retrievalPlan.forum ⇒ 进度里有「社区帖子」
    expect(deps.appendProgressContent).toHaveBeenCalledWith(expect.stringContaining('社区帖子'));
  });

  it('联网 ok → 计数 / 上下文 / verified + 写 searchContext meta', async () => {
    const deps = makeDeps({
      runWebSearch: vi.fn(async () => ({
        ok: true,
        count: 2,
        context: 'WEB',
        results: [{ title: 'a', url: 'u' }],
      })),
    });
    const r = await runRetrievalStage(deps, makeOptions({ enableSearch: true }));
    expect(r.searchResultCount).toBe(2);
    expect(r.webEvidenceContext).toBe('WEB');
    expect(r.webSearchVerified).toBe(true);
    const metaCall = deps.mergeAssistantMessageMeta.mock.calls.find(
      (c) => c[2] && c[2].searchContext,
    );
    expect(metaCall).toBeTruthy();
    expect(metaCall[2].searchContext.query).toBe('你好');
  });

  it('联网未配置 → 复位 isSearching + 会话级去重提示', async () => {
    const deps = makeDeps({
      isSearching: { value: true },
      runWebSearch: vi.fn(async () => ({ disabled: true, message: '未配置' })),
    });
    await runRetrievalStage(deps, makeOptions({ enableSearch: true }));
    expect(deps.isSearching.value).toBe(false);
    expect(deps.updateAssistantActionNotes).toHaveBeenCalled();
    expect(deps.webSearchDisabledNoticeShownFor.has(0)).toBe(true);
  });

  it('心理访谈封闭域 → 连检索都不启动，且两条社区状态线都要清', async () => {
    // ⚠️ 初值必须**先置真**：两条线默认都是 false，拿默认值断言 false 恒成立 ⇒
    //    「漏清」这个缺陷根本测不出来（反证实测：删掉复位行，用默认值的版本仍然绿）。
    const deps = makeDeps({
      communitySearchActive: { value: true },
      communityActivity: { value: { active: true, postTitle: '上一轮的帖子' } },
    });
    const r = await runRetrievalStage(deps, makeOptions({ psychInterviewActive: true }));
    expect(deps.communitySearchActive.value).toBe(false);
    // ⚠️ 2026-10-19 活动行改版引进了第二条线（`communityActivity`）。
    //    当时只清了这一条、漏了上面那条，而这里只断言上面那条 ⇒ 测试照样绿。
    //    两条都得断，才守得住「访谈里不显示正在读社区」。
    expect(deps.communityActivity.value).toEqual({ active: false, postTitle: '' });
    expect(deps.buildAutoKnowledgeContext).not.toHaveBeenCalled();
    expect(r.internalEvidenceContext).toBe('');
  });

  it('活动行：社区读完即让位（active 归 false），帖名留给展开面复看', async () => {
    const deps = makeDeps({
      communityNeedsEvidence: true,
      buildAutoKnowledgeContext: vi.fn(async () => ({
        ok: true,
        retrievalPlan: { forum: true },
        routingReasons: [],
        connectorResults: [
          {
            ok: true,
            connectorId: 'forum',
            label: '社区帖子',
            total: 1,
            activityPostTitle: '周末线下聚会回顾',
            metadata: {},
          },
        ],
        retrievalTrace: null,
        treeholeTotal: 0,
        sharedMemoryTotal: 0,
        userPrivateLabels: [],
        evidenceRefs: [],
        contextText: '',
      })),
    });
    await runRetrievalStage(deps, makeOptions());
    // ⚠️ 这里必须是 false：若按 `retrievalPlan.forum` 重算，开关 ON 时它恒真，
    //    社区这一行会整轮压住后面的「正在思考」/「正在撰写回复」。
    expect(deps.communityActivity.value.active).toBe(false);
    expect(deps.communityActivity.value.postTitle).toBe('周末线下聚会回顾');
  });

  it('检索失败 → 进度降级但不抛', async () => {
    const deps = makeDeps({
      buildAutoKnowledgeContext: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const r = await runRetrievalStage(deps, makeOptions());
    expect(r.hasKnowledgeContext).toBe(false);
    expect(deps.appendProgressContent).toHaveBeenCalledWith(
      expect.stringContaining('站内检索暂时不可用'),
    );
  });

  it('communityNeedsEvidence 或站内知识总开关 → communitySearchActive 置真', async () => {
    const d1 = makeDeps({ communityNeedsEvidence: true });
    await runRetrievalStage(d1, makeOptions());
    expect(d1.communitySearchActive.value).toBe(true);

    const d2 = makeDeps({ isKnowledgeBaseEnabled: { value: true } });
    await runRetrievalStage(d2, makeOptions());
    expect(d2.communitySearchActive.value).toBe(true);
  });

  it('壳仍接线：调用该 stage，且进度闭包与 currentContent 留在壳里', () => {
    const code = read(CHAT_ENGINE);
    expect(code).toContain('await runRetrievalStage(');
    // 进度闭包必须在壳里定义（stage 只调用）——否则流式阶段的进度会丢
    expect(code).toContain('const setProgressContent =');
    expect(code).toContain('const appendProgressContent =');
  });
});
