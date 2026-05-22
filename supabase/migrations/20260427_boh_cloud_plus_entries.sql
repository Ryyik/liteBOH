begin;

create table if not exists public.boh_cloud_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_date date not null default timezone('Asia/Shanghai', now())::date,
  legacy_note_date date,
  title text not null default '',
  entry_type text not null default 'text' check (entry_type in ('text', 'image', 'mixed')),
  content_text text not null default '',
  content_blocks jsonb not null default '[]'::jsonb,
  cover_image_url text not null default '',
  mood text not null default '',
  source text not null default 'manual' check (source in ('manual', 'ai', 'migrated')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint boh_cloud_entries_title_len check (char_length(title) <= 120),
  constraint boh_cloud_entries_text_len check (char_length(content_text) <= 40000),
  constraint boh_cloud_entries_mood_len check (char_length(mood) <= 24),
  constraint boh_cloud_entries_cover_len check (char_length(cover_image_url) <= 2048),
  constraint boh_cloud_entries_blocks_is_array check (jsonb_typeof(content_blocks) = 'array')
);

create index if not exists idx_boh_cloud_entries_user_updated
  on public.boh_cloud_entries (user_id, updated_at desc);

create index if not exists idx_boh_cloud_entries_user_entry_date
  on public.boh_cloud_entries (user_id, entry_date desc, created_at desc);

create index if not exists idx_boh_cloud_entries_user_type
  on public.boh_cloud_entries (user_id, entry_type, updated_at desc);

create unique index if not exists uniq_boh_cloud_entries_legacy_note
  on public.boh_cloud_entries (user_id, legacy_note_date);

create or replace function public.touch_boh_cloud_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_boh_cloud_entries_updated_at on public.boh_cloud_entries;
create trigger trg_boh_cloud_entries_updated_at
before update on public.boh_cloud_entries
for each row
execute function public.touch_boh_cloud_updated_at();

alter table public.boh_cloud_entries enable row level security;

drop policy if exists boh_cloud_entries_select_own on public.boh_cloud_entries;
create policy boh_cloud_entries_select_own
  on public.boh_cloud_entries
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists boh_cloud_entries_insert_own on public.boh_cloud_entries;
create policy boh_cloud_entries_insert_own
  on public.boh_cloud_entries
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists boh_cloud_entries_update_own on public.boh_cloud_entries;
create policy boh_cloud_entries_update_own
  on public.boh_cloud_entries
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists boh_cloud_entries_delete_own on public.boh_cloud_entries;
create policy boh_cloud_entries_delete_own
  on public.boh_cloud_entries
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.boh_cloud_entries to authenticated;
grant all on table public.boh_cloud_entries to service_role;

do $$
begin
  if to_regclass('public.boh_note_entries') is not null then
    insert into public.boh_cloud_entries (
      user_id,
      entry_date,
      legacy_note_date,
      title,
      entry_type,
      content_text,
      content_blocks,
      cover_image_url,
      mood,
      source,
      created_at,
      updated_at
    )
    select
      n.user_id,
      n.note_date,
      n.note_date,
      ''::text as title,
      case
        when position('![' in coalesce(n.content, '')) > 0 and char_length(regexp_replace(coalesce(n.content, ''), '!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)', '', 'g')) > 0 then 'mixed'
        when position('![' in coalesce(n.content, '')) > 0 then 'image'
        else 'text'
      end as entry_type,
      coalesce(n.content, '') as content_text,
      '[]'::jsonb as content_blocks,
      ''::text as cover_image_url,
      coalesce(n.mood, '') as mood,
      coalesce(n.source, 'migrated') as source,
      coalesce(n.created_at, now()) as created_at,
      coalesce(n.updated_at, now()) as updated_at
    from public.boh_note_entries n
    where coalesce(n.content, '') <> ''
    on conflict (user_id, legacy_note_date) do update
      set content_text = excluded.content_text,
          mood = excluded.mood,
          source = excluded.source,
          updated_at = greatest(public.boh_cloud_entries.updated_at, excluded.updated_at);
  end if;
end $$;

comment on table public.boh_cloud_entries is 'BOH Cloud+ 私人内容相册流，支持文字、图片与图文混合条目。';
comment on column public.boh_cloud_entries.content_blocks is '结构化内容块数组，前端用于混排渲染。';
comment on column public.boh_cloud_entries.legacy_note_date is '旧 BOH Note 按天日记迁移标识，用于防重。';

commit;
