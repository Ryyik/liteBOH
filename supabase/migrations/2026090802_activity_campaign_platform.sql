-- 活动平台化数据层地基（BETA 6 P1-3 / plans/007-beta6-plan.md S4 启动）
-- 背景：此前一活动一套表/页（birthday_events、6 张抽奖表、八周年/咖啡店静态页），
-- 每办一次新活动 ≈ 发一次版，活动结束后页面成为幽灵入口。
-- 本迁移建立通用三表：campaigns（活动 + 生命周期）/ entries（通用报名/投稿）/ rewards（通用发放）。
-- 铁律：BETA 6 起新活动一律 = 后台填一张 campaigns 配置，不再新增一次性活动表/页面。
-- 迁移路径：先拿抽奖 + 一个生日会迁入验证跑通，再逐步下线旧表/旧页。
--
-- 生命周期 stage：draft → signup → submission → judging → result → fulfilled
-- 活动私有配置进 config jsonb（报名表单字段、评审规则、文案等），不再为单活动加列/加表。

begin;

-- ============ 1) 活动总表 ============
create table if not exists public.activity_campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  stage text not null default 'draft'
    check (stage in ('draft', 'signup', 'submission', 'judging', 'result', 'fulfilled')),
  signup_start_at timestamptz,
  signup_end_at timestamptz,
  start_at timestamptz,
  end_at timestamptz,
  config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.activity_campaigns is
  '活动平台化：活动总表。新活动通过插入一行 + config 配置创建，stage 驱动生命周期。';

create index if not exists idx_activity_campaigns_stage
  on public.activity_campaigns (stage);
create index if not exists idx_activity_campaigns_start_at
  on public.activity_campaigns (start_at desc);

-- ============ 2) 通用报名 / 投稿表 ============
create table if not exists public.activity_entries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.activity_campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'signup'
    check (kind in ('signup', 'submission')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'approved'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 每人每活动每类记录一条（多次投稿需求出现时再放宽为部分唯一索引）
  unique (campaign_id, user_id, kind)
);

comment on table public.activity_entries is
  '活动平台化：通用报名/投稿。signup=报名记录，submission=作品投稿，payload 存表单/作品内容。';

create index if not exists idx_activity_entries_campaign
  on public.activity_entries (campaign_id, kind, status);
create index if not exists idx_activity_entries_user
  on public.activity_entries (user_id);

-- ============ 3) 通用奖励发放表 ============
create table if not exists public.activity_rewards (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.activity_campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid references public.activity_entries(id) on delete set null,
  -- 对接现有权益：points=积分体系 / lottery_ticket=抽奖券 / shop_coupon=商城券 / custom=自定义
  reward_type text not null
    check (reward_type in ('points', 'lottery_ticket', 'shop_coupon', 'custom')),
  amount integer not null default 1 check (amount > 0),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'granted'
    check (status in ('granted', 'fulfilled', 'cancelled')),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.activity_rewards is
  '活动平台化：通用发奖。只做发放台账，扣减/入账走各权益体系自身的逻辑。';

create index if not exists idx_activity_rewards_campaign
  on public.activity_rewards (campaign_id, status);
create index if not exists idx_activity_rewards_user
  on public.activity_rewards (user_id);

-- ============ 4) updated_at 触发器 ============
create or replace function public.activity_platform_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_activity_campaigns_touch on public.activity_campaigns;
create trigger trg_activity_campaigns_touch
  before update on public.activity_campaigns
  for each row execute function public.activity_platform_touch_updated_at();

drop trigger if exists trg_activity_entries_touch on public.activity_entries;
create trigger trg_activity_entries_touch
  before update on public.activity_entries
  for each row execute function public.activity_platform_touch_updated_at();

-- ============ 5) RLS ============
alter table public.activity_campaigns enable row level security;
alter table public.activity_entries   enable row level security;
alter table public.activity_rewards   enable row level security;

-- campaigns：所有人可读（活动列表页公开），写仅管理员
drop policy if exists activity_campaigns_select on public.activity_campaigns;
create policy activity_campaigns_select on public.activity_campaigns
  for select using (true);

drop policy if exists activity_campaigns_write on public.activity_campaigns;
create policy activity_campaigns_write on public.activity_campaigns
  for all using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

-- entries：报名/投稿公示可读；用户写自己的；改自己的；删自己或管理员
drop policy if exists activity_entries_select on public.activity_entries;
create policy activity_entries_select on public.activity_entries
  for select using (true);

drop policy if exists activity_entries_insert on public.activity_entries;
create policy activity_entries_insert on public.activity_entries
  for insert with check (auth.uid() = user_id);
-- 注：signup/submission 阶段窗口校验由应用层（API/前端）负责，RLS 只锁归属，
-- 避免 admin 代录/补录被阶段条件卡死。

drop policy if exists activity_entries_update on public.activity_entries;
create policy activity_entries_update on public.activity_entries
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists activity_entries_delete on public.activity_entries;
create policy activity_entries_delete on public.activity_entries
  for delete using (auth.uid() = user_id or public.current_user_is_admin());

-- rewards：发放台账敏感——用户只读自己的，写仅管理员
drop policy if exists activity_rewards_select on public.activity_rewards;
create policy activity_rewards_select on public.activity_rewards
  for select using (auth.uid() = user_id or public.current_user_is_admin());

drop policy if exists activity_rewards_write on public.activity_rewards;
create policy activity_rewards_write on public.activity_rewards
  for all using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

-- ============ 6) 权限 ============
grant select on public.activity_campaigns to anon, authenticated;
grant select on public.activity_entries to anon, authenticated;
grant insert, update, delete on public.activity_entries to authenticated;
grant select on public.activity_rewards to authenticated;
-- 管理员写路径经 current_user_is_admin() 政策放行（campaigns / rewards 的写权限只授给 authenticated，
-- service_role 全权兜底）
grant insert, update, delete on public.activity_campaigns to authenticated;
grant insert, update, delete on public.activity_rewards to authenticated;

commit;
