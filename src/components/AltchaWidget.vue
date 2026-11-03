<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import 'altcha';
import {
  ALTCHA_DEFAULT_FIELD_NAME,
  ALTCHA_DEFAULT_WORKERS,
  readAltchaPayloadFromStateChange,
} from '@/utils/altcha.js';

const props = defineProps({
  auto: {
    type: String,
    default: 'onload',
  },
  challenge: {
    type: String,
    default: '',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  modelValue: {
    type: String,
    default: '',
  },
  name: {
    type: String,
    default: ALTCHA_DEFAULT_FIELD_NAME,
  },
  workers: {
    type: Number,
    default: ALTCHA_DEFAULT_WORKERS,
  },
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

const handleVerified = (event) => {
  // 正常路径下 statechange 已经先一步同步过 payload（库是 setState 之后才派发 verified），
  // 这里只做兜底：detail 连 payload 字段都没有时才去读表单。
  // 刻意不在 detail.payload 为空串时回读 FormData —— 那多半是上一个已作废的证明，
  // 拿它去提交会直接撞服务端的单次消费（ALTCHA_REPLAYED）。
  const detailPayload = event?.detail?.payload;
  if (typeof detailPayload === 'string' && detailPayload) {
    updatePayload(detailPayload);
  } else if (detailPayload === undefined) {
    const fallback = readPayload();
    if (fallback) updatePayload(fallback);
  }
  emit('verified');
};

const handleExpired = () => {
  updatePayload('');
  emit('expired');
};

const handleStateChange = (event) => {
  const nextState = String(event?.detail?.state || '').trim();
  // payload 必须从 detail 里取 —— 不能读 FormData，也不能指望 verified 事件。
  // 完整原因（库把事件名拼成 'vefified' + FormData 时序洞）见 utils/altcha.js。
  updatePayload(readAltchaPayloadFromStateChange(event));
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
  },
);

// ⚠️ 这里**刻意不**在 disabled 时 reset（曾经是 `if (disabled) await reset()`，已删）：
// altcha 3.0.3 的 props 里没有 disabled，传下去不生效；那个 watch 是拿 reset 冒充"禁用"，
// 结果 isSubmitting 一变 true 就把刚解出来的 payload 清空 ——
// 登录函数里 `isSubmitting = true` 之后还有 `await warmLoginDeviceIdHash()`，
// 等它回来再读 `altchaPayload` 时已经是空串（用户报障「点登录仍提示请先完成人机验证」的第二重原因）。
// 真正的禁用改由模板上的 class → pointer-events 表达，payload 保持不动。

onMounted(() => {
  bindWidgetEvents();
});

onUnmounted(() => {
  unbindWidgetEvents();
});

defineExpose({
  readPayload,
  reset,
  verify,
});
</script>

<template>
  <!-- disabled 用 class 表达（pointer-events），不再靠改 auto / 调 reset 冒充禁用：见上方注释 -->
  <altcha-widget
    ref="widgetRef"
    class="altcha-widget"
    :class="{ 'is-disabled': disabled }"
    :auto="auto"
    :challenge="challenge"
    :name="name"
    :workers="String(workers)"
  />
</template>

<style scoped>
.altcha-widget.is-disabled {
  pointer-events: none;
  opacity: 0.6;
}
</style>
