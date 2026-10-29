/**
 * forum-async-worker 的账务 / 租约 / 通道隔离守卫（2026-10-29 审查后的修复）。
 *
 * 为什么是源码守卫而不是跑函数：EF 是 Deno 模块，顶层的 `Deno.env` 与
 * `Deno.serve` 在 vitest(node) 里起不来，没法 import。所以这里锁**结构性契约**，
 * 每条都对应一次已实测的缺陷，且断言要能在「改回旧写法」时当场变红：
 *
 *  ① 退回 pending 时**不许**再 +1 attempt —— claim 已经加过了。重复计数会让
 *     max_attempts=4 实际只剩 2 轮、退避整体错档（P1-1）；
 *  ② 退回 pending 的 update **必须**带 worker_id + status 守卫 —— 锁过期后 job
 *     可能已被别的 worker 接手，无守卫的写法会把对方刚完成的 job 打回 pending（P1-3）；
 *  ③ 租约时长必须严格大于「单 job 最坏耗时」＝ 预算 + 一批（hops × 单跳超时）；
 *  ④ 用户通道只许认领 post_moderation —— 否则任何登录用户都能借 service_role
 *     跑 image_recheck，把审核额度变成可放大的资源（P2-2）。
 *
 * 归一走 `tests/helpers/source.js`（两边过同一个函数），见该文件头部说明。
 */
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { scriptSection, squeezeSource, stripComments } from '../helpers/source.js';

const ROOT = process.cwd();
const read = (rel) => readFile(path.join(ROOT, rel), 'utf8');
const WORKER = 'supabase/functions/forum-async-worker/index.ts';

const workerSource = async () => squeezeSource(stripComments(scriptSection(await read(WORKER))));

/* 「退回 pending」那一段的切片。
   ⚠️ 不能用 `indexOf('if (deferred > 0) {')` 定位 —— processImageRecheck 里也有
   一个同名分支（它的作用是「本轮跑不完就抛错交给退避」），会切到错的那一块，
   断言就在「什么都没检查」的情况下假绿。改用这段 update 的**唯一特征行**定位：
   `status: 'pending'` 在整个 worker 里只出现这一次。 */
const releaseBlock = (code) => {
  const start = code.indexOf("status: 'pending',");
  const end = code.indexOf(".select('id')", start);
  expect(start, '应能定位退回 pending 的 update 块').toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return code.slice(start, end);
};

const constant = (code, name) => {
  const match = code.match(new RegExp(`${name}\\s*=\\s*(\\d+)`));
  expect(match, `应能解析常量 ${name}`).not.toBeNull();
  return Number(match[1]);
};

describe('forum-async-worker 的 attempt 账务', () => {
  it('退回 pending 时不写 attempt_count（claim 已递增，不能再 +1）', async () => {
    const block = releaseBlock(await workerSource());
    // 反证：把它改回 `attempt_count: job.attempt_count + 1`，本断言立刻变红
    expect(block).not.toContain('attempt_count');
  });

  it('退回 pending 的 update 带 worker_id + status 守卫', async () => {
    const block = releaseBlock(await workerSource());
    expect(block).toMatch(/\.eq\('worker_id',\s*workerId\)/);
    expect(block).toMatch(/\.eq\('status',\s*'running'\)/);
  });

  it('退避表按 claim 递增后的 attempt_count 取值（首轮 = 1 ⇒ 60s）', async () => {
    const code = await workerSource();
    // 断言的是「用 job.attempt_count 索引 3 档表」，不是具体数字：
    // 数字会随产品判断调整，索引口径错了才是 bug。
    expect(code).toMatch(/\[60,\s*300,\s*900\]\[job\.attempt_count - 1\]/);
  });
});

describe('forum-async-worker 的租约', () => {
  it('锁时长 > 预算 + 最后一批最坏耗时', async () => {
    const code = await workerSource();
    const budgetMs = constant(code, 'imageRecheckBudgetMs');
    const hops = constant(code, 'imageChainMaxHops');
    const hopTimeoutMs = constant(code, 'imageRequestTimeoutMs');
    // 单位：锁以**秒**计（claim 的 p_lock_seconds），预算与单跳超时以**毫秒**计。
    const lockMs = constant(code, 'JOB_LOCK_SECONDS') * 1000;

    // 预算只在每批开始前检查 ⇒ 单 job 最坏 = 预算 + 一批；锁必须盖住它，
    // 否则锁在中途过期、job 被第二个 worker 重复认领（原 45s / 45+24s 就是这样）。
    expect(lockMs).toBeGreaterThan(budgetMs + hops * hopTimeoutMs);
  });

  it('两条认领通道都用 JOB_LOCK_SECONDS，不写字面量', async () => {
    const code = await workerSource();
    expect(code).not.toMatch(/p_lock_seconds:\s*\d+/);
    const uses = code.match(/p_lock_seconds:\s*JOB_LOCK_SECONDS/g) || [];
    expect(uses.length).toBeGreaterThanOrEqual(2);
  });
});

describe('forum-async-worker 的通道隔离', () => {
  it('用户通道只认领 post_moderation，不再用 processOne 认领任意 job', async () => {
    const code = await workerSource();
    expect(code).toMatch(
      /claim_forum_async_jobs_typed'[\s\S]{0,160}p_job_types:\s*\['post_moderation'\]/,
    );
    // 反证：把 EdgeRuntime 那行改回 processOne(client)，本断言变红
    expect(code).not.toMatch(/EdgeRuntime\.waitUntil\(processOne\(/);
    expect(code).toMatch(/EdgeRuntime\.waitUntil\(processEnqueuedPostModeration\(/);
  });
});

describe('配套迁移的结构不变量', () => {
  it('typed claim 拒绝空白名单，且只授 service_role', async () => {
    const sql = await read('supabase/migrations/2026102910_claim_forum_async_jobs_typed.sql');
    // 空数组必须「什么都不认领」，不能退化成「不过滤」（那就是要堵的老行为）
    expect(sql).toContain('cardinality(p_job_types) = 0');
    expect(sql).toMatch(
      /revoke all on function public\.claim_forum_async_jobs_typed\([\s\S]*?from public, anon, authenticated/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.claim_forum_async_jobs_typed\([\s\S]*?to service_role/,
    );
    // 不许用「drop + 重建原名」的方式改签名（PostgREST 会看到两个重载 ⇒ PGRST203）
    expect(sql).not.toMatch(/drop function[^;]*claim_forum_async_jobs\s*\(/i);
  });

  it('reaper 有上下限、只看仍有图未裁的 job，且是纯 SQL（不碰密钥）', async () => {
    const sql = await read('supabase/migrations/2026102911_forum_image_recheck_reaper.sql');
    expect(sql).toContain('j.updated_at > now() - p_max_age');
    expect(sql).toContain('j.updated_at < now() - p_min_age');
    expect(sql).toContain("i.recheck_status = 'pending'");
    expect(sql).toContain("j.status = 'failed'");
    // 纯 SQL 的 cron 不需要 net.http_post，也就不需要任何密钥。
    // 先剥 SQL 行注释：文件头的说明里会合法地提到 net.http_post（不剥就是假红）。
    const body = sql.replace(/--[^\n]*/g, '');
    expect(body).not.toContain('net.http_post');
    expect(body).not.toContain('decrypted_secret');
  });

  it('worker cron 的命令体不再含明文密钥（%L 渲染）', async () => {
    const sql = await read(
      'supabase/migrations/2026102912_forum_async_worker_cron_no_plaintext_secret.sql',
    );
    const commandBody = sql.split('$cmd$')[1] || '';
    expect(commandBody).toContain('vault.decrypted_secrets');
    expect(commandBody).not.toContain('%L');
  });
});
