<template>
  <div class="otp-wrap">
    <!-- 单输入框 + 视觉分格。
         为什么不用 8 个 <input>：8 个独立输入框要自己处理粘贴拆分、Backspace 跨格、
         方向键移动、iOS 上的自动填充（autocomplete="one-time-code" 只对单个 input 生效），
         每一条都能写出一堆边界 bug。这里用**一个真实输入框**承接所有原生行为，
         背后用 DOM 无关的 span 网格做视觉分格 —— 用户看到的 8 格，实际操作的是 1 个框。 -->
    <input
      ref="inputRef"
      class="otp-native"
      type="text"
      inputmode="numeric"
      autocomplete="one-time-code"
      :value="modelValue"
      :maxlength="length"
      :disabled="disabled"
      :aria-label="`${length} 位验证码`"
      @input="onInput"
      @keydown="onKeydown"
      @paste="onPaste"
      @focus="focused = true"
      @blur="focused = false"
    />

    <div
      class="otp-cells"
      aria-hidden="true"
      :style="{ gridTemplateColumns: `repeat(${length}, 1fr)` }"
      @click="focusInput"
    >
      <span
        v-for="(char, i) in cells"
        :key="i"
        class="otp-cell"
        :class="{
          'is-filled': !!char,
          'is-caret': focused && i === caretIndex,
          'is-error': error,
        }"
      >
        {{ char }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  /** 位数 —— 必须与线上 mailer_otp_length 一致（本项目为 8，不是 6） */
  length: { type: Number, default: 8 },
  disabled: { type: Boolean, default: false },
  error: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue', 'complete']);

const inputRef = ref(null);
const focused = ref(false);

/** 只留数字并按 length 截断 —— 用户粘贴带空格/横线的验证码也能识别 */
const sanitize = (raw) =>
  String(raw || '')
    .replace(/\D/g, '')
    .slice(0, props.length);

const cells = computed(() => {
  const v = String(props.modelValue || '');
  return Array.from({ length: props.length }, (_, i) => v[i] || '');
});

/** 光标位置：已填满时停在最后一格，否则停在下一个空格 */
const caretIndex = computed(() => {
  const len = String(props.modelValue || '').length;
  return Math.min(len, props.length - 1);
});

const emitValue = (next) => {
  emit('update:modelValue', next);
  // 自动提交由父组件决定（有的场景要等用户点确认），但「填满」这个事件总是要给出去
  if (next.length === props.length) emit('complete', next);
};

const onInput = (e) => {
  const next = sanitize(e.target.value);
  // 受控回写：用户输入非法字符时 modelValue 不变，但 DOM 里已经有脏值，
  // 必须手动同步，否则会出现「框里是 abc、绑定的还是空」的不一致。
  if (e.target.value !== next) e.target.value = next;
  emitValue(next);
};

const onPaste = (e) => {
  const text = e.clipboardData?.getData('text') || '';
  if (!text) return;
  e.preventDefault();
  emitValue(sanitize(text));
};

const onKeydown = (e) => {
  // 整个框退格 = 删最后一位。原生行为在受控 input 里对「删中间」表现不一致，统一处理。
  if (e.key === 'Backspace' && !String(props.modelValue || '').length) {
    e.preventDefault();
  }
};

const focusInput = () => inputRef.value?.focus();

defineExpose({ focus: focusInput });
</script>

<style scoped>
.otp-wrap {
  position: relative;
  width: 100%;
}

/* 真实输入框盖在视觉分格之上：透明、无边框，但承接全部原生输入行为
   （系统验证码自动填充、语音输入、粘贴、IME）。z-index 高于格子，
   否则点击会落到 aria-hidden 的 div 上、光标进不了输入框。 */
.otp-native {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  border: 0;
  padding: 0;
  margin: 0;
  font-size: 16px; /* ≥16px 防 iOS 聚焦时自动放大页面 */
  cursor: text;
  z-index: 2;
}

.otp-cells {
  /* 列数由 length 决定，用内联 style 绑定而不是 v-bind() ——
     CSS 变量塞进 repeat() 的计数值在部分浏览器里不生效（repeat 需要整数解析），
     表现为 8 格挤成一列。 */
  display: grid;
  gap: 8px;
  cursor: text;
}

.otp-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 54px;
  border-radius: 10px;
  /* 边框用墨色 22% 而不是灰阶 token —— 实测在白卡上 `--boh-gray-200`(#e5e5ea)
     几乎看不见，「8 个空格子」会被读成装饰而不是可输入区域。
     验证码框是这一步唯一的交互目标，它必须一眼看出「这里要填」。 */
  border: 1.5px solid color-mix(in srgb, var(--boh-gate-ink) 22%, transparent);
  background: color-mix(in srgb, var(--boh-gate-ink) 3%, transparent);
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--boh-text-primary);
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    box-shadow 160ms ease;
}

.otp-cell.is-filled {
  border-color: color-mix(in srgb, var(--boh-gate-ink) 42%, transparent);
  background: color-mix(in srgb, var(--boh-gate-ink) 7%, transparent);
}

/* 光标格：只在聚焦时提示「下一位输这里」，不抢视觉重心。
   ⚠️ 曾经用 `--boh-accent`（蓝）—— 该 token 是**动作色**，在纯黑白页面里
   它是整屏唯一的彩色，会把"下一步该填哪"变成"这里被高亮了"，抢走主按钮的层级。
   现在改成满墨描边：黑白语言里对比最强的就是墨色本身。 */
.otp-cell.is-caret {
  border-color: var(--boh-gate-ink);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--boh-gate-ink) 10%, transparent);
}

/* 错误态同理：不用 `--boh-danger`（红）。满墨描边 + 加粗已经足够刺眼，
   而且不依赖颜色意味着色弱用户也能读出来。 */
.otp-cell.is-error {
  border-color: var(--boh-gate-ink);
  border-width: 2px;
  background: color-mix(in srgb, var(--boh-gate-ink) 8%, transparent);
}

/* 暗色不再单独覆盖整块：
   `--boh-gate-ink` 在暗色下就是近白色、`--boh-accent` 也反相了，
   上面所有 color-mix 跟着自动反相 —— 亮/暗只有一套声明，少一处漂移。
   仅「文字色」需要显式跟主题（token 已按主题定义），无需重复写。 */

@media (max-width: 380px) {
  .otp-cells {
    gap: 5px;
  }
  .otp-cell {
    height: 46px;
    font-size: 19px;
  }
}
</style>
