begin;

-- ============================================
-- home_heroes 表 - 首页展示型英雄区配置（数据驱动）
-- 支持 4 种模板：standard / overlay / split / responsive
-- 草稿/发布分离：首页仅渲染 status='published' 且 is_archived=false 的记录
-- 归档英雄区（is_archived=true）显示在 Footer 历史回顾区
-- ============================================

create table if not exists public.home_heroes (
  id uuid primary key default gen_random_uuid(),
  -- 排序与显隐
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  -- 模板类型（决定渲染组件与字段解析方式）
  template text not null check (template in ('standard','overlay','split','responsive')),
  variant text not null default 'light' check (variant in ('light','dark')),
  -- 文字内容
  eyebrow text,
  title text not null,
  subtitle text,
  -- 图片资源（JSONB，按模板不同字段不同）
  --   standard:   { src, alt }
  --   overlay:    { src, alt, position }
  --   responsive: { landscapeSrc, portraitSrc, alt }
  --   split:      空（使用 split_cards 内各自的 image_config）
  image_config jsonb not null default '{}'::jsonb,
  -- 按钮链接数组 [{ text, type: 'primary'|'secondary', to?, href?, onClick?: 'modal:<key>' }]
  links jsonb not null default '[]'::jsonb,
  -- split 模板的子卡片配置（仅 template='split' 时使用，固定 2 张）
  split_cards jsonb,
  -- 管理面板展示用的内部标识
  label text,
  aria_label text,
  -- 草稿/发布分离
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  -- 审计字段
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

-- 索引：首页查询命中 (status, is_archived, sort_order)
create index if not exists idx_home_heroes_published
  on public.home_heroes (status, is_archived, sort_order);

-- updated_at 触发器（复用项目已有的 update_updated_at_column 函数）
drop trigger if exists update_home_heroes_updated_at on public.home_heroes;
create trigger update_home_heroes_updated_at
  before update on public.home_heroes
  for each row
  execute function public.update_updated_at_column();

alter table public.home_heroes enable row level security;

-- 公开读：首页需要匿名访问已发布英雄区
drop policy if exists home_heroes_select_public on public.home_heroes;
create policy home_heroes_select_public on public.home_heroes
  for select
  using (status = 'published' or public.current_user_is_admin());

-- 管理员全权写
drop policy if exists home_heroes_admin_all on public.home_heroes;
create policy home_heroes_admin_all on public.home_heroes
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

grant select on table public.home_heroes to anon, authenticated;
grant select, insert, update, delete on table public.home_heroes to authenticated;
grant all on table public.home_heroes to service_role;

-- ============================================
-- home_heroes_revisions 表 - 发布历史快照（支持回滚）
-- ============================================

create table if not exists public.home_heroes_revisions (
  id uuid primary key default gen_random_uuid(),
  hero_id uuid not null references public.home_heroes(id) on delete cascade,
  snapshot jsonb not null,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_home_heroes_revisions_hero
  on public.home_heroes_revisions (hero_id, published_at desc);

alter table public.home_heroes_revisions enable row level security;

-- 管理员可查看发布历史
drop policy if exists home_heroes_revisions_admin_select on public.home_heroes_revisions;
create policy home_heroes_revisions_admin_select on public.home_heroes_revisions
  for select
  using (public.current_user_is_admin());

-- 管理员可写入快照（发布时自动写入）
drop policy if exists home_heroes_revisions_admin_insert on public.home_heroes_revisions;
create policy home_heroes_revisions_admin_insert on public.home_heroes_revisions
  for insert
  to authenticated
  with check (public.current_user_is_admin());

-- 管理员可删除旧快照（清理历史）
drop policy if exists home_heroes_revisions_admin_delete on public.home_heroes_revisions;
create policy home_heroes_revisions_admin_delete on public.home_heroes_revisions
  for delete
  using (public.current_user_is_admin());

grant select on table public.home_heroes_revisions to authenticated;
grant select, insert, delete on table public.home_heroes_revisions to authenticated;
grant all on table public.home_heroes_revisions to service_role;

commit;
