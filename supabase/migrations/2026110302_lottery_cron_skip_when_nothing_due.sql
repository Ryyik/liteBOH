-- ============================================================================
-- 2026-11-03 抽奖定时任务：没有「到期开奖」时不再进函数（每分钟空转）
--
-- 现状（2026-11-02 线上库体检）：
--   `execute_due_lottery_draws_every_minute` 每分钟跑一次，
--   236 天累计调用 239,400 次、平均 15.72 ms、合计 3,762,341 ms
--   —— 占 pg_stat_statements 总执行时间的 10.2%，是应用侧第一大户。
--   但 `lotteries` 总共只有 7 行，绝大多数分钟里根本没有到期项：
--   函数体第一步 `select count(*) … where status='open' and draw_at <= now()`
--   算出来是 0 就直接 return，**不写任何表**。
--
-- 所以这 15.7 ms 花的是「进函数」这件事本身：
--   plpgsql 解释、参数归一、auth.uid() 判定、那条 count 的执行与规划，
--   以及每分钟一个独立事务的提交开销。全都是为「什么都不做」付的钱。
--
-- 修法：把「有没有到期」的预检提到 cron 的 command 里。
--   `where exists (…)` 先探一次索引（idx_lotteries_draw_at 已存在，4710 次扫描），
--   没有到期 ⇒ **连函数都不调用**，这一分钟的 job 变成一次索引探测。
--   判定条件与函数内 `v_due_count` 那段**逐字一致**（status/draw_at is not null/draw_at <= now()），
--   保证「跳过」与「进函数但空转」的结果完全等价 —— 都不会写 lottery_scheduler_logs。
--
-- 为什么不是「把每分钟改成每 5 分钟」：
--   开奖的时效性是产品要求，延后最多 5 分钟是行为改变。预检是**零行为改变**的那条路。
--
-- 幂等：沿用 2026102911 的既有写法 —— 先按 jobname 收集 jobid 逐个 unschedule，
--   再用同名 schedule 重建。整个 DO 块在一个事务里，schedule 失败会连同 unschedule
--   一起回滚，不会把开奖任务弄丢。
--   ⚠️ 代价：jobid 会变（历史 cron.job_run_details 里旧 jobid 的记录与新的断开）。
--   已核对：`lottery_scheduler_status()` 按 **jobname** 查询，不依赖 jobid。
--
-- 回滚：把 command 换回 `select public.execute_due_lottery_draws(50, 'scheduled');`
--   重跑一遍同样的 DO 块即可（或直接 cron.alter_job）。
-- ============================================================================

begin;

do $cron$
declare
  v_job   record;
  v_cmd   text := $cmd$select public.execute_due_lottery_draws(50, 'scheduled')
where exists (
  select 1
    from public.lotteries
   where status = 'open'
     and draw_at is not null
     and draw_at <= now()
)$cmd$;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'lottery cron 更新失败：pg_cron 未启用';
  end if;

  for v_job in
    select jobid from cron.job where jobname = 'execute_due_lottery_draws_every_minute'
  loop
    perform cron.unschedule(v_job.jobid);
    raise notice '已移除旧 jobid=%（先删后建，同一事务内）', v_job.jobid;
  end loop;

  perform cron.schedule(
    'execute_due_lottery_draws_every_minute',
    '* * * * *',
    v_cmd
  );

  raise notice '已重建 execute_due_lottery_draws_every_minute：无到期项时不再进函数。';
end $cron$;

-- 自证：任务必须在、必须激活、command 必须带预检
do $verify$
declare
  v_cmd text;
  v_active boolean;
begin
  select active, command into v_active, v_cmd
    from cron.job
   where jobname = 'execute_due_lottery_draws_every_minute'
   limit 1;

  if v_cmd is null then
    raise exception '自证失败：execute_due_lottery_draws_every_minute 不存在';
  end if;
  if not v_active then
    raise exception '自证失败：任务未激活';
  end if;
  if v_cmd not ilike '%where exists%' then
    raise exception '自证失败：command 仍是旧版本（没有预检），实际为 %', v_cmd;
  end if;
end $verify$;

commit;
