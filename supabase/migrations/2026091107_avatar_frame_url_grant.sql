-- 修复头像框「自己可见、他人不可见」线上 bug
--
-- 起因链：
--   1) 2026091106 给 public.profiles 加了 avatar_frame_url text 列（Phase 2 他人可见数据落点）
--      并让 list_forum_posts RPC / 帖子·评论 embed 带出该字段。
--   2) 但 2026090803 ④ 已将 profiles 的 update 收敛为「authenticated 列级白名单 26 列」，
--      select 收敛为「anon 列级白名单」（均不含 avatar_frame_url）。新列漏加权限。
--   3) 佩戴 equip → persistFrameToServer 用 .from('profiles').update({ avatar_frame_url })
--      被 PostgREST 以 column privilege 拒绝；该函数仅 logger.warn 静默吞错，
--      故 profiles.avatar_frame_url 永远为空 → 自己（读 localStorage）可见、他人（读服务端）不可见。
--   4) 同理 anon 缺该列 select 权限：未登录游客走 RPC/embed 读该列会被拒，列表可能整体失败。
--
-- 修复：把 avatar_frame_url 追加进列级权限（grant 为累加语义，不影响既有 26 列白名单）。
--   - update 给 authenticated：佩戴上库可落库（核心修复）
--   - select 给 anon：游客也能看到他人头像框（完善「别人都可看见」诉求，并避免游客列表 400/500）

begin;

grant update (avatar_frame_url) on table public.profiles to authenticated;

grant select (avatar_frame_url) on table public.profiles to anon;

commit;
