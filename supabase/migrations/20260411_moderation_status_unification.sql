-- 统一论坛/私信审核状态与管理员审核动作
-- 目标：
-- 1) 审核状态统一收敛为 approved / rejected
-- 2) 消除历史 PASS / NEEDS_REVIEW / PENDING / REVIEW 等状态
-- 3) 修复 admin_apply_moderation_action 对私信状态大小写处理错误

begin;

-- 1) 私信历史状态归一
update public.messages
set moderation_status = 'approved'
where moderation_status is null
   or lower(trim(moderation_status)) in ('approved', 'pass', 'allow', 'ok');

update public.messages
set moderation_status = 'rejected',
    moderation_reason = coalesce(
      nullif(trim(moderation_reason), ''),
      '历史审核状态已归一为 rejected'
    )
where lower(trim(coalesce(moderation_status, ''))) in (
  'rejected',
  'reject',
  'blocked',
  'block',
  'needs_review',
  'pending',
  'review'
);

update public.messages
set moderation_status = 'approved'
where lower(trim(coalesce(moderation_status, ''))) not in ('approved', 'rejected');

update public.messages
set moderation_status = lower(trim(moderation_status))
where moderation_status <> lower(trim(moderation_status));

-- 2) 清理旧约束并固化新约束
do $$
declare
  rec record;
begin
  for rec in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.messages'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%moderation_status%'
  loop
    execute format('alter table public.messages drop constraint %I', rec.conname);
  end loop;
end;
$$;

alter table public.messages
  alter column moderation_status set default 'approved',
  alter column moderation_status set not null;

alter table public.messages
  add constraint messages_moderation_status_check
  check (moderation_status in ('approved', 'rejected'));

create index if not exists idx_messages_receiver_unread_approved
  on public.messages using btree (receiver_id, created_at desc)
  where status = 'unread' and moderation_status = 'approved';

-- 3) 修复管理员审核 RPC：私信状态统一按小写判定
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
  v_actor_role text := '';
  v_target_type text := lower(trim(coalesce(p_target_type, '')));
  v_rows integer := 0;
  v_forum_status text := lower(trim(coalesce(p_action_status, '')));
  v_mail_status text := lower(trim(coalesce(p_action_status, '')));
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', '未登录，无法执行管理员审核操作');
  end if;

  select coalesce(role, '')
    into v_actor_role
    from public.profiles
   where id = v_actor_id
   limit 1;

  if v_actor_role <> 'admin' then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可执行审核操作');
  end if;

  if p_target_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_TARGET_ID', 'message', '目标 ID 不能为空');
  end if;

  if v_target_type = 'post' then
    if v_forum_status not in ('approved', 'rejected') then
      return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', '帖子状态仅支持 approved / rejected');
    end if;

    update public.posts
       set status = v_forum_status,
           updated_at = now()
     where id = p_target_id;
    get diagnostics v_rows = row_count;

  elsif v_target_type = 'comment' then
    if v_forum_status not in ('approved', 'rejected') then
      return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', '评论状态仅支持 approved / rejected');
    end if;

    update public.comments
       set status = v_forum_status
     where id = p_target_id;
    get diagnostics v_rows = row_count;

  elsif v_target_type = 'message' then
    if v_mail_status not in ('approved', 'rejected') then
      return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', '私信审核状态仅支持 approved / rejected');
    end if;

    update public.messages
       set moderation_status = v_mail_status,
           moderation_reason = case
             when v_mail_status = 'approved' then null
             else v_reason
           end
     where id = p_target_id;
    get diagnostics v_rows = row_count;

  else
    return jsonb_build_object('ok', false, 'code', 'INVALID_TARGET_TYPE', 'message', '目标类型仅支持 post / comment / message');
  end if;

  return jsonb_build_object(
    'ok', v_rows > 0,
    'affected', v_rows,
    'target_type', v_target_type,
    'target_id', p_target_id
  );
end;
$$;

grant execute on function public.admin_apply_moderation_action(text, uuid, text, text) to authenticated;
grant execute on function public.admin_apply_moderation_action(text, uuid, text, text) to service_role;

commit;
