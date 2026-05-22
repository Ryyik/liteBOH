-- Provide a stable RPC for Pushplus token lookup used by like/comment senders.
-- This avoids direct reads of profiles.pushplus_token from client code.

create or replace function public.get_pushplus_token_for_notification(target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_token text;
begin
  if v_caller_id is null or target_user_id is null then
    return null;
  end if;

  select pushplus_token
    into v_token
    from public.profiles
   where id = target_user_id
     and coalesce(pushplus_enabled, false) = true
     and pushplus_token is not null
     and length(trim(pushplus_token)) > 0
   limit 1;

  return v_token;
end;
$$;

revoke all on function public.get_pushplus_token_for_notification(uuid) from public;

grant execute on function public.get_pushplus_token_for_notification(uuid) to authenticated;
grant execute on function public.get_pushplus_token_for_notification(uuid) to service_role;
