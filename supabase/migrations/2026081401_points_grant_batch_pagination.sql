begin;

-- The grants console renders one card per issuance batch. Paginating raw
-- transactions splits large all-user grants across pages and gives the card an
-- incorrect recipient count, so page at the batch level instead.
create index if not exists idx_points_transactions_admin_grant_created
  on public.points_transactions (created_at desc, batch_id)
  where reason in ('admin_grant', 'admin_revoke');

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
      bool_or(t.reason = 'admin_revoke') as revoked,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', t.id,
            'user_id', t.user_id,
            'username', p.username,
            'balance_after', t.balance_after
          ) order by t.created_at asc
        ) filter (where t.reason = 'admin_grant'),
        '[]'::jsonb
      ) as grants
    from public.points_transactions t
    left join public.profiles p on p.id = t.user_id
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
    g.grants,
    count(*) over() as total_count
  from grouped g
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
