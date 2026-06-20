<template>
  <div class="newsroom-page">
    <!-- 统一导航栏 -->

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
            <input type="text" v-model="searchQuery" placeholder="搜索新闻标题、内容或作者..." @input="handleSearch"
              @focus="showSuggestions = true" @blur="handleBlur" class="search-input" autocomplete="off"
              name="news-search-input" spellcheck="false" />
            <button v-if="searchQuery" @click="clearSearch" class="clear-search">
              &times;
            </button>

            <!-- 搜索建议下拉列表 -->
            <transition name="fade">
              <div v-if="showSuggestions && searchQuery && filteredSuggestions.length > 0" class="search-suggestions">
                <div v-for="item in filteredSuggestions" :key="item.id" class="suggestion-item"
                  @mousedown="selectSuggestion(item)">
                  <span class="suggestion-title">{{ item.title }}</span>
                  <span class="suggestion-category">{{ getCategoryName(item.category) }}</span>
                </div>
              </div>
            </transition>
          </div>
        </div>
        <div class="filter-container">
          <div v-for="tag in filterTags" :key="tag.value" class="filter-tag"
            :class="{ active: activeCategory === tag.value }" @click="filterNews(tag.value)" :data-category="tag.value">
            {{ tag.label }}
          </div>
        </div>
      </div>
    </div>

    <!-- 新闻容器 -->
    <div class="news-container">
      <!-- 加载状态 -->
      <div v-if="loading" class="news-grid news-skeleton-grid" aria-hidden="true">
        <div v-for="item in 6" :key="`news-loading-${item}`" class="news-card news-card-skeleton">
          <div class="news-skeleton-image">
            <div class="news-skeleton-block news-skeleton-date"></div>
          </div>
          <div class="news-content">
            <div class="news-skeleton-block news-skeleton-category"></div>
            <div class="news-skeleton-block news-skeleton-title"></div>
            <div class="news-skeleton-block news-skeleton-line wide"></div>
            <div class="news-skeleton-block news-skeleton-line"></div>
            <div class="news-meta">
              <div class="news-author">
                <div class="news-skeleton-block news-skeleton-avatar"></div>
                <div class="news-skeleton-block news-skeleton-author"></div>
              </div>
              <div class="news-skeleton-block news-skeleton-more"></div>
            </div>
          </div>
        </div>
      </div>
      
      <div v-else class="news-grid" ref="newsGrid">
        <!-- 新闻卡片 -->
        <div v-for="news in currentNews" :key="news.id" class="news-card" :data-category="news.category"
          :data-id="news.id" @click="showModal(news)" ref="newsCards">
          <div class="news-image">
            <img :src="getNewsImageUrl(news.image, 'card')" :alt="news.title" loading="lazy" decoding="async"
              fetchpriority="low" sizes="(max-width: 768px) 90vw, (max-width: 1200px) 45vw, 33vw" />
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
                <div class="author-avatar">{{ news.author?.charAt(0) || 'N' }}</div>
                <span>{{ news.author }}</span>
              </div>
              <span>阅读全文 →</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 无结果提示 -->
      <div class="no-results" :class="{ show: !loading && currentNews.length === 0 }">
        <i class="icon-file" style="font-size: 48px; color: #ddd; margin-bottom: 20px"></i>
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
          <h2 id="modalTitle" class="modal-title">{{ selectedNews.title }}</h2>
          <div class="modal-meta">
            <span id="modalDate">{{ formatDate(selectedNews.date) }}</span>
            <span class="meta-divider">·</span>
            <span id="modalCategory">{{
              getCategoryName(selectedNews.category)
              }}</span>
            <span class="meta-divider">·</span>
            <span id="modalAuthor">作者：{{ selectedNews.author }}</span>
          </div>
        </div>
        <div class="modal-body">
          <img :src="getNewsImageUrl(selectedNews.image, 'modal')" :alt="selectedNews.title" class="modal-image"
            id="modalImage" loading="lazy" decoding="async" fetchpriority="low"
            sizes="(max-width: 768px) 90vw, 800px" />
          <div class="modal-content-text" v-html="sanitizedNewsContent"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, computed } from "vue";
import { getImageUrl } from "../../utils/asset-helper.js";
import { getCloudinaryTransformedUrl } from "@/utils/cloudinary-client.js";
import DOMPurify from "@/utils/dompurify.js";

// 导入新闻 composable
import { initNews, getAllNews, getCategoryName } from "../../composables/useNews";

// 新闻数据
const newsData = ref([]);

// 当前显示的新闻
const currentNews = ref([]);

// 加载状态
const loading = ref(true);

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

const NEWS_SANITIZE_OPTIONS = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'span', 'b', 'i', 'u'],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class']
};
const NEWS_CARD_IMAGE_TRANSFORM = 'f_auto,q_auto,c_fill,g_auto,w_900,h_540';
const NEWS_MODAL_IMAGE_TRANSFORM = 'f_auto,q_auto,c_limit,w_1600';

const sanitizedNewsContent = computed(() => {
  const raw = selectedNews.value?.content || '';
  return DOMPurify.sanitize(raw, NEWS_SANITIZE_OPTIONS);
});

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

const isCloudinaryImageUrl = (imageUrl) => {
  const safeUrl = String(imageUrl || '').trim();
  if (!safeUrl) return false;
  try {
    const parsed = new URL(safeUrl);
    return parsed.protocol === 'https:' && parsed.hostname === 'res.cloudinary.com' && parsed.pathname.includes('/image/upload/');
  } catch (_error) {
    return false;
  }
};

const getNewsImageUrl = (imageUrl, variant = 'card') => {
  const safeUrl = String(imageUrl || '').trim();
  if (!safeUrl) return '';
  if (isCloudinaryImageUrl(safeUrl)) {
    return getCloudinaryTransformedUrl(
      safeUrl,
      variant === 'modal' ? NEWS_MODAL_IMAGE_TRANSFORM : NEWS_CARD_IMAGE_TRANSFORM
    );
  }
  return getImageUrl(safeUrl);
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

onMounted(async () => {
  // 添加页面加载完成类
  document.body.classList.add("is-loaded");
  
  // 从 Supabase 加载新闻数据
  await loadNewsData();
  
  // 添加点击外部关闭模态框的事件监听
  document.addEventListener("click", handleClickOutside);
});

// 加载新闻数据
const loadNewsData = async () => {
  loading.value = true;
  await initNews();
  newsData.value = getAllNews();
  currentNews.value = [...newsData.value];
  loading.value = false;
  
  // 观察新闻卡片
  nextTick(() => {
    observeNewsCards();
  });
};

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
@import './style.scoped.css';
</style>
