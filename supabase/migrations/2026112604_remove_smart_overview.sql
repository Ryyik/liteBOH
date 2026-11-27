-- 智能概览退场：删除专属 RPC 与跨设备天粒度标记。
-- 论坛「上次看到这里」继续使用 profiles.last_active_at，本迁移不动该列。

begin;

drop function if exists public.get_offline_overview(timestamptz, integer, integer);
drop function if exists public.mark_overview_state(boolean);

alter table public.profiles
  drop column if exists last_online_day,
  drop column if exists overview_checked_day;

notify pgrst, 'reload schema';

commit;
