create table if not exists public.bohai_model_configs (
  id uuid primary key default gen_random_uuid(),
  mode_id text not null,
  display_name text not null,
  tagline text not null default '',
  description text not null default '',
  provider text not null,
  provider_label text not null default '',
  model_id text not null,
  api_url text not null default '',
  capability text not null default 'chat',
  icon text not null default 'sparkles',
  temperature numeric(4, 3) not null default 0.2,
  top_p numeric(4, 3) not null default 0.75,
  frequency_penalty numeric(4, 3) not null default 0.06,
  max_tokens integer not null default 1800,
  status text not null default 'active',
  sort_order integer not null default 100,
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bohai_model_configs_mode_id_key unique (mode_id),
  constraint bohai_model_configs_status_check check (status in ('active', 'disabled')),
  constraint bohai_model_configs_provider_check check (provider in ('siliconflow', 'zhipu', 'custom')),
  constraint bohai_model_configs_capability_check check (capability in ('chat', 'multimodal', 'plan', 'agent')),
  constraint bohai_model_configs_temperature_check check (temperature >= 0 and temperature <= 1.2),
  constraint bohai_model_configs_top_p_check check (top_p >= 0.1 and top_p <= 1),
  constraint bohai_model_configs_frequency_penalty_check check (frequency_penalty >= 0 and frequency_penalty <= 2),
  constraint bohai_model_configs_max_tokens_check check (max_tokens >= 256 and max_tokens <= 4096)
);

alter table public.bohai_model_configs enable row level security;

create index if not exists bohai_model_configs_status_sort_idx
  on public.bohai_model_configs (status, sort_order, display_name);

create or replace function public.set_bohai_model_configs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bohai_model_configs_updated_at on public.bohai_model_configs;
create trigger trg_bohai_model_configs_updated_at
before update on public.bohai_model_configs
for each row
execute function public.set_bohai_model_configs_updated_at();

drop policy if exists bohai_model_configs_select_active_or_admin on public.bohai_model_configs;
create policy bohai_model_configs_select_active_or_admin
  on public.bohai_model_configs
  for select
  using (status = 'active' or public.current_user_is_admin());

drop policy if exists bohai_model_configs_admin_insert on public.bohai_model_configs;
create policy bohai_model_configs_admin_insert
  on public.bohai_model_configs
  for insert
  with check (public.current_user_is_admin());

drop policy if exists bohai_model_configs_admin_update on public.bohai_model_configs;
create policy bohai_model_configs_admin_update
  on public.bohai_model_configs
  for update
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

drop policy if exists bohai_model_configs_admin_delete on public.bohai_model_configs;
create policy bohai_model_configs_admin_delete
  on public.bohai_model_configs
  for delete
  using (public.current_user_is_admin());

insert into public.bohai_model_configs (
  mode_id,
  display_name,
  tagline,
  description,
  provider,
  provider_label,
  model_id,
  api_url,
  capability,
  icon,
  temperature,
  top_p,
  frequency_penalty,
  max_tokens,
  status,
  sort_order
) values
  ('fast', 'Fast', '极速响应', '轻量模型，秒回', 'siliconflow', 'SiliconFlow', 'nex-agi/Nex-N2-Pro', 'https://api.siliconflow.cn/v1/chat/completions', 'chat', 'zap', 0.22, 0.74, 0.08, 1200, 'active', 10),
  ('pro', 'Pro', '质量', 'Qwen 旗舰通用', 'siliconflow', 'SiliconFlow', 'Qwen/Qwen3-8B', 'https://api.siliconflow.cn/v1/chat/completions', 'chat', 'sparkles', 0.18, 0.70, 0.06, 1800, 'active', 20),
  ('multimodal', '多模态', '图片/视频/文件', 'GLM 4.6V Flash', 'zhipu', '智谱 AI', 'glm-4.6v-flash', 'https://open.bigmodel.cn/api/paas/v4/chat/completions', 'multimodal', 'image', 0.20, 0.75, 0.06, 1800, 'active', 30),
  ('plan', 'Plan', '超级高质量', '分步推进，深度推理', 'siliconflow', 'SiliconFlow', 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B', 'https://api.siliconflow.cn/v1/chat/completions', 'plan', 'list-checks', 0.08, 0.55, 0.04, 2400, 'active', 40),
  ('agent-cluster', 'Agent', '工作', '多 Agent 并行', 'siliconflow', 'SiliconFlow', 'Qwen/Qwen3-8B', 'https://api.siliconflow.cn/v1/chat/completions', 'agent', 'users', 0.18, 0.70, 0.06, 1600, 'active', 50)
on conflict (mode_id) do update set
  display_name = excluded.display_name,
  tagline = excluded.tagline,
  description = excluded.description,
  provider = excluded.provider,
  provider_label = excluded.provider_label,
  model_id = excluded.model_id,
  api_url = excluded.api_url,
  capability = excluded.capability,
  icon = excluded.icon,
  temperature = excluded.temperature,
  top_p = excluded.top_p,
  frequency_penalty = excluded.frequency_penalty,
  max_tokens = excluded.max_tokens,
  status = excluded.status,
  sort_order = excluded.sort_order;
