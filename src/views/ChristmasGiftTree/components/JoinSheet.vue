<script setup>
/**
 * 参与说明卡 / 退出确认卡。
 *
 * 两种态共用一个组件：它们的骨架完全一样（标题 + 说明 + 主次按钮），
 * 拆成两个组件只会多一份遮罩与焦点管理的代码。
 */
import { nextTick, onUnmounted, ref, watch } from 'vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  /** intro = 参与说明；leave = 退出确认 */
  mode: { type: String, default: 'intro' },
  submitting: { type: Boolean, default: false },
  error: { type: String, default: '' },
  revealLabel: { type: String, default: '' },
  peopleCount: { type: Number, default: 0 },
  capacity: { type: Number, default: 20 },
});

const emit = defineEmits(['close', 'confirm']);

const primaryRef = ref(null);

const isLeave = () => props.mode === 'leave';

function onKeydown(event) {
  if (event.key === 'Escape' && !props.submitting) emit('close');
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      window.addEventListener('keydown', onKeydown);
      await nextTick();
      // 打开即落焦到主按钮：键盘用户不用先 Tab 一圈才找得到
      primaryRef.value?.focus?.();
      return;
    }
    window.removeEventListener('keydown', onKeydown);
  },
  { immediate: true },
);

onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Transition name="xmas-sheet">
    <div v-if="open" class="sheet-mask" @click.self="!submitting && emit('close')">
      <section
        class="sheet-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="xmas-sheet-title"
        :aria-describedby="'xmas-sheet-desc'"
      >
        <button
          type="button"
          class="sheet-close"
          aria-label="关闭"
          :disabled="submitting"
          @click="emit('close')"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </button>

        <div class="sheet-badge" aria-hidden="true">
          <svg v-if="!isLeave()" width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 11h16v9H4z"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linejoin="round"
            />
            <path
              d="M3 7h18v4H3z"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linejoin="round"
            />
            <path d="M12 7v13" stroke="currentColor" stroke-width="1.7" />
            <path
              d="M12 7C10.2 7 7.4 6.6 7.4 4.6 7.4 3.2 8.6 2.6 9.6 3.2 10.9 4 12 7 12 7zM12 7c1.8 0 4.6-.4 4.6-2.4 0-1.4-1.2-2-2.2-1.4C13.1 4 12 7 12 7z"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linejoin="round"
            />
          </svg>
          <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3l9 16H3L12 3z"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linejoin="round"
            />
            <path d="M12 9v5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
            <circle cx="12" cy="17" r="1" fill="currentColor" />
          </svg>
        </div>

        <h2 id="xmas-sheet-title" class="sheet-title">
          {{ isLeave() ? '退出交换？' : '参与交换' }}
        </h2>

        <p id="xmas-sheet-desc" class="sheet-desc">
          {{
            isLeave()
              ? '退出后头像将从树上移除；揭晓前可重新参与。'
              : '参与后，头像将挂在圣诞树上。揭晓时查看配对对象。'
          }}
        </p>

        <ul v-if="!isLeave()" class="sheet-rules">
          <li>
            <span class="rule-dot" aria-hidden="true">1</span>
            <span
              ><strong>{{ revealLabel }}</strong> 揭晓随机配对结果。</span
            >
          </li>
          <li>
            <span class="rule-dot" aria-hidden="true">2</span>
            <span>请自行准备礼物。</span>
          </li>
        </ul>

        <div v-if="!isLeave()" class="sheet-meta">
          <span>{{ peopleCount }} / {{ capacity }} 人参与</span>
          <span class="sheet-meta-dot" aria-hidden="true"></span>
          <span>揭晓前可退出</span>
        </div>

        <p v-if="error" class="sheet-error" role="alert">{{ error }}</p>

        <div class="sheet-actions">
          <button
            ref="primaryRef"
            type="button"
            class="sheet-btn sheet-btn--primary"
            :class="{ 'is-danger': isLeave() }"
            :disabled="submitting"
            @click="emit('confirm')"
          >
            <span v-if="submitting" class="sheet-spinner" aria-hidden="true"></span>
            {{ submitting ? '处理中…' : isLeave() ? '确认退出' : '确认参与' }}
          </button>
          <button
            type="button"
            class="sheet-btn sheet-btn--ghost"
            :disabled="submitting"
            @click="emit('close')"
          >
            {{ isLeave() ? '继续参与' : '取消' }}
          </button>
        </div>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
@import './join-sheet.css';
</style>
