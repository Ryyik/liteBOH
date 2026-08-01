begin;

-- 八周年纪念海报申请：用户填写收件信息，物料费 5 RMB（文案告知，无在线支付），5 天内送达
create table if not exists public.poster_requests (
  id uuid primary key default gen_random_uuid(),
  campaign_code text not null default 'boh-8th-anniversary-poster-2026',
  user_id uuid not null references public.profiles (id) on delete cascade,
  recipient text not null,
  phone text not null,
  address text not null,
  material_fee numeric not null default 5,
  status text not null default 'pending',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.poster_requests enable row level security;

drop policy if exists poster_requests_select_own
  on public.poster_requests;
create policy poster_requests_select_own
  on public.poster_requests
  for select
  to authenticated
  using (auth.uid() = user_id);

-- 管理员统一在数据管理中心更新申请状态（依赖 2026042801 的 current_user_is_admin）
drop policy if exists poster_requests_admin_update
  on public.poster_requests;
create policy poster_requests_admin_update
  on public.poster_requests
  for update
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

grant select on table public.poster_requests to authenticated;
grant select, update on table public.poster_requests to authenticated;
grant all on table public.poster_requests to service_role;

create or replace function public.submit_boh_poster_request(
  p_recipient text,
  p_phone text,
  p_address text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_recipient text := trim(coalesce(p_recipient, ''));
  v_phone text := trim(coalesce(p_phone, ''));
  v_address text := trim(coalesce(p_address, ''));
  v_request_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  if length(v_recipient) < 1 or length(v_recipient) > 40 then
    return jsonb_build_object('ok', false, 'message', 'INVALID_RECIPIENT');
  end if;
  if length(v_phone) < 5 or length(v_phone) > 20 then
    return jsonb_build_object('ok', false, 'message', 'INVALID_PHONE');
  end if;
  if length(v_address) < 5 or length(v_address) > 200 then
    return jsonb_build_object('ok', false, 'message', 'INVALID_ADDRESS');
  end if;

  insert into public.poster_requests (user_id, recipient, phone, address)
  values (v_user_id, v_recipient, v_phone, v_address)
  returning id into v_request_id;

  return jsonb_build_object(
    'ok', true,
    'message', 'SUBMIT_SUCCESS',
    'request_id', v_request_id,
    'material_fee', 5,
    'delivery_days', 5
  );
end;
$$;

revoke all on function public.submit_boh_poster_request(text, text, text) from public;
revoke execute on function public.submit_boh_poster_request(text, text, text) from anon;
grant execute on function public.submit_boh_poster_request(text, text, text) to authenticated;
grant execute on function public.submit_boh_poster_request(text, text, text) to service_role;

commit;
