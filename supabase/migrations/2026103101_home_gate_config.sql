-- 2026103101_home_gate_config.sql
-- 开屏（首屏开场画）管理：单行配置 + 可绑定抽奖的 CTA
--
-- 为什么单开一张表、而不是往 home_heroes 加列：
--   home_heroes 是「首页英雄区流」，被 useHomeHeroesStore + 3 组探针锁着；
--   开屏是「入场浮层」，生命周期与英雄区完全不同（活动期开、结束就关）。
--   两者混在一张表里，每次改开屏都要动英雄区的单例约束与缓存链。
--
-- 单行约束：id 恒为 1（check），所以天然不会出现「两条开屏配置同时生效」。

begin;

create table if not exists public.home_gate_config (
  id integer primary key default 1,
  -- 总开关：false 时首页走默认开屏（白底 + 红苹果 + 时段问候）
  enabled boolean not null default false,
  -- 主题：halloween = 像素南瓜灯；default = 显式回落默认
  theme text not null default 'halloween',
  eyebrow text not null default '',
  title text not null default '',
  subtitle text not null default '',
  hint_text text not null default '',
  -- CTA：文字 + 目标。lottery 绑定抽奖列表里的某一条；route 直接给站内路径
  cta_text text not null default '',
  cta_target_type text not null default 'none',
  cta_lottery_id uuid references public.lotteries(id) on delete set null,
  cta_route text not null default '',
  -- 生效窗口（都可空：空 = 不限）
  starts_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint home_gate_config_singleton check (id = 1),
  constraint home_gate_config_theme_check check (theme in ('halloween', 'default')),
  constraint home_gate_config_cta_check check (cta_target_type in ('none', 'lottery', 'route'))
);

comment on table public.home_gate_config is '首屏开屏配置（单行，id=1）。活动期开、结束关，不需要发版。';

alter table public.home_gate_config enable row level security;

-- 读：全员可读（首屏在登录前就要渲染）
drop policy if exists "home_gate_config public read" on public.home_gate_config;
create policy "home_gate_config public read"
  on public.home_gate_config for select
  using (true);

-- 写：只有 profiles.role = 'admin'（与前端 authStore.isAdmin 同一口径）
drop policy if exists "home_gate_config admin write" on public.home_gate_config;
create policy "home_gate_config admin write"
  on public.home_gate_config for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

grant select on public.home_gate_config to anon, authenticated;
grant insert, update on public.home_gate_config to authenticated;

-- 种子行：万圣夜（10.31 – 11.02）。enabled 先给 true，活动结束后在管理台关掉即可。
insert into public.home_gate_config (
  id, enabled, theme, eyebrow, title, subtitle, hint_text,
  cta_text, cta_target_type, cta_route, starts_at, ends_at
) values (
  1, true, 'halloween',
  'HALLOWEEN · 10.31',
  '万圣节，来方块街有惊喜',
  '万圣夜限定 · 糖果盒已备好',
  '或上滑进入方块街',
  '看看有什么惊喜',
  'lottery',
  '',
  timestamptz '2026-10-31 00:00:00+08',
  timestamptz '2026-11-03 00:00:00+08'
)
on conflict (id) do nothing;

commit;
