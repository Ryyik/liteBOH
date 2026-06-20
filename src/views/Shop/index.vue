<template>
  <div class="shop-page">
    <!-- 统一导航栏 -->

    <!-- Apple 风格顶部 Hero 区 -->
    <header class="shop-hero">
      <div class="shop-hero-content">
        <h1 class="shop-hero-title">
          <span class="gradient-text">商店。</span>
          <span class="subtitle-text">以喜悦方式选购心仪产品。</span>
        </h1>
      </div>
    </header>

    <!-- Apple 风格分类图标导航 -->
    <nav class="category-nav-wrapper">
      <div class="category-nav-scroll" ref="categoryNav" role="tablist" aria-label="商品分类">
        <button v-for="category in categories" :key="category.value" type="button" class="nav-item"
          role="tab" :aria-selected="selectedCategory === category.value"
          :class="{ active: selectedCategory === category.value }" @click="selectCategory(category.value)">
          <div class="nav-icon-box">
            <span class="nav-icon" v-if="category.value === 'all'"></span>
            <span class="nav-icon" v-else-if="category.value === 'BOH Bag'"></span>
            <span class="nav-icon" v-else-if="category.value === 'BOH 装饰'"></span>
            <span class="nav-icon" v-else-if="category.value === 'BOH 虚拟'"></span>
            <span class="nav-icon" v-else-if="category.value === 'BOH 定制'"></span>
          </div>
          <span class="nav-label">{{ category.label }}</span>
        </button>
      </div>
    </nav>

    <!-- 搜索与购物袋入口 (毛玻璃悬浮) -->
    <div class="shop-floating-bar" :class="{ 'scrolled': isScrolled }">
      <div class="floating-container">
        <div class="search-pill" ref="searchPillRef">
          <span class="search-icon"></span>
          <input type="text" v-model="searchQuery" placeholder="搜索商品..." @input="handleSearch"
            @focus="handleSearchFocus" @keydown.esc="showSuggestions = false" />
          <div class="search-suggestions" v-if="showSuggestions && filteredSuggestions.length > 0">
            <button v-for="suggestion in filteredSuggestions" :key="suggestion.id" type="button" class="suggestion-item"
              @click="selectSuggestion(suggestion)">
              <span class="suggestion-title">{{ suggestion.title }}</span>
              <span class="suggestion-category">{{ suggestion.category }}</span>
            </button>
          </div>
        </div>
        <div class="floating-actions">
          <button class="action-pill cart-pill" @click="toggleSidebar" :class="{ 'cart-bounce': cartAnimation }">
            <span>购物袋</span>
            <span class="cart-count" v-if="shoppingBagCount > 0">{{ shoppingBagCount }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 商品流展示区 -->
    <main class="shop-main">
      <section v-if="isFetchingProducts && productsData.length === 0" class="product-flow-section product-skeleton-section"
        aria-hidden="true">
        <div class="section-header">
          <div class="shop-skeleton-block shop-section-title-skeleton"></div>
          <div class="shop-skeleton-block shop-view-all-skeleton"></div>
        </div>
        <div class="product-flow-container">
          <div class="product-flow">
            <div v-for="item in 4" :key="`product-loading-${item}`" class="apple-card product-card product-card-skeleton">
              <div class="card-image">
                <div class="shop-skeleton-block product-image-skeleton"></div>
              </div>
              <div class="card-info">
                <div class="shop-skeleton-block product-category-skeleton"></div>
                <div class="shop-skeleton-block product-title-skeleton"></div>
                <div class="card-footer">
                  <div class="shop-skeleton-block product-price-skeleton"></div>
                  <div class="shop-skeleton-block product-add-skeleton"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 搜索结果展示 (仅在有搜索词时显示) -->
      <section v-else-if="searchQuery" class="product-flow-section search-results">
        <h2 class="section-title">搜索结果</h2>
        <div class="product-flow-container">
          <div class="product-flow" v-if="filteredProducts.length > 0">
            <div v-for="product in filteredProducts" :key="product.id" class="apple-card product-card"
              ref="productCards" @click="openProductDetails(product)">
              <div class="card-image">
                <img :src="getImageUrl(product.image)" :alt="product.title" v-if="product.image"  loading="lazy" />
                <div v-else class="image-placeholder">📦</div>
                <div class="card-badge">{{ product.category }}</div>
              </div>
              <div class="card-info">
                <h3 class="card-title">{{ product.title }}</h3>
                <p class="card-price">{{ formatPointsDisplay(product.points_cost) }}</p>
              </div>
            </div>
          </div>
          <div v-else class="no-results">
            <span class="no-results-icon">🔍</span>
            <h3>未找到相关商品</h3>
            <p>抱歉，没有找到匹配 "{{ searchQuery }}" 的结果。请尝试其他搜索词或浏览我们的分类。</p>
            <button class="reset-search-btn" @click="searchQuery = ''">清除搜索</button>
          </div>
        </div>
      </section>

      <!-- 按分类循环显示的商品流 (仅在无搜索词时显示) -->
      <template v-else>
        <section v-for="cat in activeCategories" :key="cat.value" :id="'cat-' + cat.value.replace(/\s+/g, '-')"
          class="product-flow-section">
          <div class="section-header">
            <h2 class="section-title">{{ cat.label }}</h2>
            <button class="view-all-btn" @click="selectCategory(cat.value)">查看全部</button>
          </div>
          <div class="product-flow-container">
            <div class="product-flow">
              <div v-for="product in getProductsByCategory(cat.value)" :key="product.id" class="apple-card product-card"
                ref="productCards" @click="openProductDetails(product)">
                <div class="card-image">
                  <img :src="getImageUrl(product.image)" :alt="product.title" v-if="product.image"  loading="lazy" />
                  <div v-else class="image-placeholder">📦</div>
                </div>
                <div class="card-info">
                  <span class="card-category">{{ product.category }}</span>
                  <h3 class="card-title">{{ product.title }}</h3>
                  <div class="card-footer">
                    <p class="card-price">{{ formatPointsDisplay(product.points_cost) }}</p>
                    <button class="add-btn" @click.stop="openProductDetails(product)">+</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </template>
    </main>
    <!-- 商品详情弹窗 (Apple 风格) -->
    <div class="product-modal-overlay" v-if="selectedProduct" @click="closeProductDetails"
      :class="{ 'is-active': selectedProduct }">
      <div class="product-modal-container" @click.stop>
        <button class="modal-close-btn" @click="closeProductDetails">&times;</button>
        <div class="modal-body-layout">
          <div class="modal-image-side">
            <div class="modal-image-container">
              <img :src="getImageUrl(selectedProduct.image)" :alt="selectedProduct.title"
                v-if="selectedProduct.image"  loading="lazy" />
              <div v-else class="image-placeholder">📦</div>
            </div>
          </div>
          <div class="modal-info-side">
            <div class="modal-header-info">
              <span class="modal-category-tag">{{ selectedProduct.category }}</span>
              <h2 class="modal-title">{{ selectedProduct.title }}</h2>
              <div class="modal-price-display">{{ formatPointsDisplay(selectedProduct.points_cost) }}</div>
            </div>
            <div class="modal-divider"></div>
            <div class="modal-section">
              <h3 class="section-label">商品描述</h3>
              <p class="modal-description">{{ selectedProduct.description }}</p>
            </div>
            <div v-if="selectedProduct.specifications && selectedProduct.specifications.length > 0"
              class="modal-section">
              <h3 class="section-label">选择规格</h3>
              <div class="specs-options">
                <div v-for="spec in selectedProduct.specifications" :key="spec.value" class="spec-option"
                  :class="{ 'selected': selectedSpecValue === spec.value }" @click="selectSpec(spec.value)">
                  {{ spec.label }}
                </div>
              </div>
            </div>
            <div class="modal-actions">
              <button
                class="modal-primary-btn"
                @click="addToBagFromModal"
                :disabled="!isProductExchangeable(selectedProduct)"
              >
                {{ isProductExchangeable(selectedProduct) ? '加入购物袋' : '暂不可兑换' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 购物纸袋侧拉栏 (Apple 风格) -->
    <div class="sidebar-overlay" v-if="isSidebarOpen" @click="closeSidebar"></div>
    <div class="shopping-bag-sidebar" :class="{ 'is-open': isSidebarOpen }">
      <div class="sidebar-header">
        <h2 class="sidebar-title">购物袋</h2>
        <button class="sidebar-close-btn" @click="closeSidebar">&times;</button>
      </div>
      <div class="sidebar-content">
        <div v-if="shoppingBag.length === 0" class="empty-bag">
          <p class="empty-bag-text">购物袋是空的</p>
          <button class="empty-bag-btn" @click="closeSidebar">继续购物</button>
        </div>
        <div v-else class="bag-items">
          <div v-for="item in shoppingBag" :key="`${item.id}-${item.selectedSpec}`" class="bag-item">
            <div class="bag-item-image">
              <img :src="getImageUrl(item.image)" :alt="item.title"  loading="lazy" />
            </div>
            <div class="bag-item-info">
              <h3 class="bag-item-title">{{ item.title }}</h3>
              <p class="bag-item-spec">{{ item.selectedSpecLabel }}</p>
              <div class="bag-item-bottom">
                <div class="quantity-controls">
                  <button @click="updateQuantity(item.id, item.selectedSpec, -1)">-</button>
                  <span>{{ item.quantity }}</span>
                  <button @click="updateQuantity(item.id, item.selectedSpec, 1)">+</button>
                </div>
                <p class="bag-item-price">{{ formatPointsDisplay(item.points_cost) }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="sidebar-footer" v-if="shoppingBag.length > 0">
        <div class="summary-row">
          <span>总计</span>
          <span class="total-amount">{{ totalPointsText }}</span>
        </div>
        <div class="summary-row">
          <span>当前积分</span>
          <span>{{ isLoggedIn ? userPoints : '请先登录' }}</span>
        </div>
        <div class="footer-actions">
          <button class="settlement-btn" @click="getSettlement" :disabled="!canCheckout">积分结账</button>
        </div>
      </div>
    </div>

    <!-- 规格选择弹窗 (用于直接加入购物袋或复制) -->
    <div class="product-modal-overlay" v-if="showSpecsModal" @click="closeSpecsModal"
      :class="{ 'is-active': showSpecsModal }">
      <div class="product-modal-container spec-selection-modal" @click.stop>
        <button class="modal-close-btn" @click="closeSpecsModal">&times;</button>
        <div class="modal-body-layout spec-layout">
          <div class="modal-info-side">
            <h2 class="modal-title small-title">{{ currentSpecProduct?.title }}</h2>
            <div class="modal-section">
              <h3 class="section-label">选择规格</h3>
              <div class="specs-options">
                <div v-for="spec in currentSpecProduct?.specifications" :key="spec.value" class="spec-option"
                  :class="{ 'selected': selectedSpecValue === spec.value }" @click="selectSpec(spec.value)">
                  <span class="spec-dot"></span>
                  {{ spec.label }}
                </div>
              </div>
            </div>
            <div class="modal-actions">
              <button class="modal-primary-btn" @click="confirmSpecs">
                {{ modalOperationType === 'copy' ? '确认并复制' : '加入购物袋' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 联系方式输入弹窗 -->
    <div class="product-modal-overlay" v-if="showContactModal" @click="closeContactModal"
      :class="{ 'is-active': showContactModal }">
      <div class="product-modal-container contact-modal" @click.stop>
        <button class="modal-close-btn" @click="closeContactModal">&times;</button>
        <div class="modal-body-layout contact-layout">
          <div class="modal-info-side">
            <h2 class="modal-title small-title">请留下联系方式</h2>
            <p class="contact-hint">我们将通过以下方式与您联系确认订单</p>
            <div class="modal-section">
              <h3 class="section-label">选择联系方式</h3>
              <div class="contact-type-options">
                <div class="contact-option" :class="{ 'selected': contactType === 'qq' }" @click="contactType = 'qq'">
                  <span class="contact-icon">🐧</span>
                  <span class="contact-label">QQ</span>
                </div>
                <div class="contact-option" :class="{ 'selected': contactType === 'vx' }" @click="contactType = 'vx'">
                  <span class="contact-icon">💬</span>
                  <span class="contact-label">微信</span>
                </div>
              </div>
            </div>
            <div class="modal-section" v-if="contactType">
              <h3 class="section-label">{{ contactType === 'qq' ? 'QQ号' : '微信号' }}</h3>
              <input type="text" class="contact-input" v-model="contactValue"
                :placeholder="contactType === 'qq' ? '请输入您的QQ号' : '请输入您的微信号'" />
            </div>
            <div class="modal-actions">
              <button class="modal-primary-btn" @click="submitContact" :disabled="!contactType || !contactValue">
                确认提交
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 提示消息 -->
    <div class="operation-toast" v-if="operationToast.show">
      {{ operationToast.message }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { useRoute } from "vue-router";
import { getImageUrl } from "../../utils/asset-helper.js";
import { useAuthStore } from "@/stores/auth";
import { useBagStore } from "@/stores/bag";
import { useProductsStore } from "@/stores/products";
import { storeToRefs } from "pinia";
import { createNotification } from "@/utils/api/notifications-api.js";
import { getAllProfiles } from "@/utils/api/auth-api.js";
import { getProfileByUsername, createShopOrderWithPoints } from "@/utils/api/profile-api.js";
import { sendMerchandiseSettlementEmail } from "@/utils/email-service.js";
import { logger } from "@/utils/logger.js";

// --- 状态管理 (State) ---
const route = useRoute();
const authStore = useAuthStore();
const bagStore = useBagStore();
const productsStore = useProductsStore();
const { isLoggedIn, showLoginModal } = storeToRefs(authStore);
const { userInfo } = authStore;
const { productsData, isFetchingProducts } = storeToRefs(productsStore);
const { shoppingBag } = storeToRefs(bagStore);
const { addToBag, updateBagItemQuantity, clearBag } = bagStore;
const { fetchProducts } = productsStore;
const isSidebarOpen = ref(false);
const showSpecsModal = ref(false);
const currentSpecProduct = ref(null);
const selectedSpecValue = ref('');
const operationToast = ref({ show: false, message: '' });
const modalOperationType = ref('copy'); // 'copy' | 'add-to-bag'
const cartAnimation = ref(false);
const isScrolled = ref(false);
const searchPillRef = ref(null);
const selectedProduct = ref(null);
const showContactModal = ref(false);
const contactType = ref(''); // 'qq' 或 'vx'
const contactValue = ref('');
const productCards = ref([]);
const searchQuery = ref("");
const showSuggestions = ref(false);
const filteredSuggestions = ref([]);
const selectedCategory = ref("all");
const isScrollingManual = ref(false); // 防止点击跳转时触发滚动监听更新
let searchTimeout = null;
let observer = null;

const categories = ref([
  { label: "全部", value: "all" },
  { label: "BOH Bag", value: "BOH Bag" },
  { label: "BOH 虚拟", value: "BOH 虚拟" },
  { label: "BOH 装饰", value: "BOH 装饰" },
  { label: "BOH 定制", value: "BOH 定制" }
]);

const parsePointsCost = (pointsCost) => {
  const numericPoints = Number(pointsCost);
  if (!Number.isFinite(numericPoints)) return null;
  if (numericPoints <= 0) return null;
  return Math.round(numericPoints);
};

const formatPointsDisplay = (pointsCost) => {
  const points = parsePointsCost(pointsCost);
  if (points === null) return '暂不可兑换';
  return `${points} 积分`;
};

const isProductExchangeable = (product) => parsePointsCost(product?.points_cost) !== null;

// --- 计算属性 (Computed) ---

// 计算当前活跃的分类 (排除 "全部")
const activeCategories = computed(() => {
  if (!categories.value) return [];
  return categories.value.filter(c => c.value !== 'all');
});

// 购物袋商品数量
const shoppingBagCount = computed(() => {
  if (!shoppingBag.value) return 0;
  return shoppingBag.value.reduce((total, item) => total + item.quantity, 0);
});

const userPoints = computed(() => `${Number(userInfo.points) || 0} 积分`);

const invalidPricedItems = computed(() => {
  if (!shoppingBag.value) return [];
  return shoppingBag.value.filter((item) => parsePointsCost(item.points_cost) === null);
});

const totalPoints = computed(() => {
  if (!shoppingBag.value) return 0;
  return shoppingBag.value.reduce((sum, item) => {
    const points = parsePointsCost(item.points_cost);
    if (points === null) return sum;
    return sum + (points * item.quantity);
  }, 0);
});

const totalPointsText = computed(() => `${totalPoints.value} 积分`);

const canCheckout = computed(() => {
  if (!shoppingBag.value?.length) return false;
  return invalidPricedItems.value.length === 0;
});

// 过滤后的商品
const filteredProducts = computed(() => {
  if (!productsData.value) return [];
  let products = [...productsData.value];

  // 按分类过滤
  if (selectedCategory.value && selectedCategory.value !== 'all') {
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

// --- 方法 (Methods) ---

const handleScroll = () => {
  isScrolled.value = window.scrollY > 100;

  // 滚动监听更新当前选中的分类 (Scroll Spy)
  // 仅在非搜索状态下执行，且非点击跳转过程中
  if (!searchQuery.value && !isScrollingManual.value) {
    // 增加偏移量，偏移量应略大于 selectCategory 中的 offset，以确保跳转后能准确选中
    const spyOffset = window.innerWidth < 768 ? 170 : 210;
    const scrollPosition = window.scrollY + spyOffset;

    // 如果在顶部 Hero 区域，选中 "all"
    if (window.scrollY < 350) {
      if (selectedCategory.value !== 'all') {
        selectedCategory.value = 'all';
      }
      return;
    }

    // 使用 getBoundingClientRect 来获取更准确的位置
    for (const cat of activeCategories.value) {
      const element = document.getElementById(`cat-${cat.value.replace(/\s+/g, '-')}`);
      if (element) {
        const rect = element.getBoundingClientRect();
        const top = rect.top + window.pageYOffset;
        const bottom = top + rect.height;

        if (scrollPosition >= top && scrollPosition < bottom) {
          if (selectedCategory.value !== cat.value) {
            selectedCategory.value = cat.value;
          }
          break;
        }
      }
    }
  }
};

const getProductsByCategory = (categoryValue) => {
  if (!productsData.value) return [];
  return productsData.value.filter(p => p.category === categoryValue);
};

const closeSpecsModal = () => {
  showSpecsModal.value = false;
  currentSpecProduct.value = null;
  selectedSpecValue.value = '';
};

const actuallyAddToBag = (product, specValue) => {
  if (!isProductExchangeable(product)) {
    showOperationToast('该商品暂不可兑换，无法加入购物袋');
    return false;
  }

  const spec = product.specifications.find(s => s.value === specValue);
  const specLabel = spec ? spec.label : specValue;
  const result = addToBag(product, specValue, specLabel);
  if (!result?.ok) {
    showOperationToast('该商品暂不可兑换，无法加入购物袋');
    return false;
  }
  cartAnimation.value = true;
  setTimeout(() => { cartAnimation.value = false; }, 1000);
  return true;
};

const updateQuantity = (productId, specValue, delta) => {
  updateBagItemQuantity(productId, specValue, delta);
};

const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value;
  document.body.style.overflow = isSidebarOpen.value ? 'hidden' : '';
};

const closeSidebar = () => {
  isSidebarOpen.value = false;
  document.body.style.overflow = '';
};

const formatDateTime = (date) => {
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const copyToClipboard = async (text) => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      return success;
    }
  } catch (err) {
    logger.error('shop', '复制失败', err);
    return false;
  }
};

const closeContactModal = () => {
  showContactModal.value = false;
  contactType.value = '';
  contactValue.value = '';
};

const getSettlement = () => {
  if (!isLoggedIn.value) {
    showOperationToast('请先登录后再使用积分支付');
    showLoginModal.value = true;
    return;
  }

  if (!canCheckout.value) {
    showOperationToast('购物袋存在暂不可兑换商品，请调整后再结账');
    return;
  }

  if (totalPoints.value <= 0) {
    showOperationToast('当前订单积分异常，请检查后重试');
    return;
  }

  showContactModal.value = true;
};

const buildOrderItemsPayload = () => {
  if (!Array.isArray(shoppingBag.value)) return [];
  return shoppingBag.value.map((item) => ({
    id: Number(item.id),
    quantity: Number(item.quantity),
    selectedSpec: String(item.selectedSpec || ''),
    selectedSpecLabel: String(item.selectedSpecLabel || '')
  }));
};

const resolveOrderErrorMessage = (orderResult) => {
  const code = orderResult?.data?.message || orderResult?.error?.code || '';
  if (code === 'INSUFFICIENT_POINTS') {
    const current = Number(orderResult?.data?.currentPoints || 0);
    const required = Number(orderResult?.data?.requiredPoints || totalPoints.value);
    return `积分不足：当前 ${current}，需要 ${required}`;
  }
  if (code === 'PRODUCT_NOT_EXCHANGEABLE') {
    return '购物袋中包含暂不可兑换商品，请刷新后重试';
  }
  if (code === 'PRODUCT_NOT_FOUND') {
    return '购物袋存在已下架商品，请刷新后重试';
  }
  if (code === 'EMPTY_ITEMS' || code === 'INVALID_ITEM' || code === 'INVALID_QUANTITY') {
    return '订单商品数据异常，请重新加入购物袋后重试';
  }
  if (code === 'INVALID_CONTACT_TYPE' || code === 'INVALID_CONTACT_VALUE') {
    return '联系方式格式不正确，请重新填写';
  }
  return orderResult?.error?.message || '积分支付失败，请稍后重试';
};

const submitContact = async () => {
  if (!contactType.value || !contactValue.value) {
    return;
  }

  if (!isLoggedIn.value) {
    showOperationToast('请先登录后再使用积分支付');
    showLoginModal.value = true;
    return;
  }

  if (!canCheckout.value || totalPoints.value <= 0) {
    showOperationToast('订单内容无效，请检查购物袋后重试');
    return;
  }

  const orderItemsSnapshot = shoppingBag.value.map((item) => ({ ...item }));
  const orderPayloadItems = buildOrderItemsPayload();
  if (!orderPayloadItems.length) {
    showOperationToast('订单商品数据异常，请重新加入后重试');
    return;
  }

  const currentPoints = Number(userInfo.points) || 0;
  const confirmPay = confirm(
    `确认支付约 ${totalPoints.value} 积分吗？\n当前积分（本地）：${currentPoints}`
  );
  if (!confirmPay) {
    return;
  }

  const orderResult = await createShopOrderWithPoints({
    items: orderPayloadItems,
    contactType: contactType.value,
    contactValue: contactValue.value
  });

  if (!orderResult.ok) {
    showOperationToast(resolveOrderErrorMessage(orderResult));
    return;
  }

  const remainingPoints = Number(orderResult.data?.currentPoints || 0);
  const paidPoints = Number(orderResult.data?.pointsDeducted || totalPoints.value);
  const orderNo = orderResult.data?.orderNo || '未知订单号';
  userInfo.points = remainingPoints;

  logger.info('shop', '开始执行结账', { orderNo, paidPoints, remainingPoints });

  const now = new Date();
  const timeString = formatDateTime(now);
  const userId = isLoggedIn.value
    ? `${userInfo.username.toLowerCase().replace(/\s+/g, '-')}-${Math.floor(Math.random() * 10000)}`
    : 'guest-12345';
  const productNames = orderItemsSnapshot.map(item => `${item.title} (${item.selectedSpecLabel}) x${item.quantity}`).join('\n- ');
  const contactLabel = contactType.value === 'qq' ? 'QQ' : '微信';
  const settlementContent = `--- 方块之家周边结算单 ---\n订单号: ${orderNo}\n用户ID: ${userId}\n时间: ${timeString}\n联系方式: ${contactLabel}: ${contactValue.value}\n\n商品清单:\n- ${productNames}\n\n支付方式: 积分支付\n总计积分: ${paidPoints}\n剩余积分: ${remainingPoints}\n------------------------`;

  const success = await copyToClipboard(settlementContent);

  logger.debug('shop', '结算单复制结果', { success });

  const savedContactType = contactType.value;
  const savedContactValue = contactValue.value;

  closeContactModal();

  // 发送邮件通知
  const sendEmail = async () => {
    try {
      const emailData = {
        userId: userId,
        orderNo: orderNo,
        orderTime: timeString,
        items: orderItemsSnapshot,
        totalPrice: `${paidPoints} 积分`,
        paymentMethod: '积分支付',
        buyerName: userInfo?.username || '未登录用户',
        buyerRole: userInfo?.role || '普通用户',
        isLoggedIn: isLoggedIn.value,
        contactType: savedContactType,
        contactValue: savedContactValue
      };

      await sendMerchandiseSettlementEmail(emailData);
      logger.info('shop', '周边结算邮件发送成功', { orderNo });
    } catch (emailError) {
      logger.error('shop', '周边结算邮件发送失败', emailError);
    }
  };

  // 首先确保消息发送通知给所有管理员
  const sendNotification = async () => {
    try {
      const currentUser = isLoggedIn.value ? userInfo.username : '游客';
      const notificationContent = `收到新的周边订单！\n订单号: ${orderNo}\n用户: ${currentUser}\n时间: ${timeString}\n${contactLabel}: ${savedContactValue}\n商品: ${productNames}\n支付方式: 积分支付\n总计积分: ${paidPoints}\n支付后剩余积分: ${remainingPoints}`;

      // 首先尝试获取所有用户并筛选出管理员
      const { data: allProfiles, error: getAllError } = await getAllProfiles();

      if (!getAllError && allProfiles && allProfiles.length > 0) {
        // 筛选出所有管理员
        const adminProfiles = allProfiles.filter(profile => profile.role === 'admin');
        logger.debug('shop', '找到管理员数量', { count: adminProfiles.length });

        if (adminProfiles.length > 0) {
          // 向每个管理员发送通知
          for (const adminProfile of adminProfiles) {
            logger.debug('shop', '向管理员发送订单通知', { username: adminProfile.username });
            const notificationResult = await createNotification(
              adminProfile.id,
              isLoggedIn.value ? userInfo.id : null,
              'system',
              {
                content: notificationContent
              }
            );
            logger.debug('shop', '管理员订单通知发送结果', {
              username: adminProfile.username,
              ok: notificationResult?.ok
            });
          }
        } else {
          logger.warn('shop', '没有找到 role 为 admin 的用户，尝试查找兜底用户');
          // 如果没有找到管理员，尝试特定的用户名
          const usernamesToTry = ['Ryyik', 'ryyik', 'RYYIK'];
          for (const username of usernamesToTry) {
            const result = await getProfileByUsername(username);
            if (!result.error && result.data) {
              logger.debug('shop', '找到兜底管理员用户', { username: result.data.username });
              const notificationResult = await createNotification(
                result.data.id,
                isLoggedIn.value ? userInfo.id : null,
                'system',
                {
                  content: notificationContent
                }
              );
              logger.debug('shop', '兜底管理员订单通知发送结果', { ok: notificationResult?.ok });
              break;
            }
          }
        }
      } else {
        logger.warn('shop', '获取用户列表失败或没有用户，尝试兜底用户', getAllError);
        // 如果获取所有用户失败，尝试特定用户名
        const usernamesToTry = ['Ryyik', 'ryyik', 'RYYIK'];
        for (const username of usernamesToTry) {
          const result = await getProfileByUsername(username);
          if (!result.error && result.data) {
            logger.debug('shop', '找到兜底管理员用户', { username: result.data.username });
            const notificationResult = await createNotification(
              result.data.id,
              isLoggedIn.value ? userInfo.id : null,
              'system',
              {
                content: notificationContent
              }
            );
            logger.debug('shop', '兜底管理员订单通知发送结果', { ok: notificationResult?.ok });
            break;
          }
        }
      }
    } catch (notifyError) {
      logger.error('shop', '发送通知失败', notifyError);
    }
  };

  // 发送邮件和通知但不阻塞主流程
  sendEmail();
  sendNotification();

  clearBag();
  closeSidebar();

  if (success) {
    showOperationToast('积分支付成功，订单请求已发送');
  } else {
    showOperationToast('积分支付成功，订单已提交（复制订单摘要失败）');
  }
};

const showOperationToast = (message) => {
  operationToast.value = { show: true, message };
  setTimeout(() => { operationToast.value.show = false; }, 3000);
};

const selectSpec = (specValue) => {
  selectedSpecValue.value = specValue;
};

const confirmSpecs = async () => {
  if (!currentSpecProduct.value) return;
  if (modalOperationType.value === 'copy') {
    const now = new Date();
    const userId = isLoggedIn.value
      ? `${userInfo.username.toLowerCase().replace(/\s+/g, '-')}-${Math.floor(Math.random() * 10000)}`
      : 'guest-12345';
    const spec = currentSpecProduct.value.specifications.find(s => s.value === selectedSpecValue.value);
    const specLabel = spec ? spec.label : selectedSpecValue.value;
    const copyContent = `用户ID: ${userId}\n时间: ${formatDateTime(now)}\n商品: ${currentSpecProduct.value.title} (${specLabel}) x1`;
    const success = await copyToClipboard(copyContent);
    showOperationToast(success ? '复制成功！' : '复制失败');
  } else {
    const added = actuallyAddToBag(currentSpecProduct.value, selectedSpecValue.value);
    if (!added) return;
    showOperationToast('已加入购物袋');
  }
  closeSpecsModal();
};

const selectCategory = (category) => {
  selectedCategory.value = category;

  // 处理点击跳转到对应区域
  if (category === 'all') {
    isScrollingManual.value = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // 增加超时时间以确保平滑滚动完成
    setTimeout(() => { isScrollingManual.value = false; }, 1200);
  } else {
    const element = document.getElementById(`cat-${category.replace(/\s+/g, '-')}`);
    if (element) {
      isScrollingManual.value = true;

      // 偏移量应略小于 handleScroll 中的 spyOffset
      const offset = window.innerWidth < 768 ? 160 : 200;

      // 使用更可靠的坐标计算
      const rect = element.getBoundingClientRect();
      const elementPosition = rect.top + window.pageYOffset;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });

      // 结束后恢复滚动监听
      setTimeout(() => {
        isScrollingManual.value = false;
      }, 1200);
    }
  }
};

const handleSearch = (e) => {
  const rawKeyword = typeof e === 'string' ? e : (e?.target?.value ?? searchQuery.value);
  const keyword = String(rawKeyword).toLowerCase().trim();
  if (searchTimeout) clearTimeout(searchTimeout);
  if (keyword.length > 0) {
    searchTimeout = setTimeout(() => {
      filteredSuggestions.value = productsData.value.filter(p =>
        p.title.toLowerCase().includes(keyword) || p.description.toLowerCase().includes(keyword)
      );
      showSuggestions.value = true;
    }, 300);
  } else {
    showSuggestions.value = false;
    filteredSuggestions.value = [];
  }
};

const handleSearchFocus = () => {
  if (searchQuery.value.trim()) {
    handleSearch(searchQuery.value);
  }
};

const selectSuggestion = (suggestion) => {
  searchQuery.value = suggestion.title;
  showSuggestions.value = false;
};

const handleSearchOutsideClick = (event) => {
  const searchRoot = searchPillRef.value;
  if (!searchRoot) return;
  if (!searchRoot.contains(event.target)) {
    showSuggestions.value = false;
  }
};

const openProductDetails = (product) => {
  selectedProduct.value = product;
  document.body.style.overflow = 'hidden';
  if (product.specifications?.length > 0) {
    selectedSpecValue.value = product.specifications[0].value;
  }
};

const closeProductDetails = () => {
  selectedProduct.value = null;
  document.body.style.overflow = '';
};

const addToBagFromModal = () => {
  if (!selectedProduct.value) return;
  const added = actuallyAddToBag(selectedProduct.value, selectedSpecValue.value || 'Default');
  if (!added) return;
  showOperationToast('已加入购物袋');
  closeProductDetails();
};

const observeProductCards = () => {
  if (observer) observer.disconnect();
  observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add("visible");
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });

  productCards.value.forEach((card) => {
    if (card) observer.observe(card);
  });
};

const tryOpenProductFromQuery = () => {
  const productId = Number(route.query.product);
  if (!Number.isInteger(productId)) return;
  const product = productsData.value.find((p) => Number(p.id) === productId);
  if (product) {
    openProductDetails(product);
  }
};

// --- 生命周期 & 监听 ---

onMounted(() => {
  window.addEventListener('scroll', handleScroll);
  document.addEventListener('pointerdown', handleSearchOutsideClick);
  document.body.classList.add("is-loaded");

  fetchProducts({ force: true })
    .catch((error) => {
      logger.error('shop', '加载商品数据失败，已使用兜底数据', error);
    })
    .finally(() => {
      observeProductCards();
      tryOpenProductFromQuery();
    });
});

onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleScroll);
  document.removeEventListener('pointerdown', handleSearchOutsideClick);
  if (observer) observer.disconnect();
  if (searchTimeout) clearTimeout(searchTimeout);
});

watch(() => filteredProducts.value.length, () => {
  setTimeout(observeProductCards, 100);
});

watch(searchQuery, (newValue) => {
  if (!String(newValue).trim()) {
    showSuggestions.value = false;
    filteredSuggestions.value = [];
  }
});

// 监听分类变化，确保导航项在可视区域内
watch(selectedCategory, (newCat) => {
  if (newCat) {
    // 使用 setTimeout 确保 DOM 已更新，active 类已切换
    setTimeout(() => {
      const activeItem = document.querySelector('.nav-item.active');
      const container = document.querySelector('.category-nav-scroll');

      if (activeItem && container) {
        const containerRect = container.getBoundingClientRect();
        const itemRect = activeItem.getBoundingClientRect();

        // 计算项中心相对于容器中心的距离
        const itemCenter = itemRect.left + itemRect.width / 2;
        const containerCenter = containerRect.left + containerRect.width / 2;
        const diff = itemCenter - containerCenter;

        // 只有当项不在中心区域（偏差超过容器宽度的 10%）时，才平滑滚动对齐
        if (Math.abs(diff) > containerRect.width * 0.1) {
          const targetScrollLeft = container.scrollLeft + diff;
          container.scrollTo({
            left: targetScrollLeft,
            behavior: 'smooth'
          });
        }
      }
    }, 50);
  }
});
</script>

<style scoped src="./style.scoped.css"></style>
