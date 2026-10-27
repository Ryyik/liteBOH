<template>
  <!-- 覆盖层（不包 wrapper）：宿主元素必须自带 `position: relative`，本层靠 `inset: -1px` 贴住边框。
       `aria-hidden` + `pointer-events: none` ⇒ 对可访问性树与命中测试都是透明的。 -->
  <span class="boh-beam" :class="{ 'is-active': active }" aria-hidden="true">
    <span class="boh-beam__bloom"></span>
  </span>
</template>

<script setup>
/**
 * BohBeam.vue — 边界光束（2026-10-25）
 *
 * 口径真源：`border-beam-vue` 的 `md` + `colorful` 变体，用户口径「我要的就是一样的彩色光效」。
 * 实现说明、三处结构性改造、三条硬约束 → `styles/boh-beam.css` 文件头。
 *
 * ⚠️ **这是 BOHAI 里唯一的彩色元素**，且只允许表达一个语义：**正在生成 / 正在执行**。
 *    不要拿它做选中态、悬停态或装饰（DESIGN §0.1 的「黑白灰，无彩色 accent」仍适用于其余全部界面）。
 * ⚠️ 宿主必须是定位元素（`.boh-composer` 已是 `position: relative`）；宿主若带
 *    `overflow: hidden` 或 `contain: paint`，外发光会被裁掉。
 */
defineProps({
  /** 在途状态。false 时不仅隐藏，还会**停表**（不空转一个常驻合成层）。 */
  active: { type: Boolean, default: false },
});
</script>

<style scoped src="./styles/boh-beam.css"></style>
