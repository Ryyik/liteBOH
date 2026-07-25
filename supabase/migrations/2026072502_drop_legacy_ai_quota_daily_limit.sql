-- 删除 ai_quota_config 表中遗留的旧列 daily_limit
-- 旧列在建表时（2026062601）定义，NOT NULL 约束导致 upsert 时报错：
-- "null value in column "daily_limit" violates not-null constraint"
-- 配额已迁移到 daily_token_limit（2026071301），旧列不再使用。

alter table public.ai_quota_config
  drop column if exists daily_limit;
