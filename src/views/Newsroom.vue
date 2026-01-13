<template>
  <div class="newsroom-page">
    <!-- 统一导航栏 -->
    <UnifiedNavbar />

    <!-- 新闻中心标题区域 -->
    <header class="news-header">
      <h1 class="news-title">新闻中心</h1>
      <p class="news-subtitle">记录方块之家的每一个重要时刻</p>
    </header>

    <!-- 筛选标签栏 -->
    <div class="filter-bar">
      <div class="container">
        <!-- 搜索栏 -->
        <div class="search-container">
          <div class="search-wrapper">
            <i class="icon-search"></i>
            <input
              type="text"
              v-model="searchQuery"
              placeholder="搜索新闻标题、内容或作者..."
              @input="handleSearch"
              @focus="showSuggestions = true"
              @blur="handleBlur"
              class="search-input"
              autocomplete="off"
              name="news-search-input"
              spellcheck="false"
            />
            <button v-if="searchQuery" @click="clearSearch" class="clear-search">
              &times;
            </button>

            <!-- 搜索建议下拉列表 -->
            <transition name="fade">
              <div v-if="showSuggestions && searchQuery && filteredSuggestions.length > 0" class="search-suggestions">
                <div 
                  v-for="item in filteredSuggestions" 
                  :key="item.id" 
                  class="suggestion-item"
                  @mousedown="selectSuggestion(item)"
                >
                  <span class="suggestion-title">{{ item.title }}</span>
                  <span class="suggestion-category">{{ getCategoryName(item.category) }}</span>
                </div>
              </div>
            </transition>
          </div>
        </div>
        <div class="filter-container">
          <div
            v-for="tag in filterTags"
            :key="tag.value"
            class="filter-tag"
            :class="{ active: activeCategory === tag.value }"
            @click="filterNews(tag.value)"
            :data-category="tag.value"
          >
            {{ tag.label }}
          </div>
        </div>
      </div>
    </div>

    <!-- 新闻容器 -->
    <div class="news-container">
      <div class="news-grid" ref="newsGrid">
        <!-- 新闻卡片 -->
        <div
          v-for="(news, index) in currentNews"
          :key="news.id"
          class="news-card"
          :data-category="news.category"
          :data-id="news.id"
          @click="showModal(news)"
          ref="newsCards"
        >
          <div class="news-image">
            <picture>
              <source :srcset="getWebpImage(news.image)" type="image/webp" />
              <source :srcset="getImageUrl(news.image)" type="image/png" />
              <img
                :src="getImageUrl(news.image)"
                :alt="news.title"
                loading="lazy"
                decoding="async"
                fetchpriority="low"
                sizes="(max-width: 768px) 90vw, (max-width: 1200px) 45vw, 33vw"
              />
            </picture>
            <div class="news-date">{{ formatDate(news.date) }}</div>
          </div>
          <div class="news-content">
            <span class="news-category">{{
              getCategoryName(news.category)
            }}</span>
            <h3 class="news-title-card">{{ news.title }}</h3>
            <p class="news-excerpt">{{ news.excerpt }}</p>
            <div class="news-meta">
              <div class="news-author">
                <div class="author-avatar">{{ news.author.charAt(0) }}</div>
                <span>{{ news.author }}</span>
              </div>
              <span>阅读全文 →</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 无结果提示 -->
      <div class="no-results" :class="{ show: currentNews.length === 0 }">
        <i
          class="icon-file"
          style="font-size: 48px; color: #ddd; margin-bottom: 20px"
        ></i>
        <h3>暂无相关新闻</h3>
        <p>请尝试其他筛选条件</p>
      </div>

      <!-- 加载更多 -->
      <div class="load-more">
        <button class="load-more-btn" id="loadMoreBtn">加载更多新闻</button>
      </div>
    </div>

    <!-- 新闻详情模态框 -->
    <div class="news-modal" v-if="showNewsModal" @click="closeModal">
      <div class="modal-content" @click.stop>
        <span class="modal-close" @click="closeModal">&times;</span>
        <div class="modal-header">
          <div class="modal-meta">
            <span id="modalDate">{{ formatDate(selectedNews.date) }}</span>
            <span id="modalCategory">{{
              getCategoryName(selectedNews.category)
            }}</span>
            <span id="modalAuthor">作者：{{ selectedNews.author }}</span>
          </div>
          <h2 id="modalTitle" class="modal-title">{{ selectedNews.title }}</h2>
        </div>
        <div class="modal-body">
          <picture>
            <source
              :srcset="getWebpImage(selectedNews.image)"
              type="image/webp"
              id="modalImageWebp"
            />
            <source
              :srcset="getImageUrl(selectedNews.image)"
              type="image/png"
              id="modalImagePng"
            />
            <img
              :src="getImageUrl(selectedNews.image)"
              :alt="selectedNews.title"
              class="modal-image"
              id="modalImage"
              loading="lazy"
              decoding="async"
              fetchpriority="low"
              sizes="(max-width: 768px) 90vw, 800px"
            />
          </picture>
          <div class="modal-content-text" v-html="selectedNews.content"></div>
        </div>
      </div>
    </div>

    <!-- 页脚 -->
    <Footer />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, computed } from "vue";
import UnifiedNavbar from "../components/UnifiedNavbar.vue";
import Footer from "../components/Footer.vue";
import { getImageUrl } from "../utils/asset-helper.js";

// 导入新闻 composable
import { getAllNews, getCategoryName } from "../composables/useNews";

// 新闻数据 - 从 composable 获取
const newsData = ref(getAllNews());

// 当前显示的新闻
const currentNews = ref([...newsData.value]);

// 筛选标签
const filterTags = ref([
  { label: "全部新闻", value: "all" },
  { label: "活动公告", value: "event" },
  { label: "更新日志", value: "update" },
  { label: "社区动态", value: "community" },
  { label: "官方通知", value: "announce" },
]);

// 当前活跃分类
const activeCategory = ref("all");

// 搜索查询
const searchQuery = ref("");
const showSuggestions = ref(false);

// 搜索建议逻辑
const filteredSuggestions = computed(() => {
  if (!searchQuery.value.trim()) return [];
  const query = searchQuery.value.toLowerCase().trim();
  return newsData.value
    .filter(
      (news) =>
        news.title.toLowerCase().includes(query) ||
        news.excerpt.toLowerCase().includes(query) ||
        news.author.toLowerCase().includes(query)
    )
    .slice(0, 5); // 最多显示5条建议
});

// 处理失去焦点
const handleBlur = () => {
  // 使用 mousedown 处理点击建议，所以 blur 延迟一点关闭
  setTimeout(() => {
    showSuggestions.value = false;
  }, 200);
};

// 选择建议项
const selectSuggestion = (item) => {
  searchQuery.value = item.title;
  showSuggestions.value = false;
  updateDisplayNews();
  // 搜索后滚动到内容顶部
  window.scrollTo({ top: 0, behavior: "smooth" });
};

// 模态框相关
const showNewsModal = ref(false);
const selectedNews = ref(null);

// 引用
const newsGrid = ref(null);
const newsCards = ref([]);

// Intersection Observer
let observer = null;

// 过滤新闻的统一方法
const updateDisplayNews = () => {
  let filtered = [...newsData.value];
  const query = searchQuery.value.toLowerCase().trim();

  if (query) {
    // 如果有搜索词，执行全局搜索（跨分类）
    filtered = filtered.filter(
      (news) =>
        news.title.toLowerCase().includes(query) ||
        news.excerpt.toLowerCase().includes(query) ||
        news.author.toLowerCase().includes(query) ||
        (news.content && news.content.toLowerCase().includes(query))
    );
  } else if (activeCategory.value !== "all") {
    // 如果没有搜索词，则按分类过滤
    filtered = filtered.filter((news) => news.category === activeCategory.value);
  }

  currentNews.value = filtered;

  // 重新观察元素
  nextTick(() => {
    observeNewsCards();
  });
};

// 筛选新闻分类
const filterNews = (category) => {
  activeCategory.value = category;
  updateDisplayNews();
};

// 处理搜索输入
const handleSearch = () => {
  updateDisplayNews();
};

// 清除搜索
const clearSearch = () => {
  searchQuery.value = "";
  updateDisplayNews();
};

// 显示模态框
const showModal = (news) => {
  selectedNews.value = news;
  showNewsModal.value = true;
  document.body.style.overflow = "hidden";
};

// 关闭模态框
const closeModal = () => {
  showNewsModal.value = false;
  document.body.style.overflow = "";
};

// 格式化日期
const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}/${String(date.getDate()).padStart(2, "0")}`;
};

// 获取WebP图片URL
const getWebpImage = (imageUrl) => {
  if (!imageUrl || imageUrl.startsWith("data:")) return imageUrl;
  // 尝试获取对应的 .webp 版本
  const webpPath = imageUrl.replace(/\.(png|jpg|jpeg)$/i, ".webp");
  return getImageUrl(webpPath);
};

// 观察新闻卡片
const observeNewsCards = () => {
  // 先取消之前的观察
  if (observer) {
    observer.disconnect();
  }

  // 重新创建观察器
  const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px",
  };

  observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
      }
    });
  }, observerOptions);

  // 观察所有新闻卡片
  nextTick(() => {
    if (newsCards.value) {
      newsCards.value.forEach((card) => {
        if (card) {
          observer.observe(card);
        }
      });
    }
  });
};

// 点击外部关闭模态框
const handleClickOutside = (event) => {
  if (showNewsModal.value && event.target.classList.contains("news-modal")) {
    closeModal();
  }
};

onMounted(() => {
  // 添加页面加载完成类
  document.body.classList.add("is-loaded");
  // 观察新闻卡片
  observeNewsCards();
  // 添加点击外部关闭模态框的事件监听
  document.addEventListener("click", handleClickOutside);
});

onBeforeUnmount(() => {
  // 取消观察
  if (observer) {
    observer.disconnect();
  }
  // 移除事件监听
  document.removeEventListener("click", handleClickOutside);
});
</script>

<style scoped>
/* 全局背景：透明背景以配合导航栏毛玻璃效果 */
.newsroom-page {
  margin: 0;
  padding: 0;
  /* 改为全白背景 */
  background: #ffffff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei",
    Arial, sans-serif;
  position: relative;
  opacity: 0;
  animation: fadeIn 0.8s forwards;
  color: #000000;
  min-height: 100vh;
}

/* 头部区域 */
.news-header {
  text-align: center;
  padding: 80px 20px 60px;
  position: relative;
  overflow: hidden;
}

.news-title {
  font-size: 64px;
  font-weight: 700;
  margin-bottom: 16px;
  opacity: 0;
  animation: titleEnter 1.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
  letter-spacing: -2px;
  color: #000000;
}

@keyframes titleEnter {
  0% {
    opacity: 0;
    transform: scale(2.5) translateY(50px);
    letter-spacing: 15px;
  }

  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
    letter-spacing: -2px;
  }
}

.news-subtitle {
  font-size: 18px;
  color: #6e6e73;
  opacity: 0;
  animation: subtitleEnter 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.4s
    forwards;
}

@keyframes subtitleEnter {
  0% {
    opacity: 0;
    transform: translateY(30px);
  }

  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 筛选标签栏 - 白色毛玻璃设计 */
.filter-bar {
  background-color: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  padding: 30px 0 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
  position: relative; /* 取消固定效果 */
  margin-bottom: 40px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

/* 搜索栏样式 */
.search-container {
  max-width: 600px;
  margin: 0 auto 25px;
  padding: 0 20px;
}

.search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 25px;
  padding: 5px 15px;
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
}

.search-wrapper:focus-within {
  border-color: #000;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  transform: translateY(-1px);
}

.search-input {
  width: 100%;
  border: none;
  background: transparent;
  padding: 10px 10px;
  font-size: 15px;
  color: #1d1d1f;
  outline: none;
}

.search-input::placeholder {
  color: #86868b;
}

.clear-search {
  background: none;
  border: none;
  font-size: 20px;
  color: #86868b;
  cursor: pointer;
  padding: 0 5px;
  line-height: 1;
}

.clear-search:hover {
  color: #000;
}

/* 搜索建议样式 */
.search-suggestions {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 15px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  z-index: 100;
  overflow: hidden;
  padding: 8px 0;
}

.suggestion-item {
  padding: 12px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: background 0.2s;
}

.suggestion-item:hover {
  background: rgba(0, 0, 0, 0.05);
}

.suggestion-title {
  font-size: 14px;
  color: #1d1d1f;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  margin-right: 15px;
}

.suggestion-category {
  font-size: 12px;
  color: #86868b;
  background: rgba(0, 0, 0, 0.05);
  padding: 2px 8px;
  border-radius: 10px;
}

/* 动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.filter-container {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 0 20px;
}

.filter-tag {
  padding: 8px 20px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 20px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  background-color: rgba(0, 0, 0, 0.03);
  color: rgba(0, 0, 0, 0.6);
  font-weight: 500;
}

.filter-tag:hover {
  border-color: rgba(0, 0, 0, 0.2);
  background-color: rgba(0, 0, 0, 0.06);
}

.filter-tag.active {
  background-color: #000000;
  color: #ffffff;
  border-color: #000000;
}

/* 新闻卡片网格 */
.news-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px 60px;
}

.news-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 24px;
}

/* 新闻卡片 - 初始隐藏用于滚动动画 */
.news-card {
  background-color: #ffffff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.08);
  transition: all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  cursor: pointer;
  opacity: 0;
  transform: translateY(60px) scale(0.95);
}

.news-card.visible {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.news-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(0, 0, 0, 0.15);
}

.news-image {
  width: 100%;
  height: 200px;
  background-color: #f5f5f7;
  position: relative;
  overflow: hidden;
}

.news-image picture,
.news-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.news-card:hover .news-image img {
  transform: scale(1.05);
}

.news-date {
  position: absolute;
  top: 15px;
  left: 15px;
  background-color: rgba(0, 0, 0, 0.8);
  color: #fff;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}

.news-content {
  padding: 24px;
  position: relative;
}

.news-category {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  margin-bottom: 12px;
  font-weight: 500;
  background-color: #f5f5f7;
  color: #1d1d1f;
}

.news-title-card {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #1d1d1f;
  line-height: 1.4;
  transition: color 0.3s;
}

.news-excerpt {
  font-size: 14px;
  color: #424245;
  line-height: 1.6;
  margin-bottom: 15px;
}

.news-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #86868b;
}

.news-author {
  display: flex;
  align-items: center;
  gap: 8px;
}

.author-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background-color: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
}

/* 模态框 - 白色设计 */
.news-modal {
  display: flex;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.4);
  z-index: 1000;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-content {
  background-color: #ffffff;
  border-radius: 12px;
  max-width: 800px;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
  animation: modalFadeIn 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(0, 0, 0, 0.1);
  color: #000000;
}

@keyframes modalFadeIn {
  from {
    opacity: 0;
    transform: translateY(-30px) scale(0.95);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.modal-header {
  padding: 30px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.modal-close {
  position: absolute;
  top: 20px;
  right: 20px;
  font-size: 24px;
  cursor: pointer;
  color: rgba(0, 0, 0, 0.4);
  transition: color 0.3s;
  z-index: 10;
}

.modal-close:hover {
  color: #000;
}

.modal-body {
  padding: 30px;
}

.modal-image {
  width: 100%;
  height: 300px;
  object-fit: cover;
  border-radius: 8px;
  margin-bottom: 20px;
}

.modal-meta {
  display: flex;
  gap: 20px;
  margin-bottom: 24px;
  font-size: 14px;
  color: #86868b;
}

.modal-content-text {
  font-size: 16px;
  line-height: 1.8;
  color: #1d1d1f;
}

.modal-content-text p {
  margin-bottom: 16px;
}

.modal-content-text strong {
  color: #000;
  font-weight: 700;
}

.modal-content-text h4 {
  margin: 24px 0 12px;
  color: #000;
  font-size: 18px;
}

.modal-content-text ul {
  padding-left: 20px;
  margin-bottom: 16px;
}

.modal-content-text li {
  margin-bottom: 8px;
  color: #1d1d1f;
}

/* 加载更多 */
.load-more {
  text-align: center;
  margin: 40px 0;
  opacity: 0;
  animation: fadeIn 0.8s 1s forwards;
}

.load-more-btn {
  padding: 12px 30px;
  background-color: #fff;
  border: 1px solid #000;
  border-radius: 8px;
  color: #000;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  font-size: 14px;
  font-weight: 500;
}

.load-more-btn:hover {
  background-color: #000;
  color: #fff;
  transform: translateY(-2px);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .modal-content {
    margin: 0 10px;
    max-height: 95vh;
  }

  .modal-header {
    padding: 20px;
  }

  .modal-body {
    padding: 20px;
  }

  .modal-title {
    font-size: 20px;
    line-height: 1.4;
  }

  .modal-content-text {
    font-size: 15px;
    line-height: 1.9;
  }

  .modal-meta {
    flex-wrap: wrap;
    gap: 10px;
    font-size: 13px;
  }

  .modal-image {
    height: 200px;
  }

  .news-header {
    padding: 60px 20px 40px;
  }

  .news-title {
    font-size: 40px;
  }

  .news-subtitle {
    font-size: 16px;
  }

  .news-grid {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .filter-container {
    gap: 8px;
  }

  .filter-tag {
    padding: 6px 14px;
    font-size: 13px;
  }

  .modal-content {
    max-width: 95%;
    max-height: 85vh;
  }

  .modal-header,
  .modal-body {
    padding: 20px;
  }

  .modal-image {
    height: 200px;
  }
}

.no-results {
  text-align: center;
  padding: 60px 20px;
  color: #6e6e73;
  display: none;
}

.no-results.show {
  display: block;
}

/* 动画 */
@keyframes fadeIn {
  to {
    opacity: 1;
  }
}
</style>
