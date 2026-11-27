-- 恢复 BOHAI → Bolek 更名的过渡兼容层；旧 PWA/Edge Function 可能仍持有旧对象名。

begin;

drop view if exists public.bohai_model_configs;
create view public.bohai_model_configs with (security_invoker = true) as
  select * from public.bolek_model_configs;
grant select on public.bohai_model_configs to anon, authenticated, service_role;

create or replace function public.list_public_bohai_modes()
returns table (
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
stable security definer
set search_path to 'public'
as $function$
  select * from public.list_public_bolek_modes();
$function$;
grant execute on function public.list_public_bohai_modes() to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
