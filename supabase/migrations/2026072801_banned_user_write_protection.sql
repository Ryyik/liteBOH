-- ============================================================
-- 封禁/禁言用户写入拦截
-- 问题：原 posts/comments INSERT 策略仅校验 auth.uid() = author_id，
--       不检查 author 是否被封禁/禁言。封禁用户拿到有效 session 后
--       可绕过前端检查直接通过 API 发帖/评论。
-- 修复：在 INSERT 的 WITH CHECK 中增加对 author 封禁/禁言状态的拦截。
-- ============================================================

begin;

-- ============================================
-- 1. posts 表：拦截封禁/禁言用户发帖
-- ============================================

drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own on public.posts
  for insert to authenticated
  with check (
    auth.uid() = author_id
    -- 拦截有效封禁（永久封禁或临时封禁未过期）
    and not exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.is_banned = true
        and (p.banned_until is null or p.banned_until > now())
    )
    -- 拦截有效禁言
    and not exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.is_muted = true
        and (p.muted_until is null or p.muted_until > now())
    )
  );

-- ============================================
-- 2. comments 表：拦截封禁/禁言用户评论
-- ============================================

drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own on public.comments
  for insert to authenticated
  with check (
    auth.uid() = author_id
    and not exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.is_banned = true
        and (p.banned_until is null or p.banned_until > now())
    )
    and not exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.is_muted = true
        and (p.muted_until is null or p.muted_until > now())
    )
  );

-- ============================================
-- 3. 创建一个 helper RPC 供客户端拿到友好错误信息
--    RLS 拒绝时默认返回 42501 new row violates row-level security policy，
--    客户端可调用此 RPC 拿到明确的封禁/禁言提示。
-- ============================================

create or replace function public.check_user_can_post()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile record;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', '请先登录');
  end if;

  select is_banned, ban_reason, banned_until,
         is_muted, mute_reason, muted_until
    into v_profile
    from public.profiles
   where id = v_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND', 'message', '用户资料不存在');
  end if;

  -- 优先判断封禁
  if v_profile.is_banned = true and (v_profile.banned_until is null or v_profile.banned_until > now()) then
    return jsonb_build_object(
      'ok', false,
      'code', 'USER_BANNED',
      'message', case
        when v_profile.ban_reason is not null then '您的账号已被封禁：' || v_profile.ban_reason
        else '您的账号已被封禁，无法发布内容'
      end,
      'banned_until', v_profile.banned_until
    );
  end if;

  if v_profile.is_muted = true and (v_profile.muted_until is null or v_profile.muted_until > now()) then
    return jsonb_build_object(
      'ok', false,
      'code', 'USER_MUTED',
      'message', case
        when v_profile.mute_reason is not null then '您已被禁言：' || v_profile.mute_reason
        else '您已被禁言，无法发布内容'
      end,
      'muted_until', v_profile.muted_until
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.check_user_can_post() from public;
grant execute on function public.check_user_can_post() to authenticated;

comment on function public.check_user_can_post() is
  '检查当前用户是否可发帖/评论，返回友好错误信息（用于 RLS 拒绝时的客户端提示）';

-- ============================================
-- 4. admin_ban_user RPC 返回 user_id，便于调用方撤销现有 session
--    实际撤销由客户端调用 Edge Function 完成（service_role 才能调用 auth.admin.signOut）
-- ============================================

create or replace function public.admin_ban_user(
  p_user_id uuid,
  p_reason text default null,
  p_until timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_is_banned boolean;
  v_admin_id uuid;
begin
  if not public.current_user_is_admin() then
    raise exception 'forbidden: 仅管理员可执行此操作';
  end if;

  v_admin_id := auth.uid();

  if p_user_id = v_admin_id then
    return jsonb_build_object('ok', false, 'message', '不能封禁自己');
  end if;

  select is_banned into v_current_is_banned
    from profiles where id = p_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'message', '用户不存在');
  end if;

  if v_current_is_banned = true then
    return jsonb_build_object('ok', false, 'message', '用户已经被封禁');
  end if;

  update profiles
     set is_banned = true,
         ban_reason = p_reason,
         banned_until = p_until,
         banned_at = now(),
         banned_by = v_admin_id
   where id = p_user_id;

  -- 返回 user_id，调用方可据此撤销该用户现有 session
  return jsonb_build_object(
    'ok', true,
    'message', '用户已封禁',
    'affected', 1,
    'user_id', p_user_id
  );
end;
$$;

-- 函数签名未变，无需重新授权

notify pgrst, 'reload schema';

commit;
