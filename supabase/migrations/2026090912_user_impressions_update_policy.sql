-- 2026090912: user_impressions 允许作者更新自己发出的印象
-- 背景：表有 UNIQUE (author_id, target_id) 约束（一人对同一目标仅一条印象），
-- 客户端重复填写时 insert 撞约束报 duplicate key（23505）。
-- 修复：客户端改 upsert（ON CONFLICT DO UPDATE 覆盖旧印象），
--       本迁移补上 UPDATE policy（此前只有 INSERT/SELECT/DELETE，upsert 的 update 路径会被 RLS 拦）。

CREATE POLICY user_impressions_update_own ON public.user_impressions
  FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);
