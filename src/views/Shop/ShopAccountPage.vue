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
</style>
