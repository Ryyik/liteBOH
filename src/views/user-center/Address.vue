<template>
  <div class="address-page">
    <h2 class="page-title">地址管理</h2>

    <div class="address-card">
      <h3 class="card-title">我的地址</h3>

      <div class="security-notice">
        <p>由于网站安全性，网站存储的用户收货地址已删除，但我们仍然在安全的地方存储着用户的地址，你也可以通过下方按钮来提交变更你的地址。</p>
      </div>

      <!-- 变更地址按钮 -->
      <div class="btn-container">
        <a
          href="https://f.wps.cn/g/lEiayVxx/"
          target="_blank"
          class="action-btn change-address-btn"
          >变更/提交你的地址</a
        >
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from "vue";

onMounted(() => {
  // 添加页面加载完成类
  document.body.classList.add("is-loaded");
});
</script>

<style scoped>
.address-page {
  width: 100%;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: #24292e;
  margin: 0 0 24px 0;
  padding-bottom: 12px;
  border-bottom: 1px solid #e1e4e8;
}

.address-card {
  background-color: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.05);
  padding: 30px;
}

.card-title {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 20px 0;
}

/* 安全提示 */
.security-notice {
  background-color: rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 30px;
  text-align: left;
  color: #333;
  line-height: 1.8;
}

.security-notice p {
  margin: 0;
  font-size: 16px;
}

.btn-container {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

.action-btn {
  display: inline-block;
  min-width: 180px;
  padding: 14px 28px;
  text-align: center;
  text-decoration: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 700;
  transition: all 0.2s ease;
  background-color: #007bff;
  color: #ffffff;
  border: none;
}

.action-btn:hover {
  background-color: #0056b3;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3);
}

/* 响应式调整 */
@media (max-width: 768px) {
  .page-title {
    font-size: 20px;
    margin-bottom: 20px;
  }

  .address-card {
    padding: 20px;
  }

  .action-btn {
    width: 100%;
  }
}
</style>
