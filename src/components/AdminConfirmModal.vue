<template>
  <Teleport to="body">
    <Transition name="confirm-fade">
      <div
        v-if="visible"
        class="confirm-modal-overlay"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        @click.self="handleCancel"
        @keydown.esc="handleCancel"
      >
        <div class="confirm-modal" :class="`tone-${tone}`" @keydown.esc="handleCancel">
          <h3 :id="titleId" class="confirm-title">{{ title }}</h3>
          <p v-if="message" class="confirm-message">{{ message }}</p>
          <input
            v-if="kind === 'prompt'"
            ref="inputRef"
            v-model="inputValue"
            type="text"
            class="confirm-input"
            :placeholder="placeholder"
            @keydown.enter="handleConfirm"
          />
          <div class="confirm-actions">
            <button
              v-if="tertiaryText"
              type="button"
              class="confirm-btn tertiary"
              @click="handleTertiary"
            >
              {{ tertiaryText }}
            </button>
            <div class="confirm-actions-right">
              <button
                v-if="kind !== 'alert'"
                type="button"
                class="confirm-btn cancel"
                @click="handleCancel"
              >
                {{ cancelText || '取消' }}
              </button>
              <button
                type="button"
                class="confirm-btn primary"
                :class="`tone-${tone}`"
                :disabled="kind === 'prompt' && !inputValue.trim()"
                @click="handleConfirm"
              >
                {{ confirmText || '确定' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';

const props = defineProps({
  visible: Boolean,
  title: { type: String, default: '请确认' },
  message: { type: String, default: '' },
  // 'confirm' 显示双按钮; 'prompt' 显示输入框; 'alert' 仅确定按钮
  kind: { type: String, default: 'confirm' },
  tone: { type: String, default: 'default' }, // default | danger | warning
  confirmText: { type: String, default: '' },
  cancelText: { type: String, default: '' },
  tertiaryText: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  defaultValue: { type: String, default: '' }
});

const emit = defineEmits(['confirm', 'cancel', 'tertiary']);

const titleId = `confirm-modal-${Math.random().toString(36).slice(2, 9)}`;
const inputValue = ref('');
const inputRef = ref(null);

watch(() => props.visible, (v) => {
  if (v) {
    inputValue.value = props.defaultValue || '';
    nextTick(() => inputRef.value?.focus?.());
  }
});

const handleConfirm = () => {
  if (props.kind === 'prompt' && !inputValue.value.trim()) return;
  emit('confirm', props.kind === 'prompt' ? inputValue.value.trim() : true);
};

const handleCancel = () => {
  emit('cancel');
};

const handleTertiary = () => {
  emit('tertiary');
};
</script>

<style scoped>
.confirm-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 12000;
  padding: 16px;
}
.confirm-modal {
  background: #fff;
  border-radius: 12px;
  max-width: 440px;
  width: 100%;
  padding: 20px 22px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.confirm-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}
.confirm-message {
  margin: 0;
  color: #4b5563;
  font-size: 14px;
  line-height: 1.55;
  white-space: pre-line;
}
.confirm-input {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  outline: none;
}
.confirm-input:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 235, 0.2);
}
.confirm-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  flex-wrap: wrap;
}
.confirm-actions-right {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
.confirm-btn {
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 14px;
  border: none;
  cursor: pointer;
  font-weight: 500;
}
.confirm-btn.cancel {
  background: #f3f4f6;
  color: #374151;
}
.confirm-btn.tertiary {
  background: #fff;
  color: #b91c1c;
  border: 1px solid #fecaca;
}
.confirm-btn.tertiary:hover {
  background: #fef2f2;
}
.confirm-btn.primary.tone-default {
  background: #6366f1;
  color: #fff;
}
.confirm-btn.primary.tone-danger {
  background: #dc2626;
  color: #fff;
}
.confirm-btn.primary.tone-warning {
  background: #d97706;
  color: #fff;
}
.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.confirm-fade-enter-active, .confirm-fade-leave-active {
  transition: opacity 0.18s;
}
.confirm-fade-enter-from, .confirm-fade-leave-to {
  opacity: 0;
}
</style>
