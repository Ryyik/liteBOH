-- health_profiles / health_weight_logs / health_daily_logs / health_vault_records
-- BOH Health 私有健康数据，RLS 仅本人可见
-- 对应迁移: supabase/migrations/2026090201_boh_health.sql

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

create table if not exists public.health_weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weight_kg numeric(5,1) not null check (weight_kg between 20 and 350),
  logged_at timestamptz not null default now(),
  created_at timestamptz default now()
);

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

create table if not exists public.health_vault_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  indicators jsonb default '{}'::jsonb,
  file_name text,
  created_at timestamptz default now()
);
