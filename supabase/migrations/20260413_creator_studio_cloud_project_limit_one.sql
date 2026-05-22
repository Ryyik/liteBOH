-- Creator Studio 云端项目数量上限收紧：每位用户最多 1 个云端项目

begin;

create or replace function public.enforce_creator_studio_projects_limit()
returns trigger
language plpgsql
as $$
declare
  v_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));

  -- 同一项目 ID 的冲突更新不计入新增数量
  if exists (
    select 1
      from public.creator_studio_projects p
     where p.user_id = new.user_id
       and p.project_id = new.project_id
  ) then
    return new;
  end if;

  select count(*)
    into v_count
    from public.creator_studio_projects p
   where p.user_id = new.user_id;

  if v_count >= 1 then
    raise exception 'CLOUD_PROJECT_LIMIT_REACHED'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_creator_studio_projects_limit on public.creator_studio_projects;
create trigger trg_creator_studio_projects_limit
before insert on public.creator_studio_projects
for each row
execute function public.enforce_creator_studio_projects_limit();

commit;
