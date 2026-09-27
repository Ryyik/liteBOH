-- 摄影集 user_id 补默认值 auth.uid()
--
-- 背景：2026092703 建表时 user_id 为 not null 且无默认值，客户端 insert 若漏带
-- user_id 会直接触发 not null violation（创建影集失败的第一根因）。
-- 本迁移为三表补 default auth.uid()（RLS 本人权限下默认即本人），双保险。
-- 注：photo_album_pages 无 user_id 列（归属经 album_id 关联，RLS 以 album.user_id 判定）。

alter table public.photo_albums alter column user_id set default auth.uid();
alter table public.photo_album_photos alter column user_id set default auth.uid();
alter table public.photo_album_exports alter column user_id set default auth.uid();

notify pgrst, 'reload schema';
