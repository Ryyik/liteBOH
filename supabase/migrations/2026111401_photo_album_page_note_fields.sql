-- 影集「笔记版式」页面字段（2026-11-14）
--
-- 背景：影集阅读页从双页书改为图文笔记版式，内容页需要三件套：
--   标题（左栏大字）/ 拍摄日期 / 拍摄地点（标题下方一行元信息）。
--
-- 只加列，不改权限：photo_album_pages 的表级 grant
-- （anon 只读 / authenticated 增删改 / service_role 全权，见 2026092703）
-- 已覆盖新增列，无需重复授权，也不涉及 RLS 策略变更。
--
-- 兼容：老影集三列留空即可正常阅读 —— 前端兜底链
--   headline  → 照片配文 → 章节标题 → 影集标题
--   taken_on  → 首图创建日期
--   place     → 为空则元信息行只显示日期

begin;

alter table public.photo_album_pages
  add column if not exists headline text not null default '',
  add column if not exists taken_on date,
  add column if not exists place text not null default '';

comment on column public.photo_album_pages.headline is
  '内容页标题（笔记版式左栏大字；为空时前端回退照片配文/章节标题/影集标题）';

comment on column public.photo_album_pages.taken_on is
  '拍摄日期（笔记版式标题下的元信息行；为空时前端回退首图创建日期）';

comment on column public.photo_album_pages.place is
  '拍摄地点（笔记版式标题下的元信息行；为空时整段不显示）';

notify pgrst, 'reload schema';

commit;
