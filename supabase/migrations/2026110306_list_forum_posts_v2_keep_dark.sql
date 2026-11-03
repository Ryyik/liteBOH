-- ============================================================================
-- P4 收尾：把 list_forum_posts_v2 标注为「未接入的实验实现」，**不切换线上调用**
--
-- 为什么不切（2026-11-03 实测结论，与最初的预期相反）
--   1) 结果集等价性已证明：18→25 组参数 × 2 种身份（管理员 / 普通用户）共 50 组，
--      v1 与 v2 的输出 **逐字节一致**（含 search_rank、search_excerpt、has_more、
--      行序、images/replies 的 jsonb 字段顺序）。
--   2) 内层查询确实便宜了一半：
--        v1  exec 7.6 ms / plan 13.9 ms
--        v2  exec 3.6 ms / plan  6.6 ms
--      执行计划也验证了 lateral 只跑页内 10 行，而不是全表 158 行。
--   3) **但函数端到端没有差别**：
--        v1  min 15.3 / 中位 16.3 / max 17.3 ms
--        v2  min 14.9 / 中位 16.1 / max 17.4 ms
--      也就是说这 ~10 ms 是 plpgsql 解释 + 每次冷连接重规划 + 函数调用的固定开销，
--      把 lateral 省下来的那几毫秒盖过去了。
--
--   ⇒ 结论：在 158 条帖子这个量级上，重构主函数**换来的是零可测收益 + 一次高风险改动**。
--      真要说收益，是「帖子涨到几千条时不会退化成秒级」，但那是未来的事，
--      不该现在拿最热的 RPC 去赌。等 posts 行数或该 RPC 的 p95 明显上来再切。
--
-- 怎么切（届时一步到位）
--   create or replace function public.list_forum_posts(<同样的 9 个参数>) ... 用 v2 的函数体
--   drop function public.list_forum_posts_v2(<同样的 9 个参数>);
--   切换后请重跑 50 组等价性比对（脚本口径见本文件顶部注释）。
-- ============================================================================

comment on function public.list_forum_posts_v2(
  integer, integer, text, uuid, boolean, text, text, uuid[], text
) is
  'P4 实验实现（未接入任何调用）：把「候选集+排序+分页」提到 lateral 展开之前，'
  '内层查询执行/规划均为 v1 的一半，但 2026-11-03 实测端到端无差别（158 条帖子），'
  '因此保持 dark。切换前提：posts 行数显著增长，或 list_forum_posts 的 p95 明显上升。';

-- 「dark」要真的是 dark：`create function` 默认把 EXECUTE 授给 PUBLIC，而 Supabase 另有
-- `alter default privileges … grant execute on functions to anon, authenticated, service_role`
-- ⇒ 只 `revoke … from public` 收不干净（实测仍剩 2 个角色可调用）。必须逐个角色收回。
revoke all on function public.list_forum_posts_v2(
  integer, integer, text, uuid, boolean, text, text, uuid[], text
) from public, anon, authenticated, service_role;

-- 自证：除属主外无人可执行（应用角色一个都不行）
do $$
declare v_cnt int;
begin
  select count(*) into v_cnt
  from (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
  where has_function_privilege(
    r.role_name,
    'public.list_forum_posts_v2(integer,integer,text,uuid,boolean,text,text,uuid[],text)',
    'execute'
  );
  if v_cnt > 0 then
    raise exception '自证失败：仍有 % 个应用角色可以调用未接入的 v2', v_cnt;
  end if;
end $$;

