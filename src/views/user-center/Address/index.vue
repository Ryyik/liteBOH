<template>
  <div class="gift-center" :style="{ '--user-center-nav-offset': isFromUserSpace ? '0px' : '72px', paddingTop: isFromUserSpace ? '0px' : '72px' }">
    <!-- 页头 -->
    <UserCenterPageHeader v-if="isFromUserSpace" title="礼物" max-width="1200px" @back="goBack" />

    <div class="gc-body">
      <!-- 分段导航 -->
      <div class="gc-seg" role="tablist" aria-label="礼物中心">
        <button type="button" role="tab" :aria-selected="activeTab === 'gifts'" :class="{ active: activeTab === 'gifts' }" @click="switchTab('gifts')">
          <Gift :size="16" aria-hidden="true" />
          礼物进度
        </button>
        <button type="button" role="tab" :aria-selected="activeTab === 'address'" :class="{ active: activeTab === 'address' }" @click="switchTab('address')">
          <MapPin :size="16" aria-hidden="true" />
          收货地址
          <span v-if="addressCount" class="seg-count">{{ addressCount }}</span>
        </button>
        <button type="button" role="tab" :aria-selected="activeTab === 'history'" :class="{ active: activeTab === 'history' }" @click="switchTab('history')">
          <History :size="16" aria-hidden="true" />
          历史礼物
        </button>
      </div>

      <!-- 骨架 -->
      <div v-if="loading" class="gc-loading" aria-hidden="true">
        <div class="gc-skeleton gc-skeleton-hero"></div>
        <div class="gc-skeleton-grid">
          <div v-for="n in 3" :key="`sk-${n}`" class="gc-skeleton gc-skeleton-card"></div>
        </div>
      </div>

      <!-- 错误 -->
      <div v-else-if="mainLoadError" class="gc-state">
        <p>{{ mainLoadError }}</p>
        <button class="gc-btn gc-btn-ghost" type="button" @click="fetchData()">重试加载</button>
      </div>

      <template v-else>
        <!-- ========== 礼物进度 ========== -->
        <section v-if="activeTab === 'gifts'" class="gc-section">
          <div class="gc-section-head">
            <div>
              <p class="gc-eyebrow">Progress</p>
              <h2>当前礼物</h2>
            </div>
            <button
              v-if="historyGifts.length"
              type="button"
              class="gc-link"
              @click="switchTab('history')"
            >
              历史记录 ({{ historyGifts.length }})
              <ChevronRight :size="15" aria-hidden="true" />
            </button>
          </div>

          <div v-if="!currentGift" class="gc-empty">
            <div class="gc-empty-icon"><Gift :size="46" :stroke-width="1.5" aria-hidden="true" /></div>
            <h3>还没有待收到的礼物</h3>
            <p>积极参与社区活动来赢取吧，收到礼物后这里会实时更新进度。</p>
          </div>

          <article v-else class="gc-gift-card">
            <div class="gc-gift-top">
              <div class="gc-gift-visual">
                <img v-if="currentGift.gift_image" :src="currentGift.gift_image" :alt="currentGift.gift_content" loading="lazy" />
                <Gift v-else :size="46" :stroke-width="1.5" aria-hidden="true" />
              </div>
              <div class="gc-gift-info">
                <span class="gc-gift-no">编号 {{ currentGift.gift_no || 'BOH-NEW' }}</span>
                <h3>{{ currentGift.gift_content || '待命中的礼物' }}</h3>
                <p class="gc-gift-price">RMB {{ currentGift.gift_price || '0' }}</p>
                <span class="gc-status-chip" :class="currentGift.gift_status">
                  <span class="gc-status-dot"></span>
                  {{ getAppleStatusTitle }}
                </span>
              </div>
            </div>

            <div class="gc-gift-track">
              <div class="gc-track-line">
                <div class="gc-track-fill" :style="{ width: appleProgressWidth + '%' }"></div>
              </div>
              <div class="gc-track-steps">
                <div
                  v-for="(step, i) in trackSteps"
                  :key="step.key"
                  class="gc-track-step"
                  :class="{ done: currentStatusIndex > i, current: currentStatusIndex === i }"
                >
                  <span class="gc-track-dot">{{ currentStatusIndex > i ? '✓' : '' }}</span>
                  <span class="gc-track-label">{{ step.label }}</span>
                </div>
              </div>
              <p class="gc-track-desc">{{ getAppleStatusDesc }}</p>
            </div>
          </article>
        </section>

        <!-- ========== 收货地址（复用 AddressManager 组件） ========== -->
        <section v-else-if="activeTab === 'address'" class="gc-section">
          <AddressManager variant="solid" :show-header="true" @loaded="onAddressesLoaded" />
        </section>

        <!-- ========== 历史礼物 ========== -->
        <section v-else class="gc-section">
          <div class="gc-section-head">
            <div>
              <p class="gc-eyebrow">History</p>
              <h2>历史礼物</h2>
            </div>
            <span v-if="historyGifts.length" class="gc-count">{{ historyGifts.length }} 份</span>
          </div>

          <div v-if="!historyGifts.length" class="gc-empty">
            <div class="gc-empty-icon"><History :size="42" :stroke-width="1.5" aria-hidden="true" /></div>
            <h3>还没有历史礼物</h3>
            <p>已送达或过期的礼物会记录在这里。</p>
          </div>

          <div v-else class="gc-list">
            <div v-for="gift in historyGifts" :key="gift.id" class="gc-list-row">
              <div class="gc-list-main">
                <span class="gc-list-no">#{{ gift.gift_no }}</span>
                <strong>{{ gift.gift_content }}</strong>
              </div>
              <div class="gc-list-meta">
                <span>{{ formatDateShort(gift.created_at) }}</span>
                <span class="gc-status-chip is-flat" :class="gift.gift_status">{{ getStatusLabel(gift.gift_status) }}</span>
              </div>
            </div>
          </div>

          <!-- 海报申请 -->
          <section v-if="posterRequests.length" class="poster-block">
            <div class="gc-section-head">
              <div>
                <p class="gc-eyebrow">Poster</p>
                <h3>八周年海报申请</h3>
              </div>
            </div>
            <div class="gc-list">
              <div v-for="request in posterRequests" :key="request.id" class="gc-list-row">
                <div class="gc-list-main">
                  <span class="gc-list-no">#{{ formatPosterNo(request) }}</span>
                  <strong>{{ request.recipient }}</strong>
                </div>
                <div class="gc-list-meta">
                  <span>物料费 RMB {{ Number(request.material_fee) || 5 }}</span>
                  <span class="gc-status-chip is-flat" :class="request.status">{{ getPosterStatusLabel(request.status) }}</span>
                </div>
              </div>
            </div>
          </section>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { Gift, MapPin, History, ChevronRight } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import { supabase } from '@/utils/supabase-client.js';
import { logger } from '@/utils/logger.js';
import { getExpiredActiveGiftIds, markGiftsAsHistory, isGiftExpiredCompleted } from '@/utils/gift-archive.js';
import { resolveSettingsBackLocation } from '@/utils/user-space-navigation.js';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import AddressManager from '@/components/AddressManager.vue';

const router = useRouter();
const route = useRoute();
const isFromUserSpace = computed(() => String(route.query.from || '').startsWith('userspace'));
const authStore = useAuthStore();
const { userInfo, isLoggedIn } = storeToRefs(authStore);

// --- 状态 ---
const activeTab = ref('gifts'); // 'gifts' | 'address' | 'history'
const loading = ref(true);
const mainLoadError = ref('');
const currentGift = ref(null);
const historyGifts = ref([]);
const posterRequests = ref([]);
const addressCount = ref(0);

const TASK_TIMEOUT_MS = 12000;

const withTaskTimeout = (promise, timeoutMs = TASK_TIMEOUT_MS, message = '请求超时，请稍后重试') =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    Promise.resolve(promise)
      .then((result) => { clearTimeout(timer); resolve(result); })
      .catch((error) => { clearTimeout(timer); reject(error); });
  });

// --- 页面/导航 ---
const switchTab = (tab) => {
  activeTab.value = tab;
};

const goBack = () => {
  const from = route.query.from;
  if (['userspace', 'userspace-settings', 'userspace-data', 'cloud-settings'].includes(String(from || ''))) {
    router.push(resolveSettingsBackLocation(route));
    return;
  }
  const safeUsername = String(userInfo.value.username || localStorage.getItem('username') || '').trim();
  if (safeUsername) {
    router.push(`/profile/${encodeURIComponent(safeUsername)}?from=community`);
  } else {
    router.push('/');
  }
};

// --- 礼物状态映射 ---
const STEPS = [
  { key: 'requested', label: '已收到请求' },
  { key: 'processing', label: '正在处理' },
  { key: 'shipped', label: '已寄出' },
  { key: 'completed', label: '已送达' }
];
const trackSteps = STEPS;

const currentStatus = computed(() => {
  const status = currentGift.value?.gift_status || 'preparing';
  const map = { 'preparing': 0, 'processing': 1, 'shipped': 2, 'completed': 3 };
  return map[status] ?? 0;
});

const appleProgressWidth = computed(() => (currentStatus.value / 3) * 100);

const getStatusLabel = (s) => {
  const map = {
    'preparing': '备货中',
    'processing': '正在处理',
    'shipped': '已发货',
    'completed': '已完成'
  };
  return map[s] || s;
};

const getAppleStatusTitle = computed(() => {
  if (!currentGift.value) return '待命中的礼物';
  const status = currentGift.value.gift_status;
  const dateSource = status === 'completed'
    ? (currentGift.value.completed_at || currentGift.value.updated_at || currentGift.value.created_at)
    : (currentGift.value.updated_at || currentGift.value.created_at);
  const date = formatDateShort(dateSource);
  if (status === 'preparing') return `备货中 ${date}`;
  if (status === 'processing') return `正在处理 ${date}`;
  if (status === 'shipped') return `已发货 ${date}`;
  if (status === 'completed') return `已送达 ${date}`;
  return '订单状态';
});

const getAppleStatusDesc = computed(() => {
  if (!currentGift.value) return '方块之家正在为你构思一份特别的礼物。';
  const status = currentGift.value.gift_status;
  if (status === 'preparing') return '我们已收到你的礼物请求，正在准备精美礼品。';
  if (status === 'processing') return '礼物正在快马加鞭包装中，即将离开方块之家。';
  if (status === 'shipped') return '你的礼物已在路上，请留意快递信息或取货通知。';
  if (status === 'completed') return '礼物已成功送达，希望它能为你带来快乐。';
  return '';
});

const getPosterStatusLabel = (status) => {
  const map = {
    'pending': '已收到申请',
    'processing': '处理中',
    'shipped': '已寄出',
    'completed': '已送达'
  };
  return map[status] || '待处理';
};

const formatPosterNo = (request) => {
  const raw = String(request?.id || '');
  return raw.slice(0, 8).toUpperCase() || 'BOH-POSTER';
};

const formatDateShort = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}月 ${date.getDate()}日`;
};

// --- 地址计数（用于导航栏徽标） ---
const onAddressesLoaded = (addrs) => {
  addressCount.value = Array.isArray(addrs) ? addrs.length : 0;
};

// --- 数据加载 ---
const loadHistoryGifts = async (uid = userInfo.value?.id) => {
  if (!uid || historyGifts.value.length) return;
  try {
    const { data, error } = await withTaskTimeout(
      supabase
        .from('user_gifts')
        .select('id, user_id, gift_no, gift_content, gift_price, gift_image, gift_status, is_active, completed_at, created_at, updated_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
    );
    if (error) throw error;
    let normalizedGifts = Array.isArray(data) ? [...data] : [];
    const expiredGiftIds = getExpiredActiveGiftIds(normalizedGifts);
    if (expiredGiftIds.length > 0) {
      normalizedGifts = markGiftsAsHistory(normalizedGifts, expiredGiftIds);
    }
    const currentGiftId = currentGift.value?.id;
    historyGifts.value = normalizedGifts.filter((gift) => gift.id !== currentGiftId);
  } catch (err) {
    logger.warn('gift-center', '加载历史礼物失败:', err);
    historyGifts.value = [];
  }
};

const loadData = async () => {
  loading.value = true;
  mainLoadError.value = '';
  try {
    const uid = userInfo.value?.id;
    if (!uid) throw new Error('NOT_LOGGED_IN');

    const [profileRes, activeGiftRes] = await Promise.allSettled([
      withTaskTimeout(
        Promise.all([
          supabase.from('profiles').select('id, shipping_recipient, shipping_phone, shipping_address').eq('id', uid).single(),
          supabase.rpc('get_my_sensitive_profile')
        ]).then(([pub, sec]) => ({
          data: { ...(pub.data || {}), ...(sec.data || {}) },
          error: pub.error || sec.error
        }))
      ),
      withTaskTimeout(
        supabase
          .from('user_gifts')
          .select('id, user_id, gift_no, gift_content, gift_price, gift_image, gift_status, is_active, completed_at, created_at, updated_at')
          .eq('user_id', uid)
          .eq('is_active', true)
          .order('updated_at', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)
      )
    ]);

    if (profileRes.status === 'rejected') throw profileRes.reason;
    const pData = profileRes.value?.data || {};

    const activeGiftData = activeGiftRes.status === 'fulfilled' ? activeGiftRes.value?.data : null;
    if (!activeGiftRes.value?.error && Array.isArray(activeGiftData) && activeGiftData.length) {
      let normalizedCurrentGift = activeGiftData[0];
      if (isGiftExpiredCompleted(normalizedCurrentGift)) {
        normalizedCurrentGift = { ...normalizedCurrentGift, is_active: false };
      }
      currentGift.value = normalizedCurrentGift?.is_active ? normalizedCurrentGift : null;
    } else if (pData.gift_content) {
      currentGift.value = {
        gift_no: pData.gift_no,
        gift_content: pData.gift_content,
        gift_price: pData.gift_price,
        gift_status: pData.gift_status || 'preparing',
        created_at: pData.updated_at || pData.created_at,
        is_active: true
      };
    } else {
      currentGift.value = null;
    }

    // 历史 + 海报并行（地址由 AddressManager 自主加载与迁移）
    await Promise.all([
      loadHistoryGifts(uid),
      loadPosters(uid)
    ]);
  } catch (err) {
    logger.error('gift-center', '加载失败:', err);
    mainLoadError.value = err?.message || '加载失败，请稍后重试';
  } finally {
    loading.value = false;
  }
};

const loadPosters = async (uid) => {
  if (!uid) return;
  try {
    const { data, error } = await supabase
      .from('poster_requests')
      .select('id, recipient, material_fee, status, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    posterRequests.value = (!error && Array.isArray(data)) ? data : [];
  } catch {
    posterRequests.value = [];
  }
};

const fetchData = loadData;

onMounted(() => {
  if (isLoggedIn.value) {
    void loadData();
  } else {
    router.push('/login');
  }
});
</script>

<style scoped src="./style.scoped.css"></style>
