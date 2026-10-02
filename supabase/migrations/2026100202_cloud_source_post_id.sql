-- ============================================================================
-- Cloud+ 私密备份库（plans/023 Phase 2/3）：底账条目关联来源帖子
--
-- 产品口径（2026-10-02 用户定稿）：
--   Cloud+ = 作品照片的**私密备份库**，「设为公开」入口已取消。
--   帖子的图片在发帖成功后自动备份为一条 source='forum' 的底账条目。
--
-- 本迁移做两件事：
--   ① boh_cloud_entries 加 source_post_id（nullable，指向 posts.id）
--   ② on delete cascade —— 删帖时由数据库级联删除备份行。
--      应用层不需要写「删帖删备份」的代码：post-api.deletePost 既有的
--      deleteCloudinaryAssetsByPublicIds 清的就是同一批资产（备份引用的是
--      同一批 Cloudinary url），行被级联删、资产被既有逻辑清，闭环自然成立。
--
-- 反向（删备份 → 删帖）不需要迁移：应用层已禁止单独删除 source='forum' 的
-- 底账（FORUM_SYNCED_CLOUD_ENTRY_LOCKED，提示去论坛删原帖），比级联更安全。
--
-- ⚠️ 历史帖子不回填：只对本迁移上线后的新帖生效（plans/023 决策点 2）。
-- ============================================================================

alter table boh_cloud_entries
  add column if not exists source_post_id uuid null references posts(id) on delete cascade;

create index if not exists boh_cloud_entries_source_post_id_idx
  on boh_cloud_entries (source_post_id);
