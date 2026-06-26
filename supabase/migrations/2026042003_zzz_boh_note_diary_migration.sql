-- BOH Note（日记模式）迁移
-- 目标：
-- 1) 新增按“用户 + 日期”唯一的一日一记表：boh_note_entries
-- 2) 把历史 boh_treehole_memories 安全迁移为按天聚合的 Note 内容
-- 3) 保留旧树洞表（只做弃用标记），避免一次性删表导致不可逆风险

begin;

create table if not exists public.boh_note_entries (
  user_id uuid not null references public.profiles(id) on delete cascade,
  note_date date not null,
  content text not null default '',
  source text not null default 'manual' check (source in ('manual', 'ai', 'migrated')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint boh_note_entries_pkey primary key (user_id, note_date),
  constraint boh_note_entries_content_len check (char_length(content) between 1 and 40000)
);

create index if not exists idx_boh_note_entries_user_updated
  on public.boh_note_entries (user_id, updated_at desc);

create index if not exists idx_boh_note_entries_user_date_desc
  on public.boh_note_entries (user_id, note_date desc);

create or replace function public.touch_boh_note_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_boh_note_entries_updated_at on public.boh_note_entries;
create trigger trg_boh_note_entries_updated_at
before update on public.boh_note_entries
for each row
execute function public.touch_boh_note_updated_at();

alter table public.boh_note_entries enable row level security;

drop policy if exists boh_note_entries_select_own on public.boh_note_entries;
create policy boh_note_entries_select_own
  on public.boh_note_entries
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists boh_note_entries_insert_own on public.boh_note_entries;
create policy boh_note_entries_insert_own
  on public.boh_note_entries
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists boh_note_entries_update_own on public.boh_note_entries;
create policy boh_note_entries_update_own
  on public.boh_note_entries
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists boh_note_entries_delete_own on public.boh_note_entries;
create policy boh_note_entries_delete_own
  on public.boh_note_entries
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.boh_note_entries to authenticated;
grant all on table public.boh_note_entries to service_role;

do $$
begin
  if to_regclass('public.boh_treehole_memories') is not null then
    insert into public.boh_note_entries (
      user_id,
      note_date,
      content,
      source,
      created_at,
      updated_at
    )
    select
      m.user_id,
      timezone('Asia/Shanghai', coalesce(m.updated_at, m.created_at))::date as note_date,
      string_agg(
        format(
          '[%s] %s',
          to_char(timezone('Asia/Shanghai', coalesce(m.updated_at, m.created_at)), 'HH24:MI'),
          regexp_replace(coalesce(m.content, ''), E'[\\r\\n]+', ' ', 'g')
        ),
        E'\n' order by coalesce(m.updated_at, m.created_at) asc, m.id
      ) as content,
      'migrated'::text as source,
      min(coalesce(m.created_at, m.updated_at, now())) as created_at,
      max(coalesce(m.updated_at, m.created_at, now())) as updated_at
    from public.boh_treehole_memories m
    where coalesce(m.content, '') <> ''
    group by
      m.user_id,
      timezone('Asia/Shanghai', coalesce(m.updated_at, m.created_at))::date
    on conflict (user_id, note_date) do update
      set content = case
          when char_length(coalesce(public.boh_note_entries.content, '')) = 0 then excluded.content
          when position(excluded.content in public.boh_note_entries.content) > 0 then public.boh_note_entries.content
          else public.boh_note_entries.content || E'\n\n' || excluded.content
        end,
        updated_at = greatest(public.boh_note_entries.updated_at, excluded.updated_at),
        source = case
          when public.boh_note_entries.source = 'manual' then public.boh_note_entries.source
          else 'migrated'
        end;
  end if;
end $$;

comment on table public.boh_note_entries is 'BOH Note 日记（按用户+日期唯一），替代 BOH 树洞方案。';

do $$
begin
  if to_regclass('public.boh_treehole_spaces') is not null then
    comment on table public.boh_treehole_spaces is 'DEPRECATED: 已由 BOH Note 方案替代，暂保留以便安全回滚。';
  end if;
  if to_regclass('public.boh_treehole_memories') is not null then
    comment on table public.boh_treehole_memories is 'DEPRECATED: 已迁移至 public.boh_note_entries，暂保留以便安全回滚。';
  end if;
end $$;

commit;
