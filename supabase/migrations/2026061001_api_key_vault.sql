create table if not exists public.api_key_vault (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  purpose text not null,
  label text not null default '',
  encrypted_value text not null,
  masked_value text not null default '',
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  last_test_status text,
  last_test_message text,
  last_tested_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint api_key_vault_provider_purpose_key unique (provider, purpose),
  constraint api_key_vault_status_check check (status in ('active', 'disabled'))
);

alter table public.api_key_vault enable row level security;

create index if not exists api_key_vault_provider_purpose_idx
  on public.api_key_vault (provider, purpose);

create table if not exists public.api_key_vault_audit_logs (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid references public.api_key_vault(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  provider text not null default '',
  purpose text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.api_key_vault_audit_logs enable row level security;

create index if not exists api_key_vault_audit_logs_vault_created_idx
  on public.api_key_vault_audit_logs (vault_id, created_at desc);

create index if not exists api_key_vault_audit_logs_actor_created_idx
  on public.api_key_vault_audit_logs (actor_id, created_at desc);
