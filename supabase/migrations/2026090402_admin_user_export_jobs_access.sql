begin;

grant select on table public.user_data_export_jobs to authenticated;

drop policy if exists user_data_export_jobs_admin_select on public.user_data_export_jobs;
create policy user_data_export_jobs_admin_select on public.user_data_export_jobs
  for select to authenticated
  using (public.current_user_is_admin());

commit;
