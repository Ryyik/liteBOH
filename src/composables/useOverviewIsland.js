import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { showIsland } from '@/composables/useIsland.js';
import { fetchOfflineOverviewSummary } from '@/utils/api/overview-api.js';
import OverviewIslandLoading from '@/components/UnifiedNavbar/OverviewIslandLoading.vue';
import { getDayFrontierIso, getLocalDayKey, readLastCheckedDay, readLastOnlineDay, writeLastCheckedDay, writeLastOnlineDay } from '@/utils/overview-day-marker.js';
import { formatSmartTime } from '@/utils/time.js';
import { logger } from '@/utils/logger.js';
import { getOverviewCardImage } from '@/views/SmartOverview/utils/image.js';

// 模块级节流：同一 SPA 会话内防止并发请求与短时间重复检查
const SESSION_KEY_PREFIX = 'boh_overview_island:';
const RECHECK_COOLDOWN_MS = 5 * 60 * 1000;

let inFlight = false;
let lastCheckedAt = 0;
let lastCheckedUserId = '';

// —— 加载岛（showIsland.custom）：覆盖摘要请求窗口，结果回来后由宿主关闭换卡 ——
// 口径（20260911）：无新未看内容/异常时静默收掉加载岛，不弹任何引导。
const LOADING_ISLAND_TIMEOUT_MS = 14000; // RPC 上限 12s（overview-api OVERVIEW_TIMEOUT_MS）+ 余量兜底
let loadingIslandHandle = null;
let loadingIslandTimer = null;

const closeLoadingIsland = () => {
  if (loadingIslandTimer) {
    clearTimeout(loadingIslandTimer);
    loadingIslandTimer = null;
  }
  if (loadingIslandHandle) {
    loadingIslandHandle.close();
    loadingIslandHandle = null;
  }
};

const showLoadingIsland = () => {
  closeLoadingIsland();
  loadingIslandHandle = showIsland.custom(OverviewIslandLoading, {});
  loadingIslandTimer = setTimeout(closeLoadingIsland, LOADING_ISLAND_TIMEOUT_MS);
};

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
 * 自动推送采用天粒度游标（本机 localStorage + 服务端跨设备标记，见 overview-day-marker.js 与
 * profiles.last_online_day / overview_checked_day）：
 * - 推送窗口 = 各来源里「不晚于昨天」的最新一天：「本机在线日」（会话结束 pagehide / 检查成功落盘）、
 *   「服务端上次在线日」（跨设备，会话启动时由 mark_overview_state 取回）、「会话锚点日」（心跳快照兜底）；
 *   当天活跃一律不取——今天在线 ≠ 当天稍后发布的内容已读，窗口要留给当天首次检查；
 * - 同日去重看「当日已检查」：本机 key 或服务端标记任一为今天即短路（换设备后同一天不再重复推送）；
 * - 次日仅当存在上次在线日的次日零点之后新发布的内容才推送，无新一天内容不弹；
 * - 推送窗口与离线天数均按日历日计算，避免把上次在线日当晚的新帖当作「错过内容」重复推送。
 * - 全都不可用（首次启用且无服务端记录）时退回会话锚点日，锚点已退化成今天（今天登录过又刷新过的
 *   新会话）或锚点缺失（登录竞态）则按「昨天」起算，保证每天首次检查必有窗口。静默退出分支不写
 *   任何游标——否则一次什么都没做的检查会把当天钉死，后续触发连加载岛都不会出现。
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

      // —— 天粒度守卫与推送窗口（本机两 key + 服务端跨设备标记，见 overview-day-marker.js）——
      const todayKey = getLocalDayKey();

      // 1) 同日去重：本机或服务端任一记录「今天已检查」→ 直接短路（换设备后同一天不再重复推送）
      const serverCheckedDay = authStore.overviewMarks?.checkedDay || '';
      const lastCheckedDay = readLastCheckedDay(checkedUserId);
      if ((lastCheckedDay && lastCheckedDay >= todayKey) || (serverCheckedDay && serverCheckedDay >= todayKey)) return;

      // 2) 窗口起点 = 各来源里「不晚于昨天」的最新一天，取最新（最接近今天）的那个：
      //    - 本机在线日：会话结束（pagehide）/上次检查落盘；
      //    - 服务端上次在线日：跨设备，会话启动时由 mark_overview_state 取回；
      //    - 会话锚点日：profiles.last_active_at 心跳快照（兜底）。
      //    当天活跃一律不取（今天在线 ≠ 今天稍后发布的内容已读），窗口要留给今天首次检查，
      //    否则登录/心跳会把窗口掐成 0，连加载岛都不弹；全都不可用则退回昨天，保证必有窗口。
      const anchorDay = authStore.offlineAnchorAt
        ? getLocalDayKey(new Date(authStore.offlineAnchorAt))
        : '';
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const lastOnlineDay = [
        readLastOnlineDay(checkedUserId),
        authStore.overviewMarks?.previousOnlineDay || '',
        anchorDay
      ]
        .filter((day) => day && day < todayKey)
        .sort()
        .pop() || getLocalDayKey(yesterday);

      // 推送游标 = 窗口起点（上次在线日）的次日零点；脏数据则本次不推（正常路径下不会走到）
      const pushFrontier = getDayFrontierIso(lastOnlineDay);
      // 无窗口时静默退出且**不写任何游标**：这次什么都没检查过，
      // 写下去会把当天钉死，后续每次触发都被上方守卫短路（连加载岛都不会出现）
      if (!pushFrontier) return;

      // 先弹加载岛覆盖请求窗口：无新内容/异常时静默收掉，不弹引导（20260911 口径）
      showLoadingIsland();

      const summary = await fetchOfflineOverviewSummary({ anchor: pushFrontier });
      lastCheckedAt = Date.now();
      lastCheckedUserId = checkedUserId;

      closeLoadingIsland();

      if (!summary) return;

      // 检查成功：本机记「当日已检查」+ 刷新「上次在线日」；服务端同步一份（跨设备同日去重）
      writeLastCheckedDay(checkedUserId, todayKey);
      writeLastOnlineDay(checkedUserId, todayKey);
      void authStore.refreshOverviewMarks({ markChecked: true });

      if (summary.total <= 0) return;

      showIslandFromSummary(summary, { lastOnlineDay });
    } catch (error) {
      closeLoadingIsland();
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
        // 同步把天粒度游标一起拨回对应日期（本机在线日/检查日 + 服务端跨设备标记）：
        // 只拨一处的话，其余来源（尤其是服务端上次在线日）会在窗口里取 max 把模拟窗口顶掉
        const simulatedUserId = authStore.userInfo?.id || '';
        const simulatedDay = getLocalDayKey(new Date(Date.now() - simulateDays * 86400000));
        if (simulatedUserId) {
          writeLastOnlineDay(simulatedUserId, simulatedDay);
          writeLastCheckedDay(simulatedUserId, simulatedDay);
        }
        authStore.overviewMarks = {
          today: getLocalDayKey(),
          previousOnlineDay: simulatedDay,
          checkedDay: simulatedDay
        };
      }

      // 测试按钮同样先看加载动画，再按结果换卡（有数据→摘要；无数据→连通提示）
      showLoadingIsland();

      const summary = await fetchOfflineOverviewSummary({ anchor: authStore.offlineAnchorAt });
      closeLoadingIsland();

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
      closeLoadingIsland();
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
