begin;

alter table public.profiles
  add column if not exists hide_online_status boolean not null default false;

notify pgrst, 'reload schema';

commit;
