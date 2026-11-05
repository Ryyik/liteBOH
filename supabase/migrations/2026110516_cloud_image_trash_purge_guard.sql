-- ============================================================================
-- 图库回收站：purge 前的「资产归属」闸门（2026-11-05 安全审查补丁）
--
-- 补的是什么洞：
--   purge-cloud-image-trash 直接拿回收站行里的 public_id 调 Cloudinary destroy，
--   而这个值是 delete_cloud_entry_images 从**用户可写的** content_blocks 里原样
--   拷过来的；上传守卫（2026042802）只校验 URL 正则与 publicId 字符，不校验归属。
--   ⇒ 任何登录用户可以在自己条目里放一张指向别人图片的 block，删进回收站后用
--     自己的 JWT 点「永久删除」，用站方 API secret 把别人的资产真删掉。
--
-- 修法（EF 侧，见 supabase/functions/purge-cloud-image-trash/index.ts）：
--   销毁前用 cloudinary_pending_uploads（上传时按 user_id + public_id 登记，
--   见 src/utils/cloudinary-client.js 的 upsert）反查归属，不是本人上传的一律
--   不销毁。归属**证不出来**（旧资产没有登记行）也不销毁 —— 宁可留一个孤儿资产，
--   也不能误删别人的图。
--
-- 本迁移只补一个状态位，让「拒绝销毁」的行不阻塞每日巡检：
--   skipped：归属校验不通过 / 证不出来 ⇒ 永不销毁，也不参与 pending 扫描。
--   skipped_reason：'ownership_mismatch'（登记在别人名下）/ 'ownership_unverified'
--                   （没有登记行，无法证明归属）。
--   ⚠️ skipped 行不会出现在回收站列表（那边只查 state='pending'），也不会被恢复。
--      它的资产**仍然存在**，只是不再有销毁路径 —— 需要人工排查时按 skipped_reason 捞。
-- ============================================================================

begin;

alter table public.boh_cloud_image_trash
  add column if not exists skipped_reason text not null default '';

alter table public.boh_cloud_image_trash
  drop constraint if exists boh_cloud_image_trash_state_check;

alter table public.boh_cloud_image_trash
  add constraint boh_cloud_image_trash_state_check
  check (state = any (array['pending'::text, 'restored'::text, 'purged'::text, 'skipped'::text]));

-- 巡检只扫 pending（boh_cloud_image_trash_purge_idx 已是 where state='pending' 的部分索引），
-- 这里补一条按原因排查用的索引：量很小，但能让人一眼捞全「被拒绝销毁」的行。
create index if not exists boh_cloud_image_trash_skipped_idx
  on public.boh_cloud_image_trash (skipped_reason, deleted_at desc)
  where state = 'skipped';

comment on column public.boh_cloud_image_trash.skipped_reason is
  'purge 时归属校验未通过的原因：ownership_mismatch / ownership_unverified。非空即资产不会再被销毁。';

commit;
