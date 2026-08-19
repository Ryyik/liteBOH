-- Keep the server-side Cloud+ image quota in sync with the subscription tiers
-- shown by the client. Legacy plan codes remain supported for active records.
create or replace function public.boh_cloud_image_limit_for_user(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_limit integer := 0;
begin
  select coalesce(max(
    case lower(trim(plan_code))
      when 'plus' then 300
      when 'boh-ai-plus' then 300
      when 'boh-plus' then 300
      when 'pro' then 450
      when 'boh-pro' then 450
      when 'max' then 900
      when 'boh-max' then 900
      when 'ultra' then 1200
      when 'boh-ultra' then 1200
      else 0
    end
  ), 0)
    into v_plan_limit
    from public.user_subscriptions
   where user_id = p_user_id
     and status = 'active'
     and expires_at > now();

  return greatest(150, v_plan_limit);
end;
$$;

revoke all on function public.boh_cloud_image_limit_for_user(uuid) from public;
grant execute on function public.boh_cloud_image_limit_for_user(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
