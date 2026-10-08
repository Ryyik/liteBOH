<template>
  <span class="boh-logo" :class="`is-${size}`" aria-hidden="true">
    <i></i><i></i><i></i><i></i>
  </span>
</template>

<script setup>
/**
 * BohLogo.vue — 方块之家母题（2×2 圆角方），BOH AI 的品牌标记。
 *
 * 口径真源：`output/boh-ui-demo/index.html` 的 `.logo-mark`（DESIGN §5 命名契约 `Boh*`）。
 * 三档尺寸：`sm` 18px（消息头 / 岛头）、`md` 22px（侧栏形态切换器）、`lg` 44px（空态）。
 */
defineProps({
  size: { type: String, default: 'md' },
});
</script>

<style scoped>
.boh-logo {
  display: grid;
  flex: none;
  grid-template-columns: 1fr 1fr;
  gap: 2.5px;
  width: 22px;
  height: 22px;
}

.boh-logo i {
  border-radius: 3px;
  background: var(--boh-gray-300);
}

.boh-logo i:nth-child(1) {
  background: var(--boh-accent);
}

.boh-logo i:nth-child(4) {
  background: var(--boh-gray-400);
}

.boh-logo.is-sm {
  gap: 2px;
  width: 18px;
  height: 18px;
}

.boh-logo.is-sm i {
  border-radius: 2.5px;
}

.boh-logo.is-lg {
  gap: 5px;
  width: 44px;
  height: 44px;
}

.boh-logo.is-lg i {
  border-radius: 6px;
}
</style>
