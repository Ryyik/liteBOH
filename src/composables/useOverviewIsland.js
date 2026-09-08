import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { showIsland } from '@/composables/useIsland.js';
import { fetchOfflineOverviewSummary } from '@/utils/api/overview-api.js';
import { getDayFrontierIso, getLocalDayKey, readLastOnlineDay, writeLastOnlineDay } from '@/utils/overview-day-marker.js';
import { formatSmartTime } from '@/utils/time.js';
import { logger } from '@/utils/logger.js';
import { getOverviewCardImage } from '@/views/SmartOverview/utils/image.js';

// 模块级节流：同一 SPA 会话内防止并发请求与短时间重复检查
const SESSION_KEY_PREFIX = 'boh_overview_island:';
const RECHECK_COOLDOWN_MS = 5 * 60 * 1000;

let inFlight = false;
let lastCheckedAt = 0;
let lastCheckedUserId = '';

const buildStatusPayload = ({ total, offlineDays, isFirstLogin, username }) => {
  if (isFirstLogin) {
    return {
      title: `欢迎来到方块之家，${username}`,
      message: `为你准备了最近 ${total} 条社区内容，点击查看智能概览`
    };
  }
  if (offlineDays >= 1) {
    return {
      title: `欢迎回来，你离开了 ${offlineDays} 天`,
      message: `离开期间新增 ${total} 条帖子和新闻，点击查看智能概览`
    };
  }
  return {
    title: `欢迎回来，${username}`,
    message: `今天有 ${total} 条新内容，点击查看智能概览`
  };
};

/**
 * 智能概览灵动岛：登录用户点击「我的方块」进入用户空间时，
 * 通过导航栏全局状态卡（GlobalNavStatusCard）展示离线概览摘要。
 *
 * 自动推送采用天粒度「上次在线日」游标（localStorage 持久化，见 overview-day-marker.js）：
 * - 当天上过线 = 当日及之前全部内容默认已浏览，同日不再自动推送；
 * - 次日仅当存在上次在线日的次日零点之后新发布的内容才推送，无新一天内容不弹；
 * - 推送窗口与离线天数均按日历日计算，避免把上次在线日当晚的新帖当作「错过内容」重复推送。
 */
export function useOverviewIsland() {
  const authStore = useAuthStore();
  const router = useRouter();

  const wasShownThisSession = () => {
    const userId = authStore.userInfo?.id;
    if (!userId || typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem(SESSION_KEY_PREFIX + userId) === '1';
  };

  const markShownThisSession = () => {
    const userId = authStore.userInfo?.id;
    if (!userId || typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(SESSION_KEY_PREFIX + userId, '1');
    } catch {
      // 存储不可用时静默降级为会话内不再弹出由内存节流兜底
    }
  };

  const clearSessionFlag = () => {
    const userId = authStore.userInfo?.id;
    if (!userId || typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.removeItem(SESSION_KEY_PREFIX + userId);
    } catch {
      // 忽略存储不可用
    }
  };

  const showIslandFromSummary = (summary, { lastOnlineDay = '' } = {}) => {
    const anchorMs = summary.anchor ? new Date(summary.anchor).getTime() : 0;
    let offlineDays = Number.isFinite(anchorMs)
      ? Math.max(0, Math.floor((Date.now() - anchorMs) / 86400000))
      : 0;
    // 天粒度游标下按「上次在线日 → 现在」的日历差展示（如 26 号上线、今天 29 号 = 离开 3 天），
    // 比锚点时间戳差值更贴近用户对「离开了几天」的直觉
    if (lastOnlineDay) {
      const lastDayMs = new Date(`${lastOnlineDay}T00:00:00`).getTime();
      if (Number.isFinite(lastDayMs)) {
        offlineDays = Math.max(0, Math.floor((Date.now() - lastDayMs) / 86400000));
      }
    }
    const username = String(authStore.userInfo?.username || '').trim() || '方块居民';
    const previews = (Array.isArray(summary.items) ? summary.items : [])
      .slice(0, 3)
      .map((it) => ({
        type: it.type,
        title: it.title,
        excerpt: String(it.excerpt || '').trim(),
        time: formatSmartTime(it.publishedAt),
        image: getOverviewCardImage(
          it.image || it.cover_image_url || it.coverImageUrl || it.images?.[0]?.url || ''
        )
      }));

    markShownThisSession();
    showIsland.notify({
      ...buildStatusPayload({
        total: summary.total,
        offlineDays,
        isFirstLogin: summary.isFirstLogin,
        username
      }),
      icon: 'ai',
      previews,
      durationMs: 6000,
      onAction: () => {
        router.push('/overview');
      }
    });
  };

  const maybeShowOverviewIsland = async ({ currentPath = '' } = {}) => {
    if (!authStore.isLoggedIn || inFlight) return;
    if (currentPath === '/overview') return;
    if (wasShownThisSession()) return;

    const userId = authStore.userInfo?.id || '';
    if (userId === lastCheckedUserId && Date.now() - lastCheckedAt < RECHECK_COOLDOWN_MS) return;

    inFlight = true;
    try {
      // 确保锚点快照已捕获（首次进入页面后立即点击时 init 可能尚未完成）
      if (!authStore.isInitialized) await authStore.initLoginState();
      if (!authStore.isLoggedIn || wasShownThisSession()) return;

      const checkedUserId = authStore.userInfo?.id || userId;
      if (!checkedUserId) return;

      // —— 天粒度「当日已读」守卫 ——
      // 当天已成功检查过（无论是否推送过）→ 当日及之前内容视为已浏览，不再自动推送
      const todayKey = getLocalDayKey();
      let lastOnlineDay = readLastOnlineDay(checkedUserId);
      if (lastOnlineDay && lastOnlineDay >= todayKey) return;

      if (!lastOnlineDay) {
        // 首次启用游标：以会话锚点所在日作为「上次在线日」（锚点缺失则视为今天），
        // 保证首日推送窗口也是天粒度（仅推上次在线日次日起的新内容）
        const anchorDay = authStore.offlineAnchorAt
          ? getLocalDayKey(new Date(authStore.offlineAnchorAt))
          : '';
        lastOnlineDay = anchorDay || todayKey;
      }

      // 推送游标 = 上次在线日的次日零点；上次在线日就是今天（或时钟回拨/脏数据）则无「新一天」内容
      const pushFrontier = lastOnlineDay < todayKey ? getDayFrontierIso(lastOnlineDay) : null;
      if (!pushFrontier) {
        writeLastOnlineDay(checkedUserId, todayKey);
        return;
      }

      const summary = await fetchOfflineOverviewSummary({ anchor: pushFrontier });
      lastCheckedAt = Date.now();
      lastCheckedUserId = checkedUserId;

      if (!summary) return;

      // 检查成功即标记「今天已上线」：同日后续检查直接短路；
      // 次日推送窗口自动从今天 24 点后起算（当天上线 = 默认已浏览当日及之前全部内容）
      writeLastOnlineDay(checkedUserId, todayKey);

      if (summary.total <= 0) return;

      showIslandFromSummary(summary, { lastOnlineDay });
    } catch (error) {
      logger.error('overview-island', '智能概览灵动岛检查失败', error);
    } finally {
      inFlight = false;
    }
  };

  // DEV-TEST：手动强制触发（绕过会话标记、冷却与并发守卫），供开发测试按钮使用。
  // simulateDays > 0 时模拟离线天数：直接改写会话锚点（auth store 为 set-once 语义，
  // 覆盖后本次会话稳定生效，登出自动清除），使概览页与灵动岛共用同一真实查询窗口。
  // 无论结果如何都弹卡：有数据显示真实摘要，无数据显示管线连通提示，失败则弹出错误信息。
  const forceShowOverviewIsland = async ({ simulateDays = 0 } = {}) => {
    clearSessionFlag();
    try {
      await authStore.initLoginState();
      if (!authStore.isLoggedIn) {
        showIsland.notify({
          title: '（测试）未登录',
          message: '智能概览灵动岛需要登录后使用',
          icon: 'warning',
          durationMs: 6000
        });
        return;
      }

      if (simulateDays > 0) {
        authStore.offlineAnchorAt = new Date(Date.now() - simulateDays * 86400000).toISOString();
        // 同步把天粒度「上次在线日」游标拨回对应日期：
        // 之后走真实自动检查（点击「我的方块」）即可复现「离开 N 天」的天粒度推送窗口
        const simulatedUserId = authStore.userInfo?.id || '';
        if (simulatedUserId) {
          writeLastOnlineDay(
            simulatedUserId,
            getLocalDayKey(new Date(Date.now() - simulateDays * 86400000))
          );
        }
      }

      const summary = await fetchOfflineOverviewSummary({ anchor: authStore.offlineAnchorAt });
      if (summary && summary.total > 0) {
        showIslandFromSummary(summary);
        return;
      }

      const anchorText = summary?.anchor
        ? new Date(summary.anchor).toLocaleString('zh-CN', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          })
        : '未知';
      showIsland.notify({
        title: '（测试）灵动岛管线连通正常',
        message: `锚点 ${anchorText} 之后新增 0 条内容（真实触发时无新内容不弹卡）`,
        icon: 'ai',
        durationMs: 6000,
        onAction: () => {
          router.push('/overview');
        }
      });
    } catch (error) {
      logger.error('overview-island', '（测试）强制触发失败', error);
      showIsland.notify({
        title: '（测试）灵动岛检查失败',
        message: error?.message || '未知错误，详见控制台日志',
        icon: 'warning',
        durationMs: 6000
      });
    }
  };

  return { maybeShowOverviewIsland, forceShowOverviewIsland };
}
