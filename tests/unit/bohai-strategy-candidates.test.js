import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { squeezeSource } from '../helpers/source.js';

// =====================================================================
// 策略行「自动挑选候选模型」的结构守卫（2026-10-22，plans/030 阶段 6）
//
//   背景：三个策略行（cost / balance / intelligence）在 `strategy_candidates` 里存一个
//   候选池，EF 按「北京日期 + 用户 + 策略」加权挑一个模型。倍率仍按**策略行**扣。
//
//   锁四件事（任一被删掉都会让功能静默失效，且没有任何探针会红）：
//     ① 迁移里的三个池子权重和 == 100（`hashSeed % total` 的分母，和不对就是偏采样）；
//     ② 池子里的 mode_id 都落在已知的 6 个模型行里（拼错 = 该候选永远被跳过，
//        表现为「某个模型从没出现过」，人工几乎发现不了）；
//     ③ EF 的 SELECT 真的带上了 `strategy_candidates`（漏了 = 永远读到 undefined，
//        看起来像「迁移没生效」）；
//     ④ EF 里 quotaMultiplier 取的是**策略行**、候选行要过 provider 白名单、种子含北京日期。
//
//   反证：把 EF 的 `resolveStrategyCandidate(...)` 调用注释掉 → ③④ 必红；
//        把迁移里 balance 的 weight 从 65 改成 60 → ① 必红。
// =====================================================================

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
/** 剥掉 SQL 的 `--` 行注释：注释里会合法地提到 strategy_candidates（如「刻意不暴露」），
    直接在原文上做负向断言会被自己的注释满足。 */
const stripSqlComments = (sql) => String(sql).replace(/(^|\s)--[^\n]*/g, '$1');

const MIGRATION = 'supabase/migrations/2026102201_bohai_strategy_candidates.sql';
const EF = 'supabase/functions/api-key-vault/index.ts';

/** 6 个用户可见模型行的 mode_id（大小写即主键，别 normalize）。 */
const KNOWN_MODEL_MODE_IDS = ['fast', 'Air', 'Ultra', 'Code', 'gemini', '38Flash'];
const STRATEGY_MODE_IDS = ['cost', 'balance', 'intelligence'];

describe('策略行候选池：迁移侧', () => {
  it('三个策略行都配了池子，且权重和 == 100', () => {
    const sql = stripSqlComments(read(MIGRATION));
    const pools = [...sql.matchAll(/'(\[\{"mode_id".*?\}\])'::jsonb/g)].map((m) => JSON.parse(m[1]));
    expect(pools).toHaveLength(3);
    for (const pool of pools) {
      const total = pool.reduce((sum, item) => sum + Number(item.weight || 0), 0);
      expect(total).toBe(100);
    }
  });

  it('池子里的 mode_id 都落在已知模型行里（拼错会让该候选永远被跳过）', () => {
    const sql = stripSqlComments(read(MIGRATION));
    const pools = [...sql.matchAll(/'(\[\{"mode_id".*?\}\])'::jsonb/g)].map((m) => JSON.parse(m[1]));
    for (const pool of pools) {
      for (const item of pool) {
        expect(KNOWN_MODEL_MODE_IDS).toContain(item.mode_id);
        expect(Number(item.weight)).toBeGreaterThan(0);
      }
    }
  });

  it('倍率统一为「池内最强 × 0.7」：cost 0.35 / balance 1.05', () => {
    const sql = stripSqlComments(read(MIGRATION));
    // 只认 update 语句里的目标值，别被注释里的历史价（0.45 / 1.10）误判
    expect(sql).toMatch(/quota_multiplier\s*=\s*0\.35[\s\S]{0,80}mode_id\s*=\s*'cost'/);
    expect(sql).toMatch(/quota_multiplier\s*=\s*1\.05[\s\S]{0,80}mode_id\s*=\s*'balance'/);
    // intelligence 本来就是 3.00 × 0.7 = 2.10 ⇒ 迁移里不写 update，靠断言"没有改它"锁住
    expect(sql).not.toMatch(/quota_multiplier\s*=\s*2\.(?!10)\d+[\s\S]{0,80}'intelligence'/);
  });

  it('三个策略行的池子按方案填对了（权重与 plans/030 §3.1 一致）', () => {
    const sql = stripSqlComments(read(MIGRATION));
    const byMode = {};
    const blockRe = /mode_id\s*=\s*'(cost|balance|intelligence)'[\s\S]{0,400}?strategy_candidates is null/g;
    // 池子紧挨在 where mode_id = '<策略>' 之前，用 update 块整体解析更稳
    for (const strategy of STRATEGY_MODE_IDS) {
      const updateRe = new RegExp(
        `strategy_candidates\\s*=\\s*'(\\[\\{"mode_id".*?\\}\\])'::jsonb[\\s\\S]{0,160}?where mode_id = '${strategy}'`,
      );
      const match = sql.match(updateRe);
      expect(match, `缺少 ${strategy} 的池子 update`).toBeTruthy();
      byMode[strategy] = JSON.parse(match[1]);
    }
    expect(byMode.cost.map((i) => `${i.mode_id}:${i.weight}`)).toEqual(['Air:70', 'fast:30']);
    expect(byMode.balance.map((i) => `${i.mode_id}:${i.weight}`)).toEqual(['Code:65', 'Air:35']);
    expect(byMode.intelligence.map((i) => `${i.mode_id}:${i.weight}`)).toEqual([
      '38Flash:40',
      'gemini:40',
      'Code:20',
    ]);
    void blockRe;
  });

  it('客户端拿不到池子：最后一次重建 list_public_bohai_modes 的迁移不 select 它', () => {
    const dir = resolve(root, 'supabase/migrations');
    const candidates = readdirSync(dir)
      .filter((name) => name.endsWith('.sql'))
      .filter((name) => {
        const sql = stripSqlComments(read(`supabase/migrations/${name}`));
        return /create\s+(or\s+replace\s+)?function\s+public\.list_public_bohai_modes/i.test(sql);
      })
      .sort();
    expect(candidates.length).toBeGreaterThan(0);
    const last = candidates[candidates.length - 1];
    const sql = stripSqlComments(read(`supabase/migrations/${last}`));
    expect(sql).not.toContain('strategy_candidates');
  });
});

describe('策略行候选池：Edge Function 侧', () => {
  const ef = squeezeSource(read(EF));

  it('SELECT 列表带上了 strategy_candidates（漏了 = 永远读到 undefined）', () => {
    expect(ef).toMatch(/select\([\s\S]{0,400}strategy_candidates/);
  });

  it('候选挑选走同一个函数，且倍率取策略行、不是候选行', () => {
    expect(ef).toContain('resolveStrategyCandidate(');
    // 候选行的 quota_multiplier 绝不能被取用 —— 这是「策略独立定价」的核心
    expect(ef).not.toMatch(/quotaMultiplier:\s*normalizeQuotaMultiplier\(\s*pickedCandidate/);
    expect(ef).toMatch(/quotaMultiplier:\s*normalizeQuotaMultiplier\(\s*data\.quota_multiplier/);
  });

  it('候选行要重新过 provider 白名单与 tier 闸门', () => {
    expect(ef).toMatch(/PROVIDER_OPTIONS\.has\(pickedProvider\)/);
    expect(ef).toMatch(/tierAllows\(tier,\s*normalizeTier\(minTier\)\)/);
  });

  it('种子含北京日期 + 用户 + 策略（同一天同一用户恒定）', () => {
    expect(ef).toContain('beijingDateKey(');
    expect(ef).toMatch(/beijingDateKey\(\)[\s\S]{0,160}userId[\s\S]{0,80}data\.mode_id/);
    // 必须走确定性哈希，不能引入 Math.random（否则每次请求都换模型）
    expect(ef).not.toMatch(/hashSeed[\s\S]{0,200}Math\.random/);
  });
});
