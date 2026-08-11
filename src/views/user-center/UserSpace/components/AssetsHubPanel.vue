<template>
  <div class="profile-subpage-shell">
    <UserCenterPageHeader title="积分与会员" back-label="返回我的" max-width="1200px" @back="$emit('back')" />

    <div class="profile-subpage-body">
      <!-- 用户 + 积分 + Tab 合并大卡片 -->
      <nav class="ah-hub-card" role="tablist" :style="tabIndicatorStyle">
        <!-- 用户信息 + 当前积分（同一行） -->
        <div class="ah-top-row">
          <div class="ah-user-left">
            <div v-if="avatarUrl" class="ah-avatar has-avatar">
              <img :src="avatarUrl" alt="头像" class="ah-avatar-img" loading="lazy">
            </div>
            <div v-else class="ah-avatar">{{ displayInitial }}</div>
            <div class="ah-user-info">
              <div class="ah-name-row">
                <span class="ah-username">{{ displayName }}</span>
                <span v-if="tierCode" class="tier-badge" :class="`tier-${tierCode}`">{{ tierDisplayName }}</span>
              </div>
              <span class="ah-uid">UID · {{ uidShort }}</span>
            </div>
          </div>

          <div class="ah-points-block">
            <div class="ah-points-icon-wrap">
              <Coins :size="18" :stroke-width="1.7" />
            </div>
            <div class="ah-points-meta">
              <span class="ah-points-label">当前积分</span>
              <span class="ah-points-value">{{ pointsDisplay }}</span>
            </div>
          </div>
        </div>

        <!-- Tab 区 · 底部导航栏同款 -->
        <div class="ah-hub-tabs">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.id"
            class="ah-tab"
            :class="{ active: activeTab === tab.id }"
            @click="activeTab = tab.id"
          >
            <component :is="tab.icon" class="ah-tab-icon" :size="18" :stroke-width="1.9" aria-hidden="true" />
            <span class="ah-tab-label">{{ tab.label }}</span>
          </button>
        </div>
      </nav>

      <!-- 积分明细 Tab：周签到 + 管理员发放 + 商城订单 -->
      <section v-if="activeTab === 'points'" class="ah-section">
        <div v-if="ledgerLoading" class="ah-order-skeleton">
          <div v-for="n in 4" :key="n" class="ah-skeleton-block" />
        </div>
        <div v-else-if="ledger.length === 0" class="ah-empty-state">
          <div class="ah-empty-icon">
            <ScrollText :size="26" :stroke-width="1.5" />
          </div>
          <h3>暂无积分明细</h3>
          <p>周签到、管理员发放与商城订单都会记录在这里</p>
        </div>
        <div v-else class="ah-ledger">
          <article v-for="item in ledger" :key="item.key" class="ah-ledger-item">
            <div class="ah-ledger-icon" :class="`tone-${item.tone}`">
              <component :is="item.icon" :size="17" :stroke-width="1.8" />
            </div>
            <div class="ah-ledger-main">
              <span class="ah-ledger-title">{{ item.title }}</span>
              <span v-if="item.remark" class="ah-ledger-remark">{{ item.remark }}</span>
            </div>
            <div class="ah-ledger-right">
              <span class="ah-ledger-amount" :class="{ negative: item.amount < 0, zero: item.amount === 0 }">
                {{ item.amount >= 0 ? '+' : '' }}{{ item.amount }}
              </span>
              <span class="ah-ledger-date">{{ formatDate(item.time) }}</span>
            </div>
          </article>
        </div>
      </section>

      <!-- 订阅计划 Tab（与订阅页完全一致的卡片） -->
      <section v-else-if="activeTab === 'subscription'" class="ah-section">
        <SubscriptionPlans />
      </section>

      <!-- 商城 Tab -->
      <section v-else-if="activeTab === 'shop'" class="ah-section">
        <div class="ah-shop-preview">
          <div class="ah-shop-stats">
            <div class="ah-shop-stat">
              <span class="ah-shop-stat-value">{{ productsCount }}</span>
              <span class="ah-shop-stat-label">在售商品</span>
            </div>
            <div class="ah-shop-stat">
              <span class="ah-shop-stat-value">{{ formatPoints(userPoints) }}</span>
              <span class="ah-shop-stat-label">可用积分</span>
            </div>
          </div>
          <button class="ah-shop-btn" @click="goToShop">
            <ShoppingBag :size="15" :stroke-width="1.8" />
            进入方块商店
          </button>
        </div>
      </section>

      <!-- 订单 Tab -->
      <section v-else-if="activeTab === 'orders'" class="ah-section">
        <div v-if="ordersLoading" class="ah-order-skeleton">
          <div v-for="n in 3" :key="n" class="ah-skeleton-block" />
        </div>
        <div v-else-if="orders.length === 0" class="ah-empty-state">
          <div class="ah-empty-icon">
            <Package :size="26" :stroke-width="1.5" />
          </div>
          <h3>暂无订单</h3>
          <p>商城下单后，订单会出现在这里</p>
          <button class="ah-shop-btn ah-shop-btn-ghost" @click="goToShop">去商城逛逛</button>
        </div>
        <div v-else class="ah-order-list">
          <article v-for="order in orders" :key="order.id" class="ah-order-item">
            <div class="ah-order-top">
              <span class="ah-order-no">{{ order.order_no }}</span>
              <span class="ah-order-date">{{ formatDate(order.created_at) }}</span>
            </div>
            <div class="ah-order-bottom">
              <span class="ah-order-items">{{ order.item_count }} 件商品</span>
              <span class="ah-order-points">-{{ order.total_points }} 积分</span>
            </div>
          </article>
        </div>
      </section>

      <!-- 收货地址 Tab -->
      <section v-else-if="activeTab === 'addresses'" class="ah-section">
        <AddressManager variant="glass" :show-header="false" />
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import {
  CalendarCheck, Coins, Crown, MapPin, Package, ScrollText, Send, ShoppingBag
} from 'lucide-vue-next';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import SubscriptionPlans from '@/components/SubscriptionPlans.vue';
import AddressManager from '@/components/AddressManager.vue';
import { useAuthStore } from '@/stores/auth';
import { supabase } from '@/utils/supabase-client.js';
import { useUserTier } from '@/composables/useUserTier.js';
import { PLAN_DISPLAY_NAMES } from '@/utils/subscription-benefits.js';

defineEmits(['back']);

const router = useRouter();
const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);

const { fetchUserTier, getUserTierCode } = useUserTier();
const tierCode = ref('');
const tierDisplayName = computed(() => PLAN_DISPLAY_NAMES[tierCode.value] || '');

const activeTab = ref('points');
const tabs = [
  { id: 'points', label: '积分明细', icon: ScrollText },
  { id: 'subscription', label: '订阅计划', icon: Crown },
  { id: 'shop', label: '商城', icon: ShoppingBag },
  { id: 'orders', label: '订单', icon: Package },
  { id: 'addresses', label: '收货地址', icon: MapPin },
];

const activeTabIndex = computed(() => Math.max(0, tabs.findIndex(t => t.id === activeTab.value)));
const tabIndicatorStyle = computed(() => ({
  '--ah-tab-count': tabs.length,
  '--ah-active-center': `${((activeTabIndex.value + 0.5) / tabs.length) * 100}%`,
}));

const avatarUrl = computed(() => String(userInfo.value?.avatarUrl || '').trim());
const displayName = computed(() => String(userInfo.value?.username || '').trim() || '未命名用户');
const displayInitial = computed(() => displayName.value.charAt(0).toUpperCase());
const uidShort = computed(() => String(userInfo.value?.id || '').slice(0, 8));

const ordersLoading = ref(true);
const orders = ref([]);
const productsCount = ref(0);
const ledgerLoading = ref(true);
const ledger = ref([]);

const userPoints = computed(() => Number(userInfo.value?.points) || 0);
const pointsDisplay = computed(() => userPoints.value.toLocaleString());

const formatPoints = (pts) => {
  const n = Number(pts) || 0;
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toLocaleString();
};

const formatDate = (d) => {
  if (!d) return '--';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const loadOrders = async () => {
  if (!userInfo.value?.id) { ordersLoading.value = false; return; }
  const { data, error } = await supabase
    .from('shop_points_orders')
    .select('id, order_no, total_points, items, created_at')
    .eq('user_id', userInfo.value.id)
    .order('created_at', { ascending: false })
    .limit(20);
  ordersLoading.value = false;
  if (!error && Array.isArray(data)) {
    orders.value = data.map(o => ({
      ...o,
      item_count: Array.isArray(o.items) ? o.items.reduce((s, i) => s + (Number(i?.quantity) || 0), 0) : 0,
    }));
  }
};

const loadProductsCount = async () => {
  const { count, error } = await supabase.from('products').select('id', { count: 'exact', head: true });
  if (!error && Number.isFinite(count)) productsCount.value = count;
};

const WEEKLY_CHECKIN_POINTS = 5;
// 2026-06-30 订阅体系重构：周签到改为每周 +5；此前为「连续 4 周才 +5」
const CHECKIN_NEW_LOGIC_CUTOFF = new Date('2026-06-30T00:00:00.000Z').getTime();

const toWeekKey = (d) => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// 计算某次签到的实际奖励：重构后每周 +5；重构前的记录按连续签到第 4/8/12… 周 +5，其余 +0
const resolveCheckinAmount = (signedAt, weekStartDate, weekSet) => {
  if (!signedAt || new Date(signedAt).getTime() >= CHECKIN_NEW_LOGIC_CUTOFF) {
    return WEEKLY_CHECKIN_POINTS;
  }
  let streak = 1;
  let cursor = new Date(`${weekStartDate}T00:00:00.000Z`);
  cursor = new Date(cursor.getTime() - 7 * 86400000);
  while (weekSet.has(toWeekKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 7 * 86400000);
  }
  return streak % 4 === 0 ? WEEKLY_CHECKIN_POINTS : 0;
};

const loadLedger = async () => {
  const userId = userInfo.value?.id;
  if (!userId) { ledgerLoading.value = false; return; }

  const results = [];

  const [checkinRes, adminRes, orderRes] = await Promise.allSettled([
    supabase.from('forum_weekly_checkins')
      .select('id, week_start_date, signed_at')
      .eq('user_id', userId)
      .order('signed_at', { ascending: false })
      .limit(50),
    supabase.from('points_transactions')
      .select('id, amount, balance_after, reason, remark, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('shop_points_orders')
      .select('id, order_no, total_points, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
  ]);

  if (checkinRes.status === 'fulfilled' && !checkinRes.value.error && Array.isArray(checkinRes.value.data)) {
    const weekSet = new Set(checkinRes.value.data.map((r) => String(r.week_start_date)));
    checkinRes.value.data.forEach((row) => {
      const amount = resolveCheckinAmount(row.signed_at, row.week_start_date, weekSet);
      results.push({
        key: `checkin-${row.id}`,
        icon: CalendarCheck,
        tone: amount > 0 ? 'green' : 'gray',
        title: '周签到',
        remark: `第 ${formatWeekLabel(row.week_start_date)} 周`,
        amount,
        time: row.signed_at
      });
    });
  }

  if (adminRes.status === 'fulfilled' && !adminRes.value.error && Array.isArray(adminRes.value.data)) {
    adminRes.value.data
      .filter((row) => row.reason === 'admin_grant')
      .forEach((row) => {
        results.push({
          key: `grant-${row.id}`,
          icon: Send,
          tone: 'blue',
          title: '管理员发放',
          remark: String(row.remark || '').trim() || '积分发放',
          amount: Number(row.amount) || 0,
          time: row.created_at
        });
      });
  }

  if (orderRes.status === 'fulfilled' && !orderRes.value.error && Array.isArray(orderRes.value.data)) {
    orderRes.value.data.forEach((row) => {
      results.push({
        key: `order-${row.id}`,
        icon: ShoppingBag,
        tone: 'orange',
        title: '商城订单',
        remark: String(row.order_no || '').slice(0, 18),
        amount: -(Number(row.total_points) || 0),
        time: row.created_at
      });
    });
  }

  results.sort((a, b) => new Date(b.time) - new Date(a.time));
  ledger.value = results;
  ledgerLoading.value = false;
};

const formatWeekLabel = (weekStart) => {
  if (!weekStart) return '';
  const date = new Date(`${weekStart}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const end = new Date(date);
  end.setDate(end.getDate() + 6);
  const pad = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${pad(date)}–${pad(end)}`;
};

const goToShop = () => { router.push('/shop'); };

const loadTier = async () => {
  const id = userInfo.value?.id;
  if (!id) return;
  await fetchUserTier(id);
  tierCode.value = getUserTierCode(id) || 'free';
};

onMounted(() => {
  void loadOrders();
  void loadProductsCount();
  void loadLedger();
  void loadTier();
});
</script>

<style scoped>
/* ─── 用户 + 积分 + Tab 合并大卡片 ─── */
.ah-hub-card {
  --ah-tab-count: 4;
  --ah-active-center: 12.5%;
  --ah-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  display: flex;
  flex-direction: column;
  padding: 20px 24px 10px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 14px 40px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.8);
  width: 100%;
  max-width: 980px;
  margin: 0 auto;
}

/* 顶部行：用户信息（左）+ 当前积分（右，同一行） */
.ah-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 16px;
}
.ah-user-left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.ah-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(135deg, #007aff, #5856d6);
  box-shadow: 0 6px 16px rgba(0, 122, 255, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.4);
  flex-shrink: 0;
  overflow: hidden;
}
.ah-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ah-user-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.ah-name-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.ah-username {
  font-size: 19px;
  font-weight: 800;
  color: #1d1d1f;
  letter-spacing: -0.02em;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ah-uid {
  font-size: 11px;
  font-weight: 600;
  color: #8e8e93;
  letter-spacing: 0.06em;
}
.ah-name-row :global(.tier-badge.tier-free) {
  background: rgba(142, 142, 147, 0.1);
  color: #8e8e93;
}
:global(.user-space-page[data-theme="dark"]) .ah-name-row :global(.tier-badge.tier-free) {
  background: rgba(255, 255, 255, 0.1);
  color: #a1a1aa;
}

/* 当前积分（右侧胶囊） */
.ah-points-block {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(0, 122, 255, 0.06);
  border: 1px solid rgba(0, 122, 255, 0.1);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
}
.ah-points-icon-wrap {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #007aff;
  background: rgba(0, 122, 255, 0.12);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
}
.ah-points-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}
.ah-points-label {
  font-size: 11px;
  font-weight: 600;
  color: #8e8e93;
  line-height: 1;
}
.ah-points-value {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #1d1d1f;
  line-height: 1;
}

/* Tab 区 · 底部导航栏同款 */
.ah-hub-tabs {
  position: relative;
  display: grid;
  grid-template-columns: repeat(var(--ah-tab-count), minmax(0, 1fr));
  align-items: center;
  gap: 0;
  padding-top: 8px;
}
.ah-hub-tabs::before {
  content: "";
  position: absolute;
  z-index: 0;
  top: 12px;
  bottom: 0;
  left: var(--ah-active-center);
  width: calc(100% / var(--ah-tab-count) - 8px);
  border-radius: 999px;
  background: rgba(0, 122, 255, 0.14);
  box-shadow:
    inset 0 0 0 1px rgba(0, 122, 255, 0.18),
    0 6px 18px rgba(0, 122, 255, 0.12);
  transform: translateX(-50%);
  transition:
    left 210ms var(--ah-ease),
    transform 210ms var(--ah-ease);
}
.ah-tab {
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 6px 12px;
  border: none;
  background: transparent;
  border-radius: 999px;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    color 150ms ease,
    transform 130ms var(--ah-ease);
  color: var(--text-secondary);
  position: relative;
  overflow: hidden;
}
.ah-tab:hover {
  background: rgba(15, 23, 42, 0.045);
  color: var(--text-primary);
}
.ah-tab.active:hover { background: transparent; }
.ah-tab:active { transform: translateY(0) scale(0.975); }
.ah-tab.active { color: #1d1d1f; }
.ah-tab-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  transition: transform 170ms var(--ah-ease), color 140ms ease;
}
.ah-tab.active .ah-tab-icon {
  transform: translateY(-3px) scale(1.14);
  animation: ah-nav-icon-pop 180ms var(--ah-ease) both;
}
@keyframes ah-nav-icon-pop {
  0% { transform: translateY(1px) scale(0.9); }
  70% { transform: translateY(-5px) scale(1.2); }
  100% { transform: translateY(-3px) scale(1.14); }
}
.ah-tab-label {
  font-size: 12px;
  letter-spacing: 0;
  font-weight: 700;
  white-space: nowrap;
  transition: transform 170ms var(--ah-ease), font-weight 140ms ease;
}
.ah-tab.active .ah-tab-label { font-weight: 600; transform: translateY(-1px); }

/* ─── Section 通用 ─── */
.ah-section {
  animation: ah-fade 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
@keyframes ah-fade {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ─── 积分明细流水 ─── */
.ah-ledger {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ah-ledger-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.8);
  transition: transform 0.2s var(--ah-ease), box-shadow 0.2s ease;
}
.ah-ledger-item:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8); }
.ah-ledger-icon {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ah-ledger-icon.tone-green { color: #34c759; background: rgba(52, 199, 89, 0.12); }
.ah-ledger-icon.tone-blue { color: #007aff; background: rgba(0, 122, 255, 0.12); }
.ah-ledger-icon.tone-orange { color: #ff9500; background: rgba(255, 149, 0, 0.14); }
.ah-ledger-icon.tone-gray { color: #8e8e93; background: rgba(142, 142, 147, 0.12); }
.ah-ledger-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.ah-ledger-title { font-size: 14px; font-weight: 700; color: #1d1d1f; }
.ah-ledger-remark {
  font-size: 12px;
  color: #8e8e93;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ah-ledger-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
}
.ah-ledger-amount { font-size: 16px; font-weight: 800; color: #34c759; letter-spacing: -0.01em; }
.ah-ledger-amount.negative { color: #ff3b30; }
.ah-ledger-amount.zero { color: #8e8e93; font-weight: 600; }
.ah-ledger-date { font-size: 11px; color: #8e8e93; }

/* ─── 空状态 · 毛玻璃 ─── */
.ah-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 44px 24px;
  text-align: center;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.8);
}
.ah-empty-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8e8e93;
  background: rgba(15, 23, 42, 0.04);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
  margin-bottom: 4px;
}
.ah-empty-state h3 { margin: 2px 0 0; font-size: 16px; font-weight: 800; color: #1d1d1f; }
.ah-empty-state p { margin: 0; font-size: 13px; color: #8e8e93; }

/* ─── 商城 ─── */
.ah-shop-preview { display: flex; flex-direction: column; gap: 14px; }
.ah-shop-stats { display: flex; gap: 12px; }
.ah-shop-stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 22px 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.8);
}
.ah-shop-stat-value { font-size: 24px; font-weight: 800; letter-spacing: -0.02em; color: #1d1d1f; }
.ah-shop-stat-label { font-size: 11px; font-weight: 600; color: #8e8e93; }
.ah-shop-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 46px;
  border: none;
  border-radius: 999px;
  font-size: 13.5px;
  font-weight: 700;
  color: #fff;
  background: #1d1d1f;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.ah-shop-btn:hover { background: #000; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18); }
.ah-shop-btn:active { transform: translateY(0); }
.ah-shop-btn-ghost {
  margin-top: 8px;
  padding: 0 28px;
  width: fit-content;
  background: rgba(0, 122, 255, 0.14);
  color: #007aff;
  box-shadow: none;
  height: 40px;
}
.ah-shop-btn-ghost:hover { background: rgba(0, 122, 255, 0.2); color: #007aff; }

/* ─── 订单 ─── */
.ah-order-skeleton { display: flex; flex-direction: column; gap: 10px; }
.ah-skeleton-block {
  height: 68px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.5);
  animation: ah-skel 1.4s ease-in-out infinite alternate;
}
@keyframes ah-skel { to { opacity: 0.45; } }
.ah-order-list { display: flex; flex-direction: column; gap: 10px; }
.ah-order-item {
  padding: 16px 20px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.8);
  transition: transform 0.2s var(--ah-ease), box-shadow 0.2s ease;
}
.ah-order-item:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8); }
.ah-order-top { display: flex; justify-content: space-between; margin-bottom: 6px; }
.ah-order-no { font-size: 12px; font-weight: 700; color: #1d1d1f; font-family: ui-monospace, "SF Mono", monospace; }
.ah-order-date { font-size: 11px; color: #8e8e93; }
.ah-order-bottom { display: flex; justify-content: space-between; }
.ah-order-items { font-size: 12px; color: #6e6e73; }
.ah-order-points { font-size: 12px; font-weight: 700; color: #ff3b30; }

/* ─── 深色模式 ─── */
:global(.user-space-page[data-theme="dark"]) .ah-hub-card {
  background: rgba(24, 26, 32, 0.72);
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 18px 38px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
:global(.user-space-page[data-theme="dark"]) .ah-points-block {
  background: rgba(99, 179, 237, 0.1);
  border-color: rgba(99, 179, 237, 0.16);
}
:global(.user-space-page[data-theme="dark"]) .ah-username,
:global(.user-space-page[data-theme="dark"]) .ah-points-value,
:global(.user-space-page[data-theme="dark"]) .ah-tab.active,
:global(.user-space-page[data-theme="dark"]) .ah-ledger-title {
  color: #f5f7fa;
}
:global(.user-space-page[data-theme="dark"]) .ah-uid,
:global(.user-space-page[data-theme="dark"]) .ah-points-label,
:global(.user-space-page[data-theme="dark"]) .ah-tab-label {
  color: #8b8e96;
}
:global(.user-space-page[data-theme="dark"]) .ah-hub-tabs::before {
  background: rgba(99, 179, 237, 0.22);
  box-shadow: inset 0 0 0 1px rgba(99, 179, 237, 0.28), 0 8px 22px rgba(0, 0, 0, 0.28);
}
:global(.user-space-page[data-theme="dark"]) .ah-tab:hover {
  background: rgba(255, 255, 255, 0.08);
}
:global(.user-space-page[data-theme="dark"]) .ah-empty-state,
:global(.user-space-page[data-theme="dark"]) .ah-shop-stat,
:global(.user-space-page[data-theme="dark"]) .ah-order-item,
:global(.user-space-page[data-theme="dark"]) .ah-ledger-item,
:global(.user-space-page[data-theme="dark"]) .ah-skeleton-block {
  background: rgba(24, 26, 32, 0.55);
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
:global(.user-space-page[data-theme="dark"]) .ah-empty-state h3,
:global(.user-space-page[data-theme="dark"]) .ah-shop-stat-value,
:global(.user-space-page[data-theme="dark"]) .ah-order-no {
  color: #f5f7fa;
}
:global(.user-space-page[data-theme="dark"]) .ah-empty-state p,
:global(.user-space-page[data-theme="dark"]) .ah-shop-stat-label,
:global(.user-space-page[data-theme="dark"]) .ah-order-date,
:global(.user-space-page[data-theme="dark"]) .ah-order-items,
:global(.user-space-page[data-theme="dark"]) .ah-ledger-remark,
:global(.user-space-page[data-theme="dark"]) .ah-ledger-date {
  color: #8b8e96;
}
:global(.user-space-page[data-theme="dark"]) .ah-empty-icon {
  background: rgba(255, 255, 255, 0.06);
}
:global(.user-space-page[data-theme="dark"]) .ah-shop-btn-ghost {
  background: rgba(99, 179, 237, 0.18);
  color: #7cb8f5;
}
:global(.user-space-page[data-theme="dark"]) .ah-shop-btn-ghost:hover {
  background: rgba(99, 179, 237, 0.26);
}

/* ─── 响应式 ─── */
@media (max-width: 767px) {
  .ah-hub-card { max-width: none; border-radius: 24px; padding: 16px 16px 8px; }
  .ah-top-row { gap: 8px; padding-bottom: 14px; }
  .ah-user-left { gap: 12px; }
  .ah-avatar { width: 44px; height: 44px; font-size: 18px; }
  .ah-username { font-size: 17px; }
  .ah-name-row { gap: 5px; }
  .ah-points-block { gap: 8px; padding: 6px 10px; }
  .ah-points-icon-wrap { width: 26px; height: 26px; }
  .ah-points-label { display: none; }
  .ah-points-value { font-size: 19px; }
  .ah-tab { min-height: 42px; padding: 6px 6px; gap: 2px; }
  .ah-tab-label { font-size: 11px; }
  .ah-ledger-item { padding: 12px 14px; gap: 12px; }
  .ah-ledger-amount { font-size: 15px; }
  .ah-empty-state { padding: 36px 18px; }
  .ah-shop-stat { padding: 18px 12px; }
}
</style>
