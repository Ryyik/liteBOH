-- 统一内容审核：补齐公开记忆与用户印象的审核字段（兼容旧版）
-- 目标：
-- 1) 所有公开内容统一为 approved / rejected 两态；
-- 2) 树洞私密内容不纳入公开审核；
-- 3) 保持旧客户端兼容（默认 approved）。

begin;

-- ==================== user_impressions ====================
alter table public.user_impressions
  add column if not exists moderation_status text not null default 'approved',
  add column if not exists moderation_reason text null;

update public.user_impressions
set moderation_status = 'approved'
where moderation_status is null
   or lower(trim(moderation_status)) not in ('approved', 'rejected');

alter table public.user_impressions
  drop constraint if exists user_impressions_moderation_status_check;

alter table public.user_impressions
  add constraint user_impressions_moderation_status_check
  check (moderation_status in ('approved', 'rejected'));

create index if not exists idx_user_impressions_target_moderation_created
  on public.user_impressions (target_id, moderation_status, created_at desc);

-- ==================== boh_ai_shared_memories ====================
alter table public.boh_ai_shared_memories
  add column if not exists moderation_status text not null default 'approved',
  add column if not exists moderation_reason text null;

update public.boh_ai_shared_memories
set moderation_status = 'approved'
where moderation_status is null
   or lower(trim(moderation_status)) not in ('approved', 'rejected');

alter table public.boh_ai_shared_memories
  drop constraint if exists boh_ai_shared_memories_moderation_status_check;

alter table public.boh_ai_shared_memories
  add constraint boh_ai_shared_memories_moderation_status_check
  check (moderation_status in ('approved', 'rejected'));

create index if not exists idx_boh_ai_shared_memories_status_moderation_updated
  on public.boh_ai_shared_memories (status, moderation_status, updated_at desc);

-- 公开查询口只允许 active + approved，owner 仍可看自己的全部记录
drop policy if exists boh_ai_shared_memories_select_active on public.boh_ai_shared_memories;
drop policy if exists boh_ai_shared_memories_select_active_or_own on public.boh_ai_shared_memories;

create policy boh_ai_shared_memories_select_active
  on public.boh_ai_shared_memories
  for select
  to anon
  using (status = 'active' and moderation_status = 'approved');

create policy boh_ai_shared_memories_select_active_or_own
  on public.boh_ai_shared_memories
  for select
  to authenticated
  using ((status = 'active' and moderation_status = 'approved') or auth.uid() = owner_user_id);

commit;

