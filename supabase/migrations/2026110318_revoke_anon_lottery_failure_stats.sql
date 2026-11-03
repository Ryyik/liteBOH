-- ============================================================================
-- 收口 `lottery_failure_stats` 的 anon 授权位
--
-- 背景（2026-11-03 外部审查 F5，核实后性质已修正）：
--   这张 view 的 anon SELECT 权限位**确实是 true**（Supabase 默认权限给
--   public schema 新建表/视图都 grant 给 anon/authenticated），所以当初
--   「匿名可读」的表述不算凭空来的。
--
--   但它的 `reloptions` 是 `security_invoker=true`，而 `2026110313` 已经把
--   `lottery_draw_logs`、`profiles` 的 anon 表级 SELECT 撤了 ⇒ 匿名查询会在
--   **基表**上直接 42501。也就是说：现在读不到，它不是一个活的间接出口。
--
-- 那为什么还要 revoke：
--   权限位留着就是一颗定时炸弹 —— 将来谁把基表重新授权给 anon（或新建一张
--   同名基表），这条出口会**自动复活**，而没有任何门禁会提醒。授权位应当
--   反映真实意图，而不是靠「碰巧有别的表挡着」。
--
-- 不动 authenticated：管理后台依赖它（`src/views/DataManagement` 里有引用）。
-- ============================================================================

revoke all on public.lottery_failure_stats from anon;

-- 自证：撤完必须查不到 anon 的 SELECT
do $do$
begin
  if has_table_privilege('anon', 'public.lottery_failure_stats', 'SELECT') then
    raise exception 'lottery_failure_stats 的 anon SELECT 仍然存在，revoke 未生效';
  end if;
end
$do$;
