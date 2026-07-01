-- 创建 Freemodels 表（免费模型配置）
create table if not exists public.Freemodels (
  id uuid primary key default gen_random_uuid(),
  model_id text not null unique,
  name text not null,
  family_label text not null default '通用',
  best_for text not null default '多场景聊天',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint freemodels_model_id_check check (length(model_id) > 0),
  constraint freemodels_name_check check (length(name) > 0)
);

-- 启用RLS
alter table public.Freemodels enable row level security;

-- 创建索引
create index if not exists freemodels_active_sort_idx
  on public.Freemodels (is_active, sort_order);

create index if not exists freemodels_family_label_idx
  on public.Freemodels (family_label);

-- RLS策略：管理员可以完全访问
drop policy if exists "Admins can manage Freemodels" on public.Freemodels;
create policy "Admins can manage Freemodels"
  on public.Freemodels
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

-- RLS策略：普通用户只能查看启用的模型
drop policy if exists "Users can view active Freemodels" on public.Freemodels;
create policy "Users can view active Freemodels"
  on public.Freemodels
  for select
  to authenticated
  using (is_active = true);

-- RLS策略：匿名用户只能查看启用的模型
drop policy if exists "Anonymous can view active Freemodels" on public.Freemodels;
create policy "Anonymous can view active Freemodels"
  on public.Freemodels
  for select
  to anon
  using (is_active = true);

-- 插入默认模型数据（从现有配置迁移，on conflict 跳过已存在的）
insert into public.Freemodels (model_id, name, family_label, best_for, sort_order) values
  ('Qwen/Qwen3-8B', 'Qwen 3 8B', '通用', '多场景聊天', 1),
  ('deepseek-ai/DeepSeek-R1-0528-Qwen3-8B', 'DeepSeek R1 0528 8B', '推理', '高强推理', 2),
  ('THUDM/GLM-Z1-9B-0414', 'GLM Z1 9B', '通用', '综合任务', 3),
  ('Qwen/Qwen2.5-7B-Instruct', 'Qwen 2.5 7B Instruct', '指令', '稳定执行', 4),
  ('nex-agi/Nex-N2-Pro', 'Nex N2 Pro', '通用', '轻量通用对话', 5),
  ('THUDM/GLM-4-9B-0414', 'GLM 4 9B', '通用', '快速响应', 6),
  ('tencent/Hunyuan-MT-7B', 'Hunyuan MT 7B', '翻译', '多语翻译', 7),
  ('glm-4.7-flash', 'GLM-4.7-Flash', '长上下文', '200K 长上下文聊天', 8),
  ('glm-4.6v-flash', 'GLM-4.6V-Flash', '多模态', '图片、视频、文件、文本', 9)
on conflict (model_id) do nothing;

-- 创建更新时间触发器
create or replace function update_freemodels_updated_at()
returns trigger as $$begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists freemodels_updated_at_trigger on public.Freemodels;
create trigger freemodels_updated_at_trigger
  before update on public.Freemodels
  for each row
  execute function update_freemodels_updated_at();