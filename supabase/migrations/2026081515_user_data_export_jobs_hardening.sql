-- 修复 #4：user_data_export_jobs 加固（并发双插入 + 权限纵深防御）
-- 背景：Edge Function 的 handleCreate 虽有"不允许并行任务"前置检查（2026081510 之后的实现），
-- 但 check-then-insert 存在竞态窗口，并发双击可插入两条 processing 任务；同时表上默认权限
-- 对 anon/authenticated 授予了超出需要的写权限，属纵深防御缺口。
-- 处理：
--   - 先清理历史重复数据（每用户仅保留最新一条 processing），再建立部分唯一索引
--     在 DB 层强制"同一用户同时最多一条 processing"；
--   - anon 收回全部权限；authenticated 仅保留 select（2026081510 已授），
--     所有写入均由 Edge Function 使用 service_role 完成，不受影响。
begin;

-- 清理可能已存在的重复 processing 行（保留每用户 requested_at 最新的一条；
-- requested_at 相同的并列行按 id 决胜，保证确定性）。失败语义与 Edge Function
-- 的 markStaleJobsFailed（status='failed'）一致。幂等：无重复时更新 0 行。
update public.user_data_export_jobs j
   set status = 'failed',
       stage = '导出中断',
       error = left(coalesce(j.error, '检测到重复的导出任务，已自动失效'), 500),
       completed_at = coalesce(j.completed_at, now())
 where j.status = 'processing'
   and exists (
     select 1 from public.user_data_export_jobs newer
      where newer.user_id = j.user_id
        and newer.status = 'processing'
        and (newer.requested_at, newer.id) > (j.requested_at, j.id)
   );

create unique index if not exists user_data_export_jobs_one_processing
  on public.user_data_export_jobs (user_id) where status = 'processing';

-- 纵深防御：写入仅允许 service_role（2026081510 已 grant all，保持不变）
revoke all on table public.user_data_export_jobs from anon;
revoke insert, update, delete on table public.user_data_export_jobs from authenticated;

commit;
