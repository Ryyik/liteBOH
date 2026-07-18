<template>
  <div class="ai-chat-loading-skeleton" aria-hidden="true">
    <div class="ai-chat-loading-header shimmer"></div>
    <div class="ai-chat-loading-message shimmer"></div>
    <div class="ai-chat-loading-message is-self shimmer"></div>
    <div class="ai-chat-loading-message is-short shimmer"></div>
    <div class="ai-chat-loading-input shimmer"></div>
  </div>
</template>

<style scoped>
.ai-chat-loading-skeleton {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 100%;
  height: 100%;
  padding: 20px;
  background: var(--surface-color, #fff);
}

.ai-chat-loading-header {
  width: 150px;
  height: 22px;
  border-radius: 8px;
}

.ai-chat-loading-message {
  width: min(72%, 520px);
  height: 72px;
  border-radius: 18px;
}

.ai-chat-loading-message.is-self {
  width: min(54%, 380px);
  margin-left: auto;
}

.ai-chat-loading-message.is-short {
  width: min(46%, 320px);
}

.ai-chat-loading-input {
  height: 48px;
  margin-top: auto;
  border-radius: 14px;
}

.shimmer {
  background: linear-gradient(90deg, #eceff3 25%, #f7f8fa 50%, #eceff3 75%);
  background-size: 200% 100%;
  animation: ai-chat-loading-shimmer 1.4s infinite;
}

@keyframes ai-chat-loading-shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

@media (prefers-color-scheme: dark) {
  .ai-chat-loading-skeleton {
    --surface-color: #101216;
  }

  .shimmer {
    background: linear-gradient(90deg, #292c33 25%, #363a43 50%, #292c33 75%);
    background-size: 200% 100%;
  }
}
</style>
