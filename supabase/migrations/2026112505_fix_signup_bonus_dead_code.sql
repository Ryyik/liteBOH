-- 2026112505_fix_signup_bonus_dead_code.sql
-- 修复：新用户注册礼 5 积分**从未发放过**（既有 bug，本次改注册流程时发现）。
--
-- ── 现象 ─────────────────────────────────────────────────────────────
-- 事务内插入 auth.users 后，profiles.points = 0，
-- 且 points_transactions 里没有任何 reason='signup_bonus' 的流水：
--   select reason, count(*) from points_transactions group by reason;
--   → admin_grant 62 / weekly_checkin 53 / forum_post 7 / ... （没有 signup_bonus）
--
-- ── 根因 ─────────────────────────────────────────────────────────────
-- auth.users 上挂了两个 AFTER INSERT 触发器，按名字序执行：
--   ① on_auth_user_created                 → handle_new_user            （建 profile）
--   ② trg_sync_profile_from_auth_user_insert → sync_profile_from_auth_user_insert
--
-- 注册礼的代码在 ② 里，判据是：
--   v_is_new := not exists (select 1 from public.profiles where id = new.id);
--
-- 但 ① 已经先把 profile 插进去了 ⇒ ② 跑的时候「一定存在」⇒ v_is_new 恒为 false
-- ⇒ 整段注册礼代码是**不可达的死代码**。
--
-- 这个 bug 藏得深的原因：它不报错、不警告、只让一个新用户少 5 积分。
-- 只有把 profiles.points 和 points_transactions 对起来看才会发现。
--
-- ── 修法 ─────────────────────────────────────────────────────────────
-- 删掉 `v_is_new` 这个判据，改用**已有的唯一索引仲裁**：
--   points_transactions_signup_bonus_once  (user_id) WHERE reason='signup_bonus'
--
-- `insert ... on conflict do nothing` 之后 `found` 只有在**真的插入了一行**时才为 true
-- ⇒ 天然幂等：重复触发、并发、重放都不会重复发分。
-- 这个索引本来就在，说明原始设计就是打算这么用的 —— 只是多加了一层错误的预判把它挡死了。
--
-- ── 影响面 ───────────────────────────────────────────────────────────
-- 只影响**今后**的新注册用户（每人 +5 分，与原始设计一致）。
-- 不给存量用户补发：那是一次批量加分，属于产品决策，不在这里顺手做。
-- 若确实要补发，单独跑（先确认名单和总额）：
--   insert into points_transactions (user_id, amount, balance_after, reason, remark)
--   select p.id, 5, coalesce(p.points,0)+5, 'signup_bonus', '新用户注册礼（补发）'
--     from profiles p where not exists (
--       select 1 from points_transactions t
--        where t.user_id = p.id and t.reason = 'signup_bonus')
--   on conflict do nothing;
--   -- 然后 update profiles set points = points + 5 同上口径
--
-- 幂等：create or replace，可重复执行。

create or replace function public.sync_profile_from_auth_user_insert()
 returns trigger
 language plpgsql
 security definer
 set search_path = public
as $function$
declare
  v_username text;
  v_join_date date := current_date;
  v_join_date_text text;
  v_birth_month text;
  v_birth_day text;
  v_terms_at timestamptz;
  v_terms_ver text;
begin
  v_username := public.resolve_signup_username(
    new.raw_user_meta_data ->> 'username',
    new.email,
    new.id
  );

  -- 安全修复：强制 role 为 'user'，忽略 metadata 中可能注入的 role
  -- 安全修复：强制 points 为 0，忽略 metadata 中可能注入的 points
  -- email 不落 profiles（2026090803：email 只存 auth.users）

  v_join_date_text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'join_date', '')), '');
  if v_join_date_text is not null and v_join_date_text ~ '^\d{4}-\d{2}-\d{2}$' then
    v_join_date := v_join_date_text::date;
  end if;

  v_birth_month := nullif(trim(coalesce(new.raw_user_meta_data ->> 'birth_month', '')), '');
  v_birth_day := nullif(trim(coalesce(new.raw_user_meta_data ->> 'birth_day', '')), '');

  begin
    v_terms_at := nullif(trim(coalesce(new.raw_user_meta_data ->> 'terms_accepted_at', '')), '')::timestamptz;
  exception when others then
    v_terms_at := null;
  end;
  v_terms_ver := nullif(trim(coalesce(new.raw_user_meta_data ->> 'terms_version', '')), '');

  insert into public.profiles (
    id,
    username,
    role,
    points,
    join_date,
    birth_month,
    birth_day,
    terms_accepted_at,
    terms_version
  ) values (
    new.id,
    v_username,
    'user',
    0,
    v_join_date,
    v_birth_month,
    v_birth_day,
    v_terms_at,
    v_terms_ver
  )
  on conflict (id) do update
    set username = coalesce(nullif(trim(public.profiles.username), ''), excluded.username),
        join_date = coalesce(public.profiles.join_date, excluded.join_date),
        role = public.profiles.role,
        birth_month = coalesce(public.profiles.birth_month, excluded.birth_month),
        birth_day = coalesce(public.profiles.birth_day, excluded.birth_day),
        terms_accepted_at = coalesce(public.profiles.terms_accepted_at, excluded.terms_accepted_at),
        terms_version = coalesce(public.profiles.terms_version, excluded.terms_version);

  -- 新用户注册礼：5 积分（AI Token 体验金，不过期）。
  -- ⚠️ 这里**不能**用 `not exists (select 1 from profiles where id=new.id)` 判新用户 ——
  --    on_auth_user_created 已先建好 profile，那个判据恒为 false，导致这段代码
  --    从未执行过（2026-11-25 实测发现）。改用唯一索引仲裁。
  insert into public.points_transactions (user_id, amount, balance_after, reason, remark)
  values (new.id, 5, 5, 'signup_bonus', '新用户注册礼（AI Token 体验金，不过期）')
  on conflict do nothing;

  if found then
    update public.profiles
       set points = coalesce(points, 0) + 5
     where id = new.id;
  end if;

  return new;
end;
$function$;

notify pgrst, 'reload schema';
