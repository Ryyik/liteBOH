<template>
  <button class="user-center-back-btn" type="button" :aria-label="label" @click="$emit('click', $event)">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  </button>
</template>

<script setup>
defineProps({
  label: {
    type: String,
    default: '返回'
  }
});

defineEmits(['click']);
</script>

<style scoped>
.user-center-back-btn {
  width: var(--user-center-back-size, 48px);
  height: var(--user-center-back-size, 48px);
  padding: 0;
  border: 1px solid var(--user-center-back-border, rgba(255, 255, 255, 0.72));
  border-radius: 50%;
  background:
    radial-gradient(circle at 30% 22%, rgba(218, 255, 228, 0.82), transparent 34%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.88), rgba(255, 255, 255, 0.58));
  color: var(--user-center-back-color, #0f1419);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  box-shadow:
    0 18px 36px rgba(15, 23, 42, 0.1),
    0 8px 18px rgba(132, 204, 154, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(18px) saturate(160%);
  -webkit-backdrop-filter: blur(18px) saturate(160%);
  transition: box-shadow 0.2s ease, transform 0.2s ease, background 0.2s ease;
}

.user-center-back-btn:hover {
  transform: translateX(-1px) translateY(-1px);
  box-shadow:
    0 22px 42px rgba(15, 23, 42, 0.13),
    0 10px 22px rgba(132, 204, 154, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.95);
}

.user-center-back-btn:focus-visible {
  outline: 2px solid var(--user-center-back-focus-ring, rgba(0, 122, 255, 0.55));
  outline-offset: 2px;
}

.user-center-back-btn svg {
  width: 24px;
  height: 24px;
  filter: drop-shadow(0 1px 1px rgba(255, 255, 255, 0.45));
}

:global([data-theme="dark"]) .user-center-back-btn {
  --user-center-back-color: #ffffff;
  --user-center-back-border: rgba(255, 255, 255, 0.14);
  --user-center-back-focus-ring: rgba(103, 162, 255, 0.7);
  background:
    radial-gradient(circle at 30% 22%, rgba(76, 125, 92, 0.45), transparent 34%),
    linear-gradient(145deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.68));
}
</style>
