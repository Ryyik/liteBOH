-- BOH AI 自动记忆候选池（防瞎编版）
-- 目标：
-- 1) 记录 AI 从对话提取出的“记忆候选”与证据链；
-- 2) 支持 pending / auto_saved / rejected 状态；
-- 3) 通过 RLS 保证“仅本人可读写”。

begin;

create table if not exists public.boh_treehole_memory_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.boh_treehole_spaces (user_id) on delete cascade,
  content text not null,
  mood text not null default '',
  tags jsonb not null default '[]'::jsonb,
  confidence numeric(5, 4) not null default 0,
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'auto_saved', 'rejected')),
  session_id text not null default '',
  reason text not null default '',
  model text not null default '',
  memory_id uuid references public.boh_treehole_memories (id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint boh_treehole_memory_candidates_content_len check (char_length(content) between 1 and 1200),
  constraint boh_treehole_memory_candidates_mood_len check (char_length(mood) <= 24),
  constraint boh_treehole_memory_candidates_tags_array check (jsonb_typeof(tags) = 'array'),
  constraint boh_treehole_memory_candidates_tags_size check (jsonb_array_length(tags) <= 20),
  constraint boh_treehole_memory_candidates_tags_text check (public.boh_treehole_tags_are_valid(tags)),
  constraint boh_treehole_memory_candidates_evidence_array check (jsonb_typeof(evidence) = 'array'),
  constraint boh_treehole_memory_candidates_evidence_size check (jsonb_array_length(evidence) <= 12),
  constraint boh_treehole_memory_candidates_confidence_range check (confidence >= 0 and confidence <= 1),
  constraint boh_treehole_memory_candidates_session_len check (char_length(session_id) <= 120),
  constraint boh_treehole_memory_candidates_reason_len check (char_length(reason) <= 240),
  constraint boh_treehole_memory_candidates_model_len check (char_length(model) <= 120)
);

create index if not exists idx_boh_treehole_memory_candidates_user_status_updated
  on public.boh_treehole_memory_candidates (user_id, status, updated_at desc);

create index if not exists idx_boh_treehole_memory_candidates_user_created
  on public.boh_treehole_memory_candidates (user_id, created_at desc);

drop trigger if exists trg_boh_treehole_memory_candidates_updated_at on public.boh_treehole_memory_candidates;
create trigger trg_boh_treehole_memory_candidates_updated_at
before update on public.boh_treehole_memory_candidates
for each row
execute function public.touch_boh_treehole_updated_at();

drop trigger if exists trg_boh_treehole_memory_candidates_space_touch on public.boh_treehole_memory_candidates;
create trigger trg_boh_treehole_memory_candidates_space_touch
after insert or update or delete on public.boh_treehole_memory_candidates
for each row
execute function public.bump_boh_treehole_space_updated_at();

alter table public.boh_treehole_memory_candidates enable row level security;

drop policy if exists boh_treehole_memory_candidates_select_own on public.boh_treehole_memory_candidates;
create policy boh_treehole_memory_candidates_select_own
  on public.boh_treehole_memory_candidates
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists boh_treehole_memory_candidates_insert_own on public.boh_treehole_memory_candidates;
create policy boh_treehole_memory_candidates_insert_own
  on public.boh_treehole_memory_candidates
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists boh_treehole_memory_candidates_update_own on public.boh_treehole_memory_candidates;
create policy boh_treehole_memory_candidates_update_own
  on public.boh_treehole_memory_candidates
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists boh_treehole_memory_candidates_delete_own on public.boh_treehole_memory_candidates;
create policy boh_treehole_memory_candidates_delete_own
  on public.boh_treehole_memory_candidates
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.boh_treehole_memory_candidates to authenticated;
grant all on table public.boh_treehole_memory_candidates to service_role;

commit;
