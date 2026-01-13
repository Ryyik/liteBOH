<template>
  <div
    class="shop-page"
  >
    <!-- 统一导航栏 -->
    <UnifiedNavbar />

    <!-- 页面标题 -->
    <header class="page-header">
      <h1 class="page-title">周边商城</h1>
      <p class="page-subtitle">方块之家官方周边，尽在方块街</p>
    </header>

    <!-- 导航栏 -->
    <div class="shop-nav">
      <!-- 搜索区域 -->
      <div class="search-container">
        <div class="search-wrapper">
          <input
            type="text"
            class="search-input"
            v-model="searchQuery"
            placeholder="搜索商品..."
            @input="handleSearch"
          />
          <button class="search-btn">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3C5.91 3 3 5.91 3 9.5C3 13.09 5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5C5 7.01 7.01 5 9.5 5C11.99 5 14 7.01 14 9.5C14 11.99 11.99 14 9.5 14Z"
                fill="currentColor"
              />
            </svg>
          </button>
          <!-- 搜索建议 -->
          <div
            class="search-suggestions"
            v-if="showSuggestions && filteredSuggestions.length > 0"
          >
            <div
              v-for="suggestion in filteredSuggestions"
              :key="suggestion.id"
              class="suggestion-item"
              @click="selectSuggestion(suggestion)"
            >
              <span class="suggestion-title">{{ suggestion.title }}</span>
              <span class="suggestion-category">{{ suggestion.category }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 用户功能入口 -->
      <div class="user-section">
        <router-link :to="userCenterRoute" class="user-btn" @click="handleUserCenterClick">
          <span class="user-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z"
                fill="currentColor"
              />
            </svg>
          </span>
          <span>我的</span>
        </router-link>
      </div>
    </div>

    <!-- 分类筛选 -->
    <div class="category-filter">
      <div
        v-for="category in categories"
        :key="category.value"
        class="category-item"
        :class="{ active: selectedCategory === category.value }"
        @click="selectCategory(category.value)"
      >
        {{ category.label }}
      </div>
    </div>

    <!-- 商品容器 -->
    <div class="container">
      <div class="products-grid" id="productsGrid">
        <!-- 商品卡片 -->
        <div
          v-for="(product, index) in filteredProducts"
          :key="product.id"
          class="product-card"
          :data-id="product.id"
          ref="productCards"
          @click="openProductDetails(product)"
        >
          <div class="product-image">
            <picture>
              <source :srcset="toWebp(product.image)" type="image/webp" />
              <img
                :src="getImageUrl(product.image)"
                :alt="product.title"
                loading="lazy"
                decoding="async"
                fetchpriority="low"
                sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
              />
            </picture>
          </div>
          <div class="product-content">
            <span class="product-category">{{ product.category }}</span>
            <h3 class="product-title">{{ product.title }}</h3>
            <p class="product-description">{{ product.description }}</p>
            <div class="product-price">{{ product.price }}</div>
            <button class="product-btn" @click="shareProduct(product)">
              获取周边
            </button>
          </div>
        </div>
        <!-- 无商品提示 -->
        <div class="no-products" v-if="filteredProducts.length === 0">
          <p>暂无匹配的商品</p>
        </div>
      </div>
    </div>

    <!-- 页脚 -->
    <Footer />

    <!-- 登录弹窗 (与 UnifiedNavbar 保持完全一致) -->
    <div
      class="boh-login-modal-overlay"
      v-if="showLoginModal"
      @click="showLoginModal = false"
    >
      <div class="boh-login-modal-container" @click.stop>
        <button class="boh-login-modal-close" @click="showLoginModal = false">
          &times;
        </button>
        <div class="boh-login-modal-header">
          <h2>方块之家</h2>
          <p>这里不只有方块。</p>
        </div>
        <form class="boh-login-form" @submit.prevent="handleLogin">
          <div class="boh-form-group">
            <label>方块ID</label>
            <input
              type="text"
              v-model="loginForm.username"
              placeholder="请输入你的用户名"
              required
            />
          </div>
          <div class="boh-form-group">
            <label>密码</label>
            <div class="boh-password-wrap">
              <input
                :type="showPassword ? 'text' : 'password'"
                v-model="loginForm.password"
                placeholder="请输入你的密码"
                required
              />
              <button
                type="button"
                class="boh-toggle-password"
                @click="showPassword = !showPassword"
              >
                {{ showPassword ? "隐藏" : "显示" }}
              </button>
            </div>
          </div>
          <div class="boh-auth-error" v-if="authError">
            用户名或密码错误，请重试
          </div>
          <div class="boh-form-links">
            <a href="#" class="boh-forgot-password" @click.prevent="handleForgotPassword"
              >忘记密码？</a
            >
            <a
              href="https://docs.qq.com/form/page/DRVZ2TmtwZWRYaU5o"
              class="boh-register-link"
              target="_blank"
              >还没有账号？立即注册</a
            >
          </div>
          <button type="submit" class="boh-login-btn" :disabled="isLoggingIn">
            {{ isLoggingIn ? "登录中..." : "登录方块之家" }}
          </button>
        </form>
      </div>
    </div>

    <!-- 商品详情弹窗 (Vue + CSS 动画) -->
    <div 
      class="product-modal-overlay" 
      v-if="selectedProduct" 
      @click="closeProductDetails"
      :class="{ 'is-active': selectedProduct }"
    >
      <div class="product-modal-container" @click.stop>
        <button class="modal-close-btn" @click="closeProductDetails">&times;</button>
        <div class="modal-body-layout">
          <div class="modal-image-side">
            <img :src="getImageUrl(selectedProduct.image)" :alt="selectedProduct.title" loading="lazy" />
          </div>
          <div class="modal-info-side">
            <span class="modal-category">{{ selectedProduct.category }}</span>
            <h2 class="modal-title">{{ selectedProduct.title }}</h2>
            <div class="modal-price">{{ selectedProduct.price }}</div>
            <div class="modal-divider"></div>
            <p class="modal-description">{{ selectedProduct.description }}</p>
            <div class="modal-actions">
              <button class="modal-primary-btn" @click="shareProduct(selectedProduct)">获取此周边</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import UnifiedNavbar from "../components/UnifiedNavbar.vue";
import Footer from "../components/Footer.vue";
import { getImageUrl } from "../utils/asset-helper.js";

const toWebp = (src) => {
  if (!src || src.startsWith("data:")) return src;
  // 尝试获取对应的 .webp 版本
  const webpPath = src.replace(/\.(png|jpg|jpeg|PNG|JPG|JPEG)$/i, ".webp");
  return getImageUrl(webpPath);
};

// 商品数据
const productsData = ref([
  {
    id: 8,
    category: "周边",
    title: "BOH BAG-Air（胸包）",
    description: "白色背景图+黑色文字，黑色文字为BOH BAG系列",
    price: "¥39.99",
    image: "xnbag-1.PNG",
  },
  {
    id: 1,
    category: "周边",
    title: "方块之家7周年纪念册",
    description: "硬壳精装版，记录方块之家7年来的点点滴滴。",
    price: "¥34.99",
    image: "Commemorative-album.PNG",
  },
  {
    id: 2,
    category: "周边",
    title: "方块之家明信片套装",
    description: "8张精美明信片，展示方块之家建筑风光。",
    price: "¥8.99",
    image: "2025-7years.png",
  },
  {
    id: 3,
    category: "周边",
    title: "方块之家7周年海报",
    description: "高品质印刷，记录7周年美好瞬间。",
    price: "¥12.99",
    image: "2024-newyears.png",
  },
  {
    id: 4,
    category: "礼物",
    title: "小牛定制吧唧",
    description: "金属吧唧，小牛形象设计。",
    price: "¥6.99",
    image: "main3.png",
  },
  {
    id: 5,
    category: "定制",
    title: "小牛定制流麻",
    description: "动态流沙麻将，blingbling效果。",
    price: "待定",
    image: "main2.webp",
  },
  {
    id: 6,
    category: "礼物",
    title: "方块之家钥匙扣",
    description: "精致钥匙扣，多种款式可选。",
    price: "¥5.99",
    image: "xnbag-2.PNG",
  },
  {
    id: 7,
    category: "定制",
    title: "像素乐高形象109",
    description: "根据您的设计定制专属像素乐高形象。",
    price: "¥199.99",
    image: "xnbag-3.PNG",
  },
]);

// 搜索相关
const searchQuery = ref("");
const showSuggestions = ref(false);
const filteredSuggestions = ref([]);
let searchTimeout = null;

// 登录弹窗控制
const showLoginModal = ref(false);
const showPassword = ref(false);
const isLoggingIn = ref(false);
const authError = ref(false);
const loginForm = ref({
  username: "",
  password: "",
});

// 登录状态
const isLoggedIn = ref(false);
const username = ref("");

// 初始化登录状态
const initAuthState = () => {
  if (window.AuthManager) {
    const user = window.AuthManager.getCurrentUser();
    if (user) {
      isLoggedIn.value = true;
      username.value = user.username;
    } else {
      isLoggedIn.value = false;
      username.value = "";
    }
  }
};

// 处理登录
const handleLogin = () => {
  const { username: inputUsername, password: inputPassword } = loginForm.value;
  authError.value = false;

  if (!inputUsername.trim() || !inputPassword.trim() || inputPassword.length < 6) {
    return;
  }

  isLoggingIn.value = true;

  setTimeout(() => {
    const result = window.AuthManager.login(inputUsername, inputPassword);
    if (result.success) {
      isLoggedIn.value = true;
      username.value = inputUsername;
      showLoginModal.value = false;
      loginForm.value = { username: "", password: "" };
    } else {
      authError.value = true;
    }
    isLoggingIn.value = false;
  }, 500);
};

// 处理忘记密码
const handleForgotPassword = () => {
  alert("由于技术限制，请联系网站开发者解决该问题。");
};

// 分类相关
const categories = ref([
  { label: "全部", value: "" },
  { label: "礼物", value: "礼物" },
  { label: "周边", value: "周边" },
  { label: "定制", value: "定制" },
]);
const selectedCategory = ref("");

// 用户信息 - 用于分享功能
const userInfo = computed(() => {
  if (isLoggedIn.value) {
    return {
      id:
        username.value.toLowerCase().replace(/\s+/g, "-") +
        "-" +
        Math.floor(Math.random() * 10000),
      username: username.value,
    };
  } else {
    return {
      id: "guest-12345",
      username: "guest",
    };
  }
});

// 用户中心导航处理
const handleUserCenterClick = (e) => {
  if (!isLoggedIn.value) {
    // 未登录时阻止跳转并显示登录弹窗
    e.preventDefault();
    showLoginModal.value = true;
  }
};

// 用户中心路由
const userCenterRoute = computed(() => {
  if (isLoggedIn.value) {
    // 点击"我的"跳转到个人中心周边详情页 (即地址/周边信息页)
    return '/user-center/address';
  }
  return '#'; // 未登录时设为 #
});

// 分享商品
const shareProduct = (product) => {
  // 获取用户名，从登录状态获取
  const username = userInfo.value.username;
  const shareText = `${username}在BOH官网选择了${product.category}${product.title}`;
  const shareUrl = `${window.location.origin}${window.location.pathname}?productId=${product.id}`;

  // 组合分享内容
  const fullShareContent = `${shareText}\n查看链接：${shareUrl}`;

  // 复制到剪贴板
  navigator.clipboard
    .writeText(fullShareContent)
    .then(() => {
      alert("分享内容已复制到剪贴板");
    })
    .catch((err) => {
      console.error("复制失败:", err);
      alert(fullShareContent);
    });

  // 如果浏览器支持分享API，可以使用原生分享功能
  /*
  if (navigator.share) {
    navigator.share({
      title: product.title,
      text: shareText,
      url: shareUrl
    });
  } else {
    // 复制到剪贴板
    navigator.clipboard.writeText(fullShareContent);
    alert('分享内容已复制到剪贴板');
  }
  */
};

// 过滤后的商品
const filteredProducts = computed(() => {
  let products = [...productsData.value];

  // 按分类过滤
  if (selectedCategory.value) {
    products = products.filter(
      (product) => product.category === selectedCategory.value
    );
  }

  // 按搜索关键词过滤
  if (searchQuery.value) {
    const keyword = searchQuery.value.toLowerCase();
    products = products.filter(
      (product) =>
        product.title.toLowerCase().includes(keyword) ||
        product.description.toLowerCase().includes(keyword)
    );
  }

  return products;
});

// 处理搜索
const handleSearch = (e) => {
  const keyword = e.target.value.toLowerCase();

  if (keyword.length > 0) {
    // 防抖处理
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    searchTimeout = setTimeout(() => {
      filteredSuggestions.value = productsData.value.filter(
        (product) =>
          product.title.toLowerCase().includes(keyword) ||
          product.description.toLowerCase().includes(keyword)
      );
      showSuggestions.value = true;
    }, 300);
  } else {
    showSuggestions.value = false;
    filteredSuggestions.value = [];
  }
};

// 选择搜索建议
const selectSuggestion = (suggestion) => {
  searchQuery.value = suggestion.title;
  showSuggestions.value = false;
};

// 选择分类
const selectCategory = (category) => {
  selectedCategory.value = category;
};

// 商品详情弹窗
const selectedProduct = ref(null);
const openProductDetails = (product) => {
  selectedProduct.value = product;
  document.body.style.overflow = 'hidden';
};
const closeProductDetails = () => {
  selectedProduct.value = null;
  document.body.style.overflow = '';
};

// 引用
const productCards = ref([]);

// Intersection Observer
let observer = null;

// 观察商品卡片
const observeProductCards = () => {
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

  // 观察所有商品卡片
  if (productCards.value) {
    productCards.value.forEach((card) => {
      if (card) {
        observer.observe(card);
      }
    });
  }
};

onMounted(() => {
  // 初始化登录状态
  initAuthState();
  // 添加页面加载完成类
  document.body.classList.add("is-loaded");
  // 观察商品卡片
  observeProductCards();
});

onBeforeUnmount(() => {
  // 取消观察
  if (observer) {
    observer.disconnect();
  }
  // 清除搜索定时器
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
});

// 监听商品列表变化，重新观察商品卡片
watch(
  () => filteredProducts.value.length,
  () => {
    // 延迟一下，确保DOM已经更新
    setTimeout(() => {
      observeProductCards();
    }, 100);
  }
);

onBeforeUnmount(() => {
  // 取消观察
  if (observer) {
    observer.disconnect();
  }
  // 清除搜索定时器
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
});
</script>

<style scoped>
/* 导航栏样式 */
.shop-nav {
  background-color: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  padding: 16px 20px;
  position: relative; /* 改为 relative，不跟随滚动 */
  z-index: 1000;
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.05);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

/* 搜索容器 */
.search-container {
  position: relative;
  flex: 1;
  max-width: calc(100% - 120px);
}

.search-wrapper {
  position: relative;
  max-width: 100%;
}

.search-input {
  width: 100%;
  padding: 12px 48px 12px 16px;
  background-color: rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 24px;
  color: #333;
  font-size: 14px;
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  outline: none;
}

.search-input::placeholder {
  color: rgba(0, 0, 0, 0.4);
}

.search-input:focus {
  background-color: rgba(0, 0, 0, 0.08);
  border-color: rgba(0, 0, 0, 0.2);
  box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.05);
}

.search-btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: rgba(0, 0, 0, 0.5);
  padding: 8px 12px;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-btn:hover {
  background-color: rgba(0, 0, 0, 0.05);
  color: #000;
}

/* 搜索建议 */
.search-suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background-color: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 12px;
  margin-top: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  z-index: 1001;
  max-height: 300px;
  overflow-y: auto;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.suggestion-item {
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.suggestion-item:last-child {
  border-bottom: none;
}

.suggestion-item:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.suggestion-title {
  color: #333;
  font-size: 14px;
}

.suggestion-category {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.5);
  background-color: rgba(0, 0, 0, 0.05);
  padding: 3px 8px;
  border-radius: 12px;
}

/* 导航底部区域 */
.nav-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

/* 分类筛选 */
.category-filter {
  background-color: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  padding: 12px 20px;
  display: flex;
  gap: 12px;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.1) transparent;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.category-filter::-webkit-scrollbar {
  height: 4px;
}

.category-filter::-webkit-scrollbar-track {
  background: transparent;
}

.category-filter::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 2px;
}

.category-item {
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  background-color: rgba(0, 0, 0, 0.05);
  color: rgba(0, 0, 0, 0.6);
  white-space: nowrap;
  border: 1px solid transparent;
}

.category-item:hover {
  background-color: rgba(0, 0, 0, 0.08);
  color: #000;
}

.category-item.active {
  background-color: #000;
  color: #fff;
  border-color: #000;
  font-weight: 500;
}

/* 用户功能区域 */
.user-section {
  position: relative;
  flex-shrink: 0;
}

.user-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background-color: rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 20px;
  color: #333;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  outline: none;
}

.user-btn:hover {
  background-color: rgba(0, 0, 0, 0.08);
  border-color: rgba(0, 0, 0, 0.2);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.user-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 无商品提示 */
.no-products {
  grid-column: 1 / -1;
  text-align: center;
  padding: 60px 20px;
  color: rgba(0, 0, 0, 0.4);
  font-size: 16px;
}

/* 全局背景：全白背景 */
.shop-page {
  margin: 0;
  padding: 0;
  background-color: #ffffff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei",
    Arial, sans-serif;
  position: relative;
  opacity: 1 !important;
  color: #333;
  min-height: 100vh;
  visibility: visible !important;
}

/* 移除背景遮罩 */
.shop-page::before {
  display: none;
}

/* 页面容器 */
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

/* 页面标题 */
.page-header {
  text-align: center;
  padding: 80px 20px 60px;
}

.page-title {
  font-size: 48px;
  font-weight: 700;
  margin-bottom: 16px;
  opacity: 0;
  color: #000;
  animation: titleEnter 1.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
}

@keyframes titleEnter {
  0% {
    opacity: 0;
    transform: scale(2.5) translateY(50px);
  }

  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.page-subtitle {
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

/* 商品网格 */
.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
  padding: 20px 0;
}

/* 商品卡片 */
.product-card {
  background-color: #ffffff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.05);
  transition: all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  opacity: 0;
  transform: translateY(60px) scale(0.95);
  cursor: pointer;
}

.product-card.visible {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.product-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.product-image {
  width: 100%;
  height: 160px; /* 压缩高度，原200px */
  background-color: #f5f5f7;
  position: relative;
  overflow: hidden;
}

.product-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.product-card:hover .product-image img {
  transform: scale(1.05);
}

.product-content {
  padding: 16px; /* 压缩内边距，原24px */
}

.product-category {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  margin-bottom: 8px;
  font-weight: 500;
  background-color: #f5f5f7;
  color: #86868b;
}

.product-title {
  font-size: 16px; /* 缩小字号，原18px */
  font-weight: 600;
  margin-bottom: 8px;
  color: #1d1d1f;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.product-price {
  font-size: 18px; /* 缩小字号，原20px */
  font-weight: 700;
  color: #000;
  margin-bottom: 12px;
}

.product-description {
  font-size: 13px;
  color: #86868b;
  line-height: 1.4;
  margin-bottom: 15px;
  display: -webkit-box;
  -webkit-line-clamp: 2; /* 限制描述行数 */
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.product-btn {
  display: block;
  width: 100%;
  padding: 12px;
  background-color: #000;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  text-align: center;
  text-decoration: none;
}

.product-btn:hover {
  background-color: #333;
  transform: translateY(-2px);
}

/* 详情弹窗样式 */
.product-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: modalOverlayIn 0.4s ease;
}

@keyframes modalOverlayIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.product-modal-container {
  background: #fff;
  width: 100%;
  max-width: 900px;
  border-radius: 24px;
  overflow: hidden;
  position: relative;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  animation: modalContainerIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modalContainerIn {
  from { transform: scale(0.9) translateY(20px); opacity: 0; }
  to { transform: scale(1) translateY(0); opacity: 1; }
}

.modal-close-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.05);
  border: none;
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  transition: all 0.2s ease;
}

.modal-close-btn:hover {
  background: rgba(0, 0, 0, 0.1);
  transform: rotate(90deg);
}

.modal-body-layout {
  display: flex;
  flex-direction: row;
}

.modal-image-side {
  flex: 1.2;
  background: #f5f5f7;
  display: flex;
  align-items: center;
  justify-content: center;
  max-height: 500px;
}

.modal-image-side img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.modal-info-side {
  flex: 1;
  padding: 40px;
  display: flex;
  flex-direction: column;
}

.modal-category {
  color: #86868b;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 12px;
}

.modal-title {
  font-size: 32px;
  font-weight: 700;
  color: #1d1d1f;
  margin-bottom: 10px;
  line-height: 1.2;
}

.modal-price {
  font-size: 24px;
  font-weight: 600;
  color: #000;
  margin-bottom: 24px;
}

.modal-divider {
  height: 1px;
  background: #e5e5e5;
  margin-bottom: 24px;
}

.modal-description {
  font-size: 16px;
  line-height: 1.6;
  color: #424245;
  margin-bottom: 40px;
  flex: 1;
}

.modal-actions {
  margin-top: auto;
}

.modal-primary-btn {
  width: 100%;
  padding: 18px;
  background: #000;
  color: #fff;
  border: none;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.modal-primary-btn:hover {
  background: #333;
  transform: translateY(-2px);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
}

/* 响应式设计适配弹窗 */
@media (max-width: 768px) {
  .modal-body-layout {
    flex-direction: column;
  }
  
  .modal-image-side {
    max-height: 300px;
  }
  
  .modal-info-side {
    padding: 24px;
  }
  
  .modal-title {
    font-size: 24px;
  }
  
  .product-modal-container {
    max-height: 90vh;
    overflow-y: auto;
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .page-header {
    padding: 60px 20px 40px;
  }

  .page-title {
    font-size: 36px;
  }

  .products-grid {
    grid-template-columns: repeat(2, 1fr); /* 调整为两列布局 */
    gap: 12px; /* 减小间距以适应双列 */
    padding: 10px;
  }

  .product-content {
    padding: 15px; /* 减小内边距 */
  }

  .product-title {
    font-size: 15px; /* 减小标题字号 */
    margin-bottom: 8px;
  }

  .product-description {
    font-size: 12px;
    margin-bottom: 12px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .product-price {
    font-size: 16px;
    margin-bottom: 10px;
  }

  .product-btn {
    padding: 8px;
    font-size: 12px;
  }
}

/* 动画 */
@keyframes fadeIn {
  to {
    opacity: 1;
  }
}
</style>
