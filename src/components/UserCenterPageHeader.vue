<template>
  <header class="user-center-page-header">
    <div class="user-center-page-header-inner" :style="{ '--uch-max-width': maxWidth }">
      <div v-if="showBack" class="header-back">
        <UserCenterBackButton :label="backLabel" @click="$emit('back', $event)" />
      </div>
      <h2 class="header-title">{{ title }}</h2>
      <div class="header-actions">
        <slot name="actions"></slot>
      </div>
    </div>
  </header>
</template>

<script setup>
import UserCenterBackButton from './UserCenterBackButton.vue';

defineProps({
  title: {
    type: String,
    required: true,
  },
  backLabel: {
    type: String,
    default: '返回',
  },
  showBack: {
    type: Boolean,
    default: true,
  },
  maxWidth: {
    type: String,
    default: '1400px',
  },
});

defineEmits(['back']);
</script>

<style scoped>
/* 2026-10-01：**不再吸顶**（用户报障「这个栏不要固定在屏幕上」）。
   原实现是 `position: sticky; top: var(--user-center-nav-offset)`，再叠一层 `::before`
   玻璃渐变，靠那层渐变把「滚过去的行」淡出。在设置 / 印象这类长页面上，吸顶 + 半透明渐变
   会露出一截没被淡干净的上一行，看起来就是一条悬空的浮条 —— 用户截图里的那道白条即此。
   现在整条页头随内容一起滚走：
     · `position: relative` 保留（给 `::before`/子元素当包含块，且 z-index 仍生效）；
     · `top: 0` 必须显式写 —— 相对定位下若 top 仍是 56/72px，会真的把整条页头向下推出一道空档；
     · 只为吸顶服务的 `::before` 玻璃渐变一并删除（它不再是浮层，留着只是一层无意义的白雾）。 */
.user-center-page-header {
  position: relative;
  top: 0;
  width: 100%;
  min-height: var(--user-center-page-header-height, 76px);
  background: transparent;
}

.user-center-page-header-inner {
  position: relative;
  z-index: 1;
  min-height: var(--user-center-page-header-height, 76px);
  max-width: var(--uch-max-width, 1400px);
  margin: 0 auto;
  padding: 0 clamp(18px, 4vw, 40px);
  display: grid;
  grid-template-columns: 52px 1fr 52px;
  align-items: center;
  box-sizing: border-box;
}

.header-back {
  justify-self: start;
  display: inline-flex;
  align-items: center;
}

.header-title {
  grid-column: 2;
  margin: 0;
  color: #08090b;
  font-size: clamp(18px, 2.3vw, 22px);
  line-height: 1.2;
  font-weight: 800;
  letter-spacing: 0;
  text-align: center;
  white-space: nowrap;
}

.header-actions {
  justify-self: end;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

:global([data-theme='dark'] .header-title) {
  color: #ffffff;
}

/* 横屏宽屏：取消窄屏 max-width，全宽布局（2026-09 IA 反馈） */
@media (orientation: landscape) and (min-width: 900px) {
  .user-center-page-header-inner {
    max-width: 100%;
  }
}

@media (max-width: 480px) {
  .user-center-page-header {
    /* 窄屏原来在这里把吸顶偏移换成 56px；不再吸顶后必须归零（相对定位下非 0 会推出一道空档） */
    top: 0;
    min-height: var(--user-center-page-header-height, 72px);
  }

  .user-center-page-header-inner {
    min-height: var(--user-center-page-header-height, 72px);
    padding: 0 20px;
  }
}
</style>
