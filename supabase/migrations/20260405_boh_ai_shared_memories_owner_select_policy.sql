-- 允许登录用户读取自己的全部共享记忆（含 archived），匿名仍仅可读 active

begin;

drop policy if exists boh_ai_shared_memories_select_active on public.boh_ai_shared_memories;
drop policy if exists boh_ai_shared_memories_select_active_or_own on public.boh_ai_shared_memories;

create policy boh_ai_shared_memories_select_active
  on public.boh_ai_shared_memories
  for select
  to anon
  using (status = 'active');

create policy boh_ai_shared_memories_select_active_or_own
  on public.boh_ai_shared_memories
  for select
  to authenticated
  using (status = 'active' or auth.uid() = owner_user_id);

commit;
