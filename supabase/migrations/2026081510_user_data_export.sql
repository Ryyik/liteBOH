begin;

-- =============================================
-- 用户数据导出（仿 X 的异步导出体验）
-- 表：user_data_export_jobs（任务与进度）
-- 桶：user-exports（私有，仅 Edge Function service_role 写入，
--     用户通过短时效签名 URL 下载）
-- =============================================

create table if not exists public.user_data_export_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'processing',      -- processing | ready | failed | cancelled | expired
  stage text not null default '准备中',            -- 展示用阶段文案
  progress smallint not null default 0,           -- 0-100
  totals jsonb not null default '{}'::jsonb,      -- 各模块条数统计（完成后即 manifest 摘要）
  file_path text,                                 -- user-exports 桶内对象路径
  file_size bigint,                               -- ZIP 字节大小
  error text,                                     -- 失败原因
  requested_at timestamp with time zone not null default now(),
  completed_at timestamp with time zone,
  expires_at timestamp with time zone,            -- ready 后 7 天过期
  last_active_at timestamp with time zone not null default now()
);

create index if not exists idx_user_data_export_jobs_user_requested
  on public.user_data_export_jobs (user_id, requested_at desc);

create index if not exists idx_user_data_export_jobs_status
  on public.user_data_export_jobs (status, expires_at);

alter table public.user_data_export_jobs enable row level security;

-- 本人只能读自己的任务；所有写入均由 Edge Function 使用 service_role 完成
drop policy if exists user_data_export_jobs_owner_select on public.user_data_export_jobs;
create policy user_data_export_jobs_owner_select on public.user_data_export_jobs
  for select to authenticated
  using (user_id = auth.uid());

grant select on table public.user_data_export_jobs to authenticated;
grant all on table public.user_data_export_jobs to service_role;

-- =============================================
-- 私有存储桶 user-exports
-- 不设任何面向 authenticated 的 storage 策略：
-- 上传/删除走 service_role，下载走短时效签名 URL
-- =============================================
insert into storage.buckets (id, name, public)
values ('user-exports', 'user-exports', false)
on conflict (id) do nothing;

commit;
