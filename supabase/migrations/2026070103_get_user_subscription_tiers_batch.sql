-- 批量获取用户订阅等级（替代逐个调用 get_user_subscription_tier）
-- tier 计算逻辑与 get_user_subscription_tier 完全一致：
--   从 user_subscriptions 表查询 status='active' 且 expires_at > now() 的订阅，
--   按 plan_code 排序（free=0 < plus=1 < pro=2 < max=3 < ultra=4），取最高等级。
--   无有效订阅时返回空字符串 ''（前端会归一化为 'free'）。

create or replace function public.get_user_subscription_tiers(p_user_ids uuid[])
returns table(user_id uuid, tier text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with ranked as (
    select
      s.user_id,
      lower(trim(s.plan_code)) as code,
      case
        when lower(trim(s.plan_code)) = 'free'  then 0
        when lower(trim(s.plan_code)) = 'plus'  then 1
        when lower(trim(s.plan_code)) = 'pro'   then 2
        when lower(trim(s.plan_code)) = 'max'   then 3
        when lower(trim(s.plan_code)) = 'ultra' then 4
        else -1
      end as idx
    from public.user_subscriptions s
    where s.user_id = any(p_user_ids)
      and s.status = 'active'
      and s.expires_at > now()
  ),
  best as (
    select user_id, code
    from (
      select
        user_id,
        code,
        row_number() over (partition by user_id order by idx desc) as rn
      from ranked
      where idx >= 0
    ) t
    where rn = 1
  )
  select
    t.user_id,
    coalesce(b.code, '') as tier
  from unnest(p_user_ids) as t(user_id)
  left join best b on b.user_id = t.user_id;
end;
$$;

-- 授予执行权限（与 get_user_subscription_tier 保持一致）
grant execute on function public.get_user_subscription_tiers(uuid[]) to authenticated;
grant execute on function public.get_user_subscription_tiers(uuid[]) to anon;
