-- 修复 #2：boh_cloud_entries.image_count 防伪造
-- 背景：2026042701 授予 authenticated 对 boh_cloud_entries 的表级 insert/update，
-- 用户可通过直接 UPDATE image_count 伪造图片用量统计（绕过 2026081511 引入的重算机制）。
-- 处理：收回 authenticated 对该列的写入权限（列级 revoke，其余列的表级权限不受影响）。
-- 兼容性说明：
--   - 重算触发器 trg_00_boh_cloud_entries_set_image_count（2026081511）为 BEFORE 触发器，
--     在 insert/update of content_blocks 时直接改写 NEW 行值，不经过 SQL 解析层的列级权限检查，
--     因此 revoke 后正常的内容写入路径（只提交 content_blocks）不受任何影响；
--   - service_role 保持表级 grant all，列级 revoke 不作用于其它角色，Edge Function 不受影响。
begin;

revoke update (image_count), insert (image_count) on table public.boh_cloud_entries from authenticated;

commit;
