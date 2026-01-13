<template>
  <div class="activities-page">
    <UnifiedNavbar />

    <div class="page__style full__portfolio" id="full__portfolio">
      <div id="portfolio">
        <!-- 功能选择区 -->
        <div class="feature-selector glass-ui">
          <div class="feature-selector-title">
            <h2>活动展示方式</h2>
          </div>
          <div class="feature-toggle-center">
          <button class="toggle-button" @click="toggleView">
            <span class="toggle-text">{{ currentView === 'photo-wall' ? '切换到列表' : '切换到照片墙' }}</span>
          </button>
        </div>
        </div>

        <!-- 嵌套路由出口 -->
        <router-view />
      </div>
    </div>

    <Footer />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import UnifiedNavbar from "../components/UnifiedNavbar.vue";
import Footer from "../components/Footer.vue";

const route = useRoute();
const router = useRouter();

// 当前视图模式，默认选中活动列表
const currentView = ref('list');

// 监听路由变化，更新当前视图
watch(() => route.path, (newPath) => {
  if (newPath.includes('list')) {
    currentView.value = 'list';
  } else {
    currentView.value = 'photo-wall';
  }
}, { immediate: true });

// 切换视图
const switchView = () => {
  if (currentView.value === 'list') {
    router.push('/activities/list');
  } else {
    router.push('/activities/photo-wall');
  }
};

// 切换按钮点击事件
const toggleView = () => {
  currentView.value = currentView.value === 'photo-wall' ? 'list' : 'photo-wall';
  switchView();
};

// 组件挂载时添加页面类
onMounted(() => {
  // 添加页面特定类，用于样式控制
  document.body.classList.add("page-activities");
});
</script>

<style scoped>
/* 页面基础样式 */
.activities-page {
  width: 100%;
  min-height: 100vh;
  background-color: #ffffff;
  color: #333333;
  visibility: visible !important;
  opacity: 1 !important;
  position: relative;
}

/* 玻璃UI样式 */
.glass-ui {
  background: rgba(240, 240, 240, 0.8);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

/* 功能选择区 */
.feature-selector {
  max-width: 1200px;
  margin: 40px auto;
  padding: 30px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

/* 功能选择区标题 */
.feature-selector-title {
  margin-bottom: 10px;
}

.feature-selector-title h2 {
  font-size: 1.5rem;
  color: #000;
  margin: 0;
  font-weight: 600;
}

/* 功能切换按钮容器 */
.feature-toggle-center {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

/* 切换按钮 */
.toggle-button {
  background: rgba(100, 108, 255, 0.2);
  border: 1px solid rgba(100, 108, 255, 0.4);
  color: #000;
  border-radius: 20px;
  padding: 12px 24px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 8px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.toggle-button:hover {
  background: rgba(100, 108, 255, 0.3);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(100, 108, 255, 0.3);
}

.toggle-button:active {
  transform: translateY(0);
}

/* 切换文本 */
.toggle-text {
  font-size: 0.95rem;
}

/* 响应式设计 */
@media (max-width: 768px) {
  /* 功能选择区 */
  .feature-selector {
    flex-direction: column;
    text-align: center;
    padding: 20px;
    margin: 20px auto;
  }
  
  /* 功能选择区标题 */
  .feature-selector-title h2 {
    font-size: 1.2rem;
  }
  
  /* 切换按钮 */
  .toggle-button {
    padding: 10px 20px;
    font-size: 0.9rem;
  }
}

@media (max-width: 480px) {
  /* 功能选择区 */
  .feature-selector {
    padding: 16px;
    margin: 16px auto;
  }
  
  /* 功能选择区标题 */
  .feature-selector-title h2 {
    font-size: 1.1rem;
  }
  
  /* 切换按钮 */
  .toggle-button {
    padding: 8px 16px;
    font-size: 0.85rem;
  }
}
</style>

<style>
/* 全局样式 */
.page-activities {
  background-color: #ffffff !important;
}

/* 修复导航栏下方黑色区块问题 */
.page__style,
.full__portfolio {
  background-color: #ffffff !important;
  padding-top: 80px;
  visibility: visible !important;
  opacity: 1 !important;
}

#portfolio {
  position: relative;
  padding: 50px 0;
  visibility: visible !important;
  opacity: 1 !important;
  background-color: #ffffff !important;
}

/* 容器样式 */
.container {
  width: 100%;
  padding-right: 15px;
  padding-left: 15px;
  margin-right: auto;
  margin-left: auto;
}

/* 响应式容器 */
@media (min-width: 576px) {
  .container {
    max-width: 540px;
  }
}

@media (min-width: 768px) {
  .container {
    max-width: 720px;
  }
}

@media (min-width: 992px) {
  .container {
    max-width: 960px;
  }
}

@media (min-width: 1200px) {
  .container {
    max-width: 1140px;
  }
}
</style>
