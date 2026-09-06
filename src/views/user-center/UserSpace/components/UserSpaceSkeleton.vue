<template>
  <div class="user-space-skeleton" :class="{ 'is-dark': isDark }" aria-hidden="true">
    <div class="uss-navbar">
      <div class="uss-navbar-inner">
        <div class="uss-navbar-brand uss-shimmer"></div>
        <div class="uss-navbar-links">
          <div class="uss-navbar-link uss-shimmer" v-for="n in 4" :key="`nav-link-${n}`"></div>
        </div>
        <div class="uss-navbar-avatar uss-shimmer"></div>
      </div>
    </div>

    <div class="uss-content">
      <div class="uss-tab-content">
        <div class="uss-post-card" v-for="n in 3" :key="`post-skeleton-${n}`">
          <div class="uss-post-header">
            <div class="uss-avatar uss-shimmer"></div>
            <div class="uss-headlines">
              <div class="uss-name uss-shimmer"></div>
              <div class="uss-time uss-shimmer"></div>
            </div>
          </div>
          <div class="uss-post-body">
            <div class="uss-title uss-shimmer"></div>
            <div class="uss-line long uss-shimmer"></div>
            <div class="uss-line medium uss-shimmer"></div>
            <div class="uss-line short uss-shimmer"></div>
          </div>
          <div class="uss-post-actions">
            <div class="uss-action uss-shimmer"></div>
            <div class="uss-action uss-shimmer"></div>
            <div class="uss-action uss-shimmer"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="uss-bottom-nav">
      <div class="uss-bottom-nav-inner">
        <div class="uss-nav-item" v-for="item in navItems" :key="`bottom-nav-${item.id}`">
          <div class="uss-nav-icon uss-shimmer"></div>
          <div class="uss-nav-label uss-shimmer"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const navItems = [
  { id: 'posts', label: '帖子' },
  { id: 'community', label: '社区' },
  { id: 'ai', label: 'AI' },
  { id: 'messages', label: '消息' },
  { id: 'profile', label: '我的' }
];

const isDark = ref(false);

onMounted(() => {
  try {
    const saved = localStorage.getItem('boh-theme');
    if (saved === 'dark') isDark.value = true;
    if (saved === 'system' && typeof window !== 'undefined') {
      isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
  } catch {}
});
</script>

<style scoped>
.user-space-skeleton {
  min-height: 100vh;
  background:
    radial-gradient(900px 260px at 18% -80px, rgba(37, 99, 235, 0.09), transparent 62%),
    radial-gradient(760px 260px at 86% 0, rgba(20, 184, 166, 0.07), transparent 58%),
    #f6f8fb;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.uss-shimmer {
  background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: uss-shimmer-anim 1.5s infinite;
  border-radius: 8px;
}

@keyframes uss-shimmer-anim {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.uss-navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  height: 56px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: var(--liquid-filter, blur(28px) saturate(180%) brightness(1.02));
  -webkit-backdrop-filter: var(--liquid-filter, blur(28px) saturate(180%) brightness(1.02));
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.uss-navbar-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 24px;
}

.uss-navbar-brand {
  width: 100px;
  height: 28px;
  border-radius: 6px;
}

.uss-navbar-links {
  display: flex;
  gap: 20px;
  flex: 1;
}

.uss-navbar-link {
  width: 56px;
  height: 14px;
  border-radius: 4px;
}

.uss-navbar-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  flex-shrink: 0;
}

.uss-content {
  flex: 1;
  padding-top: 76px;
  padding-bottom: 120px;
  max-width: 860px;
  width: 100%;
  margin: 0 auto;
}

.uss-tab-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
}

.uss-post-card {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: var(--liquid-filter, blur(28px) saturate(180%) brightness(1.02));
  -webkit-backdrop-filter: var(--liquid-filter, blur(28px) saturate(180%) brightness(1.02));
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 24px;
  padding: 24px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.04);
}

.uss-post-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.uss-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  flex-shrink: 0;
}

.uss-headlines {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.uss-name {
  width: 120px;
  height: 14px;
  border-radius: 4px;
}

.uss-time {
  width: 80px;
  height: 12px;
  border-radius: 4px;
}

.uss-post-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.uss-title {
  width: 70%;
  height: 20px;
  border-radius: 4px;
}

.uss-line {
  height: 14px;
  border-radius: 4px;
}

.uss-line.short { width: 40%; }
.uss-line.medium { width: 60%; }
.uss-line.long { width: 90%; }

.uss-post-actions {
  display: flex;
  gap: 24px;
  padding-top: 16px;
  border-top: 1px solid rgba(0, 0, 0, 0.04);
}

.uss-action {
  width: 60px;
  height: 20px;
  border-radius: 10px;
}

.uss-bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  justify-content: center;
  padding: 0 16px;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  pointer-events: none;
}

.uss-bottom-nav-inner {
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 8px;
  padding: 7px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: var(--liquid-filter, blur(28px) saturate(180%) brightness(1.02));
  -webkit-backdrop-filter: var(--liquid-filter, blur(28px) saturate(180%) brightness(1.02));
  border-radius: 36px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1), 0 2px 8px rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.04);
  width: 100%;
  max-width: 480px;
  pointer-events: none;
}

.uss-nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  flex: 1;
}

.uss-nav-icon {
  width: 22px;
  height: 22px;
  border-radius: 6px;
}

.uss-nav-label {
  width: 28px;
  height: 10px;
  border-radius: 3px;
}

@media (max-width: 768px) {
  .uss-post-card {
    padding: 20px;
    border-radius: 20px;
  }
  .uss-avatar {
    width: 40px;
    height: 40px;
  }
  .uss-name {
    width: 100px;
    height: 12px;
  }
  .uss-time {
    width: 60px;
    height: 10px;
  }
  .uss-title {
    height: 18px;
  }
  .uss-line {
    height: 12px;
  }
  .uss-action {
    width: 50px;
    height: 18px;
  }
  .uss-navbar-links {
    display: none;
  }
}

.user-space-skeleton.is-dark {
  background:
    radial-gradient(900px 260px at 18% -80px, rgba(96, 165, 250, 0.12), transparent 62%),
    radial-gradient(760px 260px at 86% 0, rgba(45, 212, 191, 0.08), transparent 58%),
    #101216;
}

.user-space-skeleton.is-dark .uss-navbar {
  background: rgba(24, 26, 32, 0.88);
  border-bottom-color: rgba(255, 255, 255, 0.06);
}

.user-space-skeleton.is-dark .uss-post-card {
  background: rgba(24, 26, 32, 0.8);
  border-color: rgba(255, 255, 255, 0.06);
}

.user-space-skeleton.is-dark .uss-bottom-nav-inner {
  background: rgba(24, 26, 32, 0.88);
  border-color: rgba(255, 255, 255, 0.06);
}

.user-space-skeleton.is-dark .uss-shimmer {
  background: linear-gradient(90deg, #2a2d35 25%, #363941 50%, #2a2d35 75%);
}

.user-space-skeleton.is-dark .uss-post-actions {
  border-top-color: rgba(255, 255, 255, 0.05);
}
</style>
