<template>
  <div class="store-page">
    <header class="store-head">
      <div class="head-copy">
        <p class="head-kicker">BOH STORE</p>
        <h1>周边</h1>
      </div>
      <button
        type="button"
        class="avatar-btn"
        :aria-label="isLoggedIn ? '打开订单' : '登录'"
        @click="goBag"
      >
        <img
          v-if="isLoggedIn && userInfo.avatarUrl"
          :src="userInfo.avatarUrl"
          :alt="userInfo.username"
          width="38"
          height="38"
        />
        <span v-else-if="isLoggedIn">{{ avatarInitial }}</span>
        <User v-else :size="18" :stroke-width="1.9" aria-hidden="true" />
      </button>
    </header>

    <nav class="store-tabs" role="tablist" aria-label="周边分区">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.id"
        :class="{ active: activeTab === tab.id }"
        @click="switchTab(tab.id)"
      >
        {{ tab.label }}
        <span v-if="tab.id === 'bag' && bagCount" :key="bagCount" class="tab-count">{{
          bagCount
        }}</span>
      </button>
    </nav>

    <main class="store-main">
      <!-- 页面切换动效（2026-11-01 用户口径）：
           key 绑 activeTab ⇒ 切「产品 / 抽奖 / 购物袋 / 地址」时这一层整体重建，
           .store-panel 的进场动画（淡入 + 6px 上浮）随之重放。
           与 UserSpace 的 .tab-page 同一套路：**只进场、无离场** ——
           不做 mode="out-in"，否则每次切 Tab 都要先白等 150ms 的离场。
           副作用是滚动位置保留（外层没重建），正是想要的手感。 -->
      <section :key="activeTab" class="store-panel">
        <template v-if="activeTab === 'products'">
          <p v-if="fetchError && allProducts.length" class="store-hint" role="status">
            当前为内置商品数据，价格可能已变动。联网后刷新即可。
          </p>

          <!-- 2026-11-01 用户口径：「周边不再提供筛选，并且加入搜索框」。
               原分类 chip（全部 / BOH Bag / 虚拟服务 / 装饰收藏 / 专属定制）整体下掉 ——
               在售 SKU 只有个位数，分类反而把「全部」切成几段空列表；
               搜索是更直接的找东西方式（按标题 / 描述 / 分类做包含匹配）。 -->
          <div class="store-search">
            <Search :size="16" :stroke-width="1.8" aria-hidden="true" />
            <input
              v-model.trim="searchKeyword"
              type="search"
              class="search-input"
              placeholder="搜索周边"
              aria-label="搜索周边"
            />
            <button
              v-if="searchKeyword"
              type="button"
              class="search-clear shop-fade-in"
              aria-label="清空搜索"
              @click="searchKeyword = ''"
            >
              <X :size="15" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>

          <div v-if="isFetchingProducts && !allProducts.length" class="product-grid">
            <div v-for="item in 6" :key="item" class="p-card p-skeleton" aria-hidden="true">
              <span class="p-media"></span>
              <span class="p-meta"
                ><span class="p-line"></span><span class="p-line short"></span
              ></span>
            </div>
          </div>

          <!-- 搜索过滤是**增删**，不是整表重建 ⇒ 用 TransitionGroup 而不是 :key 重建：
               留下的卡片走 .shop-card-move（FLIP 平滑归位），被过滤掉的走 leave（缩小淡出），
               新出现的按 --i 逐个上浮。2026-11-02 用户口径：「确保没有任何硬切的部分」。 -->
          <TransitionGroup
            v-else-if="filteredProducts.length"
            name="shop-card"
            tag="div"
            class="product-grid"
          >
            <button
              v-for="(product, index) in filteredProducts"
              :key="product.id"
              type="button"
              class="p-card"
              :style="{ '--i': index }"
              @click="openProductDetails(product, $event)"
            >
              <span class="p-media">
                <img
                  v-if="product.image && !productImageFailed(product)"
                  :src="displayImageUrl(product)"
                  :alt="product.title"
                  loading="lazy"
                  :class="{ 'is-loading': !isImageLoaded(`product-${product.id}`) }"
                  @load="markImageLoaded(`product-${product.id}`)"
                  @error="markProductImageFailed(`product-${product.id}`)"
                />
                <Package v-else :size="34" :stroke-width="1.2" aria-hidden="true" />
              </span>
              <span class="p-meta">
                <span class="p-name">{{ product.title }}</span>
                <span class="p-price">{{ formatPriceDisplay(product) }}</span>
              </span>
            </button>
          </TransitionGroup>

          <div v-else class="store-empty shop-fade-in">
            <p>{{ searchKeyword ? `没有找到「${searchKeyword}」` : '还没有周边' }}</p>
            <button
              v-if="searchKeyword"
              type="button"
              class="ghost-btn"
              @click="searchKeyword = ''"
            >
              清空搜索
            </button>
          </div>
        </template>

        <LotteryPanel v-else-if="activeTab === 'lottery'" />

        <BagPanel
          v-else-if="activeTab === 'bag'"
          @checkout="startCheckout"
          @browse="switchTab('products')"
        />

        <OrderPanel
          v-else-if="activeTab === 'order'"
          @open-address="switchTab('address')"
          @notify="showOperationToast"
        />

        <!-- 地址与「产品 / 抽奖 / 购物袋 / 订单」平级（2026-11-02 用户口径：
             「地址是单独的子 Tab，不收在购物袋里」）—— 它是礼物与实物订单的前提条件，
             独立成区才能在商品页直接找到，而不是先猜它在购物袋里再翻一层。
             放在最后当兜底：syncTabFromRoute 已把未知 tab 归到 products，这里不会误命中。 -->
        <AddressPanel v-else />
      </section>
    </main>

    <ProductDetailSheet
      v-if="selectedProduct"
      :product="selectedProduct"
      :spec-value="selectedSpecValue"
      :origin-key="selectedOriginKey"
      :disabled="!isProductExchangeable(selectedProduct) || Number(selectedProduct.stock) <= 0"
      @update:spec-value="selectedSpecValue = $event"
      @close="closeProductDetails"
      @add="addToBagFromDetail"
    />

    <!-- 确认订单（2026-11-03）
         原来是「确认收货信息」表单弹窗：点结算只弹地址表单，用户看不到买什么、付多少。
         现在是一个整页的确认订单层：地址卡 / 商品清单 / 金额明细 / 预检 / 固定底栏，
         形态与 ProductDetailSheet 同源（竖屏整页、横屏居中弹窗）。 -->
    <CheckoutSheet
      :visible="showCheckout"
      :bag-items="shoppingBag"
      :products="allProducts"
      :points-balance="Number(userInfo.points) || 0"
      :user-id="userInfo.id || ''"
      :submitting="submittingContact"
      :fallback-address="fallbackAddress"
      @update:address="checkoutAddress = $event"
      @submit="submitContact"
      @close="closeCheckout"
      @manage-addresses="manageAddressesFromCheckout"
      @remove-invalid="removeInvalidBagItems"
    />

    <ShopPaymentSuccessModal
      :visible="Boolean(paymentSuccess)"
      :username="userInfo.username"
      :points="userInfo.points"
      :skin="userInfo.pointsCardSkin"
      :image-url="userInfo.pointsCardImageUrl"
      :order-no="paymentSuccess?.orderNo || ''"
      :payment-summary="paymentSuccess?.paymentSummary || ''"
      :item-summary="paymentSuccess?.itemSummary || ''"
      :shipping-to="paymentSuccess?.shippingTo || ''"
      :cash-due="Number(paymentSuccess?.cashDue || 0)"
      :payment-mode="paymentSuccess?.paymentMode || 'points_only'"
      :email-state="paymentSuccess?.emailState || 'pending'"
      @close="closePaymentSuccess"
      @view-orders="goOrdersFromSuccess"
      @continue="continueShoppingFromSuccess"
    />

    <Transition name="toast">
      <div v-if="operationToast.show" class="operation-toast">{{ operationToast.message }}</div>
    </Transition>

    <UserSpaceSideRail
      :nav-items="BOTTOM_NAV_ITEMS"
      current-tab="shop"
      :has-unread-messages="hasUnreadMessages"
      :unread-count="unreadCount"
      :current-theme="currentTheme"
      :is-logged-in="isLoggedIn"
      @nav-click="handleNavClick"
      @action="handleRailAction"
    />

    <UserSpaceBottomNav
      :visible="true"
      :hidden="bottomNavHidden"
      :nav-items="BOTTOM_NAV_ITEMS"
      current-tab="shop"
      :nav-indicator-style="navIndicatorStyle"
      :has-unread-messages="hasUnreadMessages"
      :unread-count="unreadCount"
      @nav-click="handleNavClick"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { Package, Search, User, X } from 'lucide-vue-next';
import mascotHeroUrl from '@/assets/images/mascot-new-landscape-orig.webp';
import { resolveDbCardImage } from '@/utils/db-image-url.js';
import { useImageFailure } from '@/composables/useImageFailure.js';
import { useImageLoaded } from '@/composables/useImageLoaded.js';
import { useAuthStore } from '@/stores/auth';
import { useBagStore } from '@/stores/bag';
import { useProductsStore } from '@/stores/products';
import { createNotification } from '@/utils/api/notifications-api.js';
import { getAllProfiles } from '@/utils/api/auth-api.js';
import {
  createShopOrderWithPoints,
  getProfileByUsername,
  updateProfile,
} from '@/utils/api/profile-api.js';
import { sendMerchandiseSettlementEmail } from '@/utils/email-service.js';
import { logger } from '@/utils/logger.js';
import { showIsland } from '@/composables/useIsland.js';
import { captureOrigin } from '@/utils/motion-origin.js';
import { composeAddress } from '@/utils/address-parse.js';
import { themeManager } from '@/utils/theme-manager.js';
import { logoutAndReload } from '@/utils/logout-and-reload.js';
import { BOTTOM_NAV_ITEMS } from '@/config/bottom-nav';
import { getNotificationStoreRef } from '@/stores/notification-loader';
import UserSpaceBottomNav from '@/views/user-center/UserSpace/components/UserSpaceBottomNav.vue';
import UserSpaceSideRail from '@/views/user-center/UserSpace/components/UserSpaceSideRail.vue';
import { useScrollDirectionHide } from '@/views/user-center/UserSpace/composables/useScrollDirectionHide.js';
import ShopPaymentSuccessModal from './ShopPaymentSuccessModal.vue';
import ProductDetailSheet from './ProductDetailSheet.vue';
import CheckoutSheet from './CheckoutSheet.vue';
import { buildPaymentSummary } from './checkout-summary.js';
import LotteryPanel from './LotteryPanel.vue';
import BagPanel from './BagPanel.vue';
import OrderPanel from './OrderPanel.vue';
import AddressPanel from './AddressPanel.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const bagStore = useBagStore();
const productsStore = useProductsStore();
const { isLoggedIn, showLoginModal } = storeToRefs(authStore);
const { userInfo } = authStore;
const { shoppingBag } = storeToRefs(bagStore);
const { productsData, isFetchingProducts, fetchError } = storeToRefs(productsStore);
const { addToBag, clearBag } = bagStore;

/* 2026-11-02 用户口径：「把订单也做成一个子 Tab，放在购物袋后面」——
   购物袋是「还没买的」，订单是「已经买的」，诉求不同（去结算 / 查进度），
   挤在一个二级分段里每次都得先切一下，不如各占一个分区。 */
const tabs = [
  { id: 'products', label: '产品' },
  { id: 'lottery', label: '抽奖' },
  { id: 'bag', label: '购物袋' },
  { id: 'order', label: '订单' },
  { id: 'address', label: '地址' },
];

/* 值域单一真源：?tab= 的合法值与顶栏同源，加/删分区只改上面那一处 */
const SHOP_TAB_IDS = tabs.map((tab) => tab.id);

const activeTab = ref('products');
const searchKeyword = ref('');
const selectedProduct = ref(null);
const selectedSpecValue = ref('');
const selectedOriginKey = ref('');
const showCheckout = ref(false);
/* 结算页选中的收货地址（由 CheckoutSheet 单向告知）。
   id 为空 = 来自 profiles 的历史回落地址，不写地址簿、只写 profiles。 */
const checkoutAddress = ref(null);
/* 老用户兜底：地址簿为空时用资料里的三条 shipping_* 拼出来的地址 */
const fallbackAddress = ref(null);
const submittingContact = ref(false);
const operationToast = ref({ show: false, message: '' });
const paymentSuccess = ref(null);
let toastTimer = null;

const allProducts = computed(() => productsData.value || []);
/* 搜索取代了原来的分类 chip：按标题 / 描述 / 分类做包含匹配（大小写不敏感），
   空关键词 = 全量。没有分页，交集只有个位数 SKU，不必做防抖。 */
const filteredProducts = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase();
  if (!keyword) return allProducts.value;
  return allProducts.value.filter((product) =>
    [product.title, product.description, product.category]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(keyword)),
  );
});
const bagCount = computed(() => shoppingBag.value.reduce((sum, item) => sum + item.quantity, 0));
const avatarInitial = computed(() =>
  String(userInfo.username || '?')
    .trim()
    .charAt(0)
    .toUpperCase(),
);

const navIndicatorStyle = computed(() => {
  const index = Math.max(
    0,
    BOTTOM_NAV_ITEMS.findIndex((item) => item.id === 'shop'),
  );
  return {
    '--nav-count': BOTTOM_NAV_ITEMS.length,
    '--active-nav-center': `${((index + 0.5) / BOTTOM_NAV_ITEMS.length) * 100}%`,
  };
});

const notificationStoreRef = getNotificationStoreRef();
const unreadCount = computed(() => notificationStoreRef.value?.unreadCount || 0);
const hasUnreadMessages = computed(() => unreadCount.value > 0);

/* 底栏「下滑隐藏 / 上滑显现」——2026-11-01 修：周边页虽然挂了同一颗 UserSpaceBottomNav，
   但从来没人给它传 hidden，于是首页/我页都有的这条手势在周边页成了死交互。
   复用同一份 composable（滚动容器自动判定，/shop 是 body 滚动 ⇒ document.scrollingElement），
   不另写一套阈值 —— 三个宿主的隐藏手感必须一致。
   forceVisible 恒 false：周边页没有「底栏还没就位」的入场期。 */
const { hidden: bottomNavHidden } = useScrollDirectionHide({
  forceVisible: computed(() => false),
});

const handleNavClick = (itemId) => {
  if (itemId === 'shop') {
    switchTab('products');
    return;
  }
  const item = BOTTOM_NAV_ITEMS.find((entry) => entry.id === itemId);
  if (!item) return;
  if (route.path === item.route) return;
  router.push(item.route);
};

/* 左栏「更多」菜单要按当前主题显示「深色 / 浅色模式」，所以跟一份只读的主题态。
   ⚠️ 监听的是 themeManager 派发的 window 事件（全站唯一真源），不在本地改属性。 */
const currentTheme = ref(themeManager.getTheme());
const handleThemeChanged = () => {
  currentTheme.value = themeManager.getTheme();
};

/* 横屏左栏的便捷 / 工具区动作分发（与 Home / Cloud+ / UserSpaceMain 同一套语义）。
   周边页没有本地发布器，也没有资产页 —— 都按「全局可达落点」跳走：
     发布 → 首页论坛层并带 ?compose=1 深链（论坛是发布的唯一宿主）
     资产 → 「我」页的资产 tab（2026-10-26 全站收敛后的统一落点） */
const handleRailAction = async (actionId) => {
  switch (actionId) {
    case 'compose':
      router.push({ path: '/', query: { view: 'latest', compose: '1' } });
      break;
    case 'assets':
      router.push('/user-space?tab=assets');
      break;
    case 'theme':
      themeManager.toggle();
      break;
    case 'home':
      router.push('/');
      break;
    case 'logout':
      await logoutAndReload(authStore);
      break;
    default:
      break;
  }
};

const parsePointsCost = (value) => {
  const points = Number(value);
  return Number.isFinite(points) && points > 0 ? Math.round(points) : null;
};
const formatRmb = (value) => {
  const cents = Number(value);
  if (!Number.isFinite(cents) || cents <= 0) return null;
  return `¥${(cents / 100).toFixed(2)}`;
};
const formatPriceDisplay = (product) => {
  const points = parsePointsCost(product?.points_cost);
  const rmb = formatRmb(product?.rmb_price);
  const parts = [];
  if (points !== null) parts.push(`${points} 积分`);
  if (rmb) parts.push(rmb);
  return parts.length ? parts.join(' + ') : '暂无报价';
};
const isProductExchangeable = (product) => {
  if (product?.is_purchasable === false) return false;
  const mode = String(product?.payment_mode || 'points_only');
  if (mode === 'points_only') return parsePointsCost(product?.points_cost) !== null;
  if (mode === 'rmb_only') return Number(product?.rmb_price) > 0;
  if (mode === 'combined')
    return parsePointsCost(product?.points_cost) !== null && Number(product?.rmb_price) > 0;
  return false;
};
/* 商品图三种形态混存（2026-11-02 线上实测）：
     ① `mascot-new-landscape-orig.webp` —— 裸文件名，必须走 getImageUrl 找打包产物；
     ② `https://res.cloudinary.com/...`  —— **中国大陆不可达**，必须改写自建 CDN；
     ③ `https://cdn.blockofhome.cn/...`  —— 已是 CDN，原样。
   resolveDbCardImage 三件事一起做（本地解析 → CDN 改写 → 卡面尺寸变换）。
   只调 getImageUrl 时 ② 会裂图：线上 8 周年海报那张就是这样挂的。
   id=501（围巾小狗）单独走横版原图 —— 产品图框是竖构图，那只狗放进去会被裁掉半张脸。 */
const displayImageUrl = (product) =>
  Number(product?.id) === 501 ? mascotHeroUrl : resolveDbCardImage(product?.image);
/* 图片挂了就退回 Package 占位图标，别在卡里留一个碎图问号 */
const { isFailed: isProductImageFailed, markFailed: markProductImageFailed } = useImageFailure();
const productImageFailed = (product) => isProductImageFailed(`product-${product?.id}`);
/* 解码完成再淡入：灰底 → 一张图的那一下硬跳，是周边页最容易被看见的「硬切」 */
const { isImageLoaded, markImageLoaded } = useImageLoaded();

const totalPoints = computed(() =>
  shoppingBag.value.reduce(
    (sum, item) => sum + (parsePointsCost(item.points_cost) || 0) * item.quantity,
    0,
  ),
);
/* 只有「能不能进结算」这一个判据留在页面上；金额明细全在 CheckoutSheet 里按实时价算
   （总量的第二份实现会和它漂移，所以这里不再留 totalRmb）。 */
const canCheckout = computed(() => {
  if (!shoppingBag.value.length) return false;
  return shoppingBag.value.every((item) => isProductExchangeable(item));
});

const switchTab = (tabId) => {
  activeTab.value = tabId;
  router.replace({ path: '/shop', query: tabId === 'products' ? {} : { tab: tabId } });
  window.scrollTo({ top: 0, behavior: 'auto' });
};

/* 右上角头像 → 订单分区（2026-11-02 订单独立成 Tab 后不再跳独立页 /shop/bag?view=orders：
   那是"购物袋里的第二段"时代的落点，现在点一下就是同一个页面的另一分区，少一次整页跳转） */
const goBag = () => {
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }
  switchTab('order');
};

const openProductDetails = (product, event) => {
  selectedProduct.value = product;
  selectedSpecValue.value = product.specifications?.[0]?.value || 'Default';
  selectedOriginKey.value = `shop-product:${product.id}`;
  const card = event?.currentTarget;
  if (card) captureOrigin(selectedOriginKey.value, card, { radius: 16 });
  document.body.style.overflow = 'hidden';
};
const closeProductDetails = () => {
  selectedProduct.value = null;
  selectedSpecValue.value = '';
  document.body.style.overflow = '';
};
const addToBagFromDetail = () => {
  const product = selectedProduct.value;
  if (!product || !isProductExchangeable(product)) return;
  const spec = product.specifications?.find((item) => item.value === selectedSpecValue.value);
  const result = addToBag(product, selectedSpecValue.value || 'Default', spec?.label || '默认规格');
  if (!result?.ok) return showOperationToast('该商品暂不可购买');
  closeProductDetails();
  showOperationToast('已加入购物袋');
};

const showShopIsland = (
  title,
  message = '',
  icon = 'success',
  durationMs = 3000,
  onAction = null,
) => {
  try {
    const payload = { title, message, icon, durationMs };
    if (typeof onAction === 'function') payload.onAction = onAction;
    return showIsland.notify(payload);
  } catch {
    return false;
  }
};
function showOperationToast(message) {
  const text = String(message || '');
  const isError = /不可兑换|无效|不足|失败|错误|请先登录|请检查/.test(text);
  let title = text;
  let detail = '';
  if (text === '已加入购物袋') {
    title = '已加入购物袋';
    detail = selectedProduct.value?.title ? String(selectedProduct.value.title).slice(0, 32) : '';
  } else if (text === '订单已提交') {
    title = '订单已提交';
    detail = '已邮件通知管理员处理';
  } else if (text.startsWith('积分不足')) {
    title = '积分不足';
    detail = text.replace(/^积分不足[:：]?\s*/, '');
  } else if (text.length > 24) {
    title = text.slice(0, 24);
    detail = text.slice(24);
  }
  const ok = showShopIsland(title, detail, isError ? 'warning' : 'success', isError ? 3600 : 3000);
  if (ok) return;
  if (toastTimer) clearTimeout(toastTimer);
  operationToast.value = { show: true, message };
  toastTimer = setTimeout(() => {
    operationToast.value.show = false;
  }, 2600);
}

const closeCheckout = () => {
  showCheckout.value = false;
  document.body.style.overflow = '';
};
/* 结算邮件的异步结果（2026-11-02）：弹窗还开着就更新弹窗内那行说明；
   已经关掉了（用户点「完成」很快）才用岛补一条提醒 —— 岛挂在导航里，
   弹窗开着时既会被弹窗盖住，又会挡支付成功的卡片翻转动画。 */
const markSettlementEmailState = (state) => {
  if (paymentSuccess.value) {
    paymentSuccess.value = { ...paymentSuccess.value, emailState: state };
    return;
  }
  if (state === 'failed') showOperationToast('订单已提交，进度邮件发送失败');
};

const closePaymentSuccess = () => {
  const emailFailed = paymentSuccess.value?.emailState === 'failed';
  paymentSuccess.value = null;
  document.body.style.overflow = '';
  if (emailFailed) showOperationToast('订单已提交，进度邮件发送失败');
};

/* 成功页的两个出口：主流电商都让用户「立刻能看到刚下的单」或「接着逛」，
   只给一个「完成」等于把用户扔回商品列表自己找订单。 */
const goOrdersFromSuccess = () => {
  closePaymentSuccess();
  switchTab('order');
};
const continueShoppingFromSuccess = () => {
  closePaymentSuccess();
  switchTab('products');
};

/* 结算里点「在地址簿里编辑 / 删除」：收掉结算层，切到「地址」分区。
   地址簿只在那一处维护（2026-11-02 地址独立成子 Tab）—— 结算里只做"选哪一条"。
   已经选好的地址与购物袋都在，回来再点「去结算」不会丢。 */
const manageAddressesFromCheckout = () => {
  closeCheckout();
  switchTab('address');
};

/* 预检里的「移除失效商品」：按 key（`id-spec`）精确删，不整袋清空 ——
   用户可能只是其中一件下架了，另外两件还想买。 */
const removeInvalidBagItems = (keys = []) => {
  const targets = new Set(Array.isArray(keys) ? keys : []);
  if (!targets.size) return;
  for (const item of [...shoppingBag.value]) {
    if (targets.has(`${item.id}-${item.selectedSpec || ''}`)) {
      bagStore.removeFromBag(item.id, item.selectedSpec);
    }
  }
};

/* 老用户兜底：地址簿为空时，用资料里的三条 shipping_* 拼一份「虚拟地址」。
   2026-11-01 之前结算只写 profiles、不写地址簿，只读地址簿会让这批人打开结算就是空表。 */
const loadFallbackAddress = async () => {
  fallbackAddress.value = null;
  const username = String(userInfo.username || '').trim();
  if (!username) return;
  try {
    const { data, error } = await getProfileByUsername(username);
    if (error || !data) return;
    const recipient = String(data.shipping_recipient || '').trim();
    const phone = String(data.shipping_phone || '').trim();
    const region = String(data.shipping_address || '').trim();
    if (!recipient && !phone && !region) return;
    fallbackAddress.value = { id: '', recipient, phone, region, detail: '' };
  } catch (error) {
    logger.warn('shop', '读取收货资料失败', error);
  }
};

const startCheckout = async () => {
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return showOperationToast('请先登录后再提交订单');
  }
  if (!canCheckout.value) return showOperationToast('订单内容无效，请检查购物袋');
  /* 打开前先备好「老用户兜底地址」，CheckoutSheet 自己在打开时读地址簿；
     两边都异步，先把这个 promise 等完再开层，避免卡片先空一下再跳成地址。 */
  await loadFallbackAddress();
  checkoutAddress.value = null;
  showCheckout.value = true;
  document.body.style.overflow = 'hidden';
};

/* 电话只需「像电话」：7~20 位数字，允许 + - 空格 括号（国际号/分机也可能出现） */
const isPhoneLike = (value) => /^[+]?[\d\s()-]{7,20}$/.test(String(value || '').trim());

const buildOrderItemsPayload = () =>
  shoppingBag.value.map((item) => ({
    id: Number(item.id),
    quantity: Number(item.quantity),
    selectedSpec: String(item.selectedSpec || ''),
    selectedSpecLabel: String(item.selectedSpecLabel || ''),
  }));

function resolveOrderErrorMessage(result) {
  const code = result?.data?.message || result?.error?.code || '';
  if (code === 'INSUFFICIENT_POINTS') {
    const current = Number(result?.data?.currentPoints || 0);
    const required = Number(result?.data?.requiredPoints || totalPoints.value);
    return `积分不足，还差 ${Math.max(0, required - current)}`;
  }
  if (code === 'PRODUCT_NOT_EXCHANGEABLE') return '购物袋中包含暂不可购买商品';
  if (code === 'PRODUCT_NOT_FOUND') return '购物袋存在已下架商品';
  if (String(code).startsWith('INVALID_') || code === 'EMPTY_ITEMS')
    return '订单信息不完整，请检查后重试';
  return result?.error?.message || '积分支付失败，请稍后重试';
}

const formatDateTime = (date) => {
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    logger.warn('shop', '复制订单摘要失败', error);
    return false;
  }
}

async function notifyAdministrators(content) {
  try {
    const { data: profiles, error } = await getAllProfiles();
    const admins =
      !error && profiles?.length ? profiles.filter((profile) => profile.role === 'admin') : [];
    if (admins.length) {
      await Promise.all(
        admins.map((admin) =>
          createNotification(admin.id, isLoggedIn.value ? userInfo.id : null, 'system', {
            content,
          }),
        ),
      );
      return;
    }
    for (const username of ['Ryyik', 'ryyik', 'RYYIK']) {
      const result = await getProfileByUsername(username);
      if (!result.error && result.data) {
        await createNotification(result.data.id, isLoggedIn.value ? userInfo.id : null, 'system', {
          content,
        });
        return;
      }
    }
  } catch (error) {
    logger.error('shop', '发送管理员通知失败', error);
  }
}

/* 提交订单。
   address 由 CheckoutSheet 传入（用户在确认页选/填的那一条），字段：
   { id, recipient, phone, region, detail }，id 为空表示来自 profiles 的历史回落。
   ⚠️ 这里只写 profiles、**不再反写地址簿默认地址**：结算页只负责"这一单选谁"，
      选一条新地址就把用户的默认地址改掉是越权（2026-11-03 的口径）。 */
async function submitContact(address) {
  if (submittingContact.value) return;
  if (!canCheckout.value) return;

  /* 校验：收件人 / 电话 / 地址是管理员唯一的联系与寄送依据，缺一项就不给下单 ——
     少任何一项都会让管理员收到一封「联系不上人」的邮件。 */
  const recipient = String(address?.recipient || '').trim();
  const phone = String(address?.phone || '').trim();
  const fullAddress = composeAddress({
    province: String(address?.region || '').trim(),
    city: '',
    detail: String(address?.detail || '').trim(),
  });
  if (!recipient) return showOperationToast('请填写收件人');
  if (!isPhoneLike(phone)) return showOperationToast('请填写有效电话');
  if (fullAddress.length < 4) return showOperationToast('请填写收货地址');
  const remark = String(address?.remark || '')
    .trim()
    .slice(0, 200);

  submittingContact.value = true;
  try {
    /* 先把收货信息写回资料：既是为了下次自动带出，也是让管理员在后台/用户资料里
       看到同一份信息（邮件是服务端按 order_id 读库发的，不信任页面快照）。 */
    const saved = await updateProfile(userInfo.id, {
      shipping_recipient: recipient,
      shipping_phone: phone,
      shipping_address: fullAddress,
    });
    if (!saved?.ok) return showOperationToast('收货信息保存失败，请重试');

    const result = await createShopOrderWithPoints({
      items: buildOrderItemsPayload(),
      contactType: 'profile',
      contactValue: phone,
      /* 地址快照随订单落库（2026-11-04）：不能只写 profiles —— 用户之后改地址，
         历史订单就再也说不清当时寄给谁了。 */
      shipping: { recipient, phone, address: fullAddress },
      remark,
    });
    if (!result.ok) return showOperationToast(resolveOrderErrorMessage(result));

    const paidPoints = Number(result.data?.pointsDeducted || 0);
    const paidRmb = result.data?.rmbTotal ? Number(result.data.rmbTotal) : 0;
    const remainingPoints = Number(result.data?.currentPoints || userInfo.points);
    const orderNo = result.data?.orderNo || '未知订单号';
    const time = formatDateTime(new Date());
    const paymentMode = result.data?.paymentMode || 'points_only';
    const orderedItems =
      Array.isArray(result.data?.items) && result.data.items.length
        ? result.data.items
        : shoppingBag.value;
    const itemText = orderedItems
      .map((item) => {
        const specification = item.selected_spec_label || item.selectedSpecLabel || '默认规格';
        return `${item.title} (${specification}) x${item.quantity}`;
      })
      .join('\n- ');

    const paymentSummary = buildPaymentSummary({
      points: paidPoints,
      cents: paidRmb,
      mode: paymentMode,
    });

    const summary = `--- 方块之家周边结算单 ---\n订单号: ${orderNo}\n昵称: ${userInfo.username}\n邮箱: ${userInfo.email || '未绑定'}\n收件人: ${recipient}\n电话: ${phone}\n地址: ${fullAddress}\n时间: ${time}\n${remark ? `备注: ${remark}\n` : ''}\n支付方式: ${paymentSummary}\n\n商品清单:\n- ${itemText}\n\n剩余积分: ${remainingPoints}`;
    userInfo.points = remainingPoints;
    await copyToClipboard(summary);
    closeCheckout();
    clearBag();
    /* 成功页要能回答「买了什么、寄给谁」——只给一个订单号是核对不了的 */
    const totalQty = orderedItems.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
    const firstTitle = String(orderedItems[0]?.title || '周边订单');
    const itemSummaryText =
      orderedItems.length > 1 ? `${firstTitle} 等 ${totalQty} 件` : `${firstTitle} × ${totalQty}`;
    paymentSuccess.value = {
      orderNo,
      paymentSummary,
      itemSummary: itemSummaryText,
      shippingTo: `${recipient} · ${fullAddress}`,
      /* 现金待收金额（分）：结果页要说「待付 ¥x」，而不是笼统的"已提交" ——
         现金是线下人工收的，用户必须知道自己还欠一笔钱、以及谁来联系他。 */
      cashDue: paidRmb,
      paymentMode,
      remark,
      emailState: 'pending',
    };
    document.body.style.overflow = 'hidden';
    void sendMerchandiseSettlementEmail({ orderId: result.data.orderId })
      .then(() => markSettlementEmailState('sent'))
      .catch((error) => {
        logger.error('shop', '订单邮件发送失败', error);
        markSettlementEmailState('failed');
      });
    void notifyAdministrators(
      `收到新的周边订单！\n订单号: ${orderNo}\n昵称: ${userInfo.username}\n邮箱: ${userInfo.email || '未绑定'}\n收件人: ${recipient}\n电话: ${phone}\n地址: ${fullAddress}\n${remark ? `备注: ${remark}\n` : ''}支付: ${paymentSummary}\n商品: ${itemText}`,
    );
    /* 不再 showOperationToast('订单已提交')：支付成功弹窗本身就在说这件事，
       而岛挂在导航里、层级低于弹窗（且会盖住卡片翻转动画）—— 2026-11-02 用户报障后去掉。 */
  } finally {
    submittingContact.value = false;
  }
}

const syncTabFromRoute = () => {
  const tab = String(route.query.tab || '');
  if (SHOP_TAB_IDS.includes(tab)) {
    activeTab.value = tab;
  } else if (String(route.query.lottery || '').trim()) {
    /* 抽奖分享深链（`?lottery=<id>`，见 LotteryPanel 的 consumeDeepLink）：
       没带 tab 时必须落在抽奖分区 —— 停在「产品」的话 LotteryPanel 根本不渲染，
       深链参数就成了一条永远不生效的死链。 */
    activeTab.value = 'lottery';
  } else {
    activeTab.value = 'products';
  }
  if (route.query.checkout === '1') {
    window.setTimeout(() => startCheckout(), 0);
  }
};

watch(
  () => route.query.tab,
  () => syncTabFromRoute(),
);

let navResizeObserver = null;
const syncNavHeight = () => {
  const nav = document.getElementById('unified-nav-container');
  const page = document.querySelector('.store-page');
  if (!nav || !page) return;
  const height = nav.getBoundingClientRect().height;
  if (height > 0) page.style.setProperty('--nav-h', `${Math.ceil(height)}px`);
};

onMounted(() => {
  syncTabFromRoute();
  /* 商品拿到之后就给购物袋对一次账（2026-11-04）：袋里存的是加购时的快照，
     不对账就会出现「显示价 ≠ 实扣价」「下架商品一直躺在袋里」。
     对账结果只在真发生变动时提示一次，正常进站不打扰。 */
  productsStore
    .fetchProducts({ force: true })
    .then(() => {
      const { removed, updated } = bagStore.reconcileBag(allProducts.value);
      if (removed) {
        showOperationToast(`购物袋里 ${removed} 件商品已下架，已自动移出`);
      } else if (updated) {
        showOperationToast('购物袋价格已按最新信息更新');
      }
    })
    .catch((error) => logger.error('shop', '商品加载失败', error));

  window.addEventListener('theme-changed', handleThemeChanged);

  syncNavHeight();
  if (typeof ResizeObserver !== 'undefined') {
    navResizeObserver = new ResizeObserver(syncNavHeight);
    const navEl = document.getElementById('unified-nav-container');
    if (navEl) navResizeObserver.observe(navEl);
  }
});

onBeforeUnmount(() => {
  if (toastTimer) clearTimeout(toastTimer);
  document.body.style.overflow = '';
  bagStore.flushShoppingBag();
  window.removeEventListener('theme-changed', handleThemeChanged);
  navResizeObserver?.disconnect();
  navResizeObserver = null;
});
</script>

<style src="./store-tokens.css"></style>
<style scoped src="./style.scoped.css"></style>
<!-- 横屏左栏的定位 / 内容让位 / 条目状态色（body.page-shop 段）。
     ⚠️ 必须非 scoped：它按 body 级 page class 命中，scoped 的 data-v 会把它废掉。
     ⚠️ 与 Cloud+ / BOHAI / 首页共用同一份真源 —— 断点与栏宽档位只在那里改。 -->
<style src="@/views/user-center/UserSpace/styles/landscape-rail.css"></style>
