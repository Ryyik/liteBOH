begin;

-- ============================================
-- Web Push 订阅端点表
--
-- 每一条记录 = 一个浏览器/设备上的一个 Web Push 订阅（PushSubscription）。
-- 一个用户会有多行（手机、平板、桌面各一份），这是 Web Push 的固有形态：
-- 订阅是「按 UA + 按安装实例」的，不是按账号的。
--
-- endpoint 全局唯一：同一浏览器重复订阅会拿到同一个 endpoint，
-- 因此 upsert on endpoint 天然幂等，不会越攒越多。
--
-- 权限（本表存的是推送凭证，属敏感数据）：
--   · anon        → 全部 revoke。游客绝不能读，否则 endpoint 泄露可被第三方推垃圾。
--   · authenticated → 只能操作自己的行（RLS + 表级 grant 双保险）。
--   · service_role  → 全权，发送端要跨用户读取、并删除已失效订阅。
-- 注意 revoke 之后必须**分别** grant，漏掉任一侧都会在真库上表现为 42501（探针 mock 不出来）。
--
-- 幂等：create table / policy if not exists 风格，可重复执行。
-- ============================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- 连续失败计数：达到阈值就 disabled_at，避免对死端点无限重试
  failure_count integer not null default 0,
  -- 非 NULL 表示已停用（订阅被浏览器回收 / 推送服务返回 410）
  disabled_at timestamptz null,
  constraint push_subscriptions_endpoint_key unique (endpoint)
);

comment on table public.push_subscriptions is
  'Web Push 订阅端点。一个用户多行（每设备/每浏览器一份）。endpoint 全局唯一，重复订阅走 upsert 幂等。';
comment on column public.push_subscriptions.disabled_at is
  '非 NULL = 已停用（推送服务返回 404/410，或失败次数超阈值）。发送端只取 disabled_at is null 的行。';

-- 发送端按 (user_id, 未停用) 取订阅；部分索引让冷行不进索引
create index if not exists idx_push_subscriptions_user_active
  on public.push_subscriptions (user_id)
  where disabled_at is null;

alter table public.push_subscriptions enable row level security;

-- ------------------------------------------------------------------
-- RLS：本人可读写自己的订阅
-- ------------------------------------------------------------------
drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own
  on public.push_subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own
  on public.push_subscriptions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own
  on public.push_subscriptions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own
  on public.push_subscriptions
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- RLS：service_role 全权（发送端跨用户读、清理死订阅）
-- ------------------------------------------------------------------
drop policy if exists push_subscriptions_service_all on public.push_subscriptions;
create policy push_subscriptions_service_all
  on public.push_subscriptions
  for all
  to service_role
  using (true)
  with check (true);

-- ------------------------------------------------------------------
-- 表级权限：必须分别 grant，不能只靠 RLS
-- ------------------------------------------------------------------
revoke all on table public.push_subscriptions from anon;
revoke all on table public.push_subscriptions from authenticated;

grant select, insert, update, delete on table public.push_subscriptions to authenticated;
grant all on table public.push_subscriptions to service_role;

notify pgrst, 'reload schema';

commit;
