import { describe, it, expect, beforeEach } from 'vitest';
import {
  EMPTY_AUTO_DECISION,
  LRUCache,
  ROUTING_PATTERNS,
  buildTextFingerprint,
  clearRouteDecisionCache,
  isLikelyCloudReferenceRequest,
  isLikelyCodeOrCommandRequest,
  isLikelyCommunityMemoryShare,
  isLikelyDailySummaryRequest,
  isLikelyPersonalSupportRequest,
  resolveBOHAIAutoModeDecision,
} from '../../src/views/BOHAI/engine/bohai-auto-router.js';

// ─────────────────────────────────────────────────────────────────────────────
// 2026-10-02 收口：本文件原先覆盖 23 类意图正则与 19 个决策字段。
// auto 模式 2026-06-08 移除后，其中 9 类正则的产物没有任何消费方，
// 相关断言连同代码一并删除（依据见 plans/024 §1.4）。
//
// 下面保留的是「追到了真实消费方」的部分。**改动前请先确认消费方链还在。**
// ─────────────────────────────────────────────────────────────────────────────

const LIVE_DECISION_KEYS = [
  'shouldSaveCloud',
  'shouldSaveSharedMemory',
  'shouldAskMemoryDestination',
  'saveDestination',
  'shouldReferenceCloud',
];

describe('bohai auto router: 决策字段收敛', () => {
  beforeEach(() => {
    clearRouteDecisionCache();
  });

  it('决策对象只含 5 个有消费方的字段', () => {
    const decision = resolveBOHAIAutoModeDecision('记一下今天的想法', { isAutoMode: true });
    expect(Object.keys(decision).sort()).toEqual([...LIVE_DECISION_KEYS].sort());
  });

  it('EMPTY_AUTO_DECISION 是冻结的，且形状与实时决策一致', () => {
    expect(Object.isFrozen(EMPTY_AUTO_DECISION)).toBe(true);
    expect(Object.keys(EMPTY_AUTO_DECISION).sort()).toEqual([...LIVE_DECISION_KEYS].sort());
    const empty = resolveBOHAIAutoModeDecision('', { isAutoMode: true });
    expect(empty).toBe(EMPTY_AUTO_DECISION);
  });

  it('ROUTING_PATTERNS 只保留有消费方的 14 类', () => {
    expect(Object.keys(ROUTING_PATTERNS).sort()).toEqual([
      'bothSave',
      'cloudReference',
      'cloudSave',
      'codeOrCommand',
      'community',
      'dailySummary',
      'forumPost',
      'internalSource',
      'memoryQuery',
      'memoryShare',
      'personalSupport',
      'professionalHealth',
      'question',
      'sharedSave',
    ]);
  });
});

describe('bohai auto router: 保留项反证（5 个存活字段 × 典型语句）', () => {
  // 这组断言的用途是「防止收口误伤」：任何一次删正则/改判定，
  // 只要动到下面 5 个字段的行为，这里必须变红。
  // 期望值来自收口前的实测快照（plans/024 §P0-1 的反证基准）。
  beforeEach(() => {
    clearRouteDecisionCache();
  });

  const cases = [
    ['普通闲聊', '你好呀', { saveDestination: 'none', shouldReferenceCloud: false }],
    ['普通事实问题', 'BOH 有多少成员？', { saveDestination: 'none', shouldReferenceCloud: false }],
    ['保存到 Cloud+', '记一下我今天心情不错', { shouldSaveCloud: true, saveDestination: 'cloud' }],
    [
      '明确存 Cloud+',
      '把这条存到我的 Cloud+ 随手记里',
      { shouldSaveCloud: true, saveDestination: 'cloud', shouldReferenceCloud: true },
    ],
    [
      '保存到公共记忆',
      '这条写入公共记忆库',
      { shouldSaveSharedMemory: true, saveDestination: 'shared' },
    ],
    [
      '两边都存',
      '两个都保存，cloud+ 和公共记忆一起',
      { shouldSaveCloud: true, shouldSaveSharedMemory: true, saveDestination: 'both' },
    ],
    [
      'Cloud+ 引用',
      '根据我的 Cloud+ 最近记录总结一下我最近的日常',
      { saveDestination: 'none', shouldReferenceCloud: true },
    ],
    ['论坛发帖不当作保存', '帮我起草一个论坛发帖文案', { saveDestination: 'none' }],
    [
      '社区记忆分享（含「一起」→ both）',
      '今天和 ryyik 一起玩了 Minecraft，记一下这件事',
      { shouldSaveCloud: true, shouldSaveSharedMemory: true, saveDestination: 'both' },
    ],
    [
      '社区事实查询',
      'BOH 论坛最近有什么公告？',
      { saveDestination: 'none', shouldReferenceCloud: false },
    ],
    ['健康问题', '我最近睡眠不好，怎么办', { saveDestination: 'none' }],
    ['个人支持', '最近压力大，有点撑不住了', { saveDestination: 'none' }],
    [
      '社区记忆分享-无明确保存 → 问去向',
      '今天和小牛一起玩了 MC，聊了很久',
      { shouldAskMemoryDestination: true, saveDestination: 'ask' },
    ],
    [
      '社区记忆分享-询问去向',
      '刚刚和 eleven 一起打了内战，这件事值得记下来',
      { shouldAskMemoryDestination: true, saveDestination: 'ask' },
    ],
  ];

  it.each(cases)('%s', (_label, text, expected) => {
    const decision = resolveBOHAIAutoModeDecision(text, {
      isAutoMode: false,
      cloudReferenceEnabled: true,
      isLoggedIn: true,
    });
    expect(decision).toMatchObject(expected);
  });

  it('缓存键只看文本：同一句话不会因登录态不同而各缓存一份', () => {
    const loggedOut = resolveBOHAIAutoModeDecision('根据我的 Cloud+ 总结最近日常', {
      isAutoMode: true,
      cloudReferenceEnabled: false,
      isLoggedIn: false,
    });
    const loggedIn = resolveBOHAIAutoModeDecision('根据我的 Cloud+ 总结最近日常', {
      isAutoMode: true,
      cloudReferenceEnabled: true,
      isLoggedIn: true,
    });
    expect(loggedIn).toBe(loggedOut);
  });
});

describe('bohai auto router: 存活判定函数', () => {
  it('isLikelyCodeOrCommandRequest 识别代码/命令', () => {
    expect(isLikelyCodeOrCommandRequest('帮我写一段 Vue 组件代码，并解释这个 bug')).toBe(true);
    expect(isLikelyCodeOrCommandRequest('生成 /give @p diamond_sword 的 MC 指令')).toBe(true);
    expect(isLikelyCodeOrCommandRequest('今天天气不错')).toBe(false);
  });

  it('isLikelyDailySummaryRequest 识别日常总结', () => {
    expect(isLikelyDailySummaryRequest('帮我复盘我的近期生活状态')).toBe(true);
    expect(isLikelyDailySummaryRequest('你好')).toBe(false);
  });

  it('isLikelyCloudReferenceRequest 覆盖总结 / 引用 / 内部源+人称三条支路', () => {
    expect(isLikelyCloudReferenceRequest('总结一下我的最近日常')).toBe(true);
    expect(isLikelyCloudReferenceRequest('参考我的 Cloud+ 记录看看')).toBe(true);
    expect(isLikelyCloudReferenceRequest('我的 Cloud+ 里有什么')).toBe(true);
    expect(isLikelyCloudReferenceRequest('Cloud+ 是什么')).toBe(false);
  });

  it('isLikelyPersonalSupportRequest 排除专业健康问题', () => {
    expect(isLikelyPersonalSupportRequest('感觉睡不好咋办')).toBe(true);
    // 专业健康类（命中 professionalHealth）不应被判为「个人支持」
    expect(isLikelyPersonalSupportRequest('抑郁症的诊断标准是什么')).toBe(false);
  });

  it('isLikelyCommunityMemoryShare 不把社区问题当记忆分享', () => {
    expect(isLikelyCommunityMemoryShare('方块之家成立背景是什么？')).toBe(false);
    expect(isLikelyCommunityMemoryShare('总结一下论坛最近发生的事')).toBe(false);
    expect(
      isLikelyCommunityMemoryShare(
        '今天 LF 和 Eleven 在方块之家群里一起玩哈比快车谋杀案，还提到要下周继续组织活动。',
      ),
    ).toBe(true);
  });
});

describe('bohai auto-router: LRU cache', () => {
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
