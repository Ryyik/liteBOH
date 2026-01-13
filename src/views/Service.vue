<template>
  <div class="service-page">
    <!-- 统一导航栏 -->
    <UnifiedNavbar />

    <!-- 英雄区 - 三个英雄板块 -->
    <div id="fullheader" class="fullheader">
      <!-- 英雄板块1：探索游戏服务器 -->
      <section class="hero-section glass-ui">
        <div class="hero-content">
          <h1 class="hero-title">探索游戏服务器</h1>
          <p class="hero-description">
            加入我们的游戏服务器，体验不一样的方块世界，与其他玩家一起探索、建造和冒险。
          </p>
          <div class="hero-buttons">
            <button @click="showServerPopup = true" class="hero-button">
              立即加入
            </button>
          </div>
        </div>
      </section>

      <!-- 英雄板块2：方块社群服务 -->
      <section class="hero-section glass-ui">
        <div class="hero-content">
          <h1 class="hero-title">方块社群服务</h1>
          <p class="hero-description">
            加入我们的社群，参与各种活动，与其他玩家交流互动，共同成长。
          </p>
          <div class="hero-buttons">
            <router-link to="/about" class="hero-button">
              了解社群
            </router-link>
          </div>
        </div>
      </section>

      <!-- 英雄板块3：个人服务中心 -->
      <section class="hero-section glass-ui">
        <div class="hero-content">
          <h1 class="hero-title">个人服务中心</h1>
          <p class="hero-description">
            探索您的MBTI性格类型，关注身心健康，记录您的健康数据。
          </p>
          <div class="hero-buttons">
            <router-link to="/mbti" class="hero-button"> 方块MBTI </router-link>
            <router-link to="/health" class="hero-button">
              方块健康
            </router-link>
          </div>
        </div>
      </section>
    </div>

    <!-- 服务器上线弹窗 -->
    <div
      class="popup-overlay"
      v-if="showServerPopup"
      @click="showServerPopup = false"
    >
      <div class="popup-content" @click.stop>
        <button class="popup-close" @click="showServerPopup = false">×</button>
        <h2>方块之家服务器上线预告</h2>
        <p>方块之家服务器将于1月底上线，具体上线日期待公布。</p>
        <p>敬请期待</p>
        <button class="popup-button" @click="showServerPopup = false">
          确定
        </button>
      </div>
    </div>

    <!-- 页脚 -->
    <Footer />
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import UnifiedNavbar from "../components/UnifiedNavbar.vue";
import Footer from "../components/Footer.vue";

// 服务器上线弹窗状态
const showServerPopup = ref(false);

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
/* 基础样式重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.service-page {
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
  margin: 0;
  padding: 0;
  /* 移除背景图片，改为纯色背景 */
  background: #000000;
  min-height: 100vh;
  color: #fff;
  line-height: 1.6;
  opacity: 0;
  animation: fadeIn 0.8s forwards;
}

/* 玻璃UI效果 - 英雄区块 */
.glass-ui {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

/* 英雄区容器 - 与首页保持一致 */
.fullheader {
  position: relative;
  z-index: 1;
}

/* 英雄板块样式 - 与首页保持一致 */
.hero-section {
  /* 确保英雄区占满视口高度和宽度，无黑边 */
  min-height: 100vh;
  width: 100%;
  /* 横屏设备保持原有margin */
  margin: 0 0 40px 0;
  padding: 0;
  padding-top: 64px; /* 仅顶部留足够空间避免被导航栏遮挡 */
  /* 背景图片样式 - 完全覆盖容器，无黑边 */
  background-size: cover;
  background-position: center center;
  background-repeat: no-repeat;
  /* 确保英雄区有默认的背景色，防止图片加载前黑屏 */
  background-color: #000;
  /* 弹性布局，居中内容 */
  display: flex;
  align-items: center;
  justify-content: center;
  /* 文字颜色 */
  color: white;
  /* 初始状态：不透明，确保可见 */
  opacity: 1 !important;
  transform: translateY(0) !important;
  /* 移除过渡动画，确保立即显示 */
  transition: none;
  /* 确保英雄区显示在其他内容之上 */
  position: relative;
  z-index: 10;
}

/* 手机端设备样式 - 在所有手机尺寸上改变英雄页高度 */
@media (max-width: 768px) {
  /* 确保英雄区在手机端显示，减少高度 */
  .hero-section {
    /* 减少手机端英雄页高度，让三个英雄页在一个界面中 */
    min-height: calc(30vh - 20px);
    height: calc(30vh - 20px);
    max-height: calc(30vh - 20px);
    /* 移除顶部padding，改为margin-top */
    padding-top: 0;
    /* 英雄页之间保持一致的空隙，与顶部和导航栏间距相同 */
    margin: 10px 0;
    /* 确保图片内容完整显示 */
    background-position: center center;
    /* 移除黑色背景，解决竖屏黑色块问题 */
    background-color: transparent !important;
  }

  /* 第一个英雄页特殊处理，与导航栏保持相同间距 */
  .hero-section:first-child {
    margin-top: 64px;
  }

  /* 最后一个英雄页移除底部margin */
  .hero-section:last-child {
    margin-bottom: 64px;
  }
}

/* 确保英雄区内容容器 - 与首页保持一致 */
.hero-content {
  text-align: center;
  max-width: 1200px;
  width: 100%;
  padding: 0 20px;
  /* 确保内容显示在背景图片之上 */
  position: relative;
  z-index: 20;
  /* 确保内容在竖屏设备上也能良好显示 */
  flex-shrink: 0;
  /* 确保文字始终在英雄页的中心 */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  /* 确保内容容器高度足够，能够居中显示 */
  min-height: calc(100vh - 64px); /* 减去导航栏高度 */
}

/* 英雄区标题 - 与首页保持一致 */
.hero-title {
  font-size: 4rem;
  font-weight: 700;
  margin-bottom: 2rem;
  line-height: 1.2;
  /* 移除animation属性，避免冲突 */
  color: white;
}

/* 英雄区描述 - 与首页保持一致 */
.hero-description {
  font-size: 1.5rem;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 2rem;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
}

/* 英雄区按钮容器 - 与首页保持一致 */
.hero-buttons {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
  /* 移除animation属性，避免冲突 */
}

/* 英雄区按钮样式 - 与首页保持一致 */
.hero-button {
  color: white;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 15px;
  padding: 10px 20px;
  text-decoration: none;
  transition: all 0.3s ease;
  display: inline-block;
  max-width: fit-content;
  width: auto;
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
}

/* 英雄区按钮悬停效果 - 与首页保持一致 */
.hero-button:hover {
  background: rgba(255, 255, 255, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.4);
  transform: scale(1.05);
  color: white;
  text-decoration: none;
}

/* 服务器上线弹窗样式 */
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.popup-content {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  padding: 40px;
  max-width: 500px;
  width: 90%;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  position: relative;
}

.popup-close {
  position: absolute;
  top: 15px;
  right: 15px;
  width: 30px;
  height: 30px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.popup-close:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.1);
}

.popup-content h2 {
  font-size: 24px;
  margin-bottom: 20px;
  color: #fff;
}

.popup-content p {
  font-size: 16px;
  margin-bottom: 20px;
  color: rgba(255, 255, 255, 0.8);
}

.popup-button {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  padding: 10px 30px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.popup-button:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}

/* 毛玻璃效果容器 */
.content-container {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  margin: 0 auto 50px;
  padding: 60px 40px;
  max-width: 1200px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  position: relative;
  z-index: 10;
}

/* 服务卡片毛玻璃效果 */
.service-card {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(15px);
  -webkit-backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 30px;
  transition: all 0.3s ease;
  margin-bottom: 30px;
}

.service-card:hover {
  background: rgba(255, 255, 255, 0.12);
  transform: translateY(-5px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
}

/* 全局设置 */
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
}

/* 服务网格布局 */
.services-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 30px;
  margin-top: 40px;
}

/* 服务卡片内容样式 */
.service-icon {
  font-size: 48px;
  margin-bottom: 20px;
}

.service-title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 15px;
  color: #fff;
}

.service-description {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.6;
}

/* 标题样式 */
.section-title {
  font-size: 36px;
  font-weight: 700;
  margin-bottom: 20px;
  color: #fff;
  text-align: center;
}

.section-description {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.8);
  text-align: center;
  max-width: 800px;
  margin: 0 auto;
}

/* 手机端英雄区内容容器高度调整 - 与首页保持一致 */
@media (max-width: 768px) {
  /* 匹配英雄区高度，确保内容垂直居中 */
  .hero-content {
    min-height: 100%;
    height: 100%;
    /* 调整内容间距，适应较小的英雄页高度 */
    gap: 10px;
  }

  /* 调整英雄区标题大小和间距 */
  .hero-title {
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
  }

  /* 调整英雄区描述大小 */
  .hero-description {
    font-size: 1rem;
    margin-bottom: 1rem;
  }

  /* 调整英雄区按钮大小 */
  .hero-button {
    padding: 8px 16px;
    font-size: 0.9rem;
  }

  /* 确保英雄区按钮始终并排显示 */
  .hero-buttons {
    gap: 0.8rem;
    /* 强制使用flex布局，并排显示 */
    display: flex !important;
    flex-direction: row !important;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
  }
}

/* 小屏幕手机端进一步调整 */
@media (max-width: 480px) {
  /* 进一步调整标题大小 */
  .hero-title {
    font-size: 2rem;
  }
}
</style>
