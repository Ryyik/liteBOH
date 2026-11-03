-- ============================================================================
-- B1 · anon 表级 SELECT 授权收口（第一批：零前端引用面）
--
-- 背景（2026-11-02 RC 安全复审 P2-2）：
--   public 下 99 张表里 **79 张**给了 anon 表级 SELECT 授权。表级授权在 RLS
--   **之外**，是第二道闸 —— 现在 RLS 挡住了绝大部分（策略里都带 auth.uid() /
--   current_user_is_admin() 判断，匿名读到 0 行），但只要将来某张表误加一条
--   宽松策略，anon 立刻就能读全表，没有任何兜底。
--
-- 为什么只做「零引用」这批：
--   revoke 表级授权会把「RLS 挡住 → 200 + []」变成「表级拒绝 → 42501」。
--   前者前端静默兜底，后者会被 normalizeDbError 归到「权限/封禁」分支
--   （2026-10-17 修过的 42501 误判事故同款）。所以对**前端可能访问**的表，
--   revoke 必须逐条确认调用点有登录守卫，不能批量做。
--
-- 本批 18 张表的入选标准（可复算）：
--   `grep -c "\.from('<表>')" src/**` = 0，即前端从未直读；
--   它们的读写方是 Edge Function / cron / 管理端 RPC（service_role 与
--   postgres 不受 revoke 影响）。
--
-- 保留名单（**故意不 revoke**，下一批要逐表确认登录守卫）：
--   notifications / points_transactions / user_addresses / user_gifts /
--   user_subscriptions / anniversary_subscription_claims / shop_points_orders /
--   forum_post_drafts / forum_weekly_checkins / points_card_presets /
--   comment_likes / boh_treehole_* / boh_note_entries / boh_cloud_share_channels /
--   home_heroes_revisions / moderation_logs / lottery_entries 等。
--   公开内容表（posts / comments / products / news / activities / photo_album_* /
--   boh_ai_* public 视图等）一律保留 —— 匿名浏览是产品功能。
--
-- 一并清理：place_shop_order_with_points
--   `supabase db lint` 报它引用了不存在的 pg_temp 表（每次调用必抛 42P01），
--   且写的是**库里已不存在的** public.shop_orders。它是 SECURITY DEFINER 且
--   anon 可执行 ⇒ 一个任何人都能触发、必然报错的入口。全仓零调用（唯一出现处
--   是基线 JSON 与文档），直接 drop；`create_shop_order` 是现行唯一入口。
-- ============================================================================

revoke select on table
  public.activity_rewards,
  public.ai_quota_log,
  public.ai_token_reservations,
  public.ai_web_search_log,
  public.api_key_vault,
  public.api_key_vault_audit_logs,
  public.boh_cloud_share_viewers,
  public.forum_post_reports,
  public.forum_rate_limit_events,
  public.lottery_admin_audit_logs,
  public.lottery_draw_logs,
  public.lottery_eligibility_exclusions,
  public.lottery_pity_events,
  public.lottery_scheduler_logs,
  public.post_reward_campaigns,
  public.post_reward_claims,
  public.poster_requests,
  public.subscription_plan_prices
from anon;

-- 死函数：写不存在的表（public.shop_orders）+ 引用不存在的 pg_temp 表
drop function if exists public.place_shop_order_with_points(jsonb, text, text, jsonb);
