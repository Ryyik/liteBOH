-- 撤销 anon 对 list_forum_posts 的执行权限
-- 注意：早期 7 参数迁移从未执行 revoke ... from public，因此 anon 通过 PUBLIC 继承权限，
-- 必须同时撤销 PUBLIC 的权限才能生效。
revoke execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text, text) from anon;
revoke execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text, text) from public;
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on p.pronamespace = n.oid where n.nspname = 'public' and p.proname = 'list_forum_posts' and p.pronargs = 8) then
    revoke execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text, text, uuid[]) from anon;
    revoke execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text, text, uuid[]) from public;
  end if;
end $$;
