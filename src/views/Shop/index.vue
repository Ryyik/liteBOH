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
        :aria-label="isLoggedIn ? '打开购物袋与订单' : '登录'"
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
        <span v-if="tab.id === 'bag' && bagCount" class="tab-count">{{ bagCount }}</span>
      </button>
    </nav>

    <main class="store-main">
      <!-- 页面切换动效（2026-11-01 用户口径）：
           key 绑 activeTab ⇒ 切「产品 / 抽奖 / 购物袋」时这一层整体重建，
           .store-panel 的进场动画（淡入 + 6px 上浮）随之重放。
           与 UserSpace 的 .tab-page 同一套路：**只进场、无离场** ——
           不做 mode="out-in"，否则每次切 Tab 都要先白等 150ms 的离场。
           副作用是滚动位置保留（外层没重建），正是想要的手感。 -->
      <section :key="activeTab" class="store-panel">
        <template v-if="activeTab === 'products'">
          <p v-if="fetchError && allProducts.length" class="store-hint" role="status">
            当前展示的是内置商品数据，可能不是最新；网络恢复后刷新即可看到实时价格。
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
              class="search-clear"
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

          <div v-else-if="filteredProducts.length" class="product-grid">
            <button
              v-for="product in filteredProducts"
              :key="product.id"
              type="button"
              class="p-card"
              @click="openProductDetails(product, $event)"
            >
              <span class="p-media">
                <img
                  v-if="product.image"
                  :src="displayImageUrl(product)"
                  :alt="product.title"
                  loading="lazy"
                />
                <Package v-else :size="34" :stroke-width="1.2" aria-hidden="true" />
              </span>
              <span class="p-meta">
                <span class="p-name">{{ product.title }}</span>
                <span class="p-price">{{ formatPriceDisplay(product) }}</span>
              </span>
            </button>
          </div>

          <div v-else class="store-empty">
            <p>{{ searchKeyword ? `没有找到「${searchKeyword}」` : '暂时还没有周边' }}</p>
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
          v-else
          ref="bagPanelRef"
          initial-view="cart"
          show-full-link
          @checkout="startCheckout"
          @browse="switchTab('products')"
          @open-full="router.push('/shop/bag?view=orders')"
        />
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

    <Transition name="modal">
      <div v-if="showContactModal" class="modal-scrim" @click="closeContactModal">
        <section
          class="contact-card"
          role="dialog"
          aria-modal="true"
          aria-label="确认收货信息"
          @click.stop
        >
          <!-- 关闭按钮：surface 直属子元素（与商品/抽奖详情同款），
               竖屏下这是唯一显式关闭入口 —— 点遮罩在 iOS 上可能被键盘/焦点吞掉 -->
          <button type="button" class="contact-close" aria-label="关闭" @click="closeContactModal">
            <X :size="16" :stroke-width="2" aria-hidden="true" />
          </button>

          <p class="contact-kicker">订单确认</p>
          <h2>确认收货信息</h2>
          <!-- 2026-11-01 用户口径：结算不再填 QQ / 微信 —— 直接用资料里的收件信息，
               缺项就地补全并写回个人资料，下单选「确认提交」即直接邮件通知管理员。 -->
          <p class="contact-note">信息保存到你的资料，下次下单自动带出。</p>

          <div class="field-grid-2">
            <label class="contact-field">
              <span>收件人</span>
              <input v-model.trim="checkoutForm.recipient" type="text" placeholder="收件人姓名" />
            </label>
            <label class="contact-field">
              <span>电话</span>
              <input
                v-model.trim="checkoutForm.phone"
                type="tel"
                inputmode="tel"
                placeholder="手机号"
              />
            </label>
          </div>

          <label class="contact-field">
            <span>邮箱（账号）</span>
            <input :value="userInfo.email || '未绑定邮箱'" type="text" readonly />
          </label>

          <label class="contact-field">
            <span>收货地址</span>
            <!-- 一键识别：粘贴整段地址（含从聊天/电商订单里复制的长文本）→ 自动拆成省 / 市 / 详细地址。
                 识别是纯本地的（utils/address-parse.js），不联网、不上传；拆不出来就整段留在
                 「详细地址」里，绝不丢字。 -->
            <div class="addr-paste">
              <input
                ref="pasteInputRef"
                v-model="checkoutForm.pasteText"
                type="text"
                :placeholder="awaitingPaste ? '粘贴到这里' : '粘贴整段地址自动拆分'"
                @paste="handleAddressPaste"
                @input="handleAddressTyping"
              />
              <button
                type="button"
                class="addr-paste-btn"
                :class="{ 'is-awaiting': awaitingPaste }"
                :disabled="recognizing"
                @click="readClipboardAddress"
              >
                <ClipboardPaste :size="14" :stroke-width="1.8" aria-hidden="true" />
                {{ recognizing ? '识别中' : awaitingPaste ? '等待粘贴' : '识别' }}
              </button>
            </div>
            <div class="addr-row">
              <div class="addr-select">
                <select v-model="checkoutForm.province" aria-label="省份">
                  <option value="">省份</option>
                  <option v-for="province in PROVINCES" :key="province" :value="province">
                    {{ province }}
                  </option>
                </select>
              </div>
              <input
                v-model.trim="checkoutForm.city"
                type="text"
                placeholder="城市"
                aria-label="城市"
              />
            </div>
            <textarea
              v-model.trim="checkoutForm.detail"
              rows="2"
              placeholder="区县 / 街道 / 门牌号"
              aria-label="详细地址"
            ></textarea>
          </label>

          <div v-if="totalPoints || totalRmb" class="contact-summary">
            <div v-if="totalPoints" class="contact-line">
              <span>积分支付</span><strong>{{ totalPoints }} 积分</strong>
            </div>
            <div v-if="totalRmb" class="contact-line">
              <span>现金支付</span><strong>{{ totalRmbText }}</strong>
            </div>
          </div>

          <button
            type="button"
            class="submit-btn"
            :disabled="submittingContact"
            @click="submitContact"
          >
            {{ submittingContact ? '提交中…' : '确认提交' }}
          </button>
        </section>
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
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { Package, Search, User, X, ClipboardPaste } from 'lucide-vue-next';
import mascotHeroUrl from '@/assets/images/mascot-new-landscape-orig.webp';
import { getImageUrl } from '@/utils/asset-helper.js';
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
import {
  PROVINCES,
  composeAddress,
  looksLikeFullAddress,
  parseAddress,
} from '@/utils/address-parse.js';
import { themeManager } from '@/utils/theme-manager.js';
import { logoutAndReload } from '@/utils/logout-and-reload.js';
import { BOTTOM_NAV_ITEMS } from '@/config/bottom-nav';
import { getNotificationStoreRef } from '@/stores/notification-loader';
import UserSpaceBottomNav from '@/views/user-center/UserSpace/components/UserSpaceBottomNav.vue';
import UserSpaceSideRail from '@/views/user-center/UserSpace/components/UserSpaceSideRail.vue';
import { useScrollDirectionHide } from '@/views/user-center/UserSpace/composables/useScrollDirectionHide.js';
import ShopPaymentSuccessModal from './ShopPaymentSuccessModal.vue';
import ProductDetailSheet from './ProductDetailSheet.vue';
import LotteryPanel from './LotteryPanel.vue';
import BagPanel from './BagPanel.vue';

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

const tabs = [
  { id: 'products', label: '产品' },
  { id: 'lottery', label: '抽奖' },
  { id: 'bag', label: '购物袋' },
];

const activeTab = ref('products');
const searchKeyword = ref('');
const selectedProduct = ref(null);
const selectedSpecValue = ref('');
const selectedOriginKey = ref('');
const showContactModal = ref(false);
/* 结算表单：直接从个人资料的 shipping_* 带出（2026-11-01 起不再手填 QQ/微信）。
   缺项就地补填，提交时写回资料 —— 下一次下单自动带出，管理员邮件里也直接有。 */
const checkoutForm = reactive({
  recipient: '',
  phone: '',
  province: '',
  city: '',
  detail: '',
  pasteText: '',
});
const submittingContact = ref(false);
const operationToast = ref({ show: false, message: '' });
const paymentSuccess = ref(null);
const bagPanelRef = ref(null);
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
  return parts.length ? parts.join(' + ') : '暂不可兑换';
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
const displayImageUrl = (product) =>
  Number(product?.id) === 501 ? mascotHeroUrl : getImageUrl(product?.image);

const totalPoints = computed(() =>
  shoppingBag.value.reduce(
    (sum, item) => sum + (parsePointsCost(item.points_cost) || 0) * item.quantity,
    0,
  ),
);
const totalRmb = computed(() =>
  shoppingBag.value.reduce((sum, item) => {
    const rmb = Number(item.rmb_price);
    return sum + (Number.isFinite(rmb) && rmb > 0 ? rmb * item.quantity : 0);
  }, 0),
);
const totalRmbText = computed(() =>
  totalRmb.value > 0 ? `¥${(totalRmb.value / 100).toFixed(2)}` : '',
);
const canCheckout = computed(() => {
  if (!shoppingBag.value.length) return false;
  return shoppingBag.value.every((item) => isProductExchangeable(item));
});

const switchTab = (tabId) => {
  activeTab.value = tabId;
  router.replace({ path: '/shop', query: tabId === 'products' ? {} : { tab: tabId } });
  window.scrollTo({ top: 0, behavior: 'auto' });
};

const goBag = () => {
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }
  router.push('/shop/bag?view=orders');
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
  if (!result?.ok) return showOperationToast('该商品暂不可兑换');
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

const closeContactModal = () => {
  showContactModal.value = false;
  stopPasteWatch();
};
const closePaymentSuccess = () => {
  paymentSuccess.value = null;
  document.body.style.overflow = '';
};

/* 打开结算：先把资料里的收件信息带出来（缺失就留空，让用户就地补）。
   取的是 profiles 的 shipping_* 三列 —— authStore.userInfo 不带这三个字段。
   地址在库里是**一整段文本**，这里用同一套解析器拆成 省 / 市 / 详细地址。 */
const loadShippingProfile = async () => {
  checkoutForm.recipient = String(userInfo.username || '').trim();
  checkoutForm.phone = '';
  checkoutForm.province = '';
  checkoutForm.city = '';
  checkoutForm.detail = '';
  checkoutForm.pasteText = '';
  try {
    const username = String(userInfo.username || '').trim();
    if (!username) return;
    const { data, error } = await getProfileByUsername(username);
    if (error || !data) return;
    checkoutForm.recipient = String(data.shipping_recipient || '').trim() || checkoutForm.recipient;
    checkoutForm.phone = String(data.shipping_phone || '').trim();
    const parsed = parseAddress(data.shipping_address);
    checkoutForm.province = parsed.province;
    checkoutForm.city = parsed.city;
    checkoutForm.detail = parsed.detail;
  } catch (error) {
    logger.warn('shop', '读取收货资料失败', error);
  }
};

/* 把一段地址文本吃进表单（三个字段一起覆写）——
   粘贴 / 剪贴板两条入口共用，避免两处解析逻辑漂移。 */
const applyAddressText = (text) => {
  const parsed = parseAddress(text);
  if (!parsed.province && !parsed.city && !parsed.detail) return false;
  checkoutForm.province = parsed.province || checkoutForm.province;
  checkoutForm.city = parsed.city;
  checkoutForm.detail = parsed.detail;
  return true;
};

const handleAddressPaste = (event) => {
  const text = event?.clipboardData?.getData('text') || '';
  if (!looksLikeFullAddress(text)) return; // 普通粘贴（比如只贴门牌号）就正常落进输入框
  event.preventDefault();
  if (applyAddressText(text)) checkoutForm.pasteText = '';
};

/* 手打字时也识别：输入框内容一旦「像完整地址」就即时拆分（不打断开头的短文本） */
const handleAddressTyping = () => {
  if (!looksLikeFullAddress(checkoutForm.pasteText)) return;
  if (applyAddressText(checkoutForm.pasteText)) checkoutForm.pasteText = '';
};

/* 「识别」按钮：点一下 = 读剪贴板 → 拆分 → 直接填进省/市/详细地址。
   降级链（浏览器差别很大，必须给每一步都留活路）：
   1) navigator.clipboard.readText() —— 标准路径，localhost / HTTPS + 用户手势下成功率最高；
   2) 读不到 / 被拒（iOS WKWebView、iframe、浏览器未授权、剪贴板为空）→ 进入「等待粘贴」：
      聚焦识别框 + 在**文档捕获阶段**挂一次性 paste 监听，用户随手 Ctrl+V 或长按「粘贴」
      都能被接住并拆分 —— 不依赖焦点是否真的在输入框上（移动端点完按钮焦点常常跑掉）。
      15s 无操作自动解除，避免长期劫持全局粘贴。 */
const pasteInputRef = ref(null);
const recognizing = ref(false);
const awaitingPaste = ref(false);
let pasteWatchTimer = null;

function stopPasteWatch() {
  awaitingPaste.value = false;
  if (pasteWatchTimer) {
    clearTimeout(pasteWatchTimer);
    pasteWatchTimer = null;
  }
  document.removeEventListener('paste', onDocumentPaste, true);
}

/* 全局粘贴兜底：只处理文本；识别框自己的 @paste 优先（这里直接让开，避免重复处理） */
function onDocumentPaste(event) {
  if (!showContactModal.value) {
    stopPasteWatch();
    return;
  }
  if (event.target === pasteInputRef.value) return;
  const text = String(event?.clipboardData?.getData('text') || '').trim();
  if (!text) return;
  event.preventDefault();
  const ok = applyAddressText(text);
  checkoutForm.pasteText = ok ? '' : text;
  stopPasteWatch();
  showOperationToast(ok ? '已识别粘贴的地址' : '这段拆不出省/市，已放进识别框');
}

const armPasteWatch = async (message) => {
  showOperationToast(message);
  await nextTick();
  pasteInputRef.value?.focus?.();
  awaitingPaste.value = true;
  document.addEventListener('paste', onDocumentPaste, true);
  if (pasteWatchTimer) clearTimeout(pasteWatchTimer);
  pasteWatchTimer = setTimeout(stopPasteWatch, 15000);
};

const readClipboardAddress = async () => {
  if (recognizing.value) return;
  recognizing.value = true;
  try {
    let text = '';
    if (navigator.clipboard?.readText) {
      try {
        text = await navigator.clipboard.readText();
      } catch (error) {
        logger.warn('shop', '读取剪贴板失败，转手动粘贴引导', error);
      }
    }
    text = String(text || '').trim();

    if (text) {
      if (applyAddressText(text)) {
        checkoutForm.pasteText = '';
        showOperationToast('已识别剪贴板里的地址');
      } else {
        // 不是完整地址（比如只复制了门牌号）：原样放进输入框让人确认
        checkoutForm.pasteText = text;
        showOperationToast('剪贴板内容不像完整地址，已放进输入框');
      }
      return;
    }

    // 读不到（无权限 / 剪贴板为空）：进入等待粘贴态，下一次 Ctrl+V / 长按粘贴即识别
    const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches;
    await armPasteWatch(
      coarsePointer ? '没读到剪贴板，长按识别框选「粘贴」' : '没读到剪贴板，按 Ctrl+V 粘贴即可',
    );
  } finally {
    recognizing.value = false;
  }
};

const startCheckout = async () => {
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return showOperationToast('请先登录后再提交订单');
  }
  if (!canCheckout.value) return showOperationToast('订单内容无效，请检查购物袋');
  await loadShippingProfile();
  showContactModal.value = true;
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
  if (code === 'INSUFFICIENT_POINTS')
    return `积分不足：当前 ${Number(result?.data?.currentPoints || 0)}，需要 ${Number(result?.data?.requiredPoints || totalPoints.value)}`;
  if (code === 'PRODUCT_NOT_EXCHANGEABLE') return '购物袋中包含暂不可兑换商品';
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

async function submitContact() {
  if (submittingContact.value) return;
  if (!canCheckout.value) return;

  /* 校验（2026-11-01 改成「资料即收货信息」后，这三项就是管理员唯一的联系依据）：
     收件人 / 电话 / 地址缺一项就不给下单 —— 只填了 QQ 的历史路径已经退场，
     少任何一项都会让管理员收到一封「联系不上人」的邮件。 */
  const recipient = checkoutForm.recipient.trim();
  const phone = checkoutForm.phone.trim();
  /* 三段合成一段落库（profiles 只有一个 shipping_address 列，历史数据也是整段） */
  const province = checkoutForm.province.trim();
  const city = checkoutForm.city.trim();
  const detail = checkoutForm.detail.trim();
  const address = composeAddress({ province, city, detail });
  if (!recipient) return showOperationToast('请填写收件人');
  if (!isPhoneLike(phone)) return showOperationToast('请填写有效电话');
  if (!province) return showOperationToast('请选择省份');
  if (detail.length < 4) return showOperationToast('请填写详细地址（区县 / 街道 / 门牌号）');

  submittingContact.value = true;
  try {
    /* 先把收货信息写回资料：既是为了下次自动带出，也是让管理员在后台/用户资料里
       看到同一份信息（邮件是服务端按 order_id 读库发的，不信任页面快照）。 */
    const saved = await updateProfile(userInfo.id, {
      shipping_recipient: recipient,
      shipping_phone: phone,
      shipping_address: address,
    });
    if (!saved?.ok) return showOperationToast('收货信息保存失败，请重试');

    const result = await createShopOrderWithPoints({
      items: buildOrderItemsPayload(),
      contactType: 'profile',
      contactValue: phone,
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

    let paymentSummary = '';
    if (paymentMode === 'points_only') paymentSummary = `积分: ${paidPoints}`;
    else if (paymentMode === 'rmb_only') paymentSummary = `现金: ¥${(paidRmb / 100).toFixed(2)}`;
    else paymentSummary = `积分: ${paidPoints} + 现金: ¥${(paidRmb / 100).toFixed(2)}`;

    const summary = `--- 方块之家周边结算单 ---\n订单号: ${orderNo}\n昵称: ${userInfo.username}\n邮箱: ${userInfo.email || '未绑定'}\n收件人: ${recipient}\n电话: ${phone}\n地址: ${address}\n时间: ${time}\n\n支付方式: ${paymentSummary}\n\n商品清单:\n- ${itemText}\n\n剩余积分: ${remainingPoints}`;
    userInfo.points = remainingPoints;
    await copyToClipboard(summary);
    closeContactModal();
    clearBag();
    bagPanelRef.value?.refresh?.();
    paymentSuccess.value = { orderNo, paymentSummary };
    document.body.style.overflow = 'hidden';
    void sendMerchandiseSettlementEmail({ orderId: result.data.orderId }).catch((error) => {
      logger.error('shop', '订单邮件发送失败', error);
      showOperationToast('订单已提交，但邮件通知发送失败');
    });
    void notifyAdministrators(
      `收到新的周边订单！\n订单号: ${orderNo}\n昵称: ${userInfo.username}\n邮箱: ${userInfo.email || '未绑定'}\n收件人: ${recipient}\n电话: ${phone}\n地址: ${address}\n支付: ${paymentSummary}\n商品: ${itemText}`,
    );
    showOperationToast('订单已提交');
  } finally {
    submittingContact.value = false;
  }
}

const syncTabFromRoute = () => {
  const tab = String(route.query.tab || '');
  if (tab === 'lottery' || tab === 'bag' || tab === 'products') {
    activeTab.value = tab;
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
  productsStore
    .fetchProducts({ force: true })
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
  stopPasteWatch();
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
