# Moderation Jobs Runbook

> Deprecated on 2026-05-08. The app is currently using frontend local
> keyword precheck plus browser-triggered SiliconFlow async AI review. Run
> `supabase/migrations/20260508_zzzzzz_disable_moderation_jobs_queue.sql` and
> remove any Supabase Cron job that calls `moderation-worker` before treating
> this runbook as historical reference.

This queue makes moderation durable: content writes enqueue jobs in Postgres, and
`moderation-worker` drains them with retries.

## Required Secrets

Set these for Supabase Edge Functions:

```bash
supabase secrets set MODERATION_WORKER_SECRET="<long-random-secret>"
supabase secrets set MODERATION_API_KEY="<siliconflow-or-compatible-api-key>"
supabase secrets set MODERATION_MODEL_ID="Qwen/Qwen2.5-7B-Instruct"
```

`MODERATION_API_URL` is optional and defaults to SiliconFlow chat completions.

## Deploy

```bash
supabase db push
supabase functions deploy moderation-worker
```

When deploying from the Supabase Dashboard editor, paste
`supabase/functions/moderation-worker/index.ts` as a single file. It is
self-contained and does not require the repository `_shared` files.

## Manual Smoke Test

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/moderation-worker" \
  -H "Authorization: Bearer <MODERATION_WORKER_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"limit": 5}'
```

Expected shape:

```json
{
  "ok": true,
  "claimed": 0,
  "results": []
}
```

## Scheduling

Run the worker every minute. Use any scheduler that can send a POST request with
the worker secret. Keep `limit` small, such as 10-20, unless the queue grows.

## Monitoring Queries

Queue health:

```sql
select status, count(*), min(created_at), max(updated_at)
from public.moderation_jobs
group by status
order by status;
```

Stuck jobs:

```sql
select *
from public.moderation_jobs
where status in ('pending', 'running')
  and created_at < now() - interval '15 minutes'
order by created_at asc;
```

Failed jobs:

```sql
select target_type, count(*) as failed_count, max(last_error) as latest_error
from public.moderation_jobs
where status = 'failed'
group by target_type;
```

Moderation output:

```sql
select target_type, ai_result, count(*), max(created_at) as latest_at
from public.moderation_logs
where created_at > now() - interval '24 hours'
group by target_type, ai_result
order by latest_at desc;
```
