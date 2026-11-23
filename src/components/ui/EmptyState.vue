<script setup>
import { computed } from 'vue';

/**
 * EmptyState — 空态三件套（插画 / 文案 / 动作）
 *
 * 设计系统组件：明暗双主题跟随 html[data-theme]，
 * 色板全走 tokens.css 的 --liquid-* / 中性灰，不写散装背景。
 *
 * 类名必须叫 boh-empty-state*：全站早有一批手写 .empty-state，且
 * dark-mode.css / user-space-dark.css / user-center-dark.css 都给
 * .empty-state 配过暗色卡底；叫同名会被那批规则画上一块意外的深色底。
 * 也不要用 boh-empty ——那是 Bolek 的 BohEmptyState 私有类。
 *
 * @example
 * <EmptyState title="暂无收货地址" description="添加地址后下单就能一键填好收货信息"
 *            action-text="添加新地址" @action="startAddAddress" />
 * <EmptyState variant="search" title="没有找到匹配的结果" />
 */
const props = defineProps({
  /** lucide 图标组件；传了就用图标，不传走内置插画 */
  icon: { type: [Object, Function], default: null },
  /** 内置插画变体：inbox（空盒）| search（放大镜）| spark（静待发生） */
  variant: { type: String, default: 'inbox' },
  /** 主文案（一句话说清"这里为什么是空的"） */
  title: { type: String, required: true },
  /** 辅助文案（可省；写给"怎么才能不空"） */
  description: { type: String, default: '' },
  /** 动作按钮文案；不传则不渲染按钮 */
  actionText: { type: String, default: '' },
  /** 紧凑模式（嵌在卡片/面板内时用） */
  compact: { type: Boolean, default: false },
});

defineEmits(['action']);

const artVariant = computed(() => (props.icon ? 'icon' : props.variant));
</script>

<template>
  <div class="boh-empty-state" :class="{ 'boh-empty-state--compact': compact }">
    <div class="boh-empty-state__art" aria-hidden="true">
      <component :is="icon" v-if="icon" :size="40" :stroke-width="1.5" />
      <!-- inbox：空盒 -->
      <svg
        v-else-if="artVariant === 'inbox'"
        viewBox="0 0 64 64"
        width="72"
        height="72"
        fill="none"
      >
        <path
          d="M12 38v10a4 4 0 0 0 4 4h32a4 4 0 0 0 4-4V38"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
        />
        <path
          d="M12 38l6-18a4 4 0 0 1 3.8-2.8h20.4A4 4 0 0 1 46 20l6 18"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
        />
        <path
          d="M12 38h12a2 2 0 0 1 2 2 2 2 0 0 0 2 2h8a2 2 0 0 0 2-2 2 2 0 0 1 2-2h12"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
        />
        <circle cx="50" cy="14" r="3" fill="currentColor" opacity="0.45" />
        <circle cx="14" cy="18" r="2" fill="currentColor" opacity="0.3" />
      </svg>
      <!-- search：放大镜 -->
      <svg
        v-else-if="artVariant === 'search'"
        viewBox="0 0 64 64"
        width="72"
        height="72"
        fill="none"
      >
        <circle cx="28" cy="28" r="14" stroke="currentColor" stroke-width="2.4" />
        <path d="M38 38l12 12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
        <path
          d="M22 28a6 6 0 0 1 6-6"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          opacity="0.5"
        />
        <circle cx="52" cy="16" r="2.4" fill="currentColor" opacity="0.35" />
      </svg>
      <!-- spark：静待发生 -->
      <svg v-else viewBox="0 0 64 64" width="72" height="72" fill="none">
        <path
          d="M32 12l4.2 11.4L48 27.6l-11.8 4.2L32 43.2l-4.2-11.4L16 27.6l11.8-4.2L32 12z"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linejoin="round"
        />
        <path
          d="M49 42l1.8 4.8L55.6 48.6l-4.8 1.8L49 55.2l-1.8-4.8L42.4 48.6l4.8-1.8L49 42z"
          fill="currentColor"
          opacity="0.4"
        />
      </svg>
    </div>

    <h3 class="boh-empty-state__title">{{ title }}</h3>
    <p v-if="description" class="boh-empty-state__desc">{{ description }}</p>

    <button
      v-if="actionText"
      type="button"
      class="boh-empty-state__action"
      @click="$emit('action')"
    >
      {{ actionText }}
    </button>

    <slot />
  </div>
</template>

<style scoped>
.boh-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 56px 28px;
  text-align: center;
}

.boh-empty-state--compact {
  padding: 32px 20px;
}

.boh-empty-state__art {
  display: grid;
  place-items: center;
  width: 96px;
  height: 96px;
  margin-bottom: 14px;
  border-radius: 32px;
  color: #98989d;
  background: rgba(120, 120, 128, 0.08);
}

.boh-empty-state--compact .boh-empty-state__art {
  width: 72px;
  height: 72px;
  border-radius: 24px;
}

.boh-empty-state__title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #3a3a3c;
}

.boh-empty-state__desc {
  margin: 0;
  max-width: 320px;
  font-size: 13.5px;
  line-height: 1.6;
  color: #8e8e93;
}

.boh-empty-state__action {
  margin-top: 16px;
  height: 38px;
  padding: 0 22px;
  border: none;
  border-radius: 999px;
  font: inherit;
  font-size: 14px;
  font-weight: 650;
  color: #ffffff;
  background: #0071e3;
  cursor: pointer;
  transition:
    background-color 0.16s ease,
    transform 0.16s ease;
}

.boh-empty-state__action:hover {
  background: #0077ed;
  transform: translateY(-1px);
}
.boh-empty-state__action:active {
  transform: scale(0.97);
}

/* ---- 暗色 ---- */
html[data-theme='dark'] .boh-empty-state__art {
  color: #8d8d93;
  background: rgba(120, 120, 128, 0.14);
}

html[data-theme='dark'] .boh-empty-state__title {
  color: #d6d6dc;
}
html[data-theme='dark'] .boh-empty-state__desc {
  color: #8d8d93;
}
</style>
