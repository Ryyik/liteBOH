-- 修复 get_user_subscription_tiers 的 SQL 歧义 bug（错误码 42702：
-- "column reference user_id is ambiguous"——plpgsql 输出变量 user_id 与
-- 查询中的列名冲突，导致批量 RPC 一直返回 400，前端 useTierMap 批量路径
-- 持续 fallback 到逐个 get_user_subscription_tier 单发调用）。
--
-- 修复方式：对函数体内所有 user_id 引用加表别名限定（s./r./u./b.），
-- 消除与 plpgsql 输出变量的歧义。逻辑不变。
-- 前端 useUserTier.js 的 fetchUserTiersBatch 期望返回 {user_id, tier}，
-- 输出列名保持不变。

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
      and s.status in ('active', 'trial')
      and s.expires_at > now()
  ),
  best as (
    select r.user_id, r.code
    from (
      select
        r2.user_id,
        r2.code,
        row_number() over (partition by r2.user_id order by r2.idx desc) as rn
      from ranked r2
      where r2.idx >= 0
    ) r
    where r.rn = 1
  )
  select
    u.user_id,
    coalesce(b.code, '') as tier
  from unnest(p_user_ids) as u(user_id)
  left join best b on b.user_id = u.user_id;
end;
$$;

-- 权限保持不变
grant execute on function public.get_user_subscription_tiers(uuid[]) to authenticated;
grant execute on function public.get_user_subscription_tiers(uuid[]) to anon;
