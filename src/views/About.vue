<template>
  <div class="about-page">
    <!-- 统一导航栏 -->
    <UnifiedNavbar />

    <!-- 关于我们 - 简化版本，移除所有可能导致问题的元素 -->
    <div class="about-container">
      <!-- 头部区域 -->
      <div
        class="about-header"
        :data-bg-img="getImageUrl('@/assets/images/main1.webp')"
        ref="aboutHeader"
      >
        <div class="about-header-content">
          <h2>关于我们</h2>
        </div>
      </div>

      <!-- 内容区域 -->
      <div class="about-content">
        <div class="about-section">
          <h3>何为方块之家？</h3>
          <p>
            方块之家创立于 2018 年 Hypixel
            网易服务器时期，是一个以MC为核心，融合生活分享、游戏互动与休闲交流的多元社群。社群官网地址为：www.blockofhome.cn，抖音搜索方块之家~<br /><br />
            日常运营中，我们会定期开展丰富活动，涵盖服务器整合包生存、成员生日会、新年
            / 元旦主题活动、福利抽奖，以及每年 7 月 21
            日的周年庆等；过往活动的记录，大家可在群公告中查阅。<br /><br />
            在这，你可以自由分享
            MC相关的创作内容（如建筑、模组、玩法攻略等），也能交流任何日常、生活趣事
            —— 期待每一位成员在这里找到同好，有良好的游玩体验~
          </p>
        </div>

        <div class="about-feature">
          <div class="feature-image">
            <picture>
              <source :srcset="getImageUrl('@/assets/images/Writable_Book.webp')" type="image/webp" />
              <img
                :src="getImageUrl('@/assets/images/Writable_Book.png')"
                alt="方块之家纪念册"
                loading="lazy"
                decoding="async"
                fetchpriority="low"
                sizes="(max-width: 768px) 90vw, 480px"
              />
            </picture>
          </div>
          <div class="feature-content">
            <h3>你好，欢迎加入 <strong>方块之家</strong></h3>
            <p>方块之家纪念册现已推出。</p>
            <button @click="showPopup = true" class="feature-button">
              了解方块之家的内核
            </button>

            <!-- 弹窗 -->
            <div
              v-if="showPopup"
              class="popup-overlay"
              @click="showPopup = false"
            >
              <div class="popup-modal" @click.stop>
                <div class="popup-content">
                  <h3>方块之家内核</h3>
                  <p>页面推出时间视情况而定</p>
                  <button @click="showPopup = false" class="popup-close">
                    关闭
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 页脚 -->
    <Footer />
  </div>
</template>

<script setup>
import { onMounted, ref, onUnmounted } from "vue";
import UnifiedNavbar from "../components/UnifiedNavbar.vue";
import Footer from "../components/Footer.vue";
import { getImageUrl } from "../utils/asset-helper.js";

// 弹窗状态管理
const showPopup = ref(false);
const aboutHeader = ref(null);

// 背景图片懒加载
const loadBackgroundImage = (sectionRef, imgSrc) => {
  if (!sectionRef || !imgSrc) return;
  const useWebP = document.documentElement.classList.contains("webp-support");
  let imageUrl = getImageUrl(imgSrc);
  if (useWebP) {
    imageUrl = imageUrl.replace(/\.(png|jpg|jpeg)$/i, ".webp");
  }
  const img = new Image();
  img.onload = () => {
    sectionRef.style.backgroundImage = `url('${imageUrl}')`;
    sectionRef.style.backgroundSize = "cover";
    sectionRef.style.backgroundPosition = "center center";
    sectionRef.style.backgroundRepeat = "no-repeat";
  };
  img.onerror = () => {
    if (useWebP) {
      const fallbackImg = new Image();
      fallbackImg.onload = () => {
        sectionRef.style.backgroundImage = `url('${imgSrc}')`;
        sectionRef.style.backgroundSize = "cover";
        sectionRef.style.backgroundPosition = "center center";
        sectionRef.style.backgroundRepeat = "no-repeat";
      };
      fallbackImg.src = imgSrc;
    }
  };
  img.src = imageUrl;
};

// 懒加载背景图片
const lazyLoadBackgroundImages = () => {
  if (typeof window !== 'undefined' && window.IntersectionObserver) {
    const options = {
      root: null,
      rootMargin: '200px',
      threshold: 0
    };
    
    window.aboutHeaderObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const section = entry.target;
          const imgSrc = section.getAttribute('data-bg-img');
          if (imgSrc) {
            loadBackgroundImage(section, imgSrc);
          }
          window.aboutHeaderObserver.unobserve(section);
        }
      });
    }, options);
    
    // 观察头部区域
    if (aboutHeader.value) {
      window.aboutHeaderObserver.observe(aboutHeader.value);
    }
  } else {
    // 降级处理：直接加载首屏图片
    if (aboutHeader.value) {
      const imgSrc = aboutHeader.value.getAttribute('data-bg-img');
      if (imgSrc) {
        loadBackgroundImage(aboutHeader.value, imgSrc);
      }
    }
  }
};

onMounted(() => {
  // 添加页面加载完成类
  document.body.classList.add("is-loaded");
  
  // 懒加载背景图片
  lazyLoadBackgroundImages();
});

onUnmounted(() => {
  // 清理资源
  if (window.aboutHeaderObserver) {
    window.aboutHeaderObserver.disconnect();
  }
});
</script>

<style scoped>
/* 关于我们页面基础样式 */
.about-page {
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
  margin: 0;
  padding: 0;
  background: #000000;
  min-height: 100vh;
  color: #fff;
  line-height: 1.6;
  opacity: 1;
  visibility: visible;
}

/* 确保导航栏层级 */
#unified-nav-container {
  z-index: 9999;
}

/* 主要容器 */
.about-container {
  width: 100%;
  min-height: calc(100vh - 100px);
  display: flex;
  flex-direction: column;
  background: #000;
}

/* 头部区域 */
.about-header {
  position: relative;
  height: 60vh;
  background-size: cover;
  background-position: center center;
  background-repeat: no-repeat;
  background-color: #000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.about-header::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1;
}

.about-header-content {
  position: relative;
  z-index: 2;
  text-align: center;
}

.about-header h2 {
  font-size: 3rem;
  font-weight: 700;
  color: white;
  margin: 0;
}

/* 内容区域 */
.about-content {
  padding: 60px 20px;
  background: #000;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 60px;
}

/* 关于我们介绍 */
.about-section {
  max-width: 1200px;
  margin: 0 auto;
  text-align: center;
}

.about-section h3 {
  font-size: 2rem;
  color: white;
  margin-bottom: 30px;
  font-weight: 600;
}

.about-section p {
  font-size: 1.2rem;
  line-height: 2;
  color: rgba(255, 255, 255, 0.9);
  margin: 0;
}

/* 特色区域 */
.about-feature {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  gap: 40px;
  align-items: center;
  justify-content: center;
}

.feature-image {
  width: 100%;
  max-width: 500px;
  flex: 1;
}

.feature-image img {
  width: 100%;
  height: auto;
  border-radius: 8px;
  display: block;
}

.feature-content {
  width: 100%;
  max-width: 500px;
  flex: 1;
  text-align: center;
}

.feature-content h3 {
  font-size: 2rem;
  color: white;
  margin-bottom: 20px;
  font-weight: 600;
}

.feature-content h3 strong {
  color: #007aff;
}

.feature-content p {
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 30px;
}

.feature-button {
  display: inline-block;
  padding: 12px 24px;
  color: white;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 15px;
  text-decoration: none;
  transition: all 0.3s ease;
  font-size: 1.1rem;
  font-weight: 500;
}

.feature-button:hover {
  background: rgba(255, 255, 255, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.4);
  transform: scale(1.05);
  color: white;
  text-decoration: none;
}

/* 弹窗样式 - 简约毛玻璃UI */
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  animation: fadeIn 0.3s ease-out;
}

.popup-modal {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 12px;
  padding: 2rem 1.5rem;
  max-width: 450px;
  width: 90%;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  animation: scaleIn 0.3s ease-out;
  border: 1px solid rgba(255, 255, 255, 0.3);
  position: relative;
}

.popup-content {
  position: relative;
}

.popup-content h3 {
  font-size: 1.5rem;
  color: #333;
  margin-bottom: 1rem;
  font-weight: 600;
  letter-spacing: -0.3px;
}

.popup-content p {
  font-size: 1rem;
  color: #666;
  margin-bottom: 1.8rem;
  line-height: 1.5;
}

.popup-close {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(15px);
  -webkit-backdrop-filter: blur(15px);
  color: #333;
  border: 1px solid rgba(255, 255, 255, 0.5);
  padding: 0.6rem 1.5rem;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.popup-close:hover {
  background: rgba(255, 255, 255, 1);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  transform: translateY(-1px);
}

/* 弹窗动画 */
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* 响应式弹窗 */
@media (max-width: 768px) {
  .popup-modal {
    padding: 1.8rem 1.2rem;
    border-radius: 10px;
  }

  .popup-content h3 {
    font-size: 1.3rem;
  }

  .popup-content p {
    font-size: 0.95rem;
    margin-bottom: 1.5rem;
  }

  .popup-close {
    padding: 0.5rem 1.3rem;
    font-size: 0.85rem;
  }
}

@media (max-width: 480px) {
  .popup-modal {
    padding: 1.5rem 1rem;
    border-radius: 8px;
    width: 95%;
  }

  .popup-content h3 {
    font-size: 1.2rem;
  }

  .popup-content p {
    font-size: 0.9rem;
    margin-bottom: 1.3rem;
  }

  .popup-close {
    padding: 0.4rem 1.1rem;
    font-size: 0.8rem;
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .about-header h2 {
    font-size: 2rem;
  }

  .about-section h3 {
    font-size: 1.5rem;
  }

  .about-section p {
    font-size: 1rem;
    line-height: 1.8;
  }

  .feature-content h3 {
    font-size: 1.5rem;
  }

  .about-content {
    padding: 40px 20px;
    gap: 40px;
  }
}

@media (max-width: 480px) {
  .about-header {
    height: 40vh;
  }

  .about-header h2 {
    font-size: 1.5rem;
  }

  .feature-image {
    max-width: 100%;
  }

  .feature-content {
    max-width: 100%;
  }
}
</style>
