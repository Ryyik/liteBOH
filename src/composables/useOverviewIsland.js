import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { showGlobalNavStatus } from '@/composables/useGlobalNavStatus.js';
import { fetchOfflineOverviewSummary } from '@/utils/api/overview-api.js';
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
 * 每个用户每个浏览器会话最多自动弹出一次；无新内容不弹出。
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

  const showIslandFromSummary = (summary) => {
    const anchorMs = summary.anchor ? new Date(summary.anchor).getTime() : 0;
    const offlineDays = Number.isFinite(anchorMs)
      ? Math.max(0, Math.floor((Date.now() - anchorMs) / 86400000))
      : 0;
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
    showGlobalNavStatus({
      ...buildStatusPayload({
        total: summary.total,
        offlineDays,
        isFirstLogin: summary.isFirstLogin,
        username
      }),
      icon: 'ai',
      previews,
      durationMs: 9500,
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

      const summary = await fetchOfflineOverviewSummary({ anchor: authStore.offlineAnchorAt });
      lastCheckedAt = Date.now();
      lastCheckedUserId = userId;

      if (!summary || summary.total <= 0) return;

      showIslandFromSummary(summary);
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
        showGlobalNavStatus({
          title: '（测试）未登录',
          message: '智能概览灵动岛需要登录后使用',
          icon: 'warning',
          durationMs: 9000
        });
        return;
      }

      if (simulateDays > 0) {
        authStore.offlineAnchorAt = new Date(Date.now() - simulateDays * 86400000).toISOString();
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
      showGlobalNavStatus({
        title: '（测试）灵动岛管线连通正常',
        message: `锚点 ${anchorText} 之后新增 0 条内容（真实触发时无新内容不弹卡）`,
        icon: 'ai',
        durationMs: 9000,
        onAction: () => {
          router.push('/overview');
        }
      });
    } catch (error) {
      logger.error('overview-island', '（测试）强制触发失败', error);
      showGlobalNavStatus({
        title: '（测试）灵动岛检查失败',
        message: error?.message || '未知错误，详见控制台日志',
        icon: 'warning',
        durationMs: 9000
      });
    }
  };

  return { maybeShowOverviewIsland, forceShowOverviewIsland };
}
