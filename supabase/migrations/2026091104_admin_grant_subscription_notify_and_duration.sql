-- =============================================
-- 订阅发放：赠送通知 + 快捷时长（天）
-- 1) admin_batch_grant_subscriptions 增加 p_notify / p_duration_days：
--    - p_notify（默认 true）且 status='active' 时，为每个实际发放用户写入一条
--      notifications（type='subscription'，正文含层级名称与北京时间到期时间）
--    - p_duration_days > 0 时按天数计算到期时间；user_subscriptions.duration_months
--      列有 CHECK (>0) 不允许写 0，故占位写 1，真实天数以 metadata.duration_days 为准
--    - 到期时间优先级不变：显式 p_expires_at > 天数 > 月数
-- 2) admin_list_subscription_grant_batches 批次聚合补 duration_days（读 metadata）
-- 3) admin_list_existing_subscribers 返回体补 metadata（编辑弹窗回显天数用）
-- 4) notifications.content 幂等补列（防御，历史迁移可能已建）
-- =============================================

begin;

-- ------------------------------------------------------------------
-- 0) 防御：通知正文列
-- ------------------------------------------------------------------
alter table public.notifications
  add column if not exists content text;

-- 移除旧签名，避免重载歧义
drop function if exists public.admin_batch_grant_subscriptions(uuid[], text, text, text, integer, integer, timestamptz, timestamptz, text, jsonb, boolean, boolean);

-- ------------------------------------------------------------------
-- 1) 批量发放订阅（赠送通知 + 天数时长）
-- ------------------------------------------------------------------
create or replace function public.admin_batch_grant_subscriptions(
  p_user_ids uuid[] default null,
  p_plan_code text default '',
  p_plan_name text default '',
  p_billing_cycle text default 'monthly',
  p_points_cost integer default 0,
  p_duration_months integer default 1,
  p_started_at timestamptz default null,
  p_expires_at timestamptz default null,
  p_status text default 'active',
  p_metadata jsonb default '{}'::jsonb,
  p_skip_existing boolean default false,
  p_skip_any_tier boolean default false,
  p_notify boolean default true,
  p_duration_days integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_targets uuid[];
  v_affected integer := 0;
  v_skipped integer := 0;
  v_notified integer := 0;
  v_batch_id uuid := gen_random_uuid();
  v_started_at timestamptz;
  v_expires_at timestamptz;
  v_duration_days integer;
  v_duration_months integer;
  v_metadata jsonb;
  v_content text;
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可批量发放订阅';
  end if;

  if coalesce(trim(p_plan_code), '') = '' or coalesce(trim(p_plan_name), '') = '' then
    raise exception '订阅层级与名称不能为空';
  end if;

  if p_billing_cycle not in ('monthly', 'yearly') then
    raise exception '订阅周期无效';
  end if;

  if coalesce(p_points_cost, -1) < 0 then
    raise exception '积分成本不能为负数';
  end if;

  v_duration_days := coalesce(p_duration_days, 0);

  if v_duration_days > 0 then
    -- 天数模式：1 天 ~ 10 年
    if v_duration_days > 3650 then
      raise exception '赠送天数不能超过 3650';
    end if;
    -- duration_months 列 CHECK (>0) 不允许 0：占位写 1，真实天数以 metadata.duration_days 为展示真相源
    v_duration_months := 1;
    v_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('duration_days', v_duration_days);
  else
    -- 月数模式：原校验不变
    if coalesce(p_duration_months, 0) <= 0 or p_duration_months > 120 then
      raise exception '订阅月数必须是 1-120 之间的整数';
    end if;
    v_duration_months := p_duration_months;
    v_metadata := coalesce(p_metadata, '{}'::jsonb);
  end if;

  if p_status not in ('active', 'expired', 'cancelled') then
    raise exception '订阅状态无效';
  end if;

  v_started_at := coalesce(p_started_at, now());

  if v_duration_days > 0 then
    v_expires_at := coalesce(p_expires_at, v_started_at + make_interval(days => v_duration_days));
  else
    v_expires_at := coalesce(p_expires_at, v_started_at + make_interval(months => v_duration_months));
  end if;

  if v_expires_at <= v_started_at then
    raise exception '到期时间必须晚于订阅时间';
  end if;

  -- 空数组/NULL -> 全部用户（含管理员）
  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    select coalesce(array_agg(id), '{}') into v_targets
      from public.profiles;
  else
    v_targets := p_user_ids;
  end if;

  if cardinality(v_targets) = 0 then
    raise exception '没有可发放订阅的用户';
  end if;

  -- 跳过已有生效订阅用户
  if p_skip_existing then
    if p_skip_any_tier then
      -- 任意层级：跳过所有已有生效订阅的用户
      select count(*) into v_skipped
        from public.user_subscriptions s
       where s.user_id = any(v_targets)
         and s.status = 'active'
         and s.expires_at > now();

      v_targets := array(
        select t.user_id
          from unnest(v_targets) as t(user_id)
         where not exists (
           select 1
             from public.user_subscriptions s
            where s.user_id = t.user_id
              and s.status = 'active'
              and s.expires_at > now()
         )
      );
    else
      -- 同层级：仅跳过同层级生效订阅的用户
      select count(*) into v_skipped
        from public.user_subscriptions s
       where s.user_id = any(v_targets)
         and s.plan_code = p_plan_code
         and s.status = 'active'
         and s.expires_at > now();

      v_targets := array(
        select t.user_id
          from unnest(v_targets) as t(user_id)
         where not exists (
           select 1
             from public.user_subscriptions s
            where s.user_id = t.user_id
              and s.plan_code = p_plan_code
              and s.status = 'active'
              and s.expires_at > now()
         )
      );
    end if;
  end if;

  if cardinality(v_targets) = 0 then
    return jsonb_build_object(
      'ok', true,
      'affected', 0,
      'skipped', v_skipped,
      'notified', 0,
      'batch_id', v_batch_id,
      'plan_code', p_plan_code,
      'plan_name', p_plan_name,
      'message', '所有目标用户均已有生效订阅，已全部跳过'
    );
  end if;

  insert into public.user_subscriptions (
    user_id,
    plan_code,
    plan_name,
    billing_cycle,
    points_cost,
    duration_months,
    started_at,
    expires_at,
    status,
    metadata,
    batch_id
  )
  select
    p.id,
    p_plan_code,
    p_plan_name,
    p_billing_cycle,
    p_points_cost,
    v_duration_months,
    v_started_at,
    v_expires_at,
    p_status,
    v_metadata,
    v_batch_id
  from public.profiles p
  where p.id = any(v_targets);

  get diagnostics v_affected = row_count;

  -- 赠送通知：仅对实际发放且生效的订阅写入（被跳过用户不插行、天然不误发）
  if p_notify and p_status = 'active' and v_affected > 0 then
    v_content := '您已获得' || p_plan_name || '订阅，有效期至 '
                 || to_char(v_expires_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI');

    insert into public.notifications (recipient_id, sender_id, type, status, content)
    select s.user_id, auth.uid(), 'subscription', 'unread', v_content
    from public.user_subscriptions s
    where s.batch_id = v_batch_id;

    get diagnostics v_notified = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'affected', v_affected,
    'skipped', v_skipped,
    'notified', v_notified,
    'batch_id', v_batch_id,
    'plan_code', p_plan_code,
    'plan_name', p_plan_name,
    'billing_cycle', p_billing_cycle,
    'duration_months', v_duration_months,
    'duration_days', v_duration_days,
    'points_cost', p_points_cost,
    'started_at', v_started_at,
    'expires_at', v_expires_at,
    'status', p_status
  );
end;
$$;

revoke all on function public.admin_batch_grant_subscriptions(uuid[], text, text, text, integer, integer, timestamptz, timestamptz, text, jsonb, boolean, boolean, boolean, integer) from public;
grant execute on function public.admin_batch_grant_subscriptions(uuid[], text, text, text, integer, integer, timestamptz, timestamptz, text, jsonb, boolean, boolean, boolean, integer) to authenticated;
grant execute on function public.admin_batch_grant_subscriptions(uuid[], text, text, text, integer, integer, timestamptz, timestamptz, text, jsonb, boolean, boolean, boolean, integer) to service_role;

-- ------------------------------------------------------------------
-- 2) 批次记录：聚合补 duration_days（读 metadata.duration_days）
-- ------------------------------------------------------------------
create or replace function public.admin_list_subscription_grant_batches(
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_offset integer;
  v_total integer;
  v_rows jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可查看发放记录';
  end if;

  v_limit := least(greatest(p_page_size, 1), 50);
  v_offset := (greatest(p_page, 1) - 1) * v_limit;

  select count(distinct batch_id) into v_total
    from public.user_subscriptions
   where batch_id is not null;

  select coalesce(jsonb_agg(row_json order by batch_created_at desc), '[]'::jsonb) into v_rows
  from (
    select
      jsonb_build_object(
        'batch_id', b.batch_id,
        'batch_created_at', b.batch_created_at,
        'plan_code', b.plan_code,
        'plan_name', b.plan_name,
        'billing_cycle', b.billing_cycle,
        'duration_months', b.duration_months,
        'duration_days', b.duration_days,
        'points_cost', b.points_cost,
        'started_at', b.started_at,
        'expires_at', b.expires_at,
        'status', b.status,
        'grant_count', b.grant_count,
        'users', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', s.id,
            'user_id', s.user_id,
            'username', coalesce(nullif(trim(pr.username), ''), '未命名用户')
          ) order by pr.username), '[]'::jsonb)
          from public.user_subscriptions s
          left join public.profiles pr on pr.id = s.user_id
          where s.batch_id = b.batch_id
        )
      ) as row_json,
      b.batch_created_at
    from (
      select
        batch_id,
        min(created_at) as batch_created_at,
        min(plan_code) as plan_code,
        min(plan_name) as plan_name,
        min(billing_cycle) as billing_cycle,
        min(duration_months) as duration_months,
        min(metadata->>'duration_days') as duration_days,
        min(points_cost) as points_cost,
        min(started_at) as started_at,
        min(expires_at) as expires_at,
        min(status) as status,
        count(*) as grant_count
      from public.user_subscriptions
      where batch_id is not null
      group by batch_id
    ) b
    order by batch_created_at desc
    limit v_limit offset v_offset
  ) t;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

revoke all on function public.admin_list_subscription_grant_batches(integer, integer) from public;
grant execute on function public.admin_list_subscription_grant_batches(integer, integer) to authenticated;
grant execute on function public.admin_list_subscription_grant_batches(integer, integer) to service_role;

-- ------------------------------------------------------------------
-- 3) 已有订阅名单：返回体补 metadata（天数订阅回显用）
-- ------------------------------------------------------------------
create or replace function public.admin_list_existing_subscribers(
  p_plan_code text default null,
  p_any_tier boolean default false,
  p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_total integer;
  v_same_total integer;
  v_any_total integer;
  v_rows jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可查看已有订阅用户';
  end if;

  v_limit := least(greatest(p_limit, 1), 500);

  -- 同层级生效订阅的去重用户数（用于「跳过同层级」提示）
  select count(distinct s.user_id) into v_same_total
    from public.user_subscriptions s
   where s.status = 'active'
     and s.expires_at > now()
     and (p_plan_code is null or s.plan_code = p_plan_code);

  -- 任意层级生效订阅的去重用户数（用于「跳过所有层级」提示）
  select count(distinct s.user_id) into v_any_total
    from public.user_subscriptions s
   where s.status = 'active'
     and s.expires_at > now();

  -- 名单行数（与下方 rows 过滤条件一致）
  select count(*) into v_total
    from public.user_subscriptions s
   where s.status = 'active'
     and s.expires_at > now()
     and (p_any_tier or p_plan_code is null or s.plan_code = p_plan_code);

  select coalesce(jsonb_agg(row_json), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'id', s.id,
      'user_id', s.user_id,
      'username', coalesce(nullif(trim(pr.username), ''), '未命名用户'),
      'plan_code', s.plan_code,
      'plan_name', s.plan_name,
      'billing_cycle', s.billing_cycle,
      'duration_months', s.duration_months,
      'metadata', s.metadata,
      'points_cost', s.points_cost,
      'started_at', s.started_at,
      'expires_at', s.expires_at,
      'status', s.status
    ) as row_json
    from public.user_subscriptions s
    left join public.profiles pr on pr.id = s.user_id
    where s.status = 'active'
      and s.expires_at > now()
      and (p_any_tier or p_plan_code is null or s.plan_code = p_plan_code)
    order by pr.username
    limit v_limit
  ) t;

  return jsonb_build_object(
    'total', v_total,
    'same_total', v_same_total,
    'any_total', v_any_total,
    'rows', v_rows
  );
end;
$$;

revoke all on function public.admin_list_existing_subscribers(text, boolean, integer) from public;
grant execute on function public.admin_list_existing_subscribers(text, boolean, integer) to authenticated;
grant execute on function public.admin_list_existing_subscribers(text, boolean, integer) to service_role;

notify pgrst, 'reload schema';

commit;
