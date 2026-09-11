-- =============================================
-- 订阅发放：续发顺延 + 名单按用户聚合 + 撤销全部生效行
-- 1) admin_batch_grant_subscriptions 增加 p_extend_if_active（默认 true）：
--    - 时长驱动（未显式传 p_expires_at）时，目标用户已有同层级生效订阅
--      且到期晚于本次起点 → 新段从其现有到期时间顺延，避免重叠浪费
--    - 通知改为按行取 expires_at（顺延后各用户到期不同，文案各自正确）
-- 2) admin_list_existing_subscribers 按 user_id+plan_code 聚合：
--    - 一人一层级一行，代表行=到期最晚一条，附 grant_count（生效行数）
-- 3) admin_cancel_subscription 增加 p_all_active_same_plan（默认 false）：
--    - 为 true 时撤销该用户同层级的全部生效行（台账保留、逐条留痕）
-- =============================================

begin;

-- 移除旧签名，避免重载歧义
drop function if exists public.admin_batch_grant_subscriptions(uuid[], text, text, text, integer, integer, timestamptz, timestamptz, text, jsonb, boolean, boolean, boolean, integer);
drop function if exists public.admin_cancel_subscription(uuid);

-- ------------------------------------------------------------------
-- 1) 批量发放订阅（续发顺延 + 赠送通知 + 天数时长）
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
  p_duration_days integer default 0,
  p_extend_if_active boolean default true
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
  v_extended integer := 0;
  v_notified integer := 0;
  v_batch_id uuid := gen_random_uuid();
  v_started_at timestamptz;
  v_expires_at timestamptz;
  v_interval interval;
  v_duration_days integer;
  v_duration_months integer;
  v_metadata jsonb;
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
    v_interval := make_interval(days => v_duration_days);
    v_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('duration_days', v_duration_days);
  else
    -- 月数模式：原校验不变
    if coalesce(p_duration_months, 0) <= 0 or p_duration_months > 120 then
      raise exception '订阅月数必须是 1-120 之间的整数';
    end if;
    v_duration_months := p_duration_months;
    v_interval := make_interval(months => v_duration_months);
    v_metadata := coalesce(p_metadata, '{}'::jsonb);
  end if;

  if p_status not in ('active', 'expired', 'cancelled') then
    raise exception '订阅状态无效';
  end if;

  v_started_at := coalesce(p_started_at, now());
  -- 显式 p_expires_at 为绝对时间语义，不做顺延；时长驱动才顺延
  v_expires_at := coalesce(p_expires_at, v_started_at + v_interval);

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
      'extended', 0,
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
    base.user_id,
    p_plan_code,
    p_plan_name,
    p_billing_cycle,
    p_points_cost,
    v_duration_months,
    base.start_ts,
    base.start_ts + v_interval,
    p_status,
    v_metadata,
    v_batch_id
  from (
    select
      t.user_id,
      (
        case
          -- 续发顺延：仅时长驱动（未显式指定到期时间）时生效；
          -- 已有同层级生效订阅且到期晚于本次起点 → 从现有到期时间接续
          when p_extend_if_active and p_expires_at is null then
            coalesce((
              select max(s.expires_at)
                from public.user_subscriptions s
               where s.user_id = t.user_id
                 and s.plan_code = p_plan_code
                 and s.status = 'active'
                 and s.expires_at > v_started_at
            ), v_started_at)
          else v_started_at
        end
      ) as start_ts
    from unnest(v_targets) as t(user_id)
  ) base;

  get diagnostics v_affected = row_count;

  -- 顺延人数（新段起点晚于本次起点）
  select count(*) into v_extended
    from public.user_subscriptions s
   where s.batch_id = v_batch_id
     and s.started_at > v_started_at;

  -- 赠送通知：按行取各自 expires_at（顺延后同批次到期时间不同），仅实际发放且生效的订阅
  if p_notify and p_status = 'active' and v_affected > 0 then
    insert into public.notifications (recipient_id, sender_id, type, status, content)
    select s.user_id, auth.uid(), 'subscription', 'unread',
           '您已获得' || p_plan_name || '订阅，有效期至 '
             || to_char(s.expires_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI')
    from public.user_subscriptions s
    where s.batch_id = v_batch_id;

    get diagnostics v_notified = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'affected', v_affected,
    'skipped', v_skipped,
    'extended', v_extended,
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

revoke all on function public.admin_batch_grant_subscriptions(uuid[], text, text, text, integer, integer, timestamptz, timestamptz, text, jsonb, boolean, boolean, boolean, integer, boolean) from public;
grant execute on function public.admin_batch_grant_subscriptions(uuid[], text, text, text, integer, integer, timestamptz, timestamptz, text, jsonb, boolean, boolean, boolean, integer, boolean) to authenticated;
grant execute on function public.admin_batch_grant_subscriptions(uuid[], text, text, text, integer, integer, timestamptz, timestamptz, text, jsonb, boolean, boolean, boolean, integer, boolean) to service_role;

-- ------------------------------------------------------------------
-- 2) 已有订阅名单：按用户+层级聚合（一人一层级一行，代表行=到期最晚）
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

  -- 聚合组数（用户+层级，与下方 rows 口径一致）
  select count(*) into v_total
    from (
      select distinct s.user_id, s.plan_code
        from public.user_subscriptions s
       where s.status = 'active'
         and s.expires_at > now()
         and (p_any_tier or p_plan_code is null or s.plan_code = p_plan_code)
    ) g;

  select coalesce(jsonb_agg(row_json order by username), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'id', k.id,
      'user_id', k.user_id,
      'username', coalesce(nullif(trim(pr.username), ''), '未命名用户'),
      'plan_code', k.plan_code,
      'plan_name', k.plan_name,
      'billing_cycle', k.billing_cycle,
      'duration_months', k.duration_months,
      'metadata', k.metadata,
      'points_cost', k.points_cost,
      'started_at', k.started_at,
      'expires_at', k.expires_at,
      'status', k.status,
      'grant_count', k.grant_count
    ) as row_json,
    coalesce(nullif(trim(pr.username), ''), '未命名用户') as username
    from (
      -- 代表行 = 该用户该层级中到期最晚的一条；grant_count = 生效行数（续期台账）
      select distinct on (s.user_id, s.plan_code)
        s.id, s.user_id, s.plan_code, s.plan_name, s.billing_cycle,
        s.duration_months, s.metadata, s.points_cost,
        s.started_at, s.expires_at, s.status,
        count(*) over (partition by s.user_id, s.plan_code) as grant_count
      from public.user_subscriptions s
      where s.status = 'active'
        and s.expires_at > now()
        and (p_any_tier or p_plan_code is null or s.plan_code = p_plan_code)
      order by s.user_id, s.plan_code, s.expires_at desc
    ) k
    left join public.profiles pr on pr.id = k.user_id
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

-- ------------------------------------------------------------------
-- 3) 撤销订阅：支持撤销该用户同层级全部生效行
-- ------------------------------------------------------------------
create or replace function public.admin_cancel_subscription(
  p_subscription_id uuid,
  p_all_active_same_plan boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_plan_code text;
  v_affected integer := 0;
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可撤销订阅';
  end if;

  select user_id, plan_code into v_user_id, v_plan_code
    from public.user_subscriptions
   where id = p_subscription_id;

  if v_user_id is null then
    raise exception '订阅记录不存在';
  end if;

  if p_all_active_same_plan then
    update public.user_subscriptions
       set status = 'cancelled',
           updated_at = now(),
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'cancelled_by_admin', true,
             'cancelled_at', now()
           )
     where user_id = v_user_id
       and plan_code = v_plan_code
       and status = 'active';
  else
    update public.user_subscriptions
       set status = 'cancelled',
           updated_at = now(),
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'cancelled_by_admin', true,
             'cancelled_at', now()
           )
     where id = p_subscription_id;
  end if;

  get diagnostics v_affected = row_count;

  return jsonb_build_object(
    'ok', true,
    'id', p_subscription_id,
    'user_id', v_user_id,
    'plan_code', v_plan_code,
    'affected', v_affected,
    'status', 'cancelled'
  );
end;
$$;

revoke all on function public.admin_cancel_subscription(uuid, boolean) from public;
grant execute on function public.admin_cancel_subscription(uuid, boolean) to authenticated;
grant execute on function public.admin_cancel_subscription(uuid, boolean) to service_role;

notify pgrst, 'reload schema';

commit;
