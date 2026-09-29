-- ============================================
-- AI 积分计费 1/5：全局定价配置表（单行）
-- 「AI 直接消耗积分」的开关与汇率唯一真源，数据管理面板可改。
--   enabled = false 时线上行为与现状完全一致（灰度保证）。
-- ============================================

create table if not exists public.ai_pricing_config (
  id                    smallint primary key default 1 check (id = 1),
  enabled               boolean not null default false,
  -- 1 积分可购买多少 billed_tokens（已乘模式倍率后的计费 token）
  rate_tokens_per_point bigint not null default 1000000 check (rate_tokens_per_point >= 10000),
  -- 单用户单日积分消耗上限（风控，保护上游成本）；-1 表示不限
  daily_points_burn_cap integer not null default 20 check (daily_points_burn_cap >= 1),
  updated_at            timestamptz not null default now(),
  constraint ai_pricing_config_single_row check (id = 1)
);

insert into public.ai_pricing_config (id, enabled, rate_tokens_per_point, daily_points_burn_cap)
values (1, false, 1000000, 20)
on conflict (id) do nothing;

alter table public.ai_pricing_config enable row level security;

create policy "ai_pricing_config_read_all"
  on public.ai_pricing_config
  for select
  using (true);

create policy "ai_pricing_config_admin_all"
  on public.ai_pricing_config
  for all
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

revoke all on table public.ai_pricing_config from anon, authenticated, public;
grant select on table public.ai_pricing_config to anon, authenticated;
grant all on table public.ai_pricing_config to service_role;

comment on table public.ai_pricing_config is
  'BOH AI points billing switch and rate. rate_tokens_per_point: billed tokens per 1 point.';
comment on column public.ai_pricing_config.daily_points_burn_cap is
  'Max points one user can burn on AI per Beijing day (pending reservations included). -1 = unlimited.';

notify pgrst, 'reload schema';
