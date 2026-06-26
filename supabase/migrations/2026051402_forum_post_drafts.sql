-- Store one forum post draft per user. The user_id primary key enforces the
-- "one user, one draft" rule, while RLS keeps drafts private to their owner.

begin;

create table if not exists public.forum_post_drafts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  title text not null default '',
  content text not null default '',
  tag text not null default 'daily'
    check (tag in ('server', 'activity', 'daily', 'question')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint forum_post_drafts_has_content
    check (length(trim(title)) > 0 or length(trim(content)) > 0)
);

create index if not exists idx_forum_post_drafts_updated_at
  on public.forum_post_drafts (updated_at desc);

alter table public.forum_post_drafts enable row level security;

drop policy if exists forum_post_drafts_select_own on public.forum_post_drafts;
create policy forum_post_drafts_select_own
  on public.forum_post_drafts
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists forum_post_drafts_insert_own on public.forum_post_drafts;
create policy forum_post_drafts_insert_own
  on public.forum_post_drafts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists forum_post_drafts_update_own on public.forum_post_drafts;
create policy forum_post_drafts_update_own
  on public.forum_post_drafts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists forum_post_drafts_delete_own on public.forum_post_drafts;
create policy forum_post_drafts_delete_own
  on public.forum_post_drafts
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.forum_post_drafts to authenticated;

commit;
