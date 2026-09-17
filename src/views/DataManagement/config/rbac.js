/**
 * 数据管理面板 RBAC（角色访问控制）映射。
 *
 * 设计说明（标准后台规范：界面元素按角色隐藏/置灰）：
 * - 路由层 `requiresAdmin` + Supabase RLS 目前仍是 admin-only 门禁，
 *   因此线上实际进入后台的只有 `admin`；本文件的 `moderator` 映射是
 *   前向兼容的 UI 层执行器——一旦路由门禁与 RLS 对版主开放对应读权限，
 *   侧栏/操作按钮会自动按角色隐藏与置灰，无需再改 UI。
 * - `admin` 不受本文件限制，走 `TABS_ACTIONS` 的既有表级动作配置。
 */

export const ADMIN_ROLES = {
  ADMIN: 'admin',
  MODERATOR: 'moderator',
  USER: 'user'
};

export const ROLE_LABELS = {
  admin: '管理员',
  moderator: '版主',
  user: '普通用户'
};

/** 模块可见性：未声明的模块默认仅 admin 可见（最小权限兜底）。 */
export const MODULE_ALLOWED_ROLES = {
  overview: ['admin', 'moderator'],
  users: ['admin'],
  gifts: ['admin'],
  shop: ['admin'],
  community: ['admin', 'moderator'],
  operations: ['admin', 'moderator'],
  'shop-console': ['admin'],
  'hero-console': ['admin'],
  moderation: ['admin', 'moderator'],
  lottery: ['admin'],
  'ai-config': ['admin'],
  logs: ['admin'],
  system: ['admin']
};

/**
 * 版主在可见模块内允许的操作白名单。
 * 版主职责 = 内容复核，因此只保留查看与审核动作；
 * 新增/编辑/删除/封禁/禁言等写动作仍仅限 admin。
 */
export const MODERATOR_ALLOWED_ACTIONS = new Set(['view', 'moderate']);

/** 侧栏分节标题（与 tabModules.section 对齐）。 */
export const SIDEBAR_SECTION_LABELS = {
  overview: '总览',
  data: '数据管理',
  system: '系统'
};

export const getUserRole = (userInfo) => String(userInfo?.role || '').trim() || 'user';

export const getRoleLabel = (role) => ROLE_LABELS[role] || ROLE_LABELS.user;

export const canViewModule = (role, moduleId) =>
  (MODULE_ALLOWED_ROLES[moduleId] || [ADMIN_ROLES.ADMIN]).includes(role);

/** 返回当前角色无权访问的模块 id 列表（侧栏置灰禁用 + 命令面板过滤共用）。 */
export const getDeniedModuleIds = (modules, role) =>
  (Array.isArray(modules) ? modules : [])
    .filter((mod) => mod && !canViewModule(role, mod.id))
    .map((mod) => mod.id);

/**
 * 按角色过滤表级动作集合。
 * @param {string} role - admin/moderator/user
 * @param {Iterable<string>} actions - TABS_ACTIONS[tabId] 的动作集合
 */
export const filterTabActionsByRole = (role, actions) => {
  const list = Array.isArray(actions) ? actions : [...(actions || [])];
  if (role === ADMIN_ROLES.ADMIN) return new Set(list);
  if (role === ADMIN_ROLES.MODERATOR) {
    return new Set(list.filter((action) => MODERATOR_ALLOWED_ACTIONS.has(action)));
  }
  return new Set();
};
