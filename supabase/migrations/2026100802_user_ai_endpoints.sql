-- 用户自带 Key（BYOK）的自定义厂商与模型（2026-10-08）
-- ════════════════════════════════════════════════════════════════════════════
-- 需求：「支持自定义模型厂商和模型，支持填入 Baseurl 与 apikey」。
--
-- 现状（做之前）：所有模型都是**管理员**在 bohai_model_configs + api_key_vault 里配的，
--   provider 允许值含 'custom'，但 api_key_vault 是 admin-only、且**没有 user_id 列** ——
--   用户级自带 Key 在整仓找不到任何落点。
--
-- 本迁移补的就是用户维度：
--   · user_ai_endpoints = 一个厂商（名称 / Base URL / 加密后的 Key）
--   · user_ai_models    = 该厂商下的模型（每条模型在运行时是一个可选的「模式」，
--                         mode 形如 'user:<本表 id>'，由 EF 按 id + user_id 归属校验后路由）
--
-- 安全策略（与 api_key_vault 完全一致，别改）：
--   · RLS 打开但**不建任何 policy** ⇒ 普通角色零可见；
--   · 再显式 revoke anon/authenticated ⇒ 连表级权限也不给（双保险，撤权优先于靠 policy 兜）；
--   · 前端**永不直连**这两张表，一律走 api-key-vault Edge Function（service role + 显式归属校验）。
--   ⚠️ 别为了「方便前端读列表」加 authenticated 的 select policy —— Key 的密文与掩码都不该
--      从 PostgREST 出去，列表必须由 EF 过滤字段后返回。
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.user_ai_endpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  -- chat completions 端点（EF 侧会做 SSRF 校验：只允许 https、拒私有 IP/localhost）
  base_url text not null,
  -- 复用 api_key_vault 的 AES-GCM 密文格式：`base64(iv).base64(ciphertext)`，主密钥同一把
  encrypted_value text not null,
  masked_value text not null default '',
  status text not null default 'active',
  last_test_status text,
  last_test_message text,
  last_tested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_ai_endpoints_status_check check (status in ('active', 'disabled')),
  constraint user_ai_endpoints_name_len check (char_length(name) between 1 and 40),
  constraint user_ai_endpoints_base_url_len check (char_length(base_url) between 8 and 300)
);

create table if not exists public.user_ai_models (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.user_ai_endpoints(id) on delete cascade,
  -- 冗余 user_id：EF 路由时用一句 `where id = ? and user_id = ?` 就能判归属，
  -- 不必为了鉴权多 join 一次（归属校验是热路径上唯一的安全断言，越直接越好）。
  user_id uuid not null references auth.users(id) on delete cascade,
  model_id text not null,
  display_name text not null default '',
  -- 单模型可覆盖的参数：为空表示沿用 EF 默认（1800 / 0.2 / 0.75）
  temperature numeric(4, 3),
  max_tokens integer,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  constraint user_ai_models_model_id_len check (char_length(model_id) between 1 and 120),
  constraint user_ai_models_temp_range check (temperature is null or (temperature >= 0 and temperature <= 2)),
  constraint user_ai_models_max_tokens_range check (max_tokens is null or (max_tokens between 1 and 32768)),
  constraint user_ai_models_endpoint_model_key unique (endpoint_id, model_id)
);

create index if not exists user_ai_endpoints_user_idx on public.user_ai_endpoints (user_id);
create index if not exists user_ai_models_user_idx on public.user_ai_models (user_id);
create index if not exists user_ai_models_endpoint_idx on public.user_ai_models (endpoint_id);

comment on table public.user_ai_endpoints is
  '用户自带 Key 的自定义模型厂商（BYOK，2026-10-08）。Key 加密存储，前端永不直连。';
comment on table public.user_ai_models is
  '用户自定义厂商下的模型；运行时 mode = ''user:<id>''，由 api-key-vault 路由。';
comment on column public.user_ai_endpoints.encrypted_value is
  'AES-GCM 密文，格式 base64(iv).base64(ciphertext)，主密钥 = API_KEY_VAULT_MASTER_KEY（与 api_key_vault 同一把）。';

alter table public.user_ai_endpoints enable row level security;
alter table public.user_ai_models enable row level security;

-- 无 policy + 撤权：普通角色零权限（service role 绕过 RLS，EF 走它）
revoke all on table public.user_ai_endpoints from anon, authenticated, public;
revoke all on table public.user_ai_models from anon, authenticated, public;
