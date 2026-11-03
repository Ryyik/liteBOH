-- public._rate_limits 保留策略（2026-11-03，安全第一批 P1-1）
--
-- 问题：
--   全库 12 个 cron 任务，没有一个是清扫 `_rate_limits` 的。这张表由
--   `check_rate_limit(p_key, ...)` 原子 upsert 写入，**窗口过期后行不会消失**
--   （函数只在 reset_at <= now() 时把 count 重置为 1，行本身保留）。
--   实测 2026-11-03：37 行（2026-11-01 为 34 行），增长慢但确在涨。
--
-- 为什么这不只是「卫生问题」：
--   键由调用方决定。EF 侧 `checkRateLimitDb(clientIp, ...)` 用 **客户端 IP** 做键，
--   而 `csp-report` 是匿名可写的上报端点（每个 IP 一行）。也就是说**外部流量可以直接
--   决定这张表的行数（基数）** —— 换 IP 刷上报就能无限堆键。行数无上限时，
--   upsert 的索引维护与表体积都会随之膨胀，等于给了一个低成本的资源消耗通道。
--   所以这里要做的是「保留下限 + 上限约束」，不是单纯清理日志。
--
-- 保留口径：
--   窗口已过期 1 小时以上的行直接删除。
--   · 进行中的窗口（reset_at > now()）绝不删 —— 删了等于把攻击者计数清零；
--   · 过期 1 小时内保留，是为了排障时还能看到「刚刚被限流的是谁」；
--   · 现有窗口最长 15 分钟（登录闸门），1 小时宽限足够。
--
-- 注意：
--   1) `_rate_limits` 启用了 RLS 且**没有任何策略**（刻意的 deny-all，只允许
--      service_role / postgres 访问）。cron 以 postgres 执行，不受 RLS 限制。
--   2) 补一个 reset_at 索引：清理按 reset_at 过滤，而这张表原本只有 key 的主键索引。
--   3) 依既有先例（2026092002_cron_job_run_details_retention.sql）用
--      do 块 + 异常兜底，pg_cron 缺失时降级为「只清一次」而不是让迁移失败。

begin;

-- ── 清理谓词所需的索引 ────────────────────────────────────
create index if not exists _rate_limits_reset_at_idx
  on public._rate_limits (reset_at);

-- ── 立即清理存量（一次性）──────────────────────────────────
do $prune$
declare
  v_deleted integer := 0;
begin
  begin
    delete from public._rate_limits
     where reset_at < now() - interval '1 hour';
    get diagnostics v_deleted = row_count;
    raise notice '_rate_limits 存量清理完成，删除 % 行（保留 reset_at 1 小时内）。', v_deleted;
  exception when undefined_table or insufficient_privilege then
    raise notice '_rate_limits 不可访问，已跳过存量清理。';
  end;
end
$prune$;

-- ── 每小时清理任务 ────────────────────────────────────────
do $cron$
declare
  v_has_pg_cron boolean := false;
begin
  select exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) into v_has_pg_cron;

  if not v_has_pg_cron then
    raise notice 'pg_cron 未启用，已跳过 _rate_limits 保留任务。';
    return;
  end if;

  begin
    perform cron.unschedule(jobid)
      from cron.job
     where jobname = 'cleanup_rate_limits_hourly';
  exception when undefined_table or undefined_function or invalid_schema_name then
    null;
  end;

  -- 每小时第 7 分钟：避开整点的抽奖/队列任务，减少锁竞争
  perform cron.schedule(
    'cleanup_rate_limits_hourly',
    '7 * * * *',
    $cmd$delete from public._rate_limits where reset_at < now() - interval '1 hour';$cmd$
  );
exception when others then
  raise notice '创建 _rate_limits 保留任务失败：%', coalesce(sqlerrm, 'UNKNOWN_ERROR');
end;
$cron$;

commit;
