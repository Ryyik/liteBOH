begin;

create or replace function public.boh_cloud_image_limit_for_user(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_limit integer := 0;
begin
  select max(
    case lower(trim(plan_code))
      when 'boh-ai-plus' then 300
      when 'boh-plus' then 300
      when 'boh-pro' then 500
      when 'boh-max' then 800
      else 0
    end
  )
    into v_plan_limit
    from public.user_subscriptions
   where user_id = p_user_id
     and status = 'active'
     and expires_at > now();

  return greatest(150, coalesce(v_plan_limit, 0));
end;
$$;

notify pgrst, 'reload schema';

commit;
