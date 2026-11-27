/**
 * 周签到 —— 单一真源 composable（plans/052 · 2026-11-26 从 ForumMain 抽出）。
 *
 * 为什么抽：签到按钮的**位置**从 ForumMain 内部的工具栏搬到了分区页签行
 * （ForumSectionShell 的 SegmentTabs actions-start 插槽），而逻辑（提交 / 重播 /
 * 点数写回 / 舞台数据）必须留在唯一一处 —— 否则会变成「页签行一套、论坛内一套」。
 *
 * 消费方：`views/user-center/UserSpace/components/ForumSectionShell.vue`
 *   （首页 `/` 与 user-space「方块」两个宿主共用同一份壳）
 *
 * ⚠️ 三条事故级纪律，原样继承自 ForumMain（别在新位置重写）：
 *   ① 「本周已签」不是失败：后端 alreadySigned 时必须把本地态钉成已签，
 *      否则按钮一直可点、每点一次都「成功」但拿不到积分（2026-09-29 线上事故）。
 *   ② 拉取失败绝不覆盖成默认值 —— 覆盖等于「假装没签过」。
 *   ③ 只有上游真给了余额才写回（applyPoints 内部已收口），缺字段写 0 会清空界面余额。
 */
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import { getWeeklyCheckinStatus, submitWeeklyCheckin } from '@/utils/api/forum-api.js';
import { preloadPointsCardAssets } from '@/utils/points-card-assets.js';
import { logger } from '@/utils/logger.js';
import { applyPoints, readPoints } from '../forum-points.js';

export function useWeeklyCheckin({ onSyncProfile, onError } = {}) {
  const authStore = useAuthStore();
  const { isLoggedIn, showLoginModal } = storeToRefs(authStore);
  const userInfo = authStore.userInfo;

  const isWeeklyCheckinLoading = ref(false);
  const isWeeklyCheckinSubmitting = ref(false);

  const createDefaultWeeklyCheckinStatus = () => ({
    hasSignedThisWeek: false,
    streakTotal: 0,
    currentStreak: 0,
    cycleProgress: 0,
    cycleSize: 4,
    rewardCompletedThisWeek: false,
    pointsAwarded: 0,
    currentPoints: Number(userInfo?.points || 0),
    nextRewardIn: 4,
    currentWeekStart: null,
  });

  const weeklyCheckinStatus = ref(createDefaultWeeklyCheckinStatus());
  let statusRequestSeq = 0;
  let actionSeq = 0;

  /* 签到成功舞台（卡面 3D）。open 为 true 时组件才挂载 —— 挂载即起播，
     所以「资源就绪」必须在把它置 true **之前**完成（见 handleCheckinClick）。 */
  const checkinReward = ref({
    open: false,
    pointsAfter: 0,
    awardAmount: 0,
    /* true = 「再看一遍」重播：文案换成已签到，不显示到账数字 */
    alreadySigned: false,
    assetsReady: true,
  });

  const closeCheckinReward = () => {
    checkinReward.value = { ...checkinReward.value, open: false };
  };

  const loadWeeklyCheckinStatus = async () => {
    if (!isLoggedIn.value) {
      weeklyCheckinStatus.value = createDefaultWeeklyCheckinStatus();
      return;
    }
    // 已登录但 id 尚未就绪：保持现状，等 userInfo.id 的 watcher 再拉。
    // 这里若重置成默认值，会把「后端已确认本周已签」的本地状态抹掉 → 按钮重新可点。
    if (!userInfo?.id) return;

    const userId = userInfo.id;
    const requestSeq = ++statusRequestSeq;
    isWeeklyCheckinLoading.value = true;
    try {
      const { ok, data, error } = await getWeeklyCheckinStatus(userId);
      if (requestSeq !== statusRequestSeq || !isLoggedIn.value || userInfo?.id !== userId) return;
      if (!ok || error || !data) {
        // 纪律②：拉取失败就保持现状，绝不用默认值覆盖
        logger.error('checkin', '加载周签到状态失败:', error);
        return;
      }
      weeklyCheckinStatus.value = { ...createDefaultWeeklyCheckinStatus(), ...data };
      // 纪律③：只有后端真的回了余额才写回
      applyPoints(userInfo, data.currentPoints);
    } catch (error) {
      logger.error('checkin', '加载周签到状态异常:', error);
    } finally {
      if (requestSeq === statusRequestSeq) isWeeklyCheckinLoading.value = false;
    }
  };

  /**
   * 「再看一遍」：已签到用户再点签到时的重播。
   * 不提交、不弹提示岛 —— 直接把同一套舞台重播，文案换成「已签到」。
   */
  const replayCheckinStage = async () => {
    if (checkinReward.value.open) return;
    const userId = userInfo?.id;
    const requestSeq = ++actionSeq;
    const assets = await preloadPointsCardAssets({
      skin: userInfo?.pointsCardSkin || 'blank',
      imageUrl: userInfo?.pointsCardImageUrl || '',
    }).catch(() => ({ ready: false, failed: [], timedOut: false }));
    if (requestSeq !== actionSeq || !isLoggedIn.value || userInfo?.id !== userId) return;

    checkinReward.value = {
      open: true,
      pointsAfter:
        readPoints(weeklyCheckinStatus.value.currentPoints) ?? (Number(userInfo?.points) || 0),
      awardAmount: 0,
      alreadySigned: true,
      assetsReady: assets.ready,
    };
  };

  const handleWeeklyCheckin = async () => {
    if (isWeeklyCheckinSubmitting.value) return;

    isWeeklyCheckinSubmitting.value = true;
    statusRequestSeq += 1;
    const userId = userInfo?.id;
    const requestSeq = ++actionSeq;
    try {
      // 卡面预取与提交**并行**：等 RPC 回来再开始下图片等于白等一个 RTT。
      const assetsPromise = preloadPointsCardAssets({
        skin: userInfo?.pointsCardSkin || 'blank',
        imageUrl: userInfo?.pointsCardImageUrl || '',
      }).catch(() => ({ ready: false, failed: [], timedOut: false }));

      const { ok, data, error, alreadySigned } = await submitWeeklyCheckin();
      if (requestSeq !== actionSeq || !isLoggedIn.value || userInfo?.id !== userId) return;
      if (!ok || error || !data) {
        // 纪律①：「本周已签」不是失败，是后端明确告知该行已存在
        if (alreadySigned || data?.alreadySigned) {
          weeklyCheckinStatus.value = { ...weeklyCheckinStatus.value, hasSignedThisWeek: true };
          void loadWeeklyCheckinStatus();
          const assets = await assetsPromise;
          if (requestSeq !== actionSeq || !isLoggedIn.value || userInfo?.id !== userId) return;
          checkinReward.value = {
            open: true,
            pointsAfter: readPoints(data?.currentPoints) ?? (Number(userInfo?.points) || 0),
            awardAmount: 0,
            alreadySigned: true,
            assetsReady: assets.ready,
          };
          return;
        }
        throw error || new Error('签到失败，请稍后重试');
      }

      weeklyCheckinStatus.value = { ...createDefaultWeeklyCheckinStatus(), ...data };
      applyPoints(userInfo, data.currentPoints);

      // 只有卡面「可绘制」后才允许起播（preload 内部等的是 decode，不是 onload）。
      const assets = await assetsPromise;
      if (requestSeq !== actionSeq || !isLoggedIn.value || userInfo?.id !== userId) return;
      const awarded = Number(data.pointsAwarded || 0);

      onSyncProfile?.({
        userId: userInfo?.id,
        username: userInfo?.username,
        reason: awarded > 0 ? 'weekly_checkin_reward' : 'weekly_checkin',
      });

      checkinReward.value = {
        open: true,
        pointsAfter: readPoints(data.currentPoints) ?? (Number(userInfo?.points) || 0),
        awardAmount: awarded,
        alreadySigned: false,
        assetsReady: assets.ready,
      };
    } catch (error) {
      if (requestSeq !== actionSeq || !isLoggedIn.value || userInfo?.id !== userId) return;
      logger.error('checkin', '周签到失败:', error);
      onError?.('签到失败', error?.message || '请稍后重试');
    } finally {
      if (requestSeq === actionSeq) isWeeklyCheckinSubmitting.value = false;
    }
  };

  /**
   * 签到入口：点按钮即提交，不再开面板。
   * 已签 → 走 replayCheckinStage（重播舞台，文案「已签到」）；未登录 → 登录弹窗。
   */
  const handleCheckinClick = () => {
    if (!isLoggedIn.value) {
      showLoginModal.value = true;
      return;
    }
    if (isWeeklyCheckinSubmitting.value) return;

    if (weeklyCheckinStatus.value.hasSignedThisWeek) {
      void replayCheckinStage();
      return;
    }
    // 状态可能因上次加载失败而停在「未签到」，顺手自愈一次（失败不阻塞本次提交）
    if (!isWeeklyCheckinLoading.value) void loadWeeklyCheckinStatus();
    void handleWeeklyCheckin();
  };

  /* 登录态 / 用户 id 就绪后拉一次（与原 ForumMain 的 watcher 同口径） */
  watch(
    () => [isLoggedIn.value, userInfo?.id],
    ([loggedIn, id]) => {
      actionSeq += 1;
      closeCheckinReward();
      weeklyCheckinStatus.value = createDefaultWeeklyCheckinStatus();
      if (loggedIn && id) void loadWeeklyCheckinStatus();
    },
    { immediate: true },
  );

  return {
    weeklyCheckinStatus,
    isWeeklyCheckinLoading,
    isWeeklyCheckinSubmitting,
    checkinReward,
    closeCheckinReward,
    handleCheckinClick,
    loadWeeklyCheckinStatus,
    replayCheckinStage,
  };
}
