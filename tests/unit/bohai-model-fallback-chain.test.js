/**
 * 审核模型「服务端降级链」的结构守卫（2026-10-29）。
 *
 * 背景：此前整条远端审核是「单模型 + 单密钥 + 单次请求」——
 * `resolveRuntimeModelPolicy` 只解析一个 model_id、Worker 纯透传、`resolveActiveSecret`
 * 只取单行密钥。Gemini 某个模型下线/被限流时，唯一兜底是前端回落到本地 nsfwjs（从宽判定）。
 * 本次给 `bohai_model_configs` 加 `fallback_mode_ids`，EF 逐跳重试。
 *
 * 这条链全是「静默失效」型的坑 —— 配错了不会报错，只会表现为「兜底没生效」：
 *   ① 迁移加了列，但 EF 的 SELECT 没跟着加 ⇒ 永远读到 undefined（本仓库已经踩过一次，
 *      见 loadModelConfigRow 上方关于 strategy_candidates 的注释）；
 *   ② 主行引用的 mode_id 拼错 ⇒ 该跳永远被跳过；
 *   ③ 把 400/401 也当成「可以换模型」⇒ 同一个请求错误犯三遍，还把超时乘以 3；
 *   ④ 降级写在「已经开始转发流」之后 ⇒ 两段回复被拼在一起。
 *
 * 反证（改一处必须红一处）见文件末尾。
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { squeezeSource, stripComments } from '../helpers/source.js';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const stripSqlComments = (sql) => String(sql).replace(/(^|\s)--[^\n]*/g, '$1');

const MIGRATION = 'supabase/migrations/2026102904_moderation_fallback_chain.sql';
const EF = 'supabase/functions/api-key-vault/index.ts';

/**
 * 审核链**当前**的模型顺序写在「最后一条 moderation 相关迁移」里
 * （904 建链 → 905 首修正 → 906 按延迟排序）。按文件名取最后一条，
 * 以后再加修正迁移会自动跟上，不用回来改这个常量。
 */
const LATEST_CHAIN_MIGRATION = readdirSync(resolve(root, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql') && /moderation/i.test(f))
  .sort()
  .pop();

/**
 * 2026-10-29 端到端实测**通过**的模型白名单（224px 送审，经 EF → Worker → Gemini）。
 * 实测数据：3.5-flash-lite 2.6~3.1s、3.5-flash 3.3~3.9s、3.6-flash 3.6~5.0s；
 * `gemini-3.8-flash` **纯文本就 503 / 30s 超时**（与是否带图无关）⇒ 不得进配置。
 * 这张表就是「配置里的 model_id 必须实测过」这条纪律的载体：新增模型要先跑一次真请求。
 */
const VERIFIED_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.6-flash'];

const PRIMARY_MODE_IDS = ['moderation-image', 'moderation-text'];

/**
 * 从 EF 源码里切出一个定义体。两种写法都要认（本文件两种都用到了）：
 *   · `const xxx = (...) => {...};`  → 到顶层 `\n};`
 *   · `async function xxx(...) {...}` → 到顶层 `\n}`
 * 切不出来就返回空串 ⇒ 断言立刻红（"找不到"必须 fail，不能静默跳过）。
 */
const extractDefine = (code, name) => {
  const arrow = code.indexOf(`const ${name} = `);
  if (arrow >= 0) {
    const rest = code.slice(arrow);
    const end = rest.indexOf('\n};');
    return end < 0 ? rest.slice(0, 4000) : rest.slice(0, end + 3);
  }
  const fn = code.indexOf(`function ${name}(`);
  if (fn >= 0) {
    const rest = code.slice(fn);
    const end = rest.indexOf('\n}');
    return end < 0 ? rest.slice(0, 4000) : rest.slice(0, end + 2);
  }
  return '';
};

describe('降级链：迁移侧', () => {
  it('新增 fallback_mode_ids 列，带形状约束与上限（数组、最多 3 跳）', () => {
    const sql = stripSqlComments(read(MIGRATION));
    expect(sql).toContain('add column if not exists fallback_mode_ids jsonb');
    // 上限必须与 EF 的 FALLBACK_CHAIN_MAX 一致：3
    expect(sql).toContain("jsonb_typeof(fallback_mode_ids) = 'array'");
    expect(sql).toContain('jsonb_array_length(fallback_mode_ids) <= 3');
  });

  it('主行引用的每一跳都在同一次迁移里建好了（拼错 = 该跳永远被跳过）', () => {
    const sql = stripSqlComments(read(MIGRATION));
    const declared = new Set(
      [...sql.matchAll(/\(\s*'(moderation-[a-z0-9-]+)',\s*\n\s*'审核/g)].map((m) => m[1]),
    );
    const referenced = [...sql.matchAll(/fallback_mode_ids = '(\[[^\]]*\])'::jsonb/g)].flatMap(
      (m) => JSON.parse(m[1]),
    );

    expect(referenced.length).toBeGreaterThanOrEqual(4);
    for (const modeId of referenced) {
      expect(declared).toContain(modeId);
      // 前缀必须还是 moderation-：用户侧模式列表靠这个前缀排除（迁移 2026101801）
      expect(modeId.startsWith('moderation-')).toBe(true);
    }
    for (const primary of PRIMARY_MODE_IDS) {
      expect(sql).toContain(`where mode_id = '${primary}'`);
    }
  });

  it('链上每一跳的 model_id 都来自「实测通过」白名单，且三跳互不相同', () => {
    const sql = stripSqlComments(read(`supabase/migrations/${LATEST_CHAIN_MIGRATION}`));
    const models = [...sql.matchAll(/set model_id = '(gemini-[^']+)'/g)].map((m) => m[1]);
    // 主 + fb1 + fb2 三跳都要被这条迁移写明（漏一跳就是那条迁移没真正生效）
    expect(models.length).toBe(3);
    for (const model of models) {
      expect(VERIFIED_MODELS).toContain(model);
    }
    // 同一模型排两跳没有意义（前一跳失败时后一跳必然也失败）
    expect(new Set(models).size).toBe(models.length);
  });
});

describe('降级链：EF 侧', () => {
  it('loadModelConfigRow 的 SELECT 带上了 fallback_mode_ids（漏了就是永远 undefined）', () => {
    const code = read(EF);
    const body = extractDefine(code, 'loadModelConfigRow');
    // 注意：这里断言的是**那个函数的** select 字符串，不是全文 —— 全文里还有别的 SELECT
    expect(body).toContain('fallback_mode_ids');
    // 与 strategy_candidates 同一行：两个列都是「加了列忘了读」的高危项
    expect(squeezeSource(body)).toContain(squeezeSource('strategy_candidates, fallback_mode_ids'));
  });

  it('只在「换模型可能不一样」的错误上降级：401 必须不重试，400 必须重试', () => {
    const body = extractDefine(read(EF), 'shouldFallbackToNextModel');
    // 401 = 密钥问题，链上共用同一把 key，换模型救不了
    expect(body).toContain('if (status === 401) return false');
    // 400 必须重试：审核链的 payload 形状是稳定的，剩下的 400 多半是「这个模型不吃这种输入」
    //（不吃 image_url 就是这一类）。历史上这里写成 return false，等于整条链失效。
    expect(body).not.toContain('status === 400');
  });

  it('两条链路都走「主模型 + 降级链」，且降级发生在开始转发之前', () => {
    const code = read(EF);
    // 调用点：传的是 policies（不是单个 policy）
    expect(code).toContain('runtimeChatCompletion(client, body, policies)');
    expect(squeezeSource(code)).toContain(squeezeSource('runtimeChatCompletionStream('));
    expect(squeezeSource(code)).toContain(squeezeSource('quota, policies)'));

    // 流式：降级的 fetch 循环必须在 new ReadableStream 之前 —— 否则已经开始转发再换模型，
    // 会把两段不同的回复拼给用户
    const streamBody = code.slice(code.indexOf('const runtimeChatCompletionStream = async'));
    const loopAt = streamBody.indexOf('for (let index = 0; index < policies.length; index += 1)');
    const readableAt = streamBody.indexOf('const proxiedStream = new ReadableStream');
    expect(loopAt).toBeGreaterThan(-1);
    expect(readableAt).toBeGreaterThan(-1);
    expect(loopAt).toBeLessThan(readableAt);
  });

  it('降级链的上限与迁移约束同值（3），且解析会跳过自指/重复', () => {
    const code = read(EF);
    expect(code).toContain('const FALLBACK_CHAIN_MAX = 3');
    const parser = extractDefine(code, 'parseFallbackModeIds');
    expect(parser).toContain('seen.has(modeId)');
    // 主模式不能被自己当降级目标（否则 resolve 里 primary 与 fallback 同 mode）
    expect(code).toContain('chain.some((item) => item.mode.toLowerCase() === modeId)');
  });

  /**
   * 超时预算必须是**整条链共用一份**（2026-10-29）。
   *
   * 旧写法在循环里每跳都 `AbortSignal.timeout(clampInt(body.timeoutMs, …))`，
   * 3 跳就等于最多 3 倍预算；而客户端用同一个值罩住整次调用
   * （`api-key-runtime-api.js` 的 `AbortSignal.timeout(timeoutMs)`），
   * 于是第 2 跳起必然是「服务端还在打上游、客户端已经 abort」——
   * 白扣额度，前端还只收到一个超时（会被记成云端不可达 → 触发冷却）。
   */
  it('每跳超时按**剩余预算**发请求，不是每跳各拿一份满额', () => {
    // 必须先剥注释再断言：本文件上文/源码里对旧写法的**引用**就在注释里，
    // 直接对全文做否定断言会被自己的说明文字打红（本仓库踩过的老坑）。
    const code = stripComments(read(EF));
    const squeezed = squeezeSource(code);

    // 旧写法一个字面都不能留：留着就是「每跳满额」复辟
    expect(squeezed).not.toContain(
      squeezeSource('AbortSignal.timeout(clampInt(body.timeoutMs, 30000, 3000, 120000))'),
    );
    // 预算在**循环外**算一次
    expect(squeezed).toContain(
      squeezeSource('const chainBudgetMs = clampInt(body.timeoutMs, 30000, 3000, 120000)'),
    );
    expect(squeezed).toContain(squeezeSource('const chainStartedAt = Date.now()'));

    // 剩余预算必须是「预算 - 已用时」，两处 fetch 都要用它
    const remaining = [
      ...code.matchAll(/const remainingMs = chainBudgetMs - \(Date\.now\(\) - chainStartedAt\)/g),
    ];
    expect(remaining.length).toBe(2);
    const hopSignals = [
      ...code.matchAll(/AbortSignal\.timeout\(Math\.max\(MIN_HOP_TIMEOUT_MS, remainingMs\)\)/g),
    ];
    // 非流式 + 流式各一处；少一处就是那条链路又变回「每跳满额」
    expect(hopSignals.length).toBe(2);
  });
});

/**
 * ── 「本地能不能预验 EF 类型」的接线守卫（2026-10-29 加）──────────────────
 *
 * 本仓 EF 的类型检查只存在于 CI（deno-check.yml，阻断）。本地过去拿 esbuild 顶替，
 * 而 **esbuild 只删类型、不查类型** —— 2026-10-29 就漏掉一个真实的联合类型错
 * （`result.message` 在成功分支上不存在），esbuild 全绿、deno check 当场红。
 *
 * 所以「本地有一条能真跑类型的命令」本身就是要守住的东西：它被删掉不会报警，
 * 只会让下一次 EF 改动重新变成「推上去等 CI 打回来」。
 */
describe('EF 类型检查的本地入口', () => {
  it('package.json 提供 check:ef，且脚本文件真的存在', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['check:ef']).toBe('node scripts/check-edge-functions.mjs');
    expect(read('scripts/check-edge-functions.mjs')).toContain('deno');
  });

  it('gate:plan 把 supabase/functions/** 映射到 check:ef（否则没人会想起来跑它）', () => {
    const map = JSON.parse(read('scripts/lib/gate-map.json'));
    const entry = map.entries.find((e) => e.glob === 'supabase/functions/**');
    expect(entry).toBeTruthy();
    expect(entry.run).toContain('npm run check:ef');
  });

  it('降级链的返回类型是「成功无 message / 失败有 message」的判别联合', () => {
    const code = read(EF);
    // 必须靠字面量 ok 判别，调用点才收得窄；写成 `ok: boolean` + `message?` 会让
    // `result.ok ? '' : result.message` 直接报「属性不存在」（就是被测出来的那个错）。
    expect(squeezeSource(code)).toContain(
      squeezeSource('type RuntimeChatOutcome = RuntimeChatSuccess | RuntimeChatFailure;'),
    );
    expect(squeezeSource(code)).toContain(squeezeSource('): Promise<RuntimeChatOutcome> => {'));
    const successType = code.slice(code.indexOf('type RuntimeChatSuccess = {'));
    const successBody = successType.slice(0, successType.indexOf('};'));
    expect(successBody).not.toContain('message');
    expect(successBody).toContain('ok: true');
  });
});

/**
 * ── 反证记录（2026-10-29 实跑）────────────────────────────────────────
 * 1. 从 loadModelConfigRow 的 select 删掉 `fallback_mode_ids`
 *    → 「SELECT 带上了」那条红（其余绿）。这正是本仓库已经踩过一次的坑。
 * 2. 把 `shouldFallbackToNextModel` 里的 401 分支改成 `return true`（或整段改成
 *    旧的「400/401 都 return false」）
 *    → 「401 必须不重试、400 必须重试」那条红。
 * 3. 把调用点改回 `runtimeChatCompletion(client, body, policy)`（单数）
 *    → 「两条链路都走主模型 + 降级链」红。
 * 4. 把流式的 fetch 循环挪到 `new ReadableStream` 之后（或在 start 里降级）
 *    → 「降级发生在开始转发之前」红。
 */
