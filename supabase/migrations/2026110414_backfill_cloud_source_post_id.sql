-- ============================================================================
-- 历史论坛备份条目回填 source_post_id（plans/039 前置数据修复）
--
-- 背景：
--   2026100202 给 boh_cloud_entries 加了 source_post_id，但**只对新帖写入**
--   （迁移头注释「历史帖子不回填」）。实测 2026-11-04：61 条 source='forum' 的备份
--   全部 source_post_id is null ⇒ 「图库删图 → 同步原帖」对老内容完全失效。
--
-- 依据：
--   posts.forum_cloud_entry_id 是建帖时写入的反向链接（同一行备份），可无损反推。
--   只回填「一条备份恰好对应一条帖子」的情形，多对一（理论上不该出现）不动，留人工排查。
--
-- 副作用控制：
--   表上有 BEFORE UPDATE 的 touch_boh_cloud_updated_at，会把 61 行的 updated_at 刷成 now()，
--   从而打乱相册里同一天条目的次序（相册按 entry_date desc, updated_at desc 排）。
--   这里在事务内临时禁用该触发器，回填完立刻恢复 —— DDL 在事务里，失败会一起回滚。
-- ============================================================================

begin;

alter table public.boh_cloud_entries
  disable trigger trg_boh_cloud_entries_updated_at;

update public.boh_cloud_entries e
   set source_post_id = p.id
  from public.posts p
 where p.forum_cloud_entry_id = e.id
   and e.source = 'forum'
   and e.source_post_id is null
   and (
     select count(*)
       from public.posts p2
      where p2.forum_cloud_entry_id = e.id
   ) = 1;

alter table public.boh_cloud_entries
  enable trigger trg_boh_cloud_entries_updated_at;

commit;
