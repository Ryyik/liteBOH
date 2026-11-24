-- ============================================================================
-- 2026112401_subscription_tier_merge.sql
--
-- 046 — 订阅档位合并：Plus 并入 Pro（四档制）。用户 2026-11-24 逐条确认：
--   1. Pro 权益取现 Pro 全套不动，只改价：月 20 → 15，年付 200 → 150。
--   2. 现有 23 个活跃 Plus 用户免费升 Pro 至原到期日，不追差价、不补积分。
--   3. 免费档 plan_code 保持 'free'，只把显示名改成 Standard（纯前端）。
--   4. 昵称色三档：Pro 银 / Max 金 / Ultra 虹（纯前端）。
--
-- 核心策略：**不删档、不搬数据，靠别名归一表把 plus 折到 pro**。
--   历史行保持 `points_cost = 8` 原样 ⇒ 台账仍看得见「当初花 8 积分买的 Plus」。
--   不做 UPDATE 回填：那会把 32 行历史的 points_cost=8 变成「Pro 只要 8 积分」，破坏审计。
--
-- SQL 侧新增两个 helper 作为**档位语义的单一真源**：
--   · boh_tier_alias(text) —— 别名归一（plus / boh-* → 规范档位码）
--   · boh_tier_rank(text)  —— 档位序（free 0 / pro 1 / max 2 / ultra 3）
--   本迁移之后，任何函数都**不许**再内联 `case ... when 'ultra' then N` 阶梯 ——
--   那种复制粘贴正是「改一处漏一处、某条链上 plus 仍当独立档」的根源（plans/046 §4）。
--
-- ⚠️ 刻意**不动**的三处（plans/046 §P2 第 6 条）：
--   · user_subscriptions.plan_code —— 无 CHECK 约束，历史值原样保留；
--   · bolek_model_configs.min_tier 的 CHECK —— 实测零行在用，收紧约束属对外变更；
--   · get_ai_mode_token_multiplier 的 pro/max/ultra —— 那是**模型模式 id**，不是订阅档位。
--
-- 回滚：见文件末尾。
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) 档位语义单一真源
-- ----------------------------------------------------------------------------

/* 别名归一：把历史/带前缀的 plan_code 折成规范档位码。
   `plus` 折到 `pro` 是本次合并的全部实现 —— 23 个活跃用户靠它自动生效。 */
create or replace function public.boh_tier_alias(p_code text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_code, '')))
    when 'plus'        then 'pro'
    when 'boh-ai-plus' then 'pro'
    when 'boh-plus'    then 'pro'
    when 'boh-pro'     then 'pro'
    when 'boh-max'     then 'max'
    when 'boh-ultra'   then 'ultra'
    else lower(trim(coalesce(p_code, '')))
  end;
$$;

comment on function public.boh_tier_alias(text) is
  '订阅档位别名归一（2026-11-24 四档制）：plus / boh-* → 规范档位码。'
  ' plus 折到 pro 是 Plus 并入 Pro 的唯一实现，删掉这条会让 23 个活跃用户当场掉成 free。';

/* 档位序：free 0 / pro 1 / max 2 / ultra 3。未知档位（含 limit / guest / 空）返回 -1 —— 
   与历史上各处 `else -1` 的语义一致，调用方据此判断「这不是一个能比较的档」。 */
create or replace function public.boh_tier_rank(p_code text)
returns integer
language sql
immutable
as $$
  select case public.boh_tier_alias(p_code)
    when 'free'  then 0
    when 'pro'   then 1
    when 'max'   then 2
    when 'ultra' then 3
    else -1
  end;
$$;

comment on function public.boh_tier_rank(text) is
  '订阅档位序（2026-11-24 四档制）：free 0 / pro 1 / max 2 / ultra 3，未知 -1。'
  ' 与前端 src/utils/subscription-benefits.js 的 TIER_ORDER 同序，改动需两侧同步。';

-- 既有的头像框档位序函数改为薄封装：保留名字（有现存调用方与 grant），
-- 内部转调唯一真源，避免出现第二份档位序。
create or replace function public.avatar_frame_tier_rank(p_tier text)
returns integer
language sql
immutable
as $$
  select public.boh_tier_rank(p_tier);
$$;

-- ----------------------------------------------------------------------------
-- 2) 活跃版本的档位阶梯 → 引用 helper
--    「活跃版本」= 线上当前生效的实现（用 Management API 读 pg_get_functiondef
--    核对过，不是按迁移文件猜的）。
-- ----------------------------------------------------------------------------

-- 2a) get_user_subscription_tier（单发）
--     行为差异说明：此函数返回**规范档位码**，所以历史 plus 用户从此报 'pro' —— 这正是验收判据。
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
  v_versioned record;
  v_best_idx int := -1;
begin
  if p_user_id is null then
    return '';
  end if;

  for v_versioned in
    select distinct lower(trim(s.plan_code)) as code
    from public.user_subscriptions s
    where s.user_id = p_user_id
      and s.status in ('active', 'trial')
      and s.expires_at > now()
  loop
    v_idx := public.boh_tier_rank(v_versioned.code);
    if v_idx > v_best_idx then
      v_best_idx := v_idx;
      -- 返回归一后的规范码（plus → pro），调用方不必再过一遍别名表
      v_tier := public.boh_tier_alias(v_versioned.code);
    end if;
  end loop;

  return v_tier;
end;
$$;

-- 2b) get_user_subscription_tiers（批量）
--     ⚠️ 线上此函数只认 status='active'（历史迁移文件里写的 in ('active','trial') 已漂移）。
--     本次**保持线上的 active-only 语义不动**，只替换档位序与返回码归一。
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
      public.boh_tier_alias(s.plan_code) as code,
      public.boh_tier_rank(s.plan_code) as idx
    from public.user_subscriptions s
    where s.user_id = any(p_user_ids)
      and s.status = 'active'
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

-- 2c) subscribe_with_points
--     ⚠️ 取价部分**刻意不改**：`v_plan_code := lower(trim(p_plan_code))` 保持原值去查价格表。
--     旧 PWA 仍会发 plan_code='plus'，而 plus 的价格行在本迁移第 3 步被下架 ⇒ 返回
--     PLAN_NOT_AVAILABLE，用户得到明确失败。若在这里归一成 pro，旧客户端会按**Pro 的 15 积分**
--     成交，而它页面上显示的是「Plus 8 积分」—— 那是错价，比失败更糟（plans/046 §P6）。
--     只把三处档位比较阶梯换成 boh_tier_rank。
create or replace function public.subscribe_with_points(
  p_plan_code text,
  p_plan_name text,
  p_billing_cycle text,
  p_points_cost integer,
  p_duration_months integer,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamp with time zone := now();
  v_current_points integer := 0;
  v_next_points integer := 0;
  v_started_at timestamp with time zone := v_now;
  v_expires_at timestamp with time zone := v_now;
  v_subscription_id uuid;

  -- 服务端取价结果（忽略调用方的 p_points_cost / p_duration_months）
  v_plan_code text;
  v_price_cost integer;
  v_price_months integer;

  -- 当前决定用户等级的最高档有效订阅（含 trial）
  v_cur_id uuid;
  v_cur_plan_code text;
  v_cur_status text;
  v_cur_points_cost integer := 0;
  v_cur_duration_months integer := 1;
  v_cur_expires_at timestamp with time zone;

  -- 档位比较与折算
  v_target_rank integer;
  v_cur_rank integer;
  v_remaining_days integer := 0;
  v_credit integer := 0;
  v_due integer := 0;
  v_charge integer := 0;
  v_action text := 'new';
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  if coalesce(trim(p_plan_code), '') = ''
     or coalesce(trim(p_plan_name), '') = '' then
    return jsonb_build_object('ok', false, 'message', 'INVALID_INPUT');
  end if;

  if p_billing_cycle not in ('monthly', 'yearly') then
    return jsonb_build_object('ok', false, 'message', 'INVALID_BILLING_CYCLE');
  end if;

  -- 归一化档位码（与 2026082301 别名口径一致）
  v_plan_code := lower(trim(p_plan_code));

  -- 服务端取价：价格与时长只认价格表，调用方传参一律忽略。
  -- 无价格记录的档位（free / coding-* / 已下架 plus / 未知码）视为未上架，直接拒绝。
  select p.points_cost, p.duration_months
    into v_price_cost, v_price_months
    from public.subscription_plan_prices p
   where p.plan_code = v_plan_code
     and p.billing_cycle = p_billing_cycle
     and p.is_active;

  if v_price_cost is null or v_price_months is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'PLAN_NOT_AVAILABLE',
      'plan_code', v_plan_code,
      'billing_cycle', p_billing_cycle
    );
  end if;

  -- 锁定并读取用户积分（防止并发重复扣费）
  select coalesce(points, 0)
    into v_current_points
    from public.profiles
   where id = v_user_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'PROFILE_NOT_FOUND');
  end if;

  -- 取当前最高档有效订阅（含 trial，档位降序 -> 到期最晚）
  select s.id, s.plan_code, s.status, s.points_cost, s.duration_months, s.expires_at
    into v_cur_id, v_cur_plan_code, v_cur_status, v_cur_points_cost, v_cur_duration_months, v_cur_expires_at
    from public.user_subscriptions s
   where s.user_id = v_user_id
     and s.status in ('active', 'trial')
     and s.expires_at > v_now
   order by
     public.boh_tier_rank(s.plan_code) desc,
     s.expires_at desc
   limit 1
   for update;

  v_target_rank := public.boh_tier_rank(v_plan_code);
  v_cur_rank := public.boh_tier_rank(v_cur_plan_code);

  -- 降档守卫：已有更高档有效订阅（含 trial）时不允许购买低档
  if v_cur_id is not null and v_target_rank < v_cur_rank then
    return jsonb_build_object(
      'ok', false,
      'message', 'LOWER_TIER_NOT_SUPPORTED',
      'current_plan_code', coalesce(v_cur_plan_code, ''),
      'action', 'blocked'
    );
  end if;

  -- 行为判定
  if v_cur_id is null then
    -- 新订阅：立即生效
    v_action := 'new';
    v_started_at := v_now;
  elsif v_target_rank = v_cur_rank then
    if v_cur_status = 'trial' then
      -- 试用转正：立即生效，避免把试用记录置 expired 后出现权益空窗
      v_action := 'convert';
      v_started_at := v_now;
    else
      -- 同档续订：顺延到当前订阅到期后
      v_action := 'renew';
      v_started_at := v_cur_expires_at;
    end if;
  else
    -- 升级：立即生效 + 折算
    v_action := 'upgrade';
    v_started_at := v_now;
    v_remaining_days := greatest(
      0,
      ceil(extract(epoch from (v_cur_expires_at - v_now)) / 86400.0)
    )::integer;
    -- 日单价 = 旧订阅实际成交价 / (时长月数 * 30)，按剩余天数折算可抵扣积分
    v_credit := round(
      (v_cur_points_cost::numeric / greatest(v_cur_duration_months, 1) / 30.0)
      * v_remaining_days
    )::integer;
    v_due := greatest(0, v_price_cost - v_credit);
  end if;

  v_expires_at := v_started_at + make_interval(months => v_price_months);

  -- 应付：升级为折算后差额，其余为全价（试用 cost=0 故转正不抵扣）
  v_charge := case when v_action = 'upgrade' then v_due else v_price_cost end;

  if v_current_points < v_charge then
    return jsonb_build_object(
      'ok', false,
      'message', 'INSUFFICIENT_POINTS',
      'current_points', v_current_points,
      'required_points', v_charge,
      'action', v_action,
      'credit_applied', v_credit,
      'remaining_days', v_remaining_days
    );
  end if;

  update public.profiles
     set points = coalesce(points, 0) - v_charge
   where id = v_user_id
  returning points into v_next_points;

  -- 积分流水：订阅扣减入账（BETA 6 账本补全）。
  -- charge=0（试用转正零扣减）不写流水，避免零额噪音；余额快照取本次扣减后的真实值。
  if v_charge > 0 then
    insert into public.points_transactions (user_id, amount, balance_after, reason, remark)
    values (
      v_user_id,
      -v_charge,
      coalesce(v_next_points, 0),
      'subscription',
      case v_action
        when 'upgrade' then '订阅升级：' || p_plan_name || '（旧订阅抵扣 ' || v_credit || ' 积分）'
        when 'renew'   then '订阅续费：' || p_plan_name
        when 'convert' then '试用转正：' || p_plan_name
        else '订阅开通：' || p_plan_name
      end
    );
  end if;

  if v_action = 'upgrade' then
    -- 升级：作废当前最高档有效订阅（含 trial），metadata 留痕
    update public.user_subscriptions
       set status = 'expired',
           updated_at = now(),
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'superseded_by', v_plan_code,
             'superseded_at', now(),
             'credit_applied', v_credit,
             'remaining_days', v_remaining_days,
             'trial_converted_to', case when status = 'trial' then v_plan_code else null end
           )
     where user_id = v_user_id
       and status in ('active', 'trial')
       and expires_at > v_now;
  else
    -- 新建/续订/转正：清理已过期 active 记录，并作废仍在有效期内的 trial（试用转正为新付费订阅）
    update public.user_subscriptions
       set status = 'expired',
           updated_at = now(),
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'superseded_by', v_plan_code,
             'superseded_at', now(),
             'trial_converted_to', case when status = 'trial' then v_plan_code else null end
           )
     where user_id = v_user_id
       and (
         (status = 'active' and expires_at <= v_now)
         or status = 'trial'
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
    metadata
  )
  values (
    v_user_id,
    v_plan_code,
    p_plan_name,
    p_billing_cycle,
    v_price_cost,
    v_price_months,
    v_started_at,
    v_expires_at,
    'active',
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'action', v_action,
      'price_source', 'server',
      'credit_applied', case when v_action = 'upgrade' then v_credit else 0 end,
      'remaining_days', case when v_action = 'upgrade' then v_remaining_days else 0 end,
      'previous_plan_code', case when v_action = 'upgrade' then coalesce(v_cur_plan_code, '') else '' end,
      'converted_from_trial', case when v_cur_status = 'trial' then true else null end
    )
  )
  returning id into v_subscription_id;

  return jsonb_build_object(
    'ok', true,
    'message', 'SUBSCRIBE_SUCCESS',
    'subscription_id', v_subscription_id,
    'plan_code', v_plan_code,
    'plan_name', p_plan_name,
    'billing_cycle', p_billing_cycle,
    'action', v_action,
    'previous_plan_code', case when v_action = 'upgrade' then coalesce(v_cur_plan_code, '') else '' end,
    'credit_applied', case when v_action = 'upgrade' then v_credit else 0 end,
    'remaining_days', case when v_action = 'upgrade' then v_remaining_days else 0 end,
    'points_deducted', v_charge,
    'required_points', v_price_cost,
    'current_points', coalesce(v_next_points, 0),
    'started_at', v_started_at,
    'expires_at', v_expires_at
  );
end;
$$;

-- 2d) lottery_pity_threshold
--     语义修正：Plus 并入 Pro 后，原 Plus 用户应当拿到 **Pro 的 18 场**（比原来的 24 场更宽松，
--     属权益提升，符合「免费升 Pro」的承诺）。`when 'plus' then 24` 删除，靠 alias 折到 pro。
create or replace function public.lottery_pity_threshold(p_tier text)
returns integer
language sql
immutable
as $$
  select case public.boh_tier_alias(p_tier)
    when 'pro' then 18
    when 'max' then 12
    when 'ultra' then 8
    else 0
  end;
$$;

-- 2e) points_card_preset_capacity_for_user
--     plus=6 删除 ⇒ 原 Plus 用户拿到 Pro 的 10 张（权益提升）。
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
      else 3
    end as capacity
  from t;
$$;

-- 2f) boh_cloud_image_limit_for_user
--     plus=300 删除 ⇒ 原 Plus 用户从 300 张升到 Pro 的 450 张（plans/046 §P6 明确列为首批可见变化）。
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
    case public.boh_tier_alias(plan_code)
      when 'pro' then 450
      when 'max' then 900
      when 'ultra' then 1200
      else 0
    end
  ), 0)
    into v_plan_limit
    from public.user_subscriptions
   where user_id = p_user_id
     and status in ('active', 'trial')
     and expires_at > now();

  return greatest(150, v_plan_limit);
end;
$$;

-- 2g) apply_yearly_membership_gift（年度徽章触发器）
--     plus 仍要保留在**该发徽章**的名单里 —— 历史 yearly Plus 行不该因为合并而丢徽章。
--     用 alias 归一后判断「是不是付费档」比逐个别名列举更不容易漏。
create or replace function public.apply_yearly_membership_gift()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.billing_cycle = 'yearly'
     and public.boh_tier_rank(new.plan_code) >= 1 then
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'yearly_gift', jsonb_build_object(
        'code', 'annual-member-badge',
        'label', '年度会员纪念徽章',
        'granted_at', now()
      )
    );
  end if;
  return new;
end;
$$;

-- 2h) claim_boh_eighth_anniversary_subscription（周年礼「按当前档位续」）
--     这个函数在迁移文件里搜不到 —— 它是历史迁移用别的写法建的，只能从线上
--     pg_get_functiondef 读到。⚠️ 这正是 plans/046 §4 那条风险的实例：
--     「grep 迁移文件找档位阶梯」会漏掉线上独有实现，必须查 pg_proc。
--
--     语义差异要小心：原内联序是 ultra=4 / max=3 / pro=2 / plus=1 / free=0，
--     判据 `rank > 3` 意思是「只有 ultra」。新序是 free0/pro1/max2/ultra3
--     ⇒ 判据必须改成 `rank >= 3`。直接照抄 `>= 4` 会永远为假，ultra 用户
--     拿到的周年礼会被降成 Max（静默少发，UI 上只表现为「怎么是 Max」）。
create or replace function public.claim_boh_eighth_anniversary_subscription(
  p_prefer_current_tier boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_code constant text := 'boh-8th-anniversary-2026';
  v_user_id uuid := auth.uid();
  v_now timestamp with time zone := now();
  v_current_plan_code text := '';
  v_current_plan_rank integer := 0;
  v_target_plan_code text := 'max';
  v_target_plan_name text := 'Max';
  v_latest_expire timestamp with time zone;
  v_started_at timestamp with time zone;
  v_expires_at timestamp with time zone;
  v_claim_id uuid;
  v_subscription_id uuid;
  v_existing_claim record;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_campaign_code || ':' || v_user_id::text, 0));

  select granted_plan_code, granted_plan_name, subscription_id, started_at, expires_at
    into v_existing_claim
    from public.anniversary_subscription_claims
   where campaign_code = v_campaign_code
     and user_id = v_user_id;

  if found then
    return jsonb_build_object(
      'ok', false, 'message', 'ALREADY_CLAIMED', 'already_claimed', true,
      'plan_code', v_existing_claim.granted_plan_code,
      'plan_name', v_existing_claim.granted_plan_name,
      'subscription_id', v_existing_claim.subscription_id,
      'started_at', v_existing_claim.started_at,
      'expires_at', v_existing_claim.expires_at
    );
  end if;

  select normalized.code, normalized.rank
    into v_current_plan_code, v_current_plan_rank
    from (
      select
        public.boh_tier_alias(plan_code) as code,
        public.boh_tier_rank(plan_code) as rank
      from public.user_subscriptions
      where user_id = v_user_id
        and status = 'active'
        and expires_at > v_now
      order by public.boh_tier_rank(plan_code) desc, expires_at desc
      limit 1
    ) normalized;

  -- 原 `rank > 3`（ultra 专属）⇒ 新序下是 `rank >= 3`
  if coalesce(p_prefer_current_tier, true) and coalesce(v_current_plan_rank, 0) >= 3 then
    v_target_plan_code := v_current_plan_code;
    v_target_plan_name := case v_current_plan_code when 'ultra' then 'Ultra' else 'Max' end;
  end if;

  select max(expires_at)
    into v_latest_expire
    from public.user_subscriptions
   where user_id = v_user_id
     and status = 'active'
     and expires_at > v_now
     and case
       when v_target_plan_code = 'ultra' then lower(plan_code) in ('ultra', 'boh-ultra')
       else lower(plan_code) in ('max', 'boh-max')
     end;

  v_started_at := greatest(v_now, coalesce(v_latest_expire, v_now));
  v_expires_at := v_started_at + interval '1 month';

  insert into public.anniversary_subscription_claims (
    campaign_code, user_id, granted_plan_code, granted_plan_name, started_at, expires_at
  ) values (
    v_campaign_code, v_user_id, v_target_plan_code, v_target_plan_name, v_started_at, v_expires_at
  )
  returning id into v_claim_id;

  update public.user_subscriptions
     set status = 'expired', updated_at = v_now
   where user_id = v_user_id
     and status = 'active'
     and expires_at <= v_now;

  insert into public.user_subscriptions (
    user_id, plan_code, plan_name, billing_cycle, points_cost,
    duration_months, started_at, expires_at, status, metadata
  ) values (
    v_user_id, v_target_plan_code, v_target_plan_name, 'monthly', 0, 1,
    v_started_at, v_expires_at, 'active',
    jsonb_build_object('source', 'home/anniversary-letter', 'campaign_code', v_campaign_code, 'gift', true)
  )
  returning id into v_subscription_id;

  update public.anniversary_subscription_claims
     set subscription_id = v_subscription_id
   where id = v_claim_id;

  return jsonb_build_object(
    'ok', true, 'message', 'CLAIM_SUCCESS', 'already_claimed', false,
    'plan_code', v_target_plan_code, 'plan_name', v_target_plan_name,
    'subscription_id', v_subscription_id,
    'started_at', v_started_at, 'expires_at', v_expires_at
  );
end;
$$;

commit;

-- ----------------------------------------------------------------------------
-- 3) 价格表：plus 下架、Pro 改价
--    plus 行保留（is_active=false）而不是删除 —— 与 coding-* 下线同款手法：
--    行留着可追溯当初的成交价，但谁都别再以 8 积分买到 Pro。
-- ----------------------------------------------------------------------------
begin;

update public.subscription_plan_prices
   set is_active = false,
       updated_at = now()
 where plan_code = 'plus';

update public.subscription_plan_prices
   set points_cost = 15,
       updated_at = now()
 where plan_code = 'pro' and billing_cycle = 'monthly';

update public.subscription_plan_prices
   set points_cost = 150,
       updated_at = now()
 where plan_code = 'pro' and billing_cycle = 'yearly';

commit;

-- ----------------------------------------------------------------------------
-- 4) 头像框：那 1 条 tier='plus' 的框归到 pro
--    不改的话它永久锁死 —— `boh_tier_rank('plus')` 现在折到 pro，但框声明的是 'plus'，
--    比较时两边都会归一，实际能解锁；不过管理端下拉已无 plus，显示会漏原始代号。
--    显式 UPDATE 让数据与语义一致。
-- ----------------------------------------------------------------------------
begin;

update public.avatar_frames
   set tier = 'pro',
       updated_at = now()
 where tier = 'plus';

commit;

-- ----------------------------------------------------------------------------
-- 5) ai_quota_config 的 plus 行：**保留**，仅加注说明
--    计划 §P2 第 5 条：行留着标「历史，无新订阅可达」；pro 行数值不动。
--    不改数值的理由：Pro 的 daily_token_limit 是线上真值（1000000），前端展示副本
--    PLAN_AI_TOKEN_LIMITS 与它一致；改价不改额度。
-- ----------------------------------------------------------------------------
comment on table public.ai_quota_config is
  '按订阅档位配置 AI 日额度与积分倍率。'
  ' ⚠️ 2026-11-24（plans/046）：tier=''plus'' 这行是**历史行**，新订阅已不可达'
  '（Plus 并入 Pro，价格行已下架）；保留仅为历史对账。读取方应先用 boh_tier_alias() 归一。';

notify pgrst, 'reload schema';

-- ============================================================================
-- 自证（执行后逐条跑，只读）
-- ============================================================================
--   -- ① helper 就位且四档同序
--   select public.boh_tier_alias('plus'), public.boh_tier_rank('free'),
--          public.boh_tier_rank('pro'), public.boh_tier_rank('max'),
--          public.boh_tier_rank('ultra'), public.boh_tier_rank('plus');
--     ⇒ pro | 0 | 1 | 2 | 3 | 1
--
--   -- ② 23 个活跃 Plus 用户全部报 pro（plans/046 §P2 判据）
--   select count(*) filter (where public.get_user_subscription_tier(user_id) = 'pro') as as_pro,
--          count(*) as total
--     from public.user_subscriptions
--    where plan_code = 'plus' and status = 'active';
--     ⇒ as_pro = total = 23
--
--   -- ③ 批量 RPC 同口径
--   select count(*) from public.get_user_subscription_tiers(
--     (select array_agg(user_id) from public.user_subscriptions
--       where plan_code='plus' and status='active')) where tier = 'pro';
--     ⇒ 23
--
--   -- ④ 存量档位一档不掉（pro 31 / max 6 / ultra 2）
--   select plan_code, count(distinct user_id) from public.user_subscriptions
--    where status='active' group by 1 order by 1;
--
--   -- ⑤ 价格：plus 全下架、pro 15/150
--   select plan_code, billing_cycle, points_cost, is_active
--     from public.subscription_plan_prices
--    where plan_code in ('plus','pro') order by 1,2;
--
--   -- ⑥ 框已归 pro
--   select tier, count(*) from public.avatar_frames group by 1 order by 1;
--
--   -- ⑦ 真正的不变量：没有任何函数还按 `'plus'` 分支（应只剩 boh_tier_alias 自己）
--   select p.proname from pg_proc p
--    where p.pronamespace='public'::regnamespace and p.prosrc ilike '%''plus''%'
--    order by 1;
--     ⇒ 仅 boh_tier_alias
--
--   -- ⑧ 残余 `when 'ultra' then N` 只应出现在**数值表**里（额度 450/900/1200、保底 18/12/8、
--   --    容量 24/16/10），不是**档位序阶梯**。人工逐条核对下列命中即可：
--   select p.proname from pg_proc p
--    where p.pronamespace='public'::regnamespace and p.prosrc ilike '%when ''ultra''%'
--    order by 1;
--
-- ⚠️ 2026-11-24 执行实录（两处计划外发现，都已处置）：
--   · `claim_boh_eighth_anniversary_subscription` 有内联档位序，但**迁移文件里搜不到**
--     （历史迁移用了别的写法建的）。⇒ 「grep 迁移文件」不足以找齐档位序，必须查 pg_proc。
--   · 首次执行时 `subscribe_with_points` 漏进了「待替换」清单（脚本按函数分段执行，
--     那一段没跑）。⇒ 分块执行必须事后用 ⑦ 复查，不能假定每段都跑了。
--
-- 反证（必须做一次，plans/046 §P2）：把 boh_tier_alias 的 `when 'plus' then 'pro'` 摘掉后
-- 重跑 ② ⇒ 23 行必须掉回 ''。⚠️ 实测坑：**光摘 alias 看不出效果**，因为那 23 行的
-- expires_at 全都已过期（见下条），本来就不参与计算。正确做法是同一事务内
-- 「relax 一条 plus 行的 expires_at 到未来 + 摘 alias」，才测得到 alias 的作用。
--
-- ⚠️ **存量口径偏差（2026-11-24 实测，与 plans/046 §0.1 不符，须用户知情）**：
--   §0.1 记的是「plus 活跃 23 / pro 31 / max 6 / ultra 2」，但那是按 `status` 字段数的。
--   实际 `status='active' AND expires_at > now()` 的行数：
--     · plus  : 23 行 active，**23 行全部已过期**（expires_at 均为 2026-09-25）
--     · pro   : 32 行 active，**全部已过期**（最晚 2026-11-12）
--     · max   : 8 行 active，2 行仍有效
--     · ultra : 3 行 active，1 行仍有效
--   ⇒ 线上**真正在享受付费权益的只有 3 个用户**（max 2 + ultra 1）。
--   本迁移的档位归一逻辑对「已过期行」一样正确（expires_at 一改就能算对，反证已证），
--   所以功能上没有缺陷；但「23 个 Plus 用户免费升 Pro」这句话在权益层面目前是
--   **空承诺** —— 他们的订阅早已到期，本来就是 free 待遇。是否要为他们补发/延期，
--   属产品决策，本次迁移**没有**做任何补发。
--
--
-- ============================================================================
-- 回滚（仅在确认放弃本次合并时使用）
-- ============================================================================
-- begin;
--   -- 1) 价格表恢复
--   update public.subscription_plan_prices set is_active = true, points_cost = 8,  updated_at = now()
--    where plan_code = 'plus' and billing_cycle = 'monthly';
--   update public.subscription_plan_prices set is_active = true, points_cost = 80, updated_at = now()
--    where plan_code = 'plus' and billing_cycle = 'yearly';
--   update public.subscription_plan_prices set points_cost = 20,  updated_at = now()
--    where plan_code = 'pro' and billing_cycle = 'monthly';
--   update public.subscription_plan_prices set points_cost = 200, updated_at = now()
--    where plan_code = 'pro' and billing_cycle = 'yearly';
--   -- 2) 头像框还原（按 id 精确还原，别用 tier='pro' 批量回退 —— 会把原本就是 pro 的框一起改掉）
--   update public.avatar_frames set tier = 'plus', updated_at = now() where id = 'white-cat';
--   -- 3) helper 与函数体：从 git 取 2026112401 之前的版本（2026091001 / 2026082702 /
--   --    2026081904 / 2026081517 / 2026102001 是各自的基线），不要凭记忆重写。
-- commit;
