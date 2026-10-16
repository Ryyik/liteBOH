-- BOH Health 功能整体下线：删除四张表及其附属对象
--
-- 背景（2026-10-16，用户决定）：健康功能从整个站点移除。已同步删掉前端
-- `src/views/Health/`（13 文件）、路由、导航、store，以及 BOHAI 的健康分析检索链路
-- （health 连接器 / isHealthAnalysisEnabled / HEALTH_ANALYSIS_PROMPT_APPENDIX / `/health` 斜杠命令）。
--
-- 数据处置：迁移前已把 `health_weight_logs` 的**全部数据**导出到
--   `.arts/health-backup/health_weight_logs.json`（实测仅 2 行、同一个用户的 60.0kg 测试记录）。
--   另三张表（health_profiles / health_daily_logs / health_vault_records）实测 0 行。
--   ⚠️ 本迁移执行后数据不可恢复 —— 若需还原，用备份 + 原迁移 2026090201_boh_health.sql 重建表。
--
-- 删除清单（按依赖倒序）：
--   · 4 张表（含其 CHECK / UNIQUE / 外键 / 索引 —— drop table 会连带清掉）
--   · 4 个策略（RLS）—— 随表一起消失；显式 drop 只为幂等清晰
--   · 1 个触发器 trg_health_profiles_updated_at
--   · 1 个函数 public.update_health_updated_at()（只有该触发器用它，删完即可回收）
--
-- ⚠️ 顺序不是随便排的（2026-10-16 试跑实测踩到）：`drop trigger / drop policy ... on <表>`
--   都**要求表存在**，即使带 `if exists` —— 表一旦被 drop，这两句立刻 42P01。
--   所以必须是：**先触发器 → 再策略 → 再表 → 最后函数**。
--
-- 幂等：全部 `if exists`；可重复执行。
--
-- ⚠️ 已应用的迁移**不改**：2026090201（建表）与 2026092004（删冗余索引，其中一条
--   `drop index if exists public.idx_health_daily_logs_user_date` 的目标索引本就已被
--   前面的迁移删掉）保持原样 —— 改已应用迁移会破坏 migration history 校验。
--   2026092004 里那条 `if exists` 的 drop 在表被删后依然是安全的 no-op。

begin;

-- 1) 触发器（表还在时删）
drop trigger if exists trg_health_profiles_updated_at on public.health_profiles;

-- 2) 策略（同样必须在表还在时删 —— 否则 `on public.health_*` 直接 42P01）
drop policy if exists health_profiles_owner on public.health_profiles;
drop policy if exists health_weight_logs_owner on public.health_weight_logs;
drop policy if exists health_daily_logs_owner on public.health_daily_logs;
drop policy if exists health_vault_owner on public.health_vault_records;

-- 3) 表（health_weight_logs / health_daily_logs 有指向 auth.users 的外键，随表一起消失）
drop table if exists public.health_weight_logs;
drop table if exists public.health_daily_logs;
drop table if exists public.health_vault_records;
drop table if exists public.health_profiles;

-- 4) 函数：确认再无任何触发器引用它才删（否则会留下引用悬空的触发器）
do $$
begin
  if not exists (
    select 1
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
     where p.pronamespace = 'public'::regnamespace
       and p.proname = 'update_health_updated_at'
       and not t.tgisinternal
  ) then
    drop function if exists public.update_health_updated_at();
  else
    raise notice 'public.update_health_updated_at() 仍被触发器引用，保留不删';
  end if;
end $$;

commit;
