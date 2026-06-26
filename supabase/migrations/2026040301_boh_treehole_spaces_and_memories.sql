-- BOH 树洞：每位用户仅允许一个记忆空间 + 私有记忆存储
-- 目标：
-- 1) 空间层：每位用户仅一个空间（user_id 主键）；
-- 2) 记忆层：支持新增、编辑、删除、星标、标签、来源（手动/AI）；
-- 3) 隐私层：RLS 保证“只有本人可读写”。

begin;

create or replace function public.boh_treehole_tags_are_valid(p_tags jsonb)
returns boolean
language sql
immutable
as $$
  select
    p_tags is not null
    and jsonb_typeof(p_tags) = 'array'
    and jsonb_array_length(p_tags) <= 20
    and not exists (
      select 1
      from jsonb_array_elements(p_tags) as e(v)
      where jsonb_typeof(e.v) <> 'string'
    )
    and not exists (
      select 1
      from jsonb_array_elements_text(p_tags) as t(v)
      where char_length(t.v) > 20
    );
$$;

create table if not exists public.boh_treehole_spaces (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  title text not null default '我的 BOH 树洞',
  description text not null default '',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint boh_treehole_spaces_title_len check (char_length(title) between 1 and 60),
  constraint boh_treehole_spaces_description_len check (char_length(description) <= 280)
);

create table if not exists public.boh_treehole_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.boh_treehole_spaces (user_id) on delete cascade,
  content text not null,
  mood text not null default '',
  tags jsonb not null default '[]'::jsonb,
  is_starred boolean not null default false,
  source text not null default 'manual' check (source in ('manual', 'ai')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint boh_treehole_memories_content_len check (char_length(content) between 1 and 12000),
  constraint boh_treehole_memories_mood_len check (char_length(mood) <= 24),
  constraint boh_treehole_memories_tags_array check (jsonb_typeof(tags) = 'array'),
  constraint boh_treehole_memories_tags_size check (jsonb_array_length(tags) <= 20),
  constraint boh_treehole_memories_tags_text check (public.boh_treehole_tags_are_valid(tags))
);

create index if not exists idx_boh_treehole_memories_user_created
  on public.boh_treehole_memories (user_id, created_at desc);

create index if not exists idx_boh_treehole_memories_user_updated
  on public.boh_treehole_memories (user_id, updated_at desc);

create index if not exists idx_boh_treehole_memories_user_starred_updated
  on public.boh_treehole_memories (user_id, is_starred, updated_at desc);

create or replace function public.touch_boh_treehole_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_boh_treehole_spaces_updated_at on public.boh_treehole_spaces;
create trigger trg_boh_treehole_spaces_updated_at
before update on public.boh_treehole_spaces
for each row
execute function public.touch_boh_treehole_updated_at();

drop trigger if exists trg_boh_treehole_memories_updated_at on public.boh_treehole_memories;
create trigger trg_boh_treehole_memories_updated_at
before update on public.boh_treehole_memories
for each row
execute function public.touch_boh_treehole_updated_at();

create or replace function public.bump_boh_treehole_space_updated_at()
returns trigger
language plpgsql
as $$
declare
  v_user_id uuid;
begin
  v_user_id := coalesce(new.user_id, old.user_id);
  if v_user_id is not null then
    update public.boh_treehole_spaces
       set updated_at = now()
     where user_id = v_user_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_boh_treehole_memories_space_touch on public.boh_treehole_memories;
create trigger trg_boh_treehole_memories_space_touch
after insert or update or delete on public.boh_treehole_memories
for each row
execute function public.bump_boh_treehole_space_updated_at();

alter table public.boh_treehole_spaces enable row level security;
alter table public.boh_treehole_memories enable row level security;

drop policy if exists boh_treehole_spaces_select_own on public.boh_treehole_spaces;
create policy boh_treehole_spaces_select_own
  on public.boh_treehole_spaces
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists boh_treehole_spaces_insert_own on public.boh_treehole_spaces;
create policy boh_treehole_spaces_insert_own
  on public.boh_treehole_spaces
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists boh_treehole_spaces_update_own on public.boh_treehole_spaces;
create policy boh_treehole_spaces_update_own
  on public.boh_treehole_spaces
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists boh_treehole_spaces_delete_own on public.boh_treehole_spaces;
create policy boh_treehole_spaces_delete_own
  on public.boh_treehole_spaces
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists boh_treehole_memories_select_own on public.boh_treehole_memories;
create policy boh_treehole_memories_select_own
  on public.boh_treehole_memories
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists boh_treehole_memories_insert_own on public.boh_treehole_memories;
create policy boh_treehole_memories_insert_own
  on public.boh_treehole_memories
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists boh_treehole_memories_update_own on public.boh_treehole_memories;
create policy boh_treehole_memories_update_own
  on public.boh_treehole_memories
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists boh_treehole_memories_delete_own on public.boh_treehole_memories;
create policy boh_treehole_memories_delete_own
  on public.boh_treehole_memories
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.boh_treehole_spaces to authenticated;
grant select, insert, update, delete on table public.boh_treehole_memories to authenticated;
grant all on table public.boh_treehole_spaces to service_role;
grant all on table public.boh_treehole_memories to service_role;

commit;
