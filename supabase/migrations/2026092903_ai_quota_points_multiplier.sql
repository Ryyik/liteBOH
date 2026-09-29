-- ============================================
-- AI 积分计费 2/5：会员积分倍率列
-- 会员档位消耗积分的折扣倍率（1.0 原价，越小越便宜）。
-- 语义约定（vault 侧同步实现）：
--   daily_token_limit = -1 不限；0 = 纯积分模式（free 档启用积分后使用）；
--   >0 = 每日免费额度（会员权益），超出部分走积分兜底。
-- 注意：本迁移不把 free 归零 —— 归零必须与 vault 积分路径上线同批执行，
-- 否则 enabled=false 期间 free 用户会直接 429。归零由上线 runbook 在面板上操作。
-- ============================================

alter table public.ai_quota_config
  add column if not exists points_multiplier numeric(5, 2) not null default 1.00;

alter table public.ai_quota_config
  drop constraint if exists ai_quota_config_points_multiplier_check;
alter table public.ai_quota_config
  add constraint ai_quota_config_points_multiplier_check
  check (points_multiplier >= 0.1 and points_multiplier <= 2);

update public.ai_quota_config
set points_multiplier = case lower(tier)
  when 'plus' then 0.95
  when 'boh-ai-plus' then 0.95
  when 'pro' then 0.90
  when 'boh-pro' then 0.90
  when 'max' then 0.85
  when 'boh-max' then 0.85
  when 'ultra' then 0.80
  else 1.00
end
where points_multiplier = 1.00;

comment on column public.ai_quota_config.points_multiplier is
  'Points cost multiplier for AI overage billing in this tier. 1.00 = list price.';

notify pgrst, 'reload schema';
