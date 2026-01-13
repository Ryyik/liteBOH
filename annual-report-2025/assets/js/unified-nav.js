/**
 * 统一导航栏脚本 - Unified Navigation Bar JavaScript
 * 用于三个页面：newsroom, service, shop
 * 功能：动态插入导航栏、处理响应式交互、用户登录管理
 */

(function () {
  "use strict";

  // 配置常量
  const CONFIG = {
    NAV_CONTAINER_ID: "unified-nav-container",
    NAV_CSS_URL: "assets/css/unified-nav.css",
    LOGIN_CSS_URL: "assets/css/login-modal.css",
    PAGES: [
      { name: "index", path: "index.html", label: "首页" },
      { name: "newsroom", path: "newsroom.html", label: "新闻" },
      { name: "service", path: "service.html", label: "服务" },
      { name: "shop", path: "shop.html", label: "周边" },
    ],
    CURRENT_PAGE: getCurrentPage(),
  };

  // 预设的有效账号（从login.html提取）
  const VALID_ACCOUNTS = [
    { username: "admin", password: "block123456" },
    { username: "LF", password: "DONTFORGETME" },
    { username: "小牛无聊", password: "Fe2O3xnH2O" },
    { username: "雨芙蕖喵", password: "YUFUQU" },
    { username: "Ryyik", password: "iloveboh" },
    { username: "Endgalaxy", password: "hjj123456" },
    { username: "chengzi", password: "zzh520123" },
    { username: "CELLINIA", password: "dingmy20011205" },
    { username: "lzaQ", password: "kikikiki8" },
    { username: "Eleven", password: "Eleven0451" },
    { username: "HYP", password: "HYP1006" },
    { username: "LiulanTuT", password: "rlp820217" },
    { username: "DRWEKS", password: "Li95123518@@@" },
    { username: "hamburger", password: "hanbao123" },
    { username: "MrXue_", password: "yanshu123" },
  ];

  // 获取当前页面名称
  function getCurrentPage() {
    const path = window.location.pathname;
    const filename = path.split("/").pop() || "index.html";
    return filename.replace(".html", "");
  }

  // 加载CSS样式
  function loadStyles() {
    // 加载导航栏CSS
    if (!document.getElementById("unified-nav-css")) {
      const link = document.createElement("link");
      link.id = "unified-nav-css";
      link.rel = "stylesheet";
      link.href = CONFIG.NAV_CSS_URL;
      document.head.appendChild(link);
    }

    // 加载登录弹窗CSS
    if (!document.getElementById("login-modal-css")) {
      const link = document.createElement("link");
      link.id = "login-modal-css";
      link.rel = "stylesheet";
      link.href = CONFIG.LOGIN_CSS_URL;
      document.head.appendChild(link);
    }
  }

  // 生成导航栏HTML
  function generateNavHTML() {
    const currentPage = CONFIG.CURRENT_PAGE;

    // 生成导航菜单项（不含emoji图标）
    const menuItems = CONFIG.PAGES.map((page) => {
      const isActive = currentPage === page.name ? "active" : "";
      return `
                <li>
                    <a href="${page.path}" class="${isActive}">
                        ${page.label}
                    </a>
                </li>
            `;
    }).join("");

    // 获取初始用户区域HTML（根据登录状态）
    let initialUserAreaHTML;
    if (AuthManager.isLoggedIn() && AuthManager.getCurrentUser()) {
      initialUserAreaHTML = getLoggedInUserHTML(AuthManager.getCurrentUser());
    } else {
      initialUserAreaHTML = getGuestUserHTML();
    }
    console.log("生成导航栏HTML - 初始用户区域:", initialUserAreaHTML);

    return `
            <div class="unified-nav">
                <div class="nav-container">
                    <a href="index.html" class="nav-logo">
                        <span class="nav-logo-text">方块之家</span>
                    </a>
                    
                    <ul class="nav-menu">
                        ${menuItems}
                    </ul>
                    
                    <div class="nav-user" id="nav-user-area">
                        ${initialUserAreaHTML}
                    </div>
                    
                    <div class="nav-hamburger" id="nav-hamburger">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>
                
                <div class="nav-menu-mobile" id="nav-menu-mobile">
                    ${CONFIG.PAGES.map(
                      (page) => `
                        <a href="${page.path}" class="${
                        currentPage === page.name ? "active" : ""
                      }">
                            ${page.label}
                        </a>
                      `
                    ).join("")}
                </div>
            </div>
        `;
  }

  // 登录状态管理 - 全局可用
  const AuthManager = {
    // 检查用户是否已登录
    isLoggedIn() {
      try {
        // 首先检查统一的登录状态
        const isLoggedIn = localStorage.getItem("isLoggedIn") === "true";
        if (isLoggedIn) {
          return true;
        }

        // 如果没有统一登录状态，检查index.html的登录状态
        const bohUser = localStorage.getItem("boh_user");
        if (bohUser) {
          try {
            const userData = JSON.parse(bohUser);
            if (userData && userData.loggedIn) {
              // 同步登录状态到统一系统
              localStorage.setItem("isLoggedIn", "true");
              localStorage.setItem("username", userData.username);
              return true;
            }
          } catch (parseError) {
            console.error("解析boh_user数据失败:", parseError);
          }
        }

        console.log("检查登录状态:", false);
        return false;
      } catch (error) {
        console.error("检查登录状态失败:", error);
        return false;
      }
    },

    // 获取当前登录用户
    getCurrentUser() {
      try {
        // 首先尝试获取统一系统用户名
        let username = localStorage.getItem("username");
        if (username) {
          return username;
        }

        // 如果没有，尝试从index.html的登录状态获取
        const bohUser = localStorage.getItem("boh_user");
        if (bohUser) {
          try {
            const userData = JSON.parse(bohUser);
            if (userData && userData.loggedIn && userData.username) {
              // 同步用户名到统一系统
              localStorage.setItem("username", userData.username);
              return userData.username;
            }
          } catch (parseError) {
            console.error("解析boh_user数据失败:", parseError);
          }
        }

        console.log("获取当前用户:", null);
        return null;
      } catch (error) {
        console.error("获取当前用户失败:", error);
        return null;
      }
    },

    // 登录
    login(username) {
      try {
        console.log("执行登录操作，用户名:", username);
        localStorage.setItem("isLoggedIn", "true");
        localStorage.setItem("username", username);
        console.log("登录成功，localStorage已更新");
        this.emitLoginEvent();
      } catch (error) {
        console.error("登录失败，无法访问localStorage:", error);
        alert("登录失败，请确保浏览器支持并允许使用localStorage");
      }
    },

    // 登出
    logout() {
      try {
        console.log("执行登出操作");
        // 清除所有登录状态相关的localStorage键
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("username");
        localStorage.removeItem("boh_user_id");
        localStorage.removeItem("boh_user_data");
        localStorage.removeItem("boh_login_time");
        localStorage.removeItem("boh_user"); // Also clear the legacy login state

        console.log("登出成功，所有登录状态已清空");
        this.emitLogoutEvent();
      } catch (error) {
        console.error("登出失败，无法访问localStorage:", error);
      }
    },

    // 触发登录事件
    emitLoginEvent() {
      const event = new CustomEvent("userLogin", {
        detail: { username: this.getCurrentUser() },
      });
      window.dispatchEvent(event);
    },

    // 触发登出事件
    emitLogoutEvent() {
      const event = new CustomEvent("userLogout");
      window.dispatchEvent(event);
    },
  };

  // 将AuthManager暴露到全局作用域，供其他模块使用
  window.AuthManager = AuthManager;

  // 生成登录模态框HTML
  function generateLoginModalHTML() {
    return `
      <div class="boh-login-modal-overlay" id="nav-login-modal-overlay">
        <div class="boh-login-modal-container">
          <button class="boh-login-modal-close" id="nav-login-modal-close">&times;</button>
          <div class="boh-login-modal-header">
            <div class="boh-login-logo"></div>
            <h2>方块之家</h2>
            <p>这里不只有方块。</p>
          </div>
          <form class="boh-login-form" id="nav-login-form">
            <div class="boh-form-group">
              <label for="nav-username">方块ID</label>
              <input 
                type="text" 
                id="nav-username" 
                name="username" 
                placeholder="请输入你的用户名" 
                required
              />
              <div class="boh-error-message">方块ID不能为空</div>
            </div>
            <div class="boh-form-group">
              <label for="nav-password">密码</label>
              <div class="boh-password-wrap">
                <input 
                  type="password" 
                  id="nav-password" 
                  name="password" 
                  placeholder="请输入你的密码" 
                  required
                />
                <button type="button" class="boh-toggle-password" id="nav-toggle-password">显示</button>
              </div>
              <div class="boh-error-message">密码不能为空（至少6位）</div>
            </div>
            <div class="boh-auth-error" id="nav-auth-error">用户名或密码错误，请重试</div>
            <div class="boh-form-links">
              <a href="#" class="boh-forgot-password">忘记密码？</a>
              <a href="https://docs.qq.com/form/page/DRVZ2TmtwZWRYaU5o" class="boh-register-link" target="_blank">还没有账号？立即注册</a>
            </div>
            <button type="submit" class="boh-login-btn">登录方块之家</button>
          </form>
        </div>
      </div>
    `;
  }

  // 创建导航栏容器
  function createNavContainer() {
    const container = document.createElement("div");
    container.id = CONFIG.NAV_CONTAINER_ID;
    container.innerHTML = generateNavHTML();

    // 插入到body开始位置
    document.body.insertBefore(container, document.body.firstChild);

    // 为body添加页面标识类
    document.body.classList.add(`page-${CONFIG.CURRENT_PAGE}`);
  }

  // 获取用户区域HTML（游客状态）
  function getGuestUserHTML() {
    return `
            <button class="nav-login-btn" id="nav-login-btn" type="button">
                登录
            </button>
        `;
  }

  // 获取用户区域HTML（已登录状态）
  function getLoggedInUserHTML(username) {
    return `
            <div class="nav-user-info" id="nav-user-info" title="点击查看更多">
                <div class="nav-avatar">${username
                  .charAt(0)
                  .toUpperCase()}</div>
                <span class="nav-username">${escapeHtml(username)}</span>
                <div class="nav-dropdown">
                    <a href="letter.html" class="nav-dropdown-item">
                        个人中心
                    </a>
                    <div class="nav-dropdown-divider"></div>
                    <a href="#" class="nav-dropdown-item" id="nav-logout-btn">
                        退出登录
                    </a>
                </div>
            </div>
        `;
  }

  // HTML转义
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // 更新用户区域UI
  function updateUserArea() {
    const userArea = document.getElementById("nav-user-area");

    if (!userArea) {
      console.error("用户区域元素未找到");
      return;
    }

    console.log("开始更新用户区域 - userArea:", userArea);

    // 先清空用户区域内容，确保旧的登录按钮被彻底移除
    userArea.innerHTML = "";

    // Check the login status to ensure it's fresh
    const isLoggedIn = AuthManager.isLoggedIn();
    const currentUser = AuthManager.getCurrentUser();
    console.log("登录状态:", isLoggedIn, "当前用户:", currentUser);

    // Generate the appropriate HTML based on login status
    const userHTML =
      isLoggedIn && currentUser
        ? getLoggedInUserHTML(currentUser)
        : getGuestUserHTML();

    console.log("生成的用户HTML:", userHTML);

    // Update the user area
    userArea.innerHTML = userHTML;

    // Bind appropriate events after updating the UI
    if (isLoggedIn && currentUser) {
      console.log("绑定登出事件");
      bindLogoutEvents();
    } else {
      console.log("绑定登录事件");
      bindLoginEvents();
    }

    console.log("用户区域更新完成 - 登录状态:", isLoggedIn);
  }

  // 显示登录模态框
  function showLoginModal() {
    // 先检查是否已经存在模态框，如果存在则移除
    let modalOverlay = document.getElementById("nav-login-modal-overlay");
    if (modalOverlay) {
      modalOverlay.remove();
    }

    // 创建新的登录模态框
    modalOverlay = document.createElement("div");
    modalOverlay.innerHTML = generateLoginModalHTML();
    document.body.appendChild(modalOverlay);

    // 绑定登录模态框事件
    bindLoginModalEvents();

    // 显示模态框
    document.body.style.overflow = "hidden";
  }

  // 隐藏登录模态框
  function hideLoginModal() {
    const modalOverlay = document.getElementById("nav-login-modal-overlay");
    if (modalOverlay) {
      // 移除整个模态框元素
      modalOverlay.remove();
      document.body.style.overflow = "";
    }
  }

  // 绑定登录模态框事件
  function bindLoginModalEvents() {
    // 关闭按钮
    const closeBtn = document.querySelector(".boh-login-modal-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", hideLoginModal);
    }

    // 点击模态框外部关闭
    const modalOverlay = document.querySelector(".boh-login-modal-overlay");
    if (modalOverlay) {
      modalOverlay.addEventListener("click", function (e) {
        if (e.target === this) {
          hideLoginModal();
        }
      });
    }

    // 密码显示/隐藏功能
    const togglePassword = document.getElementById("nav-toggle-password");
    const passwordInput = document.getElementById("nav-password");
    console.log(
      "密码显示/隐藏功能初始化 - togglePassword:",
      togglePassword,
      "passwordInput:",
      passwordInput
    );
    if (togglePassword && passwordInput) {
      togglePassword.addEventListener("click", function () {
        console.log("显示密码按钮被点击");
        const type = passwordInput.type === "password" ? "text" : "password";
        passwordInput.type = type;
        this.textContent = type === "password" ? "显示" : "隐藏";
        console.log(
          "密码输入框类型已更改为:",
          type,
          "按钮文本已更改为:",
          this.textContent
        );
      });
    }

    // 登录表单提交
    const loginForm = document.getElementById("nav-login-form");
    if (loginForm) {
      loginForm.addEventListener("submit", function (e) {
        e.preventDefault();

        const usernameInput = document.getElementById("nav-username");
        const passwordInput = document.getElementById("nav-password");
        const authError = document.getElementById("nav-auth-error");
        const loginBtn = loginForm.querySelector(".boh-login-btn");

        let isValid = true;

        // 基础表单验证
        if (!usernameInput.value.trim()) {
          usernameInput.classList.add("boh-invalid");
          isValid = false;
        } else {
          usernameInput.classList.remove("boh-invalid");
        }

        if (!passwordInput.value.trim() || passwordInput.value.length < 6) {
          passwordInput.classList.add("boh-invalid");
          isValid = false;
        } else {
          passwordInput.classList.remove("boh-invalid");
        }

        authError.style.display = "none";

        if (isValid) {
          loginBtn.disabled = true;
          loginBtn.textContent = "登录中...";

          // 模拟加载效果
          setTimeout(() => {
            const inputUsername = usernameInput.value.trim();
            const inputPassword = passwordInput.value.trim();

            console.log(
              "登录验证开始，输入用户名:",
              inputUsername,
              "输入密码:",
              inputPassword
            );
            console.log("VALID_ACCOUNTS数组长度:", VALID_ACCOUNTS.length);

            // 账号验证
            const matchedAccount = VALID_ACCOUNTS.find((account) => {
              const usernameMatch = account.username === inputUsername;
              const passwordMatch = account.password === inputPassword;
              return usernameMatch && passwordMatch;
            });

            console.log("账号验证结果，匹配的账号:", matchedAccount);

            if (matchedAccount) {
              // 登录成功
              console.log("登录成功，调用AuthManager.login()");
              AuthManager.login(inputUsername);
              console.log("AuthManager.login()执行完成");
              hideLoginModal();

              // 立即更新UI to ensure no duplicate buttons remain
              console.log("调用updateUserArea()更新导航栏");
              updateUserArea();
              console.log("updateUserArea()执行完成");
            } else {
              // 登录失败
              console.log("登录失败，账号或密码不匹配");
              authError.style.display = "block";
            }

            loginBtn.disabled = false;
            loginBtn.textContent = "登录方块之家";
          }, 1000);
        }
      });

      // 输入框聚焦时移除错误状态
      const inputs = loginForm.querySelectorAll("input");
      inputs.forEach((input) => {
        input.addEventListener("focus", function () {
          this.classList.remove("boh-invalid");
          document.getElementById("nav-auth-error").style.display = "none";
        });
      });
    }

    // 忘记密码链接
    const forgotPasswordLink = document.querySelector(".boh-forgot-password");
    if (forgotPasswordLink) {
      forgotPasswordLink.addEventListener("click", function (e) {
        e.preventDefault();
        alert("由于技术限制，请联系网站开发者解决该问题。");
      });
    }
  }

  // 绑定登录按钮事件
  function bindLoginEvents() {
    const loginBtn = document.getElementById("nav-login-btn");
    if (loginBtn) {
      // 确保只绑定一次事件监听器，避免重复绑定
      if (!loginBtn.hasAttribute("data-login-bound")) {
        loginBtn.setAttribute("data-login-bound", "true");
        loginBtn.addEventListener("click", function (e) {
          e.preventDefault();
          console.log("登录按钮被点击，显示登录模态框");
          showLoginModal();
        });
        console.log("登录按钮事件监听器已绑定");
      }
    } else {
      console.error("登录按钮元素未找到");
    }
  }

  // 绑定登出按钮事件
  function bindLogoutEvents() {
    const userInfo = document.getElementById("nav-user-info");
    if (userInfo) {
      console.log("绑定登出按钮事件 - userInfo:", userInfo);

      // 检查是否已经绑定过事件，避免重复绑定
      if (!userInfo.hasAttribute("data-logout-events-bound")) {
        userInfo.setAttribute("data-logout-events-bound", "true");

        // 下拉菜单显示 - 鼠标悬停（桌面端）
        userInfo.addEventListener("mouseenter", function () {
          this.classList.add("show-dropdown");
        });
        userInfo.addEventListener("mouseleave", function () {
          this.classList.remove("show-dropdown");
        });

        // 点击事件处理 - 适用于移动端和桌面端（仅处理下拉菜单切换）
        userInfo.addEventListener("click", function (e) {
          // 如果点击的是退出登录按钮，不处理下拉菜单切换
          if (
            e.target.id === "nav-logout-btn" ||
            (e.target.parentElement &&
              e.target.parentElement.id === "nav-logout-btn")
          ) {
            return;
          }

          e.stopPropagation();
          e.preventDefault();

          // 切换下拉菜单显示状态，适配移动端点击交互
          this.classList.toggle("show-dropdown");
        });

        // 添加触摸事件支持 - 确保横屏模式下能正常使用
        userInfo.addEventListener("touchstart", function (e) {
          // 如果触摸的是退出登录按钮，不处理下拉菜单切换
          if (
            e.target.id === "nav-logout-btn" ||
            (e.target.parentElement &&
              e.target.parentElement.id === "nav-logout-btn")
          ) {
            return;
          }

          e.stopPropagation();

          // 切换下拉菜单显示状态，适配移动端触摸交互
          this.classList.toggle("show-dropdown");
        });
      }

      // 直接绑定退出登录按钮的点击事件
      const logoutBtn = document.getElementById("nav-logout-btn");
      if (logoutBtn) {
        // 确保只绑定一次事件监听器，避免重复绑定
        if (!logoutBtn.hasAttribute("data-logout-bound")) {
          logoutBtn.setAttribute("data-logout-bound", "true");
          logoutBtn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            console.log("退出登录按钮被点击，开始执行登出流程");

            // 执行登出
            AuthManager.logout();

            // 立即更新用户区域，确保登录状态正确显示
            setTimeout(() => {
              // 关闭任何打开的下拉菜单
              const userInfo = document.getElementById("nav-user-info");
              if (userInfo) {
                userInfo.classList.remove("show-dropdown");
              }

              updateUserArea();

              // 页面重定向到首页（确保用户状态已更新）
              console.log("登出完成，重定向到首页");
              window.location.href = "index.html";
            }, 100);
          });
        }
        console.log("退出登录按钮事件监听器已绑定");
      } else {
        console.error("退出登录按钮元素未找到");
      }
    } else {
      console.error("用户信息元素未找到");
    }
  }

  // 添加全局事件监听，使用事件委托处理下拉菜单显示/隐藏
  function bindGlobalEvents() {
    console.log("绑定全局事件监听");

    // 点击页面其他地方关闭下拉菜单
    document.addEventListener("click", function (e) {
      const userInfo = document.getElementById("nav-user-info");
      if (userInfo && !userInfo.contains(e.target)) {
        console.log("点击页面其他地方，关闭下拉菜单");
        userInfo.classList.remove("show-dropdown");
      }
    });

    // 触摸事件支持 - 移动端触摸页面其他地方关闭下拉菜单
    document.addEventListener("touchstart", function (e) {
      const userInfo = document.getElementById("nav-user-info");
      if (userInfo && !userInfo.contains(e.target)) {
        console.log("触摸页面其他地方，关闭下拉菜单");
        userInfo.classList.remove("show-dropdown");
      }
    });
  }

  // 绑定事件处理程序
  function bindEventHandlers() {
    // 汉堡菜单切换
    const hamburger = document.getElementById("nav-hamburger");
    const mobileMenu = document.getElementById("nav-menu-mobile");

    if (hamburger && mobileMenu) {
      hamburger.addEventListener("click", function (e) {
        e.preventDefault();
        this.classList.toggle("active");
        mobileMenu.classList.toggle("active");

        // 防止背景滚动
        document.body.style.overflow = mobileMenu.classList.contains("active")
          ? "hidden"
          : "";
      });

      // 点击移动端菜单链接后关闭菜单
      mobileMenu.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", function () {
          hamburger.classList.remove("active");
          mobileMenu.classList.remove("active");
          document.body.style.overflow = "";
        });
      });
    }

    // 窗口调整时关闭移动端菜单
    window.addEventListener("resize", function () {
      if (window.innerWidth > 768) {
        const hamburger = document.getElementById("nav-hamburger");
        const mobileMenu = document.getElementById("nav-menu-mobile");
        if (hamburger && mobileMenu) {
          hamburger.classList.remove("active");
          mobileMenu.classList.remove("active");
          document.body.style.overflow = "";
        }
      }
    });

    // 监听登录状态变化事件
    window.addEventListener("userLogin", function () {
      console.log("监听到userLogin事件，调用updateUserArea()");
      updateUserArea();
    });

    // 监听登出事件
    window.addEventListener("userLogout", function () {
      console.log("监听到userLogout事件，调用updateUserArea()");
      updateUserArea();
    });

    // 绑定全局事件监听
    bindGlobalEvents();
  }

  // 初始化函数
  function init() {
    // 确保DOM加载完成
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initialize);
    } else {
      initialize();
    }
  }

  function initialize() {
    // 加载CSS
    loadStyles();

    // 创建导航栏
    createNavContainer();

    // 绑定事件
    bindEventHandlers();

    // 立即更新用户区域，确保登录状态正确显示
    console.log("初始化时调用updateUserArea()");
    updateUserArea();

    console.log("统一导航栏已初始化，当前页面:", CONFIG.CURRENT_PAGE);
  }

  // 启动初始化
  init();

  // 监听localStorage变化，实现跨页面登录状态同步
  window.addEventListener("storage", function (e) {
    if (
      e.key === "boh_user" ||
      e.key === "isLoggedIn" ||
      e.key === "username"
    ) {
      console.log("检测到localStorage变化，键:", e.key, "新值:", e.newValue);
      // 延迟更新UI以确保localStorage状态已完全更新
      setTimeout(() => {
        updateUserArea();
      }, 100);
    }
  });

  // 暴露初始化函数，供外部调用
  window.initUnifiedNav = init;
})();
