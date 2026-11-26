-- 2026112507_cleanup_abandoned_signups.sql
-- 清理「半成品账号」（邮箱验证过了 / 没验证就走人，但 BOH ID 与密码从未设置）
--
-- ── 为什么要清 ────────────────────────────────────────────────────────
-- 「邮箱优先」流程（2026112504~2506）第 ① 屏就用 signInWithOtp 把 auth.users
-- 建出来，密码要到第 ③ 屏才设。用户在收信、被打断、嫌麻烦时离开，库里就留下
-- 一个 **没有密码、没有头像、没有内容** 的账号。
--
-- 这类账号本身不会锁死邮箱（signup_completed_at 为 NULL ⇒ 允许同邮箱继续注册，
-- 见 2026112506），所以清理**不是为了救用户**，是为了两件事：
--
--   ① 释放被幽灵账号占掉的 username。
--      `resolve_signup_username` 的第二档是「邮箱前缀」，`bolek@x.com` 注册后
--      即使从没建完，`bolek` 这个名字也已经被 profiles 占住。后来真正想用
--      `bolek` 的人只能拿到 `bolek_4821` —— 而占住它的账号永远不会有任何人登录。
--
--   ② 别让 auth.users 无界增长。
--      每一个误触「注册」的人都会留下一条记录（含 GoTrue 的一次性 token 与
--      identity 行）。这是**匿名可触发**的写入路径 —— 不设保留期就等于给外部
--      一个零成本的表增长通道（与 2026110309 对 _rate_limits 的判断同一口径）。
--
-- ── 删除条件的每一道闸都是为了「绝不误删活人」────────────────────────
-- 五条同时成立才删，缺一条都不动：
--
--   a) profiles.signup_completed_at is null
--      唯一写入点是 completeSignupIdentity（写完 ID 才置）。为 NULL ⇒ 这个人
--      从来没有过可用的账号。这是主判据。
--
--   b) coalesce(auth.users.encrypted_password, '') = ''
--      密码物理上就是空的。与 (a) 互为交叉验证：万一将来有别的路径把
--      signup_completed_at 写早了，(b) 仍然拦住。
--
--   c) identities 里**没有任何非 email 的 provider**
--      ⚠️ 这条是最关键的一道。OAuth（Google/GitHub…）建出来的账号同样
--      「没有密码」——如果只看 (a)+(b)，一个用 Google 登录过、但没走完我们
--      注册流程的真实用户会被判成半成品，30 天后**连账号带内容一起删掉**。
--      只要它有任何一条第三方 identity，就永不进入候选。
--
--   d) 没有任何内容 / 管理痕迹：posts / comments / moderation_logs /
--      profiles.banned_by / profiles.muted_by 全部为空。
--      半成品账号理论上不可能有这些；写出来是为了「理论」出问题时
--      宁可留下垃圾也不删错。
--
--   e) role <> 'admin'
--      管理员账号永远不进清理，哪怕它是半成品。
--
-- ── 保留期取 30 天（不是 48 小时）────────────────────────────────────
-- 清理不承担「救用户」的职责（(a) 已经保证了可续注册），所以窗口可以放得很宽。
-- 宽窗口换来的是「用户隔了三周回来说要接着填」时账号还在、名字还在。
-- 48 小时那种激进口径只适合清理日志，不适合清理**用户的身份**。
--
-- ── 幂等 / 可回滚 ────────────────────────────────────────────────────
-- 纯函数 + cron，重复执行安全。p_dry_run=true 只列名单不删，
-- 上线前后都用它核对（这是唯一该先跑的东西）。
-- 回滚：drop function + unschedule，已删的行无法恢复（所以默认 dry-run 先行）。
--
-- ── 分批 ─────────────────────────────────────────────────────────────
-- p_max_batch 默认 500：单次事务不因积压（比如首次清理上万条）而长时间持锁。
-- 剩饭由第二天的任务接着吃，不需要一次吃完。

begin;

-- ════════════════════════════════════════════════════════════════════
-- 1. 清理函数
-- ════════════════════════════════════════════════════════════════════
create or replace function public.cleanup_abandoned_signups(
  p_min_age interval default '30 days',
  p_max_batch integer default 500,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ids uuid[];
  v_candidates integer := 0;
  v_deleted integer := 0;
begin
  if p_max_batch is null or p_max_batch < 1 then
    p_max_batch := 500;
  end if;
  if p_min_age is null or p_min_age < interval '1 day' then
    -- 下限保护：任何调用方都不能把窗口压到 1 天以内。
    -- 验证码有效期是 10 分钟、用户可能在收件箱里躺一晚上，
    -- 更短的窗口会把「今晚就去注册」的人顺手删掉。
    p_min_age := interval '1 day';
  end if;

  with candidates as (
    select au.id, au.created_at
      from auth.users au
      join public.profiles p on p.id = au.id
     where p.signup_completed_at is null                            -- a)
       and coalesce(au.encrypted_password, '') = ''                 -- b)
       and coalesce(p.role, 'user') <> 'admin'                      -- e)
       and au.created_at < now() - p_min_age
       -- c) 有任何第三方身份就永不删除
       and not exists (
         select 1 from auth.identities i
          where i.user_id = au.id
            and i.provider <> 'email'
       )
       -- d) 有内容 / 有管理痕迹的一律不动
       and not exists (select 1 from public.posts x where x.author_id = au.id)
       and not exists (select 1 from public.comments x where x.author_id = au.id)
       and not exists (select 1 from public.moderation_logs m where m.moderator_id = au.id)
       and not exists (
         select 1 from public.profiles b
          where b.banned_by = au.id or b.muted_by = au.id
       )
     order by au.created_at
     limit p_max_batch
  )
  select coalesce(array_agg(id), '{}'::uuid[]), count(*)
    into v_ids, v_candidates
    from candidates;

  if coalesce(v_candidates, 0) = 0 then
    return jsonb_build_object(
      'ok', true,
      'dry_run', p_dry_run,
      'deleted', 0,
      'min_age', p_min_age::text
    );
  end if;

  if p_dry_run then
    return jsonb_build_object(
      'ok', true,
      'dry_run', true,
      'deleted', 0,
      'candidates', v_candidates,
      'min_age', p_min_age::text,
      'ids', to_jsonb(v_ids)
    );
  end if;

  -- 删 auth.users：profiles / posts / likes / sessions / identities 等
  -- 全部是 on delete cascade 或 set null（实测 pg_constraint），
  -- 所以一条 delete 就能把它们带走，不需要逐表手删。
  delete from auth.users where id = any (v_ids);
  get diagnostics v_deleted = row_count;

  -- 留痕：这是「删除用户身份」的动作，必须可审计。
  -- actor_id 留空表示系统调度（不是某个管理员点的）。
  insert into public.admin_audit_logs (
    actor_id, actor_label, action, resource_table, resource_id, diff, meta
  ) values (
    null,
    'pg_cron:cleanup_abandoned_signups',
    'delete_abandoned_signups',
    'auth.users',
    null,
    jsonb_build_object('count', v_deleted, 'min_age', p_min_age::text),
    jsonb_build_object('ids', to_jsonb(v_ids), 'dry_run', false)
  );

  return jsonb_build_object(
    'ok', true,
    'dry_run', false,
    'deleted', v_deleted,
    'candidates', v_candidates,
    'min_age', p_min_age::text
  );
exception
  when others then
    -- cron 任务不该因为一条异常就让整批静默消失：把失败原因也记进审计，
    -- 否则「今天怎么一条都没清」只能靠猜。
    insert into public.admin_audit_logs (
      actor_id, actor_label, action, resource_table, resource_id, diff, meta
    ) values (
      null,
      'pg_cron:cleanup_abandoned_signups',
      'delete_abandoned_signups_failed',
      'auth.users',
      null,
      jsonb_build_object('sqlstate', sqlstate, 'message', sqlerrm),
      jsonb_build_object('min_age', p_min_age::text)
    );
    return jsonb_build_object(
      'ok', false,
      'deleted', 0,
      'error', coalesce(sqlerrm, 'UNKNOWN_ERROR'),
      'sqlstate', sqlstate
    );
end;
$fn$;

comment on function public.cleanup_abandoned_signups(interval, integer, boolean) is
  '删除「半成品账号」（signup_completed_at 为 NULL、无密码、无第三方身份、无内容），'
  '默认保留 30 天。p_dry_run=true 只返回候选名单不删除。返回 jsonb 统计。';

-- 只允许 service_role / postgres（cron）调用：这是删用户的函数，
-- 任何前端角色都不该能触发。
revoke all on function public.cleanup_abandoned_signups(interval, integer, boolean)
  from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 2. 上线前先做一次 dry-run（只打名单，不删）
-- ════════════════════════════════════════════════════════════════════
do $peek$
declare
  v_res jsonb;
begin
  begin
    v_res := public.cleanup_abandoned_signups(interval '30 days', 500, true);
    raise notice '半成品账号 dry-run：候选 % 个（%）。',
      coalesce(v_res ->> 'candidates', '0'), coalesce(v_res ->> 'min_age', '30 days');
  exception when others then
    raise notice '半成品账号 dry-run 失败：%', coalesce(sqlerrm, 'UNKNOWN_ERROR');
  end;
end
$peek$;

-- ════════════════════════════════════════════════════════════════════
-- 3. 每天一次的 cron（沿用 2026110309 的 do 块 + pg_cron 缺失降级写法）
-- ════════════════════════════════════════════════════════════════════
do $cron$
declare
  v_has_pg_cron boolean := false;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron')
    into v_has_pg_cron;

  if not v_has_pg_cron then
    raise notice 'pg_cron 未启用，已跳过半成品账号清理任务。';
    return;
  end if;

  begin
    perform cron.unschedule(jobid)
      from cron.job
     where jobname = 'cleanup_abandoned_signups_daily';
  exception when undefined_table or undefined_function or invalid_schema_name then
    null;
  end;

  -- 每天 04:31 —— 04 点这一档已有 04:10 / 04:17 / 04:23 / 04:35 / 04:50，
  -- 取 31 分避开它们（首次清理可能是几千行，别和别的重活挤在一起）
  perform cron.schedule(
    'cleanup_abandoned_signups_daily',
    '31 4 * * *',
    $cmd$select public.cleanup_abandoned_signups(interval '30 days', 500, false);$cmd$
  );
exception when others then
  raise notice '创建半成品账号清理任务失败：%', coalesce(sqlerrm, 'UNKNOWN_ERROR');
end;
$cron$;

commit;
