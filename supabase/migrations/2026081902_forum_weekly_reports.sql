-- AI forum weekly reports. Reports are generated once for each completed
-- Monday-Sunday period and are public only after successful generation.
create table if not exists public.forum_weekly_reports (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  week_end date not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'failed')),
  summary text not null default '',
  metrics jsonb not null default '{}'::jsonb,
  topics jsonb not null default '[]'::jsonb,
  featured_posts jsonb not null default '[]'::jsonb,
  open_questions jsonb not null default '[]'::jsonb,
  source_post_ids uuid[] not null default '{}'::uuid[],
  model_id text not null default '',
  config_snapshot jsonb not null default '{}'::jsonb,
  generated_at timestamptz,
  error_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forum_weekly_reports_period_check check (week_end >= week_start),
  constraint forum_weekly_reports_period_unique unique (week_start, week_end)
);

create index if not exists forum_weekly_reports_published_idx
  on public.forum_weekly_reports (status, week_end desc);

alter table public.forum_weekly_reports enable row level security;

drop policy if exists "Anyone can view published forum weekly reports" on public.forum_weekly_reports;
create policy "Anyone can view published forum weekly reports"
  on public.forum_weekly_reports for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists "Admins can manage forum weekly reports" on public.forum_weekly_reports;
create policy "Admins can manage forum weekly reports"
  on public.forum_weekly_reports for all
  to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin', 'superadmin')))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin', 'superadmin')));

insert into public.lab_ai_model_configs (
  feature_key, feature_label, description, model_id, temperature, max_tokens, api_key_purpose, sort_order
) values (
  'forum-weekly-report',
  '论坛周报 AI',
  '自动总结上一完整周的论坛讨论，生成主题、帖子精选和未解决问题。',
  'Qwen/Qwen3-8B',
  0.200,
  4096,
  'chat',
  3
)
on conflict (feature_key) do update set
  feature_label = excluded.feature_label,
  description = excluded.description,
  updated_at = now();

create or replace function public.update_forum_weekly_reports_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists forum_weekly_reports_updated_at_trigger on public.forum_weekly_reports;
create trigger forum_weekly_reports_updated_at_trigger
  before update on public.forum_weekly_reports
  for each row execute function public.update_forum_weekly_reports_updated_at();

-- Optional scheduler hook. Projects that expose app.settings.supabase_url and
-- app.settings.service_role_key will invoke the Edge Function every Monday.
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net')
     and nullif(current_setting('app.settings.supabase_url', true), '') is not null
     and nullif(current_setting('app.settings.service_role_key', true), '') is not null then
    begin
      perform cron.unschedule(jobid) from cron.job where jobname = 'generate_forum_weekly_report_weekly';
    exception when undefined_table or undefined_function or invalid_schema_name then
      null;
    end;
    perform cron.schedule(
      'generate_forum_weekly_report_weekly',
      '15 1 * * 1',
      format($cmd$
        select net.http_post(
          url := %L || '/functions/v1/generate-forum-weekly-report',
          headers := jsonb_build_object('Authorization', 'Bearer ' || %L, 'Content-Type', 'application/json'),
          body := jsonb_build_object('trigger', 'pg_cron')
        );
      $cmd$, current_setting('app.settings.supabase_url'), current_setting('app.settings.service_role_key'))
    );
  else
    raise notice '未配置 pg_cron/pg_net 或 app.settings，已跳过论坛周报自动调度。';
  end if;
exception when others then
  raise notice '创建论坛周报定时任务失败：%', coalesce(sqlerrm, 'UNKNOWN_ERROR');
end;
$cron$;
