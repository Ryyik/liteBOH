<template>
  <div class="login-page">
    <!-- 登录容器 -->
    <div class="login-container">
      <div class="login-header">
        <h2>登录</h2>
        <p>欢迎回到方块之家</p>
      </div>

      <div class="login-form">
        <form @submit.prevent="handleLogin">
          <div class="form-group">
            <label for="username">用户名</label>
            <input
              type="text"
              id="username"
              v-model="username"
              placeholder="请输入用户名"
              required
            />
          </div>

          <div class="form-group">
            <label for="password">密码</label>
            <input
              type="password"
              id="password"
              v-model="password"
              placeholder="请输入密码"
              required
            />
          </div>

          <div class="form-options">
            <div class="remember-me">
              <input type="checkbox" id="remember" v-model="rememberMe" />
              <label for="remember">记住我</label>
            </div>

            <div class="forgot-password">
              <a href="#">忘记密码?</a>
            </div>
          </div>

          <button type="submit" class="login-button">登录</button>
        </form>
      </div>

      <div class="login-footer">
        <p>还没有账号? <router-link to="/register">立即注册</router-link></p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
// 导入统一认证管理器
import "../utils/auth-manager.js";

const router = useRouter();

// 表单数据
const username = ref("");
const password = ref("");
const rememberMe = ref(false);

// 处理登录
const handleLogin = () => {
  // 使用统一认证管理器处理登录
  const result = window.AuthManager.login(username.value, password.value);

  if (result.success) {
    // 登录成功后跳转到首页
    router.push("/");
  } else {
    alert(result.message);
  }
};

onMounted(() => {
  // 初始化AOS动画
  if (typeof AOS !== "undefined") {
    AOS.init({
      duration: 800,
    });
  }

  // 添加页面加载完成类
  document.body.classList.add("is-loaded");
});
</script>

<style scoped>
.login-page {
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
  margin: 0;
  padding: 0;
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  min-height: 100vh;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 登录容器样式 */
.login-container {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 40px;
  max-width: 450px;
  width: 100%;
  margin: 50px 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

/* 登录头部样式 */
.login-header {
  text-align: center;
  margin-bottom: 30px;
}

.login-header h2 {
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 10px;
  color: #fff;
}

.login-header p {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.8);
  margin: 0;
}

/* 表单样式 */
.login-form {
  margin-bottom: 20px;
}

.form-group {
  margin-bottom: 25px;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
  color: rgba(255, 255, 255, 0.9);
}

.form-group input {
  width: 100%;
  padding: 12px 15px;
  font-size: 16px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.form-group input:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.15);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.1);
}

.form-group input::placeholder {
  color: rgba(255, 255, 255, 0.5);
}

/* 表单选项 */
.form-options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
  font-size: 14px;
}

.remember-me {
  display: flex;
  align-items: center;
  gap: 8px;
}

.remember-me input[type="checkbox"] {
  accent-color: rgba(255, 255, 255, 0.3);
  width: 16px;
  height: 16px;
}

.remember-me label {
  margin: 0;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.8);
}

.forgot-password a {
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  transition: color 0.3s ease;
}

.forgot-password a:hover {
  color: #fff;
  text-decoration: underline;
}

/* 登录按钮 */
.login-button {
  width: 100%;
  padding: 14px;
  font-size: 16px;
  font-weight: 600;
  color: #000;
  background: #fff;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.login-button:hover {
  background: rgba(255, 255, 255, 0.9);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(255, 255, 255, 0.2);
}

.login-button:active {
  transform: translateY(0);
}

/* 登录底部 */
.login-footer {
  text-align: center;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
}

.login-footer a {
  color: #fff;
  text-decoration: none;
  font-weight: 500;
  transition: text-decoration 0.3s ease;
}

.login-footer a:hover {
  text-decoration: underline;
}

/* 响应式设计 */
@media (max-width: 480px) {
  .login-container {
    padding: 30px 20px;
    margin: 30px 15px;
  }

  .login-header h2 {
    font-size: 28px;
  }

  .form-options {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
  }
}
</style>
