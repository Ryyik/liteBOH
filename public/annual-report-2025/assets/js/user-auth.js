/**
 * 简化的用户认证模块 - 仅保留登录弹窗功能，登录状态管理由unified-nav.js处理
 * 用于三个页面：newsroom, shop, service
 */

(function (global) {
  "use strict";

  // ==================== 配置常量 ====================
  const AUTH_CONFIG = {
    // 有效账号数据库（与login.html保持一致）
    VALID_ACCOUNTS: [
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
    ],
  };

  // ==================== 登录弹窗管理类 ====================
  class LoginModalManager {
    constructor() {
      this.modal = null;
      this.isShown = false;
      this.init();
    }

    // 初始化弹窗
    init() {
      this.createModal();
      this.bindEvents();
    }

    // 创建登录弹窗HTML
    createModal() {
      // 检查是否已存在
      if (document.getElementById("boh-login-modal")) {
        this.modal = document.getElementById("boh-login-modal");
        return;
      }

      const modalHTML = `
                <div id="boh-login-modal" class="boh-login-modal-overlay" style="display: none;">
                    <div class="boh-login-modal-container">
                        <button class="boh-login-modal-close" id="boh-modal-close" aria-label="关闭">&times;</button>
                        
                        <div class="boh-login-modal-header">
                            <div class="boh-login-logo"></div>
                            <h2>方块之家</h2>
                            <p>这里不只有方块。</p>
                        </div>

                        <form class="boh-login-form" id="boh-login-form">
                            <div class="boh-form-group">
                                <label for="boh-username">方块ID</label>
                                <input type="text" id="boh-username" name="username" placeholder="请输入你的用户名" required />
                                <div class="boh-error-message">用户名不能为空</div>
                            </div>

                            <div class="boh-form-group">
                                <label for="boh-password">密码</label>
                                <div class="boh-password-wrap">
                                    <input type="password" id="boh-password" name="password" placeholder="请输入你的密码" required />
                                    <button type="button" class="boh-toggle-password" id="boh-toggle-password">显示</button>
                                </div>
                                <div class="boh-error-message">密码长度至少6位</div>
                            </div>

                            <div class="boh-auth-error" id="boh-auth-error">用户名或密码错误，请重试</div>

                            <div class="boh-form-links">
                                <a href="#" class="boh-forgot-password">忘记密码？</a>
                                <a href="https://docs.qq.com/form/page/DRVZ2TmtwZWRYaU5o" class="boh-register-link" target="_blank">还没有账号？立即注册</a>
                            </div>

                            <button type="submit" class="boh-login-btn">登录方块之家</button>
                        </form>
                    </div>
                </div>
            `;

      // 创建样式
      const style = document.createElement("style");
      style.id = "boh-login-modal-style";
      style.textContent = this.getModalStyles();

      // 添加到页面
      document.body.insertAdjacentHTML("beforeend", modalHTML);
      document.head.appendChild(style);

      this.modal = document.getElementById("boh-login-modal");
    }

    // 获取弹窗样式
    getModalStyles() {
      return `
                /* 登录弹窗样式 */
                .boh-login-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0, 0, 0, 0.6);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    z-index: 10000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: boh-modal-fadeIn 0.3s ease;
                }

                @keyframes boh-modal-fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                .boh-login-modal-container {
                    width: 100%;
                    max-width: 400px;
                    margin: 20px;
                    padding: 40px 30px;
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(24px);
                    -webkit-backdrop-filter: blur(24px);
                    border-radius: 16px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    position: relative;
                    animation: boh-modal-slideUp 0.3s ease;
                }

                @keyframes boh-modal-slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(30px) scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }

                .boh-login-modal-close {
                    position: absolute;
                    top: 15px;
                    right: 15px;
                    width: 36px;
                    height: 36px;
                    border: none;
                    background: rgba(0, 0, 0, 0.1);
                    border-radius: 50%;
                    font-size: 24px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s ease;
                    color: #666;
                }

                .boh-login-modal-close:hover {
                    background: rgba(0, 0, 0, 0.2);
                    transform: rotate(90deg);
                }

                .boh-login-modal-header {
                    text-align: center;
                    margin-bottom: 30px;
                }

                .boh-login-logo {
                    width: 60px;
                    height: 60px;
                    margin: 0 auto 15px;
                    background-image: url('../../../assets/images/favicon.png');
                    background-size: contain;
                    background-repeat: no-repeat;
                    background-position: center;
                }

                .boh-login-modal-header h2 {
                    margin: 0 0 8px;
                    font-size: 24px;
                    color: #1d1d1f;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }

                .boh-login-modal-header p {
                    margin: 0;
                    color: rgba(0, 0, 0, 0.5);
                    font-size: 14px;
                }

                .boh-login-form .boh-form-group {
                    margin-bottom: 20px;
                }

                .boh-login-form label {
                    display: block;
                    margin-bottom: 8px;
                    color: #515154;
                    font-size: 14px;
                    font-weight: 500;
                }

                .boh-login-form input {
                    width: 100%;
                    padding: 14px 16px;
                    background: rgba(118, 75, 162, 0.05);
                    border: 2px solid rgba(102, 126, 234, 0.2);
                    border-radius: 12px;
                    font-size: 16px;
                    color: #1d1d1f;
                    transition: all 0.3s ease;
                    box-sizing: border-box;
                }

                .boh-login-form input:focus {
                    outline: none;
                    border-color: #667eea;
                    box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.15);
                    background: rgba(118, 75, 162, 0.08);
                }

                .boh-login-form input::placeholder {
                    color: rgba(0, 0, 0, 0.3);
                }

                .boh-password-wrap {
                    position: relative;
                }

                .boh-toggle-password {
                    position: absolute;
                    right: 12px;
                    top: 50%;
                    transform: translateY(-50%);
                    background: rgba(102, 126, 234, 0.1);
                    border: none;
                    color: #667eea;
                    cursor: pointer;
                    font-size: 13px;
                    padding: 6px 12px;
                    border-radius: 8px;
                    transition: all 0.3s ease;
                }

                .boh-toggle-password:hover {
                    background: rgba(102, 126, 234, 0.2);
                }

                .boh-error-message {
                    color: #ff5555;
                    font-size: 12px;
                    margin-top: 6px;
                    display: none;
                }

                .boh-auth-error {
                    color: #ff5555;
                    font-size: 13px;
                    text-align: center;
                    margin-bottom: 15px;
                    display: none;
                    padding: 10px;
                    background: rgba(255, 85, 85, 0.1);
                    border-radius: 8px;
                }

                input.boh-invalid + .boh-error-message {
                    display: block;
                }

                .boh-form-links {
                    display: flex;
                    justify-content: space-between;
                    margin: 15px 0 25px;
                    font-size: 13px;
                }

                .boh-form-links a {
                    color: #667eea;
                    text-decoration: none;
                    transition: all 0.3s ease;
                }

                .boh-form-links a:hover {
                    color: #764ba2;
                    text-decoration: underline;
                }

                .boh-login-btn {
                    width: 100%;
                    padding: 14px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    border-radius: 12px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    letter-spacing: 1px;
                }

                .boh-login-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
                }

                .boh-login-btn:disabled {
                    opacity: 0.7;
                    cursor: not-allowed;
                    transform: none;
                }

                /* 响应式 */
                @media (max-width: 480px) {
                    .boh-login-modal-container {
                        margin: 15px;
                        padding: 30px 20px;
                    }
                    
                    .boh-form-links {
                        flex-direction: column;
                        gap: 10px;
                        text-align: center;
                    }
                }
            `;
    }

    // 绑定事件
    bindEvents() {
      if (!this.modal) return;

      const form = document.getElementById("boh-login-form");
      const closeBtn = document.getElementById("boh-modal-close");
      const togglePassword = document.getElementById("boh-toggle-password");
      const passwordInput = document.getElementById("boh-password");
      const usernameInput = document.getElementById("boh-username");
      const authError = document.getElementById("boh-auth-error");

      // 关闭弹窗
      closeBtn.addEventListener("click", () => this.hide());
      this.modal.addEventListener("click", (e) => {
        if (e.target === this.modal) this.hide();
      });

      // ESC键关闭
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.isShown) {
          this.hide();
        }
      });

      // 密码显示/隐藏
      togglePassword.addEventListener("click", () => {
        const type = passwordInput.type === "password" ? "text" : "password";
        passwordInput.type = type;
        togglePassword.textContent = type === "password" ? "显示" : "隐藏";
      });

      // 表单提交
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleLogin(form, usernameInput, passwordInput, authError);
      });

      // 输入时移除错误状态
      [usernameInput, passwordInput].forEach((input) => {
        input.addEventListener("input", () => {
          input.classList.remove("boh-invalid");
          authError.style.display = "none";
        });
      });

      // 忘记密码提示
      document
        .querySelector(".boh-forgot-password")
        .addEventListener("click", (e) => {
          e.preventDefault();
          alert("由于技术限制，请联系网站开发者解决该问题。");
        });
    }

    // 处理登录 - 使用unified-nav.js中的AuthManager
    handleLogin(form, usernameInput, passwordInput, authError) {
      const username = usernameInput.value;
      const password = passwordInput.value;
      const loginBtn = form.querySelector(".boh-login-btn");

      let isValid = true;

      // 表单验证
      if (!username.trim()) {
        usernameInput.classList.add("boh-invalid");
        isValid = false;
      } else {
        usernameInput.classList.remove("boh-invalid");
      }

      if (!password.trim() || password.length < 6) {
        passwordInput.classList.add("boh-invalid");
        isValid = false;
      } else {
        passwordInput.classList.remove("boh-invalid");
      }

      authError.style.display = "none";

      if (!isValid) return;

      // 执行登录
      loginBtn.disabled = true;
      loginBtn.textContent = "登录中...";

      try {
        // 验证账号密码
        const matchedAccount = AUTH_CONFIG.VALID_ACCOUNTS.find(
          (account) =>
            account.username === username && account.password === password
        );

        if (matchedAccount) {
          // 登录成功，使用unified-nav.js中的AuthManager
          if (typeof window.AuthManager !== "undefined") {
            // 如果AuthManager全局可用，直接使用
            window.AuthManager.login(username);
          } else {
            // 否则直接设置localStorage
            localStorage.setItem("isLoggedIn", "true");
            localStorage.setItem("username", username);
            // 触发登录成功事件
            window.dispatchEvent(
              new CustomEvent("userLogin", {
                detail: { username: username },
              })
            );
          }

          // 登录成功
          this.hide();
          form.reset();
        } else {
          // 登录失败
          throw new Error("用户名或密码错误");
        }
      } catch (error) {
        authError.textContent = error.message;
        authError.style.display = "block";
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = "登录方块之家";
      }
    }

    // 显示弹窗
    show() {
      if (!this.modal) return;
      this.modal.style.display = "flex";
      this.isShown = true;
      document.body.style.overflow = "hidden";

      // 清空表单和错误状态
      const form = document.getElementById("boh-login-form");
      if (form) {
        form.reset();
      }
      document.getElementById("boh-auth-error").style.display = "none";
      document.getElementById("boh-username").classList.remove("boh-invalid");
      document.getElementById("boh-password").classList.remove("boh-invalid");
    }

    // 隐藏弹窗
    hide() {
      if (!this.modal) return;
      this.modal.style.display = "none";
      this.isShown = false;
      document.body.style.overflow = "";
    }

    // 检查是否显示
    isModalShown() {
      return this.isShown;
    }
  }

  // 页面加载完成后初始化
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      // 创建登录弹窗管理器实例
      const modalManager = new LoginModalManager();

      // 绑定登录按钮事件
      const bindLoginButton = () => {
        const loginBtn = document.getElementById("nav-login-btn");
        if (loginBtn) {
          loginBtn.addEventListener("click", (e) => {
            e.preventDefault();
            modalManager.show();
          });
        }
      };

      bindLoginButton();
    });
  } else {
    // 创建登录弹窗管理器实例
    const modalManager = new LoginModalManager();

    // 绑定登录按钮事件
    const bindLoginButton = () => {
      const loginBtn = document.getElementById("nav-login-btn");
      if (loginBtn) {
        loginBtn.addEventListener("click", (e) => {
          e.preventDefault();
          modalManager.show();
        });
      }
    };

    bindLoginButton();
  }
})(typeof window !== "undefined" ? window : this);
