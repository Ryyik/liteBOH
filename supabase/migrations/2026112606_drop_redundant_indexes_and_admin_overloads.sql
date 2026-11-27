-- 删除已确认无调用方的旧 admin 重载，并与线上并发删除的冗余索引保持结构一致。

begin;

drop function if exists public.admin_ban_user(uuid, text, timestamptz, uuid);
drop function if exists public.admin_mute_user(uuid, text, timestamptz, uuid);
drop function if exists public.admin_unban_user(uuid, uuid);
drop function if exists public.admin_unmute_user(uuid, uuid);

drop index if exists public.idx_boh_cloud_share_channels_active_token;
drop index if exists public.lottery_eligibility_exclusions_active_idx;
drop index if exists public.idx_boh_ai_shared_memories_owner_updated;
drop index if exists public.idx_boh_treehole_memories_user_updated;

notify pgrst, 'reload schema';

commit;
