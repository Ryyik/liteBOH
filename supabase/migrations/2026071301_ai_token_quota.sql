-- Convert BOH AI quota accounting from request counts to daily token usage.
-- Existing count columns stay in place for rollback compatibility.

alter table public.ai_quota_config
  add column if not exists daily_token_limit bigint;

update public.ai_quota_config
set daily_token_limit = case lower(tier)
  when 'guest' then 200000
  when 'free' then 1000000
  when 'plus' then 2000000
  when 'pro' then 3000000
  when 'max' then 5000000
  when 'ultra' then 10000000
  when 'boh-ai-plus' then 2000000
  when 'boh-pro' then 3000000
  when 'boh-max' then 5000000
  else greatest(coalesce(daily_limit, 0), 0)::bigint * 10000
end
where daily_token_limit is null;

alter table public.ai_quota_config
  alter column daily_token_limit set not null;

alter table public.ai_quota_config
  add constraint ai_quota_config_daily_token_limit_check
  check (daily_token_limit >= -1);

alter table public.ai_quota_log
  add column if not exists prompt_tokens integer not null default 0,
  add column if not exists completion_tokens integer not null default 0,
  add column if not exists total_tokens integer not null default 0,
  add column if not exists billed_tokens integer not null default 0,
  add column if not exists status text not null default 'success';

alter table public.ai_quota_log
  add constraint ai_quota_log_token_values_check
  check (
    prompt_tokens >= 0
    and completion_tokens >= 0
    and total_tokens >= 0
    and billed_tokens >= 0
  );

create or replace function public.get_ai_token_usage_since(
  p_user_id uuid,
  p_ip_address text,
  p_since timestamptz
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(log.billed_tokens), 0)::bigint
  from public.ai_quota_log as log
  where log.created_at >= p_since
    and (
      (p_user_id is not null and log.user_id = p_user_id)
      or (
        p_user_id is null
        and p_ip_address is not null
        and log.ip_address = p_ip_address
      )
    );
$$;

revoke all on function public.get_ai_token_usage_since(uuid, text, timestamptz) from public;
grant execute on function public.get_ai_token_usage_since(uuid, text, timestamptz) to service_role;

comment on column public.ai_quota_config.daily_token_limit is
  'Daily BOH AI token allowance, reset at Asia/Shanghai midnight. -1 means unlimited.';
comment on column public.ai_quota_log.billed_tokens is
  'Tokens charged to quota. Normally equals total_tokens; estimated when upstream usage is unavailable.';
