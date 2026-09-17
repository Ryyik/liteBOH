import { describe, expect, it } from 'vitest';
import {
  buildSlugFromTitle,
  normalizeCampaignSlug,
  toIsoOrNull,
  validateCampaignWindow
} from '../../src/utils/activity-campaign.js';
import { CAMPAIGN_STAGE_OPTIONS } from '../../src/views/DataManagement/config/fields.js';

describe('normalizeCampaignSlug', () => {
  it('大小写、空格与标点归一为连字符', () => {
    expect(normalizeCampaignSlug('BOH 9th Birthday!!')).toBe('boh-9th-birthday');
    expect(normalizeCampaignSlug('  boh-8th  ')).toBe('boh-8th');
  });

  it('折叠连续连字符并去掉首尾', () => {
    expect(normalizeCampaignSlug('--a  b--c--')).toBe('a-b-c');
  });

  it('中文标题归一为空（调用方需回退到 buildSlugFromTitle）', () => {
    expect(normalizeCampaignSlug('八周年剧本杀')).toBe('');
    expect(normalizeCampaignSlug('方块之家 7 周年'.replace(/\s/g, ''))).toBe('7');
  });

  it('截断到 64 字符', () => {
    expect(normalizeCampaignSlug('a'.repeat(100))).toHaveLength(64);
  });

  it('空值安全', () => {
    expect(normalizeCampaignSlug(null)).toBe('');
    expect(normalizeCampaignSlug(undefined)).toBe('');
  });

  it('回归：与原内联逻辑语义一致，仅多了「连续连字符折叠」这一处改进', () => {
    const legacy = (v) => String(v || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    ['BOH 9th Birthday!!', 'boh-8th-anniversary-2026', 'boh-8th'].forEach((input) => {
      expect(normalizeCampaignSlug(input)).toBe(legacy(input));
    });
    // 原逻辑的漏网之处：连字符在字符类内合法，'a  b--c' 会留成 'a-b--c'
    expect(legacy('--a  b--c--')).toBe('a-b--c');
    expect(normalizeCampaignSlug('--a  b--c--')).toBe('a-b-c');
  });
});

describe('buildSlugFromTitle', () => {
  it('英文标题直接归一', () => {
    expect(buildSlugFromTitle('BOH 9th Birthday')).toBe('boh-9th-birthday');
  });

  it('中文标题回退到 boh- 前缀的短 slug', () => {
    const slug = buildSlugFromTitle('八周年剧本杀');
    expect(slug).toMatch(/^boh-[a-z0-9]+$/);
    expect(slug.length).toBeLessThanOrEqual(16);
  });

  it('两个回退 slug 不重复', () => {
    const a = buildSlugFromTitle('');
    const b = buildSlugFromTitle('');
    expect(a).not.toBe(b);
  });

  it('回退结果的格式与 normalizeCampaignSlug 兼容（幂等）', () => {
    const slug = buildSlugFromTitle('八周年剧本杀');
    expect(normalizeCampaignSlug(slug)).toBe(slug);
  });
});

describe('toIsoOrNull', () => {
  it('空值统一为 null', () => {
    expect(toIsoOrNull('')).toBeNull();
    expect(toIsoOrNull('   ')).toBeNull();
    expect(toIsoOrNull(null)).toBeNull();
    expect(toIsoOrNull(undefined)).toBeNull();
  });

  it('datetime-local 值转成带时区的 ISO', () => {
    const iso = toIsoOrNull('2026-09-10T00:00');
    expect(iso).toMatch(/Z$/);
    // 时区无关断言：语义时刻不能变
    expect(new Date(iso).getTime()).toBe(new Date('2026-09-10T00:00').getTime());
  });

  it('回归：datetime-local 必须按本地时间解释，不能当 UTC', () => {
    const rawLocal = '2026-09-10T00:00';
    const iso = toIsoOrNull(rawLocal);
    expect(iso).toMatch(/Z$/);
    // 时区无关的精确断言：输出就是本地时间对应的 ISO 时刻
    expect(iso).toBe(new Date(rawLocal).toISOString());
    // 非 UTC 环境下，它必须区别于「裸串直接加 Z」这种错误做法
    if (new Date().getTimezoneOffset() !== 0) {
      expect(iso).not.toBe(`${rawLocal}:00.000Z`);
    }
  });

  it('已是完整 ISO 的输入保持同一时刻', () => {
    const iso = toIsoOrNull('2026-09-10T00:00:00+08:00');
    expect(new Date(iso).toISOString()).toBe('2026-09-09T16:00:00.000Z');
  });

  it('无法解析的输入原样返回，交给数据库报错而不是静默丢值', () => {
    expect(toIsoOrNull('待定')).toBe('待定');
  });
});

describe('validateCampaignWindow', () => {
  it('时间窗正序通过', () => {
    expect(validateCampaignWindow({
      signupStart: '2026-09-01T00:00:00.000Z',
      signupEnd: '2026-09-20T00:00:00.000Z',
      startAt: '2026-09-21T00:00:00.000Z',
      endAt: '2026-09-30T00:00:00.000Z'
    })).toBe('');
  });

  it('报名截止早于报名开始 → 报错', () => {
    expect(validateCampaignWindow({
      signupStart: '2026-09-20T00:00:00.000Z',
      signupEnd: '2026-09-01T00:00:00.000Z'
    })).toContain('报名截止');
  });

  it('活动结束早于活动开始 → 报错', () => {
    expect(validateCampaignWindow({
      startAt: '2026-09-30T00:00:00.000Z',
      endAt: '2026-09-21T00:00:00.000Z'
    })).toContain('活动结束');
  });

  it('留空表示不限：不参与校验', () => {
    expect(validateCampaignWindow({ signupStart: '2026-09-01T00:00:00.000Z', signupEnd: null })).toBe('');
    expect(validateCampaignWindow({ startAt: null, endAt: null })).toBe('');
    expect(validateCampaignWindow({})).toBe('');
  });

  it('单边相等不报错（允许同一时刻开始与结束）', () => {
    const same = '2026-09-10T00:00:00.000Z';
    expect(validateCampaignWindow({ signupStart: same, signupEnd: same })).toBe('');
  });
});

describe('活动平台字段常量', () => {
  it('阶段选项恰好覆盖 DB check 约束的六段', () => {
    expect(CAMPAIGN_STAGE_OPTIONS.map((o) => o.value).sort()).toEqual(
      ['draft', 'fulfilled', 'judging', 'result', 'signup', 'submission'].sort()
    );
  });

  it('默认投放阶段 signup 在选项内', () => {
    expect(CAMPAIGN_STAGE_OPTIONS.some((o) => o.value === 'signup')).toBe(true);
  });
});
