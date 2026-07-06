-- 生日事件管理系统
-- 支持管理员配置生日人物、管理祝福语、控制页面文案
-- 用户可提交祝福，管理员审核后展示在生日页面

-- 生日事件配置表
create table if not exists public.birthday_events (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '生日快乐',
  subtitle text not null default '',
  hero_quote text not null default '',
  page_copy jsonb not null default '{}'::jsonb,
  celebration_date date not null,
  is_active boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint birthday_events_target_user_check check (target_user_id is not null),
  constraint birthday_events_title_check check (length(title) > 0)
);

-- 生日祝福表
create table if not exists public.birthday_wishes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.birthday_events(id) on delete cascade,
  author_name text not null,
  author_id uuid references public.profiles(id) on delete set null,
  content text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  is_featured boolean not null default false,
  likes integer not null default 0,
  created_at timestamptz not null default now(),
  constraint birthday_wishes_content_check check (length(content) > 0),
  constraint birthday_wishes_author_check check (length(author_name) > 0)
);

-- 索引
create index if not exists birthday_events_active_idx
  on public.birthday_events (is_active, celebration_date desc);

create index if not exists birthday_wishes_event_status_idx
  on public.birthday_wishes (event_id, status, created_at desc);

create index if not exists birthday_wishes_featured_idx
  on public.birthday_wishes (event_id, is_featured) where is_featured = true;

-- 启用 RLS
alter table public.birthday_events enable row level security;
alter table public.birthday_wishes enable row level security;

-- RLS: 管理员对 birthday_events 完全控制
drop policy if exists "Admins manage birthday events" on public.birthday_events;
create policy "Admins manage birthday events"
  on public.birthday_events
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'superadmin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'superadmin')
    )
  );

-- RLS: 所有人可查看 active 的生日事件
drop policy if exists "Anyone can view active birthday events" on public.birthday_events;
create policy "Anyone can view active birthday events"
  on public.birthday_events
  for select
  to public
  using (is_active = true);

-- RLS: 管理员对 birthday_wishes 完全控制
drop policy if exists "Admins manage birthday wishes" on public.birthday_wishes;
create policy "Admins manage birthday wishes"
  on public.birthday_wishes
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'superadmin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'superadmin')
    )
  );

-- RLS: 已登录用户可提交祝福
drop policy if exists "Authenticated users can insert wishes" on public.birthday_wishes;
create policy "Authenticated users can insert wishes"
  on public.birthday_wishes
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.birthday_events
      where birthday_events.id = event_id
      and birthday_events.is_active = true
    )
  );

-- RLS: 所有人可查看 approved 的祝福
drop policy if exists "Anyone can view approved wishes" on public.birthday_wishes;
create policy "Anyone can view approved wishes"
  on public.birthday_wishes
  for select
  to public
  using (status = 'approved');
