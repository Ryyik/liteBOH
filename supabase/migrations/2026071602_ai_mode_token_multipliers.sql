-- Configurable BOH AI usage policies.
-- Mode IDs are normalized with trim/lower so Ultra, ULTRA and ultra are equivalent.

alter table public.bohai_model_configs
  add column if not exists quota_multiplier numeric(6, 2) not null default 1;

alter table public.bohai_model_configs
  drop constraint if exists bohai_model_configs_quota_multiplier_check;
alter table public.bohai_model_configs
  add constraint bohai_model_configs_quota_multiplier_check
  check (quota_multiplier >= 0.1 and quota_multiplier <= 100);

update public.bohai_model_configs
set quota_multiplier = case lower(trim(mode_id))
  when 'pro' then 2
  when 'max' then 3
  when 'ultra' then 4
  else quota_multiplier
end
where quota_multiplier = 1;

alter table public.ai_quota_config
  add column if not exists web_search_daily_limit integer not null default 0;

alter table public.ai_quota_config
  drop constraint if exists ai_quota_config_web_search_daily_limit_check;
alter table public.ai_quota_config
  add constraint ai_quota_config_web_search_daily_limit_check
  check (web_search_daily_limit >= -1);

update public.ai_quota_config
set web_search_daily_limit = case lower(tier)
  when 'guest' then 0
  when 'free' then 10
  when 'plus' then 30
  when 'boh-ai-plus' then 30
  when 'pro' then 60
  when 'boh-pro' then 60
  when 'max' then 120
  when 'boh-max' then 120
  when 'ultra' then 240
  else web_search_daily_limit
end
where web_search_daily_limit = 0;

create or replace function public.get_ai_mode_token_multiplier(p_mode text)
returns numeric
language sql
stable
set search_path = public
as $$
  select greatest(0.1, coalesce((
    select config.quota_multiplier
      from public.bohai_model_configs as config
     where lower(trim(config.mode_id)) = lower(trim(coalesce(p_mode, '')))
     order by config.updated_at desc
     limit 1
  ), case lower(trim(coalesce(p_mode, '')))
    when 'pro' then 2 when 'max' then 3 when 'ultra' then 4 else 1
  end));
$$;

create or replace function public.settle_ai_token_quota(
  p_reservation_id uuid,
  p_prompt_tokens integer,
  p_completion_tokens integer,
  p_total_tokens integer,
  p_model text,
  p_mode text,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.ai_token_reservations%rowtype;
  v_total_tokens integer := greatest(0, coalesce(p_total_tokens, 0));
  v_billed_tokens integer;
begin
  select * into v_reservation
    from public.ai_token_reservations
   where id = p_reservation_id
   for update;
  if not found or v_reservation.status <> 'pending' then
    return false;
  end if;

  v_billed_tokens := least(
    2147483647::bigint,
    ceil(v_total_tokens::numeric * public.get_ai_mode_token_multiplier(p_mode))::bigint
  )::integer;

  insert into public.ai_quota_log (
    user_id, ip_address, model, mode,
    prompt_tokens, completion_tokens, total_tokens, billed_tokens, status, created_at
  ) values (
    v_reservation.user_id, v_reservation.ip_address,
    left(coalesce(p_model, ''), 120), lower(left(trim(coalesce(p_mode, '')), 80)),
    greatest(0, coalesce(p_prompt_tokens, 0)),
    greatest(0, coalesce(p_completion_tokens, 0)),
    v_total_tokens, v_billed_tokens,
    left(coalesce(p_status, 'success'), 80), now()
  );

  update public.ai_token_reservations
     set status = 'settled', settled_at = now()
   where id = p_reservation_id;
  return true;
end;
$$;

create or replace function public.admin_reset_all_ai_quotas()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token_logs integer := 0;
  v_reservations integer := 0;
  v_web_logs integer := 0;
  v_today_start timestamptz := date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai';
begin
  if auth.uid() is null or not public.current_user_is_admin() then
    raise exception '仅管理员可重置 AI 额度' using errcode = '42501';
  end if;

  delete from public.ai_token_reservations where created_at >= v_today_start;
  get diagnostics v_reservations = row_count;
  delete from public.ai_quota_log where created_at >= v_today_start;
  get diagnostics v_token_logs = row_count;
  delete from public.ai_web_search_log where created_at >= v_today_start;
  get diagnostics v_web_logs = row_count;

  return jsonb_build_object(
    'ok', true,
    'tokenLogsDeleted', v_token_logs,
    'reservationsDeleted', v_reservations,
    'webSearchLogsDeleted', v_web_logs,
    'resetAt', now()
  );
end;
$$;

revoke all on function public.get_ai_mode_token_multiplier(text) from public;
revoke all on function public.settle_ai_token_quota(uuid, integer, integer, integer, text, text, text) from public;
revoke all on function public.admin_reset_all_ai_quotas() from public;
grant execute on function public.get_ai_mode_token_multiplier(text) to service_role;
grant execute on function public.settle_ai_token_quota(uuid, integer, integer, integer, text, text, text) to service_role;
grant execute on function public.admin_reset_all_ai_quotas() to authenticated, service_role;

comment on function public.get_ai_mode_token_multiplier(text) is
  'Case-insensitive BOH AI quota multiplier read from bohai_model_configs.';
comment on column public.ai_quota_log.billed_tokens is
  'Tokens charged to quota after applying the case-insensitive model mode multiplier.';
comment on column public.bohai_model_configs.quota_multiplier is
  'Quota tokens billed per actual model token for this mode.';
comment on column public.ai_quota_config.web_search_daily_limit is
  'Daily successful or pending Web Searching requests. -1 means unlimited.';
