-- ALTCHA 认证网关：
-- 1) 存储已消费的 ALTCHA proof，防止重放
-- 2) 供 Edge Functions 登录/注册网关使用

begin;

create table if not exists public.auth_altcha_proofs (
  proof_hash text primary key,
  scope text not null,
  login_key text null,
  device_id_hash text null,
  created_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone not null,
  constraint auth_altcha_proofs_scope_len
    check (char_length(trim(scope)) between 1 and 32),
  constraint auth_altcha_proofs_login_key_len
    check (login_key is null or char_length(trim(login_key)) between 1 and 190),
  constraint auth_altcha_proofs_device_hash_len
    check (device_id_hash is null or char_length(trim(device_id_hash)) between 1 and 128)
);

create index if not exists idx_auth_altcha_proofs_expires_at
  on public.auth_altcha_proofs (expires_at asc);

create index if not exists idx_auth_altcha_proofs_scope_created
  on public.auth_altcha_proofs (scope, created_at desc);

commit;
