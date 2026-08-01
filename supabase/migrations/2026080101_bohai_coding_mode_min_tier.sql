-- BOHAI 模型 min_tier 支持 Coding 附加包计划码，实现 Coding 专属模型。
-- 管理员在数据管理面板将模型 min_tier 设为 coding-lite/plus/pro/ultra 后，
-- 仅订阅对应（或更高档）Coding 附加包的用户可以调用该模式。

alter table public.bohai_model_configs
  drop constraint if exists bohai_model_configs_min_tier_check;

alter table public.bohai_model_configs
  add constraint bohai_model_configs_min_tier_check
  check (min_tier in (
    'guest', 'free', 'plus', 'pro', 'max', 'ultra',
    'coding-lite', 'coding-plus', 'coding-pro', 'coding-ultra'
  ));

-- list_public_bohai_modes 暴露 min_tier，供前端展示/过滤 Coding 专属模式。
-- 注意：返回类型变化不能走 create or replace，需先 drop 再重建。
-- 注意：必须保留 quota_multiplier 返回列，否则模式选择器不显示消耗倍率。
drop function if exists public.list_public_bohai_modes();

create function public.list_public_bohai_modes()
returns table(
  id uuid,
  mode_id text,
  display_name text,
  tagline text,
  description text,
  capability text,
  icon text,
  temperature numeric,
  top_p numeric,
  frequency_penalty numeric,
  max_tokens integer,
  min_tier text,
  sort_order integer,
  quota_multiplier numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select id, mode_id, display_name, tagline, description, capability, icon,
         temperature, top_p, frequency_penalty, max_tokens, min_tier, sort_order,
         quota_multiplier
    from public.bohai_model_configs
   where status = 'active'
   order by sort_order asc, display_name asc;
$$;

revoke all on function public.list_public_bohai_modes() from public;
grant execute on function public.list_public_bohai_modes() to anon, authenticated, service_role;
