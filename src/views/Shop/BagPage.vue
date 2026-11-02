<template>
  <div class="bag-page">
    <header class="bag-head">
      <div class="head-left">
        <button type="button" class="icon-btn" aria-label="返回商城" @click="goBack">
          <ChevronLeft :size="22" :stroke-width="1.7" aria-hidden="true" />
        </button>
        <div>
          <p class="head-kicker">BOH STORE</p>
          <h1>购物袋</h1>
        </div>
      </div>
      <button type="button" class="avatar-btn" aria-label="账户" @click="goAccount">
        <img
          v-if="isLoggedIn && userInfo.avatarUrl"
          :src="userInfo.avatarUrl"
          :alt="userInfo.username"
        />
        <span v-else-if="isLoggedIn">{{ avatarInitial }}</span>
        <User v-else :size="18" :stroke-width="1.9" aria-hidden="true" />
      </button>
    </header>

    <main class="bag-main">
      <BagPanel
        ref="panelRef"
        :initial-view="initialView"
        @checkout="goCheckout"
        @browse="goShop"
      />
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { ChevronLeft, User } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import BagPanel from './BagPanel.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const { isLoggedIn } = storeToRefs(authStore);
const { userInfo } = authStore;

const panelRef = ref(null);
const initialView = computed(() => (route.query.view === 'orders' ? 'orders' : 'cart'));

const avatarInitial = computed(() =>
  String(userInfo.username || '?')
    .trim()
    .charAt(0)
    .toUpperCase(),
);

const goBack = () => {
  if (window.history.length > 1) router.back();
  else router.push('/shop');
};
const goShop = () => router.push('/shop');
const goAccount = () => router.push('/shop/account');
const goCheckout = () => router.push('/shop?tab=bag&checkout=1');

let navResizeObserver = null;
const syncNavHeight = () => {
  const nav = document.getElementById('unified-nav-container');
  const page = document.querySelector('.bag-page');
  if (!nav || !page) return;
  const height = nav.getBoundingClientRect().height;
  if (height > 0) page.style.setProperty('--nav-h', `${Math.ceil(height)}px`);
};

onMounted(() => {
  syncNavHeight();
  if (typeof ResizeObserver !== 'undefined') {
    navResizeObserver = new ResizeObserver(syncNavHeight);
    const navEl = document.getElementById('unified-nav-container');
    if (navEl) navResizeObserver.observe(navEl);
  }
});

onBeforeUnmount(() => {
  navResizeObserver?.disconnect();
  navResizeObserver = null;
});
</script>

<style src="./store-tokens.css"></style>
<style scoped>
.bag-page {
  --nav-h: var(--bohai-standalone-nav-height, 64px);
  box-sizing: border-box;
  min-height: 100vh;
  padding: calc(var(--nav-h, 64px) + 8px) 0 48px;
  background: var(--boh-bg-secondary, #f5f5f7);
  color: var(--boh-text-primary, #1d1d1f);
}

.bag-page *,
.bag-page *::before,
.bag-page *::after {
  box-sizing: border-box;
}

.bag-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: min(680px, calc(100% - 32px));
  margin: 0 auto;
  padding: 10px 0 18px;
}

.head-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-btn {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  margin-left: -8px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.head-kicker {
  margin: 0 0 2px;
  color: var(--boh-text-secondary, #86868b);
  font-size: 11px;
  letter-spacing: 0.16em;
}

.bag-head h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 500;
  letter-spacing: -0.01em;
}

.avatar-btn {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.08));
  border-radius: 50%;
  background: var(--boh-bg-primary, #fff);
  color: inherit;
  font-size: 13px;
  cursor: pointer;
}

.avatar-btn img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bag-main {
  width: min(680px, calc(100% - 32px));
  margin: 0 auto;
}
</style>
