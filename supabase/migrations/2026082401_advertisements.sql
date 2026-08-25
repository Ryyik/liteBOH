begin;

-- 广告管理表：通用广告位配置，当前落地"列表信息流"订阅计划广告
create table if not exists public.advertisements (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  image_url text,
  link_url text,
  placement text not null default 'list_feed' check (placement in ('list_feed', 'top_banner', 'bottom_banner', 'detail_between', 'sidebar')),
  status text not null default 'inactive' check (status in ('active', 'inactive')),
  sort_order int not null default 0,
  feed_interval int not null default 5 check (feed_interval >= 2),
  clicks int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ads_title_length check (char_length(title) <= 120)
);

create index if not exists idx_advertisements_active on public.advertisements (placement, status, sort_order);

alter table public.advertisements enable row level security;

-- 公开可读：仅对外开放"启用中"的广告，供前台帖子流等信息流广告位渲染
drop policy if exists advertisements_public_select on public.advertisements;
create policy advertisements_public_select on public.advertisements
  for select to anon, authenticated
  using (status = 'active' and placement = 'list_feed');

-- 管理员全权访问：后台数据管理面板增删改查（含非 active 记录）
drop policy if exists advertisements_admin_all on public.advertisements;
create policy advertisements_admin_all on public.advertisements
  for all to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

grant select on table public.advertisements to anon, authenticated;
grant select, insert, update, delete on table public.advertisements to authenticated;
grant all on table public.advertisements to service_role;

create or replace function public.touch_advertisement_updated_at() returns trigger
  language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_advertisement on public.advertisements;
create trigger trg_touch_advertisement before update on public.advertisements
  for each row execute function public.touch_advertisement_updated_at();

-- 点击计数 RPC：前台任意用户点击广告时自增曝光点击量（安全定义者，仅能自增该字段，无数据旁路）
create or replace function public.increment_ad_clicks(target_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.advertisements
    set clicks = clicks + 1, updated_at = now()
    where id = target_id;
end;
$$;
revoke all on function public.increment_ad_clicks(uuid) from public;
grant execute on function public.increment_ad_clicks(uuid) to anon, authenticated;

commit;