/**
 * 邮件保活「自愈 + 告警」守卫（2026-10-27）。
 *
 * 背景：旧设计是 pg_cron 每月 8 号固定发一封。上线 19 天后实测
 * `cron.job_run_details` 里 **0 条执行记录**（首次排期 11-08），底账 9 行里只有 1 行真成功——
 * 「保活是否生效」在第一个月里根本无从验证；而一旦那唯一一次失败，下次机会要等 30 天，
 * Brevo 的回收窗口只有 90 天。
 *
 * 本文件锁住新设计的三个要害：
 *   1. `evaluateKeepaliveHealth` 的每个分支 —— 判反了要么天天误报，要么坏了也不吭声；
 *   2. 生成的 cron 命令必须带**阈值条件**（否则每天真发一封垃圾邮件）、
 *      必须带**告警**（否则失败无人知）、且 `$cmd$` 定界符不能被命令内部破坏；
 *   3. ops 脚本的接线 —— `--cron` 轮换 token 时必须连巡检 job 一起换
 *      （只换一边 = 巡检天天 401，正是要消灭的那类静默失败）。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALERT_DEDUPE_HOURS,
  buildBearerFromVault,
  buildWatchdogCommand,
  buildWatchdogScheduleSql,
  evaluateKeepaliveHealth,
  hasInlineToken,
  KEEPALIVE_ALERT_AFTER_FAILURES,
  KEEPALIVE_STALE_DAYS,
  MAIL_KEEPALIVE_TOKEN_SECRET,
  MONTHLY_JOB_NAME,
  WATCHDOG_JOB_NAME,
  WATCHDOG_SCHEDULE,
} from '../../scripts/lib/mail-keepalive-policy.mjs';
import { flattenSource } from '../helpers/source.js';

const ROOT = process.cwd();
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');
const DAY = 86_400_000;
const NOW = new Date('2026-10-27T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY);

describe('evaluateKeepaliveHealth —— 健康判定', () => {
  it('从未成功过 ⇒ never（最严重，优先于其它判定）', () => {
    const v = evaluateKeepaliveHealth({ lastOkAt: null, now: NOW });
    expect(v.status).toBe('never');
    expect(v.ok).toBe(false);
    expect(v.ageDays).toBeNull();
    expect(v.reasons).toHaveLength(1);
  });

  it('刚成功过 ⇒ ok', () => {
    const v = evaluateKeepaliveHealth({ lastOkAt: daysAgo(1), now: NOW });
    expect(v.status).toBe('ok');
    expect(v.ok).toBe(true);
    expect(v.ageDays).toBeCloseTo(1, 5);
    expect(v.reasons).toEqual([]);
  });

  it('超过阈值 ⇒ stale', () => {
    const v = evaluateKeepaliveHealth({ lastOkAt: daysAgo(KEEPALIVE_STALE_DAYS + 1), now: NOW });
    expect(v.status).toBe('stale');
    expect(v.ok).toBe(false);
  });

  it('恰好等于阈值 ⇒ 仍然 ok（边界是「超过」而不是「达到」）', () => {
    // 巡检条件是 `last_ok < now() - interval '21 days'`，
    // 判定若写成 >= 会比巡检早一秒报红 —— 边界必须和 SQL 同口径。
    const v = evaluateKeepaliveHealth({ lastOkAt: daysAgo(KEEPALIVE_STALE_DAYS), now: NOW });
    expect(v.status).toBe('ok');
  });

  it('最近连续失败达到阈值 ⇒ failing（即使 age 还很小）', () => {
    // 这是关键场景：坏了要立刻说，不能等 21 天窗口走完。
    const v = evaluateKeepaliveHealth({
      lastOkAt: daysAgo(2),
      recentFailures: KEEPALIVE_ALERT_AFTER_FAILURES,
      now: NOW,
    });
    expect(v.status).toBe('failing');
    expect(v.ok).toBe(false);
    expect(v.reasons[0]).toContain(String(KEEPALIVE_ALERT_AFTER_FAILURES));
  });

  it('失败数不足阈值 ⇒ 不算红（单次抖动不该刷告警）', () => {
    const v = evaluateKeepaliveHealth({
      lastOkAt: daysAgo(2),
      recentFailures: KEEPALIVE_ALERT_AFTER_FAILURES - 1,
      now: NOW,
    });
    expect(v.status).toBe('ok');
  });

  it('failing 优先于 stale（当下坏了的处置更紧急）', () => {
    const v = evaluateKeepaliveHealth({
      lastOkAt: daysAgo(KEEPALIVE_STALE_DAYS + 5),
      recentFailures: KEEPALIVE_ALERT_AFTER_FAILURES,
      now: NOW,
    });
    expect(v.status).toBe('failing');
  });

  it('接受 ISO 字符串与数字型失败数（Query 返回值都是字符串/any）', () => {
    const v = evaluateKeepaliveHealth({
      lastOkAt: daysAgo(3).toISOString(),
      recentFailures: '2',
      now: NOW,
    });
    expect(v.status).toBe('failing');
    expect(v.ageDays).toBeCloseTo(3, 5);
  });

  it('坏日期字符串 ⇒ never（当作没成功过，不静默变 NaN 后判绿）', () => {
    expect(evaluateKeepaliveHealth({ lastOkAt: 'not-a-date', now: NOW }).status).toBe('never');
    expect(evaluateKeepaliveHealth({ lastOkAt: '', now: NOW }).status).toBe('never');
  });

  it('空入参不抛异常（--health 首次跑在空底账上）', () => {
    expect(() => evaluateKeepaliveHealth()).not.toThrow();
    expect(evaluateKeepaliveHealth().status).toBe('never');
  });
});

describe('buildWatchdogCommand —— 巡检命令本体', () => {
  const cmd = buildWatchdogCommand({ ref: 'abcdefghijklmnop' });

  it('只在「距上次成功 ≥ 阈值」时才发（否则每天一封垃圾邮件）', () => {
    expect(cmd).toContain(`interval '${KEEPALIVE_STALE_DAYS} days'`);
    // `select … where <cond>` 无 FROM：条件不成立 ⇒ 零行 ⇒ net.http_post 根本不被求值
    expect(cmd).toMatch(
      /where\s+coalesce\(\s*\(select max\(triggered_at\) from public\.mail_keepalive_log where ok\)/,
    );
    expect(cmd).toContain('to_timestamp(0)'); // 底账为空 ⇒ 立即补发，而不是永远不发
  });

  it('鉴权头从 Vault 读，命令里不留明文 token（cron.job 可被任意只读账号看见）', () => {
    expect(cmd).toContain('vault.decrypted_secrets');
    expect(cmd).toContain(`name = '${MAIL_KEEPALIVE_TOKEN_SECRET}'`);
    expect(hasInlineToken(cmd)).toBe(false);
    expect(cmd).toContain('https://abcdefghijklmnop.supabase.co/functions/v1/mail-keepalive');
  });

  it('连续失败 ⇒ 给管理员写站内信（触发器自动排浏览器推送）', () => {
    expect(cmd).toContain("p.role = 'admin'");
    expect(cmd).toContain("n2.type = 'system'");
    expect(cmd).toContain('【邮件保活】');
    expect(cmd).toContain(`interval '${ALERT_DEDUPE_HOURS} hours'`); // 去重，别天天刷
  });

  it("「真实尝试」用 recipient <> '' 过滤（鉴权失败留痕不算保活失败）", () => {
    // EF 在 UNAUTHORIZED_TOKEN 分支写 recipient: ''；外部扫描器打端点会留这种行，
    // 不排除的话告警会被「陌生扫描器打了几次」刷出来。
    const realAttemptFilter = cmd.match(/where recipient <> ''/g) || [];
    expect(realAttemptFilter.length).toBeGreaterThanOrEqual(2);
  });

  it('缺 ref / secret 名直接抛（不生成一条永远 401 的合法 job）', () => {
    expect(() => buildWatchdogCommand({ ref: '' })).toThrow();
    expect(() => buildWatchdogCommand({ ref: 'r', tokenSecretName: '' })).toThrow();
  });
});

describe('buildWatchdogScheduleSql —— cron 注册包装', () => {
  const sqlText = buildWatchdogScheduleSql({ ref: 'abcdefghijklmnop' });

  it('幂等：先 unschedule 同名再 schedule', () => {
    expect(sqlText).toContain(`jobname = '${WATCHDOG_JOB_NAME}'`);
    expect(sqlText).toContain('cron.unschedule(jobid)');
    expect(sqlText).toMatch(
      new RegExp(
        `cron\\.schedule\\(\\s*'${WATCHDOG_JOB_NAME}',\\s*'${WATCHDOG_SCHEDULE.replace(/\*/g, '\\*')}'`,
      ),
    );
  });

  it('$cmd$ 定界符不能被命令内部破坏（命令里出现 $cmd$ ⇒ 语法错在 cron 侧静默）', () => {
    const open = (sqlText.match(/\$cmd\$/g) || []).length;
    expect(open, '$cmd$ 必须恰好出现两次（开+闭）').toBe(2);
    const body = buildWatchdogCommand({ ref: 'abcdefghijklmnop' });
    expect(body).not.toContain('$cmd$');
    expect(body).not.toContain('$$');
  });

  it('job 名与心跳 job 分开（两个终归是两条独立通道）', () => {
    expect(WATCHDOG_JOB_NAME).not.toBe(MONTHLY_JOB_NAME);
    expect(sqlText).not.toContain(`jobname = '${MONTHLY_JOB_NAME}'`);
  });
});

describe('Vault 引用 —— token 不再进 cron 命令', () => {
  it('buildBearerFromVault 生成可拼进 jsonb_build_object 的表达式', () => {
    const expr = buildBearerFromVault();
    expect(expr).toBe(
      `'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = '${MAIL_KEEPALIVE_TOKEN_SECRET}')`,
    );
  });

  it('可指定别的 secret 名（同一套机制复用到别的 job）', () => {
    expect(buildBearerFromVault('push_dispatch_key')).toContain("name = 'push_dispatch_key'");
  });

  it('hasInlineToken 只认 64 位十六进制（旧形态），不会误伤别的字符串', () => {
    expect(hasInlineToken(`'Bearer ${'c'.repeat(64)}'`)).toBe(true);
    expect(hasInlineToken("'Bearer abc'")).toBe(false);
    expect(hasInlineToken(`'Bearer ${'z'.repeat(64)}'`)).toBe(false);
    expect(hasInlineToken('')).toBe(false);
    expect(hasInlineToken(null)).toBe(false);
  });

  it('生成的命令必须通过 hasInlineToken 的「干净」检查', () => {
    expect(hasInlineToken(buildWatchdogCommand({ ref: 'r'.repeat(16) }))).toBe(false);
  });
});

describe('ops 脚本接线', () => {
  const ops = flattenSource(read('scripts/mail-keepalive-ops.mjs'));

  it('有 --watchdog 与 --health 两个入口', () => {
    expect(ops).toContain(flattenSource("if (WANT('--watchdog'))"));
    expect(ops).toContain(flattenSource("if (WANT('--health'))"));
  });

  it('--health 走同一个判定函数（不许在脚本里另写一套口径）', () => {
    expect(ops).toContain(flattenSource('evaluateKeepaliveHealth({'));
  });

  it('--cron 轮换 token 时必须连巡检 job 一起换（只换一边 ⇒ 巡检天天 401）', () => {
    // 轮换后两条 job 都指向同一个 Vault 条目 ⇒ 只需改 vault 一处，两边同时生效
    expect(ops).toContain(flattenSource('buildWatchdogScheduleSql({ ref: REF })'));
  });

  it('--cron 先写 Vault 再注册 job（顺序反了会注册出引空密文的 job）', () => {
    // 用 check 标签定位：源码经 flattenSource 压平后空白不可靠，字符串常量是稳的
    const vaultIdx = ops.indexOf(flattenSource('C0b token 已写入 Vault'));
    const cronIdx = ops.indexOf(flattenSource('C1 cron job 已写入'));
    expect(vaultIdx).toBeGreaterThan(-1);
    expect(cronIdx).toBeGreaterThan(-1);
    expect(vaultIdx).toBeLessThan(cronIdx);
  });

  it('脚本里不再从 cron 命令捞 token（旧路径已删除）', () => {
    expect(ops).not.toContain('readTokenFromCronJob');
    expect(ops).not.toContain('extractTokenFromCommand');
  });

  it('--verify 断言巡检 job 与阈值（缺了就是「装完没人验」）', () => {
    expect(ops).toContain(flattenSource("where jobname = '${WATCHDOG_JOB_NAME}' and active"));
    expect(ops).toContain(flattenSource('KEEPALIVE_STALE_DAYS'));
  });
});
