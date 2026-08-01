-- 修复 2026080101：重建 list_public_bohai_modes 时漏掉 quota_multiplier 返回列，
-- 导致模式选择器不再显示消耗倍率（前端回落到 1x）。
-- 此处重新 drop + 重建，补回 quota_multiplier。

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
