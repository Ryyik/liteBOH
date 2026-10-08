/**
 * bohai-evidence-reuse.test.js — 锁跨轮证据复用 + 时效护栏 + 搜索状态兜底
 * （plans/025 v2 · Step 5-2）
 *
 * 三条顺序不可换：复用 → 时效护栏 → 状态兜底。
 * 最要命的一条：**时效词（最新/最近/今天…）必须禁止复用**，否则模型会拿上一轮的旧帖冒充「最新」。
 */
import { describe, expect, it } from 'vitest';
import { resolveCrossTurnEvidence } from '../../src/views/BOHAI/engine/stages/evidence-reuse';

const base = (over = {}) => ({
  internalEvidenceContext: '',
  webEvidenceContext: '',
  groundingEvidenceRefs: [],
  searchResultCount: 0,
  webSearchVerified: false,
  routingQueryText: '你好',
  historyMessagesForCurrentTurn: [],
  enableSearch: false,
  webSearchResult: null,
  ...over,
});

const prevAssistant = (meta) => [{ role: 'user' }, { role: 'assistant', meta }];

describe('BOHAI 跨轮证据复用阶段（Step 5-2）', () => {
  it('本轮无证据且历史无上一轮结果 → 原样返回', () => {
    const r = resolveCrossTurnEvidence(base());
    expect(r.webEvidenceContext).toBe('');
    expect(r.internalEvidenceContext).toBe('');
    expect(r.searchResultCount).toBe(0);
    expect(r.webSearchVerified).toBe(false);
  });

  it('复用上一轮搜索结果，并加「来自上一轮」前缀', () => {
    const history = prevAssistant({
      searchContext: {
        results: [{ title: 'T1', url: 'https://a', content: 'C1' }],
        aiAnswer: 'A1',
      },
    });
    const r = resolveCrossTurnEvidence(base({ historyMessagesForCurrentTurn: history }));
    expect(r.webEvidenceContext).toContain('<search_results>');
    expect(r.webEvidenceContext).toContain('T1');
    expect(r.webEvidenceContext).toContain('来自上一轮检索');
    expect(r.searchResultCount).toBe(1);
    expect(r.webSearchVerified).toBe(true);
  });

  it('复用上一轮内部证据与引用（refs 一并恢复）', () => {
    const history = prevAssistant({ evidenceContext: 'EV', evidenceRefs: [{ url: 'u1' }] });
    const r = resolveCrossTurnEvidence(base({ historyMessagesForCurrentTurn: history }));
    expect(r.internalEvidenceContext).toContain('EV');
    expect(r.internalEvidenceContext).toContain('来自上一轮检索');
    expect(r.groundingEvidenceRefs).toEqual([{ url: 'u1' }]);
  });

  it('时效词 → 禁止复用，改注入 stale_evidence_note（不得拿旧料充数）', () => {
    const history = prevAssistant({
      searchContext: { results: [{ title: 'T1', url: 'u', content: 'c' }] },
    });
    const r = resolveCrossTurnEvidence(
      base({ routingQueryText: '论坛最近有什么新帖', historyMessagesForCurrentTurn: history }),
    );
    expect(r.webEvidenceContext).not.toContain('<search_results>');
    expect(r.internalEvidenceContext).toContain('<stale_evidence_note>');
  });

  it('开启联网但本轮失败且无可复用 → 注入 web_search_status（含失败原因）', () => {
    const r = resolveCrossTurnEvidence(
      base({ enableSearch: true, webSearchResult: { ok: false, message: '搜索服务暂时不可用' } }),
    );
    expect(r.webEvidenceContext).toContain('<web_search_status>');
    expect(r.webEvidenceContext).toContain('搜索服务暂时不可用');
  });

  it('开启联网、ok 但 0 结果 → 注入「未找到相关搜索结果」', () => {
    const r = resolveCrossTurnEvidence(
      base({ enableSearch: true, webSearchResult: { ok: true, results: [] } }),
    );
    expect(r.webEvidenceContext).toContain('<web_search_status>');
    expect(r.webEvidenceContext).toContain('未找到相关搜索结果');
  });
});
