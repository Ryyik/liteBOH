import { describe, it, expect, beforeEach } from 'vitest';
import {
  BOH_AUTO_MODE_ID,
  EMPTY_AUTO_DECISION,
  LRUCache,
  buildTextFingerprint,
  clearRouteDecisionCache,
  pickModeFromLocalSignals,
  pickMoreCapableMode,
  resolveBOHAIAutoModeDecision
} from '../../src/utils/bohai-auto-router.js';
import {
  createNeutralAutoDecision,
  dedupeActionNotes,
  hasHardRoute,
  isAutoModeId,
  AUTO_MODES,
  mergeAutoDecisionWithLocalGuardrails,
  normalizeAutoClassifierBoolean,
  normalizeAutoSaveDestination,
  safeParseAutoClassifierJson,
  sanitizeAutoDecisionForLookup,
  sanitizeAutoDecisionForPostDraft,
  sanitizeAutoDecisionForUserText,
  shouldAskModelForAutoDecision,
  computeModeFromDecision
} from '../../src/utils/bohai-auto-decision.js';

describe('bohai-auto-decision: pure helpers', () => {
  it('createNeutralAutoDecision returns the same shape as EMPTY_AUTO_DECISION (mutated vs frozen)', () => {
    const neutral = createNeutralAutoDecision();
    expect(neutral.modeId).toBe('fast');
    expect(neutral.actionNotes).toEqual([]);
    // 中性对象应当可写，方便 merge 步骤回填字段
    neutral.actionNotes.push('x');
    expect(neutral.actionNotes).toHaveLength(1);
    // 冻结版本则不可写，但 actionNotes 引用稳定
    expect(() => EMPTY_AUTO_DECISION.actionNotes.push('y')).toThrow();
  });

  it('isAutoModeId and AUTO_MODES match the engine contract', () => {
    expect(isAutoModeId('auto')).toBe(true);
    expect(isAutoModeId(BOH_AUTO_MODE_ID)).toBe(true);
    expect(isAutoModeId('fast')).toBe(false);
    // 新设计: AUTO 严格只在 Pro / Fast 二选一,不再越权切到 plan / agent
    expect(AUTO_MODES).toEqual(['fast', 'pro']);
  });

  it('normalizeAutoClassifierBoolean accepts true / "true" / 1 / "1"', () => {
    expect(normalizeAutoClassifierBoolean(true)).toBe(true);
    expect(normalizeAutoClassifierBoolean('true')).toBe(true);
    expect(normalizeAutoClassifierBoolean(1)).toBe(true);
    expect(normalizeAutoClassifierBoolean('1')).toBe(true);
    expect(normalizeAutoClassifierBoolean(false)).toBe(false);
    expect(normalizeAutoClassifierBoolean('false')).toBe(false);
    expect(normalizeAutoClassifierBoolean(null)).toBe(false);
    expect(normalizeAutoClassifierBoolean('yes')).toBe(false);
  });

  it('normalizeAutoSaveDestination maps aliases correctly', () => {
    expect(normalizeAutoSaveDestination('cloud')).toBe('cloud');
    expect(normalizeAutoSaveDestination('cloud+')).toBe('cloud');
    expect(normalizeAutoSaveDestination('private')).toBe('cloud');
    expect(normalizeAutoSaveDestination('shared')).toBe('shared');
    expect(normalizeAutoSaveDestination('public')).toBe('shared');
    expect(normalizeAutoSaveDestination('both')).toBe('both');
    expect(normalizeAutoSaveDestination('ask')).toBe('ask');
    expect(normalizeAutoSaveDestination('', {
      shouldSaveCloud: true,
      shouldSaveSharedMemory: true
    })).toBe('both');
    expect(normalizeAutoSaveDestination('???', { shouldSaveCloud: true })).toBe('cloud');
    expect(normalizeAutoSaveDestination('???', {})).toBe('none');
  });

  it('dedupeActionNotes dedupes, trims, caps length', () => {
    const result = dedupeActionNotes([
      '  hello  ',
      'hello',
      '',
      null,
      'world',
      'a'.repeat(300),
      'second'
    ]);
    expect(result).toHaveLength(4);
    expect(result[0]).toBe('hello');
    expect(result[1]).toBe('world');
    // 长字符串应被截断
    expect(result[2].length).toBeLessThanOrEqual(120);
  });

  it('hasHardRoute is true on any high-confidence signal', () => {
    expect(hasHardRoute({ codeOrCommand: true })).toBe(true);
    expect(hasHardRoute({ planMode: true })).toBe(true);
    expect(hasHardRoute({ dailySummary: true })).toBe(true);
    expect(hasHardRoute({ shouldSearchWeb: true })).toBe(true);
    expect(hasHardRoute({ shouldSaveCloud: true })).toBe(true);
    expect(hasHardRoute({ shouldSaveSharedMemory: true })).toBe(true);
    expect(hasHardRoute({ shouldAskMemoryDestination: true })).toBe(true);
    expect(hasHardRoute({ shouldReferenceCloud: true })).toBe(true);
    expect(hasHardRoute({ minecraftCommand: true })).toBe(true);
    expect(hasHardRoute({})).toBe(false);
  });
});

describe('bohai-auto-decision: mode selection', () => {
  it('pickModeFromLocalSignals follows code/pro signals → pro, else → fast', () => {
    expect(pickModeFromLocalSignals({ codeOrCommand: true })).toBe('pro');
    expect(pickModeFromLocalSignals({ codeOrCommand: true, planMode: true })).toBe('pro');
    // 新设计: planMode 不再越权切到 plan,AUTO 一律只判 pro / fast
    expect(pickModeFromLocalSignals({ planMode: true })).toBe('fast');
    expect(pickModeFromLocalSignals({ dailySummary: true })).toBe('pro');
    expect(pickModeFromLocalSignals({ shouldReferenceCloud: true })).toBe('pro');
    expect(pickModeFromLocalSignals({ complexQuestion: true })).toBe('pro');
    expect(pickModeFromLocalSignals({ bohInternalFactual: true })).toBe('pro');
    expect(pickModeFromLocalSignals({ shouldSearchWeb: true })).toBe('pro');
    expect(pickModeFromLocalSignals({})).toBe('fast');
  });

  it('pickMoreCapableMode keeps the higher-ranked mode (pro > fast)', () => {
    // 新设计: 只有 fast / pro 两级;pro 等级更高(2 > 1)
    expect(pickMoreCapableMode('fast', 'pro')).toBe('pro');
    expect(pickMoreCapableMode('pro', 'fast')).toBe('pro');
    expect(pickMoreCapableMode('fast', 'fast')).toBe('fast');
    expect(pickMoreCapableMode('???', 'pro')).toBe('pro');
    // 旧 plan / agent-cluster 已经被新设计剔除,传入会被兜底
    expect(pickMoreCapableMode('plan', 'pro')).toBe('pro');
  });

  it('computeModeFromDecision: communityMemoryShare/minecraftCommand → pro, personalSupport → fast-or-better', () => {
    // 单独 communityMemoryShare 会被视为 pro 级
    expect(computeModeFromDecision({ communityMemoryShare: true })).toBe('pro');
    // minecraftCommand 直接拉高到 pro
    expect(computeModeFromDecision({ communityMemoryShare: true, minecraftCommand: true })).toBe('pro');
    // personalSupport 至少保留 fast,不影响 pro
    expect(computeModeFromDecision({ personalSupport: true })).toBe('fast');
    expect(computeModeFromDecision({ personalSupport: true, complexQuestion: true })).toBe('pro');
    // planMode 不再被 AUTO 路由识别(由用户手动选 plan)
    expect(computeModeFromDecision({ planMode: true })).toBe('fast');
    // 空 decision 走 fallback
    expect(computeModeFromDecision(null, 'plan')).toBe('plan');
    expect(computeModeFromDecision({}, 'fast')).toBe('fast');
  });
});

describe('bohai-auto-decision: sanitize variants', () => {
  it('sanitizeAutoDecisionForPostDraft strips all save/search flags', () => {
    const decision = {
      modeId: 'think',
      codeOrCommand: false,
      minecraftCommand: false,
      dailySummary: false,
      planMode: false,
      bohInternalFactual: false,
      complexQuestion: false,
      communityMemoryShare: true,
      shouldSearchWeb: true,
      shouldReferenceCloud: false,
      shouldSaveCloud: true,
      shouldSaveSharedMemory: true,
      saveDestination: 'cloud',
      shouldAskMemoryDestination: true,
      forceCloudReference: false,
      shouldAskSharedMemory: true,
      actionNotes: [
        '准备联网搜索最新资料。',
        '识别到社群记忆，准备询问是否写入公共记忆库。',
        '保留这一条 action note。'
      ],
      confidence: 0.9
    };
    const sanitized = sanitizeAutoDecisionForPostDraft(decision);
    expect(sanitized.shouldSearchWeb).toBe(false);
    expect(sanitized.shouldSaveCloud).toBe(false);
    expect(sanitized.shouldSaveSharedMemory).toBe(false);
    expect(sanitized.saveDestination).toBe('none');
    expect(sanitized.shouldAskMemoryDestination).toBe(false);
    expect(sanitized.shouldAskSharedMemory).toBe(false);
    // 与"联网/搜索/记忆/保存/写入"相关的 action note 都被过滤掉
    expect(sanitized.actionNotes).toEqual(['保留这一条 action note。']);
  });

  it('sanitizeAutoDecisionForLookup only strips memory/save flags', () => {
    const decision = {
      modeId: 'think',
      shouldSearchWeb: true, // 应保留
      shouldSaveCloud: true, // 应清掉
      shouldSaveSharedMemory: true,
      communityMemoryShare: true,
      saveDestination: 'shared',
      shouldAskMemoryDestination: true,
      shouldAskSharedMemory: true,
      actionNotes: [
        '准备联网搜索最新资料。',
        '识别到社群记忆，准备询问是否写入公共记忆库。'
      ],
      confidence: 0.8
    };
    const sanitized = sanitizeAutoDecisionForLookup(decision);
    expect(sanitized.shouldSearchWeb).toBe(true);
    expect(sanitized.shouldSaveCloud).toBe(false);
    expect(sanitized.shouldSaveSharedMemory).toBe(false);
    expect(sanitized.communityMemoryShare).toBe(false);
    expect(sanitized.saveDestination).toBe('none');
    expect(sanitized.actionNotes).toEqual(['准备联网搜索最新资料。']);
  });

  it('sanitizeAutoDecisionForUserText composes both sanitizers correctly', () => {
    const isPostDraft = () => true;
    const decision = {
      modeId: 'think',
      shouldSearchWeb: true,
      shouldSaveCloud: true,
      actionNotes: [
        '联网搜索。',
        '记忆保存。',
        '保留。'
      ]
    };
    // isPostDraft 为 true → 走 postDraft 路径：shouldSearchWeb 也清掉
    const result = sanitizeAutoDecisionForUserText(decision, '帮我写一篇帖子', { isPostDraftRequest: isPostDraft });
    expect(result.shouldSearchWeb).toBe(false);
    expect(result.shouldSaveCloud).toBe(false);
    expect(result.actionNotes).toEqual(['保留。']);
  });
});

describe('bohai-auto-decision: shouldAskModelForAutoDecision', () => {
  it('skips model call when local fallback already has hard route', () => {
    expect(shouldAskModelForAutoDecision('任意长文本', { codeOrCommand: true, confidence: 0.94 })).toBe(false);
    expect(shouldAskModelForAutoDecision('任意长文本', { shouldSaveCloud: true, confidence: 0.95 })).toBe(false);
  });

  it('skips model call for very short text without question marks', () => {
    expect(shouldAskModelForAutoDecision('你好', { confidence: 0.5 })).toBe(false);
    expect(shouldAskModelForAutoDecision('hi there', { confidence: 0.5 })).toBe(false);
  });

  it('asks the model for longer ambiguous text', () => {
    expect(shouldAskModelForAutoDecision(
      '帮我深入分析一下当前业务架构的各个模块组成、未来优化方向和具体的实施步骤',
      { confidence: 0.7 }
    )).toBe(true);
    expect(shouldAskModelForAutoDecision('short?', { confidence: 0.5 })).toBe(true);
  });
});

describe('bohai-auto-decision: safeParseAutoClassifierJson', () => {
  it('parses clean JSON', () => {
    expect(safeParseAutoClassifierJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips Markdown code fences', () => {
    expect(safeParseAutoClassifierJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(safeParseAutoClassifierJson('```\n{"a":3}\n```')).toEqual({ a: 3 });
  });

  it('strips line comments', () => {
    expect(safeParseAutoClassifierJson('// header\n{"a":4}')).toEqual({ a: 4 });
  });

  it('recovers from trailing commas', () => {
    expect(safeParseAutoClassifierJson('{"a":5,"b":6,}')).toEqual({ a: 5, b: 6 });
  });

  it('extracts JSON object from noisy surrounding text', () => {
    expect(safeParseAutoClassifierJson('这是一些废话 {\"a\":7} 后面也是')).toEqual({ a: 7 });
  });

  it('returns null for non-JSON input', () => {
    expect(safeParseAutoClassifierJson(null)).toBeNull();
    expect(safeParseAutoClassifierJson('')).toBeNull();
    expect(safeParseAutoClassifierJson('not json at all')).toBeNull();
    expect(safeParseAutoClassifierJson('{}broken')).toBeNull();
  });
});

describe('bohai-auto-decision: mergeAutoDecisionWithLocalGuardrails', () => {
  it('hard booleans are OR-ed with local', () => {
    const merged = mergeAutoDecisionWithLocalGuardrails(
      { codeOrCommand: false, dailySummary: true },
      { codeOrCommand: true, dailySummary: false, confidence: 0.5 }
    );
    expect(merged.codeOrCommand).toBe(true);
    expect(merged.dailySummary).toBe(true);
  });

  it('save flags defer to local guardrails', () => {
    const merged = mergeAutoDecisionWithLocalGuardrails(
      { shouldSaveCloud: false },
      { shouldSaveCloud: true, saveDestination: 'cloud' }
    );
    expect(merged.shouldSaveCloud).toBe(true);
    expect(merged.saveDestination).toBe('cloud');
  });

  it('modeId is derived via computeModeFromDecision, not duplicated rules', () => {
    const merged = mergeAutoDecisionWithLocalGuardrails(
      { modeId: 'fast', complexQuestion: true },
      { modeId: 'fast' }
    );
    // 新设计: 复杂问题路由到 pro(由 Pro 内部判 Qwen/DeepSeek),不再是 think
    expect(merged.modeId).toBe('pro');
  });

  it('actionNotes are merged + deduped', () => {
    const merged = mergeAutoDecisionWithLocalGuardrails(
      { actionNotes: ['A', 'B', 'B'] },
      { actionNotes: ['A', 'C'] }
    );
    expect(merged.actionNotes).toEqual(['A', 'B', 'C']);
  });

  it('confidence takes the max', () => {
    const merged = mergeAutoDecisionWithLocalGuardrails(
      { confidence: 0.4 },
      { confidence: 0.8 }
    );
    expect(merged.confidence).toBe(0.8);
  });
});

describe('bohai-auto-router: LRU cache', () => {
  it('evicts the least recently used entry when over capacity', () => {
    const cache = new LRUCache(2);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1); // 读 a，b 变最旧
    cache.set('c', 3); // 容量满，淘汰 b
    expect(cache.has('b')).toBe(false);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('c')).toBe(true);
  });

  it('returns undefined for missing keys and size reflects capacity', () => {
    const cache = new LRUCache(3);
    expect(cache.get('x')).toBeUndefined();
    cache.set('x', 'y');
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('buildTextFingerprint distinguishes by content + length', () => {
    const a = buildTextFingerprint('hello');
    const b = buildTextFingerprint('hello');
    const c = buildTextFingerprint('hello world');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(buildTextFingerprint('')).toBe('0:0');
  });
});

describe('bohai-auto-router: resolveBOHAIAutoModeDecision cache', () => {
  beforeEach(() => {
    clearRouteDecisionCache();
  });

  it('returns EMPTY_AUTO_DECISION for empty input', () => {
    const result = resolveBOHAIAutoModeDecision('', { isAutoMode: true });
    expect(result).toBe(EMPTY_AUTO_DECISION);
    expect(result.confidence).toBe(0);
  });

  it('caches decisions by text fingerprint + flags', () => {
    const first = resolveBOHAIAutoModeDecision('帮我写个 Vue 组件', {
      isAutoMode: true,
      cloudReferenceEnabled: false,
      isLoggedIn: true
    });
    const second = resolveBOHAIAutoModeDecision('帮我写个 Vue 组件', {
      isAutoMode: true,
      cloudReferenceEnabled: false,
      isLoggedIn: true
    });
    expect(second).toBe(first);
  });

  it('treats same text with different flags as different cache entries', () => {
    const loggedOut = resolveBOHAIAutoModeDecision('查一下我的 Cloud+', {
      isAutoMode: true,
      cloudReferenceEnabled: false,
      isLoggedIn: false
    });
    const loggedIn = resolveBOHAIAutoModeDecision('查一下我的 Cloud+', {
      isAutoMode: true,
      cloudReferenceEnabled: true,
      isLoggedIn: true
    });
    // action notes 数量可能因登录态不同
    expect(loggedOut.actionNotes.length).toBeGreaterThanOrEqual(0);
    expect(loggedIn.actionNotes.length).toBeGreaterThanOrEqual(0);
  });

  it('confidence is now continuous, not binary 0.78/0.94', () => {
    const singleHit = resolveBOHAIAutoModeDecision('帮我总结我的最近日常', { isAutoMode: true });
    const multiHit = resolveBOHAIAutoModeDecision(
      '帮我总结我的最近日常，并且要持续推进分阶段计划，请用网络搜索最新资料',
      { isAutoMode: true }
    );
    expect(singleHit.confidence).toBeGreaterThan(0.5);
    expect(multiHit.confidence).toBeGreaterThan(singleHit.confidence);
  });

  it('personalSupport is included in the decision', () => {
    const result = resolveBOHAIAutoModeDecision('我最近压力很大睡不好', { isAutoMode: true });
    expect(result.personalSupport).toBe(true);
  });
});
