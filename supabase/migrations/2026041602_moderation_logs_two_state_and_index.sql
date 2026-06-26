-- 统一审核日志状态：仅保留 approved / rejected 两态，并增强查询索引

begin;

create table if not exists public.moderation_logs (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null,
  target_type text not null,
  ai_result text,
  ai_reason text,
  moderator_id uuid,
  created_at timestamptz default now(),
  constraint moderation_logs_moderator_id_fkey foreign key (moderator_id) references public.profiles (id)
);

update public.moderation_logs
set ai_result = 'approved'
where ai_result is null
   or lower(trim(ai_result)) in ('approved', 'pass', 'allow', 'ok');

update public.moderation_logs
set ai_result = 'rejected'
where lower(trim(coalesce(ai_result, ''))) in (
  'rejected',
  'reject',
  'blocked',
  'block',
  'needs_review',
  'pending',
  'review'
);

update public.moderation_logs
set ai_result = 'approved'
where lower(trim(coalesce(ai_result, ''))) not in ('approved', 'rejected');

do $$
declare
  rec record;
begin
  for rec in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.moderation_logs'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%ai_result%'
  loop
    execute format('alter table public.moderation_logs drop constraint %I', rec.conname);
  end loop;
end;
$$;

alter table public.moderation_logs
  alter column ai_result set default 'approved',
  alter column ai_result set not null;

alter table public.moderation_logs
  add constraint moderation_logs_ai_result_check
  check (ai_result in ('approved', 'rejected'));

create index if not exists idx_moderation_logs_target_type_target_id_created
  on public.moderation_logs (target_type, target_id, created_at desc);

commit;
