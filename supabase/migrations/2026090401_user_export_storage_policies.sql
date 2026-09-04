begin;

-- Export files are addressed as <auth.uid()>/<job-id>.zip. The Edge Function
-- uses the caller's JWT for Storage so this also works with sb_secret keys.
drop policy if exists user_exports_owner_insert on storage.objects;
create policy user_exports_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'user-exports' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists user_exports_owner_select on storage.objects;
create policy user_exports_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'user-exports' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists user_exports_owner_update on storage.objects;
create policy user_exports_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'user-exports' and (storage.foldername(name))[1] = (select auth.uid()::text))
  with check (bucket_id = 'user-exports' and (storage.foldername(name))[1] = (select auth.uid()::text));

commit;
