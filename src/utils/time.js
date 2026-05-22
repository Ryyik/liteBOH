/**
 * 智能时间格式化函数
 * 1分钟内：刚刚
 * 1小时内：x分钟前
 * 12小时内：x小时前
 * 今天：今天 HH:mm
 * 昨天：昨天 HH:mm
 * 前天：前天 HH:mm
 * 今年：MM-DD HH:mm
 * 往年：YYYY-MM-DD HH:mm
 */
export function formatSmartTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();

    // 计算毫秒差值
    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);

    // 基础时间字符串 HH:mm
    const timeStr = date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

    // 日期对象（忽略时间，用于天数差值判断）
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const nowOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // 计算天数差值（自然日差值）
    const diffDays = Math.round((nowOnly - dateOnly) / (1000 * 60 * 60 * 24));

    // 1. 如果是今天（毫秒级比较：12小时内优先显示相对时间）
    if (diffDays === 0) {
        if (diffMins < 1) return '刚刚';
        if (diffMins < 60) return `${diffMins}分钟前`;
        if (diffHours < 12) return `${diffHours}小时前`;
        return `今天 ${timeStr}`;
    }

    // 2. 如果是昨天
    if (diffDays === 1) {
        return `昨天 ${timeStr}`;
    }

    // 3. 如果是前天
    if (diffDays === 2) {
        return `前天 ${timeStr}`;
    }

    // 4. 今年其他日期
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const monthDayStr = `${month}-${day}`;

    if (date.getFullYear() === now.getFullYear()) {
        return `${monthDayStr} ${timeStr}`;
    }

    // 5. 往年
    return `${date.getFullYear()}-${monthDayStr} ${timeStr}`;
}
