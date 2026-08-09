<template>
  <button
    type="button"
    class="setting-toggle"
    :class="{ enabled: modelValue }"
    role="switch"
    :aria-checked="modelValue ? 'true' : 'false'"
    :aria-label="label"
    :disabled="disabled"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span class="setting-toggle-knob"></span>
  </button>
</template>

<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  label: { type: String, default: '开关' }
});

const emit = defineEmits(['update:modelValue']);
</script>

<style scoped>
.setting-toggle {
  position: relative;
  width: 48px;
  height: 28px;
  border-radius: 999px;
  border: none;
  padding: 0;
  background: #cbd5e1;
  cursor: pointer;
  flex: 0 0 auto;
  display: inline-block;
  transition: background-color 0.2s ease;
  -webkit-tap-highlight-color: transparent;
}

.setting-toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.18);
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.setting-toggle.on {
  background: #34c759;
}

.setting-toggle.on .setting-toggle-knob {
  transform: translateX(20px);
}

.setting-toggle:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

:global([data-theme="dark"]) .setting-toggle:not(.on) {
  background: rgba(255, 255, 255, 0.22);
}

:global([data-theme="dark"]) .setting-toggle.on {
  background: #30d158;
}

:global([data-theme="dark"]) .setting-toggle-knob {
  background: #ffffff;
}
</style>