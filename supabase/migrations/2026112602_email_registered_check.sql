begin;

/* ============================================================
   邮箱是否已被注册 —— 只回布尔，不回邮箱
   ============================================================

   为什么需要：注册页第 ① 屏右侧那个「可用」徽标是**假的**。
   它的判定是 `!fieldMsg.email && formData.email` —— 也就是
   「填了东西 + 本机格式校验通过」，从来没问过服务端。
   于是随便输入一个 zzzz@example.com 也会显示「可用」，
   等走到第 ② 屏发码时才因为「这是登录语义」被挡回来。

   为什么不能直接查 profiles：这张表**没有 email 列**（实测确认），
   邮箱只在 auth.users 里。而 auth schema 对 anon 不可读。

   为什么不用 resolve_email_for_login：它是
   `username → email` 且**直接返回邮箱明文**，用途是登录页找回账号。
   拿来判存在既语义不对，也会把「某个邮箱是否注册」变成可批量探测
   （返回明文 vs 返回 BOOL 的风险量级完全不同）。
   这个函数只回答 true/false。

   安全性：SECURITY DEFINER 绕 RLS，但
     · 只返回 boolean，拿不到任何邮箱；
     · 入参做 lower(trim()) 归一，与 auth.users.email 的存储口径一致；
     · 不区分「存在但未验证」与「存在且已验证」 —— 对注册流程而言
       两者都算「这个邮箱有主了」，第 ② 屏会走登录分支。
   ============================================================ */

create or replace function public.is_email_registered(p_email text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  -- 空串/纯空白一律 false：不把「没填」说成「可用」或「已占用」
  if v_email = '' then
    return false;
  end if;

  -- 长度粗筛：避免把明显不是邮箱的串送进索引查找
  if position('@' in v_email) = 0 then
    return false;
  end if;

  return exists (
    select 1
    from auth.users u
    where lower(u.email) = v_email
    limit 1
  );
end;
$$;

-- 只给匿名与登录用户「问一个 bool」的权限，别的什么都不给
revoke all on function public.is_email_registered(text) from public;
grant execute on function public.is_email_registered(text) to anon, authenticated;

comment on function public.is_email_registered(text) is
  '注册页第①屏用：判断邮箱是否已被注册。只返回布尔，不泄露邮箱本身。';

notify pgrst, 'reload schema';

commit;