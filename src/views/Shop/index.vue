<template>
  <div class="shop-page">
    <header class="shop-header">
      <div class="shop-header-inner">
        <div>
          <p class="shop-kicker">BOH STORE</p>
          <h1>方块商店</h1>
        </div>
        <button class="avatar-button" type="button" aria-label="我的方块" @click="handleAvatarClick">
          <img v-if="isLoggedIn && userInfo.avatarUrl" :src="userInfo.avatarUrl" :alt="userInfo.username" width="40" height="40" />
          <span v-else-if="isLoggedIn">{{ avatarInitial }}</span>
          <User v-else :size="20" :stroke-width="1.9" aria-hidden="true" />
        </button>
      </div>

      <label class="shop-search">
        <Search :size="18" :stroke-width="2" aria-hidden="true" />
        <input v-model.trim="searchQuery" type="search" placeholder="搜索商品" @focus="openProductsForSearch" />
        <button v-if="searchQuery" type="button" aria-label="清除搜索" @click="searchQuery = ''">
          <X :size="16" aria-hidden="true" />
        </button>
      </label>
    </header>

    <main class="shop-main">
      <section v-if="isFetchingProducts && allProducts.length === 0" class="catalog-grid" aria-label="正在加载商品">
        <div v-for="item in 6" :key="item" class="product-card product-skeleton" aria-hidden="true">
          <div class="product-media"></div>
          <div class="skeleton-line skeleton-title"></div>
          <div class="skeleton-line skeleton-price"></div>
        </div>
      </section>

      <template v-else-if="activeNavId === 'for-you'">
        <section v-if="featuredProduct" class="mascot-hero">
          <img :src="mascotHeroUrl" alt="BOH 吉祥物公仔" width="800" height="600" />
          <div class="mascot-copy">
            <span class="status-pill">2026 秋季新朋友</span>
            <h2>把方块之家的温度，带回家。</h2>
            <p>{{ featuredProduct.description }}</p>
            <div class="hero-actions">
              <button type="button" class="primary-button" @click="openProductDetails(featuredProduct)">
                查看公仔 <ArrowRight :size="17" aria-hidden="true" />
              </button>
              <button type="button" class="text-button" @click="switchToProducts">浏览全部商品</button>
            </div>
          </div>
        </section>

        <section class="content-section">
          <div class="section-heading">
            <div>
              <p class="section-kicker">本周精选</p>
              <h2>值得带走的方块好物</h2>
            </div>
            <button type="button" class="section-link" @click="switchToProducts">
              查看全部 <ChevronRight :size="17" aria-hidden="true" />
            </button>
          </div>
          <div class="featured-grid">
            <button v-for="product in recommendedProducts" :key="product.id" type="button" class="product-card"
              @click="openProductDetails(product)">
              <span class="product-media">
                <img v-if="product.image" :src="displayImageUrl(product)" :alt="product.title" width="400" height="300" loading="lazy" />
                <Package v-else :size="52" :stroke-width="1.3" aria-hidden="true" />
              </span>
              <span class="product-info">
                <small>{{ product.category }}</small>
                <strong>{{ product.title }}</strong>
                <span>{{ formatPriceDisplay(product) }}</span>
              </span>
            </button>
          </div>
        </section>

        <section class="service-strip" aria-label="商城服务说明">
          <div><PackageCheck :size="22" aria-hidden="true" /><span><strong>积分兑换</strong>使用 BOH 积分结算</span></div>
          <div><ShieldCheck :size="22" aria-hidden="true" /><span><strong>库存同步</strong>商品状态实时更新</span></div>
          <div><MessageCircle :size="22" aria-hidden="true" /><span><strong>订单确认</strong>提交后由管理员联系</span></div>
        </section>
      </template>

      <template v-else-if="activeNavId === 'products'">
        <section class="catalog-section">
          <div class="section-heading catalog-heading">
            <div>
              <p class="section-kicker">全部商品</p>
              <h2>{{ catalogTitle }}</h2>
            </div>
            <span class="result-count">{{ filteredProducts.length }} 件</span>
          </div>

          <div class="category-tabs" role="tablist" aria-label="商品分类">
            <button v-for="category in categoryOptions" :key="category.value" type="button" role="tab"
              :aria-selected="selectedCategory === category.value" :class="{ active: selectedCategory === category.value }"
              @click="selectedCategory = category.value">
              {{ category.label }}
            </button>
          </div>

          <div v-if="filteredProducts.length" class="catalog-grid">
            <button v-for="product in filteredProducts" :key="product.id" type="button" class="product-card"
              @click="openProductDetails(product)">
              <span class="product-media">
                <img v-if="product.image" :src="displayImageUrl(product)" :alt="product.title" width="400" height="300" loading="lazy" />
                <Package v-else :size="52" :stroke-width="1.3" aria-hidden="true" />
              </span>
              <span class="product-info">
                <small>{{ product.category }}</small>
                <strong>{{ product.title }}</strong>
                <span>{{ formatPriceDisplay(product) }}</span>
              </span>
            </button>
          </div>
          <div v-else class="empty-state">
            <SearchX :size="34" aria-hidden="true" />
            <h3>没有找到商品</h3>
            <p>清除搜索或切换分类后再看看。</p>
            <button type="button" class="secondary-button" @click="resetCatalog">查看全部商品</button>
          </div>
        </section>
      </template>

      <template v-else-if="activeNavId === 'explore'">
        <section class="explore-intro">
          <p class="section-kicker">按需要探索</p>
          <h2>四种收藏方式，一次看清。</h2>
          <p>这里只提供分类入口和关键信息，不再重复陈列同一批商品。</p>
        </section>

        <section class="collection-list">
          <button v-for="collection in collectionSummaries" :key="collection.value" type="button"
            class="collection-row" @click="openCollection(collection.value)">
            <span class="collection-icon"><component :is="collection.icon" :size="24" aria-hidden="true" /></span>
            <span class="collection-copy">
              <strong>{{ collection.label }}</strong>
              <small>{{ collection.description }}</small>
            </span>
            <span class="collection-meta">
              {{ collection.count }} 件
              <small>{{ collection.range }}</small>
            </span>
            <ChevronRight :size="20" aria-hidden="true" />
          </button>
        </section>

        <section class="points-panel">
          <div>
            <p class="section-kicker">兑换说明</p>
            <h3>积分就是这里的货币。</h3>
            <p>可兑换商品会明确显示积分价格；暂不可兑换的收藏品仍可浏览详情。</p>
          </div>
          <Coins :size="44" :stroke-width="1.5" aria-hidden="true" />
        </section>
      </template>
    </main>

    <nav class="shop-bottom-nav" aria-label="商城导航">
      <div class="nav-items" :style="navIndicatorStyle">
        <button v-for="item in bottomNavItems" :key="item.id" type="button" class="nav-item"
          :class="{ active: item.id === activeNavId, 'cart-bounce': item.id === 'bag' && cartAnimation }"
          @click="handleBottomNav(item.id)">
          <component :is="item.icon" class="nav-icon" :size="19" :stroke-width="1.9" aria-hidden="true" />
          <span class="nav-label">{{ item.label }}</span>
          <b v-if="item.id === 'bag' && shoppingBagCount" class="bag-badge">{{ shoppingBagCount > 99 ? '99+' : shoppingBagCount }}</b>
        </button>
      </div>
    </nav>

    <Transition name="modal">
      <div v-if="selectedProduct" class="modal-overlay" @click="closeProductDetails">
        <article class="product-sheet" role="dialog" aria-modal="true" :aria-label="selectedProduct.title" @click.stop>
          <button class="close-button" type="button" aria-label="关闭商品详情" @click="closeProductDetails"><X :size="20" /></button>
          <div class="sheet-grabber" aria-hidden="true"></div>
          <div class="detail-media">
            <img v-if="selectedProduct.image" :src="displayImageUrl(selectedProduct)" :alt="selectedProduct.title" width="400" height="400" />
            <Package v-else :size="64" :stroke-width="1.2" aria-hidden="true" />
          </div>
          <div class="detail-content">
            <p class="detail-category">{{ selectedProduct.category }}</p>
            <h2>{{ selectedProduct.title }}</h2>
            <p class="detail-price">{{ formatPriceDisplay(selectedProduct) }}</p>
            <p class="detail-description">{{ selectedProduct.description }}</p>
            <div v-if="selectedProduct.specifications?.length" class="spec-section">
              <span>选择规格</span>
              <div class="spec-options">
                <button v-for="spec in selectedProduct.specifications" :key="spec.value" type="button"
                  :class="{ selected: selectedSpecValue === spec.value }" @click="selectedSpecValue = spec.value">
                  {{ spec.label }}
                </button>
              </div>
            </div>
            <div class="stock-line"><span>库存</span><strong>{{ selectedProduct.stock > 0 ? `${selectedProduct.stock} 件` : '暂时缺货' }}</strong></div>
            <button type="button" class="detail-add-button" :disabled="!isProductExchangeable(selectedProduct) || selectedProduct.stock <= 0"
              @click="addToBagFromModal">
              <ShoppingBag :size="18" aria-hidden="true" />
              {{ isProductExchangeable(selectedProduct) ? '加入购物袋' : '暂不可兑换' }}
            </button>
          </div>
        </article>
      </div>
    </Transition>

    <Transition name="scrim"><div v-if="isSidebarOpen" class="sidebar-scrim" @click="closeSidebar"></div></Transition>
    <Transition name="drawer">
      <aside v-if="isSidebarOpen" class="bag-drawer" aria-label="购物袋">
        <header><div><p class="section-kicker">BOH STORE</p><h2>购物袋</h2></div><button class="close-button" type="button" aria-label="关闭购物袋" @click="closeSidebar"><X :size="20" /></button></header>
        <div v-if="shoppingBag.length === 0" class="empty-bag">
          <ShoppingBag :size="40" :stroke-width="1.4" aria-hidden="true" />
          <h3>购物袋还是空的</h3>
          <p>从商品页挑一件喜欢的吧。</p>
          <button type="button" class="secondary-button" @click="continueShopping">继续购物</button>
        </div>
        <div v-else class="bag-content">
          <TransitionGroup name="bag-item" tag="div" class="bag-items">
            <article v-for="item in shoppingBag" :key="`${item.id}-${item.selectedSpec}`" class="bag-item">
              <div class="bag-item-media"><img :src="displayImageUrl(item)" :alt="item.title" width="80" height="80" /></div>
              <div class="bag-item-copy">
                <h3>{{ item.title }}</h3><p>{{ item.selectedSpecLabel }}</p>
                <div class="bag-item-bottom">
                  <div class="quantity-control">
                    <button type="button" aria-label="减少数量" @click="updateQuantity(item.id, item.selectedSpec, -1)"><Minus :size="15" /></button>
                    <span>{{ item.quantity }}</span>
                    <button type="button" aria-label="增加数量" @click="updateQuantity(item.id, item.selectedSpec, 1)"><Plus :size="15" /></button>
                  </div>
                  <strong>{{ formatPriceDisplay(item) }}</strong>
                </div>
              </div>
            </article>
          </TransitionGroup>
          <footer class="bag-summary">
            <div><span>积分</span><strong>{{ totalPointsText || '—' }}</strong></div>
            <div v-if="totalRmb"><span>现金</span><strong>{{ totalRmbText }}</strong></div>
            <div><span>当前积分</span><span>{{ isLoggedIn ? userPoints : '请先登录' }}</span></div>
            <button type="button" class="checkout-button" :disabled="!canCheckout" @click="getSettlement">提交订单</button>
          </footer>
        </div>
      </aside>
    </Transition>

    <Transition name="modal">
      <div v-if="showContactModal" class="modal-overlay contact-modal-overlay" @click="closeContactModal">
        <section class="contact-sheet" role="dialog" aria-modal="true" aria-label="填写联系方式" @click.stop>
          <button class="close-button" type="button" aria-label="关闭" @click="closeContactModal"><X :size="20" /></button>
          <p class="section-kicker">订单确认</p><h2>留下联系方式</h2><p>管理员会联系你确认兑换与交付方式。</p>
          <div v-if="totalPoints" class="contact-summary-line"><span>积分支付</span><strong>{{ totalPointsText }}</strong></div>
          <div v-if="totalRmb" class="contact-summary-line"><span>现金支付</span><strong>{{ totalRmbText }}</strong></div>
          <div class="contact-types">
            <button type="button" :class="{ selected: contactType === 'qq' }" @click="contactType = 'qq'">QQ</button>
            <button type="button" :class="{ selected: contactType === 'vx' }" @click="contactType = 'vx'">微信</button>
          </div>
          <label><span>{{ contactType === 'vx' ? '微信号' : 'QQ 号' }}</span><input v-model.trim="contactValue" type="text" :placeholder="contactType === 'vx' ? '请输入微信号' : '请输入 QQ 号'" /></label>
          <button class="checkout-button" type="button" :disabled="!contactType || !contactValue || submittingContact" @click="submitContact">确认提交</button>
        </section>
      </div>
    </Transition>

    <Transition name="reveal">
      <div v-if="showAccountOverlay" class="modal-overlay account-overlay" @click="showAccountOverlay = false">
        <div class="account-card-overlay" @click.stop>
          <ShopAccountPanel mode="overlay" @close="showAccountOverlay = false" />
        </div>
      </div>
    </Transition>

    <ShopPaymentSuccessModal
      :visible="Boolean(paymentSuccess)"
      :username="userInfo.username"
      :points="userInfo.points"
      :skin="userInfo.pointsCardSkin"
      :image-url="userInfo.pointsCardImageUrl"
      :order-no="paymentSuccess?.orderNo || ''"
      :payment-summary="paymentSuccess?.paymentSummary || ''"
      @close="closePaymentSuccess"
    />

    <Transition name="toast"><div v-if="operationToast.show" class="operation-toast">{{ operationToast.message }}</div></Transition>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import {
  ArrowRight, ChevronRight, Coins, Compass, Gift, MessageCircle, Minus, Package,
  PackageCheck, Palette, Plus, Search, SearchX, ShieldCheck, ShoppingBag, Sparkles, User, X
} from 'lucide-vue-next';
import mascotHeroUrl from '@/assets/images/mascot-new-landscape-orig.webp';
import { getImageUrl } from '@/utils/asset-helper.js';
import { useAuthStore } from '@/stores/auth';
import { useBagStore } from '@/stores/bag';
import { useProductsStore } from '@/stores/products';
import { createNotification } from '@/utils/api/notifications-api.js';
import { getAllProfiles } from '@/utils/api/auth-api.js';
import { createShopOrderWithPoints, getProfileByUsername } from '@/utils/api/profile-api.js';
import { sendMerchandiseSettlementEmail } from '@/utils/email-service.js';
import { logger } from '@/utils/logger.js';
import { showIsland } from '@/composables/useIsland.js';
import ShopAccountPanel from './ShopAccountPanel.vue';
import ShopPaymentSuccessModal from './ShopPaymentSuccessModal.vue';

const router = useRouter();
const authStore = useAuthStore();
const bagStore = useBagStore();
const productsStore = useProductsStore();
const { isLoggedIn, showLoginModal } = storeToRefs(authStore);
const { userInfo } = authStore;
const { shoppingBag } = storeToRefs(bagStore);
const { productsData, isFetchingProducts } = storeToRefs(productsStore);
const { addToBag, updateBagItemQuantity, clearBag } = bagStore;

const activeNavId = ref('for-you');
const selectedCategory = ref('all');
const searchQuery = ref('');
const selectedProduct = ref(null);
const selectedSpecValue = ref('');
const isSidebarOpen = ref(false);
const cartAnimation = ref(false);
const showContactModal = ref(false);
const contactType = ref('');
const contactValue = ref('');
const submittingContact = ref(false);
const operationToast = ref({ show: false, message: '' });
const paymentSuccess = ref(null);
let toastTimer = null;

// 横屏/竖屏检测 & 账户面板
const isLandscape = ref(false);
const showAccountOverlay = ref(false);
let orientationMql = null;
let orientationHandler = null;

const categoryOptions = [
  { label: '全部', value: 'all' },
  { label: 'BOH Bag', value: 'BOH Bag' },
  { label: '虚拟服务', value: 'BOH 虚拟' },
  { label: '装饰收藏', value: 'BOH 装饰' },
  { label: '专属定制', value: 'BOH 定制' }
];
const collectionDefinitions = [
  { label: 'BOH Bag', value: 'BOH Bag', icon: Package, description: '日常携带与实用周边' },
  { label: '虚拟服务', value: 'BOH 虚拟', icon: Sparkles, description: '地图、身份与线上体验' },
  { label: '装饰收藏', value: 'BOH 装饰', icon: Gift, description: '公仔、纪念册与收藏品' },
  { label: '专属定制', value: 'BOH 定制', icon: Palette, description: '为你制作的独有作品' }
];
const bottomNavItems = [
  { id: 'for-you', label: '为你推荐', icon: Sparkles },
  { id: 'products', label: '产品', icon: Package },
  { id: 'explore', label: '深入探索', icon: Compass },
  { id: 'bag', label: '购物袋', icon: ShoppingBag }
];

const allProducts = computed(() => productsData.value || []);
const featuredProduct = computed(() => allProducts.value.find((product) => Number(product.id) === 501) || allProducts.value[0] || null);
const recommendedProducts = computed(() => allProducts.value.filter((product) => product.id !== featuredProduct.value?.id).slice(0, 6));
const filteredProducts = computed(() => {
  const query = searchQuery.value.toLocaleLowerCase();
  return allProducts.value.filter((product) => {
    const matchesCategory = selectedCategory.value === 'all' || product.category === selectedCategory.value;
    const matchesQuery = !query || `${product.title} ${product.description} ${product.category}`.toLocaleLowerCase().includes(query);
    return matchesCategory && matchesQuery;
  });
});
const catalogTitle = computed(() => searchQuery.value ? `“${searchQuery.value}”的搜索结果` : (categoryOptions.find((item) => item.value === selectedCategory.value)?.label || '全部商品'));
const collectionSummaries = computed(() => collectionDefinitions.map((definition) => {
  const items = allProducts.value.filter((product) => product.category === definition.value);
  const points = items.map((item) => parsePointsCost(item.points_cost)).filter((value) => value !== null);
  const range = points.length ? `${Math.min(...points)}–${Math.max(...points)} 积分` : '浏览收藏';
  return { ...definition, count: items.length, range };
}));
const navIndicatorStyle = computed(() => {
  const index = Math.max(0, bottomNavItems.findIndex((item) => item.id === activeNavId.value));
  return {
    '--nav-count': bottomNavItems.length,
    '--active-nav-center': `${((index + 0.5) / bottomNavItems.length) * 100}%`
  };
});
const avatarInitial = computed(() => String(userInfo.username || '?').trim().charAt(0).toUpperCase());
const shoppingBagCount = computed(() => shoppingBag.value.reduce((sum, item) => sum + item.quantity, 0));
const totalPoints = computed(() => shoppingBag.value.reduce((sum, item) => sum + (parsePointsCost(item.points_cost) || 0) * item.quantity, 0));
const totalPointsText = computed(() => totalPoints.value ? `${totalPoints.value} 积分` : '');
const totalRmb = computed(() => shoppingBag.value.reduce((sum, item) => {
  const rmb = Number(item.rmb_price);
  return sum + (Number.isFinite(rmb) && rmb > 0 ? rmb * item.quantity : 0);
}, 0));
const totalRmbText = computed(() => totalRmb.value > 0 ? `¥${(totalRmb.value / 100).toFixed(2)}` : '');
const userPoints = computed(() => `${Number(userInfo.points) || 0} 积分`);
const canCheckout = computed(() => {
  if (!shoppingBag.value.length) return false;
  return shoppingBag.value.every((item) => {
    if (item.is_purchasable === false) return false;
    const mode = String(item.payment_mode || 'points_only');
    if (mode === 'points_only') return parsePointsCost(item.points_cost) !== null;
    if (mode === 'rmb_only') return Number(item.rmb_price) > 0;
    if (mode === 'combined') return parsePointsCost(item.points_cost) !== null && Number(item.rmb_price) > 0;
    return false;
  });
});

function parsePointsCost(value) {
  const points = Number(value);
  return Number.isFinite(points) && points > 0 ? Math.round(points) : null;
}
function formatRmb(value) {
  const cents = Number(value);
  if (!Number.isFinite(cents) || cents <= 0) return null;
  return `¥${(cents / 100).toFixed(2)}`;
}
function formatPriceDisplay(product) {
  const mode = String(product?.payment_mode || 'points_only');
  const points = parsePointsCost(product?.points_cost);
  const rmb = formatRmb(product?.rmb_price);

  if (mode === 'points_only') return points !== null ? `${points} 积分` : '暂不可兑换';
  if (mode === 'rmb_only') return rmb || '暂不可购买';
  if (mode === 'combined') {
    const parts = [];
    if (points !== null) parts.push(`${points} 积分`);
    if (rmb) parts.push(rmb);
    return parts.length ? parts.join(' + ') : '暂不可兑换';
  }
  return '暂不可兑换';
}
const isProductExchangeable = (product) => {
  if (product?.is_purchasable === false) return false;
  const mode = String(product?.payment_mode || 'points_only');
  if (mode === 'points_only') return parsePointsCost(product?.points_cost) !== null;
  if (mode === 'rmb_only') return Number(product?.rmb_price) > 0;
  if (mode === 'combined') return parsePointsCost(product?.points_cost) !== null && Number(product?.rmb_price) > 0;
  return false;
};
const displayImageUrl = (product) => Number(product?.id) === 501 ? mascotHeroUrl : getImageUrl(product?.image);

function handleBottomNav(id) {
  if (id === 'bag') return toggleSidebar();
  activeNavId.value = id;
  if (id !== 'products') searchQuery.value = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function switchToProducts() { activeNavId.value = 'products'; selectedCategory.value = 'all'; window.scrollTo({ top: 0, behavior: 'smooth' }); }
function openProductsForSearch() { activeNavId.value = 'products'; }
function openCollection(value) { selectedCategory.value = value; activeNavId.value = 'products'; window.scrollTo({ top: 0, behavior: 'smooth' }); }
function resetCatalog() { searchQuery.value = ''; selectedCategory.value = 'all'; }
function handleAvatarClick() {
  if (!isLoggedIn.value) { showLoginModal.value = true; return; }
  if (isLandscape.value) {
    showAccountOverlay.value = true;
  } else {
    router.push('/shop/account');
  }
}

function openProductDetails(product) {
  selectedProduct.value = product;
  selectedSpecValue.value = product.specifications?.[0]?.value || 'Default';
  document.body.style.overflow = 'hidden';
}
function closeProductDetails() { selectedProduct.value = null; selectedSpecValue.value = ''; document.body.style.overflow = ''; }
function addToBagFromModal() {
  const product = selectedProduct.value;
  if (!product || !isProductExchangeable(product)) return;
  const spec = product.specifications?.find((item) => item.value === selectedSpecValue.value);
  const result = addToBag(product, selectedSpecValue.value || 'Default', spec?.label || '默认规格');
  if (!result?.ok) return showOperationToast('该商品暂不可兑换');
  cartAnimation.value = true;
  setTimeout(() => { cartAnimation.value = false; }, 650);
  closeProductDetails();
  showOperationToast('已加入购物袋');
}
function toggleSidebar() { isSidebarOpen.value = !isSidebarOpen.value; document.body.style.overflow = isSidebarOpen.value ? 'hidden' : ''; }
function closeSidebar() { isSidebarOpen.value = false; document.body.style.overflow = ''; }
function continueShopping() { closeSidebar(); switchToProducts(); }
function updateQuantity(id, spec, delta) { updateBagItemQuantity(id, spec, delta); }
function showShopIsland(title, message = '', icon = 'success', durationMs = 3000, onAction = null) {
  try {
    const payload = { title, message, icon, durationMs };
    if (typeof onAction === 'function') payload.onAction = onAction;
    return showIsland.notify(payload);
  } catch {
    return false;
  }
}
function showOperationToast(message) {
  const text = String(message || '');
  const isError = /不可兑换|无效|不足|失败|错误|请先登录|请检查/.test(text);
  const icon = isError ? 'warning' : 'success';
  let title = text;
  let msg = '';
  // 精细化标题映射
  if (text === '已加入购物袋') { title = '已加入购物袋'; msg = selectedProduct.value?.title ? String(selectedProduct.value.title).slice(0, 32) : ''; }
  else if (text === '订单已提交') { title = '订单已提交'; msg = '管理员会尽快与你确认'; }
  else if (text === '订单已提交，但邮件通知发送失败') { title = '订单已提交'; msg = '邮件通知发送失败'; }
  else if (text.startsWith('积分不足')) { title = '积分不足'; msg = text.replace(/^积分不足[:：]?\s*/, ''); }
  else if (text === '该商品暂不可兑换') { title = '暂不可兑换'; msg = '该商品当前不可兑换'; }
  else if (text === '请先登录后再提交订单') { title = '请先登录'; msg = '登录后可提交订单'; }
  else if (text === '订单内容无效，请检查购物袋') { title = '订单无效'; msg = '请检查购物袋'; }
  else if (text.length > 24) { title = text.slice(0, 24); msg = text.slice(24); }
  const ok = showShopIsland(title, msg, icon, isError ? 3600 : 3000, isError && text === '请先登录后再提交订单' ? () => { showLoginModal.value = true; } : null);
  if (ok) return;
  if (toastTimer) clearTimeout(toastTimer);
  operationToast.value = { show: true, message };
  toastTimer = setTimeout(() => { operationToast.value.show = false; }, 2600);
}


function closeContactModal() { showContactModal.value = false; contactType.value = ''; contactValue.value = ''; }
function closePaymentSuccess() {
  paymentSuccess.value = null;
  document.body.style.overflow = '';
}
function getSettlement() {
  if (!isLoggedIn.value) { closeSidebar(); showLoginModal.value = true; return showOperationToast('请先登录后再提交订单'); }
  if (!canCheckout.value) return showOperationToast('订单内容无效，请检查购物袋');
  showContactModal.value = true;
}
const buildOrderItemsPayload = () => shoppingBag.value.map((item) => ({
  id: Number(item.id), quantity: Number(item.quantity), selectedSpec: String(item.selectedSpec || ''), selectedSpecLabel: String(item.selectedSpecLabel || '')
}));
function resolveOrderErrorMessage(result) {
  const code = result?.data?.message || result?.error?.code || '';
  if (code === 'INSUFFICIENT_POINTS') return `积分不足：当前 ${Number(result?.data?.currentPoints || 0)}，需要 ${Number(result?.data?.requiredPoints || totalPoints.value)}`;
  if (code === 'PRODUCT_NOT_EXCHANGEABLE') return '购物袋中包含暂不可兑换商品';
  if (code === 'PRODUCT_NOT_FOUND') return '购物袋存在已下架商品';
  if (code.startsWith('INVALID_') || code === 'EMPTY_ITEMS') return '订单信息不完整，请检查后重试';
  return result?.error?.message || '积分支付失败，请稍后重试';
}
const formatDateTime = (date) => {
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};
async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (error) { logger.warn('shop', '复制订单摘要失败', error); return false; }
}
async function notifyAdministrators(content) {
  try {
    const { data: profiles, error } = await getAllProfiles();
    const admins = !error && profiles?.length ? profiles.filter((profile) => profile.role === 'admin') : [];
    if (admins.length) {
      await Promise.all(admins.map((admin) => createNotification(admin.id, isLoggedIn.value ? userInfo.id : null, 'system', { content })));
      return;
    }
    for (const username of ['Ryyik', 'ryyik', 'RYYIK']) {
      const result = await getProfileByUsername(username);
      if (!result.error && result.data) {
        await createNotification(result.data.id, isLoggedIn.value ? userInfo.id : null, 'system', { content });
        return;
      }
    }
  } catch (error) { logger.error('shop', '发送管理员通知失败', error); }
}
async function submitContact() {
  if (submittingContact.value) return;
  if (!contactType.value || !contactValue.value || !canCheckout.value) return;
  submittingContact.value = true;
  try {
    const result = await createShopOrderWithPoints({ items: buildOrderItemsPayload(), contactType: contactType.value, contactValue: contactValue.value });
    if (!result.ok) return showOperationToast(resolveOrderErrorMessage(result));

    const paidPoints = Number(result.data?.pointsDeducted || 0);
    const paidRmb = result.data?.rmbTotal ? Number(result.data.rmbTotal) : 0;
    const remainingPoints = Number(result.data?.currentPoints || userInfo.points);
    const orderNo = result.data?.orderNo || '未知订单号';
    const time = formatDateTime(new Date());
    const contactLabel = contactType.value === 'qq' ? 'QQ' : '微信';
    const paymentMode = result.data?.paymentMode || 'points_only';
    const orderedItems = Array.isArray(result.data?.items) && result.data.items.length ? result.data.items : shoppingBag.value;
    const itemText = orderedItems.map((item) => {
      const specification = item.selected_spec_label || item.selectedSpecLabel || '默认规格';
      return `${item.title} (${specification}) x${item.quantity}`;
    }).join('\n- ');

    let paymentSummary = '';
    if (paymentMode === 'points_only') paymentSummary = `积分: ${paidPoints}`;
    else if (paymentMode === 'rmb_only') paymentSummary = `现金: ¥${(paidRmb / 100).toFixed(2)}`;
    else paymentSummary = `积分: ${paidPoints} + 现金: ¥${(paidRmb / 100).toFixed(2)}`;

    const summary = `--- 方块之家周边结算单 ---\n订单号: ${orderNo}\n用户: ${userInfo.username}\n时间: ${time}\n${contactLabel}: ${contactValue.value}\n\n支付方式: ${paymentSummary}\n\n商品清单:\n- ${itemText}\n\n剩余积分: ${remainingPoints}`;
    userInfo.points = remainingPoints;
    await copyToClipboard(summary);
    closeContactModal(); clearBag(); closeSidebar();
    paymentSuccess.value = { orderNo, paymentSummary };
    document.body.style.overflow = 'hidden';
    void sendMerchandiseSettlementEmail({ orderId: result.data.orderId }).catch((error) => {
      logger.error('shop', '订单邮件发送失败', error);
      showOperationToast('订单已提交，但邮件通知发送失败');
    });
    void notifyAdministrators(`收到新的周边订单！\n订单号: ${orderNo}\n用户: ${userInfo.username}\n支付: ${paymentSummary}\n商品: ${itemText}`);
    showOperationToast('订单已提交');
  } finally {
    submittingContact.value = false;
  }
}

onMounted(() => {
  productsStore.fetchProducts({ force: true }).catch((error) => logger.error('shop', '商品加载失败', error));
  orientationMql = window.matchMedia('(orientation: landscape)');
  isLandscape.value = orientationMql.matches;
  orientationHandler = (e) => { isLandscape.value = e.matches; };
  orientationMql.addEventListener('change', orientationHandler);
});
onBeforeUnmount(() => {
  if (toastTimer) clearTimeout(toastTimer);
  document.body.style.overflow = '';
  bagStore.flushShoppingBag();
  if (orientationMql && orientationHandler) {
    orientationMql.removeEventListener('change', orientationHandler);
    orientationMql = null;
    orientationHandler = null;
  }
});
</script>

<style scoped src="./style.scoped.css"></style>
