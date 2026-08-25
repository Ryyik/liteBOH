/**
 * DataAdmin 写入操作 (CRUD / 抽奖 / 审核)
 * 拆分自 DataAdmin.vue (P2 拆分第二阶段)
 *
 * 集中管理所有对 Supabase 的写操作:
 *   - 通用: deleteItem / deleteAdminUser / batchDelete
 *   - 抽奖: drawLotteryNow / redrawLottery / closeLottery
 *   - 审核: saveModerationLog / updateModerationStatus / deleteModerationTarget /
 *           applyModerationAction / approveModerationItem / rejectModerationItem /
 *           keepLimitedModerationItem / deleteModerationItem
 *
 * 设计要点:
 *   - 所有 RPC 调用都先尝试, 失败时回退到直接 query (PGRST202 容错)
 *   - 所有操作先写 change log, 再 toast, 最后 refresh
 *   - 抽奖/审核操作有 pending state 防止重复点击
 *   - 删除操作有强 confirm 弹窗
 *
 * 工厂模式: 接收所有依赖, 不持有 ref
 */

import { supabase } from '@/utils/supabase-client.js';
import { logger } from '@/utils/logger.js';
import { invalidateProductsCache } from '@/views/DataManagement/config.js';

/**
 * 创建 mutations 中心
 * @param {Object} deps
 * @param {Object} deps.dialog                       - useConfirmDialog
 * @param {Function} deps.showToast                  - (msg, type) => void
 * @param {Object} deps.userInfo                     - 响应式 user info
 * @param {Function} deps.assertAdminAction          - () => void
 * @param {Function} deps.invalidateSubscriptionCache - (userId) => void
 * @param {Function} deps.addChangeLogEntry           - (action, item, detail) => void
 * @param {Function} deps.refreshCurrentViewAfterMutation - () => Promise<void>
 * @param {Object} deps.currentTab                   - ref<string>
 * @param {Object} deps.currentConfig                - computed<{table}>
 * @param {Object} deps.selectedItems                - ref<Array>
 * @param {Function} deps.buildActionErrorMessage    - (error, fallback) => string
 * @param {Function} deps.setLotteryActionPending    - (id, pending) => void
 * @param {Function} deps.isLotteryActionPending     - (id) => boolean
 * @param {Function} deps.setModerationPending       - (id, pending) => void
 * @param {Function} deps.isModerationActionPending  - (id) => boolean
 * @param {Object} deps.moderationTabConfig          - computed<{targetType, statusField, reasonField, approveValue, rejectValue, table}>
 * @param {Object} deps.addRecentRecord              - (item, tabId) => void
 * @param {Function} deps.switchTab                  - (tabId, options) => void
 * @param {Object} deps.dataStore                    - shallowReactive<{users: [], ...}> (P1 修复: 状态联动)
 */
export const createMutationsCenter = (deps) => {
  const {
    dialog,
    showToast,
    userInfo,
    assertAdminAction,
    invalidateSubscriptionCache,
    addChangeLogEntry,
    refreshCurrentViewAfterMutation,
    currentTab,
    currentConfig,
    selectedItems,
    buildActionErrorMessage,
    setLotteryActionPending,
    isLotteryActionPending,
    setModerationPending,
    isModerationActionPending,
    moderationTabConfig,
    addRecentRecord,
    switchTab,
    // P1 修复: 添加 dataStore 用于直接更新用户状态
    dataStore
  } = deps;

  // ==================== 辅助函数 ====================

  // 判断是否是 RPC 函数不存在的错误
  const isMissingRpcFunctionError = (error, fnName) => {
    const code = String(error?.code || '').toUpperCase();
    const message = String(error?.message || '').toLowerCase();
    return code === 'PGRST202' || message.includes(String(fnName || '').toLowerCase());
  };

  // 审核操作错误信息(含 RLS 错误识别)
  const buildModerationErrorMessage = (error) => {
    const normalizedMessage = buildActionErrorMessage(error, '操作失败');
    if (normalizedMessage !== String(error?.message || '').trim()) {
      return normalizedMessage;
    }
    const rawMessage = String(error?.message || '').toLowerCase();
    const rawCode = String(error?.code || '').toUpperCase();
    if (rawCode === '42501' || rawMessage.includes('row-level security') || rawMessage.includes('permission denied')) {
      return '当前账号没有审核写入权限，请检查 Supabase 的 RLS/策略配置';
    }
    return String(error?.message || '操作失败');
  };

  // ==================== 删除 ====================

  // 管理员删除用户账号(走 RPC, 失败时报错)
  const deleteAdminUser = async (item) => {
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_delete_user_account', {
      p_user_id: item.id
    });

    if (rpcError) {
      if (isMissingRpcFunctionError(rpcError, 'admin_delete_user_account')) {
        throw new Error('管理员删除用户 RPC 尚未部署，请先执行最新 Supabase migration');
      }
      throw rpcError;
    }

    if (!rpcData?.ok) {
      throw new Error(String(rpcData?.message || '用户删除失败，未返回成功状态'));
    }
  };

  // 单条删除
  const deleteItem = async (item) => {
    if (!await dialog.confirm({
      title: '删除记录',
      message: '确定要删除这条记录吗？',
      tone: 'danger',
      confirmText: '删除'
    })) return;

    try {
      assertAdminAction();
      if ((currentTab.value === 'users' || currentTab.value === 'points') && item?.id) {
        await deleteAdminUser(item);
      } else {
        const { data, error } = await supabase
          .from(currentConfig.value.table)
          .delete()
          .eq('id', item.id)
          .select('id');
        if (error) throw error;
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error('删除失败：没有记录被删除，请检查管理员权限或记录是否存在');
        }
      }
      if (currentTab.value === 'products') invalidateProductsCache();
      if (currentTab.value === 'subscriptions') invalidateSubscriptionCache(item?.user_id);
      addChangeLogEntry('delete', item, { recordId: item?.id || '' });
      showToast('删除成功', 'success');
      await refreshCurrentViewAfterMutation();
    } catch (error) {
      logger.error('data-admin', '删除失败:', error);
      showToast('删除失败: ' + buildActionErrorMessage(error, '删除失败'), 'error');
    }
  };

  // 批量删除
  const batchDelete = async () => {
    if (!await dialog.confirm({
      title: '批量删除',
      message: `确定要删除选中的 ${selectedItems.value.length} 条记录吗？此操作不可恢复。`,
      tone: 'danger',
      confirmText: `删除 ${selectedItems.value.length} 条`
    })) return;

    try {
      assertAdminAction();
      const table = currentConfig.value.table;
      const ids = selectedItems.value.map((item) => item.id);

      if (currentTab.value === 'users') {
        for (const item of selectedItems.value) {
          await deleteAdminUser(item);
        }
      } else {
        const { data, error } = await supabase
          .from(table)
          .delete()
          .in('id', ids)
          .select('id');

        if (error) throw error;
        if (!Array.isArray(data) || data.length !== ids.length) {
          throw new Error(`批量删除未完全生效：请求 ${ids.length} 条，实际删除 ${Array.isArray(data) ? data.length : 0} 条`);
        }
      }
      if (currentTab.value === 'products') invalidateProductsCache();
      if (currentTab.value === 'subscriptions') {
        selectedItems.value.forEach((item) => invalidateSubscriptionCache(item?.user_id));
      }
      addChangeLogEntry('batch_delete', { id: ids.join(',') }, { count: ids.length });
      showToast('批量删除成功', 'success');
      selectedItems.value = [];
      await refreshCurrentViewAfterMutation();
    } catch (error) {
      logger.error('data-admin', '批量删除失败:', error);
      showToast('批量删除失败: ' + buildActionErrorMessage(error, '批量删除失败'), 'error');
    }
  };

  // ==================== 抽奖操作 ====================

  // 立即开奖
  const drawLotteryNow = async (item) => {
    if (!item?.id || isLotteryActionPending(item.id)) return;
    const entryCount = Number(item.entry_count || 0);
    const confirmMessage = entryCount > 0
      ? `确定要从 ${entryCount} 名报名用户中随机开奖吗？`
      : '当前还没有报名用户，仍要开奖并标记为"无中奖者"吗？';
    if (!await dialog.confirm({
      title: '立即开奖',
      message: confirmMessage,
      tone: 'warning',
      confirmText: '立即开奖'
    })) return;

    setLotteryActionPending(item.id, true);
    try {
      assertAdminAction();
      const { data, error } = await supabase.rpc('execute_lottery_draw', {
        p_lottery_id: item.id,
        p_force: true,
        p_redraw: false,
        p_reason: 'manual_draw'
      });
      if (error) throw error;
      if (!data?.ok) {
        throw new Error(String(data?.message || '开奖失败'));
      }
      const winnerNames = Array.isArray(data?.winners)
        ? data.winners.map((winner) => String(winner?.username || '').trim()).filter(Boolean)
        : [];
      addChangeLogEntry('lottery_draw', item, { winners: winnerNames, entryCount });
      showToast(winnerNames.length ? `开奖完成，中奖者：${winnerNames.join('、')}` : '开奖完成，本期暂无中奖者', 'success');
      await refreshCurrentViewAfterMutation();
    } catch (error) {
      logger.error('data-admin', '抽奖开奖失败:', error);
      showToast('开奖失败: ' + buildActionErrorMessage(error, '开奖失败'), 'error');
    } finally {
      setLotteryActionPending(item.id, false);
    }
  };

  // 重抽(带必填原因)
  const redrawLottery = async (item) => {
    if (!item?.id || isLotteryActionPending(item.id)) return;
    const reason = await dialog.prompt({
      title: '重抽原因',
      message: '请输入重抽原因（例如：中奖者失联 / 不符合资格）',
      placeholder: '必填',
      defaultValue: ''
    });
    if (reason === null) return;
    const normalizedReason = String(reason || '').trim();
    if (!normalizedReason) {
      showToast('重抽必须填写原因', 'error');
      return;
    }
    if (!await dialog.confirm({
      title: '重新开奖',
      message: '确定要重新开奖吗？系统会保留历史开奖日志，并通知新的中奖用户。',
      tone: 'warning',
      confirmText: '重新开奖'
    })) return;

    setLotteryActionPending(item.id, true);
    try {
      assertAdminAction();
      const { data, error } = await supabase.rpc('execute_lottery_draw', {
        p_lottery_id: item.id,
        p_force: true,
        p_redraw: true,
        p_reason: normalizedReason
      });
      if (error) throw error;
      if (!data?.ok) {
        throw new Error(String(data?.message || '重抽失败'));
      }
      const winnerNames = Array.isArray(data?.winners)
        ? data.winners.map((winner) => String(winner?.username || '').trim()).filter(Boolean)
        : [];
      addChangeLogEntry('lottery_redraw', item, { reason: normalizedReason, winners: winnerNames });
      showToast(winnerNames.length ? `重抽完成，中奖者：${winnerNames.join('、')}` : '重抽完成，本期暂无中奖者', 'success');
      await refreshCurrentViewAfterMutation();
    } catch (error) {
      logger.error('data-admin', '抽奖重抽失败:', error);
      showToast('重抽失败: ' + buildActionErrorMessage(error, '重抽失败'), 'error');
    } finally {
      setLotteryActionPending(item.id, false);
    }
  };

  // 关闭抽奖
  const closeLottery = async (item) => {
    if (!item?.id || isLotteryActionPending(item.id)) return;
    if (!await dialog.confirm({
      title: '关闭抽奖',
      message: '确定要关闭这个抽奖吗？关闭后仍会保留在历史抽奖中。',
      tone: 'warning',
      confirmText: '关闭'
    })) return;

    setLotteryActionPending(item.id, true);
    try {
      assertAdminAction();
      const { data, error } = await supabase
        .from('lotteries')
        .update({
          status: 'closed',
          updated_by: userInfo?.id || null
        })
        .eq('id', item.id)
        .select('id');
      if (error) throw error;
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('关闭失败：没有记录被更新，请检查管理员权限或记录是否存在');
      }
      addChangeLogEntry('lottery_close', item, { status: 'closed' });
      showToast('抽奖已关闭，已保留在历史抽奖中', 'success');
      await refreshCurrentViewAfterMutation();
    } catch (error) {
      logger.error('data-admin', '关闭抽奖失败:', error);
      showToast('关闭失败: ' + buildActionErrorMessage(error, '关闭失败'), 'error');
    } finally {
      setLotteryActionPending(item.id, false);
    }
  };

  // 查看抽奖参与记录
  const viewLotteryEntries = (item) => {
    if (!item?.id) return;
    addRecentRecord(item);
    switchTab('lotteryEntries', { search: String(item.id) });
  };

  // 查看开奖日志（已并入运行审计）
  const viewLotteryDrawLogs = (item) => {
    if (!item?.id) return;
    addRecentRecord(item);
    switchTab('lotteryAuditLogs', { search: String(item.id) });
  };

  const viewLotteryFulfillments = (item) => {
    if (!item?.id) return;
    addRecentRecord(item);
    switchTab('lotteryFulfillments', { search: String(item.id) });
  };

  const advanceLotteryFulfillment = async (item) => {
    if (!item?.id) return;
    if (item.is_current === false) {
      showToast('该履约记录已不是当前资格，无法推进', 'warning');
      return;
    }
    const nextStatus = {
      pending_contact: 'contacted',
      contacted: 'confirmed',
      confirmed: 'shipping',
      shipping: 'fulfilled'
    }[String(item.status || '')];
    if (!nextStatus) {
      showToast('当前履约状态无需继续推进', 'warning');
      return;
    }
    if (!await dialog.confirm({
      title: '推进中奖履约',
      message: `将「${item.username || item.username_snapshot || '该中奖用户'}」更新为 ${nextStatus}。确定继续？`,
      confirmText: '确认推进'
    })) return;
    try {
      assertAdminAction();
      const { data, error } = await supabase.rpc('admin_update_lottery_winner_fulfillment', {
        p_fulfillment_id: item.id,
        p_status: nextStatus,
        p_contact_note: item.contact_note || null,
        p_address_id: item.address_id || null,
        p_shipping_carrier: item.shipping_carrier || null,
        p_tracking_number: item.tracking_number || null
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(String(data?.message || '更新履约失败'));
      addChangeLogEntry('lottery_fulfillment_advance', item, { status: nextStatus });
      showToast('中奖履约已更新', 'success');
      await refreshCurrentViewAfterMutation();
    } catch (error) {
      logger.error('data-admin', '推进中奖履约失败:', error);
      showToast('更新失败: ' + buildActionErrorMessage(error, '更新中奖履约失败'), 'error');
    }
  };

  const replaceLotteryWinner = async (item) => {
    if (!item?.id) return;
    if (item.is_current === false) {
      showToast('该履约记录已不是当前资格，无法替补', 'warning');
      return;
    }
    const reason = await dialog.prompt({
      title: '替补中奖人',
      message: '请输入取消当前中奖资格的原因。系统将从符合条件的报名用户中随机替补同一席位。',
      placeholder: '必填，例如：多次联系未回应',
      defaultValue: ''
    });
    if (reason === null) return;
    const normalizedReason = String(reason || '').trim();
    if (!normalizedReason) {
      showToast('替补必须填写原因', 'error');
      return;
    }
    try {
      assertAdminAction();
      const { data, error } = await supabase.rpc('admin_replace_lottery_winner', {
        p_fulfillment_id: item.id,
        p_reason: normalizedReason
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(String(data?.message || '没有可用候补用户'));
      addChangeLogEntry('lottery_winner_replaced', item, { reason: normalizedReason });
      showToast('已完成替补，并已创建中奖通知', 'success');
      await refreshCurrentViewAfterMutation();
    } catch (error) {
      logger.error('data-admin', '替补中奖人失败:', error);
      showToast('替补失败: ' + buildActionErrorMessage(error, '替补中奖人失败'), 'error');
    }
  };

  const retryLotteryNotification = async (item) => {
    if (!item?.id || item.status === 'sent') return;
    if (!await dialog.confirm({
      title: '重试中奖通知',
      message: `将重新向「${item.username || '中奖用户'}」发送中奖通知。`,
      confirmText: '重新发送'
    })) return;
    try {
      assertAdminAction();
      const { data, error } = await supabase.rpc('admin_retry_lottery_notification', { p_job_id: item.id });
      if (error) throw error;
      if (!data?.ok) throw new Error(String(data?.message || '通知发送失败'));
      addChangeLogEntry('lottery_notification_retry', item, { attempt: Number(item.attempt_count || 0) + 1 });
      showToast('中奖通知已重新发送', 'success');
      await refreshCurrentViewAfterMutation();
    } catch (error) {
      logger.error('data-admin', '重试中奖通知失败:', error);
      showToast('重试失败: ' + buildActionErrorMessage(error, '重试中奖通知失败'), 'error');
    }
  };

  // ==================== 审核操作 ====================

  // 写入审核日志(失败不阻断主流程)
  const saveModerationLog = async (item, actionStatus, reason = '') => {
    const payload = {
      target_id: item.id,
      target_type: moderationTabConfig.value?.targetType || 'unknown',
      ai_result: actionStatus,
      ai_reason: reason || null,
      moderator_id: userInfo.value?.id || null
    };

    const { error } = await supabase.from('moderation_logs').insert([payload]);
    if (error) {
      logger.warn('data-admin', '写入 moderation_logs 失败（不阻断主流程）:', error);
    }
  };

  // 调用 admin_apply_moderation_action RPC, 失败时回退到直接 update
  const updateModerationStatus = async (item, config, updateData) => {
    const rpcPayload = {
      p_target_type: config.targetType,
      p_target_id: item.id,
      p_action_status: updateData[config.statusField],
      p_reason: config.reasonField ? (updateData[config.reasonField] || null) : null
    };
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_apply_moderation_action', rpcPayload);

    if (!rpcError) {
      const ok = Boolean(rpcData?.ok);
      const affected = Number(rpcData?.affected || 0);
      if (!ok || affected <= 0) {
        throw new Error(String(rpcData?.message || '记录未更新，可能是权限不足或记录状态已变化'));
      }
      return;
    }

    if (!isMissingRpcFunctionError(rpcError, 'admin_apply_moderation_action')) {
      throw rpcError;
    }

    const { data, error } = await supabase
      .from(config.table)
      .update(updateData)
      .eq('id', item.id)
      .select('id');

    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('记录未更新，可能是权限不足或记录状态已变化');
    }
  };

  // 删除审核目标(优先 RPC, 回退到直接 delete)
  const deleteModerationTarget = async (item, config) => {
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_delete_moderation_target', {
      p_target_type: config.targetType,
      p_target_id: item.id
    });

    if (!rpcError) {
      const ok = Boolean(rpcData?.ok);
      const affected = Number(rpcData?.affected || 0);
      if (!ok || affected <= 0) {
        throw new Error(String(rpcData?.message || '记录未删除，可能是权限不足或记录不存在'));
      }
      return;
    }

    if (!isMissingRpcFunctionError(rpcError, 'admin_delete_moderation_target')) {
      throw rpcError;
    }

    const { data, error } = await supabase
      .from(config.table)
      .delete()
      .eq('id', item.id)
      .select('id');
    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('记录未删除，可能是权限不足或记录不存在');
    }
  };

  // 通用审核操作: approve / reject / limit
  // P1 优化: 添加 options 参数支持 skipRefresh 和自定义 reason（用于批量审核）
  const applyModerationAction = async (item, action, options = {}) => {
    const { skipRefresh = false, reason: providedReason = null } = options;

    if (!moderationTabConfig.value) return;
    if (!item?.id) {
      showToast('记录缺少 ID，无法执行审核操作', 'error');
      return;
    }
    if (isModerationActionPending(item.id)) return;

    const config = moderationTabConfig.value;
    const isApprove = action === 'approve';
    const isKeepLimited = action === 'limit';
    let reason = providedReason || '';

    if (!isApprove && !isKeepLimited && config.reasonField && !providedReason) {
      const inputReason = await dialog.prompt({
        title: '拒绝原因',
        message: '请输入拒绝原因（必填）',
        placeholder: '必填',
        defaultValue: ''
      });
      if (inputReason === null) return;
      reason = inputReason.trim();
      if (!reason) {
        showToast('拒绝时必须填写原因', 'error');
        return;
      }
    }

    setModerationPending(item.id, true);
    try {
      const updateData = {
        [config.statusField]: isApprove
          ? config.approveValue
          : isKeepLimited
            ? 'limited'
            : config.rejectValue
      };

      if (config.reasonField) {
        updateData[config.reasonField] = isApprove ? null : reason;
      }

      await updateModerationStatus(item, config, updateData);

      await saveModerationLog(item, updateData[config.statusField], reason);
      addChangeLogEntry(`moderation_${action}`, item, {
        status: updateData[config.statusField],
        reason
      });

      // 仅在非批量操作时显示 toast 和刷新
      if (!skipRefresh) {
        showToast(isApprove ? '审核通过已生效' : isKeepLimited ? '已维持下架并结案举报' : '已拒绝并记录原因', 'success');
        await refreshCurrentViewAfterMutation();
      }
    } catch (error) {
      logger.error('data-admin', '审核操作失败:', error);
      if (!skipRefresh) {
        showToast('审核操作失败: ' + buildModerationErrorMessage(error), 'error');
      }
      throw error; // 批量操作时需要抛出异常以便 Promise.allSettled 捕获
    } finally {
      setModerationPending(item.id, false);
    }
  };

  const approveModerationItem = async (item) => applyModerationAction(item, 'approve');
  const rejectModerationItem = async (item) => applyModerationAction(item, 'reject');
  const keepLimitedModerationItem = async (item) => applyModerationAction(item, 'limit');

  // 删除审核记录
  const deleteModerationItem = async (item) => {
    if (!moderationTabConfig.value || !item?.id) return;
    if (isModerationActionPending(item.id)) return;
    if (!await dialog.confirm({
      title: '删除记录',
      message: '确定要删除这条记录吗？删除后不可恢复。',
      tone: 'danger',
      confirmText: '删除'
    })) return;

    const config = moderationTabConfig.value;
    setModerationPending(item.id, true);
    try {
      await deleteModerationTarget(item, config);
      await saveModerationLog(item, 'deleted', 'admin_delete');
      addChangeLogEntry('moderation_delete', item, { targetType: config.targetType });
      showToast('删除成功', 'success');
      await refreshCurrentViewAfterMutation();
    } catch (error) {
      logger.error('data-admin', '删除审核记录失败:', error);
      showToast('删除失败: ' + buildModerationErrorMessage(error), 'error');
    } finally {
      setModerationPending(item.id, false);
    }
  };

  // ==================== 用户封禁/禁言操作 ====================

  // P1 修复: 辅助函数 - 直接更新 dataStore.users 中的用户状态字段
  const updateUserStatusInDataStore = (userId, updates) => {
    if (!dataStore?.users) return;
    const userIndex = dataStore.users.findIndex((u) => u.id === userId);
    if (userIndex < 0) return;
    // 直接更新用户记录的封禁/禁言状态字段
    Object.assign(dataStore.users[userIndex], updates);
  };

  // 封禁用户（禁止登录）- P1 优化: 简化为单步弹窗
  const banUser = async (item) => {
    if (!item?.id) return;

    // P1 优化: 合并原因和时长到单步弹窗
    const result = await dialog.prompt({
      title: '封禁用户',
      message: `封禁用户「${item.username || item.id}」后，该用户将无法登录。\n\n请输入封禁原因和天数（天数留空表示永久封禁）`,
      placeholder: '原因:违规操作 天数:7',
      defaultValue: '',
      multiline: true
    });
    if (result === null) return;

    // 解析输入: 支持格式 "原因:xxx 天数:7" 或纯文本作为原因
    let reason = '';
    let days = 0;
    const reasonMatch = result.match(/原因[:\s]+([^\n]+)/i);
    const daysMatch = result.match(/天数[:\s]+(\d+)/i);
    if (reasonMatch) reason = reasonMatch[1].trim();
    if (daysMatch) days = parseInt(daysMatch[1], 10);

    // 如果没有匹配到结构化格式，将整行作为原因
    if (!reasonMatch) reason = result.trim();

    let bannedUntil = null;
    if (days > 0) {
      const now = new Date();
      bannedUntil = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
    }

    try {
      assertAdminAction();
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_ban_user', {
        p_user_id: item.id,
        p_reason: reason || null,
        p_until: bannedUntil
      });

      if (rpcError) {
        if (isMissingRpcFunctionError(rpcError, 'admin_ban_user')) {
          throw new Error('封禁用户 RPC 尚未部署，请先执行最新 Supabase migration');
        }
        throw rpcError;
      }

      if (!rpcData?.ok) {
        throw new Error(String(rpcData?.message || '封禁失败'));
      }

      // 撤销目标用户已签发的所有 session，避免其在 JWT 自然过期前继续访问。
      // 即使撤销失败也不回滚封禁状态（数据库已置 is_banned=true，心跳会兜底登出）。
      try {
        const { error: revokeError } = await supabase.functions.invoke('admin-revoke-session', {
          body: { user_id: item.id }
        });
        if (revokeError) {
          logger.warn('data-admin', '撤销被封禁用户会话失败（不阻断封禁）:', revokeError);
        }
      } catch (revokeErr) {
        logger.warn('data-admin', '撤销被封禁用户会话异常（不阻断封禁）:', revokeErr);
      }

      // P1 修复: 直接更新 dataStore.users 中的状态
      updateUserStatusInDataStore(item.id, {
        is_banned: true,
        ban_reason: reason || null,
        banned_until: bannedUntil,
        banned_at: new Date().toISOString()
      });

      addChangeLogEntry('user_ban', item, { reason: reason || '未填写', days: days || '永久' });
      showToast(days > 0 ? `用户已封禁 ${days} 天` : '用户已永久封禁', 'success');
      await refreshCurrentViewAfterMutation();
    } catch (error) {
      logger.error('data-admin', '封禁用户失败:', error);
      showToast('封禁失败: ' + buildActionErrorMessage(error, '封禁失败'), 'error');
    }
  };

  // 解封用户
  const unbanUser = async (item) => {
    if (!item?.id) return;
    if (!await dialog.confirm({
      title: '解封用户',
      message: `确定要解封用户「${item.username || item.id}」吗？`,
      tone: 'warning',
      confirmText: '解封'
    })) return;

    try {
      assertAdminAction();
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_unban_user', {
        p_user_id: item.id
      });

      if (rpcError) {
        if (isMissingRpcFunctionError(rpcError, 'admin_unban_user')) {
          throw new Error('解封用户 RPC 尚未部署，请先执行最新 Supabase migration');
        }
        throw rpcError;
      }

      if (!rpcData?.ok) {
        throw new Error(String(rpcData?.message || '解封失败'));
      }

      // P1 修复: 直接更新 dataStore.users 中的状态
      updateUserStatusInDataStore(item.id, {
        is_banned: false,
        ban_reason: null,
        banned_until: null,
        unbanned_at: new Date().toISOString()
      });

      addChangeLogEntry('user_unban', item, {});
      showToast('用户已解封', 'success');
      await refreshCurrentViewAfterMutation();
    } catch (error) {
      logger.error('data-admin', '解封用户失败:', error);
      showToast('解封失败: ' + buildActionErrorMessage(error, '解封失败'), 'error');
    }
  };

  // 禁言用户（禁止发言）- P1 优化: 简化为单步弹窗
  const muteUser = async (item) => {
    if (!item?.id) return;

    // P1 优化: 合并原因和时长到单步弹窗
    const result = await dialog.prompt({
      title: '禁言用户',
      message: `禁言用户「${item.username || item.id}」后，该用户将无法发布内容。\n\n请输入禁言原因和天数（天数留空表示永久禁言）`,
      placeholder: '原因:发布不当言论 天数:7',
      defaultValue: '',
      multiline: true
    });
    if (result === null) return;

    // 解析输入
    let reason = '';
    let days = 0;
    const reasonMatch = result.match(/原因[:\s]+([^\n]+)/i);
    const daysMatch = result.match(/天数[:\s]+(\d+)/i);
    if (reasonMatch) reason = reasonMatch[1].trim();
    if (daysMatch) days = parseInt(daysMatch[1], 10);
    if (!reasonMatch) reason = result.trim();

    let mutedUntil = null;
    if (days > 0) {
      const now = new Date();
      mutedUntil = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
    }

    try {
      assertAdminAction();
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_mute_user', {
        p_user_id: item.id,
        p_reason: reason || null,
        p_until: mutedUntil
      });

      if (rpcError) {
        if (isMissingRpcFunctionError(rpcError, 'admin_mute_user')) {
          throw new Error('禁言用户 RPC 尚未部署，请先执行最新 Supabase migration');
        }
        throw rpcError;
      }

      if (!rpcData?.ok) {
        throw new Error(String(rpcData?.message || '禁言失败'));
      }

      // P1 修复: 直接更新 dataStore.users 中的状态
      updateUserStatusInDataStore(item.id, {
        is_muted: true,
        mute_reason: reason || null,
        muted_until: mutedUntil,
        muted_at: new Date().toISOString()
      });

      addChangeLogEntry('user_mute', item, { reason: reason || '未填写', days: days || '永久' });
      showToast(days > 0 ? `用户已禁言 ${days} 天` : '用户已永久禁言', 'success');
      await refreshCurrentViewAfterMutation();
    } catch (error) {
      logger.error('data-admin', '禁言用户失败:', error);
      showToast('禁言失败: ' + buildActionErrorMessage(error, '禁言失败'), 'error');
    }
  };

  // 解除禁言
  const unmuteUser = async (item) => {
    if (!item?.id) return;
    if (!await dialog.confirm({
      title: '解除禁言',
      message: `确定要解除用户「${item.username || item.id}」的禁言状态吗？`,
      tone: 'warning',
      confirmText: '解除'
    })) return;

    try {
      assertAdminAction();
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_unmute_user', {
        p_user_id: item.id
      });

      if (rpcError) {
        if (isMissingRpcFunctionError(rpcError, 'admin_unmute_user')) {
          throw new Error('解除禁言 RPC 尚未部署，请先执行最新 Supabase migration');
        }
        throw rpcError;
      }

      if (!rpcData?.ok) {
        throw new Error(String(rpcData?.message || '解除禁言失败'));
      }

      // P1 修复: 直接更新 dataStore.users 中的状态
      updateUserStatusInDataStore(item.id, {
        is_muted: false,
        mute_reason: null,
        muted_until: null,
        unmuted_at: new Date().toISOString()
      });

      addChangeLogEntry('user_unmute', item, {});
      showToast('用户已解除禁言', 'success');
      await refreshCurrentViewAfterMutation();
    } catch (error) {
      logger.error('data-admin', '解除禁言失败:', error);
      showToast('解除禁言失败: ' + buildActionErrorMessage(error, '解除禁言失败'), 'error');
    }
  };

  // ==================== 批量审核功能 ====================

  // 批量审核通过
  const batchApproveModerationItems = async (items) => {
    if (!items?.length) return;

    const ids = items.map((item) => item.id).filter(Boolean);
    if (!await dialog.confirm({
      title: '批量审核通过',
      message: `确定要通过选中的 ${ids.length} 条审核记录吗？`,
      tone: 'success',
      confirmText: '批量通过'
    })) return;

    let successCount = 0;
    let failCount = 0;

    try {
      assertAdminAction();

      // 并行处理，但限制并发数以避免数据库压力
      const batchSize = 5;
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map((item) => applyModerationAction(item, 'approve', { skipRefresh: true }))
        );

        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            successCount++;
          } else {
            failCount++;
            logger.warn('data-admin', '批量审核单项失败:', result.reason);
          }
        });
      }

      if (successCount > 0) {
        addChangeLogEntry('batch_moderation_approve', { id: ids.join(',') }, { count: successCount });
        showToast(`批量审核完成：${successCount} 条通过，${failCount} 条失败`,
          failCount > 0 ? 'warning' : 'success');
      } else {
        showToast('批量审核失败：所有记录处理失败', 'error');
      }

      await refreshCurrentViewAfterMutation();
    } catch (error) {
      logger.error('data-admin', '批量审核失败:', error);
      showToast('批量审核失败: ' + buildActionErrorMessage(error, '批量审核失败'), 'error');
    }
  };

  // 批量审核拒绝
  const batchRejectModerationItems = async (items) => {
    if (!items?.length) return;

    const ids = items.map((item) => item.id).filter(Boolean);

    // 询问拒绝原因
    const reason = await dialog.prompt({
      title: '批量审核拒绝',
      message: `确定要拒绝选中的 ${ids.length} 条审核记录吗？\n请输入拒绝原因（可选）`,
      placeholder: '例如：内容不符合规范',
      defaultValue: '',
      multiline: true
    });
    if (reason === null) return;

    let successCount = 0;
    let failCount = 0;

    try {
      assertAdminAction();

      const batchSize = 5;
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map((item) => applyModerationAction(item, 'reject', {
            skipRefresh: true,
            reason: reason.trim() || null
          }))
        );

        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            successCount++;
          } else {
            failCount++;
            logger.warn('data-admin', '批量审核单项失败:', result.reason);
          }
        });
      }

      if (successCount > 0) {
        addChangeLogEntry('batch_moderation_reject', { id: ids.join(',') }, {
          count: successCount,
          reason: reason.trim() || '未填写'
        });
        showToast(`批量审核完成：${successCount} 条拒绝，${failCount} 条失败`,
          failCount > 0 ? 'warning' : 'success');
      } else {
        showToast('批量审核失败：所有记录处理失败', 'error');
      }

      await refreshCurrentViewAfterMutation();
    } catch (error) {
      logger.error('data-admin', '批量审核失败:', error);
      showToast('批量审核失败: ' + buildActionErrorMessage(error, '批量审核失败'), 'error');
    }
  };

  return {
    // 通用删除
    deleteItem,
    deleteAdminUser,
    batchDelete,
    // 抽奖
    drawLotteryNow,
    redrawLottery,
    closeLottery,
    viewLotteryEntries,
    viewLotteryDrawLogs,
    viewLotteryFulfillments,
    advanceLotteryFulfillment,
    replaceLotteryWinner,
    retryLotteryNotification,
    // 审核
    saveModerationLog,
    updateModerationStatus,
    deleteModerationTarget,
    applyModerationAction,
    approveModerationItem,
    rejectModerationItem,
    keepLimitedModerationItem,
    deleteModerationItem,
    // 批量审核
    batchApproveModerationItems,
    batchRejectModerationItems,
    // 用户封禁/禁言
    banUser,
    unbanUser,
    muteUser,
    unmuteUser,
    // 辅助
    isMissingRpcFunctionError,
    buildModerationErrorMessage
  };
};
