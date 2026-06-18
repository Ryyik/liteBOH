<template>
  <div class="ai-skeleton" :class="{ 'is-dark': isDark }" aria-hidden="true">
    <div class="ai-skeleton-header">
      <div class="ai-skeleton-avatar ai-shimmer"></div>
      <div class="ai-skeleton-header-text">
        <div class="ai-skeleton-title ai-shimmer"></div>
        <div class="ai-skeleton-subtitle ai-shimmer"></div>
      </div>
    </div>

    <div class="ai-skeleton-messages">
      <div class="ai-skeleton-message received">
        <div class="ai-skeleton-bubble-avatar ai-shimmer"></div>
        <div class="ai-skeleton-bubble">
          <div class="ai-skeleton-line w-70 ai-shimmer"></div>
          <div class="ai-skeleton-line w-90 ai-shimmer"></div>
        </div>
      </div>

      <div class="ai-skeleton-message sent">
        <div class="ai-skeleton-bubble ai-skeleton-bubble-self">
          <div class="ai-skeleton-line w-60 ai-shimmer"></div>
          <div class="ai-skeleton-line w-40 ai-shimmer"></div>
        </div>
      </div>

      <div class="ai-skeleton-message received">
        <div class="ai-skeleton-bubble-avatar ai-shimmer"></div>
        <div class="ai-skeleton-bubble">
          <div class="ai-skeleton-line w-50 ai-shimmer"></div>
          <div class="ai-skeleton-line w-80 ai-shimmer"></div>
          <div class="ai-skeleton-line w-30 ai-shimmer"></div>
        </div>
      </div>

      <div class="ai-skeleton-message sent">
        <div class="ai-skeleton-bubble ai-skeleton-bubble-self">
          <div class="ai-skeleton-line w-45 ai-shimmer"></div>
        </div>
      </div>

      <div class="ai-skeleton-message received">
        <div class="ai-skeleton-bubble-avatar ai-shimmer"></div>
        <div class="ai-skeleton-bubble">
          <div class="ai-skeleton-line w-65 ai-shimmer"></div>
          <div class="ai-skeleton-line w-85 ai-shimmer"></div>
        </div>
      </div>
    </div>

    <div class="ai-skeleton-input">
      <div class="ai-skeleton-input-bar ai-shimmer"></div>
      <div class="ai-skeleton-send ai-shimmer"></div>
    </div>
  </div>
</template>

<script setup>
const isDark = (() => {
  try {
    const saved = localStorage.getItem('boh-theme');
    if (saved === 'dark') return true;
    if (saved === 'system' && typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
  } catch {}
  return false;
})();
</script>

<style scoped>
.ai-skeleton {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #ffffff;
}

.ai-skeleton-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.ai-skeleton-avatar {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  flex-shrink: 0;
}

.ai-skeleton-header-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.ai-skeleton-title {
  width: 100px;
  height: 16px;
  border-radius: 4px;
}

.ai-skeleton-subtitle {
  width: 160px;
  height: 12px;
  border-radius: 4px;
}

.ai-skeleton-messages {
  flex: 1;
  overflow: hidden;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ai-skeleton-message {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.ai-skeleton-message.sent {
  justify-content: flex-end;
}

.ai-skeleton-bubble-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 4px;
}

.ai-skeleton-bubble {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  background: rgba(245, 245, 247, 0.9);
  border-radius: 20px 20px 20px 6px;
  max-width: 70%;
}

.ai-skeleton-bubble-self {
  background: rgba(37, 99, 235, 0.08);
  border-radius: 20px 20px 6px 20px;
}

.ai-skeleton-line {
  height: 12px;
  border-radius: 4px;
}

.ai-skeleton-line.w-30 { width: 30%; }
.ai-skeleton-line.w-40 { width: 40%; }
.ai-skeleton-line.w-45 { width: 45%; }
.ai-skeleton-line.w-50 { width: 50%; }
.ai-skeleton-line.w-60 { width: 60%; }
.ai-skeleton-line.w-65 { width: 65%; }
.ai-skeleton-line.w-70 { width: 70%; }
.ai-skeleton-line.w-80 { width: 80%; }
.ai-skeleton-line.w-85 { width: 85%; }
.ai-skeleton-line.w-90 { width: 90%; }

.ai-skeleton-input {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

.ai-skeleton-input-bar {
  flex: 1;
  height: 40px;
  border-radius: 20px;
}

.ai-skeleton-send {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ai-shimmer {
  background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: ai-shimmer-anim 1.5s infinite;
}

@keyframes ai-shimmer-anim {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.ai-skeleton.is-dark {
  background: #101216;
}

.ai-skeleton.is-dark .ai-skeleton-bubble {
  background: rgba(40, 42, 50, 0.9);
}

.ai-skeleton.is-dark .ai-skeleton-bubble-self {
  background: rgba(37, 99, 235, 0.15);
}

.ai-skeleton.is-dark .ai-shimmer {
  background: linear-gradient(90deg, #2a2d35 25%, #363941 50%, #2a2d35 75%);
}

.ai-skeleton.is-dark .ai-skeleton-header,
.ai-skeleton.is-dark .ai-skeleton-input {
  border-color: rgba(255, 255, 255, 0.06);
}
</style>
