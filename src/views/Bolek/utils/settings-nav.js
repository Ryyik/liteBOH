/**
 * settings-nav.js — AI 设置左侧导航的**过滤规则**（2026-11-12 新增）
 *
 * 为什么从 SFC 里抽出来：分区列表的权限过滤是**安全边界**（「调试」分区会暴露知识库切片细节），
 * 而埋在 `computed` 里时它无法被单测 —— 只能靠某一次截图证明「当时没露出来」。
 * 抽成纯函数后，两条分支（有关键词 / 无关键词）都能被钉死。
 *
 * ⚠️ 曾经的坑（写在这里防止被"简化"回去）：
 * 旧实现是
 * ```
 * if (!keyword) return NAV_GROUPS;     // ← 未过滤！
 * return NAV_GROUPS.map(...)           // ← 只在这条分支里按关键词筛
 * ```
 * 权限过滤如果只加在「有关键词」那条分支上，`navQuery` 为空时会把管理员分区**原样**返回，
 * 普通用户一打开设置就能看到。所以过滤必须在**搜索之前**、且只有一处。
 *
 * 分组与条目都可以带 `adminOnly`：分组级用于「整组只给管理员」（如调试），
 * 条目级用于「同一组里个别项只给管理员」。两者都要判。
 */

/**
 * 按权限过滤（唯一准入判据：`isAdmin`）。
 * @param {Array<{adminOnly?: boolean, items?: Array<{adminOnly?: boolean}>}>} groups
 * @param {{ isAdmin?: boolean }} [options]
 * @returns {Array} 过滤后的新数组（不改原对象）
 */
export const filterNavGroupsByPermission = (groups, { isAdmin = false } = {}) => {
  const list = Array.isArray(groups) ? groups : [];
  return list
    .filter((group) => group && (!group.adminOnly || isAdmin))
    .map((group) => ({
      ...group,
      items: (Array.isArray(group.items) ? group.items : []).filter(
        (item) => item && (!item.adminOnly || isAdmin),
      ),
    }))
    .filter((group) => group.items.length > 0);
};

/**
 * 按关键词过滤左侧导航（只匹配「标题 + 近义词」，不做第二份设置项索引）。
 * 入参应**已经**过 `filterNavGroupsByPermission` —— 本函数不碰权限。
 * @param {Array} groups
 * @param {string} keyword
 */
export const filterNavGroupsByKeyword = (groups, keyword = '') => {
  const list = Array.isArray(groups) ? groups : [];
  const needle = String(keyword || '')
    .trim()
    .toLowerCase();
  if (!needle) return list;
  return list
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        `${item.label} ${item.keywords || ''}`.toLowerCase().includes(needle),
      ),
    }))
    .filter((group) => group.items.length > 0);
};
