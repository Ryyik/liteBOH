-- ============================================================================
-- 2026-11-03 Realtime 发布只保留 notifications（移除 posts / comments / likes）
--
-- 背景（2026-11-02 线上库体检）：
--   `supabase_realtime` 发布里挂了 4 张表，而**全仓只有 2 处 postgres_changes 订阅，
--   且都只订阅 notifications**：
--     · src/utils/api/notifications-api.js:464
--     · src/views/user-center/Messages/index.vue:1642
--   构建产物 dist/static/js/*.js 里同样只有 `table:"notifications"` 一处。
--   ⇒ posts / comments / likes 挂在发布里没有任何消费者，只会让 Realtime 在
--     处理订阅时对它们做多余的 RLS 展开（`realtime.apply_rls`，即
--     `SELECT wal->>…` 那三条热点语句）。
--
-- 已实测的数据（236 天累计）：
--   · `realtime.apply_rls` 三条语句合计 4,838,695 次调用 / 24,198,645 ms，
--     占 pg_stat_statements 总执行时间的 65.9%，逻辑读占 95.1%（60 TB 里的 58 TB）。
--   · 但同一窗口内 posts 只有 265 insert / 871 update、comments 215 / 57、
--     likes 339 —— 写入量与调用量差 1700 倍，说明调用是按「订阅操作」而非
--     「WAL 变更」触发的（483 万 ÷ realtime.subscription 的 123,979 次 seq_scan
--     ≈ 每次订阅约 39 次 apply_rls）。
--   ⇒ 所以本条**不是**「砍掉 66% 负载」，而是「削掉每次订阅里 3/4 的表展开量」。
--     真正的调用源头（订阅被反复创建）另行排查，不在本迁移内。
--
-- 2026-11-03 08:15 CST 已手工在线上执行过一次同样的改动
-- （`alter publication supabase_realtime drop table public.posts, public.comments, public.likes`），
-- 本条迁移用于把这次变更补进账本，保证 `db reset` / 新环境重放后 schema 与线上一致。
--
-- 幂等：逐个表判断是否还在发布里再 drop —— 对已经不存在的表执行
-- `alter publication drop table` 会报错，直接写死会让重放失败。
--
-- 回滚：`alter publication supabase_realtime add table public.posts, public.comments, public.likes;`
-- ============================================================================

begin;

do $$
declare
  t text;
begin
  foreach t in array array['posts', 'comments', 'likes'] loop
    if exists (
      select 1
        from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
      raise notice 'removed % from supabase_realtime', t;
    else
      raise notice '% already absent from supabase_realtime', t;
    end if;
  end loop;
end $$;

-- 自证：notifications 必须还在，否则消息中心的实时通知会静默失效
do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'notifications'
  ) then
    raise exception 'supabase_realtime 发布里缺少 notifications，实时通知会被打断';
  end if;
end $$;

comment on publication supabase_realtime is
  '只发布 notifications：posts/comments/likes 无任何客户端订阅（2026-11-03 移除），要加回请先确认前端确实有对应 postgres_changes 消费者';

commit;
