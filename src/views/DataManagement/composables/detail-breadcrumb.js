/**
 * 详情页面包屑（纯函数，供单测；plans/027 D1）。
 * @returns {string[]} 4 级面包屑：数据管理 › 模块 › 表 › 记录
 */
export const buildRecordBreadcrumb = ({ moduleLabel, tabLabel, recordTitle }) =>
  ['数据管理', moduleLabel, tabLabel, recordTitle || '未命名记录'].filter(Boolean);
