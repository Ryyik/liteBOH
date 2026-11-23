import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { squeezeSource } from '../helpers/source.js';

// ─────────────────────────────────────────────────────────────────────────────
// 2026-10-20 两道安全/限额收口的接线守卫
//
// ① settle_ai_points 倍率自读（迁移 2026102004）
// ② 游客每日 10 次对话（EF 内）
//
// 为什么用源码守卫：两条都是**服务端**行为，本机跑不到（`*.supabase.co` 被 SNI 拦、
// EF 改了还没部署）。按仓库既有惯例（cloud-album 那条：探针不进 CI，接线由单测锁），
// 这里锁「契约存在 + 反模式不回来」，运行期仍须线上验证。
// ─────────────────────────────────────────────────────────────────────────────

const read = (rel) => readFileSync(resolve(import.meta.dirname, '../..', rel), 'utf8');

const EF = 'supabase/functions/api-key-vault/index.ts';
const MIG = 'supabase/migrations/2026102004_harden_settle_ai_points_multiplier.sql';

describe('settle_ai_points 倍率自读（迁移 2026102004）', () => {
  it('新签名没有 p_multiplier 形参', () => {
    const sql = squeezeSource(read(MIG));
    // ⚠️ 期望串必须自己过一遍 squeezeSource：它会删掉闭括号前的空白
    //    （见 tests/helpers/source.js 注释），手写的 `p_mode text )` 永远匹配不上。
    expect(sql).toContain(
      squeezeSource(
        `create or replace function public.settle_ai_points(
           p_reservation_id uuid, p_total_tokens integer, p_model text, p_mode text)`,
      ),
    );
    // 函数体里必须用 DB 侧真源，不许再出现外部倍率
    expect(sql).toContain('public.get_ai_mode_token_multiplier(p_mode)');
    // ⚠️ 自检块本身会提到 p_multiplier（`prosrc like '%p_multiplier%'`），
    //    所以不能对整份文件断言 not.toContain —— 只断言「函数体赋值处」不再用它。
    expect(sql).not.toMatch(/greatest\(0,coalesce\(p_multiplier/);
  });

  it('必须先 DROP 旧签名（多一个形参 = 另一个函数，不 drop 攻击面原样保留）', () => {
    const sql = squeezeSource(read(MIG));
    expect(sql).toContain(
      'drop function if exists public.settle_ai_points(uuid, integer, numeric, text, text)',
    );
    // DROP 必须排在新函数创建之前
    const dropIdx = sql.indexOf('drop function if exists public.settle_ai_points');
    const createIdx = sql.indexOf('create or replace function public.settle_ai_points');
    expect(dropIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(dropIdx);
  });

  it('撤权写全 anon / authenticated / public 三个', () => {
    const sql = squeezeSource(read(MIG));
    expect(sql).toContain('from anon, authenticated, public');
    expect(sql).toContain('grant execute on function public.settle_ai_points');
    expect(sql).toContain('to service_role');
  });

  it('EF 调用点不再传 p_multiplier', () => {
    const ef = squeezeSource(read(EF));
    // settle 调用块里不该有 p_multiplier（reserve_ai_points 里那个是另一回事）
    const settleStart = ef.indexOf("client.rpc('settle_ai_points'");
    expect(settleStart).toBeGreaterThan(-1);
    const settleBlock = ef.slice(settleStart, settleStart + 400);
    expect(settleBlock).not.toContain('p_multiplier');
    expect(settleBlock).toContain('p_mode');
  });
});

describe('游客每日 10 次对话', () => {
  it('常量是 10，且按自然日而非滑动窗口', () => {
    const ef = read(EF);
    expect(ef).toContain('const GUEST_DAILY_CHAT_LIMIT = 10;');
    // 北京自然日 key（+8h 后取日期），不是 24h 滑动桶
    expect(ef).toContain('new Date(now.getTime() + 8 * 60 * 60 * 1000)');
    expect(ef).toContain('toISOString().slice(0, 10)');
  });

  it('已登录用户不计数（否则付费用户会莫名撞墙）', () => {
    const ef = squeezeSource(read(EF));
    const fnStart = ef.indexOf('const checkGuestDailyLimit');
    const fnBody = ef.slice(fnStart, fnStart + 700);
    expect(fnBody).toContain('if (identity.userId) return { ok: true');
  });

  it('两个 chat 分支都接了闸门（runtime-chat 与 runtime-chat-stream）', () => {
    const ef = read(EF);
    const gateCalls = ef.match(/await checkGuestDailyLimit\(identity\)/g) || [];
    expect(gateCalls.length).toBe(2);
    const rejects = ef.match(/code: 'GUEST_DAILY_LIMIT'/g) || [];
    expect(rejects.length).toBe(2);
  });

  it('驳回用独立错误码（前端要能区分「等一下」与「明天再来」）', () => {
    const ef = read(EF);
    expect(ef).toContain("code: 'GUEST_DAILY_LIMIT'");
    // 与分钟级限流的 RATE_LIMITED 必须是两个码
    expect(ef).toContain("code: 'RATE_LIMITED'");
    expect(ef).not.toMatch(/code: 'GUEST_DAILY_LIMIT'[\s\S]{0,80}code: 'RATE_LIMITED'/);
  });

  it('日限额窗口是 86400 秒，key 含日期戳', () => {
    const ef = squeezeSource(read(EF));
    expect(ef).toContain('86_400');
    expect(ef).toContain('ai_chat_guest_day:${day}');
  });
});
