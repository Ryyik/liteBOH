import { describe, expect, it, vi } from 'vitest';
import {
  formatModeRateLabel,
  formatModeRateTitle,
  formatMultiplierNumber,
  isFreeMode,
} from '../../src/views/BOHAI/utils/mode-rate-label.js';
import { normalizeBohaiModelConfigRow } from '../../src/utils/api/bohai-model-config-api.js';

// 被测模块间接引用 supabase client（模块初始化就会建客户端）⇒ 按仓库惯例先 mock 掉。
// `vi.mock` 会被提升到 import 之前，所以这里用静态 import 也安全。
vi.mock('../../src/utils/supabase-client.js', () => ({ supabase: {} }));

// ─────────────────────────────────────────────────────────────────────────────
// 模式「消耗倍率」文案单一真源（2026-10-08）
//
// 起因是用户的一句话：「Fast 为啥显示的是 1x 倍率」——查下去发现**两个 bug 叠在一起**：
//   ① 数据层：`normalizeBohaiModelConfigRow` 用 `row.quota_multiplier || row.quotaMultiplier`
//      取倍率，而免费模型的合法值是 **0** ⇒ `0 || undefined` 掉进默认值 `1.00`；
//      （下界还夹到 0.1，等于第二道保险把 0 也抬走。）
//   ② 文案层：设置页与输入区**各写一份**倍率文案，而只有输入区那份带了「免费」分支 ⇒
//      同一个 Fast 在输入区显示「免费」、在设置页显示「1x」。
// 所以本文件同时锁「数据不许把 0 变成 1」与「文案只有一份」。
// ─────────────────────────────────────────────────────────────────────────────

describe('模式倍率文案单一真源', () => {
  it('免费模型显示 0.00x，不再写「免费」二字（2026-10-08 用户口径）', () => {
    expect(formatModeRateLabel({ quotaMultiplier: 0 })).toBe('0.00x');
    expect(isFreeMode({ quotaMultiplier: 0 })).toBe(true);
  });

  it('免费模型绝不能被显示成 1x（用户当场问过「Fast 为啥显示 1x 倍率」）', () => {
    expect(formatModeRateLabel({ quotaMultiplier: 0 })).not.toBe('1x');
    expect(formatModeRateLabel({ quotaMultiplier: 0 })).not.toBe('1');
  });

  it('自带 Key 必须写「自有 Key」（quotaMultiplier 同为 0，含义完全不同）', () => {
    expect(formatModeRateLabel({ quotaMultiplier: 0, byok: true })).toBe('自有 Key');
    // 花自己的钱不能被算成「免费」
    expect(isFreeMode({ quotaMultiplier: 0, byok: true })).toBe(false);
  });

  it('正常倍率去掉尾零；倍率缺失时给空串（宁可不显示，也不谎报 1x）', () => {
    expect(formatModeRateLabel({ quotaMultiplier: 2 })).toBe('2x');
    expect(formatModeRateLabel({ quotaMultiplier: 0.5 })).toBe('0.5x');
    expect(formatModeRateLabel({ quotaMultiplier: 0.06 })).toBe('0.06x');
    expect(formatModeRateLabel({})).toBe('');
    expect(formatModeRateLabel({ quotaMultiplier: null })).toBe('');
    expect(formatModeRateLabel({ quotaMultiplier: Number.NaN })).toBe('');
  });

  it('悬浮说明区分三态（免费 / 自有 Key / 正经倍率）', () => {
    expect(formatModeRateTitle({ quotaMultiplier: 0 })).toContain('免费');
    expect(formatModeRateTitle({ quotaMultiplier: 0, byok: true })).toContain('你自己的 API Key');
    expect(formatModeRateTitle({ quotaMultiplier: 2 })).toBe('该模式消耗倍率为 2x');
  });

  it('formatMultiplierNumber：两位小数上限，非正数返回空串', () => {
    expect(formatMultiplierNumber(1)).toBe('1');
    expect(formatMultiplierNumber(1.239)).toBe('1.24');
    expect(formatMultiplierNumber(0)).toBe('');
    expect(formatMultiplierNumber(-1)).toBe('');
    expect(formatMultiplierNumber('x')).toBe('');
  });
});

describe('免费模型的 quota_multiplier = 0 不许被兜底成 1（Fast 显示 1x 的根因）', () => {
  const row = (extra = {}) => ({
    mode_id: 'fast',
    model_id: 'some-free-model',
    display_name: 'Fast',
    ...extra,
  });

  it('DB 给 0 时前端必须还是 0（`||` 兜底会掉进默认值 1.00）', () => {
    const parsed = normalizeBohaiModelConfigRow(row({ quota_multiplier: 0 }));
    expect(parsed).not.toBeNull();
    expect(parsed.quotaMultiplier).toBe(0);
    // 与文案层联动：0 出来之后才会被认成免费
    expect(isFreeMode(parsed)).toBe(true);
  });

  it('字段真的缺失时才用默认值 1', () => {
    const parsed = normalizeBohaiModelConfigRow(row());
    expect(parsed.quotaMultiplier).toBe(1);
  });

  it('下界必须是 0（旧代码夹到 0.1，会把合法的 0 抬成 0.1，免费模型既不免费、也不是 1）', () => {
    expect(normalizeBohaiModelConfigRow(row({ quota_multiplier: 0 })).quotaMultiplier).toBe(0);
    expect(normalizeBohaiModelConfigRow(row({ quota_multiplier: -3 })).quotaMultiplier).toBe(0);
  });
});
