<script setup>
import { computed } from 'vue';
import { useBodyScrollLock } from '@/composables/useBodyScrollLock.js';
import { createDialogFocusTrapDirective } from '@/views/DataManagement/composables/useDialogFocusTrap.js';
import './motion.css';

/**
 * BohModal — 全站唯一弹窗壳（plans/045 组件 3/4）
 *
 * 内置（页面零样板）：
 *   · Teleport 到 body + 遮罩（玻璃 scrim，材质读 --liquid-*）；
 *   · 滚动锁：useBodyScrollLock 引用计数，叠层/卸载安全；
 *   · 键盘可达性：createDialogFocusTrapDirective（开时移焦入弹层、Tab 圈住、
 *     Esc 关闭且 stopPropagation、关闭归还焦点）；
 *   · v-model 开关 + 出入场动画（motion.css 的 boh-fade / boh-pop）；
 *   · 窄屏（≤560px）自动变底部 Sheet：对齐到底、grab 条出现——同一组件两种形态。
 *
 * ⚠️ v-dialog-focus 指令必须挂在 overlay 上（keydown 从后代冒泡到它才接得住），
 *    且指令生命周期跟 v-if 走 —— 所以 overlay 的显隐用 v-if 而不是 css 隐藏。
 *
 * @example
 * <BohModal v-model="showEdit" title="编辑资料">
 *   …表单内容…
 *   <template #footer>
 *     <BohButton variant="ghost" @click="showEdit = false">取消</BohButton>
 *     <BohButton variant="primary" :loading="saving" @click="save">保存</BohButton>
 *   </template>
 * </BohModal>
 */
const props = defineProps({
  /** v-model：是否打开 */
  modelValue: { type: Boolean, default: false },
  /** 标题（同时作为 aria-label） */
  title: { type: String, default: '' },
  /** 点遮罩是否关闭（危险流程建议 false，强制走按钮） */
  closeOnBackdrop: { type: Boolean, default: true },
  /** 是否渲染右上角关闭按钮 */
  showClose: { type: Boolean, default: true },
});

const emit = defineEmits(['update:modelValue', 'close']);

/** 指令实例：变量名 vDialogFocus 会自动注册成 v-dialog-focus */
const vDialogFocus = createDialogFocusTrapDirective();

const isOpen = computed(() => props.modelValue);

useBodyScrollLock(isOpen, 'boh-modal');

function requestClose() {
  emit('update:modelValue', false);
  emit('close');
}

function onBackdropClick(event) {
  if (!props.closeOnBackdrop) return;
  if (event.target === event.currentTarget) requestClose();
}
</script>

<template>
  <Teleport to="body">
    <Transition name="boh-fade">
      <div
        v-if="isOpen"
        v-dialog-focus="requestClose"
        class="boh-modal__overlay"
        @click="onBackdropClick"
      >
        <Transition name="boh-pop" appear>
          <div
            class="boh-modal__dialog"
            role="dialog"
            aria-modal="true"
            :aria-label="title || '对话框'"
          >
            <div class="boh-modal__grab" aria-hidden="true"></div>
            <header v-if="title || showClose" class="boh-modal__head">
              <h4 class="boh-modal__title">{{ title }}</h4>
              <button
                v-if="showClose"
                type="button"
                class="boh-modal__close"
                aria-label="关闭"
                @click="requestClose"
              >
                ×
              </button>
            </header>
            <div class="boh-modal__body">
              <slot />
            </div>
            <footer v-if="$slots.footer" class="boh-modal__foot">
              <slot name="footer" />
            </footer>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.boh-modal__overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.32);
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
}

.boh-modal__dialog {
  width: min(420px, calc(100vw - 48px));
  max-height: min(78vh, 720px);
  display: flex;
  flex-direction: column;
  background: var(--liquid-bg-strong);
  border: 1px solid var(--liquid-border-strong);
  backdrop-filter: var(--liquid-filter-lg);
  -webkit-backdrop-filter: var(--liquid-filter-lg);
  box-shadow: var(--liquid-highlight), var(--liquid-shadow-overlay);
  border-radius: var(--liquid-radius-lg);
  overflow: hidden;
}

/* grab 条只在窄屏 Sheet 形态显示 */
.boh-modal__grab {
  display: none;
}

.boh-modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 22px 24px 0;
}

.boh-modal__title {
  margin: 0;
  font-size: 16px;
  font-weight: 750;
  color: var(--liquid-text-primary);
}

.boh-modal__close {
  appearance: none;
  border: none;
  cursor: pointer;
  font: inherit;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  line-height: 1;
  color: var(--liquid-text-secondary);
  background: var(--liquid-bg-nested);
  transition: background-color var(--duration-fast) var(--ease-out);
}
.boh-modal__close:hover {
  background: var(--liquid-bg);
}

.boh-modal__body {
  padding: 12px 24px 6px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.7;
  color: var(--liquid-text-secondary);
}

.boh-modal__foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 24px 22px;
}

/* 窄屏：自动变底部 Sheet（同一组件两种形态） */
@media (max-width: 560px) {
  .boh-modal__overlay {
    align-items: flex-end;
  }
  .boh-modal__dialog {
    width: 100%;
    border-radius: var(--liquid-radius-lg) var(--liquid-radius-lg) 0 0;
    max-height: 86vh;
  }
  .boh-modal__grab {
    display: block;
    width: 40px;
    height: 5px;
    flex: 0 0 auto;
    margin: 10px auto 0;
    border-radius: 3px;
    background: var(--liquid-border-strong);
  }
  .boh-modal__head {
    padding-top: 10px;
  }
}
</style>
