-- 热路径外键补索引
--
-- 背景（2026-09-20 审计，docs/2026-09-20-数据库与加载性能审查报告.md §2.1）：
--   严格口径下全库 52 个外键无前导索引，其中以下 5 个有真实业务代价：
--     1) notifications(post_id / comment_id) —— 删帖/删评论触发 notifications
--        级联删除或按帖子反查通知时全表扫；notifications 是应用最热的表。
--     2) notifications(sender_id) —— 通知发送者反查。
--     3) comment_likes(user_id) —— 「我点赞过的评论」与 user_id 级联删除；
--        该表只有 PK(id) 与 unique(comment_id, user_id)，user_id 完全裸奔。
--     4) forum_post_images(cloud_entry_id) —— Cloudinary 清理反查。
--
-- 明确不加的（审计结论，勿顺手补齐）：
--   * lottery_draw_logs / lotteries —— 表只有 5-7 行，30 万次 seq_scan 来自
--     每分钟的 execute_due_lottery_draws 探测，顺序扫描是最优解。
--   * *_created_by / *_updated_by / *_published_by 等审计列 —— 表行数小，
--     加了只会变成新的零命中索引。
--   * 其余 46 个外键 —— 按 §2.2 的清单逐个按真实查询写法决定，不要按外键数量批量补齐。

begin;

-- notifications.post_id（可空 → 部分索引，只为非空行建树）
create index if not exists idx_notifications_post_id
  on public.notifications (post_id)
  where post_id is not null;

-- notifications.comment_id（可空 → 部分索引）
create index if not exists idx_notifications_comment_id
  on public.notifications (comment_id)
  where comment_id is not null;

-- notifications.sender_id（可空 → 部分索引）
create index if not exists idx_notifications_sender_id
  on public.notifications (sender_id)
  where sender_id is not null;

-- comment_likes.user_id（非空，全量索引）
create index if not exists idx_comment_likes_user_id
  on public.comment_likes (user_id);

-- forum_post_images.cloud_entry_id（可空 → 部分索引）
create index if not exists idx_forum_post_images_cloud_entry_id
  on public.forum_post_images (cloud_entry_id)
  where cloud_entry_id is not null;

commit;

-- 索引不影响 PostgREST 的 REST 可见 schema（表/列/函数才是），
-- 故本迁移不发 notify pgrst —— 见 2026081407 的先例。
-- 每条 notify 会触发一次 PostgREST schema cache 重载，实测 mean 279ms（§1.2）。
