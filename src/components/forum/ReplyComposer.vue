<script setup>
/**
 * ReplyComposer — 回复/评论输入框唯一真源（plans/051 §2.1-2）。
 *
 * 收敛前有 4 份实现：PostCard reply-input-section-v2、CommentThread 内嵌回复框、
 * 详情页 pd-reply-input（弹窗 + 路由页各一份）。收敛后只此一份，iMessage 形态：
 * 无框输入 + 右侧发送箭头（有字点亮蓝色）。
 *
 * 契约红线（批 1 守卫测试锁）：
 *   ① useAutoGrowTextarea 的 value 必须传 **getter**（`() => props.modelValue`）——
 *      父级会主动改写内容（切换回复对象 / 发送成功清空），只绑 @input 的实现不收缩；
 *      且不能包成 `() => unref(value)`（unref 不调函数，watcher 永不触发）。
 *   ② 三态齐全：发送中（箭头转圈）/ 冷却（禁用+秒数）/ 未登录（点箭头 emit need-login，
 *      由宿主弹登录浮层，本组件不内嵌登录逻辑）。
 *   ③ Enter 发送（Shift+Enter 换行）。
 *   ④ 取消 = 清空内容（emit update:modelValue ''），不提供独立取消按钮。
 */
import { computed, onMounted } from 'vue';
import { ArrowUp } from 'lucide-vue-next';
import { useAutoGrowTextarea } from '@/composables/useAutoGrowTextarea.js';

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '写下你的回复…' },
  /** 正在回复某人时显示的 @目标（清空即无 chip） */
  targetUsername: { type: String, default: '' },
  sending: { type: Boolean, default: false },
  cooldown: { type: Number, default: 0 },
  submitLabel: { type: String, default: '发送' },
  /** 未登录时箭头不发送，改发 need-login */
  loggedIn: { type: Boolean, default: true },
  /** 挂载后自动聚焦（点「评论」展开评论区并聚焦输入框的场景） */
  autoFocus: { type: Boolean, default: false },
  /** 挂载后自动聚焦的延迟 ms（等展开动画走完再聚焦，避免键盘顶飞动画） */
  autoFocusDelay: { type: Number, default: 260 },
});

const emit = defineEmits([
  'update:modelValue',
  'send',
  'need-login',
  'clear-target',
  'focus',
  'blur',
]);

// 契约①：getter 形式。别改成 `() => unref(props.modelValue)`。
const { textareaRef: autoGrowRef } = useAutoGrowTextarea({
  value: () => props.modelValue,
});

const hasContent = computed(() => String(props.modelValue || '').trim().length > 0);
const isCoolingDown = computed(() => props.cooldown > 0);

const focus = () => {
  autoGrowRef.value?.focus();
};

defineExpose({ focus });

const doSend = () => {
  if (props.sending || isCoolingDown.value) return;
  if (!props.loggedIn) {
    emit('need-login');
    return;
  }
  if (!hasContent.value) return;
  emit('send');
};

const onKeydown = (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    doSend();
  }
};

onMounted(() => {
  if (!props.autoFocus) return;
  window.setTimeout(() => focus(), Math.max(0, props.autoFocusDelay));
});
</script>

<template>
  <div class="reply-composer" @click.stop>
    <div v-if="targetUsername" class="composer-chip">
      <span class="composer-chip-text"
        >回复 <b>@{{ targetUsername }}</b></span
      >
      <button
        type="button"
        class="composer-chip-clear"
        aria-label="取消回复该用户"
        @click="emit('clear-target')"
      >
        ×
      </button>
    </div>
    <div class="composer-field">
      <textarea
        ref="autoGrowRef"
        class="composer-textarea"
        :value="modelValue"
        rows="1"
        :placeholder="placeholder"
        enterkeyhint="send"
        autocapitalize="off"
        autocorrect="off"
        :disabled="sending"
        @input="emit('update:modelValue', $event.target.value)"
        @keydown="onKeydown"
        @focus="emit('focus')"
        @blur="emit('blur')"
      ></textarea>
      <button
        type="button"
        class="composer-send"
        :class="{ 'is-active': hasContent, 'is-sending': sending }"
        :disabled="sending || (!hasContent && loggedIn)"
        :aria-label="
          sending ? '发送中' : isCoolingDown ? `冷却中，${cooldown} 秒后可再发` : submitLabel
        "
        :title="isCoolingDown ? `${cooldown} 秒后可再发` : submitLabel"
        @click="doSend"
      >
        <span v-if="isCoolingDown" class="composer-cooldown-num">{{ cooldown }}</span>
        <span v-else-if="sending" class="composer-spinner" aria-hidden="true"></span>
        <ArrowUp v-else :size="17" :stroke-width="2.4" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.reply-composer {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.composer-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  font-size: 12px;
  color: var(--appl-text-3);
  background: var(--appl-subtle);
  border-radius: 9px;
  padding: 3px 8px;
}

.composer-chip-text b {
  font-weight: 600;
  color: var(--appl-text-1);
}

.composer-chip-clear {
  border: none;
  background: none;
  color: var(--appl-text-4);
  font-size: 13px;
  line-height: 1;
  padding: 0 2px;
  cursor: pointer;
}

.composer-field {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: var(--appl-subtle);
  border-radius: 18px;
  padding: 7px 6px 7px 14px;
}

.composer-textarea {
  flex: 1;
  border: none;
  background: transparent;
  resize: none;
  outline: none;
  font: inherit;
  font-size: 15px;
  line-height: 1.45;
  color: var(--appl-text-1);
  /* 空态 40px：单行也有舒适的触达高度（iMessage 口径），探针 A 检查 ≥30px */
  min-height: 40px;
  max-height: 132px;
}

.composer-textarea::placeholder {
  color: var(--appl-text-4);
}

.composer-send {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--appl-text-4);
  background: transparent;
  transition:
    color 0.18s var(--ease-standard, ease),
    background-color 0.18s var(--ease-standard, ease);
}

.composer-send.is-active {
  color: #ffffff;
  background: var(--appl-blue);
}

.composer-send:disabled:not(.is-active) {
  cursor: default;
}

.composer-send.is-sending {
  color: var(--appl-blue);
  cursor: wait;
}

.composer-cooldown-num {
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.composer-spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--appl-blue);
  border-top-color: transparent;
  animation: composerSpin 0.8s linear infinite;
}

@keyframes composerSpin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .composer-spinner {
    animation-duration: 1.6s;
  }
}
</style>
