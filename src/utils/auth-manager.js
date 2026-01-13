/**
 * ==============================================
 * 登录管理系统 (Authentication Manager)
 * ==============================================
 * 统一管理用户登录、登出、状态验证
 * 支持多账号、会话管理、权限控制
 * ==============================================
 */

// 导入用户配置
import { getAuthAccounts } from "../config/users.config.js";

(function (global) {
  "use strict";

  /* ===================
     配置常量
     =================== */

  /**
   * 认证配置
   * 从用户配置文件获取账号信息
   */
  const AUTH_CONFIG = {
    // 存储键名
    STORAGE_KEYS: {
      IS_LOGGED_IN: "isLoggedIn",
      USERNAME: "username",
      LOGIN_TIME: "loginTime",
      SESSION_ID: "sessionId",
    },

    // 会话有效期（毫秒）- 默认24小时
    SESSION_TIMEOUT: 24 * 60 * 60 * 1000,

    // 从配置文件获取有效账号列表
    get VALID_ACCOUNTS() {
      return getAuthAccounts();
    },
  };

  /* ===================
     登录管理类
     =================== */

  /**
   * AuthManager 类
   * 负责所有认证相关的操作
   */
  class AuthManager {
    constructor() {
      this.listeners = [];
      this.init();
    }

    /**
     * 初始化认证管理器
     * 检查会话有效性
     */
    init() {
      this.checkSessionValidity();
    }

    /**
     * 验证账号密码
     * @param {string} username - 用户名
     * @param {string} password - 密码
     * @returns {Object|null} 匹配的账号对象或null
     */
    validateCredentials(username, password) {
      if (!username || !password) {
        return null;
      }

      return (
        AUTH_CONFIG.VALID_ACCOUNTS.find(
          (account) =>
            account.username === username && account.password === password
        ) || null
      );
    }

    /**
     * 登录
     * @param {string} username - 用户名
     * @param {string} password - 密码
     * @returns {Object} 登录结果 {success: boolean, message: string, user: Object}
     */
    login(username, password) {
      // 验证输入
      if (!username || !password) {
        return {
          success: false,
          message: "用户名和密码不能为空",
          user: null,
        };
      }

      if (password.length < 6) {
        return {
          success: false,
          message: "密码长度至少6位",
          user: null,
        };
      }

      // 验证账号密码
      const matchedAccount = this.validateCredentials(username, password);

      if (!matchedAccount) {
        return {
          success: false,
          message: "用户名或密码错误",
          user: null,
        };
      }

      // 生成会话ID
      const sessionId = this.generateSessionId();
      const loginTime = Date.now();

      // 存储登录信息
      try {
        localStorage.setItem(AUTH_CONFIG.STORAGE_KEYS.USERNAME, username);
        localStorage.setItem(AUTH_CONFIG.STORAGE_KEYS.IS_LOGGED_IN, "true");
        localStorage.setItem(
          AUTH_CONFIG.STORAGE_KEYS.LOGIN_TIME,
          loginTime.toString()
        );
        localStorage.setItem(AUTH_CONFIG.STORAGE_KEYS.SESSION_ID, sessionId);

        // 触发登录事件
        this.notifyListeners("login", {
          username,
          role: matchedAccount.role,
        });

        return {
          success: true,
          message: "登录成功",
          user: {
            username,
            role: matchedAccount.role,
          },
        };
      } catch (error) {
        console.error("登录失败:", error);
        return {
          success: false,
          message: "登录失败，请重试",
          user: null,
        };
      }
    }

    /**
     * 登出
     * @returns {boolean} 登出是否成功
     */
    logout() {
      try {
        // 获取用户名用于事件通知
        const username = localStorage.getItem(AUTH_CONFIG.STORAGE_KEYS.USERNAME);

        // 清除所有登录信息
        Object.values(AUTH_CONFIG.STORAGE_KEYS).forEach((key) => {
          localStorage.removeItem(key);
        });

        // 清除旧版本的存储键
        localStorage.removeItem("boh_user");

        // 触发登出事件
        this.notifyListeners("logout", { username });

        return true;
      } catch (error) {
        console.error("登出失败:", error);
        return false;
      }
    }

    /**
     * 检查是否已登录
     * @returns {boolean} 是否已登录
     */
    isLoggedIn() {
      const isLoggedIn =
        localStorage.getItem(AUTH_CONFIG.STORAGE_KEYS.IS_LOGGED_IN) === "true";
      if (!isLoggedIn) {
        return false;
      }

      // 检查会话是否过期
      return this.checkSessionValidity();
    }

    /**
     * 获取当前用户信息
     * @returns {Object|null} 用户信息对象或null
     */
    getCurrentUser() {
      if (!this.isLoggedIn()) {
        return null;
      }

      const username = localStorage.getItem(AUTH_CONFIG.STORAGE_KEYS.USERNAME);
      if (!username) {
        return null;
      }

      const account = AUTH_CONFIG.VALID_ACCOUNTS.find(
        (acc) => acc.username === username
      );

      return account
        ? {
            username,
            role: account.role,
          }
        : null;
    }

    /**
     * 检查会话有效性
     * @returns {boolean} 会话是否有效
     */
    checkSessionValidity() {
      const loginTime = localStorage.getItem(
        AUTH_CONFIG.STORAGE_KEYS.LOGIN_TIME
      );
      if (!loginTime) {
        return false;
      }

      const currentTime = Date.now();
      const elapsedTime = currentTime - parseInt(loginTime, 10);

      // 会话过期，自动登出
      if (elapsedTime > AUTH_CONFIG.SESSION_TIMEOUT) {
        console.log("会话已过期，自动登出");
        this.logout();
        return false;
      }

      return true;
    }

    /**
     * 生成会话ID
     * @returns {string} 唯一的会话ID
     */
    generateSessionId() {
      return (
        "session_" +
        Date.now() +
        "_" +
        Math.random().toString(36).substring(2, 15)
      );
    }

    /**
     * 添加状态变化监听器
     * @param {Function} callback - 回调函数
     */
    addListener(callback) {
      if (typeof callback === "function") {
        this.listeners.push(callback);
      }
    }

    /**
     * 移除状态变化监听器
     * @param {Function} callback - 回调函数
     */
    removeListener(callback) {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    }

    /**
     * 通知所有监听器
     * @param {string} event - 事件类型
     * @param {Object} data - 事件数据
     */
    notifyListeners(event, data) {
      this.listeners.forEach((callback) => {
        try {
          callback(event, data);
        } catch (error) {
          console.error("监听器执行失败:", error);
        }
      });

      // 触发自定义事件，供其他模块监听
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("authStateChange", {
            detail: { event, data },
          })
        );
      }
    }

    /**
     * 检查用户权限
     * @param {string} requiredRole - 需要的角色
     * @returns {boolean} 是否有权限
     */
    hasPermission(requiredRole) {
      const user = this.getCurrentUser();
      if (!user) {
        return false;
      }

      // admin有所有权限
      if (user.role === "admin") {
        return true;
      }

      return user.role === requiredRole;
    }

    /**
     * 刷新会话
     * 重置登录时间，延长会话有效期
     */
    refreshSession() {
      if (this.isLoggedIn()) {
        localStorage.setItem(
          AUTH_CONFIG.STORAGE_KEYS.LOGIN_TIME,
          Date.now().toString()
        );
        return true;
      }
      return false;
    }
  }

  /* ===================
     全局实例
     =================== */

  /**
   * 创建全局认证管理器实例
   */
  const authManager = new AuthManager();

  /* ===================
     暴露接口
     =================== */

  /**
   * 将AuthManager暴露到全局
   * 方便在各个模块中使用
   */
  if (typeof global !== "undefined") {
    global.AuthManager = authManager;
    global.AuthManagerClass = AuthManager;
  }

  /* ===================
     自动刷新会话
     =================== */

  /**
   * 定期刷新会话
   * 每5分钟检查一次，如果用户活跃则刷新会话
   */
  if (typeof window !== "undefined") {
    let lastActivityTime = Date.now();

    // 监听用户活动
    const activityEvents = ["mousedown", "keydown", "scroll", "touchstart"];
    activityEvents.forEach((event) => {
      window.addEventListener(
        event,
        () => {
          lastActivityTime = Date.now();
        },
        { passive: true }
      );
    });

    // 定期检查并刷新会话
    setInterval(() => {
      if (authManager.isLoggedIn()) {
        const timeSinceLastActivity = Date.now() - lastActivityTime;
        // 如果5分钟内有活动，刷新会话
        if (timeSinceLastActivity < 5 * 60 * 1000) {
          authManager.refreshSession();
        }
      }
    }, 5 * 60 * 1000); // 每5分钟检查一次
  }

  /* ===================
     兼容性处理
     =================== */

  /**
   * 监听storage事件，同步多个标签页的登录状态
   */
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key === AUTH_CONFIG.STORAGE_KEYS.IS_LOGGED_IN) {
        // 登录状态变化，通知监听器
        const username = localStorage.getItem(
          AUTH_CONFIG.STORAGE_KEYS.USERNAME
        );
        if (e.newValue === "true") {
          authManager.notifyListeners("login", { username });
        } else {
          authManager.notifyListeners("logout", { username });
        }
      }
    });
  }

  console.log("登录管理系统已初始化");
})(typeof window !== "undefined" ? window : this);
