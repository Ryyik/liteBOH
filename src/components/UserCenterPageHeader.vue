<template>
  <header class="user-center-page-header">
    <div class="user-center-page-header-inner" :style="{ maxWidth }">
      <div class="header-back">
        <UserCenterBackButton :label="backLabel" @click="$emit('back', $event)" />
      </div>
      <h2 class="header-title">{{ title }}</h2>
      <div class="header-actions">
        <slot name="actions"></slot>
      </div>
    </div>
  </header>
</template>

<script setup>
import UserCenterBackButton from './UserCenterBackButton.vue';

defineProps({
  title: {
    type: String,
    required: true
  },
  backLabel: {
    type: String,
    default: '返回'
  },
  maxWidth: {
    type: String,
    default: '1400px'
  }
});

defineEmits(['back']);
</script>

<style scoped>
.user-center-page-header {
  position: sticky;
  top: var(--user-center-nav-offset, 72px);
  z-index: 700;
  width: 100%;
  min-height: var(--user-center-page-header-height, 76px);
  background: transparent;
}

.user-center-page-header::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    linear-gradient(
      180deg,
      rgba(248, 249, 252, 0.88) 0%,
      rgba(248, 249, 252, 0.72) 46%,
      rgba(248, 249, 252, 0.28) 72%,
      rgba(248, 249, 252, 0) 100%
    );
  backdrop-filter: blur(30px) saturate(170%);
  -webkit-backdrop-filter: blur(30px) saturate(170%);
  -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 48%, rgba(0, 0, 0, 0.42) 74%, transparent 100%);
  mask-image: linear-gradient(180deg, #000 0%, #000 48%, rgba(0, 0, 0, 0.42) 74%, transparent 100%);
}

.user-center-page-header-inner {
  position: relative;
  z-index: 1;
  min-height: var(--user-center-page-header-height, 76px);
  margin: 0 auto;
  padding: 0 clamp(18px, 4vw, 40px);
  display: grid;
  grid-template-columns: minmax(52px, 1fr) auto minmax(52px, 1fr);
  align-items: center;
  box-sizing: border-box;
}

.header-back {
  justify-self: start;
  display: inline-flex;
  align-items: center;
}

.header-title {
  grid-column: 2;
  margin: 0;
  color: #08090b;
  font-size: clamp(18px, 2.3vw, 22px);
  line-height: 1.2;
  font-weight: 800;
  letter-spacing: 0;
  text-align: center;
  white-space: nowrap;
}

.header-actions {
  justify-self: end;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

:global([data-theme="dark"]) .user-center-page-header {
  background: transparent;
}

:global([data-theme="dark"]) .user-center-page-header::before {
  background:
    linear-gradient(
      180deg,
      rgba(13, 18, 29, 0.88) 0%,
      rgba(13, 18, 29, 0.72) 46%,
      rgba(13, 18, 29, 0.28) 72%,
      rgba(13, 18, 29, 0) 100%
    );
}

:global([data-theme="dark"]) .header-title {
  color: #ffffff;
}

@media (max-width: 480px) {
  .user-center-page-header {
    top: var(--user-center-nav-offset, 56px);
    min-height: var(--user-center-page-header-height, 72px);
  }

  .user-center-page-header-inner {
    min-height: var(--user-center-page-header-height, 72px);
    padding: 0 20px;
  }
}
</style>
