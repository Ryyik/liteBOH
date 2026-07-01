-- 启用 pg_trgm 扩展用于模糊搜索优化
-- 加速 ilike '%keyword%' 模式匹配（前后通配符无法使用普通 B-tree 索引）

create extension if not exists pg_trgm;

-- profiles.username 模糊搜索索引
-- 对应 src/utils/api/auth-api.js 中 .ilike('username', '%...%')
-- 以及 src/views/user-center/Address/index.vue 中 .ilike('username', '%...%')
create index if not exists idx_profiles_username_trgm
  on public.profiles using gin (username gin_trgm_ops);

-- boh_treehole_memories.content 模糊搜索索引
-- 对应 src/utils/api/treehole/cloud-entry-api.js 中 .ilike('content', '%...%')
-- 注意：实际 ilike 查询的表是 boh_treehole_memories（非 boh_cloud_entries，
-- 后者的文本列为 content_text 且未使用 ilike）
create index if not exists idx_boh_treehole_memories_content_trgm
  on public.boh_treehole_memories using gin (content gin_trgm_ops);

-- 注释说明索引用途
comment on index idx_profiles_username_trgm is '加速 profiles.username 的 ilike 模糊搜索';
comment on index idx_boh_treehole_memories_content_trgm is '加速 boh_treehole_memories.content 的 ilike 模糊搜索';
