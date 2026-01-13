<template>
  <div class="game-page">
    <!-- 统一导航栏 -->
    <UnifiedNavbar />

    <!-- 主内容区域 -->
    <div class="game-main">
      <!-- 英雄页1：Apple极简大文字 -->
      <section class="hero-section hero-1">
        <div class="hero-content">
          <h1 class="hero-title apple-style" ref="title1">方块之家</h1>
          <p class="hero-subtitle">游戏服务器</p>
        </div>
      </section>

      <!-- 文字内容1 -->
      <section class="text-section">
        <div class="text-content">
          <h2 class="text-title">欢迎来到方块之家</h2>
          <p class="text-paragraph">
            在这里，你可以与全球玩家一起探索无限可能的方块世界。我们提供稳定、安全、有趣的游戏环境，让你尽情享受游戏的乐趣。
          </p>
        </div>
      </section>

      <!-- 英雄页2：3D文字动画 -->
      <section class="hero-section hero-2">
        <div class="hero-content">
          <h1 class="hero-title text-3d" ref="text3d">探索无限</h1>
        </div>
      </section>

      <!-- 文字内容2 -->
      <section class="text-section">
        <div class="text-content">
          <h2 class="text-title">多样化的游戏模式</h2>
          <p class="text-paragraph">
            从生存模式到创造模式，从服务器活动到私人游戏，我们提供多样化的游戏体验，满足不同玩家的需求。
          </p>
        </div>
      </section>

      <!-- 英雄页3：3D文字动画 -->
      <section class="hero-section hero-3">
        <div class="hero-content">
          <h1 class="hero-title text-3d" ref="text3d2">创造未来</h1>
        </div>
      </section>

      <!-- 文字内容3 -->
      <section class="text-section">
        <div class="text-content">
          <h2 class="text-title">加入我们</h2>
          <p class="text-paragraph">
            点击下方按钮，立即加入我们的游戏服务器，开始你的方块冒险之旅吧！
          </p>
          <div class="join-button-container">
            <a href="#" class="join-button">立即加入</a>
          </div>
        </div>
      </section>
    </div>

    <!-- 页脚 -->
    <Footer />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import UnifiedNavbar from "../components/UnifiedNavbar.vue";
import Footer from "../components/Footer.vue";

// 文字元素引用
const title1 = ref(null);
const text3d = ref(null);
const text3d2 = ref(null);
let scrollListener = null;

// 滚动监听事件 - 文字动画
const handleScroll = () => {
  // 获取页面滚动位置
  const scrollY = window.scrollY;
  const windowHeight = window.innerHeight;

  // 处理第一个英雄标题：滚动缩放效果
  if (title1.value) {
    const elementTop = title1.value.offsetTop;
    const elementHeight = title1.value.offsetHeight;

    // 计算滚动进度：从元素顶部进入视口到完全离开视口
    const startScroll = elementTop - windowHeight;
    const endScroll = elementTop + elementHeight;
    const progress = Math.max(
      0,
      Math.min(1, (scrollY - startScroll) / (endScroll - startScroll))
    );

    // 初始字体大小（超大）和目标字体大小（正常）
    const initialSize = window.innerWidth <= 768 ? 10 : 20; // 响应式初始大小
    const targetSize = window.innerWidth <= 768 ? 4 : 8; // 响应式目标大小

    // 计算当前字体大小：从超大到正常的平滑过渡
    const currentSize = initialSize - (initialSize - targetSize) * progress;

    title1.value.style.fontSize = `${currentSize}rem`;

    // 计算透明度变化
    const opacity = 1 - progress * 0.2;
    title1.value.style.opacity = opacity;
  }

  // 处理第一个3D文字
  if (text3d.value) {
    const elementTop = text3d.value.offsetTop;
    const elementHeight = text3d.value.offsetHeight;
    const elementCenter = elementTop + elementHeight / 2;
    const viewportCenter = scrollY + windowHeight / 2;

    // 计算文字旋转角度
    const distance = Math.abs(viewportCenter - elementCenter);
    const maxDistance = windowHeight;
    const rotation = (distance / maxDistance) * 30 - 15;

    text3d.value.style.transform = `perspective(1000px) rotateX(${rotation}deg) rotateY(${
      rotation / 2
    }deg)`;
  }

  // 处理第二个3D文字
  if (text3d2.value) {
    const elementTop = text3d2.value.offsetTop;
    const elementHeight = text3d2.value.offsetHeight;
    const elementCenter = elementTop + elementHeight / 2;
    const viewportCenter = scrollY + windowHeight / 2;

    // 计算文字旋转角度
    const distance = Math.abs(viewportCenter - elementCenter);
    const maxDistance = windowHeight;
    const rotation = (distance / maxDistance) * 30 - 15;

    text3d2.value.style.transform = `perspective(1000px) rotateX(${-rotation}deg) rotateY(${
      rotation / 2
    }deg)`;
  }
};

onMounted(() => {
  // 添加滚动监听
  window.addEventListener("scroll", handleScroll);

  // 初始化AOS动画
  if (typeof AOS !== "undefined") {
    AOS.init({
      duration: 1000,
      easing: "ease-out",
    });
  }

  // 添加页面加载完成类
  document.body.classList.add("is-loaded");
});

onUnmounted(() => {
  // 移除滚动监听
  window.removeEventListener("scroll", handleScroll);
});
</script>

<style scoped>
/* 基础样式 */
.game-page {
  font-family: "PingFang SC", "Helvetica Neue", Arial, sans-serif;
  margin: 0;
  padding: 0;
  background-color: #f5f5f7;
  color: #1d1d1f;
  line-height: 1.6;
  overflow-x: hidden;
}

.game-main {
  width: 100%;
}

/* 英雄页样式 */
.hero-section {
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.hero-1 {
  background: linear-gradient(135deg, #f5f5f7 0%, #ffffff 100%);
}

.hero-2 {
  background: linear-gradient(135deg, #000000 0%, #1d1d1f 100%);
  color: #ffffff;
}

.hero-3 {
  background: linear-gradient(135deg, #ffffff 0%, #f5f5f7 100%);
}

.hero-content {
  text-align: center;
  z-index: 2;
}

/* Apple极简大文字风格 */
.apple-style {
  font-size: 8rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
  margin: 0;
  color: #1d1d1f;
  opacity: 0;
  animation: fadeInUp 1s ease-out 0.5s forwards;
}

.hero-subtitle {
  font-size: 2rem;
  font-weight: 400;
  margin: 1rem 0 0;
  color: #86868b;
  opacity: 0;
  animation: fadeInUp 1s ease-out 1s forwards;
}

/* 3D文字样式 */
.text-3d {
  font-size: 8rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
  margin: 0;
  opacity: 0;
  animation: fadeInUp 1s ease-out 0.5s forwards;
  transition: transform 0.3s ease;
  transform-style: preserve-3d;
}

.hero-2 .text-3d {
  color: #ffffff;
}

/* 文字内容区域 */
.text-section {
  width: 100%;
  padding: 100px 20px;
  background-color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.text-content {
  max-width: 800px;
  text-align: center;
  opacity: 0;
  animation: fadeInUp 1s ease-out forwards;
  animation-delay: 0.2s;
}

.text-title {
  font-size: 3rem;
  font-weight: 600;
  margin-bottom: 2rem;
  color: #1d1d1f;
  letter-spacing: -0.01em;
}

.text-paragraph {
  font-size: 1.25rem;
  line-height: 1.8;
  color: #6e6e73;
  margin: 0;
}

/* 加入按钮 */
.join-button-container {
  margin-top: 3rem;
}

.join-button {
  display: inline-block;
  padding: 16px 40px;
  font-size: 1.25rem;
  font-weight: 600;
  text-decoration: none;
  color: #ffffff;
  background-color: #0071e3;
  border-radius: 25px;
  transition: all 0.3s ease;
  opacity: 0;
  animation: fadeInUp 1s ease-out 0.5s forwards;
}

.join-button:hover {
  background-color: #0077ed;
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 113, 227, 0.3);
}

/* 动画效果 */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 滚动动画 */
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .apple-style,
  .text-3d {
    font-size: 4rem;
  }

  .hero-subtitle {
    font-size: 1.5rem;
  }

  .text-title {
    font-size: 2rem;
  }

  .text-paragraph {
    font-size: 1rem;
  }

  .text-section {
    padding: 60px 20px;
  }
}
</style>
