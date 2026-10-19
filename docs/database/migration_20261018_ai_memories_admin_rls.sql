-- =====================================================================
-- migration_20261018_ai_memories_admin_rls.sql
-- 数据管理面板新增「AI 沉淀记忆」tab 的 DB 侧配套（2026-10-18）
--
-- 背景：
--   BOHAI 对话的「自动记忆沉淀」写入 boh_ai_shared_memories（用户维度，
--   owner_user_id 归属聊天者本人）。此前该表没有任何管理员旁路策略 ——
--   管理员在数据管理面板里只能看到「自己拥有的 + 公开已审核」的行，
--   跨用户的沉淀内容完全不可见（面板 52 个 tab 也确实没有这张表）。
--
-- 本次只加两条策略（沿用 current_user_is_admin() 惯例，同
--   user_addresses / lottery_* / bohai_model_configs 等 admin 策略）：
--   1. SELECT  —— 管理员可读全部用户的沉淀（面板列表/搜索/计数）。
--   2. UPDATE  —— 管理员可归档/恢复（status: active <-> archived）。
--
-- 刻意**不给** DELETE / INSERT：
--   - DELETE：删用户的沉淀属于破坏性操作，先走「归档」；真要清库走 service_role。
--   - INSERT：管理员不应替用户伪造沉淀。
-- 用户既有权限（owner 自己增删改查）不受影响；anon 只读公开已审行的策略不变。
--
-- 回滚（如需）：
--   drop policy if exists boh_ai_shared_memories_admin_select on public.boh_ai_shared_memories;
--   drop policy if exists boh_ai_shared_memories_admin_update on public.boh_ai_shared_memories;
-- =====================================================================

create policy boh_ai_shared_memories_admin_select
  on public.boh_ai_shared_memories
  for select
  to authenticated
  using (current_user_is_admin());

create policy boh_ai_shared_memories_admin_update
  on public.boh_ai_shared_memories
  for update
  to authenticated
  using (current_user_is_admin())
  with check (current_user_is_admin());

-- 验证（应返回 4 行：原 5 条用户策略 + 新 2 条，其中 2 条 cmd 为 SELECT/UPDATE 且 roles 含 authenticated）
select tablename, policyname, cmd, roles
  from pg_policies
 where schemaname = 'public'
   and tablename = 'boh_ai_shared_memories'
 order by policyname;
