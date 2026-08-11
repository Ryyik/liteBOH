/**
 * 主题管理器 - 管理应用深浅色模式切换
 * @module themeManager
 */

import { ensureThemeCSS } from './theme-css-loader.js';
import { logger } from './logger.js';

const DEFAULT_THEME = 'light';
const VALID_THEMES = ['light', 'dark', 'system', 'home-cat', 'anniversary-mc'];

class ThemeManager {
  constructor() {
    this.theme = DEFAULT_THEME;
    this.preference = DEFAULT_THEME;
    this.uiStyle = 'glass';
    this.listeners = [];
    this.initialized = false;
    this.systemThemeQuery = null;
    this.handleSystemThemeChange = () => {
      if (this.preference !== 'system') return;
      this.applyTheme(this.getSystemTheme(), 'system');
    };
    // 不要在这里调用 init()，让 main.js 来控制初始化时机
  }

  /**
   * 初始化主题管理器
   */
  init() {
    if (this.initialized) return;
    this.initialized = true;

    const savedTheme = localStorage.getItem('boh-theme');
    const savedUiStyle = localStorage.getItem('boh-ui-style');

    this.preference = VALID_THEMES.includes(savedTheme) ? savedTheme : DEFAULT_THEME;
    this.uiStyle = ['flat', 'glass'].includes(savedUiStyle) ? savedUiStyle : 'glass';
    this.theme = this.resolveTheme(this.preference);
    this.updateSystemThemeListener();

    // 应用主题
    this.applyTheme(this.theme, this.preference);

    // 若初始即为深色主题，立即加载深色 CSS
    if (this.theme === 'dark') {
      ensureThemeCSS('dark').catch(() => {});
    }
  }

  getSystemTheme() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return 'light';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  resolveTheme(preference = this.preference) {
    return preference === 'system' ? this.getSystemTheme() : preference;
  }

  updateSystemThemeListener() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    if (!this.systemThemeQuery) {
      this.systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    }

    const method = this.preference === 'system' ? 'addEventListener' : 'removeEventListener';
    if (typeof this.systemThemeQuery[method] === 'function') {
      this.systemThemeQuery[method]('change', this.handleSystemThemeChange);
      return;
    }

    const legacyMethod = this.preference === 'system' ? 'addListener' : 'removeListener';
    if (typeof this.systemThemeQuery[legacyMethod] === 'function') {
      this.systemThemeQuery[legacyMethod](this.handleSystemThemeChange);
    }
  }

  /**
   * 应用指定主题
   * @param {string} theme - 'light'、'dark' 或自定义主题
   */
  applyTheme(theme, preference = this.preference) {
    this.theme = theme;
    this.preference = preference;

    // 设置到 documentElement
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');

    // 为特定容器设置主题属性
    const containers = [
      '.forum-page',
      '.post-detail-page',
      '.user-space-page',
      '.account-security-page',
      '.address-page',
      '.subscription-page',
      '.note-page',
      '.partners-container',
      '.tags-impressions-page',
      '.pushplus-settings-page',
      '.shared-memory-page',
      '#unified-nav-container',
      '.bohai-page',
      '.x-notifications-container'
    ];

    containers.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        if (el) {
          el.setAttribute('data-theme', theme);
          el.setAttribute('data-ui-style', this.uiStyle);
        }
      });
    });

    // 触发主题变化事件
    this.notifyListeners(theme, this.preference, this.uiStyle);

    // 更新 meta theme-color
    this.updateMetaThemeColor(theme);

    // 触发自定义事件，通知所有页面组件
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme, uiStyle: this.uiStyle } }));
    }

    // 按需加载深色主题 CSS（首次切换时动态加载，不阻塞首屏）
    if (theme === 'dark') {
      ensureThemeCSS('dark').catch(() => {});
    }
  }

  /**
   * 切换主题
   * @returns {string} 新主题名称
   */
  toggle() {
    const newTheme = this.theme === 'light' ? 'dark' : 'light';
    this.preference = newTheme;
    this.updateSystemThemeListener();
    this.applyTheme(newTheme, newTheme);
    localStorage.setItem('boh-theme', newTheme);
    return newTheme;
  }

  /**
   * 设置指定主题
   * @param {string} theme - 'light'、'dark' 或自定义主题
   */
  setTheme(theme) {
    if (VALID_THEMES.includes(theme) && theme !== 'system') {
      this.preference = theme;
      this.updateSystemThemeListener();
      this.applyTheme(theme, theme);
      localStorage.setItem('boh-theme', theme);
    }
  }

  /**
   * 获取当前主题
   * @returns {string} 当前主题名称
   */
  getTheme() {
    return this.theme;
  }

  /**
   * 获取用户选择的主题偏好
   * @returns {'light'|'dark'|'system'|'home-cat'|'anniversary-mc'}
   */
  getPreference() {
    return this.preference;
  }

  /**
   * 获取当前界面材质风格
   * @returns {'flat'|'glass'}
   */
  getUiStyle() {
    return this.uiStyle;
  }

  /**
   * 设置界面材质风格
   * @param {'flat'|'glass'} uiStyle
   */
  setUiStyle(uiStyle) {
    if (!['flat', 'glass'].includes(uiStyle)) return;
    this.uiStyle = uiStyle;
    localStorage.setItem('boh-ui-style', uiStyle);
    this.applyTheme(this.theme, this.preference);
  }

  /**
   * 检查是否为深色模式
   * @returns {boolean}
   */
  isDark() {
    return this.theme === 'dark';
  }

  /**
   * 重置为默认主题
   */
  resetToSystem() {
    this.preference = 'system';
    localStorage.setItem('boh-theme', 'system');
    this.updateSystemThemeListener();
    this.applyTheme(this.getSystemTheme(), 'system');
  }

  /**
   * 添加主题变化监听器
   * @param {Function} callback - 回调函数
   */
  addListener(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
  }

  /**
   * 移除主题变化监听器
   * @param {Function} callback - 回调函数
   */
  removeListener(callback) {
    const index = this.listeners.indexOf(callback);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * 通知所有监听器
   * @param {string} theme - 当前主题
   */
  notifyListeners(theme, preference = this.preference, uiStyle = this.uiStyle) {
    this.listeners.forEach(callback => {
      try {
        callback(theme, preference, uiStyle);
      } catch (e) {
        logger.error('theme', 'Theme change listener error:', e);
      }
    });
  }

  /**
   * 更新 meta theme-color
   * @param {string} theme - 当前主题
   */
  updateMetaThemeColor(theme) {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute(
        'content',
        theme === 'dark'
          ? '#0a0a0f'
          : (theme === 'home-cat' ? '#fffdf8' : (theme === 'anniversary-mc' ? '#79a947' : '#ffffff'))
      );
    }
  }
}

// 创建单例实例
export const themeManager = new ThemeManager();

// 默认导出
export default themeManager;
