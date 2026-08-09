begin;

-- 收货地址表：支持多地址、默认地址、标签（家/公司），供礼物寄送与商城使用
create table if not exists public.user_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipient text not null,
  phone text not null,
  region text not null default '',
  detail text not null,
  tag text not null default '',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_addresses enable row level security;

-- 仅本人可读自己的地址
drop policy if exists user_addresses_owner_select on public.user_addresses;
create policy user_addresses_owner_select on public.user_addresses
  for select to authenticated
  using (user_id = auth.uid());

-- 仅本人可新增自己的地址
drop policy if exists user_addresses_owner_insert on public.user_addresses;
create policy user_addresses_owner_insert on public.user_addresses
  for insert to authenticated
  with check (user_id = auth.uid());

-- 仅本人可更新自己的地址
drop policy if exists user_addresses_owner_update on public.user_addresses;
create policy user_addresses_owner_update on public.user_addresses
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 仅本人可删除自己的地址
drop policy if exists user_addresses_owner_delete on public.user_addresses;
create policy user_addresses_owner_delete on public.user_addresses
  for delete to authenticated
  using (user_id = auth.uid());

-- 管理员全权访问（供后台礼物寄送使用）
drop policy if exists user_addresses_admin_all on public.user_addresses;
create policy user_addresses_admin_all on public.user_addresses
  for all to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

grant select, insert, update, delete on table public.user_addresses to authenticated;
grant all on table public.user_addresses to service_role;

commit;
