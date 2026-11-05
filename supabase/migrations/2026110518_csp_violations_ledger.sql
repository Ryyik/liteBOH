-- ============================================================================
-- csp_violations：CSP 违规报告台账（2026-11-05，安全升级第二项）
--
-- 补的是什么洞：
--   `csp-report` EF 自 2026-11-03 上线以来只把报告 `console.log` 掉，**零存储**。
--   Supabase 的 Edge Function 日志有保留期，滚掉即查无可查 ⇒ CSP 挂着
--   Report-Only 跑了两个月，却拿不出任何「到底有哪些违规」的证据，
--   于是「什么时候能转 enforcing」这个问题永远只能靠猜。
--
--   更关键的一层：CSP 报告是**外部注入的唯一外部观测点**。
--   如果有人在往页面里注脚本，浏览器会替我们记一笔；不落库就等于放弃这份情报。
--
-- 设计取舍（为什么是聚合表，不是原始明细）：
--   1) 这个写入端是**匿名可写**的（浏览器上报不带凭证），原样存明细等于给出一个
--      无上限的存储增长通道。聚合后行数由「天 × 指令 × 域名』的基数决定，
--      每天几十到几百行，成本可忽略。
--   2) 主键 (stat_day, directive, blocked_host, disposition) 让重复上报只累加 hits，
--      同一个噪音源刷一万次也只占一行。
--   3) `sample_document_path` 只留**第一次**见到的那条路径，用来回答
--      「这条违规大概发生在哪个页面」；刻意只存 pathname，不存整串 URL ——
--      查询串里可能有分享 token，安全设施不该自己变成隐私泄露点。
--   4) `last_format` 记录最后一次走的是 legacy(report-uri) 还是 reporting-api(report-to)，
--      用于判断「某条上报通道是不是悄悄坏了」。
--
-- 保留期：90 天（见 `prune_csp_violations`），由 pg_cron 每日清理。
-- ============================================================================

begin;

create table if not exists public.csp_violations (
  stat_day date not null,
  directive text not null,
  blocked_host text not null,
  disposition text not null default 'report',
  hits bigint not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  sample_document_path text,
  last_format text not null default 'unknown',
  constraint csp_violations_pkey primary key (stat_day, directive, blocked_host, disposition),
  constraint csp_violations_hits_non_negative check (hits >= 0)
);

comment on table public.csp_violations is
  'CSP 违规上报的按天聚合台账。写入只走 record_csp_violations（service_role），90 天清理。';
comment on column public.csp_violations.sample_document_path is
  '出问题的页面路径（已剥离查询串与 hash）。只保留首次见到的那条，用于定位。';
comment on column public.csp_violations.blocked_host is
  '被拦资源的来源标识：URL 取 host；浏览器关键字（inline/eval/data/blob）原样保留。';
comment on column public.csp_violations.last_format is
  '最后一次上报走的通道：legacy(report-uri) / reporting-api(report-to) / unknown。';

-- 清理谓词按 stat_day 走，主键第一列即覆盖，无需额外索引。

-- ── 权限：匿名与普通用户一律不可见，只有 admin 能读 ──────────────────
alter table public.csp_violations enable row level security;

revoke all on public.csp_violations from anon;
revoke all on public.csp_violations from authenticated;
grant select on public.csp_violations to authenticated;
grant all on public.csp_violations to service_role;

-- 写一条显式策略而不是「有 RLS 没策略」：
--   后者语义同样是 deny-all，但会进 check:db-advisors 的 rlsNoPolicy 棘轮名单。
--   这里给管理员一个真的能用的读口（管理后台查台账），比空策略更诚实。
drop policy if exists csp_violations_admin_read on public.csp_violations;
create policy csp_violations_admin_read
  on public.csp_violations
  for select
  to authenticated
  using (public.current_user_is_admin());

-- ── 写入：批量 upsert + 累加 ────────────────────────────────────────
create or replace function public.record_csp_violations(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := timezone('Asia/Shanghai', now())::date;
  v_count integer := 0;
begin
  -- 空/非数组一律当无事发生：上报端点绝不能因为载荷形状不对而报错
  if p_rows is null
     or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) = 0 then
    return 0;
  end if;

  -- 单日基数闸门（匿名端点的最后一道兜底）。
  -- 聚合只能防「同一来源狂刷」，**防不住有人用大量随机域名刷基数** ——
  -- 那种情况下行数仍与攻击者的域名池大小成正比。
  -- 正常站点每天几十到几百行；5000 是百倍余量，触到就整批丢弃：
  -- 丢的是统计，不是安全（真正的防线仍是 IP 限流 + 90 天保留）。
  if (select count(*) from public.csp_violations where stat_day = v_today) >= 5000 then
    return 0;
  end if;

  with incoming as (
    select
      left(coalesce(nullif(btrim(item->>'directive'), ''), 'unknown'), 120) as directive,
      left(coalesce(nullif(btrim(item->>'blocked_host'), ''), 'unknown'), 160) as blocked_host,
      left(coalesce(nullif(btrim(item->>'disposition'), ''), 'report'), 20) as disposition,
      left(coalesce(btrim(item->>'document_path'), ''), 200) as document_path,
      left(coalesce(nullif(btrim(item->>'format'), ''), 'unknown'), 20) as format
    from jsonb_array_elements(p_rows) as item
    -- 只认对象：标量/数组会让 ->> 静默返回 NULL，白白写一行 unknown
    where jsonb_typeof(item) = 'object'
  ),
  grouped as (
    -- 同一请求内的重复条目先合并，避免一次上报写多次同一行
    select
      directive,
      blocked_host,
      disposition,
      count(*)::bigint as hits,
      min(document_path) as document_path,
      min(format) as format
    from incoming
    group by directive, blocked_host, disposition
  )
  insert into public.csp_violations as t
    (stat_day, directive, blocked_host, disposition, hits, sample_document_path, last_format)
  select
    v_today,
    directive,
    blocked_host,
    disposition,
    hits,
    nullif(document_path, ''),
    format
  from grouped
  on conflict (stat_day, directive, blocked_host, disposition) do update
    set hits = t.hits + excluded.hits,
        last_seen_at = now(),
        sample_document_path = coalesce(t.sample_document_path, excluded.sample_document_path),
        last_format = excluded.last_format;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.record_csp_violations(jsonb) from public;
revoke all on function public.record_csp_violations(jsonb) from anon, authenticated;
grant execute on function public.record_csp_violations(jsonb) to service_role;

comment on function public.record_csp_violations(jsonb) is
  '按天聚合写入 CSP 违规（同键累加 hits）。仅 service_role 可执行，anon/authenticated 已撤销。';

-- ── 清理：保留期钳位，防手滑传 0 删光 ──────────────────────────────
create or replace function public.prune_csp_violations(p_keep_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 钳在 7..365：至少留一周用于回溯，最多一年（再长就该改设计而不是加天数）
  v_keep integer := greatest(7, least(coalesce(p_keep_days, 90), 365));
  v_today date := timezone('Asia/Shanghai', now())::date;
  v_deleted integer := 0;
begin
  delete from public.csp_violations where stat_day < (v_today - v_keep);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_csp_violations(integer) from public;
revoke all on function public.prune_csp_violations(integer) from anon, authenticated;
grant execute on function public.prune_csp_violations(integer) to service_role;

comment on function public.prune_csp_violations(integer) is
  '删除 stat_day 早于「今天 - p_keep_days」的行。保留期钳位 7..365 天，默认 90。';

-- ── 每日清理任务 ──────────────────────────────────────────────────
-- 依既有先例（2026110309_rate_limits_retention.sql）用 do 块 + 异常兜底：
-- pg_cron 缺失时降级为「不建任务」，而不是让整个迁移失败。
do $cron$
declare
  v_has_pg_cron boolean := false;
begin
  select exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) into v_has_pg_cron;

  if not v_has_pg_cron then
    raise notice 'pg_cron 未启用，已跳过 csp_violations 保留任务。';
    return;
  end if;

  begin
    perform cron.unschedule(jobid)
      from cron.job
     where jobname = 'cleanup_csp_violations_daily';
  exception when undefined_table or undefined_function or invalid_schema_name then
    null;
  end;

  -- 每日 04:23：避开整点的抽奖/队列/限流清理任务，减少锁竞争
  perform cron.schedule(
    'cleanup_csp_violations_daily',
    '23 4 * * *',
    $cmd$select public.prune_csp_violations(90);$cmd$
  );
exception when others then
  raise notice '创建 csp_violations 保留任务失败：%', coalesce(sqlerrm, 'UNKNOWN_ERROR');
end;
$cron$;

-- ── 自证：清理任务到底建成了没有 ──────────────────────────────────
-- 为什么要把这段写进迁移：`do 块 + 异常兜底` 的写法在 pg_cron 缺失/权限不足时
-- 是「raise notice 然后继续」，迁移照样成功。如果没人看输出，就会出现
-- 「表建好了但永远没人清理」——而这正是本次要避免的那类静默失效。
-- 所以这里把结果打成 notice 或 warning，push 时一眼可见。
do $verify$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
    from cron.job
   where jobname = 'cleanup_csp_violations_daily';

  if v_job_id is null then
    raise warning 'csp_violations 清理任务未注册：台账将无限增长，需人工补建！';
  else
    raise notice 'csp_violations 清理任务已注册（jobid=%, 每日 04:23, 保留 90 天）。', v_job_id;
  end if;
exception when undefined_table or invalid_schema_name or insufficient_privilege then
  raise warning 'cron.job 不可读：无法确认 csp_violations 清理任务是否注册。';
end
$verify$;

comment on table public.csp_violations is
  'CSP 违规上报的按天聚合台账。写入只走 record_csp_violations（service_role），90 天清理（cleanup_csp_violations_daily）。';

commit;
