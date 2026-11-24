/**
 * 档位序单一真源守卫（plans/046 P1）
 *
 * 背景：合并前「档位高低顺序」这条同一个事实被复制了 6 份，其中 5 份在前端
 * （SubscriptionPlans / useAvatarFrame / useLabQuota / photo-albums/quota /
 * subscription-benefits 自己的局部变量），第 6 份在 Deno 里（EF api-key-vault）。
 * 任一处漏改的表现是「同一用户在两张卡片上被认成不同档」或「头像框解锁等级与
 * 配额档位不一致」，两种都不会报错 —— 只能靠本文件锁。
 *
 * 三条纪律：
 *   1. 前端 5 个消费者**必须** import 真源，⛔ 不许在自己文件里出现档位序数组/映射；
 *   2. EF 那份引不到前端模块（Deno 独立），改为**比对源码文本**锁同序；
 *   3. `plus` 已并入 `pro`（2026-11-24），四档制 —— 任何一侧把 `plus` 加回档位序都算红。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PLAN_CODE_ALIASES_FOR_TEST as ALIASES,
  TIER_ORDER,
  nextTier,
  normalizeSubscriptionPlanCode,
  tierRank,
} from '../../src/utils/subscription-benefits.js';

const REPO_ROOT = resolve(__dirname, '../..');
const readSrc = (relPath) => readFileSync(resolve(REPO_ROOT, relPath), 'utf8');

/* 前端 5 个消费者：文件 + 必须出现的 import 标识符 */
const FRONTEND_CONSUMERS = [
  { path: 'src/components/SubscriptionPlans.vue', symbol: 'tierRank' },
  { path: 'src/composables/useAvatarFrame.js', symbol: 'tierRank' },
  { path: 'src/composables/useLabQuota.js', symbol: 'nextTier' },
  { path: 'src/utils/photo-albums/quota.js', symbol: 'nextTier' },
];

describe('档位序单一真源（plans/046 P1）', () => {
  it('TIER_ORDER 是四档制且不含 plus（Plus 已并入 Pro）', () => {
    expect(TIER_ORDER).toEqual(['free', 'pro', 'max', 'ultra']);
    expect(TIER_ORDER).not.toContain('plus');
  });

  it('tierRank 单调递增且未知档位返回 -1', () => {
    const ranks = TIER_ORDER.map((code) => tierRank(code));
    expect(ranks).toEqual([0, 1, 2, 3]);
    expect(tierRank('')).toBe(-1);
    expect(tierRank('nonexistent')).toBe(-1);
    // guest / anonymous 不是订阅档，不该被认成第 0 档
    expect(tierRank('guest')).toBe(-1);
    expect(tierRank('anonymous')).toBe(-1);
  });

  it('nextTier 逐档递进、最高档与未知档返回 null', () => {
    expect(nextTier('free')).toBe('pro');
    expect(nextTier('pro')).toBe('max');
    expect(nextTier('max')).toBe('ultra');
    expect(nextTier('ultra')).toBeNull();
    expect(nextTier('nope')).toBeNull();
  });

  it('历史 plus 经归一折到 pro（不新增档位，只折别名）', () => {
    expect(normalizeSubscriptionPlanCode('plus')).toBe('pro');
    expect(normalizeSubscriptionPlanCode('Plus')).toBe('pro');
    expect(normalizeSubscriptionPlanCode('boh-plus')).toBe('pro');
    expect(normalizeSubscriptionPlanCode('boh-ai-plus')).toBe('pro');
    // 折过之后就是 pro 的序号，Rosetta 上不存在「比 pro 低一档的 plus」
    expect(tierRank('plus')).toBe(tierRank('pro'));
    expect(nextTier('plus')).toBe('max');
  });

  it('别名表里没有残留指向 plus 的键（否则等于分叉出第 5 档）', () => {
    const danglingToPlus = Object.entries(ALIASES)
      .filter(([, v]) => v === 'plus')
      .map(([k]) => k);
    expect(danglingToPlus).toEqual([]);
  });

  it.each(FRONTEND_CONSUMERS)('$path 引用真源而非内联档位序', ({ path, symbol }) => {
    const src = readSrc(path);
    // 1) 必须从 subscription-benefits 里拿到标识符
    expect(src).toMatch(
      new RegExp(
        `import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from\\s*'@/utils/subscription-benefits\\.js'`,
      ),
    );
    // 2) 不许再出现档位序字面量：五档或四档的数组/映射都不行
    expect(src).not.toMatch(/\[\s*'free'\s*,\s*'plus'/);
    expect(src).not.toMatch(/\[\s*'free'\s*,\s*'pro'\s*,\s*'max'\s*,\s*'ultra'\s*\]/);
  });

  it('EF api-key-vault 的 TIER_RANK 与前端同序（Deno 引不到前端模块，靠源码文本锁）', () => {
    const src = readSrc('supabase/functions/api-key-vault/index.ts');
    const block = /const TIER_RANK: Record<string, number> = \{([\s\S]*?)\};/.exec(src);
    expect(block, 'EF 里找不到 TIER_RANK 定义').toBeTruthy();
    const pairs = [...block[1].matchAll(/(\w+)\s*:\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]);
    // guest 是 EF 独有的未登录档，排在订阅档之前；订阅档必须与 TIER_ORDER 同序
    const subscriptionPairs = pairs.filter(([code]) => code !== 'guest');
    expect(subscriptionPairs.map(([code]) => code)).toEqual(TIER_ORDER);
    // 序号必须严格递增（不出现两个同号）
    const nums = subscriptionPairs.map(([, n]) => n);
    nums.forEach((n, i) => {
      if (i > 0) expect(n).toBeGreaterThan(nums[i - 1]);
    });
    // 不许把 plus 加回 EF 的档位序
    expect(subscriptionPairs.map(([code]) => code)).not.toContain('plus');
  });

  it('EF 的 SUBSCRIPTION_PLAN_ALIASES 也把 plus 折到 pro（前后端归一一致）', () => {
    const src = readSrc('supabase/functions/api-key-vault/index.ts');
    const block = /const SUBSCRIPTION_PLAN_ALIASES: Record<string, string> = \{([\s\S]*?)\};/.exec(
      src,
    );
    expect(block, 'EF 里找不到 SUBSCRIPTION_PLAN_ALIASES 定义').toBeTruthy();
    // 直接断言源码里没剩 anyKey: 'plus'
    expect(block[1]).not.toMatch(/:\s*'plus'/);
    expect(block[1]).toMatch(/plus:\s*'pro'/);
  });
});
