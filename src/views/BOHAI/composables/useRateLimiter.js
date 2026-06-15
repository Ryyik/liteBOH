import { ref } from 'vue';
import {
  BLOCK_DURATION_MS,
  MIN_INTERVAL_MS,
  RATE_LIMIT_WINDOW_MS,
  MAX_MESSAGES_PER_WINDOW
} from './chat-engine-config.js';

export function useRateLimiter() {
  const lastMessageTime = ref(0);
  const messageCount = ref(0);
  const windowStartTime = ref(Date.now());
  const isRateLimited = ref(false);
  const rateLimitMessage = ref('');

  const checkRateLimit = () => {
    const now = Date.now();

    if (isRateLimited.value) {
      if (now - lastMessageTime.value > BLOCK_DURATION_MS) {
        isRateLimited.value = false;
        messageCount.value = 0;
        windowStartTime.value = now;
        rateLimitMessage.value = '';
      } else {
        const remainingSeconds = Math.ceil((lastMessageTime.value + BLOCK_DURATION_MS - now) / 1000);
        rateLimitMessage.value = `发送频率过高，请休息 ${remainingSeconds} 秒后再试。`;
        return { blocked: true, message: rateLimitMessage.value };
      }
    }

    if (now - lastMessageTime.value < MIN_INTERVAL_MS) {
      rateLimitMessage.value = '请勿频繁发送消息，请稍后再试。';
      setTimeout(() => {
        if (!isRateLimited.value) rateLimitMessage.value = '';
      }, 2000);
      return { blocked: true, message: rateLimitMessage.value };
    }

    if (now - windowStartTime.value > RATE_LIMIT_WINDOW_MS) {
      messageCount.value = 1;
      windowStartTime.value = now;
    } else {
      messageCount.value++;
    }

    if (messageCount.value > MAX_MESSAGES_PER_WINDOW) {
      isRateLimited.value = true;
      lastMessageTime.value = now;
      rateLimitMessage.value = '发送频率过高，请休息 1 分钟后再试。';
      return { blocked: true, message: rateLimitMessage.value };
    }

    return { blocked: false, message: '' };
  };

  const recordMessageSent = () => {
    lastMessageTime.value = Date.now();
    rateLimitMessage.value = '';
  };

  return {
    isRateLimited,
    rateLimitMessage,
    checkRateLimit,
    recordMessageSent
  };
}