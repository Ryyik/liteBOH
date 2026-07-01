-- 原子限流检查 RPC：单次 DB 往返完成"检查+自增+窗口过期重置"
-- 替代 rate-limiter.ts 中 SELECT + UPSERT/RPC 的多往返方案
-- 支持自定义窗口秒数（原 increment_rate_limit 硬编码 1 小时，不适用于 60 秒窗口）

create or replace function public.check_rate_limit(
  p_key text,
  p_max_requests integer,
  p_window_seconds integer
)
returns table(allowed boolean, current_count integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_reset_at timestamptz;
begin
  -- 原子 INSERT ... ON CONFLICT DO UPDATE：
  -- 新键 / 窗口已过期 → count 重置为 1，reset_at 刷新
  -- 窗口有效 → count 自增 1，reset_at 保持不变
  insert into public._rate_limits (key, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update
    set count = case
      when public._rate_limits.reset_at <= now() then 1
      else public._rate_limits.count + 1
    end,
    reset_at = case
      when public._rate_limits.reset_at <= now() then now() + make_interval(secs => p_window_seconds)
      else public._rate_limits.reset_at
    end
  returning count, reset_at into v_count, v_reset_at;

  if v_count > p_max_requests then
    return query select false, v_count, greatest(0, ceil(extract(epoch from (v_reset_at - now()))))::integer;
  else
    return query select true, v_count, 0;
  end if;
end;
$$;

revoke execute on function public.check_rate_limit(text, integer, integer) from public;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
