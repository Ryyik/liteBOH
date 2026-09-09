<template>
  <div class="shop-account-page">
    <ShopAccountPanel mode="page" />
  </div>
</template>

<script setup>
import ShopAccountPanel from './ShopAccountPanel.vue';
</script>

<style scoped>
.shop-account-page {
  min-height: 100dvh;
  padding-top: calc(env(safe-area-inset-top, 0px) + 64px);
  background: #ffffff;
}

/* 暗色（dark audit 2026-09-08） */
html[data-theme="dark"] .shop-account-page {
  background: #0d0d0f;
  color: #f5f5f7;
}

</style>
