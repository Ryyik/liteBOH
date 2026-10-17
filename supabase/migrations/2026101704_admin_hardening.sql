-- 2026-10-17 审查修复（plans/027 E 批）
-- 1) log_admin_action：原来只校验 auth.uid() 非空，任何登录用户都能直接写审计；
--    这里补角色校验（admin 全动作；moderator 仅 moderate/export，保留版主审核与导出留痕）。
--    security definer 绕过 profiles 的 RLS，可安全查询。
-- 2) admin_batch_delete：or_ilike 分支原本排在「列存在性校验」之后，而前端
--    的 or_ilike 条件没有 column 字段 ⇒ 必抛 unknown filter column，带搜索词
--    的全量删除永远失败。这里把 op 分支前置，并补 not_like（bohaiModels 的
--    「排除 moderation- 前缀」基础过滤）与真实删除行数（GET DIAGNOSTICS）。
--
-- 幂等：create or replace；不新增表/列，不改数据。

-- ==================== 1. 审计 RPC：补角色校验 ====================
create or replace function public.log_admin_action(
  p_action text,
  p_resource_table text,
  p_resource_id text default null,
  p_diff jsonb default null,
  p_meta jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    return;
  end if;
  select p.role into v_role from public.profiles p where p.id = auth.uid();
  if v_role not in ('admin', 'moderator') then
    raise exception 'forbidden: staff only' using errcode = '42501';
  end if;
  if v_role = 'moderator' and p_action not in ('moderate', 'export') then
    raise exception 'forbidden: moderator can only log moderate/export' using errcode = '42501';
  end if;
  if p_action not in ('create','update','delete','batch_delete','grant','moderate','export') then
    raise exception 'unsupported action: %', p_action;
  end if;
  insert into public.admin_audit_logs
    (actor_id, actor_label, action, resource_table, resource_id, diff, meta)
  values (
    auth.uid(),
    (select coalesce(username, '') from public.profiles where id = auth.uid()),
    p_action,
    p_resource_table,
    p_resource_id,
    p_diff,
    p_meta
  );
end;
$$;

revoke execute on function public.log_admin_action(text, text, text, jsonb, jsonb)
  from anon, authenticated, public;
grant execute on function public.log_admin_action(text, text, text, jsonb, jsonb)
  to authenticated;

-- ==================== 2. 批量删除 RPC：修 or_ilike + 真实行数 ====================
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

revoke execute on function public.admin_batch_delete(text, jsonb, integer)
  from anon, authenticated, public;
grant execute on function public.admin_batch_delete(text, jsonb, integer)
  to authenticated;

notify pgrst, 'reload schema';

-- ==================== 3. 审核删除 RPC：移除已不存在的 public.messages 引用 ====================
-- check:db-lint 报 42P01：public.messages 在线上不存在，message 分支一旦执行就抛
-- 运行期异常（post/comment 分支不受影响，但 lint 常红）。消息功能已无对应表，
-- 这里把 message 分支改成明确的 UNSUPPORTED_TARGET_TYPE，不再引用幽灵表。
create or replace function public.admin_delete_moderation_target(
  p_target_type text,
  p_target_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text := '';
  v_target_type text := lower(trim(coalesce(p_target_type, '')));
  v_rows integer := 0;
begin
  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', '未登录，无法执行删除');
  end if;

  select coalesce(role, '')
    into v_actor_role
    from public.profiles
   where id = v_actor_id
   limit 1;

  if v_actor_role <> 'admin' then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可删除审核记录');
  end if;

  if p_target_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_TARGET_ID', 'message', '目标 ID 不能为空');
  end if;

  if v_target_type = 'post' then
    delete from public.posts where id = p_target_id;
    get diagnostics v_rows = row_count;
  elsif v_target_type = 'comment' then
    delete from public.comments where id = p_target_id;
    get diagnostics v_rows = row_count;
  elsif v_target_type = 'message' then
    return jsonb_build_object(
      'ok', false,
      'code', 'UNSUPPORTED_TARGET_TYPE',
      'message', '消息功能已下线，无法删除消息目标'
    );
  else
    return jsonb_build_object('ok', false, 'code', 'INVALID_TARGET_TYPE', 'message', '目标类型仅支持 post / comment / message');
  end if;

  return jsonb_build_object(
    'ok', v_rows > 0,
    'affected', v_rows,
    'target_type', v_target_type,
    'target_id', p_target_id
  );
end;
$$;

-- ==================== 4. 保底撤销 RPC：修复 text = uuid 比较 ====================
-- check:db-lint 报 42883：l.detail->>'user_id'（text）与 p_user_id（uuid）比较，
-- 保底发放页的「撤销」按钮一按就抛运行期异常。JSON 里的 user_id 一律按 text 比较。
create or replace function public.admin_undo_pity(
  p_user_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operator uuid := auth.uid();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_old integer := 0;
  v_before integer;
  v_target jsonb;
  v_log_id uuid;
  v_action text;
  v_is_batch boolean := false;
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可撤销保底修改';
  end if;

  if p_user_id is null then
    raise exception '用户 ID 不能为空';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception '用户不存在';
  end if;

  select l.id, l.action,
         case
           when l.detail ? 'user_id' then l.detail
           else (
             select d
               from jsonb_array_elements(l.detail->'details') d
              where d->>'user_id' = p_user_id::text
                and coalesce((d->>'ok')::boolean, false)
                and coalesce((d->>'undone')::boolean, false) = false
              limit 1
           )
         end as target_detail,
         (l.detail ? 'details') as is_batch
    into v_log_id, v_action, v_target, v_is_batch
    from public.lottery_admin_audit_logs l
   where l.action in ('pity.adjust', 'pity.set', 'pity.batch_adjust', 'pity.batch_set')
     and (
       (l.detail ? 'user_id' and l.detail->>'user_id' = p_user_id::text and coalesce((l.detail->>'undone')::boolean, false) = false)
       or
       (l.detail ? 'details' and exists (
         select 1 from jsonb_array_elements(l.detail->'details') d
          where d->>'user_id' = p_user_id::text
            and coalesce((d->>'ok')::boolean, false)
            and coalesce((d->>'undone')::boolean, false) = false
       ))
     )
   order by l.created_at desc, l.id desc
   limit 1;

  if v_target is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'NOTHING_TO_UNDO',
      'message', '该用户没有可撤销的保底修改记录'
    );
  end if;

  v_before := greatest(0, coalesce((v_target->>'before')::integer, 0));

  select consecutive_losses into v_old
    from public.lottery_pity_progress
   where user_id = p_user_id
   for update;
  if not found then v_old := 0; end if;

  insert into public.lottery_pity_progress (user_id, consecutive_losses, last_lottery_id, updated_at)
  values (p_user_id, v_before, null, now())
  on conflict (user_id) do update set
    consecutive_losses = excluded.consecutive_losses,
    updated_at = excluded.updated_at;

  if v_is_batch then
    update public.lottery_admin_audit_logs
       set detail = jsonb_set(
             detail,
             '{details}',
             (
               select coalesce(jsonb_agg(
                 case when d->>'user_id' = p_user_id::text
                      then d || jsonb_build_object('undone', true)
                      else d end
               ), '[]'::jsonb)
               from jsonb_array_elements(detail->'details') d
             )
           )
     where id = v_log_id;
  else
    update public.lottery_admin_audit_logs
       set detail = detail || jsonb_build_object('undone', true, 'undone_at', now())
     where id = v_log_id;
  end if;

  insert into public.lottery_admin_audit_logs (lottery_id, actor_id, action, detail)
  values (
    null,
    v_operator,
    'pity.undo',
    jsonb_build_object(
      'user_id', p_user_id,
      'undo_from_log_id', v_log_id,
      'undo_from_action', v_action,
      'before', v_old,
      'after', v_before,
      'reason', v_reason
    )
  );

  return jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'before', v_old,
    'after', v_before,
    'undo_from', v_action
  );
exception when others then
  if sqlstate = 'P0001' then raise; end if;
  return jsonb_build_object('ok', false, 'code', coalesce(sqlstate, 'ERROR'), 'message', sqlerrm);
end;
$$;
