<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import 'altcha';
import { ALTCHA_DEFAULT_FIELD_NAME, ALTCHA_DEFAULT_WORKERS } from '@/utils/altcha.js';

const props = defineProps({
  auto: {
    type: String,
    default: 'onload'
  },
  challenge: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  },
  modelValue: {
    type: String,
    default: ''
  },
  name: {
    type: String,
    default: ALTCHA_DEFAULT_FIELD_NAME
  },
  workers: {
    type: Number,
    default: ALTCHA_DEFAULT_WORKERS
  }
});

const emit = defineEmits(['expired', 'statechange', 'update:modelValue', 'verified']);

const widgetRef = ref(null);

const readPayload = () => {
  const widget = widgetRef.value;
  const form = widget?.closest?.('form');
  if (!form) return '';
  const payload = new FormData(form).get(props.name);
  return typeof payload === 'string' ? payload : '';
};

const updatePayload = (nextValue = '') => {
  emit('update:modelValue', String(nextValue || ''));
};

const syncPayloadFromForm = () => {
  updatePayload(readPayload());
};

const handleVerified = () => {
  syncPayloadFromForm();
  emit('verified');
};

const handleExpired = () => {
  updatePayload('');
  emit('expired');
};

const handleStateChange = (event) => {
  const nextState = String(event?.detail?.state || '').trim();
  if (nextState !== 'verified') {
    updatePayload('');
  }
  emit('statechange', nextState);
};

const reset = async () => {
  updatePayload('');
  await nextTick();
  widgetRef.value?.reset?.();
};

const verify = () => {
  widgetRef.value?.verify?.();
};

const bindWidgetEvents = () => {
  const widget = widgetRef.value;
  if (!widget) return;
  widget.addEventListener('verified', handleVerified);
  widget.addEventListener('expired', handleExpired);
  widget.addEventListener('statechange', handleStateChange);
};

const unbindWidgetEvents = () => {
  const widget = widgetRef.value;
  if (!widget) return;
  widget.removeEventListener('verified', handleVerified);
  widget.removeEventListener('expired', handleExpired);
  widget.removeEventListener('statechange', handleStateChange);
};

watch(
  () => props.challenge,
  async () => {
    await reset();
  }
);

watch(
  () => props.disabled,
  async (disabled) => {
    if (disabled) {
      await reset();
    }
  }
);

onMounted(() => {
  bindWidgetEvents();
});

onUnmounted(() => {
  unbindWidgetEvents();
});

defineExpose({
  readPayload,
  reset,
  verify
});
</script>

<template>
  <altcha-widget
    ref="widgetRef"
    :auto="auto"
    :challenge="challenge"
    :name="name"
    :workers="String(workers)"
  />
</template>
