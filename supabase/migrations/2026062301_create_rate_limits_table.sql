-- DB-backed rate limits for Edge Functions (multi-instance safe)
create table if not exists public._rate_limits (
  key text primary key,
  count integer not null default 1,
  reset_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
