-- ============================================================================
-- BOHAI → 博莱克（Bolek）品牌更名：数据库对象重命名
--
-- 改什么：
--   1. 表 bohai_model_configs → bolek_model_configs（RLS policy 定义随表保留，
--      仅 policy 名仍是旧前缀 —— PostgreSQL 不支持 rename policy，语义不变，不动）
--   2. 索引 / 全部 bohai_model_configs_* 约束名（动态枚举，存在才改）
--   3. 触发函数 set_bohai_model_configs_updated_at + 触发器（rename 保持 OID 绑定）
--   4. RPC list_public_bohai_modes → list_public_bolek_modes，
--      函数体硬编码了表名，rename 后必须重建（body 取自 2026111702 最新定义）
--   5. admin_batch_delete 白名单数组硬编码表名，同样重建（body 取自 2026101704）
--
-- 不改什么：
--   · 历史迁移文件（append-only）与其中文件名
--   · RLS policy 名（见上）
--   · grant：rename 保留 OID，授权随之生效，无需重授
--
-- 回滚：
--   alter table public.bolek_model_configs rename to bohai_model_configs;
--   （其余对象按同样方式 rename 回去；函数体反向替换 bolek→bohai 重建）
-- ============================================================================

alter table public.bohai_model_configs rename to bolek_model_configs;

alter index if exists bohai_model_configs_status_sort_idx
  rename to bolek_model_configs_status_sort_idx;

-- 约束名动态枚举（存在才 rename，避免历史约束被后续迁移增删导致失败）
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.bolek_model_configs'::regclass
       and conname like 'bohai\_model\_configs\_%'
  loop
    execute format(
      'alter table public.bolek_model_configs rename constraint %I to %I',
      c.conname,
      'bolek_model_configs' || substr(c.conname, length('bohai_model_configs') + 1)
    );
  end loop;
end $$;

-- 触发函数 + 触发器（rename 保持 OID，触发器继续指向同一函数）
alter function public.set_bohai_model_configs_updated_at()
  rename to set_bolek_model_configs_updated_at;
alter trigger trg_bohai_model_configs_updated_at on public.bolek_model_configs
  rename to trg_bolek_model_configs_updated_at;

-- RPC 更名 + 重建函数体（body 内硬编码了表名）
alter function public.list_public_bohai_modes() rename to list_public_bolek_modes;

create or replace function public.list_public_bolek_modes()
returns table (
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
  min_tier text,
  sort_order integer,
  quota_multiplier numeric
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select id, mode_id, display_name, tagline, description, capability, icon,
         temperature, top_p, frequency_penalty, max_tokens, min_tier, sort_order,
         quota_multiplier
    from public.bolek_model_configs
   where status = 'active'
     -- 审核专用行由「审核模型配置」页维护，不进用户侧模式选择器
     and mode_id not like 'moderation-%'
     -- 内部任务行（记忆抽取等）同理；前缀真源见 bolek-internal-modes.js
     and mode_id not like 'internal-%'
   order by sort_order asc, display_name asc;
$function$;
create or replace function public.admin_batch_delete(
  p_table text,
  p_filters jsonb default '[]'::jsonb,
  p_expected_count integer default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed text[] := array[
    'activities',
    'activity_campaigns',
    'activity_entries',
    'activity_rewards',
    'advertisements',
    'ai_web_search_log',
    'anniversary_subscription_claims',
    'api_key_vault_audit_logs',
    'birthday_events',
    'birthday_wishes',
    'block_wall_items',
    'boh_ai_core_memories',
    'boh_creator_shows',
    'bolek_model_configs',
    'comments',
    'forum_post_images',
    'forum_post_reports',
    'forum_weekly_checkins',
    'lab_usage_records',
    'lotteries',
    'lottery_admin_audit_logs',
    'lottery_draw_logs',
    'lottery_entries',
    'lottery_failure_stats',
    'lottery_join_attempts',
    'lottery_notification_jobs',
    'lottery_scheduler_logs',
    'lottery_winner_fulfillments',
    'moderation_logs',
    'news',
    'notifications',
    'photo_albums',
    'points_transactions',
    'post_reward_campaigns',
    'poster_requests',
    'posts',
    'products',
    'shop_points_orders',
    'user_addresses',
    'user_data_export_jobs',
    'user_follows',
    'user_gifts',
    'user_impressions',
    'user_subscriptions'
  ];
  v_cond text;
  v_item jsonb;
  v_col text;
  v_op text;
  v_where text := '';
  v_count integer;
  v_deleted integer;
begin
  if auth.uid() is null then
    raise exception 'forbidden: auth required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'forbidden: admin only' using errcode = '42501';
  end if;
  if p_table is null or not (p_table = any(v_allowed)) then
    raise exception 'table % not allowed for batch delete', p_table using errcode = '42501';
  end if;

  for v_item in select * from jsonb_array_elements(p_filters)
  loop
    v_op := lower(v_item->>'op');
    if v_op is null or v_op not in ('eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'not_like', 'or_ilike') then
      raise exception 'unsupported filter op: %', v_op;
    end if;

    if v_op = 'or_ilike' then
      -- 多列 OR 模糊（对应前端搜索框语义）：列逐一校验存在性，值统一 %L 绑定。
      -- ⚠️ 这个分支**不能**依赖 v_item->>'column'（or_ilike 没有该字段），
      -- 所以必须排在下方「列存在性校验」之前（2026-10-17 审查 P0）。
      -- columns 兼容两种形状：前端发的字符串数组 ["title"]，以及对象数组
      -- [{"column":"title"}]（c->>'column' 为空时用 c #>> '{}' 取字符串值）。
      if jsonb_typeof(v_item->'columns') is distinct from 'array' then
        raise exception 'or_ilike: columns must be an array';
      end if;
      select '(' || string_agg(
               quote_ident(coalesce(c->>'column', c #>> '{}')) || ' ilike ' || quote_literal(v_item->>'value'),
               ' OR '
             ) || ')'
        into v_cond
        from jsonb_array_elements(v_item->'columns') c
        where exists (
          select 1 from information_schema.columns ic
          where ic.table_schema = 'public'
            and ic.table_name = p_table
            and ic.column_name = coalesce(c->>'column', c #>> '{}')
        );
      if v_cond is null or v_cond = '()' then
        raise exception 'or_ilike: no valid columns';
      end if;
    else
      v_col := v_item->>'column';
      if v_col is null or not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = p_table and column_name = v_col
      ) then
        raise exception 'unknown filter column: %', v_col;
      end if;
      v_cond := case v_op
      when 'eq' then quote_ident(v_col) || ' = ' || quote_literal(v_item->>'value')
      when 'neq' then quote_ident(v_col) || ' <> ' || quote_literal(v_item->>'value')
      when 'gt' then quote_ident(v_col) || ' > ' || quote_literal(v_item->>'value')
      when 'gte' then quote_ident(v_col) || ' >= ' || quote_literal(v_item->>'value')
      when 'lt' then quote_ident(v_col) || ' < ' || quote_literal(v_item->>'value')
      when 'lte' then quote_ident(v_col) || ' <= ' || quote_literal(v_item->>'value')
      when 'like' then quote_ident(v_col) || ' like ' || quote_literal(v_item->>'value')
      when 'ilike' then quote_ident(v_col) || ' ilike ' || quote_literal(v_item->>'value')
      when 'not_like' then quote_ident(v_col) || ' not like ' || quote_literal(v_item->>'value')
      end;
    end if;
    v_where := case when v_where = '' then v_cond else v_where || ' AND ' || v_cond end;
  end loop;
  if v_where = '' then
    raise exception 'refusing to batch delete without any filter';
  end if;

  execute 'select count(*) from public.' || quote_ident(p_table) || ' where ' || v_where into v_count;
  if p_expected_count is not null and v_count <> p_expected_count then
    raise exception 'count mismatch: server % vs expected %', v_count, p_expected_count;
  end if;
  if v_count > 5000 then
    raise exception 'batch too large: % rows (cap 5000)', v_count;
  end if;

  execute 'delete from public.' || quote_ident(p_table) || ' where ' || v_where;
  -- 返回/审计用实际删除行数，不用预检 count（并发下两者可能不一致）。
  get diagnostics v_deleted = row_count;

  insert into public.admin_audit_logs
    (actor_id, actor_label, action, resource_table, resource_id, meta)
  values (
    auth.uid(),
    (select coalesce(username, '') from public.profiles where id = auth.uid()),
    'batch_delete',
    p_table,
    null,
    jsonb_build_object('filters', p_filters, 'deleted', v_deleted)
  );

  return v_deleted;
end;
$$;

-- admin_batch_delete：白名单数组硬编码表名，随表更名重建（函数名本身不含 bohai，不改名）

-- lab_ai_model_configs 的表注释文本引用了旧表名，随更名同步改写
-- （其余列/约束注释为 OID 绑定，rename 后自动跟随，文本不含旧名，无需重写）
comment on table public.lab_ai_model_configs is
  '实验室 AI 功能模型配置。model_id 存 bolek_model_configs.mode_id（Bolek 现有模型模式）；temperature/max_tokens 为前端展示参考值，运行时以 bolek_model_configs 配置为准。';

-- ============================================================================
-- 兼容层（过渡期）
--   旧前端（PWA/SW 缓存可能存续数天）仍调 list_public_bohai_modes；
--   旧 EF 仍 .from('bohai_model_configs')。用包装 RPC + security_invoker 视图
--   保持两条旧链路可用；新版前端/EF 全量铺开、SW 缓存窗口过后，
--   另起迁移 drop view / drop function 即可。
-- ============================================================================
create view public.bohai_model_configs with (security_invoker = true) as
  select * from public.bolek_model_configs;
grant select on public.bohai_model_configs to anon, authenticated, service_role;

create or replace function public.list_public_bohai_modes()
returns table (
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
  min_tier text,
  sort_order integer,
  quota_multiplier numeric
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select * from public.list_public_bolek_modes();
$function$;
grant execute on function public.list_public_bohai_modes() to anon, authenticated, service_role;

notify pgrst, 'reload schema';

