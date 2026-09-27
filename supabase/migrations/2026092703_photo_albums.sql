-- 摄影集（Photo Albums）P1+P2
--
-- 设计文档：docs/superpowers/specs/2026-09-27-photo-albums-design.md
--   1) photo_albums        影集主表（封面/标题/状态/社区分享开关）
--   2) photo_album_photos  照片池（Cloudinary URL + 宽高比 + 配文 + 上传即审记录）
--   3) photo_album_pages   页面流（封面/章节/内容/尾页 + 版式 + photo_refs 有序引用）
--   4) photo_album_exports 导出台账（离线 HTML 导出计入月度配额）
--
-- RLS 口径：
--   - 影集/照片/页面：本人全权；公开只读 status='published' AND shared_to_community=true；
--     管理员全权（数据管理面板需要 view/edit/delete）。
--   - 导出台账：仅本人可读写（配额判定用），管理员可读。

begin;

-- ============================================================
-- 1) 影集主表
-- ============================================================
create table if not exists public.photo_albums (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title                 text not null default '未命名影集',
  subtitle              text not null default '',
  cover_url             text not null default '',
  status                text not null default 'draft'
                        check (status in ('draft', 'published')),
  shared_to_community   boolean not null default false,
  photo_count           integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_photo_albums_user_recent
  on public.photo_albums (user_id, updated_at desc);

-- 社区影集区列表：只扫已分享的已发布行
create index if not exists idx_photo_albums_community
  on public.photo_albums (updated_at desc)
  where status = 'published' and shared_to_community = true;

comment on table public.photo_albums is
  '摄影集主表。入口在个人空间；分享到社区后社区出现封面入口卡，点击进阅读页。';

-- ============================================================
-- 2) 照片池
-- ============================================================
create table if not exists public.photo_album_photos (
  id                  uuid primary key default gen_random_uuid(),
  album_id            uuid not null references public.photo_albums(id) on delete cascade,
  user_id             uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  cloudinary_url      text not null,
  public_id           text not null default '',
  width               integer not null default 0,
  height              integer not null default 0,
  ratio               text not null default 'landscape'
                      check (ratio in ('landscape', 'portrait', 'square')),
  caption             text not null default '',
  sort_order          integer not null default 0,
  -- 上传即审（NSFW 管线）结果留档；分享前复审按全部 approved 放行
  moderation_status   text not null default 'approved'
                      check (moderation_status in ('approved', 'rejected', 'pending', 'reviewing')),
  moderation_score    numeric(5,4) not null default 0,
  moderation_source   text not null default 'auto',
  created_at          timestamptz not null default now()
);

create index if not exists idx_photo_album_photos_album
  on public.photo_album_photos (album_id, sort_order);

comment on table public.photo_album_photos is
  '影集照片池。pages.photo_refs 按 id 有序引用本表；宽高比供自动初排匹配版式槽位。';

-- ============================================================
-- 3) 页面流
-- ============================================================
create table if not exists public.photo_album_pages (
  id            uuid primary key default gen_random_uuid(),
  album_id      uuid not null references public.photo_albums(id) on delete cascade,
  page_index    integer not null,
  page_type     text not null default 'content'
                check (page_type in ('cover', 'chapter', 'content', 'end')),
  layout_id     text not null default 'full',
  chapter_title text not null default '',
  note          text not null default '',
  photo_refs    jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (album_id, page_index)
);

comment on table public.photo_album_pages is
  '影集页面流。photo_refs 为照片池 id 的有序数组（jsonb）；layout_id 对应前端版式库。';

-- ============================================================
-- 4) 导出台账（月度导出配额判定）
-- ============================================================
create table if not exists public.photo_album_exports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  album_id   uuid not null references public.photo_albums(id) on delete cascade,
  kind       text not null default 'single' check (kind in ('single', 'zip')),
  created_at timestamptz not null default now()
);

create index if not exists idx_photo_album_exports_user_month
  on public.photo_album_exports (user_id, created_at desc);

comment on table public.photo_album_exports is
  '离线 HTML 导出台账。导出计入月度配额（按 tier），超限阻断并提示升级。';

-- ============================================================
-- 5) RLS
-- ============================================================
alter table public.photo_albums enable row level security;
alter table public.photo_album_photos enable row level security;
alter table public.photo_album_pages enable row level security;
alter table public.photo_album_exports enable row level security;

-- ---- photo_albums ----
drop policy if exists photo_albums_select on public.photo_albums;
create policy photo_albums_select on public.photo_albums
  for select to anon, authenticated
  using (
    user_id = auth.uid()
    or (status = 'published' and shared_to_community = true)
    or public.current_user_is_admin()
  );

drop policy if exists photo_albums_own_insert on public.photo_albums;
create policy photo_albums_own_insert on public.photo_albums
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists photo_albums_own_update on public.photo_albums;
create policy photo_albums_own_update on public.photo_albums
  for update to authenticated
  using (user_id = auth.uid() or public.current_user_is_admin())
  with check (user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists photo_albums_own_delete on public.photo_albums;
create policy photo_albums_own_delete on public.photo_albums
  for delete to authenticated
  using (user_id = auth.uid() or public.current_user_is_admin());

-- ---- photo_album_photos ----
drop policy if exists photo_album_photos_select on public.photo_album_photos;
create policy photo_album_photos_select on public.photo_album_photos
  for select to anon, authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.photo_albums a
      where a.id = album_id
        and a.status = 'published'
        and a.shared_to_community = true
    )
    or public.current_user_is_admin()
  );

drop policy if exists photo_album_photos_own_insert on public.photo_album_photos;
create policy photo_album_photos_own_insert on public.photo_album_photos
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists photo_album_photos_own_update on public.photo_album_photos;
create policy photo_album_photos_own_update on public.photo_album_photos
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists photo_album_photos_own_delete on public.photo_album_photos;
create policy photo_album_photos_own_delete on public.photo_album_photos
  for delete to authenticated
  using (user_id = auth.uid());

-- ---- photo_album_pages ----
drop policy if exists photo_album_pages_select on public.photo_album_pages;
create policy photo_album_pages_select on public.photo_album_pages
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.photo_albums a
      where a.id = album_id
        and (a.user_id = auth.uid()
             or (a.status = 'published' and a.shared_to_community = true)
             or public.current_user_is_admin())
    )
  );

drop policy if exists photo_album_pages_own_write on public.photo_album_pages;
create policy photo_album_pages_own_write on public.photo_album_pages
  for all to authenticated
  using (
    exists (
      select 1 from public.photo_albums a
      where a.id = album_id and a.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.photo_albums a
      where a.id = album_id and a.user_id = auth.uid()
    )
  );

-- ---- photo_album_exports ----
drop policy if exists photo_album_exports_select on public.photo_album_exports;
create policy photo_album_exports_select on public.photo_album_exports
  for select to authenticated
  using (user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists photo_album_exports_own_insert on public.photo_album_exports;
create policy photo_album_exports_own_insert on public.photo_album_exports
  for insert to authenticated
  with check (user_id = auth.uid());

-- ============================================================
-- 6) 授权（最小化：先 revoke 再按需 grant）
-- ============================================================
revoke all on table public.photo_albums from anon, authenticated;
grant select on table public.photo_albums to anon;
grant select, insert, update, delete on table public.photo_albums to authenticated;
grant all on table public.photo_albums to service_role;

revoke all on table public.photo_album_photos from anon, authenticated;
grant select on table public.photo_album_photos to anon;
grant select, insert, update, delete on table public.photo_album_photos to authenticated;
grant all on table public.photo_album_photos to service_role;

revoke all on table public.photo_album_pages from anon, authenticated;
grant select on table public.photo_album_pages to anon;
grant select, insert, update, delete on table public.photo_album_pages to authenticated;
grant all on table public.photo_album_pages to service_role;

revoke all on table public.photo_album_exports from anon, authenticated;
grant select, insert on table public.photo_album_exports to authenticated;
grant all on table public.photo_album_exports to service_role;

notify pgrst, 'reload schema';

commit;
