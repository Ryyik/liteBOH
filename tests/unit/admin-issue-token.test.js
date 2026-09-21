import { beforeEach, describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';

// ============================================================
// 被测模块：supabase/functions/_shared/admin-issue-token.ts（纯逻辑）
// + admin-issue-login-token/index.ts（源码级守卫断言）
//
// 与仓库既有 EF 测试同构：index.ts 顶层是 Deno.serve，无法在 node 中
// 运行 —— 流程行为由「源码守卫断言 + 纯模块行为测试 + 线上探针」三层覆盖。
// ============================================================
const EF_INDEX_PATH = 'supabase/functions/admin-issue-login-token/index.ts';
const SHARED_PATH = 'supabase/functions/_shared/admin-issue-token.ts';

// 源码守卫断言一律跑在「剥离注释后」的源码上：
// 注释里会出现 generateLink / action_link 等字样（解释设计意图），
// 不剥离会让 indexOf 定位与「不包含」断言全部失真。
const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');

describe('admin-issue-token 纯逻辑：validateIssueInput', () => {
  it('user_id 缺失 → INVALID_INPUT', async () => {
    const { validateIssueInput } = await import('../../' + SHARED_PATH);
    const result = validateIssueInput({ reason: '测试' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_INPUT');
  });

  it('user_id 非法（非 UUID）→ INVALID_USER_ID', async () => {
    const { validateIssueInput } = await import('../../' + SHARED_PATH);
    const result = validateIssueInput({ user_id: 'not-a-uuid', reason: '测试' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_USER_ID');
  });

  it('原因缺失或纯空白 → REASON_REQUIRED（原因必填，写入审计）', async () => {
    const { validateIssueInput } = await import('../../' + SHARED_PATH);
    for (const reason of [undefined, '', '    ']) {
      const result = validateIssueInput({
        user_id: '11111111-2222-4333-8444-555555555555',
        reason,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('REASON_REQUIRED');
    }
  });

  it('原因超长 → REASON_TOO_LONG', async () => {
    const { validateIssueInput, REASON_MAX_LENGTH } = await import('../../' + SHARED_PATH);
    const result = validateIssueInput({
      user_id: '11111111-2222-4333-8444-555555555555',
      reason: 'x'.repeat(REASON_MAX_LENGTH + 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('REASON_TOO_LONG');
  });

  it('合法入参 → 通过并做 trim 归一', async () => {
    const { validateIssueInput } = await import('../../' + SHARED_PATH);
    const result = validateIssueInput({
      user_id: ' 11111111-2222-4333-8444-555555555555 ',
      reason: '  用户丢失邮箱访问，已当面核实  ',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.userId).toBe('11111111-2222-4333-8444-555555555555');
      expect(result.value.reason).toBe('用户丢失邮箱访问，已当面核实');
    }
  });
});

describe('admin-issue-token 纯逻辑：buildAuditRow', () => {
  it('审计行形状完整：actor/target/username/reason + status=pending', async () => {
    const { buildAuditRow } = await import('../../' + SHARED_PATH);
    const row = buildAuditRow({
      actorId: 'aaaaaaaa-1111-4222-8333-444444444444',
      targetId: '11111111-2222-4333-8444-555555555555',
      targetUsername: 'some_user',
      reason: '丢失邮箱',
    });
    expect(row.actor_id).toBe('aaaaaaaa-1111-4222-8333-444444444444');
    expect(row.target_id).toBe('11111111-2222-4333-8444-555555555555');
    expect(row.target_username).toBe('some_user');
    expect(row.reason).toBe('丢失邮箱');
    expect(row.status).toBe('pending');
    expect(row.detail).toMatchObject({ otp_type: 'recovery', delivery: 'manual' });
  });
});

describe('admin-issue-token 纯逻辑：pickIssuePayload（出参收敛）', () => {
  it('从 generateLink 返回中提取 hashed_token', async () => {
    const { pickIssuePayload } = await import('../../' + SHARED_PATH);
    const result = pickIssuePayload({
      properties: { hashed_token: 'abc.def', action_link: 'https://…/verify?token=…', email_otp: '123456' },
      user: { id: 'u1' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.token).toBe('abc.def');
  });

  it('hashed_token 缺失 → TOKEN_GENERATION_EMPTY（不把空 token 发出去）', async () => {
    const { pickIssuePayload } = await import('../../' + SHARED_PATH);
    const result = pickIssuePayload({ properties: {}, user: { id: 'u1' } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('TOKEN_GENERATION_EMPTY');
  });

  it('返回体里没有 action_link / email_otp（出参收敛：只允许 token 出去）', async () => {
    const { pickIssuePayload } = await import('../../' + SHARED_PATH);
    const result = pickIssuePayload({
      properties: { hashed_token: 'abc.def', action_link: 'https://…', email_otp: '123456' },
    });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain('action_link');
    expect(JSON.stringify(result)).not.toContain('email_otp');
    expect(JSON.stringify(result)).not.toContain('https://');
  });
});

describe('admin-issue-login-token EF：源码级安全守卫（剥离注释后）', () => {
  let code = '';
  let shared = '';
  beforeEach(async () => {
    code = stripComments(await readFile(EF_INDEX_PATH, 'utf-8'));
    shared = stripComments(await readFile(SHARED_PATH, 'utf-8'));
  });

  it('使用 requireAdmin 门禁（Bearer → getUser → profiles.role === admin）', () => {
    expect(code).toMatch(/const requireAdmin/);
    expect(code).toMatch(/profiles[\s\S]*?select\('role'\)/);
    expect(code).toMatch(/!== 'admin'/);
  });

  it('审计先于签发：insert 审计行在 generateLink 之前（fail-closed）', () => {
    const insertIndex = code.indexOf(`.insert(auditRow)`);
    const generateIndex = code.indexOf('generateLink');
    expect(insertIndex).toBeGreaterThan(-1);
    expect(generateIndex).toBeGreaterThan(-1);
    expect(insertIndex).toBeLessThan(generateIndex);
  });

  it('审计写入失败 → 拒绝签发（AUDIT_WRITE_FAILED）', () => {
    expect(code).toContain('AUDIT_WRITE_FAILED');
  });

  it('签发失败 / 出参异常都会把审计行标为 failed，成功标 issued', () => {
    const failedCount = (code.match(/status: 'failed'/g) || []).length;
    expect(failedCount).toBeGreaterThanOrEqual(2);
    expect(code).toMatch(/\.update\(\{ status: 'issued' \}\)/);
  });

  it('活跃代码永不含 action_link / email_otp（注释里的设计说明不算）', () => {
    expect(code).not.toContain('action_link');
    expect(code).not.toContain('email_otp');
  });

  it('封禁用户拒绝签发（TARGET_BANNED）', () => {
    expect(code).toContain('TARGET_BANNED');
    expect(code).toMatch(/is_banned/);
  });

  it('限流存在（checkRateLimitDb）', () => {
    expect(code).toMatch(/checkRateLimitDb\(/);
    expect(code).toContain('RATE_LIMIT_MAX');
  });

  it('redirectTo 指向重置页（与既有找回邮件同一目的地）', () => {
    expect(code).toContain('/#/reset-password');
  });

  it('共享模块：出参收敛只取 hashed_token，活跃代码不含 action_link', () => {
    expect(shared).toMatch(/hashed_token/);
    expect(shared).not.toMatch(/action_link/);
  });
});
