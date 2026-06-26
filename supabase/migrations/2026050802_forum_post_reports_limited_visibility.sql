begin;

do $$
declare
  rec record;
begin
  for rec in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.posts'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('alter table public.posts drop constraint %I', rec.conname);
  end loop;
end;
$$;

alter table public.posts
  alter column status set default 'approved',
  alter column status set not null;

alter table public.posts
  add constraint posts_status_check
  check (status in ('approved', 'limited', 'rejected'));

drop policy if exists "Public can view all posts" on public.posts;
drop policy if exists "任何人都可以查看帖子" on public.posts;
drop policy if exists posts_select_visible on public.posts;
create policy posts_select_visible
  on public.posts
  for select
  to anon, authenticated
  using (
    coalesce(status, 'approved') = 'approved'
    or auth.uid() = author_id
    or public.current_user_is_admin()
  );

drop policy if exists "Public read comments" on public.comments;
drop policy if exists comments_select_visible on public.comments;
create policy comments_select_visible
  on public.comments
  for select
  to anon, authenticated
  using (
    exists (
      select 1
        from public.posts p
       where p.id = comments.post_id
         and (
           public.current_user_is_admin()
           or auth.uid() = p.author_id
           or (
             coalesce(p.status, 'approved') = 'approved'
             and coalesce(comments.status, 'approved') = 'approved'
           )
         )
    )
  );

alter table public.notifications
  add column if not exists content text null;

create table if not exists public.forum_post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  post_author_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null default 'other',
  detail text not null default '',
  status text not null default 'active' check (status in ('active', 'dismissed', 'accepted')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  resolved_by uuid null references public.profiles(id) on delete set null,
  resolution_note text null,
  constraint forum_post_reports_reason_len check (char_length(reason) between 1 and 48),
  constraint forum_post_reports_detail_len check (char_length(detail) <= 500),
  constraint forum_post_reports_not_self check (reporter_id <> post_author_id),
  unique (post_id, reporter_id)
);

create index if not exists idx_forum_post_reports_post_active_created
  on public.forum_post_reports (post_id, created_at desc)
  where status = 'active';

create index if not exists idx_forum_post_reports_reporter_created
  on public.forum_post_reports (reporter_id, created_at desc);

create index if not exists idx_forum_post_reports_author_created
  on public.forum_post_reports (post_author_id, created_at desc);

alter table public.forum_post_reports enable row level security;

drop policy if exists forum_post_reports_select_related on public.forum_post_reports;
create policy forum_post_reports_select_related
  on public.forum_post_reports
  for select
  to authenticated
  using (
    reporter_id = auth.uid()
    or public.current_user_is_admin()
  );

drop policy if exists forum_post_reports_insert_own on public.forum_post_reports;
create policy forum_post_reports_insert_own
  on public.forum_post_reports
  for insert
  to authenticated
  with check (reporter_id = auth.uid() and reporter_id <> post_author_id);

drop policy if exists forum_post_reports_admin_update on public.forum_post_reports;
create policy forum_post_reports_admin_update
  on public.forum_post_reports
  for update
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

create or replace function public.submit_forum_post_report(
  p_post_id uuid,
  p_reason text,
  p_detail text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter_id uuid := auth.uid();
  v_reason text := left(lower(trim(coalesce(p_reason, 'other'))), 48);
  v_detail text := left(trim(coalesce(p_detail, '')), 500);
  v_post record;
  v_recent_report_count integer := 0;
  v_active_report_count integer := 0;
  v_threshold integer := 5;
  v_report_id uuid;
  v_limited boolean := false;
  v_notice_type text := 'post_report_limited';
  v_notice_text text := '你的帖子因收到多位用户举报，已暂时设为仅自己可见。管理员复核后可能恢复公开或维持处理。';
begin
  if v_reporter_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', '请先登录后再举报');
  end if;

  if p_post_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_POST_ID', 'message', '帖子不存在或已被删除');
  end if;

  if v_reason = '' then
    v_reason := 'other';
  end if;

  select p.id, p.author_id, p.status
    into v_post
    from public.posts p
   where p.id = p_post_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', '帖子不存在或已被删除');
  end if;

  if v_post.author_id = v_reporter_id then
    return jsonb_build_object('ok', false, 'code', 'CANNOT_REPORT_SELF', 'message', '不能举报自己的帖子');
  end if;

  if coalesce(v_post.status, 'approved') = 'limited' and not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'POST_ALREADY_LIMITED', 'message', '该帖子已被处理');
  end if;

  if coalesce(v_post.status, 'approved') = 'rejected' then
    return jsonb_build_object('ok', false, 'code', 'POST_ALREADY_REJECTED', 'message', '该帖子已被处理');
  end if;

  select count(*)
    into v_recent_report_count
    from public.forum_post_reports r
   where r.reporter_id = v_reporter_id
     and r.created_at > now() - interval '1 hour';

  if v_recent_report_count >= 10 then
    return jsonb_build_object('ok', false, 'code', 'REPORT_RATE_LIMITED', 'message', '举报过于频繁，请稍后再试');
  end if;

  insert into public.forum_post_reports (
    post_id,
    reporter_id,
    post_author_id,
    reason,
    detail
  )
  values (
    v_post.id,
    v_reporter_id,
    v_post.author_id,
    v_reason,
    v_detail
  )
  on conflict (post_id, reporter_id) do nothing
  returning id into v_report_id;

  if v_report_id is null then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_REPORTED', 'message', '你已经举报过这篇帖子');
  end if;

  select count(distinct r.reporter_id)
    into v_active_report_count
    from public.forum_post_reports r
   where r.post_id = v_post.id
     and r.status = 'active';

  if coalesce(v_post.status, 'approved') = 'approved' and v_active_report_count >= v_threshold then
    update public.posts
       set status = 'limited',
           updated_at = now()
     where id = v_post.id
       and status = 'approved';

    if found then
      v_limited := true;

      insert into public.notifications (
        recipient_id,
        sender_id,
        type,
        status,
        post_id,
        content
      )
      select
        v_post.author_id,
        null,
        v_notice_type,
        'unread',
        v_post.id,
        v_notice_text
      where not exists (
        select 1
          from public.notifications n
         where n.recipient_id = v_post.author_id
           and n.post_id = v_post.id
           and n.type = v_notice_type
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', case when v_limited then 'POST_LIMITED' else 'REPORT_ACCEPTED' end,
    'message', case
      when v_limited then '举报已提交。该帖子已因多人举报暂时设为仅作者可见'
      else '举报已提交，感谢反馈'
    end,
    'reportId', v_report_id,
    'reportCount', v_active_report_count,
    'threshold', v_threshold,
    'limited', v_limited
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'code', coalesce(sqlstate, 'REPORT_FAILED'),
      'message', coalesce(sqlerrm, '举报提交失败，请稍后重试')
    );
end;
$$;

create or replace function public.admin_apply_moderation_action(
  p_target_type text,
  p_target_id uuid,
  p_action_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_target_type text := lower(trim(coalesce(p_target_type, '')));
  v_rows integer := 0;
  v_status text := lower(trim(coalesce(p_action_status, '')));
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', '未登录，无法执行管理员审核操作');
  end if;

  if not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可执行审核操作');
  end if;

  if p_target_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_TARGET_ID', 'message', '目标 ID 不能为空');
  end if;

  if v_target_type = 'post' then
    if v_status not in ('approved', 'limited', 'rejected') then
      return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', '帖子状态仅支持 approved / limited / rejected');
    end if;

    update public.posts
       set status = v_status,
           updated_at = now()
     where id = p_target_id;
    get diagnostics v_rows = row_count;

    if v_rows > 0 and to_regclass('public.forum_post_reports') is not null then
      update public.forum_post_reports
         set status = case when v_status = 'approved' then 'dismissed' else 'accepted' end,
             resolved_at = now(),
             resolved_by = v_actor_id,
             resolution_note = coalesce(v_reason, case
               when v_status = 'approved' then '管理员复核后恢复公开'
               when v_status = 'limited' then '管理员复核后维持仅作者可见'
               else '管理员复核后拒绝显示'
             end)
       where post_id = p_target_id
         and status = 'active';
    end if;
  elsif v_target_type = 'comment' then
    if v_status not in ('approved', 'rejected') then
      return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', '评论状态仅支持 approved / rejected');
    end if;

    update public.comments
       set status = v_status
     where id = p_target_id;
    get diagnostics v_rows = row_count;
  elsif v_target_type = 'message' then
    if v_status not in ('approved', 'rejected') then
      return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', '私信审核状态仅支持 approved / rejected');
    end if;

    update public.messages
       set moderation_status = v_status,
           moderation_reason = case when v_status = 'approved' then null else v_reason end
     where id = p_target_id;
    get diagnostics v_rows = row_count;
  else
    return jsonb_build_object('ok', false, 'code', 'INVALID_TARGET_TYPE', 'message', '目标类型仅支持 post / comment / message');
  end if;

  if v_rows <= 0 then
    return jsonb_build_object('ok', false, 'code', 'TARGET_NOT_FOUND', 'message', '没有找到要审核的记录，可能已被处理或删除');
  end if;

  return jsonb_build_object('ok', true, 'affected', v_rows, 'target_type', v_target_type, 'target_id', p_target_id);
exception
  when others then
    return jsonb_build_object('ok', false, 'code', coalesce(sqlstate, 'ADMIN_MODERATION_FAILED'), 'message', coalesce(sqlerrm, '审核操作失败'));
end;
$$;

revoke all on function public.submit_forum_post_report(uuid, text, text) from public;
grant execute on function public.submit_forum_post_report(uuid, text, text) to authenticated;
grant execute on function public.submit_forum_post_report(uuid, text, text) to service_role;

grant select on table public.forum_post_reports to authenticated;
grant insert on table public.forum_post_reports to authenticated;
grant update on table public.forum_post_reports to authenticated;
grant all on table public.forum_post_reports to service_role;

notify pgrst, 'reload schema';

commit;
