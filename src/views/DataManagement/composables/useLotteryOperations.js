import { shallowReactive } from 'vue';
import { supabase } from '@/utils/supabase-client.js';
import { logger } from '@/utils/logger.js';

export const createLotteryOperationsCenter = ({ isCurrentUserAdmin, showToast }) => {
  const lotteryOperationsSnapshot = shallowReactive({
    isLoading: false,
    isLoaded: false,
    fulfillments: [],
    notificationFailures: [],
    dueLotteries: [],
    joinRiskCount: 0,
    // 精确计数（head count 查询），不受展示列表 limit(6) 截断影响
    fulfillmentCount: 0,
    notificationFailureCount: 0,
    dueLotteryCount: 0
  });

  const refreshLotteryOperationsSnapshot = async () => {
    if (!isCurrentUserAdmin.value || lotteryOperationsSnapshot.isLoading) return;
    lotteryOperationsSnapshot.isLoading = true;
    try {
      const now = new Date().toISOString();
      const [
        fulfillmentsResult,
        notificationsResult,
        dueLotteriesResult,
        joinAttemptsResult,
        fulfillmentCountResult,
        notificationFailedCountResult,
        dueLotteryCountResult
      ] = await Promise.all([
        supabase
          .from('lottery_winner_fulfillments')
          .select('id, lottery_id, username_snapshot, status, contact_note, address_id, shipping_carrier, tracking_number, updated_at, lottery:lottery_id(title), profile:user_id(username)')
          .eq('is_current', true)
          .in('status', ['pending_contact', 'contacted', 'confirmed', 'shipping'])
          .order('updated_at', { ascending: true })
          .limit(6),
        supabase
          .from('lottery_notification_jobs')
          .select('id, lottery_id, user_id, status, attempt_count, last_error, created_at, lottery:lottery_id(title), profile:user_id(username)')
          .in('status', ['failed', 'pending'])
          .order('updated_at', { ascending: true })
          .limit(6),
        supabase
          .from('lotteries')
          .select('id, title, draw_at')
          .eq('status', 'open')
          .lte('draw_at', now)
          .order('draw_at', { ascending: true })
          .limit(6),
        supabase
          .from('lottery_join_attempts')
          .select('result_code')
          .order('created_at', { ascending: false })
          .limit(50),
        // 指标卡使用精确计数，避免被列表 limit(6) 截断
        supabase
          .from('lottery_winner_fulfillments')
          .select('id', { count: 'exact', head: true })
          .eq('is_current', true)
          .in('status', ['pending_contact', 'contacted', 'confirmed', 'shipping']),
        // "通知异常"指标仅统计 failed；pending 属于待调度，不作为异常展示
        supabase
          .from('lottery_notification_jobs')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'failed'),
        supabase
          .from('lotteries')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'open')
          .lte('draw_at', now)
      ]);

      if (fulfillmentsResult.error) throw fulfillmentsResult.error;
      if (notificationsResult.error) throw notificationsResult.error;
      if (dueLotteriesResult.error) throw dueLotteriesResult.error;
      if (fulfillmentCountResult.error) logger.warn('data-admin', '统计待履约数量失败:', fulfillmentCountResult.error);
      if (notificationFailedCountResult.error) logger.warn('data-admin', '统计通知失败数量失败:', notificationFailedCountResult.error);
      if (dueLotteryCountResult.error) logger.warn('data-admin', '统计待开奖数量失败:', dueLotteryCountResult.error);
      if (joinAttemptsResult.error) logger.warn('data-admin', '加载抽奖报名风控样本失败:', joinAttemptsResult.error);

      const getJoined = (value) => Array.isArray(value) ? (value[0] || {}) : (value || {});
      lotteryOperationsSnapshot.fulfillments = (fulfillmentsResult.data || []).map((item) => ({
        ...item,
        lottery_title: getJoined(item.lottery).title || '未命名抽奖',
        username: getJoined(item.profile).username || item.username_snapshot || '中奖用户'
      }));
      lotteryOperationsSnapshot.notificationFailures = (notificationsResult.data || []).map((item) => ({
        ...item,
        lottery_title: getJoined(item.lottery).title || '未命名抽奖',
        username: getJoined(item.profile).username || '中奖用户'
      }));
      lotteryOperationsSnapshot.dueLotteries = dueLotteriesResult.data || [];
      const successfulResults = new Set(['success', 'joined', 'eligible', 'ok']);
      lotteryOperationsSnapshot.joinRiskCount = (joinAttemptsResult.data || []).filter((item) =>
        !successfulResults.has(String(item.result_code || '').toLowerCase())
      ).length;
      lotteryOperationsSnapshot.fulfillmentCount = Number(fulfillmentCountResult.count || 0);
      lotteryOperationsSnapshot.notificationFailureCount = Number(notificationFailedCountResult.count || 0);
      lotteryOperationsSnapshot.dueLotteryCount = Number(dueLotteryCountResult.count || 0);
      lotteryOperationsSnapshot.isLoaded = true;
    } catch (error) {
      logger.warn('data-admin', '加载抽奖运营待办失败:', error);
      showToast('抽奖待办加载失败，请稍后重试', 'warning');
    } finally {
      lotteryOperationsSnapshot.isLoading = false;
    }
  };

  return {
    lotteryOperationsSnapshot,
    refreshLotteryOperationsSnapshot
  };
};
