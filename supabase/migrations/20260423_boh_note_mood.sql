begin;

alter table if exists public.boh_note_entries
  add column if not exists mood text not null default '';

do $$
begin
  if to_regclass('public.boh_note_entries') is not null
    and not exists (
      select 1
      from pg_constraint
      where conname = 'boh_note_entries_mood_len'
        and conrelid = 'public.boh_note_entries'::regclass
    ) then
    alter table public.boh_note_entries
      add constraint boh_note_entries_mood_len check (char_length(mood) <= 24);
  end if;
end $$;

do $$
begin
  if to_regclass('public.boh_note_entries') is not null
    and to_regclass('public.boh_treehole_memories') is not null then
    update public.boh_note_entries as n
    set mood = src.mood
    from (
      select distinct on (m.user_id, timezone('Asia/Shanghai', coalesce(m.updated_at, m.created_at))::date)
        m.user_id,
        timezone('Asia/Shanghai', coalesce(m.updated_at, m.created_at))::date as note_date,
        left(btrim(coalesce(m.mood, '')), 24) as mood
      from public.boh_treehole_memories as m
      where btrim(coalesce(m.mood, '')) <> ''
      order by
        m.user_id,
        timezone('Asia/Shanghai', coalesce(m.updated_at, m.created_at))::date,
        coalesce(m.updated_at, m.created_at) desc,
        m.id desc
    ) as src
    where n.user_id = src.user_id
      and n.note_date = src.note_date
      and btrim(coalesce(n.mood, '')) = '';
  end if;
end $$;

comment on column public.boh_note_entries.mood is 'BOH Note 当日心情标签，可空字符串。';

commit;
