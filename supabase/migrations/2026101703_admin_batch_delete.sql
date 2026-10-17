-- plans/027 E6.3 服务端真全选批量删除（安全白名单版）
-- 语义：仅管理员；表名白名单（排除 users/points 走 admin_delete_user_account、
-- 排除审计表自身）；p_filters = 固定形状的条件数组（列名经 information_schema
-- 校验 + quote_ident，值经 format %L 绑定，op 白名单），绝不直接拼 SQL 字符串；
-- 执行前 count 预检与 p_expected_count 对齐（不一致即拒绝），上限 5000；
-- 单语句原子删除（RLS 以 security definer 绕过，审计自行写入 admin_audit_logs）。

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
    'bohai_model_configs',
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
    v_col := v_item->>'column';
    v_op := lower(v_item->>'op');
    if v_col is null or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = p_table and column_name = v_col
    ) then
      raise exception 'unknown filter column: %', v_col;
    end if;
    if v_op not in ('eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'or_ilike') then
      raise exception 'unsupported filter op: %', v_op;
    end if;
    if v_op = 'or_ilike' then
      -- 多列 OR 模糊（对应前端搜索框语义）：列逐一校验存在性，值统一 %L 绑定
      v_cond := '(' || coalesce((
        select string_agg(quote_ident(c->>'column') || ' ilike ' || quote_literal(v_item->>'value'), ' OR ')
        from jsonb_array_elements(v_item->'columns') c
        where exists (
          select 1 from information_schema.columns ic
          where ic.table_schema = 'public'
            and ic.table_name = p_table
            and ic.column_name = c->>'column'
        )
      ), '');
      if v_cond = '()' then
        raise exception 'or_ilike: no valid columns';
      end if;
    else
      v_cond := case v_op
      when 'eq' then quote_ident(v_col) || ' = ' || quote_literal(v_item->>'value')
      when 'neq' then quote_ident(v_col) || ' <> ' || quote_literal(v_item->>'value')
      when 'gt' then quote_ident(v_col) || ' > ' || quote_literal(v_item->>'value')
      when 'gte' then quote_ident(v_col) || ' >= ' || quote_literal(v_item->>'value')
      when 'lt' then quote_ident(v_col) || ' < ' || quote_literal(v_item->>'value')
      when 'lte' then quote_ident(v_col) || ' <= ' || quote_literal(v_item->>'value')
      when 'like' then quote_ident(v_col) || ' like ' || quote_literal(v_item->>'value')
      when 'ilike' then quote_ident(v_col) || ' ilike ' || quote_literal(v_item->>'value')
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

  insert into public.admin_audit_logs
    (actor_id, actor_label, action, resource_table, resource_id, meta)
  values (
    auth.uid(),
    (select coalesce(username, '') from public.profiles where id = auth.uid()),
    'batch_delete',
    p_table,
    null,
    jsonb_build_object('filters', p_filters, 'deleted', v_count)
  );

  return v_count;
end;
$$;

revoke execute on function public.admin_batch_delete(text, jsonb, integer)
  from anon, authenticated, public;
grant execute on function public.admin_batch_delete(text, jsonb, integer)
  to authenticated;

notify pgrst, 'reload schema';
