<template>
  <div class="subscription-page" :style="{ '--user-center-nav-offset': isFromUserSpace ? '0px' : '72px', paddingTop: isFromUserSpace ? '0px' : '72px' }">
    <UserCenterPageHeader v-if="isFromUserSpace" title="订阅与积分" max-width="1200px" @back="goBack" />

    <SubscriptionPlans />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import SubscriptionPlans from '@/components/SubscriptionPlans.vue';
import { resolveSettingsBackLocation } from '@/utils/user-space-navigation.js';

const router = useRouter();
const route = useRoute();
const isFromUserSpace = computed(() => String(route.query.from || '').startsWith('userspace'));

const goBack = () => {
  router.push(resolveSettingsBackLocation(route));
};
</script>

<style scoped>
@import './style.scoped.css';
</style>
