-- =====================================================================
-- 2026112402_expire_stale_active_subscriptions.sql
--
-- 目的：把「status='active' 但 expires_at 已过」的历史行标成 'expired'。
--
-- ── 为什么值得单独做一次（而不是「反正权益判定会兜住」）──────────────────
-- 权益侧确实兜住了：`get_user_subscription_tier` / `boh_cloud_image_limit_for_user`
-- 等一律带 `expires_at > now()`，所以这 63 行**不影响任何人的实际权益**
-- （2026-11-24 事务内实测：33 个用户的 tier / cloud / capacity 全部零变化）。
--
-- 但「status 说 active、实际已过期」这个**状态本身**会持续误导：
--   · 本次 plans/046 的第一次反证就因此得出过错误结论 —— 摘掉 alias 后 23 行掉回 ''，
--     我误判成「alias 生效」，实际是「这 23 行本来就过期了」。多花了一轮排查。
--   · `admin_cancel_subscription_batch` / `admin_list_subscription_grant_batches`
--     是按 `status='active'` 统计的，会把早已失效的赠送批次算成「在期中」。
--   · 任何日后新写的查询只要漏了 expires_at，就会把这些行当真。
--
-- ── 清理范围（2026-11-24 只读盘点）─────────────────────────────────────
--   max   6 行 / 5 用户    最早 2026-09-29  最晚 2026-10-11
--   plus 23 行 / 23 用户   全部 2026-09-25（整批同一天到期）
--   pro  32 行 / 31 用户   最早 2026-09-29  最晚 2026-11-12
--   ultra 2 行 / 2 用户    最早 2026-09-29  最晚 2026-10-11
--   合计 63 行 —— **全部 points_cost = 0（赠送），无一笔真实付费记录**。
--
-- ── 在期用户（不受影响，执行后复核）────────────────────────────────────
--   汉堡丶    max   expires 2026-11-29  tier=max    cloud=900
--   Ryyik     max   expires 2026-12-29  tier=max    cloud=900
--   雨芙蕖酱酱酱酱 ultra expires 2027-08-30  tier=ultra  cloud=1200
--
-- ── 刻意不做的两件事 ────────────────────────────────────────────────
--   1. **不删行**：只改 status。历史台账（谁在什么时候买过/送过什么）要留着，
--      而且 `annual_member_badge` 之类的 metadata 也在行上。
--   2. **不回填 plan_code**：plans/046 里 plus 行的 `plan_code='plus'` 保持原样，
--      审计上仍然看得见「当初买的 Plus」。归一由 `boh_tier_alias()` 负责。
--
-- 幂等：`status='active' and expires_at <= now()` 是单调收窄的条件，
-- 重复执行只会命中 0 行。
-- =====================================================================

begin;

update public.user_subscriptions
   set status = 'expired',
       updated_at = now(),
       metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'auto_expired_at', now(),
         'auto_expired_reason', 'expires_at 已过而 status 仍为 active（迁移 2026112402 批量修正）'
       )
 where status = 'active'
   and expires_at <= now();

commit;

-- =====================================================================
-- 执行后自检（手动跑，不作为迁移的一部分）
-- =====================================================================
--   ① 残留应为 0
--   select count(*) as stale_active from public.user_subscriptions
--    where status = 'active' and expires_at <= now();
--
--   ② 在期用户应仍是 3 行、档位未变
--   select s.plan_code, s.expires_at::date, public.get_user_subscription_tier(s.user_id) as tier
--     from public.user_subscriptions s
--    where s.status = 'active' and s.expires_at > now() order by s.expires_at;
--
--   ③ 状态分布
--   select status, count(*) from public.user_subscriptions group by 1 order by 1;
-- =====================================================================
