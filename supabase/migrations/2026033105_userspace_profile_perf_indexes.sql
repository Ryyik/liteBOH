-- userspace/profile 页面热点查询索引加固
-- 目标:
-- 1) 降低 /profile/:username 的帖子、回复、印象查询成本
-- 2) 降低 /user-space 社区列表分页与搜索成本
-- 3) 降低 user_gifts 进行中礼物状态查询成本

-- Supabase SQL Editor 会在事务中运行语句，因此这里使用普通 create index。
-- 建议在访问低峰期执行，避免大表建索引时短暂阻塞写入。
create index if not exists idx_profiles_username
  on public.profiles (username);

create index if not exists idx_profiles_join_date_username
  on public.profiles (join_date desc, username asc);

create index if not exists idx_posts_author_id_created_at
  on public.posts (author_id, created_at desc);

create index if not exists idx_posts_author_username_created_at
  on public.posts (author_username, created_at desc);

create index if not exists idx_comments_author_id_created_at
  on public.comments (author_id, created_at desc);

create index if not exists idx_comments_author_username_created_at
  on public.comments (author_username, created_at desc);

create index if not exists idx_user_impressions_target_created_at
  on public.user_impressions (target_id, created_at desc);

create index if not exists idx_user_gifts_user_active_updated_at
  on public.user_gifts (user_id, is_active, updated_at desc);
