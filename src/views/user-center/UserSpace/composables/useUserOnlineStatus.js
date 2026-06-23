const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

export function useUserOnlineStatus() {
  const isUserOnline = (user, hideAll = false) => {
    if (hideAll) return false;
    if (!user?.last_active_at) return false;
    if (user?.hide_online_status) return false;
    if (user?.hideOnlineStatus) return false;
    return Date.now() - new Date(user.last_active_at).getTime() < ONLINE_THRESHOLD_MS;
  };

  const formatUserOnlineStatus = (user, hideAll = false) => {
    if (hideAll) return '';
    if (!user?.last_active_at) return '';
    if (user?.hide_online_status) return '';
    if (user?.hideOnlineStatus) return '';
    if (isUserOnline(user)) return '在线';
    const elapsed = Date.now() - new Date(user.last_active_at).getTime();
    const mins = Math.floor(elapsed / 60000);
    if (mins < 60) return `已离线${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `已离线${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `已离线${days}天前`;
    const months = Math.floor(days / 30);
    return `已离线${months}个月前`;
  };

  const formatOnlineStatusTooltip = (user, hideAll = false) => {
    if (hideAll) return '';
    if (!user?.last_active_at) return '';
    if (user?.hide_online_status) return '';
    if (user?.hideOnlineStatus) return '';
    return new Date(user.last_active_at).toLocaleString('zh-CN');
  };

  return { isUserOnline, formatUserOnlineStatus, formatOnlineStatusTooltip, ONLINE_THRESHOLD_MS };
}
