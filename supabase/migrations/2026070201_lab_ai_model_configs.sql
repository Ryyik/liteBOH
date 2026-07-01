-- 创建实验室 AI 模型配置表
-- 用于管理实验室文档排版和 PPT 生成功能使用的 AI 模型
-- 模型 ID 必须从免费模型库 (Freemodels) 中选择
create table if not exists public.lab_ai_model_configs (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null unique,
  feature_label text not null,
  description text not null default '',
  model_id text not null,
  temperature numeric(4,3) not null default 0.7 check (temperature >= 0 and temperature <= 1.2),
  max_tokens integer not null default 2000 check (max_tokens >= 256 and max_tokens <= 8192),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lab_ai_feature_key_check check (length(feature_key) > 0),
  constraint lab_ai_feature_label_check check (length(feature_label) > 0),
  constraint lab_ai_model_id_check check (length(model_id) > 0)
);

-- 启用 RLS
alter table public.lab_ai_model_configs enable row level security;

-- 索引
create index if not exists lab_ai_model_configs_active_sort_idx
  on public.lab_ai_model_configs (is_active, sort_order);

-- RLS 策略：管理员可以完全访问
drop policy if exists "Admins can manage lab ai model configs" on public.lab_ai_model_configs;
create policy "Admins can manage lab ai model configs"
  on public.lab_ai_model_configs
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'superadmin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'superadmin')
    )
  );

-- RLS 策略：普通用户只能查看启用的配置
drop policy if exists "Users can view active lab ai model configs" on public.lab_ai_model_configs;
create policy "Users can view active lab ai model configs"
  on public.lab_ai_model_configs
  for select
  to authenticated
  using (is_active = true);

-- RLS 策略：匿名用户只能查看启用的配置
drop policy if exists "Anonymous can view active lab ai model configs" on public.lab_ai_model_configs;
create policy "Anonymous can view active lab ai model configs"
  on public.lab_ai_model_configs
  for select
  to anon
  using (is_active = true);

-- 插入默认配置数据（on conflict 跳过已存在的）
insert into public.lab_ai_model_configs (feature_key, feature_label, description, model_id, temperature, max_tokens, sort_order) values
  ('doc-formatting', '文档排版 AI', '实验室文档对话式排版使用的 AI 模型，需要稳定的指令执行能力。', 'Qwen/Qwen3-8B', 0.100, 4096, 1),
  ('ppt-generator', 'PPT 生成 AI', '实验室 PPT 自动生成使用的 AI 模型，需要较强的创意和结构化输出能力。', 'Qwen/Qwen3-8B', 0.700, 2000, 2)
on conflict (feature_key) do nothing;

-- 创建更新时间触发器
create or replace function update_lab_ai_model_configs_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists lab_ai_model_configs_updated_at_trigger on public.lab_ai_model_configs;
create trigger lab_ai_model_configs_updated_at_trigger
  before update on public.lab_ai_model_configs
  for each row
  execute function update_lab_ai_model_configs_updated_at();
