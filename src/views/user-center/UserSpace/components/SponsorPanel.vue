<template>
  <div class="profile-subpage-shell">
    <UserCenterPageHeader title="赞助支持" back-label="返回我的" max-width="650px" @back="$emit('back')" />

    <div class="profile-subpage-body">
      <section class="sponsor-hero apple-card">
        <HomeCatMascot v-if="isHomeCatActive" class="sponsor-hero-cat" pool="background" seed="sponsor-hero"
          size="lg" decorative />
        <div class="sponsor-hero-copy">
          <p class="sponsor-kicker">Sponsor</p>
          <h3>助力我喝杯咖啡</h3>
          <p>你的支持会让方块之家继续维护、更新和变得更好。</p>
        </div>
        <button type="button" class="sponsor-primary-btn" @click="$emit('start-flow')">
          赞助
        </button>
      </section>

      <section class="apple-card sponsor-panel">
        <HomeCatMascot v-if="isHomeCatActive" class="sponsor-panel-cat" pool="ambient" seed="sponsor-panel"
          size="md" decorative />
        <div class="sponsor-section-head">
          <div>
            <p class="sponsor-kicker">Payment</p>
            <h3>选择赞助方式</h3>
          </div>
          <span class="sponsor-status-pill">{{ sponsorStatusText }}</span>
        </div>

        <div class="sponsor-method-grid">
          <button v-for="method in sponsorMethods" :key="method.id" type="button" class="sponsor-method"
            :class="{ active: sponsorMethod === method.id, disabled: method.disabled }"
            :aria-disabled="method.disabled ? 'true' : 'false'" @click="$emit('select-method', method.id)">
            <span class="sponsor-method-icon">{{ method.icon }}</span>
            <span>
              <strong>{{ method.label }}</strong>
              <small>{{ method.desc }}</small>
            </span>
          </button>
        </div>

        <div class="sponsor-action-row">
          <button type="button" class="sponsor-primary-btn" :disabled="sponsorMethod !== 'wechat'"
            @click="$emit('show-qr')">
            {{ sponsorQrVisible ? '刷新二维码' : '显示二维码' }}
          </button>
        </div>

        <transition name="profile-panel-fade">
          <div v-if="sponsorQrVisible" class="sponsor-qr-stage">
            <div v-if="isHomeCatActive" :key="sponsorCatBurstKey" class="sponsor-cat-party"
              aria-hidden="true">
              <HomeCatMascot class="sponsor-party-cat cat-one" pool="reaction"
                :seed="`sponsor-party-${sponsorCatBurstKey}-one`" size="sm" decorative />
              <HomeCatMascot class="sponsor-party-cat cat-two" pool="ambient"
                :seed="`sponsor-party-${sponsorCatBurstKey}-two`" size="sm" decorative />
              <HomeCatMascot class="sponsor-party-cat cat-three" type="like" size="sm" decorative />
              <HomeCatMascot class="sponsor-party-cat cat-four" type="success" size="sm" decorative />
            </div>
            <div v-if="sponsorQrLoadFailed" class="sponsor-qr-placeholder">
              <div class="sponsor-placeholder-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="7" height="7"></rect>
                  <rect x="14" y="3" width="7" height="7"></rect>
                  <rect x="3" y="14" width="7" height="7"></rect>
                  <path d="M14 14h2v2h-2z"></path>
                  <path d="M18 14h3v3"></path>
                  <path d="M14 18h7v3h-7z"></path>
                </svg>
              </div>
              <h4>二维码暂未配置</h4>
              <p>未能加载 src/assets/images/qrcode.webp，请检查图片资源。</p>
            </div>

            <figure v-else class="sponsor-qr-card" :class="{ loading: sponsorQrLoading }">
              <div v-if="sponsorQrLoading" class="sponsor-qr-loading">
                <div class="loading-spinner"></div>
                <span>正在加载赞赏码...</span>
              </div>
              <img :src="sponsorQrImageUrl" alt="微信赞赏二维码" @load="handleQrLoad"
                @error="handleQrError">
              <figcaption>使用微信扫码赞助</figcaption>
            </figure>
          </div>
        </transition>
      </section>
    </div>
  </div>
</template>

<style scoped>
.profile-subpage-shell {
  padding-top: 0;
}
</style>

<script setup>
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import HomeCatMascot from '@/components/HomeCatMascot.vue';

const props = defineProps({
  isHomeCatActive: Boolean,
  sponsorMethods: { type: Array, default: () => [] },
  sponsorMethod: { type: String, default: 'wechat' },
  sponsorStatusText: { type: String, default: '' },
  sponsorQrVisible: Boolean,
  sponsorQrLoadFailed: Boolean,
  sponsorQrLoading: Boolean,
  sponsorQrImageUrl: { type: String, default: '' },
  sponsorCatBurstKey: { type: Number, default: 0 }
});

const emit = defineEmits(['back', 'start-flow', 'select-method', 'show-qr', 'qr-load', 'qr-error']);

function handleQrLoad() {
  emit('qr-load');
}
function handleQrError() {
  emit('qr-error');
}
</script>
