/**
 * 账户安全的四个子面板（2026-10-26）
 *
 * 背景：原先「账户安全」是一个独立路由页，菜单里四行 → 各自一个表单屏。
 * 现在四行拆进了设置页「账户与隐私」分组，点击直接落在设置壳右栏的表单上
 * （不再另开一页），于是「有哪些面板 / 面板叫什么 / 脏值怎么归一」
 * 变成了宿主（标题、白名单）与面板组件（自身页头、?panel= 归一）都要用的东西
 * —— 单一真源放这里，两边 import，别再各写一份字符串表。
 */

export const ACCOUNT_SECURITY_PANELS = [
  { id: 'email', title: '更换邮箱' },
  { id: 'password', title: '修改密码' },
  { id: 'passkey', title: '通行密钥' },
  { id: 'delete', title: '注销账号' },
];

export const ACCOUNT_SECURITY_PANEL_IDS = ACCOUNT_SECURITY_PANELS.map((panel) => panel.id);

/** 未知值一律归一成空串（调用方按「无面板」处理），绝不把脏值传进组件状态 */
export const normalizeAccountSecurityPanel = (id) => {
  const value = String(id || '').trim();
  return ACCOUNT_SECURITY_PANEL_IDS.includes(value) ? value : '';
};

/** 面板标题；空值 / 未知值回落「账户安全」（= 菜单态的标题） */
export const resolveAccountSecurityPanelTitle = (id) =>
  ACCOUNT_SECURITY_PANELS.find((panel) => panel.id === normalizeAccountSecurityPanel(id))?.title ||
  '账户安全';
