-- 修复：get_user_subscription_tier 对 plan_code 做大小写不敏感匹配
-- 避免 DataAdmin 管理员录入的 'MAX' / 'Max' 等不匹配

create or replace function public.get_user_subscription_tier(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text := '';
  v_idx int;
  v_code text;
  v_best_idx int := -1;
begin
  if p_user_id is null then
    return '';
  end if;

  for v_code in
    select distinct lower(trim(s.plan_code))
    from public.user_subscriptions s
    where s.user_id = p_user_id
      and s.status = 'active'
      and s.expires_at > now()
  loop
    v_idx := case
      when v_code = 'free'  then 0
      when v_code = 'plus'  then 1
      when v_code = 'pro'   then 2
      when v_code = 'max'   then 3
      when v_code = 'ultra' then 4
      else -1
    end;
    if v_idx > v_best_idx then
      v_best_idx := v_idx;
      v_tier := v_code;
    end if;
  end loop;

  return v_tier;
end;
$$;

grant execute on function public.get_user_subscription_tier(uuid) to authenticated;
grant execute on function public.get_user_subscription_tier(uuid) to anon;
