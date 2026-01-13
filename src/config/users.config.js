/**
 * ==============================================
 * 方块之家 - 用户数据统一配置文件
 * ==============================================
 * 
 * 本文件从项目所有页面中提取真实的用户数据，统一管理
 * 修改此文件后，所有相关页面会自动同步更新
 * 
 * 数据来源：
 * - username, password: 从所有登录系统中提取
 *   · src/components/UnifiedNavbar.vue
 *   · src/views/Home.vue  
 *   · src/views/ShopUser.vue
 *   · public/annual-report-2025@/assets/js/unified-nav.js
 * 
 * - joinDate: 从 src/views/Letter.vue 的 joinTimeData 提取
 * 
 * - tags: 从 src/views/Letter.vue 的 letterData.titles 提取
 * 
 * - addresses: 从 src/views/address.vue 的 allAddresses 提取
 * 
 * 使用的页面：
 * - src/utils/auth-manager.js: 认证管理系统
 * - src/components/UnifiedNavbar.vue: 导航栏登录
 * - src/views/Home.vue: 首页登录
 * - src/views/ShopUser.vue: 周边商城用户中心
 * - src/views/address.vue: 地址管理页面
 * ==============================================
 */

/**
 * 用户账号数据
 * 仅包含从实际页面中提取的真实字段
 * 
 * @property {string} username - 用户名（登录ID）
 * @property {string} password - 登录密码
 * @property {string} joinDate - 入群日期 (YYYY-MM-DD)
 * @property {Array<string>} tags - 个人标签（从Letter页面提取）
 * @property {Array<Object>} addresses - 收货地址列表（从address.vue提取）
 * 
 * 注：原始登录系统仅使用 username 和 password，
 *      role 字段为 auth-manager.js 认证系统所需，用于权限管理
 */
export const USER_ACCOUNTS = [
  {
    username: "admin",
    password: "block123456",
    joinDate: "2018-07-21",
    tags: ["管理员", "统筹者"],
    role: "admin",  // 用于 auth-manager.js 权限管理
    addresses: []  // 暂无地址信息
  },
  {
    username: "LF",
    password: "DONTFORGETME",
    joinDate: "2018-07-21",
    tags: ["很有梗", "鬼点子生成中", "元老级", "放肆", "人气带动"],
    role: "user",
    addresses: []  // 已删除，出于安全考虑
  },
  {
    username: "小牛无聊",
    password: "Fe2O3xnH2O",
    joinDate: "2018-07-21",
    tags: ["建筑大神", "pvp大神", "指令大神", "红石大神", "手工大神", "元老级"],
    role: "user",
    addresses: []  // 已删除，出于安全考虑
  },
  {
    username: "雨芙蕖喵",
    password: "YUFUQU",
    joinDate: "2025-08-27",
    tags: ["氛围组", "很有梗", "牛牛派", "熬夜大神（曾经）", "找茬"],
    role: "user",
    addresses: [
      {
        receiver: "曼波",
        phone: "18850282670",
        address: "福建省/福州市/闽侯县/甘蔗街道福建卫生职业技术学院",
        alias: "Ṭ̣雨芙蕖ᰔ᪚"
      }
    ]
  },
  {
    username: "Ryyik",
    password: "iloveboh",
    joinDate: "2018-07-21",
    tags: ["鬼点子神生成", "摄影视频爱好者", "羽毛球", "策划者", "元老级"],
    role: "user",
    addresses: []  // 暂无地址信息
  },
  {
    username: "Endgalaxy",
    password: "hjj123456",
    joinDate: "2018-07-21",
    tags: ["游戏大神", "技术在线", "元老级", "Ryyik最严厉的父亲"],
    role: "user",
    addresses: []  // 已删除，出于安全考虑
  },
  {
    username: "chengzi",
    password: "zzh520123",
    joinDate: "2018-07-21",
    tags: ["休闲玩家", "元老级"],
    role: "user",
    addresses: []  // 已删除，出于安全考虑
  },
  {
    username: "CELLINIA",
    password: "dingmy20011205",
    joinDate: "2023-09-16",
    tags: ["老师", "文学", "ow大王"],
    role: "user",
    addresses: []  // 已删除，出于安全考虑
  },
  {
    username: "lzaQ",
    password: "kikikiki8",
    joinDate: "2022-02-12",
    tags: ["跑酷大神", "呆", "音游"],
    role: "user",
    addresses: []  // 已删除，出于安全考虑
  },
  {
    username: "Eleven",
    password: "Eleven0451",
    joinDate: "2022-02-12",
    tags: ["跑酷大神", "pvp大神", "游戏黑洞", "凯影", "铁男"],
    role: "user",
    addresses: []  // 已删除，出于安全考虑
  },
  {
    username: "HYP",
    password: "HYP1006",
    joinDate: "2019-07-21",
    tags: ["技术流", "暖场", "氛围组", "eleven慈父", "元老级"],
    role: "user",
    addresses: []  // 已删除，出于安全考虑
  },
  {
    username: "LiulanTuT",
    password: "rlp820217",
    joinDate: "2025-08-29",
    tags: ["pvp大神", "LF粉丝团"],
    role: "user",
    addresses: []  // 暂无地址信息
  },
  {
    username: "DRWEKS",
    password: "Li95123518@@@",
    joinDate: "2025-09-06",
    tags: ["建筑大神"],
    role: "user",
    addresses: []  // 暂无地址信息
  },
  {
    username: "hamburger",
    password: "hanbao123",
    joinDate: "2022-01-01",
    tags: ["pvp大神", "整活", "eleven最严厉的父亲"],
    role: "user",
    addresses: []  // 已删除，出于安全考虑
  },
  {
    username: "MrXue_",
    password: "yanshu123",
    joinDate: "2025-11-27",
    tags: ["方块之家新人"],
    role: "user",
    addresses: []  // 暂无地址信息
  }
];

/**
 * ========================================
 * 辅助函数 - 用于其他页面调用
 * ========================================
 */

/**
 * 获取用于认证的账号列表（包含 role 字段，用于权限管理）
 * 用于：auth-manager.js, UnifiedNavbar.vue, Home.vue, ShopUser.vue
 * @returns {Array<{username: string, password: string, role: string}>}
 */
export function getAuthAccounts() {
  return USER_ACCOUNTS.map(user => ({
    username: user.username,
    password: user.password,
    role: user.role || "user"  // 默认角色为 user
  }));
}

/**
 * 根据用户名查找用户信息
 * @param {string} username - 用户名
 * @returns {Object|null} 用户信息对象或null
 */
export function getUserByUsername(username) {
  return USER_ACCOUNTS.find(user => user.username === username) || null;
}

/**
 * 验证用户凭证
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {Object|null} 验证成功返回用户信息，失败返回null
 */
export function validateUser(username, password) {
  const user = USER_ACCOUNTS.find(
    account => account.username === username && account.password === password
  );
  return user || null;
}

/**
 * 获取所有用户名列表
 * @returns {Array<string>} 用户名数组
 */
export function getAllUsernames() {
  return USER_ACCOUNTS.map(user => user.username);
}

/**
 * 根据入群年份获取用户列表
 * @param {string} year - 入群年份 (如 "2018")
 * @returns {Array<Object>} 用户列表
 */
export function getUsersByJoinYear(year) {
  return USER_ACCOUNTS.filter(user => user.joinDate && user.joinDate.startsWith(year));
}

/**
 * 根据标签获取用户列表
 * @param {string} tag - 标签
 * @returns {Array<Object>} 用户列表
 */
export function getUsersByTag(tag) {
  return USER_ACCOUNTS.filter(user => user.tags && user.tags.includes(tag));
}

/**
 * 根据用户名获取用户地址列表
 * @param {string} username - 用户名
 * @returns {Array<Object>} 用户的地址列表
 */
export function getUserAddresses(username) {
  const user = USER_ACCOUNTS.find(u => u.username === username);
  return user && user.addresses ? user.addresses : [];
}

/**
 * 获取用户统计信息
 * @returns {Object} 统计信息
 */
export function getUserStats() {
  const stats = {
    total: USER_ACCOUNTS.length,
    byYear: {},
    byTag: {}
  };

  // 按年份统计
  USER_ACCOUNTS.forEach(user => {
    const year = user.joinDate ? user.joinDate.substring(0, 4) : 'unknown';
    stats.byYear[year] = (stats.byYear[year] || 0) + 1;
  });

  // 按标签统计
  USER_ACCOUNTS.forEach(user => {
    if (user.tags) {
      user.tags.forEach(tag => {
        stats.byTag[tag] = (stats.byTag[tag] || 0) + 1;
      });
    }
  });

  return stats;
}

/**
 * 默认导出
 */
export default {
  USER_ACCOUNTS,
  getAuthAccounts,
  getUserByUsername,
  validateUser,
  getAllUsernames,
  getUsersByJoinYear,
  getUsersByTag,
  getUserAddresses,
  getUserStats
};
