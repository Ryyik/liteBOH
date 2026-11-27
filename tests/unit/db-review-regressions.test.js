import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

describe('database review regressions', () => {
  it('高风险 RPC 收紧后仍保留两个后台抽彩运维入口', () => {
    const sql = read('supabase/migrations/2026112605_harden_rpc_and_fix_xp.sql');
    expect(sql).toMatch(
      /grant execute on function public\.cleanup_lottery_scheduler_logs\(integer\)\s+to authenticated/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.execute_due_lottery_draws\(integer, text\)\s+to authenticated/,
    );
  });

  it('likes 只能本人插入且禁止自赞，XP 不接受历史事件与 be_liked 手刷', () => {
    const migration = 'supabase/migrations/2026112710_harden_forum_xp_and_bohai_compat.sql';
    expect(existsSync(resolve(root, migration))).toBe(true);
    const sql = read(migration);
    expect(sql).toContain('drop policy if exists "Auth insert like" on public.likes');
    expect(sql).toContain('likes_insert_own');
    expect(sql).toContain('FORUM_LIKE:SELF_LIKE');
    expect(sql).toContain("v_reason not in ('post', 'reply', 'like')");
    expect(sql).toContain("timestamptz '2026-11-27 14:52:39+00'");
  });

  it('likes 时间戳用于区分迁移前历史点赞', () => {
    const migration = 'supabase/migrations/2026112712_likes_created_at.sql';
    expect(existsSync(resolve(root, migration))).toBe(true);
    const sql = read(migration);
    expect(sql).toContain('add column if not exists created_at timestamptz');
    expect(sql).toContain("timestamptz '1970-01-01 00:00:00+00'");
    expect(sql).toContain('set default now()');
    expect(sql).toContain('l.created_at >= v_started_at');
  });

  it('XP 台账冲突时显式按 NULL 处理，不能重复发放', () => {
    const migration = 'supabase/migrations/2026112711_xp_award_conflict_guard.sql';
    expect(existsSync(resolve(root, migration))).toBe(true);
    const sql = read(migration);
    expect(sql).toContain('if v_inserted is distinct from true then');
  });

  it('BOHAI 兼容视图只暴露安全列且不可写', () => {
    const migration = 'supabase/migrations/2026112710_harden_forum_xp_and_bohai_compat.sql';
    expect(existsSync(resolve(root, migration))).toBe(true);
    const sql = read(migration);
    expect(sql).toContain('create view public.bohai_model_configs');
    expect(sql).toContain('bohai_model_configs_public_read');
    expect(sql).toContain('revoke all on table public.bohai_model_configs');
    expect(sql).toContain('grant select on public.bohai_model_configs');
    expect(sql).not.toContain('select * from public.bolek_model_configs');
  });

  it('XP 台账启用 RLS 与显式 deny-all 策略', () => {
    const migration = 'supabase/migrations/2026112708_forum_xp_ledger_rls.sql';
    expect(existsSync(resolve(root, migration))).toBe(true);
    const sql = read(migration);
    expect(sql).toContain('alter table public.forum_experience_awards enable row level security');
    const policyMigration = 'supabase/migrations/2026112709_forum_xp_ledger_deny_clients.sql';
    expect(existsSync(resolve(root, policyMigration))).toBe(true);
    const policySql = read(policyMigration);
    expect(policySql).toContain('forum_experience_awards_no_client_access');
    expect(policySql).toMatch(/using\s*\(false\)\s+with check\s*\(false\)/i);
  });

  it('隐藏在线状态只允许 self-only RPC，撤销列级直更权', () => {
    const migration = 'supabase/migrations/2026112707_hide_online_status_self_rpc.sql';
    expect(existsSync(resolve(root, migration))).toBe(true);
    const sql = read(migration);
    expect(sql).toContain('revoke update (hide_online_status)');
    expect(sql).toContain('create or replace function public.update_my_hide_online_status');
    expect(sql).toMatch(/where\s+id\s*=\s*auth\.uid\(\)/i);
  });

  it('数据库快照包含本轮新增的论坛卡位表', () => {
    const snapshot = JSON.parse(read('docs/db-schema-snapshot.json'));
    expect(snapshot.schema.forum_card_items).toBeDefined();
    expect(snapshot.schema.forum_experience_awards).toBeDefined();
    expect(snapshot.schema.bohai_model_configs).toBeDefined();
  });

  it('旧 BOHAI PWA/EF 兼容层在过渡期内保留', () => {
    const migration = 'supabase/migrations/2026112706_restore_bohai_compat.sql';
    expect(existsSync(resolve(root, migration))).toBe(true);
    const sql = read(migration);
    expect(sql).toContain('create view public.bohai_model_configs');
    expect(sql).toContain('security_invoker = true');
    expect(sql).toContain('create or replace function public.list_public_bohai_modes()');
    expect(sql).toContain('public.list_public_bolek_modes()');
  });

  it('经验发放按真实事件幂等，不能重复自刷', () => {
    const migration = 'supabase/migrations/2026112704_forum_xp_event_idempotency.sql';
    expect(existsSync(resolve(root, migration))).toBe(true);
    const sql = read(migration);
    expect(sql).toContain('forum_experience_awards');
    expect(sql).toContain('p_event_id uuid');
    expect(sql).toContain('on conflict do nothing');
    expect(sql).toMatch(/where\s+id\s*=\s*p_event_id\s+and\s+author_id\s*=\s*v_user_id/i);
  });

  it('被论坛 Hero 卡引用的活动 Hero 使用 RESTRICT，避免 SET NULL 撞 CHECK', () => {
    const migration = 'supabase/migrations/2026112703_forum_card_hero_restrict.sql';
    expect(existsSync(resolve(root, migration))).toBe(true);
    const sql = read(migration);
    expect(sql).toContain('forum_card_items_hero_id_fkey');
    expect(sql).toMatch(/references public\.home_heroes\(id\)\s+on delete restrict/i);
  });
});
