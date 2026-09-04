-- BOH Health: 身高/体重/年龄等基础档案 + 体重趋势 + 日志 + 档案记录
-- 对齐项目迁移命名与放置规范: supabase/migrations/

-- 1) health_profiles: 1:1 用户档案
create table if not exists public.health_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sex text check (sex in ('male','female','other','prefer_not_to_say')),
  birth_year smallint check (birth_year between 1900 and 2100),
  height_cm numeric(5,1) check (height_cm between 100 and 250),
  weight_kg numeric(5,1) check (weight_kg between 20 and 350),
  target_weight_kg numeric(5,1) check (target_weight_kg between 20 and 350),
  activity_level text check (activity_level in ('sedentary','light','moderate','active')),
  goals jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2) health_weight_logs: 体重趋势
create table if not exists public.health_weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weight_kg numeric(5,1) not null check (weight_kg between 20 and 350),
  logged_at timestamptz not null default now(),
  created_at timestamptz default now()
);
create index if not exists idx_health_weight_logs_user_time on public.health_weight_logs(user_id, logged_at desc);

-- 3) health_daily_logs: 睡眠/步数/饮水/心情
create table if not exists public.health_daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  sleep_hours numeric(4,1) check (sleep_hours between 0 and 24),
  steps integer check (steps between 0 and 100000),
  water_cups integer check (water_cups between 0 and 30),
  mood text check (mood in ('great','good','ok','low','bad')),
  mood_note text,
  created_at timestamptz default now(),
  unique(user_id, log_date)
);
create index if not exists idx_health_daily_logs_user_date on public.health_daily_logs(user_id, log_date desc);

-- 4) health_vault_records: 体检/报告等
create table if not exists public.health_vault_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  indicators jsonb default '{}'::jsonb,
  file_name text,
  created_at timestamptz default now()
);
create index if not exists idx_health_vault_user_created on public.health_vault_records(user_id, created_at desc);

-- updated_at trigger
create or replace function public.update_health_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_health_profiles_updated_at on public.health_profiles;
create trigger trg_health_profiles_updated_at before update on public.health_profiles
for each row execute function public.update_health_updated_at();

-- RLS
alter table public.health_profiles enable row level security;
alter table public.health_weight_logs enable row level security;
alter table public.health_daily_logs enable row level security;
alter table public.health_vault_records enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'health_profiles' and policyname = 'health_profiles_owner') then
    create policy health_profiles_owner on public.health_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'health_weight_logs' and policyname = 'health_weight_logs_owner') then
    create policy health_weight_logs_owner on public.health_weight_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'health_daily_logs' and policyname = 'health_daily_logs_owner') then
    create policy health_daily_logs_owner on public.health_daily_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'health_vault_records' and policyname = 'health_vault_owner') then
    create policy health_vault_owner on public.health_vault_records for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
