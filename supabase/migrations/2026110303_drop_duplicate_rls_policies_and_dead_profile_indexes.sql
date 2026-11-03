-- ============================================================================
-- P3-a + 索引瘦身：删 4 组逐字重复的 RLS 策略 + profiles 上 6 个零扫描索引
--
-- 依据（2026-11-03 线上只读实测）：
--   · pg_policies 显示 4 组策略在 tablename / cmd / permissive / roles / qual /
--     with_check 六个维度上**完全一致**。PERMISSIVE 策略之间是 OR 关系，
--     删掉其中任意一条，判定结果集不变（数学等价，不是"看起来差不多"）。
--   · pg_stat_all_indexes 在 236 天 21 小时的统计窗口内，下列 6 个索引
--     idx_scan 全为 0；profiles 只有 33 行 / 64 kB，任何查询走顺序扫描都是微秒级。
--
-- 保留哪一条：删 Supabase 模板的「人话版」，保留 2026090803_security_hardening
-- 与 2026062602_rls_security_fix 里重新定义过的 snake_case 版（那才是当前口径）。
-- ============================================================================

-- ============ ① 4 组重复策略：各删一条 ============
-- likes DELETE: 两条都是 using (auth.uid() = user_id)
drop policy if exists "Auth delete like" on public.likes;

-- profiles INSERT: 两条都是 with check (auth.uid() = id)
drop policy if exists "Users can insert own profile" on public.profiles;

-- profiles SELECT: 两条都是 using (true)
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;

-- user_impressions INSERT: 两条都是 with check (auth.uid() = author_id)
drop policy if exists "Users can write impressions" on public.user_impressions;

-- ============ ② profiles 上 6 个零扫描索引 ============
-- 心跳（update_last_active_at，2 分钟一次）更新 last_active_at，而该列自带索引
-- （idx_profiles_last_active_at）⇒ 更新永远无法 HOT ⇒ 每次都要往**所有**索引写新条目。
-- 15 个索引降到 9 个，这条最热的写路径的索引维护量直接减 40%。
--
-- idx_profiles_username_trgm        32 kB  GIN trgm，为"用户名模糊搜索"预留；代码里
--                                         目前没有任何 username ilike/similarity 查询
-- idx_profiles_security_restrictions 16 kB 账外索引（迁移文件里查无创建记录）
-- idx_profiles_is_boh_creator       16 kB 部分索引 (is_boh_creator = true)
-- idx_profiles_lower_username       16 kB 与 idx_profiles_username_lower_unique 功能重叠
-- idx_profiles_muted_until           8 kB 部分索引 (muted_until IS NOT NULL)
-- idx_profiles_banned_until          8 kB 部分索引 (banned_until IS NOT NULL)
drop index if exists public.idx_profiles_username_trgm;
drop index if exists public.idx_profiles_security_restrictions;
drop index if exists public.idx_profiles_is_boh_creator;
drop index if exists public.idx_profiles_lower_username;
drop index if exists public.idx_profiles_muted_until;
drop index if exists public.idx_profiles_banned_until;

-- ============ ③ 自证：宁可整个迁移失败，也不留半截状态 ============
do $$
declare
  v_missing int;
  v_idx int;
begin
  -- 每个被删过策略的 (表, 命令) 组合，必须仍有至少一条策略存活
  select count(*) into v_missing
  from (values ('likes', 'DELETE'),
               ('profiles', 'INSERT'),
               ('profiles', 'SELECT'),
               ('user_impressions', 'INSERT')) as e(t, c)
  where not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = e.t and p.cmd = e.c
  );
  if v_missing > 0 then
    raise exception '自证失败：% 个 (表,命令) 组合删完后已无任何策略，会把用户挡在门外', v_missing;
  end if;

  -- 主键必须还在
  if not exists (
    select 1 from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'profiles' and i.indisprimary
  ) then
    raise exception '自证失败：profiles 主键丢失';
  end if;

  -- 索引数必须落到 9（线上 15→9；全新库重放时这 2 个账外索引本就不存在，13→9）
  select count(*) into v_idx
  from pg_index i
  join pg_class c on c.oid = i.indrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'profiles';
  if v_idx <> 9 then
    raise exception '自证失败：profiles 索引数应为 9，实际 %', v_idx;
  end if;
end $$;

comment on table public.profiles is
  'RLS 策略已去重（删掉 4 条逐字重复的历史版）；本表只保留 9 个在用索引，'
  '新增索引前先看 pg_stat_all_indexes.idx_scan —— 本表仅数十行，绝大多数索引加进来就是零扫描。';
