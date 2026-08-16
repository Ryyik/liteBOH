-- 修复 #6：points_card_preset_capacity_for_user 单次 tier 查询（性能修复）
-- 背景：2026081509 的实现对 get_user_subscription_tier(p_user_id) 调用了 2 次
-- （一次取 tier_code、一次进 case 分支）。该函数为 plpgsql security definer，
-- 内部有订阅表扫描，create_points_card_preset / get_points_card_preset_quota
-- 每次调用都会重复执行两遍。
-- 处理：用 CTE 把 tier 计算收敛为一次引用，返回结构（tier_code, capacity）
-- 与取值逻辑完全不变；函数属性（stable / security definer / search_path）保持一致。
begin;

create or replace function public.points_card_preset_capacity_for_user(p_user_id uuid)
returns table (tier_code text, capacity integer)
language sql
stable
security definer
set search_path = public
as $$
  with t as (
    select coalesce(nullif(public.get_user_subscription_tier(p_user_id), ''), 'free') as tier_code
  )
  select
    t.tier_code,
    case t.tier_code
      when 'ultra' then 24
      when 'max' then 16
      when 'pro' then 10
      when 'plus' then 6
      else 3
    end as capacity
  from t;
$$;

-- 与 2026081509 保持一致：内部函数不对 public 开放，仅经由 security definer RPC 间接调用
revoke all on function public.points_card_preset_capacity_for_user(uuid) from public;

commit;
