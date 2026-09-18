-- 修复 2026091801 的权限遗漏：anon 缺 avatar_frames 的 select
--
-- 起因：2026091801 里写了
--   revoke all on table public.avatar_frames from anon, authenticated;
--   grant select, insert, update, delete on table public.avatar_frames to authenticated;
-- 只把权限授给了 authenticated，**漏了 anon**。而 RLS policy 是
--   for select to anon, authenticated using (status = 'published' or ...)
-- —— policy 允许，但表级权限没给，PostgREST 直接以 42501 拒绝：
--   {"code":"42501","message":"permission denied for table avatar_frames"}
--
-- 影响：未登录游客读不到头像框清单 → 论坛/他人主页里游客看不到任何头像框（含内置 5 框，
-- 因为清单是整表读取）。登录用户不受影响，所以单机 mock 探针全部通过、真库 curl 才暴露。
--
-- 修复：把 select 授给 anon（只读；写权限仍只保留给 authenticated 且受 admin policy 约束）。

begin;

grant select on table public.avatar_frames to anon;

commit;
