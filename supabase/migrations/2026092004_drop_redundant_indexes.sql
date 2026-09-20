-- 删除冗余索引（前缀被覆盖 / 与唯一索引重复 / 与主键重复）
--
-- 背景（2026-09-20 审计，docs/2026-09-20-数据库与加载性能审查报告.md §2.3）：
--   PostgreSQL 的 B-tree 可以反向扫描，所以 (id DESC) 与 (id) 等价；
--   更长的复合索引能服务其前缀列的全部查询。因此下面每一条都满足
--   「删短的 / 删带谓词的 / 删非唯一的」，被覆盖者功能上是超集。
--
-- 判定口径（两条都要满足才删）：
--   1) 同表存在索引 A，A 的键列 ⊇ B 的键列（A 更长或等长）
--   2) A 能覆盖 B 的全部能力：A 唯一 或 B 非唯一；A 无谓词 或 A、B 谓词相同
--   ⚠️ 方向别搞反：前缀被覆盖时冗余的是「短的」那条。
--      本审计第一版曾把 user_gifts.idx_user_gifts_user_created_at (user_id, created_at DESC)
--      误判为可删（它不是冗余，1 列索引无法服务 ORDER BY created_at），已剔除，勿补回。
--
-- 量级：全部命中表的最大堆只有 posts 128KB，drop index（非 concurrently）锁表毫秒级。
--       删除累计回收约 224KB 索引空间，真正的收益是**减少每次 INSERT/UPDATE 的索引维护份数**。
--
-- 回滚：见文件末尾的恢复附录，每条都可单独重建。

begin;

-- likes (post_id) ← likes_post_id_user_id_key UNIQUE (post_id, user_id)  [1,402,700 次扫描将转由唯一索引承担]
drop index if exists public.idx_likes_post_id;

-- posts (author_id, created_at DESC) ← idx_posts_author_created_id (…, id DESC)
drop index if exists public.idx_posts_author_created_at;

-- posts (author_username) ← idx_posts_author_username_created_at (…, created_at DESC)
drop index if exists public.idx_posts_author_username;

-- posts (tag,status,created_at,id) WHERE tag IS NOT NULL ← idx_posts_tag_status_created_id（同列、无谓词）
drop index if exists public.idx_posts_tag_status_created_at_id;

-- profiles (username) ← profiles_username_key UNIQUE (username)
drop index if exists public.idx_profiles_username;

-- comments (author_username) ← idx_comments_author_username_created_at (…, created_at DESC)
drop index if exists public.idx_comments_author_username;

-- forum_post_images (post_id, sort_order) ← uniq_forum_post_images_post_order UNIQUE（同列）
drop index if exists public.idx_forum_post_images_post_order;

-- health_daily_logs (user_id, log_date DESC) ← health_daily_logs_user_id_log_date_key UNIQUE (user_id, log_date)
--   唯一索引可反向扫描覆盖 log_date DESC 的排序需求
drop index if exists public.idx_health_daily_logs_user_date;

-- api_key_vault (provider, purpose) ← api_key_vault_provider_purpose_key UNIQUE（同列）
drop index if exists public.api_key_vault_provider_purpose_idx;

-- products (id) ← products_pkey (id)
drop index if exists public.idx_products_id;

-- news (id DESC) ← news_pkey (id)
drop index if exists public.idx_news_id_desc;

-- activities (id DESC) ← activities_pkey (id)
drop index if exists public.idx_activities_id_desc;

commit;

-- ── 恢复附录（如某条删除后出现计划退化，单独执行对应一行即可，无需整体回滚）──
-- create index if not exists idx_likes_post_id                on public.likes             using btree (post_id);
-- create index if not exists idx_posts_author_created_at      on public.posts             using btree (author_id, created_at desc);
-- create index if not exists idx_posts_author_username        on public.posts             using btree (author_username);
-- create index if not exists idx_posts_tag_status_created_at_id on public.posts           using btree (tag, status, created_at desc, id desc) where (tag is not null);
-- create index if not exists idx_profiles_username            on public.profiles          using btree (username);
-- create index if not exists idx_comments_author_username     on public.comments          using btree (author_username);
-- create index if not exists idx_forum_post_images_post_order on public.forum_post_images using btree (post_id, sort_order);
-- create index if not exists idx_health_daily_logs_user_date  on public.health_daily_logs using btree (user_id, log_date desc);
-- create index if not exists api_key_vault_provider_purpose_idx on public.api_key_vault   using btree (provider, purpose);
-- create index if not exists idx_products_id                  on public.products          using btree (id);
-- create index if not exists idx_news_id_desc                 on public.news              using btree (id desc);
-- create index if not exists idx_activities_id_desc           on public.activities        using btree (id desc);
