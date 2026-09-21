-- 2026092101_revoke_anon_execute_and_table_writes.sql
-- 目的：按最小权限收窄 anon 的函数 EXECUTE 与表级写权限。
--
-- 背景（2026-09-21 全量复检实测）：
--   anon 可 EXECUTE 的函数 224 个（其中 SECURITY DEFINER 149 个）；
--   88 张 public 表里 75 张对 anon 开放 INSERT/UPDATE/DELETE。
--
-- 关键实证（决定了本迁移的写法）：
--   1) 仅 `revoke ... from anon` **无效** —— 函数的 EXECUTE 同时存在 PUBLIC 授权，
--      anon 经 PUBLIC 继承，has_function_privilege('anon',...) 仍为 true。
--      必须 `revoke ... from anon, public`。已实测：
--        只撤 anon            → anon_can_execute = t  （撤不干净）
--        撤 anon, public      → anon_can_execute = f 且 authenticated_can_execute = t
--   2) authenticated / service_role 持有**显式**授权，撤 PUBLIC 不影响它们。
--   3) service_role 下 auth.uid() 为 NULL（门不能用 auth.uid() 判 service_role）。
--
-- 本迁移【不处理】以下对象，原因逐条如下（留待第二步，需匿名流量实测）：
--   - resolve_email_for_login     登录降级路径仍依赖（EF 部署后随迁移一并删除）
--   - increment_ad_clicks         公开页游客点击计数，改为内部节流而非撤权
--   - execute_lottery_draw / execute_due_lottery_draws   /lotteries 为公开路由
--   - assert_cloudinary_upload_allowed                   注册流程可能在未登录态调用
--   - cleanup_lottery_scheduler_logs                     前端有调用点，需先确认是否公开页
--   - current_user_is_admin       被 RLS 策略引用；策略按查询者角色求值，
--                                 撤 anon 会让游客查询直接 42501
--
-- ================================================================
-- Part 1：服务端专用函数（仅 service_role 可执行）
--   调用方核实：全部只由 Edge Function 以 service client 调用
--   （api-key-vault / _shared/rate-limiter.ts），无任何前端调用点、无库内调用者。
-- ================================================================
revoke execute on function public.reserve_ai_token_quota(p_reservation_id uuid, p_user_id uuid, p_ip_address text, p_since timestamp with time zone, p_token_limit bigint, p_reserved_tokens integer) from anon, authenticated, public;
revoke execute on function public.reserve_ai_web_search(p_user_id uuid, p_tier text, p_daily_limit integer, p_since timestamp with time zone) from anon, authenticated, public;
revoke execute on function public.release_ai_token_quota(p_reservation_id uuid) from anon, authenticated, public;
revoke execute on function public.settle_ai_token_quota(p_reservation_id uuid, p_prompt_tokens integer, p_completion_tokens integer, p_total_tokens integer, p_model text, p_mode text, p_status text) from anon, authenticated, public;
revoke execute on function public.settle_ai_web_search(p_request_id uuid, p_status text) from anon, authenticated, public;
revoke execute on function public.check_rate_limit(p_key text, p_max_requests integer, p_window_seconds integer) from anon, authenticated, public;
revoke execute on function public.increment_rate_limit(p_key text) from anon, authenticated, public;
revoke execute on function public.get_ai_token_usage_since(p_user_id uuid, p_ip_address text, p_since timestamp with time zone) from anon, authenticated, public;
-- ================================================================
-- Part 2：撤销 anon EXECUTE（保留 authenticated）
--   admin_*（30）：函数体内已有 current_user_is_admin() 门，
--     且后台页均 requiresLogin —— 撤 anon 不可能改变任何合法行为。
--   其余：无任何前端调用点，仅由 cron / 库内 SECURITY DEFINER 函数调用。
-- ================================================================
revoke execute on function public.admin_adjust_pity(p_user_id uuid, p_delta integer, p_reason text) from anon, public;
revoke execute on function public.admin_ban_user(p_user_id uuid, p_reason text, p_until timestamp with time zone, p_admin_id uuid) from anon, public;
revoke execute on function public.admin_ban_user(p_user_id uuid, p_reason text, p_until timestamp with time zone) from anon, public;
revoke execute on function public.admin_batch_adjust_pity(p_user_ids uuid[], p_delta integer, p_reason text) from anon, public;
revoke execute on function public.admin_batch_grant_subscriptions(p_user_ids uuid[], p_plan_code text, p_plan_name text, p_billing_cycle text, p_points_cost integer, p_duration_months integer, p_started_at timestamp with time zone, p_expires_at timestamp with time zone, p_status text, p_metadata jsonb, p_skip_existing boolean, p_skip_any_tier boolean, p_notify boolean, p_duration_days integer, p_extend_if_active boolean) from anon, public;
revoke execute on function public.admin_batch_set_pity(p_user_ids uuid[], p_value integer, p_reason text) from anon, public;
revoke execute on function public.admin_cancel_subscription(p_subscription_id uuid, p_all_active_same_plan boolean) from anon, public;
revoke execute on function public.admin_cancel_subscription_batch(p_batch_id uuid) from anon, public;
revoke execute on function public.admin_cloudinary_usage_estimate() from anon, public;
revoke execute on function public.admin_data_management_counts() from anon, public;
revoke execute on function public.admin_delete_user_account(p_user_id uuid) from anon, public;
revoke execute on function public.admin_get_user_sensitive(p_user_id uuid) from anon, public;
revoke execute on function public.admin_grant_points(p_user_ids uuid[], p_amount integer, p_remark text) from anon, public;
revoke execute on function public.admin_list_existing_subscribers(p_plan_code text, p_any_tier boolean, p_limit integer) from anon, public;
revoke execute on function public.admin_list_pity_batch_ops(p_limit integer) from anon, public;
revoke execute on function public.admin_list_point_grant_batches(p_page integer, p_page_size integer) from anon, public;
revoke execute on function public.admin_list_subscription_grant_batches(p_page integer, p_page_size integer) from anon, public;
revoke execute on function public.admin_list_users_with_sensitive(p_search text, p_limit integer) from anon, public;
revoke execute on function public.admin_lottery_entry_counts(p_lottery_ids uuid[]) from anon, public;
revoke execute on function public.admin_lottery_scheduler_status() from anon, public;
revoke execute on function public.admin_lottery_storage_report() from anon, public;
revoke execute on function public.admin_mute_user(p_user_id uuid, p_reason text, p_until timestamp with time zone, p_admin_id uuid) from anon, public;
revoke execute on function public.admin_mute_user(p_user_id uuid, p_reason text, p_until timestamp with time zone) from anon, public;
revoke execute on function public.admin_replace_lottery_winner(p_fulfillment_id uuid, p_reason text) from anon, public;
revoke execute on function public.admin_reset_all_ai_quotas() from anon, public;
revoke execute on function public.admin_retry_lottery_notification(p_job_id uuid) from anon, public;
revoke execute on function public.admin_set_pity(p_user_id uuid, p_value integer, p_reason text) from anon, public;
revoke execute on function public.admin_supabase_project_status() from anon, public;
revoke execute on function public.admin_unban_user(p_user_id uuid, p_admin_id uuid) from anon, public;
revoke execute on function public.admin_unban_user(p_user_id uuid) from anon, public;
revoke execute on function public.admin_undo_pity(p_user_id uuid, p_reason text) from anon, public;
revoke execute on function public.admin_undo_pity_batch(p_log_id uuid, p_reason text) from anon, public;
revoke execute on function public.admin_unmute_user(p_user_id uuid, p_admin_id uuid) from anon, public;
revoke execute on function public.admin_unmute_user(p_user_id uuid) from anon, public;
revoke execute on function public.admin_update_lottery_winner_fulfillment(p_fulfillment_id uuid, p_status text, p_contact_note text, p_address_id uuid, p_shipping_carrier text, p_tracking_number text) from anon, public;
revoke execute on function public.admin_update_subscription(p_subscription_id uuid, p_plan_code text, p_plan_name text, p_billing_cycle text, p_points_cost integer, p_duration_months integer, p_started_at timestamp with time zone, p_expires_at timestamp with time zone, p_status text) from anon, public;
revoke execute on function public.archive_boh_ai_core_memory_chunks_when_inactive() from anon, public;
revoke execute on function public.archive_boh_ai_knowledge_base_chunks_when_inactive() from anon, public;
revoke execute on function public.archive_boh_ai_knowledge_chunks_for_source() from anon, public;
revoke execute on function public.archive_boh_ai_shared_memory_chunks_when_inactive() from anon, public;
revoke execute on function public.archive_expired_completed_gifts(p_months integer) from anon, public;
revoke execute on function public.boh_cloud_count_forum_images(p_user_id uuid, p_since timestamp with time zone) from anon, public;
revoke execute on function public.boh_enqueue_web_push() from anon, public;
revoke execute on function public.calculate_weekly_checkin_status(p_user_id uuid, p_points_awarded integer, p_message text) from anon, public;
revoke execute on function public.claim_expired_points_card_presets(p_limit integer) from anon, public;
revoke execute on function public.cleanup_auth_security_events(p_altcha_days integer, p_attempt_days integer) from anon, public;
revoke execute on function public.cleanup_expired_bans_and_mutes() from anon, public;
revoke execute on function public.cleanup_forum_post_submissions(p_retention_days integer) from anon, public;
revoke execute on function public.cleanup_lottery_operational_data(p_scheduler_days integer, p_join_attempt_days integer, p_notification_days integer, p_audit_days integer) from anon, public;
revoke execute on function public.cleanup_old_records(p_table text, p_retention_days integer) from anon, public;
revoke execute on function public.complete_points_card_preset_purge(p_preset_id uuid, p_deleted boolean, p_error text) from anon, public;
revoke execute on function public.enforce_forum_comment_rate_limit() from anon, public;
revoke execute on function public.enforce_forum_post_rate_limit() from anon, public;
revoke execute on function public.enforce_message_speech_permission() from anon, public;
revoke execute on function public.insert_moderation_log(p_target_id uuid, p_target_type text, p_ai_result text, p_ai_reason text, p_moderator_id uuid) from anon, public;
revoke execute on function public.log_forum_rate_limit_event(p_user_id uuid, p_target_type text, p_rule_code text, p_target_id uuid) from anon, public;
revoke execute on function public.points_card_preset_capacity_for_user(p_user_id uuid) from anon, public;
revoke execute on function public.record_lottery_join_attempt(p_lottery_id uuid, p_user_id uuid, p_result_code text, p_message text) from anon, public;
revoke execute on function public.refresh_forum_post_counters(p_post_id uuid) from anon, public;
revoke execute on function public.sync_forum_comment_counters() from anon, public;
revoke execute on function public.sync_forum_like_counters() from anon, public;
revoke execute on function public.sync_forum_post_text_fields() from anon, public;
revoke execute on function public.sync_lottery_winner_fulfillment_from_draw_log() from anon, public;
revoke execute on function public.sync_official_forum_card() from anon, public;
revoke execute on function public.update_last_active_at() from anon, public;
-- ================================================================
-- Part 3：表级写权限回收
--   anon 无任何合法写路径：点赞/发帖/抽奖/上报/装扮购买/工单全部需要登录。
--   表级授权是对 anon 的**显式** grant（无 PUBLIC 份额），故只需撤 anon。
--   TRUNCATE 一并撤：TRUNCATE 不受 RLS 约束（PostgREST 无对应方法，
--   属不可远程触达，但按最小权限应当撤）。
-- ================================================================
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon;

-- 未来新建对象的默认权限（防复发）
-- ⚠️ 必须同时撤 `public`：函数默认对 PUBLIC 授予 EXECUTE（PostgreSQL 内建默认），
--    只撤 anon 时 anon 仍经 PUBLIC 继承 → 新建函数会重新变成匿名可调（本文件 :9-13 已实测同一机理）。
alter default privileges in schema public revoke execute on functions from anon, public;
alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon;

notify pgrst, 'reload schema';

-- ================================================================
-- 回滚附录（仅在确认功能退化时使用，逐条恢复，不要整体回滚）
-- ================================================================
-- Part 1 恢复（让前端/匿名可调用）：
-- 说明：此处只恢复 anon / authenticated —— PUBLIC 的隐式 EXECUTE **有意不恢复**，
--       避免回滚时把匿名调用面一并还原。若确需完全复原，自行在 grantees 后补 `, public`。
-- grant execute on function public.reserve_ai_token_quota(p_reservation_id uuid, p_user_id uuid, p_ip_address text, p_since timestamp with time zone, p_token_limit bigint, p_reserved_tokens integer) to anon, authenticated;
-- grant execute on function public.reserve_ai_web_search(p_user_id uuid, p_tier text, p_daily_limit integer, p_since timestamp with time zone) to anon, authenticated;
-- grant execute on function public.release_ai_token_quota(p_reservation_id uuid) to anon, authenticated;
-- grant execute on function public.settle_ai_token_quota(p_reservation_id uuid, p_prompt_tokens integer, p_completion_tokens integer, p_total_tokens integer, p_model text, p_mode text, p_status text) to anon, authenticated;
-- grant execute on function public.settle_ai_web_search(p_request_id uuid, p_status text) to anon, authenticated;
-- grant execute on function public.check_rate_limit(p_key text, p_max_requests integer, p_window_seconds integer) to anon, authenticated;
-- grant execute on function public.increment_rate_limit(p_key text) to anon, authenticated;
-- grant execute on function public.get_ai_token_usage_since(p_user_id uuid, p_ip_address text, p_since timestamp with time zone) to anon, authenticated;
-- grant execute on function public.admin_adjust_pity(p_user_id uuid, p_delta integer, p_reason text) to anon;
-- grant execute on function public.admin_ban_user(p_user_id uuid, p_reason text, p_until timestamp with time zone, p_admin_id uuid) to anon;
-- grant execute on function public.admin_ban_user(p_user_id uuid, p_reason text, p_until timestamp with time zone) to anon;
-- grant execute on function public.admin_batch_adjust_pity(p_user_ids uuid[], p_delta integer, p_reason text) to anon;
-- grant execute on function public.admin_batch_grant_subscriptions(p_user_ids uuid[], p_plan_code text, p_plan_name text, p_billing_cycle text, p_points_cost integer, p_duration_months integer, p_started_at timestamp with time zone, p_expires_at timestamp with time zone, p_status text, p_metadata jsonb, p_skip_existing boolean, p_skip_any_tier boolean, p_notify boolean, p_duration_days integer, p_extend_if_active boolean) to anon;
-- grant execute on function public.admin_batch_set_pity(p_user_ids uuid[], p_value integer, p_reason text) to anon;
-- grant execute on function public.admin_cancel_subscription(p_subscription_id uuid, p_all_active_same_plan boolean) to anon;
-- grant execute on function public.admin_cancel_subscription_batch(p_batch_id uuid) to anon;
-- grant execute on function public.admin_cloudinary_usage_estimate() to anon;
-- grant execute on function public.admin_data_management_counts() to anon;
-- grant execute on function public.admin_delete_user_account(p_user_id uuid) to anon;
-- grant execute on function public.admin_get_user_sensitive(p_user_id uuid) to anon;
-- grant execute on function public.admin_grant_points(p_user_ids uuid[], p_amount integer, p_remark text) to anon;
-- grant execute on function public.admin_list_existing_subscribers(p_plan_code text, p_any_tier boolean, p_limit integer) to anon;
-- grant execute on function public.admin_list_pity_batch_ops(p_limit integer) to anon;
-- grant execute on function public.admin_list_point_grant_batches(p_page integer, p_page_size integer) to anon;
-- grant execute on function public.admin_list_subscription_grant_batches(p_page integer, p_page_size integer) to anon;
-- grant execute on function public.admin_list_users_with_sensitive(p_search text, p_limit integer) to anon;
-- grant execute on function public.admin_lottery_entry_counts(p_lottery_ids uuid[]) to anon;
-- grant execute on function public.admin_lottery_scheduler_status() to anon;
-- grant execute on function public.admin_lottery_storage_report() to anon;
-- grant execute on function public.admin_mute_user(p_user_id uuid, p_reason text, p_until timestamp with time zone, p_admin_id uuid) to anon;
-- grant execute on function public.admin_mute_user(p_user_id uuid, p_reason text, p_until timestamp with time zone) to anon;
-- grant execute on function public.admin_replace_lottery_winner(p_fulfillment_id uuid, p_reason text) to anon;
-- grant execute on function public.admin_reset_all_ai_quotas() to anon;
-- grant execute on function public.admin_retry_lottery_notification(p_job_id uuid) to anon;
-- grant execute on function public.admin_set_pity(p_user_id uuid, p_value integer, p_reason text) to anon;
-- grant execute on function public.admin_supabase_project_status() to anon;
-- grant execute on function public.admin_unban_user(p_user_id uuid, p_admin_id uuid) to anon;
-- grant execute on function public.admin_unban_user(p_user_id uuid) to anon;
-- grant execute on function public.admin_undo_pity(p_user_id uuid, p_reason text) to anon;
-- grant execute on function public.admin_undo_pity_batch(p_log_id uuid, p_reason text) to anon;
-- grant execute on function public.admin_unmute_user(p_user_id uuid, p_admin_id uuid) to anon;
-- grant execute on function public.admin_unmute_user(p_user_id uuid) to anon;
-- grant execute on function public.admin_update_lottery_winner_fulfillment(p_fulfillment_id uuid, p_status text, p_contact_note text, p_address_id uuid, p_shipping_carrier text, p_tracking_number text) to anon;
-- grant execute on function public.admin_update_subscription(p_subscription_id uuid, p_plan_code text, p_plan_name text, p_billing_cycle text, p_points_cost integer, p_duration_months integer, p_started_at timestamp with time zone, p_expires_at timestamp with time zone, p_status text) to anon;
-- grant execute on function public.archive_boh_ai_core_memory_chunks_when_inactive() to anon;
-- grant execute on function public.archive_boh_ai_knowledge_base_chunks_when_inactive() to anon;
-- grant execute on function public.archive_boh_ai_knowledge_chunks_for_source() to anon;
-- grant execute on function public.archive_boh_ai_shared_memory_chunks_when_inactive() to anon;
-- grant execute on function public.archive_expired_completed_gifts(p_months integer) to anon;
-- grant execute on function public.boh_cloud_count_forum_images(p_user_id uuid, p_since timestamp with time zone) to anon;
-- grant execute on function public.boh_enqueue_web_push() to anon;
-- grant execute on function public.calculate_weekly_checkin_status(p_user_id uuid, p_points_awarded integer, p_message text) to anon;
-- grant execute on function public.claim_expired_points_card_presets(p_limit integer) to anon;
-- grant execute on function public.cleanup_auth_security_events(p_altcha_days integer, p_attempt_days integer) to anon;
-- grant execute on function public.cleanup_expired_bans_and_mutes() to anon;
-- grant execute on function public.cleanup_forum_post_submissions(p_retention_days integer) to anon;
-- grant execute on function public.cleanup_lottery_operational_data(p_scheduler_days integer, p_join_attempt_days integer, p_notification_days integer, p_audit_days integer) to anon;
-- grant execute on function public.cleanup_old_records(p_table text, p_retention_days integer) to anon;
-- grant execute on function public.complete_points_card_preset_purge(p_preset_id uuid, p_deleted boolean, p_error text) to anon;
-- grant execute on function public.enforce_forum_comment_rate_limit() to anon;
-- grant execute on function public.enforce_forum_post_rate_limit() to anon;
-- grant execute on function public.enforce_message_speech_permission() to anon;
-- grant execute on function public.insert_moderation_log(p_target_id uuid, p_target_type text, p_ai_result text, p_ai_reason text, p_moderator_id uuid) to anon;
-- grant execute on function public.log_forum_rate_limit_event(p_user_id uuid, p_target_type text, p_rule_code text, p_target_id uuid) to anon;
-- grant execute on function public.points_card_preset_capacity_for_user(p_user_id uuid) to anon;
-- grant execute on function public.record_lottery_join_attempt(p_lottery_id uuid, p_user_id uuid, p_result_code text, p_message text) to anon;
-- grant execute on function public.refresh_forum_post_counters(p_post_id uuid) to anon;
-- grant execute on function public.sync_forum_comment_counters() to anon;
-- grant execute on function public.sync_forum_like_counters() to anon;
-- grant execute on function public.sync_forum_post_text_fields() to anon;
-- grant execute on function public.sync_lottery_winner_fulfillment_from_draw_log() to anon;
-- grant execute on function public.sync_official_forum_card() to anon;
-- grant execute on function public.update_last_active_at() to anon;
-- Part 3 恢复：
-- grant insert, update, delete on all tables in schema public to anon;
-- alter default privileges in schema public grant execute on functions to anon;

-- ================================================================
-- 验证 SQL（迁移后应全部为 f，除白名单）
-- ================================================================
-- select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--  where n.nspname='public' and has_function_privilege('anon', p.oid, 'EXECUTE');
-- 期望：由 224 降为白名单数量（前端公开页实际调用者）
-- select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
--  where n.nspname='public' and c.relkind='r' and has_table_privilege('anon', c.oid, 'INSERT');
-- 期望：0
