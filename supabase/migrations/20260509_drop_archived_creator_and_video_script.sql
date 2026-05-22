-- Drop archived Creator Studio and Video Script Editor database objects.
-- These product surfaces were removed from the Vue app, and their persisted
-- data is no longer needed.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'build_creator_studio_team_payload',
        'call_video_script_ai',
        'create_my_creator_studio_team',
        'delete_my_creator_studio_project',
        'delete_my_creator_studio_team',
        'delete_my_video_script_project',
        'enforce_creator_studio_projects_limit',
        'enforce_video_script_projects_limit',
        'get_my_creator_studio_projects',
        'get_my_creator_studio_team',
        'get_my_creator_studio_team_script',
        'get_my_creator_workflow',
        'get_my_video_script_projects',
        'get_video_script_project_count',
        'join_creator_studio_team_by_code',
        'leave_my_creator_studio_team',
        'remove_member_from_my_creator_studio_team',
        'save_my_creator_studio_team_script',
        'touch_creator_studio_projects_updated_at',
        'touch_creator_studio_updated_at',
        'touch_creator_workflows_updated_at',
        'touch_video_script_updated_at',
        'transfer_creator_studio_team_owner',
        'upsert_my_creator_studio_project',
        'upsert_my_creator_workflow',
        'upsert_my_video_script_project'
      )
  loop
    execute format('drop function if exists %s cascade', fn.signature);
  end loop;
end $$;

drop table if exists public.video_script_characters cascade;
drop table if exists public.video_script_shots cascade;
drop table if exists public.video_script_scenes cascade;
drop table if exists public.video_script_projects cascade;

drop table if exists public.creator_studio_team_scripts cascade;
drop table if exists public.creator_studio_team_members cascade;
drop table if exists public.creator_studio_teams cascade;
drop table if exists public.creator_studio_projects cascade;
drop table if exists public.creator_workflows cascade;
