-- BOH AI 共享记忆库
-- 目标：
-- 1) 存储“记忆沉淀”后的共享知识；
-- 2) 支持全站 AI 检索；
-- 3) 可选同步到用户私有树洞。

begin;

create table if not exists public.boh_ai_shared_memories (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  mood text not null default '',
  tags jsonb not null default '[]'::jsonb,
  confidence numeric(5, 4) not null default 0,
  evidence jsonb not null default '[]'::jsonb,
  source text not null default 'capture' check (source in ('capture', 'manual')),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint boh_ai_shared_memories_content_len check (char_length(content) between 1 and 1200),
  constraint boh_ai_shared_memories_mood_len check (char_length(mood) <= 24),
  constraint boh_ai_shared_memories_tags_array check (jsonb_typeof(tags) = 'array'),
  constraint boh_ai_shared_memories_tags_size check (jsonb_array_length(tags) <= 20),
  constraint boh_ai_shared_memories_tags_text check (public.boh_treehole_tags_are_valid(tags)),
  constraint boh_ai_shared_memories_evidence_array check (jsonb_typeof(evidence) = 'array'),
  constraint boh_ai_shared_memories_evidence_size check (jsonb_array_length(evidence) <= 12),
  constraint boh_ai_shared_memories_confidence_range check (confidence >= 0 and confidence <= 1)
);

create index if not exists idx_boh_ai_shared_memories_status_updated
  on public.boh_ai_shared_memories (status, updated_at desc);

create index if not exists idx_boh_ai_shared_memories_owner_updated
  on public.boh_ai_shared_memories (owner_user_id, updated_at desc);

drop trigger if exists trg_boh_ai_shared_memories_updated_at on public.boh_ai_shared_memories;
create trigger trg_boh_ai_shared_memories_updated_at
before update on public.boh_ai_shared_memories
for each row
execute function public.touch_boh_treehole_updated_at();

alter table public.boh_ai_shared_memories enable row level security;

drop policy if exists boh_ai_shared_memories_select_active on public.boh_ai_shared_memories;
create policy boh_ai_shared_memories_select_active
  on public.boh_ai_shared_memories
  for select
  to anon, authenticated
  using (status = 'active');

drop policy if exists boh_ai_shared_memories_insert_own on public.boh_ai_shared_memories;
create policy boh_ai_shared_memories_insert_own
  on public.boh_ai_shared_memories
  for insert
  to authenticated
  with check (auth.uid() = owner_user_id);

drop policy if exists boh_ai_shared_memories_update_own on public.boh_ai_shared_memories;
create policy boh_ai_shared_memories_update_own
  on public.boh_ai_shared_memories
  for update
  to authenticated
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

drop policy if exists boh_ai_shared_memories_delete_own on public.boh_ai_shared_memories;
create policy boh_ai_shared_memories_delete_own
  on public.boh_ai_shared_memories
  for delete
  to authenticated
  using (auth.uid() = owner_user_id);

grant select on table public.boh_ai_shared_memories to anon;
grant select, insert, update, delete on table public.boh_ai_shared_memories to authenticated;
grant all on table public.boh_ai_shared_memories to service_role;

commit;
