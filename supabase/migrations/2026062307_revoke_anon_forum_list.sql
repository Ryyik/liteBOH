-- 撤销 anon 对 list_forum_posts 的执行权限
-- 注意：早期 7 参数迁移从未执行 revoke ... from public，因此 anon 通过 PUBLIC 继承权限，
-- 必须同时撤销 PUBLIC 的权限才能生效。
revoke execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text, text) from anon;
revoke execute on function public.list_forum_posts(integer, integer, text, uuid, boolean, text, text) from public;
