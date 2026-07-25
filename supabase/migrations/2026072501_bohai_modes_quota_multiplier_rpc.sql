-- Expose quota_multiplier via the public BOHAI modes RPC so the chat composer
-- can render the per-mode token multiplier (e.g. "Aurora · 2x") directly in
-- the mode picker, instead of relying on hardcoded mode_id checks.
--
-- PostgreSQL forbids changing a function's return type with CREATE OR REPLACE,
-- so we drop and recreate the function to add the quota_multiplier column.

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
  sort_order integer,
  quota_multiplier numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select id, mode_id, display_name, tagline, description, capability, icon,
         temperature, top_p, frequency_penalty, max_tokens, sort_order,
         quota_multiplier
    from public.bohai_model_configs
   where status = 'active'
   order by sort_order asc, display_name asc;
$$;

revoke all on function public.list_public_bohai_modes() from public;
grant execute on function public.list_public_bohai_modes() to anon, authenticated, service_role;
