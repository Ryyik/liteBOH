<template>
  <div class="repro">
    <h1>折射玻璃 · 宿主定位对照（DEV only）</h1>
    <p class="hint">三组唯一差别 = 宿主是不是**堆叠上下文**。判据看探针输出：能糊 ⇒ on ≪ off。</p>

    <section class="case">
      <h2>H1 · 宿主 <code>position: relative</code>（非堆叠上下文）—— BOHAI 同款</h2>
      <div class="host host-h1">
        <BohGlassRefract :radius="12" />
      </div>
    </section>

    <section class="case">
      <h2>H2 · 宿主 <code>position: relative; z-index: 1</code>（堆叠上下文）</h2>
      <div class="host host-h2">
        <BohGlassRefract :radius="12" />
      </div>
    </section>

    <section class="case">
      <h2>H3 · 宿主 <code>position: fixed</code>（堆叠上下文）—— 顶栏尝试 2 同款</h2>
      <div class="host host-h3">
        <BohGlassRefract :radius="12" />
      </div>
    </section>
  </div>
</template>

<script setup>
/**
 * GlassBackdropRepro — 「折射玻璃背板采样被谁裁掉」的**独立静态对照页**（2026-10-14，DEV only）
 *
 * 为什么要有这一页：在真实应用页上做对照实验，注入的测试盒子会被页面盖住 / 落到视口外
 * （实测 y≈6638），读数恒 0/0；拿官方 demo 当控制组也不行（它的玻璃是叠在照片上的小件，
 * 能量判据不敏感，**A 组原状也读成 on==off**）。⇒ 需要一个**层级完全自控**的实验场。
 *
 * 本页：整页确定性条纹背板 + 三组宿主，**唯一差别是宿主是不是堆叠上下文**：
 *   H1 `relative`（无 z-index，非堆叠上下文）—— BOHAI 同款
 *   H2 `relative; z-index: 1`（堆叠上下文）
 *   H3 `fixed`（堆叠上下文）—— 顶栏尝试 2 同款
 * 判据由 `scripts/probes/probe-glass-repro-page.mjs` 量：玻璃开着 / 关掉的梯度能量。
 */
import BohGlassRefract from '@/components/ui/BohGlassRefract.vue';
</script>

<style scoped>
/* ⚠️ `.repro` 刻意用 `position: relative`（**无 z-index**）⇒ 它不是堆叠上下文，
   于是三组宿主之上的「背板根」保持一致，差异只剩宿主自己那一条。 */
.repro {
  position: relative;
  min-height: 100vh;
  padding: 24px;
  color: #111;
  background: repeating-linear-gradient(45deg, #111 0 3px, #eee 3px 6px);
}

h1 {
  margin: 0 0 6px;
  font-size: 18px;
}

.hint {
  margin: 0 0 18px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.92);
  font-size: 12px;
}

.case {
  margin-bottom: 18px;
}

h2 {
  margin: 0 0 6px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  font-weight: 600;
}

.host {
  width: 320px;
  height: 80px;
}

/* H1：非堆叠上下文（对照组） */
.host-h1 {
  position: relative;
}

/* H2：堆叠上下文（只多一个 z-index） */
.host-h2 {
  position: relative;
  z-index: 1;
}

/* H3：堆叠上下文（fixed）—— 顶栏尝试 2 同款 */
.host-h3 {
  position: fixed;
  top: 220px;
  left: 380px;
  z-index: 2;
}
</style>
