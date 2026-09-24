import { describe, it, expect } from 'vitest';
import {
  VIOLATION_TYPES,
  HARD_VIOLATIONS,
  HARD_VIOLATION_WEIGHT,
  SOFT_VIOLATION_WEIGHT,
  detectViolations,
  scoreViolations,
  shouldAdoptRewrite,
  createGuardStats,
  bumpGuardStats,
  shouldRewrite
} from '../../src/views/BOHAI/expert-roles/guards.js';
import { createBohAIChatSessionSanitizer } from '../../src/utils/bohai-chat-session-store.js';

/**
 * 守门「重写是否更优」的判据，以及触发率统计。
 *
 * 背景：改前 useChatEngine 的守门重写是「非空即替换」，不比较优劣 ——
 * 配合 shouldRewrite 对全部 6 种违规类型都返回 true，一次轻微触发就会用一版
 * 更拘谨的回答盖掉原稿。这里锁住新判据：只有严格更优才采纳。
 */
describe('守门 · 违规加权分', () => {
  it('硬违规 3 分、软违规 1 分、空数组 0 分', () => {
    expect(scoreViolations([{ type: VIOLATION_TYPES.OPTIONS }])).toBe(HARD_VIOLATION_WEIGHT);
    expect(scoreViolations([{ type: VIOLATION_TYPES.TERMS }])).toBe(SOFT_VIOLATION_WEIGHT);
    expect(scoreViolations([])).toBe(0);
  });

  it('权重由 HARD_VIOLATIONS 派生，不另建表', () => {
    HARD_VIOLATIONS.forEach((type) => {
      expect(scoreViolations([{ type }])).toBe(HARD_VIOLATION_WEIGHT);
    });
    const softTypes = Object.values(VIOLATION_TYPES).filter((type) => !HARD_VIOLATIONS.includes(type));
    softTypes.forEach((type) => {
      expect(scoreViolations([{ type }])).toBe(SOFT_VIOLATION_WEIGHT);
    });
  });

  it('1 个硬违规重于 2 个软违规', () => {
    expect(scoreViolations([{ type: VIOLATION_TYPES.PARROT }]))
      .toBeGreaterThan(scoreViolations([{ type: VIOLATION_TYPES.TERMS }, { type: VIOLATION_TYPES.ADVICE }]));
  });

  it('未知类型按软违规计，不产生 NaN', () => {
    expect(scoreViolations([{ type: 'something_new' }])).toBe(SOFT_VIOLATION_WEIGHT);
    expect(Number.isNaN(scoreViolations([{ type: undefined }]))).toBe(false);
  });
});

describe('守门 · 采纳判据（重写必须严格更优）', () => {
  const original = '你平时怎么处理这种压力？那件事后来怎么样了？';
  const originalFindings = detectViolations(original, {});

  it('原稿确有一轮多问（否则后面几条断言无意义）', () => {
    expect(shouldRewrite(originalFindings)).toBe(true);
    expect(originalFindings.map((f) => f.type)).toContain(VIOLATION_TYPES.MULTI_QUESTION);
  });

  it('原稿一轮多问 + 重写稿是干净的单问 → 采纳', () => {
    expect(shouldAdoptRewrite(originalFindings, '上一次那件事，是第几天？')).toBe(true);
  });

  it('重写稿比原稿更差（多问 + 术语）→ 不采纳，保留原稿', () => {
    const worse = '你通常怎么应对？有没有例外问句的向下箭头？';
    expect(scoreViolations(detectViolations(worse, {})))
      .toBeGreaterThanOrEqual(scoreViolations(originalFindings));
    expect(shouldAdoptRewrite(originalFindings, worse)).toBe(false);
  });

  it('重写稿同样是硬违规 → 不采纳（不拿一次调用去赌）', () => {
    expect(shouldAdoptRewrite(originalFindings, '你在意哪一点？后来呢？')).toBe(false);
  });

  it('空稿 / 纯空白 / null 一律不采纳', () => {
    expect(shouldAdoptRewrite(originalFindings, '')).toBe(false);
    expect(shouldAdoptRewrite(originalFindings, '   \n  ')).toBe(false);
    expect(shouldAdoptRewrite(originalFindings, null)).toBe(false);
    expect(shouldAdoptRewrite(originalFindings, undefined)).toBe(false);
  });

  it('原稿本来干净时不会被重写稿替换（严格更优才采纳）', () => {
    const clean = detectViolations('上一次那件事，是第几天？', {});
    expect(scoreViolations(clean)).toBe(0);
    expect(shouldAdoptRewrite(clean, '那你当时是什么感觉？')).toBe(false);
  });

  it('采纳判据把上下文（复述 / 重复上一问）一起算进去', () => {
    const context = { prevUserText: '上周三晚上我列了特别详细的一周计划，周四中午就全废了。' };
    const parrotRewrite = '上周三晚上你列了特别详细的一周计划，周四中午就全废了。那意味着什么？';
    // 复述型重写稿带上上下文后会被判为 parrot（硬违规），因此不会胜出
    expect(detectViolations(parrotRewrite, context).map((f) => f.type)).toContain(VIOLATION_TYPES.PARROT);
    expect(shouldAdoptRewrite([{ type: VIOLATION_TYPES.TERMS }], parrotRewrite, context)).toBe(false);
  });
});

describe('守门 · 触发率统计', () => {
  it('未触发轮也计数（否则算不出触发率）', () => {
    let stats = createGuardStats();
    stats = bumpGuardStats(stats, { triggered: false, adopted: false, types: [] });
    stats = bumpGuardStats(stats, { triggered: true, adopted: false, types: ['parrot'] });
    stats = bumpGuardStats(stats, { triggered: true, adopted: true, types: ['parrot', 'terms'] });
    expect(stats).toEqual({
      checked: 3,
      triggered: 2,
      adopted: 1,
      byType: { parrot: 2, terms: 1 }
    });
  });

  it('传入 undefined / 脏数据不抛错', () => {
    expect(bumpGuardStats(undefined, { triggered: true }).triggered).toBe(1);
    expect(bumpGuardStats(null, {}).checked).toBe(1);
    expect(bumpGuardStats({}, { types: ['', null, undefined] }).byType).toEqual({});
  });
});

describe('会话存储 · 守门留痕能存下来', () => {
  const sanitize = createBohAIChatSessionSanitizer({});

  it('lastViolations 与 guardStats 进入白名单', () => {
    const saved = sanitize({
      title: 't',
      messages: [],
      expertState: {
        roleId: 'psychologist',
        lastViolations: 'parrot,terms',
        guardStats: { checked: 5, triggered: 2, adopted: 1, byType: { parrot: 2, terms: 1 } }
      }
    });
    expect(saved.expertState.lastViolations).toBe('parrot,terms');
    expect(saved.expertState.guardStats).toEqual({
      checked: 5,
      triggered: 2,
      adopted: 1,
      byType: { parrot: 2, terms: 1 }
    });
  });

  it('未登记字段仍被丢弃（白名单没被放宽）', () => {
    const saved = sanitize({
      title: 't',
      messages: [],
      expertState: { roleId: 'psychologist', someUnknownField: 'x' }
    });
    expect(saved.expertState.someUnknownField).toBeUndefined();
  });

  it('没有 guardStats 时不塞空对象', () => {
    const saved = sanitize({ title: 't', messages: [], expertState: { roleId: 'psychologist' } });
    expect(saved.expertState.guardStats).toBeNull();
  });

  it('脏数据被夹取：负数归零、非数字归零、计数 0 的类型不写入', () => {
    const saved = sanitize({
      title: 't',
      messages: [],
      expertState: {
        roleId: 'x',
        guardStats: { checked: -5, triggered: 'abc', adopted: null, byType: { ok: 3, zero: 0 } }
      }
    });
    expect(saved.expertState.guardStats).toMatchObject({ checked: 0, triggered: 0, adopted: 0 });
    expect(saved.expertState.guardStats.byType).toEqual({ ok: 3 });
  });
});
