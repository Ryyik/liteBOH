<template>
  <div class="activities-photo-wall-page">
    <!-- 页面标题 -->
    <div class="page-title">
      <h1>方块之家照片墙</h1>
      <p>记录我们共同度过的美好时光</p>
    </div>

    <!-- 竖屏提示信息 -->
    <div class="rotate-device-message" ref="rotateMessage">
      <div class="rotate-icon">🔄</div>
      <h2>请将手机横过来查看照片墙</h2>
      <p>横屏模式下可以获得最佳浏览体验</p>
    </div>

    <!-- 照片墙容器 -->
    <div class="container photo-wall-container">
      <div class="photo-wall">
        <!-- 活动照片卡片 -->
        <div
          v-for="(activity, index) in activities"
          :key="activity.id"
          class="photo-card"
          :style="getPhotoStyle(index)"
        >
          <div class="photo-frame">
            <div class="photo">
              <img
                :src="getImageUrl(activity.image)"
                :alt="activity.title"
                :data-src="getImageUrl(activity.image)"
                class="img-responsive"
                loading="lazy"
                decoding="async"
                fetchpriority="low"
                sizes="(max-width: 768px) 90vw, (max-width: 1200px) 45vw, 25vw"
              />
            </div>
            <div class="photo-info">
              <h4>{{ activity.date }}</h4>
              <p>{{ activity.title }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";
// 导入本地活动数据
import { activitiesData } from "../../data/activities.js";
import { getImageUrl } from "../../utils/asset-helper.js";

// 竖屏提示信息引用
const rotateMessage = ref(null);

// 使用本地数据
const activities = ref(activitiesData);

// 为照片生成随机样式，实现更杂乱的歪歪扭扭和重叠效果
const getPhotoStyle = (index) => {
  // 生成-15到15度之间的随机旋转角度，增加杂乱感
  const rotate = Math.random() * 30 - 15;
  // 生成-5到5度之间的随机倾斜角度
  const skew = Math.random() * 10 - 5;
  // 生成随机的z-index，使照片有更强的层次感和重叠效果
  const zIndex = Math.floor(Math.random() * activities.value.length);
  // 生成更大范围的随机位置偏移，实现明显的上下交错和重叠
  const translateX = Math.random() * 60 - 30;
  const translateY = Math.random() * 60 - 30;
  // 生成更大范围的随机大小，让照片尺寸差异更明显
  const scale = Math.random() * 0.3 + 0.85;

  return {
    transform: `translate(${translateX}px, ${translateY}px) rotate(${rotate}deg) skew(${skew}deg) scale(${scale})`,
    zIndex: zIndex,
    position: "relative",
    margin: "20px 0",
  };
};

onMounted(() => {
  if (typeof AOS !== "undefined") {
    AOS.init({ duration: 3000, once: true });
  }
  document.body.classList.add("is-loaded");
  document.body.classList.add("page-activities");

  // 竖屏提示信息自动隐藏逻辑
  const hideRotateMessage = () => {
    if (rotateMessage.value) {
      rotateMessage.value.style.display = "none";
    }
  };

  // 检查当前方向，如果是竖屏，2秒后隐藏提示信息
  const checkOrientation = () => {
    if (window.innerHeight > window.innerWidth) {
      // 竖屏状态，2秒后隐藏提示信息
      setTimeout(hideRotateMessage, 2000);
    } else {
      // 横屏状态，立即隐藏提示信息
      hideRotateMessage();
    }
  };

  // 初始检查
  checkOrientation();

  // 监听窗口大小变化，处理方向改变
  window.addEventListener("resize", checkOrientation);

  // 组件卸载时移除事件监听
  onBeforeUnmount(() => {
    window.removeEventListener("resize", checkOrientation);
  });
});
</script>

<style scoped>
/* 页面基础样式 */
.activities-photo-wall-page {
  width: 100%;
  background-color: #ffffff;
  color: #333333;
}

/* 页面标题 */
.page-title {
  text-align: center;
  margin-bottom: 30px;
  padding: 20px;
}

.page-title h1 {
  font-size: 3rem;
  font-weight: 700;
  color: #333333;
  margin-bottom: 10px;
  text-shadow: none;
}

.page-title p {
  font-size: 1.2rem;
  color: rgba(0, 0, 0, 0.7);
}

/* 竖屏提示信息样式 */
.rotate-device-message {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.95);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  text-align: center;
  padding: 20px;
}

.rotate-icon {
  font-size: 80px;
  margin-bottom: 20px;
  animation: rotate 2s infinite linear;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.rotate-device-message h2 {
  font-size: 24px;
  margin-bottom: 10px;
  color: #fff;
}

.rotate-device-message p {
  font-size: 16px;
  color: #ccc;
  margin: 0;
}

/* 照片墙容器 */
.photo-wall-container {
  margin-top: 50px;
}

.photo-wall {
  display: flex;
  flex-wrap: wrap;
  gap: 30px;
  justify-content: center;
  padding: 50px 0;
  min-height: 80vh;
}

/* 照片卡片样式 */
.photo-card {
  position: relative;
  width: 250px;
  height: 300px;
  margin: 10px;
  cursor: pointer;
  transition: all 0.3s ease;
  perspective: 1000px;
}

.photo-card {
  cursor: default;
}

.photo-frame {
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
}

.photo {
  width: 100%;
  height: 80%;
  overflow: hidden;
  position: relative;
}

.photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-info {
  padding: 15px;
  background: rgba(20, 20, 20, 0.8);
  height: 20%;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.photo-info h4 {
  margin: 0 0 5px 0;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.photo-info p {
  margin: 0;
  font-size: 12px;
  color: #8f8f8f;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .page-title h1 {
    font-size: 2rem;
  }

  .page-title p {
    font-size: 1rem;
  }

  .photo-wall {
    padding: 20px 0;
  }

  .photo-card {
    width: 100%;
    max-width: 300px;
    height: 350px;
  }
}

/* 横屏模式下照片墙优化 */
@media (orientation: landscape) {
  /* 隐藏竖屏提示信息 */
  .rotate-device-message {
    display: none;
  }

  .photo-wall-container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px;
    background-color: transparent;
    border-radius: 0;
    box-shadow: none;
  }

  .photo-wall {
    display: flex;
    flex-wrap: wrap;
    gap: 0px;
    justify-content: flex-start;
    align-items: flex-start;
    padding: 80px;
    min-height: 90vh;
    /* 纯色牛皮纸背景 */
    background-color: #f5deb3;
    /* 橡木纹理边框 */
    border: 30px solid;
    border-image: linear-gradient(
        45deg,
        #654321,
        #8b4513,
        #a0522d,
        #654321,
        #8b4513
      )
      1;
    box-shadow: inset 0 0 50px rgba(0, 0, 0, 0.3),
      0 20px 60px rgba(0, 0, 0, 0.8);
    background-clip: padding-box;
    overflow: visible;
  }

  .photo-card {
    width: 280px;
    height: 320px;
    margin: 10px;
  }
}

/* 竖屏模式下的样式 */
@media (orientation: portrait) {
  /* 显示竖屏提示信息 */
  .rotate-device-message {
    display: flex;
  }

  /* 让照片墙容器适应竖屏 */
  .photo-wall-container {
    max-width: 100%;
    margin: 0 auto;
    padding: 10px;
    background-color: transparent;
  }

  /* 照片墙保持横屏布局的基本样式 */
  .photo-wall {
    display: flex;
    flex-wrap: wrap;
    gap: 0px;
    justify-content: flex-start;
    align-items: flex-start;
    padding: 40px 20px;
    min-height: 70vh;
    /* 纯色牛皮纸背景 */
    background-color: #f5deb3;
    /* 橡木纹理边框 */
    border: 20px solid;
    border-image: linear-gradient(
        45deg,
        #654321,
        #8b4513,
        #a0522d,
        #654321,
        #8b4513
      )
      1;
    box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.3),
      0 10px 30px rgba(0, 0, 0, 0.8);
    background-clip: padding-box;
    overflow: visible;
  }

  /* 调整照片卡片大小以适应竖屏 */
  .photo-card {
    width: 200px;
    height: 240px;
    margin: 5px;
  }
}
</style>
