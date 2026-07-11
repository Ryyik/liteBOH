-- 免费模型库增加 provider 字段，支持多平台模型管理
alter table public.freemodels
  add column if not exists provider text not null default 'siliconflow',
  add column if not exists provider_label text,
  add column if not exists api_base_url text;

-- 为现有数据回填 provider_label
update public.freemodels
set provider_label = 'SiliconFlow'
where provider_label is null;

-- 增加索引
create index if not exists freemodels_provider_idx
  on public.freemodels (provider);
