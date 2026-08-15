-- ============================================================================
-- 2026081504: 运维与分页完整性补丁
--   1. forum_post_submissions 幂等记录保留清理（默认 30 天，含完整帖子 JSON，需防止无限膨胀）
--   2. admin_list_point_grant_batches 明细聚合加上界（前 200 条），
--      防止全员大批量发放时单行 JSON 过大（grant_count 仍为全量汇总）
-- ============================================================================

begin;

-- ============================================
-- 1. forum_post_submissions 幂等记录清理
-- ============================================

create or replace function public.cleanup_forum_post_submissions(p_retention_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  if auth.uid() is not null then
    raise exception '幂等记录清理仅限服务端定时任务调用' using errcode = '42501';
  end if;

  if p_retention_days is null or p_retention_days < 1 then
    p_retention_days := 30;
  end if;

  delete from public.forum_post_submissions
   where created_at < now() - (p_retention_days || ' days')::interval;

  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'ok', true,
    'deleted', v_deleted,
    'retention_days', p_retention_days
  );
end;
$$;

revoke all on function public.cleanup_forum_post_submissions(integer) from public;
grant execute on function public.cleanup_forum_post_submissions(integer) to service_role;

do $cron$
declare
  v_has_pg_cron boolean := false;
begin
  select exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) into v_has_pg_cron;

  if not v_has_pg_cron then
    raise notice 'pg_cron 未启用，已跳过论坛幂等记录清理任务。';
    return;
  end if;

  begin
    perform cron.unschedule(jobid)
      from cron.job
     where jobname = 'cleanup_forum_post_submissions_daily';
  exception when undefined_table or undefined_function or invalid_schema_name then
    null;
  end;

  perform cron.schedule(
    'cleanup_forum_post_submissions_daily',
    '40 3 * * *',
    $cmd$select public.cleanup_forum_post_submissions(30);$cmd$
  );
exception when others then
  raise notice '创建论坛幂等记录清理任务失败：%', coalesce(sqlerrm, 'UNKNOWN_ERROR');
end;
$cron$;

-- ============================================
-- 2. admin_list_point_grant_batches 明细聚合上界
--    grants 数组最多返回前 200 条明细；grant_count 仍为该批次全量人数，
--    前端依据 grant_count > grants.length 展示"仅显示前 N 条"提示。
-- ============================================

create or replace function public.admin_list_point_grant_batches(
  p_page integer default 1,
  p_page_size integer default 20
)
returns table (
  batch_id uuid,
  batch_key text,
  amount integer,
  remark text,
  created_at timestamp with time zone,
  grant_count bigint,
  revoked boolean,
  grants jsonb,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 50);
begin
  if not public.current_user_is_admin() then
    raise exception '仅管理员可查看积分发放记录';
  end if;

  return query
  with grouped as (
    select
      t.batch_id,
      coalesce(t.batch_id::text, t.id::text) as batch_key,
      max(t.amount) filter (where t.reason = 'admin_grant')::integer as amount,
      max(t.remark) filter (where t.reason = 'admin_grant') as remark,
      min(t.created_at) filter (where t.reason = 'admin_grant') as created_at,
      count(*) filter (where t.reason = 'admin_grant') as grant_count,
      bool_or(t.reason = 'admin_revoke') as revoked
    from public.points_transactions t
    where t.reason in ('admin_grant', 'admin_revoke')
    group by t.batch_id, coalesce(t.batch_id::text, t.id::text)
  )
  select
    g.batch_id,
    g.batch_key,
    g.amount,
    coalesce(g.remark, ''),
    g.created_at,
    g.grant_count,
    g.revoked,
    coalesce(d.grants, '[]'::jsonb),
    count(*) over() as total_count
  from grouped g
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', member.id,
        'user_id', member.user_id,
        'username', p.username,
        'balance_after', member.balance_after
      ) order by member.created_at asc
    ) as grants
    from (
      select t2.id, t2.user_id, t2.balance_after, t2.created_at
        from public.points_transactions t2
       where t2.reason = 'admin_grant'
         and (
           (g.batch_id is not null and t2.batch_id = g.batch_id)
           or (g.batch_id is null and t2.id::text = g.batch_key)
         )
       order by t2.created_at asc
       limit 200
    ) member
    left join public.profiles p on p.id = member.user_id
  ) d on true
  order by g.created_at desc nulls last, g.batch_key desc
  offset (v_page - 1) * v_page_size
  limit v_page_size;
end;
$$;

revoke all on function public.admin_list_point_grant_batches(integer, integer) from public;
grant execute on function public.admin_list_point_grant_batches(integer, integer) to authenticated;
grant execute on function public.admin_list_point_grant_batches(integer, integer) to service_role;

notify pgrst, 'reload schema';

commit;
