-- boh_cloud_entries 公开笔记（作品格）支持 —— 2026-09-29
--
-- 产品拍板（UserSpace IA · Cloud+ 处理）：
--   * 公开笔记计入作者「作品格」展示（作品格 = 帖子 + 公开笔记，公开内容唯一出口），
--     图片仍占用同一 Cloud+ 图片配额（配额口径不变，见 get_my_user_space_summary / 前端记账）；
--   * Cloud+ 自身保留私密笔记 + 全部存储账目；Cloud+ 内公开条目只读（管理唯一落点 = 作品格）；
--   * 2026-05 曾以 check (visibility = 'private') 收紧此列（当时卸载的是「公开分享频道」），
--     本迁移按新决策重开 'public' 一个值，token 令牌频道语义不受影响。
--
-- 前端配合：boh-cloud-api.js#listUserPublicCloudEntries / setMyCloudEntryVisibility；
-- 迁移未部署时访客查询被 RLS 拒绝，前端按空列表降级，不影响现有功能。

begin;

-- 1) 可见性约束：private（私密，默认）/ public（公开，进作品格）
alter table public.boh_cloud_entries
  drop constraint if exists boh_cloud_entries_visibility_chk;

alter table public.boh_cloud_entries
  add constraint boh_cloud_entries_visibility_chk
  check (visibility in ('private', 'public'));

-- 2) 读策略：own（本人全量，保持原语义）+ public（任何人可读公开条目）
drop policy if exists boh_cloud_entries_select_own on public.boh_cloud_entries;
create policy boh_cloud_entries_select_own
  on public.boh_cloud_entries
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists boh_cloud_entries_select_public on public.boh_cloud_entries;
create policy boh_cloud_entries_select_public
  on public.boh_cloud_entries
  for select
  to anon, authenticated
  using (visibility = 'public');

-- 3) anon 需要 SELECT 表权限才能命中公开读策略（此前只授给 authenticated）
grant select on table public.boh_cloud_entries to anon;

-- 4) 公开条目列表的查询形态是 (user_id = ? and visibility='public' order by updated_at desc)，
--    部分索引正好覆盖，不加重私密路径的索引维护成本
create index if not exists idx_boh_cloud_entries_public_user_updated
  on public.boh_cloud_entries (user_id, updated_at desc)
  where visibility = 'public';

comment on column public.boh_cloud_entries.visibility is
  'Cloud+ 内容可见性：private 私密（默认）；public 公开——计入作者作品格展示，图片仍占用同一 Cloud+ 配额。';

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '2026092901',
  '2026092901_boh_cloud_entries_public_work_notes',
  array[
    'alter table public.boh_cloud_entries drop constraint if exists boh_cloud_entries_visibility_chk',
    $p$alter table public.boh_cloud_entries add constraint boh_cloud_entries_visibility_chk check (visibility in ('private', 'public'))$p$,
    'drop policy if exists boh_cloud_entries_select_own on public.boh_cloud_entries',
    $p$create policy boh_cloud_entries_select_own on public.boh_cloud_entries for select to authenticated using (auth.uid() = user_id)$p$,
    'drop policy if exists boh_cloud_entries_select_public on public.boh_cloud_entries',
    $p$create policy boh_cloud_entries_select_public on public.boh_cloud_entries for select to anon, authenticated using (visibility = 'public')$p$,
    'grant select on table public.boh_cloud_entries to anon',
    'create index if not exists idx_boh_cloud_entries_public_user_updated on public.boh_cloud_entries (user_id, updated_at desc) where visibility = ''public'''
  ]
);

notify pgrst, 'reload schema';

commit;
