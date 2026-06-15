import { ref } from 'vue';

export function useThinkingTimer() {
  const thinkingTime = ref(0);
  const thinkingStatus = ref('');
  const thinkingTimer = ref(null);

  const startThinkingTimer = () => {
    thinkingTime.value = 0;
    if (thinkingTimer.value) clearInterval(thinkingTimer.value);
    thinkingTimer.value = setInterval(() => {
      thinkingTime.value = parseFloat((thinkingTime.value + 0.1).toFixed(1));
    }, 100);
  };

  const stopThinkingTimer = () => {
    if (thinkingTimer.value) {
      clearInterval(thinkingTimer.value);
      thinkingTimer.value = null;
    }
  };

  const setThinkingStatus = (text) => {
    thinkingStatus.value = String(text || '').trim();
  };

  const clearThinkingStatus = () => {
    thinkingStatus.value = '';
  };

  return {
    thinkingTime,
    thinkingStatus,
    thinkingTimer,
    startThinkingTimer,
    stopThinkingTimer,
    setThinkingStatus,
    clearThinkingStatus
  };
}