begin;

-- Frontend async-AI moderation mode:
-- keep existing moderation_jobs data for inspection, but stop automatic DB enqueueing.
-- Content writes use frontend local precheck first, then browser-triggered SiliconFlow AI review.
drop trigger if exists trg_queue_post_moderation_job on public.posts;
drop trigger if exists trg_queue_comment_moderation_job on public.comments;
drop trigger if exists trg_queue_message_moderation_job on public.messages;

do $$
begin
  if to_regclass('public.moderation_jobs') is not null then
    update public.moderation_jobs
       set status = 'canceled',
           last_error = 'server moderation queue disabled',
           locked_until = null,
           worker_id = null
     where status in ('pending', 'running');

    comment on table public.moderation_jobs is
      'Disabled on 2026-05-08: moderation uses frontend local precheck plus browser-triggered SiliconFlow AI review.';
  end if;
end;
$$;

do $$
declare
  rec record;
begin
  for rec in
    select p.oid::regprocedure as fn
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'claim_moderation_jobs',
         'complete_moderation_job',
         'fail_moderation_job'
       )
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      rec.fn
    );
  end loop;
end;
$$;

commit;
