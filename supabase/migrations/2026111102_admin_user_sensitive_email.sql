-- =====================================================================
-- 用户列表敏感信息补全：返回 email + 按 id 精确取（2026-11-11 P1-1 / P1-4）
-- 详见 docs/2026-11-11-数据管理面板功能可行性全量审查.md §4
-- =====================================================================
--
-- 两个线上实测事实：
--
--   ① 用户管理的「邮箱」列永远是空的
--      前端 `row.email = s.email`，但本函数返回的 jsonb 只有
--      id / username / shipping_*，**根本没有 email 键**；
--      `public.profiles` 也没有 email 列（邮箱在 auth.users）。
--      于是列头有、格子空，还看不出是「没取到」还是「本来就没有」。
--
--   ② 「最多 500 行」是个假上限
--      前端每次固定 `p_limit: 500` 拉全量再按 id 查表合并当前页。
--      用户数 > 500 时，当前页里排在 500 名之后的人静默丢失 email/收货信息
--      （不报错、不提示，就是空着）。
--      ⇒ 正确做法是把**当前页的 id** 传上来，精确取这几个人，
--        与总用户数无关。p_ids 为空时才退回原来的搜索语义。
--
-- 安全边界不变：
--   · security definer + 函数内 current_user_is_admin() 校验
--   · 仍然只返回 id / username / email / 收货三件套
--   · email 来自 auth.users（auth schema 属主是 supabase_admin，函数属主 postgres
--     可读；只用 left join，取不到就是 null，不会因为缺少 auth 行而漏人）
-- =====================================================================

begin;

-- 旧的两参版本必须先删：加了 p_ids 之后会与它构成重载，
-- PostgREST 按命名参数调用时无法确定选哪个。
drop function if exists public.admin_list_users_with_sensitive(text, integer);

create or replace function public.admin_list_users_with_sensitive(
  p_search text default null,
  p_limit integer default 200,
  p_ids uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_search text;
begin
  if not public.current_user_is_admin() then
    raise exception 'forbidden: 仅管理员可执行此操作';
  end if;

  v_search := nullif(trim(coalesce(p_search, '')), '');
  p_limit := least(greatest(coalesce(p_limit, 200), 1), 2000);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'username', p.username,
      'email', u.email,
      'shipping_recipient', p.shipping_recipient,
      'shipping_phone', p.shipping_phone,
      'shipping_address', p.shipping_address
    ) order by p.username)
    from public.profiles p
    left join auth.users u on u.id = p.id
    where
      /* 当前页精确取：与总人数无关，彻底摆脱 500 行上限 */
      (p_ids is not null and p.id = any (p_ids))
      or (
        p_ids is null
        and (
          v_search is null
          or p.username ilike '%' || v_search || '%'
          or u.email ilike '%' || v_search || '%'
          or p.shipping_recipient ilike '%' || v_search || '%'
          or p.shipping_phone ilike '%' || v_search || '%'
          or (p.id)::text = v_search
        )
      )
    limit p_limit
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.admin_list_users_with_sensitive(text, integer, uuid[])
  from anon, authenticated, public;
grant execute on function public.admin_list_users_with_sensitive(text, integer, uuid[])
  to authenticated;

comment on function public.admin_list_users_with_sensitive(text, integer, uuid[]) is
  '管理员批量取用户敏感展示列（email + 收货三件套）。传 p_ids 时按 id 精确取（面板当前页用这条路径），'
  '不传时按 p_search 模糊搜索。email 来自 auth.users —— profiles 没有该列。';

notify pgrst, 'reload schema';

commit;

-- ---------------------------------------------------------------------
-- 回归验证（管理员 JWT）
--   select public.admin_list_users_with_sensitive(null, 500, array['<uid>']::uuid[]);
--     → 单个元素数组，元素含非空 email
--   select public.admin_list_users_with_sensitive('@qq.com', 50, null);
--     → 按邮箱搜索命中
-- 负向：普通用户调用 → forbidden: 仅管理员可执行此操作
-- ---------------------------------------------------------------------
