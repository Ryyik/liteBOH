import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { squeezeSource } from '../helpers/source.js';

// ─────────────────────────────────────────────────────────────────────────────
// Coding 附加包额度加成：**展示值**与**强制值**必须一致。
//
// 这两个值天然分居两地，而且改一个不会让另一个报错：
//   · 展示：src/utils/subscription-benefits.js 的 CODING_PACKS[].tokenBonus（250000）
//   · 强制：supabase/functions/api-key-vault/index.ts 的 CODING_PLAN_BONUSES（250_000）
//
// 不一致的症状是「订阅页说 +25 万，实际加 +50 万」（或反过来少给）——
// 用户按页面买、系统按代码扣，且**两边都不报错**。
// 2026-10-02 随档位额度 ÷2 时改的就是这两处，本测试把它锁住。
//
// ⚠️ 只锁「两处一致」，不锁具体数值 —— 数值本身可以按运营需要调整。
// ⚠️ 2026-10-08：展示侧字段从**字符串**（' +25 万 Token / 天 '）改成**数值** ——
//    界面不再展示 Token 数、改成百分比后必须能参与计算，字符串得先解析才能用
//    （旧做法把展示口径漏进正则：文案一改，解析就静默失效、断言变成假绿）。
//    现在两侧都是数字，正则也从「带单位」简化成纯数值。
// ─────────────────────────────────────────────────────────────────────────────

const read = (rel) =>
  squeezeSource(readFileSync(resolve(import.meta.dirname, '../..', rel), 'utf8'));

const BENEFITS = 'src/utils/subscription-benefits.js';
const VAULT = 'supabase/functions/api-key-vault/index.ts';

/** 展示侧：`code: 'coding-lite', … tokenBonus: 250000` → { 'coding-lite': 250000 } */
const parseDisplayBonuses = () => {
  const src = read(BENEFITS);
  const out = {};
  // 抓 `code: 'x',` 到该条目结束（下一个 code: 或数组结束）之间的 tokenBonus
  const re = /code:\s*'([a-z0-9-]+)',[\s\S]*?tokenBonus:\s*([\d_]+)/g;
  let m;
  while ((m = re.exec(src))) {
    out[m[1]] = Number(String(m[2]).replace(/_/g, ''));
  }
  return out;
};

/** 强制侧：'coding-lite': { tokenBonus: 250_000, ... } → { 'coding-lite': 250000 } */
const parseEnforcedBonuses = () => {
  const src = read(VAULT);
  // ⚠️ squeezeSource 会把换行压成单空格，所以**不能**用 `\n};` 做块边界 ——
  //    用 `};` 即可（类型注解 `Record<string, { ... }>` 的收尾是 `}>`，不会误配）。
  const block = (src.match(/CODING_PLAN_BONUSES[\s\S]*?\};/) || [''])[0];
  const out = {};
  const re = /'([a-z0-9-]+)':\s*\{\s*tokenBonus:\s*([\d_]+)/g;
  let m;
  while ((m = re.exec(block))) {
    out[m[1]] = Number(String(m[2]).replace(/_/g, ''));
  }
  return out;
};

describe('Coding 附加包：展示值与强制值必须一致', () => {
  it('两侧都能解析出 4 个包（防止解析正则失效导致假绿）', () => {
    const display = parseDisplayBonuses();
    const enforced = parseEnforcedBonuses();
    expect(Object.keys(display).sort()).toEqual([
      'coding-lite',
      'coding-plus',
      'coding-pro',
      'coding-ultra',
    ]);
    expect(Object.keys(enforced).sort()).toEqual([
      'coding-lite',
      'coding-plus',
      'coding-pro',
      'coding-ultra',
    ]);
  });

  it('每个包的 tokenBonus 两侧相等（万 × 10000 == 强制值）', () => {
    const display = parseDisplayBonuses();
    const enforced = parseEnforcedBonuses();
    for (const code of Object.keys(display)) {
      expect(
        display[code],
        `${code}: 订阅页展示 ${display[code]}，但 Edge Function 强制 ${enforced[code]}`,
      ).toBe(enforced[code]);
    }
  });

  it('展示值保持单调递增（低档加成不得高于高档）', () => {
    const display = parseDisplayBonuses();
    const order = ['coding-lite', 'coding-plus', 'coding-pro', 'coding-ultra'];
    for (let i = 1; i < order.length; i += 1) {
      expect(display[order[i]]).toBeGreaterThan(display[order[i - 1]]);
    }
  });
});
