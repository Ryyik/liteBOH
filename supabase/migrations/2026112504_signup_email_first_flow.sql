-- 2026112504_signup_email_first_flow.sql
-- 注册流程改成「先验证邮箱、后建号」需要两处数据库配合。
--
-- ── 背景 ─────────────────────────────────────────────────────────────
-- 新流程（七屏）：
--   ① 邮箱 + 协议勾选 → ② 验证码 → ③ BOH ID + 密码 → ④ 生日 → ⑤ 头像 → ⑥ 通行密钥 → ⑦ 欢迎
--
-- 第 ① 屏走的是 `signInWithOtp({ email, options: { shouldCreateUser: true } })`，
-- 也就是**只带邮箱、不带 username** 就把 auth.users 建出来。这带来两个问题：
--
-- 问题 1：`handle_new_user()` 会 23502 直接注册失败
--   handle_new_user 的 insert 列清单里写的是
--     new.raw_user_meta_data->>'username'
--   邮件注册这一步这个 key 不存在 ⇒ NULL，而 `profiles.username` 是 NOT NULL
--   且无默认值 ⇒ 23502 ⇒ GoTrue 返回 500「Database error saving new user」
--   ⇒ 第 ① 屏就炸，用户连验证码都收不到。
--
-- 问题 2：兜底本身还有个隐藏坑
--   `sync_profile_from_auth_user_insert()` 的兜底是「取邮箱 @ 前面的部分」。
--   但 profiles 上有 `idx_profiles_username_lower_unique`（lower(trim(username)) 唯一），
--   所以 bolek@a.com 和 bolek@b.com 先后注册时，第二个人会**撞唯一索引**，
--   同样炸出 23502 —— 而这是个完全正常的邮箱，用户会以为是自己写错了。
--
-- ── 本次改动 ─────────────────────────────────────────────────────────
-- 1) 新增 `public.resolve_signup_username()`：把 username 兜底逻辑收成**单一真源**，
--    两个触发器共用。顺序：metadata.username → 邮箱前缀 → 邮箱前缀_随机4位 → user_<id8>。
--    每一档都先查重，撞了就降级，所以**永远不会因为用户名冲突而注册失败**。
--
-- 2) 两个触发器函数都改用这个辅助函数（handle_new_user 之前根本没有兜底）。
--
-- 3) 新增两列把「同意协议」落库：
--      terms_accepted_at  timestamptz
--      terms_version      text
--    为什么必须落库：现在的 `formData.agreedToTerms` 只是前端拦截，后端零记录，
--    一旦有纠纷无法证明「这个用户在某个版本协议下同意过」。
--    第 ① 屏勾选后通过 `signInWithOtp` 的 `options.data` 写进 raw_user_meta_data，
--    随 auth.users 的 insert 一起被触发器写进 profiles —— 同一次事务，不依赖前端补写。
--
-- ── 幂等 ─────────────────────────────────────────────────────────────
-- 全部 create or replace / add column if not exists，可重复执行。
-- 回滚：drop 掉两列、把两个函数恢复成 2026100404 / 2026092201 的版本即可
--   （原始定义可用 `select pg_get_functiondef(...)` 取）。

-- ════════════════════════════════════════════════════════════════════
-- 1. 新列：协议同意记录
-- ════════════════════════════════════════════════════════════════════
alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

comment on column public.profiles.terms_accepted_at is
  '用户勾选「同意用户协议与隐私政策」的时刻。由注册时 signInWithOtp 的 options.data 带入，随 auth.users 插入一次性写入。';
comment on column public.profiles.terms_version is
  '同意时生效的协议版本号（如 2026-11）。协议内容变更时必须同步升版，用于事后举证用户同意的是哪一版。';

-- ════════════════════════════════════════════════════════════════════
-- 2. username 兜底：单一真源
-- ════════════════════════════════════════════════════════════════════
/**
 * 解析新用户的 username，保证返回值一定**不违反唯一索引**。
 *
 * 为什么要单独成函数：原来两个触发器各自实现一份兜底，且 handle_new_user
 * 压根没有兜底（只有一句 `->>'username'`）。两套逻辑意味着「signUp 正常、
 * signInWithOtp 爆炸」这种只在一条路径上出现的故障，很难一眼看出来。
 *
 * 降级链（每一档都先查重）：
 *   ① metadata 里前端传上来的 username —— 正常路径（signUp 带 username 时）
 *   ② 邮箱 @ 前缀 —— 邮件注册时的自然猜测，用户以后可以改
 *   ③ ② + '_' + 4 位随机 —— ② 撞重时用，仍然可读
 *   ④ user_ + uuid 前 8 位 —— 最终兜底，不可能重
 *
 * ⚠️ 查重必须用 `lower(trim(...))` 与 `idx_profiles_username_lower_unique` 同口径，
 *    否则大小写不同的两个名字能通过检查、却在 insert 时撞索引。
 */
create or replace function public.resolve_signup_username(
  p_meta_username text,
  p_email text,
  p_id uuid
)
 returns text
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_base text;
  v_candidate text;
  v_try integer := 0;
begin
  -- ① metadata（前端 signUp 时传的 username）
  v_candidate := nullif(trim(coalesce(p_meta_username, '')), '');
  if v_candidate is not null and not exists (
    select 1 from public.profiles
     where lower(trim(username)) = lower(trim(v_candidate))
  ) then
    return v_candidate;
  end if;

  -- ② 邮箱前缀
  v_base := nullif(trim(split_part(lower(coalesce(p_email, '')), '@', 1)), '');
  if v_base is not null then
    -- 裁到 16 字符，给可能的后缀留空间（用户名字段上限 20）
    v_base := left(v_base, 16);
    if not exists (
      select 1 from public.profiles where lower(trim(username)) = lower(v_base)
    ) then
      return v_base;
    end if;

    -- ③ 前缀 + 随机 4 位：最多试 6 次，全部撞上的概率可忽略
    while v_try < 6 loop
      v_candidate := v_base || '_' || lpad((floor(random() * 10000))::int::text, 4, '0');
      if not exists (
        select 1 from public.profiles where lower(trim(username)) = lower(v_candidate)
      ) then
        return v_candidate;
      end if;
      v_try := v_try + 1;
    end loop;
  end if;

  -- ④ 最终兜底：uuid 派生，理论上不会冲突（同 uuid 前 8 位碰撞极罕见，且再叠一层循环）
  v_base := 'user_' || left(replace(p_id::text, '-', ''), 8);
  v_candidate := v_base;
  v_try := 0;
  while exists (
    select 1 from public.profiles where lower(trim(username)) = lower(v_candidate)
  ) and v_try < 20 loop
    v_try := v_try + 1;
    v_candidate := v_base || v_try::text;
  end loop;

  return v_candidate;
end;
$function$;

-- 这个函数只给触发器内部调用，不该对客户端可执行
revoke all on function public.resolve_signup_username(text, text, uuid) from public;
revoke all on function public.resolve_signup_username(text, text, uuid) from anon;
revoke all on function public.resolve_signup_username(text, text, uuid) from authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 3. handle_new_user：补兜底 + 写协议同意
-- ════════════════════════════════════════════════════════════════════
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_username text;
  v_terms_at timestamptz;
  v_terms_ver text;
begin
  -- ⚠️ 这里原来是 `new.raw_user_meta_data->>'username'` 裸取。
  --    signInWithOtp（只带邮箱）时该 key 不存在 ⇒ NULL ⇒ NOT NULL 违反 ⇒
  --    GoTrue 500「Database error saving new user」，第 ① 屏直接失败。
  v_username := public.resolve_signup_username(
    new.raw_user_meta_data ->> 'username',
    new.email,
    new.id
  );

  -- 协议同意：只接受合法的 ISO 时间串，非法值一律当没同意（不阻断注册）
  begin
    v_terms_at := nullif(trim(coalesce(new.raw_user_meta_data ->> 'terms_accepted_at', '')), '')::timestamptz;
  exception when others then
    v_terms_at := null;
  end;
  v_terms_ver := nullif(trim(coalesce(new.raw_user_meta_data ->> 'terms_version', '')), '');

  insert into public.profiles (id, username, points, tags, terms_accepted_at, terms_version)
  values (new.id, v_username, 0, '{}', v_terms_at, v_terms_ver)
  on conflict (id) do update
    set username = coalesce(nullif(trim(public.profiles.username), ''), excluded.username),
        -- 协议同意一旦记录就保留最早的那一次，不被后续覆盖
        terms_accepted_at = coalesce(public.profiles.terms_accepted_at, excluded.terms_accepted_at),
        terms_version = coalesce(public.profiles.terms_version, excluded.terms_version);

  return new;
end;
$function$;

-- ════════════════════════════════════════════════════════════════════
-- 4. sync_profile_from_auth_user_insert：改用同一个兜底 + 写协议同意
-- ════════════════════════════════════════════════════════════════════
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
  v_is_new boolean;
begin
  -- 兜底收口到单一真源（原来这里是内联的「邮箱前缀 → user_id8」两档，
  -- 会在「同前缀不同域名」时撞唯一索引 —— 见文件头问题 2）
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

  v_is_new := not exists (
    select 1 from public.profiles where id = new.id
  );

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
        -- on conflict 时也不允许用 metadata 的 role 覆盖
        role = public.profiles.role,
        birth_month = coalesce(public.profiles.birth_month, excluded.birth_month),
        birth_day = coalesce(public.profiles.birth_day, excluded.birth_day),
        -- 协议同意保留最早一次（幂等：重复触发不会把时间刷新成后来那次）
        terms_accepted_at = coalesce(public.profiles.terms_accepted_at, excluded.terms_accepted_at),
        terms_version = coalesce(public.profiles.terms_version, excluded.terms_version);

  -- 新用户注册礼：5 积分（AI Token 体验金，不过期）。
  -- 唯一索引仲裁，流水落库成功才加分；冲突（重放/并发）静默跳过。
  if coalesce(v_is_new, false) then
    insert into public.points_transactions (user_id, amount, balance_after, reason, remark)
    values (new.id, 5, 5, 'signup_bonus', '新用户注册礼（AI Token 体验金，不过期）')
    on conflict do nothing;

    if found then
      update public.profiles
         set points = coalesce(points, 0) + 5
       where id = new.id;
    end if;
  end if;

  return new;
end;
$function$;

notify pgrst, 'reload schema';
