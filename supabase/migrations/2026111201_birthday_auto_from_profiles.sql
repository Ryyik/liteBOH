-- ============================================================================
-- 2026-11-12 生日页自动化：由 profiles 的生日合成，去掉「手工配活动」
--
-- 落地前的事实（2026-11-12 实测，只读角色查得）：
--   · profiles 33 行，其中 19 行填了合法生日（birth_month/birth_day 是 text）；
--   · birthday_events 0 行、birthday_wishes 0 行。
--   ⇒ /birthday 一直走「今天没有生日活动」空态：不是当天没人过生日，
--     而是没人手工建活动。后台生日三入口已在同一批次下线（2026-11-12），
--     没有管理员的页面必须自己长出内容，否则这条路由等于死的。
--
-- 本次改动：
--   1) 祝福归属从 event_id 改为 (target_user_id, celebration_date)
--      —— 生日每年一次，同一个人每年的这一场是不同的一场；用复合语义
--      替掉「管理员先建 event」的中间层。
--   2) 读路径**不新增 RPC**：profiles 的 id/username/avatar_url/birth_month/
--      birth_day/is_banned 本来就有列级 anon SELECT（profiles_select_public 为 true），
--      前端直接查即可，日期计算放在 src/utils/birthday.js（纯函数、可单测）。
--      只有写路径需要动表结构。
--   3) 删除 birthday_events 表（0 行）。
--
-- 审核口径（本次刻意改变）：
--   生日后台下线后没有任何审批界面，`pending` 等于永远不展示。
--   改为「登录用户提交即展示」：RLS 强制 author_id = auth.uid()、status = 'approved'、
--   is_featured = false、likes = 0 —— 不能冒名、不能置顶、不能刷赞。
--   管理员仍保留 ALL 策略，可随时改成 rejected 下架。
--
-- Down Migration（回滚，events 的数据不可恢复：表已删）：
--   drop policy if exists "Signed-in users write birthday wishes" on public.birthday_wishes;
--   alter table public.birthday_wishes drop column if exists target_user_id;
--   alter table public.birthday_wishes drop column if exists celebration_date;
--   -- 若要回滚，需按 2026070205_birthday_event_system.sql 重建 birthday_events，
--   -- 并补回 birthday_wishes.event_id（旧数据已随列删除）。
-- ============================================================================

begin;

-- ------------------------------------------------------------------
-- 1) 祝福表：event_id → (target_user_id, celebration_date)
-- ------------------------------------------------------------------
-- 老策略直接引用 event_id，必须先撤（否则列删不掉）
drop policy if exists "Authenticated users can insert wishes" on public.birthday_wishes;

alter table public.birthday_wishes
  add column if not exists target_user_id uuid references public.profiles(id) on delete cascade,
  add column if not exists celebration_date date;

-- 回填：老数据（本次实测 0 行）从 event 上取寿星与日期
update public.birthday_wishes w
   set target_user_id = e.target_user_id,
       celebration_date = e.celebration_date
  from public.birthday_events e
 where w.event_id = e.id
   and (w.target_user_id is null or w.celebration_date is null);

-- 理论上回填后不该有空洞（event_id 是 NOT NULL 外键）；真有就删掉，
-- 否则下面 set not null 会直接失败，而报错信息不会指出是哪几行。
delete from public.birthday_wishes
 where target_user_id is null or celebration_date is null;

alter table public.birthday_wishes
  alter column target_user_id set not null,
  alter column celebration_date set not null;

comment on column public.birthday_wishes.target_user_id is
  '祝福对象（寿星）。生日页由 profiles 的生日自动合成，不再有 event 概念。';
comment on column public.birthday_wishes.celebration_date is
  '这份祝福属于哪一年的哪一场生日（Asia/Shanghai 的日期）。同一个人每年一场。';

-- 旧索引都挂在 event_id 上，先显式撤掉再删列
drop index if exists public.birthday_wishes_event_status_idx;
drop index if exists public.birthday_wishes_featured_idx;

create index if not exists birthday_wishes_target_date_idx
  on public.birthday_wishes (target_user_id, celebration_date, status, created_at desc);

create index if not exists birthday_wishes_featured_idx
  on public.birthday_wishes (target_user_id, celebration_date, is_featured)
  where is_featured = true;

alter table public.birthday_wishes drop column if exists event_id;

-- ------------------------------------------------------------------
-- 2) 写入口：登录用户提交即展示（见文件头「审核口径」）
-- ------------------------------------------------------------------
drop policy if exists "Signed-in users write birthday wishes" on public.birthday_wishes;
create policy "Signed-in users write birthday wishes"
  on public.birthday_wishes
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and status = 'approved'
    and is_featured = false
    and likes = 0
    and exists (
      select 1 from public.profiles p where p.id = target_user_id
    )
  );

-- 读：保持「approved 对所有人可见」（老策略不动）；管理员 ALL 策略保留（下架用）。

-- ------------------------------------------------------------------
-- 3) 手工活动表退场（0 行）
-- ------------------------------------------------------------------
drop table if exists public.birthday_events;

notify pgrst, 'reload schema';

commit;
