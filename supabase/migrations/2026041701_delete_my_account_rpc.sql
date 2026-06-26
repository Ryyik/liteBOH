-- 自助注销账号 RPC
-- 前端需先做二级确认与密码校验，然后调用本函数删除当前登录用户。

begin;

create or replace function public.delete_my_account(p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_profile_rows integer := 0;
  v_auth_rows integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', '未登录，无法注销账号');
  end if;

  -- 先删除 profiles，便于依赖 profiles 的业务表通过 on delete cascade 自动清理。
  delete from public.profiles
  where id = v_user_id;
  get diagnostics v_profile_rows = row_count;

  delete from auth.users
  where id = v_user_id;
  get diagnostics v_auth_rows = row_count;

  if v_auth_rows = 0 then
    return jsonb_build_object('ok', false, 'code', 'AUTH_USER_NOT_FOUND', 'message', '未找到当前认证用户，注销失败');
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'ACCOUNT_DELETED',
    'message', '账号已注销',
    'user_id', v_user_id,
    'profile_deleted', v_profile_rows > 0,
    'reason', v_reason
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'code', coalesce(sqlstate, 'ACCOUNT_DELETE_FAILED'),
      'message', coalesce(sqlerrm, '注销失败，请稍后重试')
    );
end;
$$;

revoke all on function public.delete_my_account(text) from public;
grant execute on function public.delete_my_account(text) to authenticated;
grant execute on function public.delete_my_account(text) to service_role;

commit;
