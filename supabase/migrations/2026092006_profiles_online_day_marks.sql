-- 2026092006_profiles_online_day_marks.sql
-- 智能概览天粒度标记上云：让「上次在线日」与「当日已检查」跨设备生效。
--
-- 背景：此前两个天粒度游标只存在浏览器 localStorage（boh_overview_last_online_day /
-- boh_overview_checked_day），换设备后：
--   1) 「你离开了 N 天」与推送窗口只能靠心跳锚点 profiles.last_active_at 兜底，而它会被
--      任意一次登录/刷新顶成「今天」，长离线窗口直接塌成 0；
--   2) 同一天在两台设备上会各推一次。
--
-- 本迁移把这两个值落到 profiles（亚洲/上海自然日，与 get_offline_overview /
-- get_weekly_checkin_status 时区口径一致），并用一个 RPC 做「读旧值 + 写今天」的原子往返：
--   mark_overview_state(p_checked) →
--     { today, previous_online_day, checked_day }
-- 客户端在会话启动时调一次（p_checked=false，拿上次在线日），检查成功后调一次
-- （p_checked=true，写当日已检查）。读旧值必须在写今天之前，否则「上次在线日」永远等于今天。
--
-- 权限：函数用 security definer（与 update_last_active_at 同款），函数体只读写 auth.uid()
-- 自己的那一行，不引入新的数据面；profiles 的 RLS 策略无需改动。

begin;

alter table public.profiles
  add column if not exists last_online_day date,
  add column if not exists overview_checked_day date;

comment on column public.profiles.last_online_day is
  '真实上次在线日（Asia/Shanghai 自然日）：会话启动时经 mark_overview_state 落盘，用于智能概览的离线窗口与「你离开了 N 天」。';
comment on column public.profiles.overview_checked_day is
  '智能概览当日已检查日（Asia/Shanghai 自然日）：检查成功后落盘，用于同日去重（跨设备不再重复推送）。';

create or replace function public.mark_overview_state(p_checked boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Shanghai')::date;
  v_prev_online_day date;
  v_checked_day date;
begin
  if v_uid is null then
    raise exception '概览天粒度标记需要登录后使用';
  end if;

  -- 先读旧值：写今天之前拿到「上次在线日」，否则窗口永远塌成今天
  select last_online_day, overview_checked_day
    into v_prev_online_day, v_checked_day
    from public.profiles
   where id = v_uid;

  update public.profiles
     set last_online_day = v_today,
         overview_checked_day = case when coalesce(p_checked, false) then v_today else overview_checked_day end
   where id = v_uid;

  return jsonb_build_object(
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'previous_online_day', case when v_prev_online_day is null then null else to_char(v_prev_online_day, 'YYYY-MM-DD') end,
    'checked_day', case when v_checked_day is null then null else to_char(v_checked_day, 'YYYY-MM-DD') end
  );
end;
$$;

revoke all on function public.mark_overview_state(boolean) from public;
revoke execute on function public.mark_overview_state(boolean) from anon;
grant execute on function public.mark_overview_state(boolean) to authenticated;
grant execute on function public.mark_overview_state(boolean) to service_role;

comment on function public.mark_overview_state(boolean) is
  '智能概览天粒度标记：返回写入前的「上次在线日」与「当日已检查日」（Asia/Shanghai），并把上次在线日推进到今天；p_checked=true 时同时把当日已检查日推进到今天。仅作用于调用者本人。';

notify pgrst, 'reload schema';

commit;