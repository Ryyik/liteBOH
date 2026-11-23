-- ============================================================================
-- 2026-11-23 边缘落点采样（诊断「不是所有地区都能流畅打开」）
--
-- 背景（2026-11-23 两个真实样本）：
--   · 本机（国内）            → /cdn-cgi/trace 返回 colo=LAX
--   · 朋友（中国移动 CMNET，微信内置浏览器）→ colo=LHR（伦敦）
--   同一域名、同一 anycast 段，国内用户被 BGP 分别丢到**美国**和**欧洲**。
--
-- 这解释了那条报障：Cloudflare 免费版没有中国大陆节点，大陆用户落到哪个 POP
--   由「运营商 → anycast 段」的 BGP 选路决定，**对站点方完全不可控**；
--   然后每个未命中的请求还要从那个 POP 回源到美西的 GitHub Pages。
--
-- 但在此之前只有零散口述，**没有任何量化依据**，于是两个关键决策都做不了：
--   ① 是「小概率长尾」（做体感兜底即可），还是「移动用户普遍受损」（必须立项）；
--   ② 要不要上多入口 / 走备案 —— 取决于受损面到底多大。
--
-- 本迁移只做三件事：
--   1. 建一张**只进不出**的采样表（对外不可读，避免变成公开的行为数据源）；
--   2. 给 anon 一个**受校验**的写入函数（不是裸 INSERT：字符集/长度/范围全卡死）；
--   3. 给管理员一个聚合读取函数（只返回分布，不返回 client_key）。
--
-- 隐私口径（刻意收窄，与 2026-10-17 全面审查 P1-6 的脱敏口径一致）：
--   · 不存完整 IP —— 只存 /24（前三段），够反查 ASN，不足以定位到人；
--   · 不存 UA、不存 URL、不存 referer、不存账号；
--   · client_key 是浏览器本地生成的随机 UUID，与用户 id 无任何关联；
--   · 30 天后自动清理（pg_cron 每日 04:17 UTC）。
--
-- 写入量：每台设备每天最多 1 行（unique(client_key, probe_day) + on conflict do nothing）。
--
-- 怎么读（管理员，直接在 SQL Editor 跑）：
--   select public.admin_edge_probe_report(7);
--   → { totals, by_colo[], by_prefix[] }
--   by_prefix 里的 ip24 拿去 whois / RADB 反查 ASN，才能回答「移动 vs 电信」。
--
-- 幂等：全部 if not exists / create or replace / 先 unschedule 再 schedule。
-- ============================================================================

begin;

create table if not exists public.edge_probe_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  probe_day date not null default ((now() at time zone 'utc'))::date,
  client_key text not null,
  colo text not null,
  loc text,
  http_version text,
  tls_version text,
  ip24 inet,
  ttfb_ms integer,
  load_ms integer,
  constraint edge_probe_colo_fmt check (colo ~ '^[A-Z]{3}$'),
  constraint edge_probe_loc_fmt check (loc is null or loc ~ '^[A-Z]{2}$'),
  constraint edge_probe_client_key_len check (char_length(client_key) between 8 and 64),
  constraint edge_probe_meta_len check (
    (http_version is null or char_length(http_version) <= 16)
    and (tls_version is null or char_length(tls_version) <= 16)
  ),
  constraint edge_probe_ttfb_range check (ttfb_ms is null or (ttfb_ms >= 0 and ttfb_ms <= 600000)),
  constraint edge_probe_load_range check (load_ms is null or (load_ms >= 0 and load_ms <= 600000))
);

comment on table public.edge_probe_events is
  '边缘落点采样：每台设备每天最多一行，用于量化「国内用户被 Cloudflare 丢到哪个 POP」。不存完整 IP / UA / URL。';

comment on column public.edge_probe_events.ip24 is
  '客户端 IP 的前三段（/24）。只为反查 ASN/运营商，不可用于定位到个人。';

-- 同一设备同一天只留一行：多标签页 / PWA 重开 / 回访都不重复计数。
create unique index if not exists edge_probe_events_client_day_uidx
  on public.edge_probe_events (client_key, probe_day);

create index if not exists edge_probe_events_day_colo_idx
  on public.edge_probe_events (probe_day desc, colo);

alter table public.edge_probe_events enable row level security;

-- 刻意**不允许任何端读取**。写 policy 写成 using(false) 而不是「不建 policy」：
-- 后者会被 Supabase advisor 报 "RLS Enabled No Policy"，而 check:db-advisors 是棘轮，
-- 会逼着为一条有意为之的设计去改基线。功能完全等价（一律拒绝），但不多出一条噪声。
drop policy if exists edge_probe_events_no_read on public.edge_probe_events;
create policy edge_probe_events_no_read on public.edge_probe_events
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on public.edge_probe_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 写入：唯一的入口。参数全部校验，非法值直接返回 false（不抛错，避免前端噪声）。
-- ---------------------------------------------------------------------------
create or replace function public.record_edge_probe(
  p_client_key text,
  p_colo text,
  p_loc text default null,
  p_http_version text default null,
  p_tls_version text default null,
  p_ip text default null,
  p_ttfb_ms integer default null,
  p_load_ms integer default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_ip24 inet := null;
  v_inserted boolean := false;
begin
  -- client_key：随机 UUID，长度卡死后连脏数据都进不来
  if p_client_key is null or p_client_key !~ '^[A-Za-z0-9-]{8,64}$' then
    return false;
  end if;

  -- colo：三个大写字母（Cloudflare 的 IATA 码，如 LHR / LAX / HKG）
  if p_colo is null or p_colo !~ '^[A-Z]{3}$' then
    return false;
  end if;

  if p_loc is not null and p_loc !~ '^[A-Z]{2}$' then
    return false;
  end if;

  -- 只留 /24：network() 会把主机位清零，set_masklen 只改掩码（地址仍完整）——
  -- 两者顺序不能反，否则存进去的还是完整 IP。
  if p_ip is not null and p_ip ~ '^[0-9a-fA-F:.]{7,45}$' then
    begin
      v_ip24 := network(set_masklen(p_ip::inet, 24))::inet;
    exception
      when others then
        v_ip24 := null;
    end;
  end if;

  insert into public.edge_probe_events (
    client_key, colo, loc, http_version, tls_version, ip24, ttfb_ms, load_ms
  )
  values (
    p_client_key,
    p_colo,
    nullif(p_loc, ''),
    nullif(left(p_http_version, 16), ''),
    nullif(left(p_tls_version, 16), ''),
    v_ip24,
    case when p_ttfb_ms between 0 and 600000 then p_ttfb_ms else null end,
    case when p_load_ms between 0 and 600000 then p_load_ms else null end
  )
  on conflict (client_key, probe_day) do nothing;

  v_inserted := found;
  return v_inserted;
end;
$function$;

comment on function public.record_edge_probe(text, text, text, text, text, text, integer, integer) is
  '落点采样的唯一写入口。参数非法返回 false；同一 client_key 同一天只写一行。';

revoke all on function public.record_edge_probe(text, text, text, text, text, text, integer, integer) from public;
grant execute on function public.record_edge_probe(text, text, text, text, text, text, integer, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 读取：只给管理员，且只返回聚合分布（不返回 client_key，样本量小于 5 的前缀也抹掉，
-- 避免「一个人的 /24」被当成分布读）。
-- ---------------------------------------------------------------------------
create or replace function public.admin_edge_probe_report(p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_since timestamptz := now() - make_interval(days => greatest(coalesce(p_days, 7), 1));
  v_result jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select jsonb_build_object(
    'window_days', greatest(coalesce(p_days, 7), 1),
    'totals', jsonb_build_object(
      'samples', count(*),
      'devices', count(distinct client_key),
      -- 落在「亚太核心 POP」之外的样本占比：这才是真正决定体感的那个数
      'outside_apac_share', coalesce(round(
        100.0 * count(*) filter (where colo not in ('HKG', 'NRT', 'KIX', 'ICN', 'TPE', 'SIN', 'SJC', 'LAX', 'SEA'))
        / nullif(count(*), 0), 1), 0),
      'median_ttfb_ms', coalesce(percentile_disc(0.5) within group (order by ttfb_ms), 0)
    ),
    'by_colo', coalesce((
      select jsonb_agg(row_to_json(t) order by t.samples desc)
        from (
          select colo,
                 count(*) as samples,
                 count(distinct client_key) as devices,
                 round(100.0 * count(*) / nullif(sum(count(*)) over (), 0), 1) as pct,
                 coalesce(percentile_disc(0.5) within group (order by ttfb_ms), 0) as median_ttfb_ms,
                 max(created_at) as last_seen
            from public.edge_probe_events
           where created_at >= v_since
           group by colo
        ) t
    ), '[]'::jsonb),
    'by_prefix', coalesce((
      select jsonb_agg(row_to_json(t) order by t.samples desc)
        from (
          select host(ip24) as ip24_prefix, colo, count(*) as samples
            from public.edge_probe_events
           where created_at >= v_since and ip24 is not null
           group by 1, 2
          having count(*) >= 5
        ) t
    ), '[]'::jsonb)
  )
  into v_result
  from public.edge_probe_events
  where created_at >= v_since;

  return v_result;
end;
$function$;

comment on function public.admin_edge_probe_report(integer) is
  '管理员只读聚合：按 colo 的样本分布 + 中位 TTFB，以及按 /24 前缀的分布（供 whois 反查 ASN）。';

revoke all on function public.admin_edge_probe_report(integer) from public;
grant execute on function public.admin_edge_probe_report(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 保留期：30 天。没有 pg_cron 就只留 notice（不影响迁移成功）。
-- ---------------------------------------------------------------------------
do $cron$
declare
  v_has_pg_cron boolean := false;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_pg_cron;
  if not v_has_pg_cron then
    raise notice 'edge_probe 保留期未注册：需要 pg_cron。请手工按 30 天清理。';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'edge_probe_retention') then
    perform cron.unschedule('edge_probe_retention');
  end if;

  perform cron.schedule(
    'edge_probe_retention',
    '17 4 * * *',
    $job$delete from public.edge_probe_events where created_at < now() - interval '30 days'$job$
  );
end;
$cron$;

commit;
