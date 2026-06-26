-- moderation_logs 写入兜底：通过 SECURITY DEFINER RPC 绕过前端会话下可能存在的 RLS/权限限制

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

create or replace function public.insert_moderation_log(
  p_target_id uuid,
  p_target_type text,
  p_ai_result text,
  p_ai_reason text default null,
  p_moderator_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_type text := trim(coalesce(p_target_type, ''));
  v_ai_result text := lower(trim(coalesce(p_ai_result, 'approved')));
begin
  if p_target_id is null then
    raise exception 'target_id is required';
  end if;

  if v_target_type = '' then
    raise exception 'target_type is required';
  end if;

  if v_ai_result not in ('approved', 'rejected') then
    v_ai_result := 'approved';
  end if;

  insert into public.moderation_logs (
    target_id,
    target_type,
    ai_result,
    ai_reason,
    moderator_id
  ) values (
    p_target_id,
    v_target_type,
    v_ai_result,
    nullif(trim(coalesce(p_ai_reason, '')), ''),
    p_moderator_id
  );
end;
$$;

grant execute on function public.insert_moderation_log(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.insert_moderation_log(uuid, text, text, text, uuid) to anon;
grant execute on function public.insert_moderation_log(uuid, text, text, text, uuid) to service_role;

commit;
