<template>
  <!-- 收货地址（2026-11-10 收进设置三级页）
       之前设置里点「收货地址」是 `router.push('/shop?tab=address')` —— 直接跳到商城，
       整页换掉、设置壳消失。地址簿本身是通用组件（AddressManager），商城那侧只是
       在它外面包了一层 Shop 分区壳，所以这里不需要新写列表逻辑：
       同一份组件、`show-header=false`（页头由设置壳的返回条给出，避免两个「添加地址」）。 -->
  <div class="shipping-address-panel">
    <section v-if="!isLoggedIn" class="gs-group">
      <div class="gs-rows">
        <div class="gs-row is-static">
          <span class="gs-icon is-teal">
            <MapPin :size="16" :stroke-width="2" aria-hidden="true" />
          </span>
          <span class="gs-text">
            <span class="gs-label">登录后管理收货地址</span>
            <span class="gs-desc">礼物与实物订单寄送都使用这里保存的地址</span>
          </span>
          <button type="button" class="gs-btn ghost sap-login" @click="showLoginModal = true">
            登录
          </button>
        </div>
      </div>
    </section>

    <AddressManager v-else variant="glass" :show-header="false" />
  </div>
</template>

<script setup>
/**
 * 收货地址内联面板：地址簿仍是 AddressManager 单一实现，
 * 本组件只做「未登录引导」和设置卡片的视觉对齐（:deep 覆写半径/描边）。
 */
import { storeToRefs } from 'pinia';
import { MapPin } from 'lucide-vue-next';
import AddressManager from '@/components/AddressManager.vue';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const { isLoggedIn, showLoginModal } = storeToRefs(authStore);
</script>

<style scoped>
@import '../styles/settings-glass.css';

.shipping-address-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  animation: sap-in 240ms var(--ease-out, ease-out) both;
}

/* 竖屏：本面板的内容根**不是 .gs-card**（地址卡是 AddressManager 自己的 .am-card），
   所以拿不到 settings-glass.css 里 `.gs-card { margin-inline: 16px }` 那条内缩，
   实测卡片 left=0 贴屏幕边，而页头的圆形返回按钮在 16px —— 两者错开一格（截图可见）。
   2026-11-24 页头改成极简（按钮内缩 16）后这个错位才显出来：改前页头是通栏胶囊
   （left=0），两边都贴边，反而"对齐"。这里补同样的 16px 沟槽。 */
@media (max-width: 767px) {
  .shipping-address-panel {
    padding-inline: 16px;
  }
}

@keyframes sap-in {
  from {
    opacity: 0;
    transform: translateX(12px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.sap-login {
  flex: none;
  padding: 0 16px;
}

/* 地址卡与设置卡片同一套几何：18px 圆角 + 液态描边（AddressManager 自带的 20px/白边
   是商城风格的常量，放进设置右栏会跟旁边的 .gs-card 差一点点，所以在这里覆写）。 */
.shipping-address-panel :deep(.am-card) {
  border-radius: var(--liquid-radius-md, 18px);
  border: 1px solid var(--liquid-border, rgba(0, 0, 0, 0.08));
  background: var(--liquid-bg-strong, rgba(255, 255, 255, 0.72));
  box-shadow: var(--liquid-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
}

/* 新增地址瓷砖：保留虚线（它是「可添加」的唯一视觉线索，别改成实心主按钮），
   但底色要跟旁边的设置卡片同一张，否则在灰底上整块会「消失」。
   ⚠️ 虚线颜色不能用 --liquid-border-strong —— 它是白色高光（gl. 内描边），
   铺在浅灰底上等于看不见（实测整块只剩一个 + 号和一行字）。 */
.shipping-address-panel :deep(.am-add-tile) {
  border: 1.5px dashed rgba(15, 23, 42, 0.22);
  border-radius: var(--liquid-radius-md, 18px);
  background: var(--liquid-bg-strong, rgba(255, 255, 255, 0.72));
  color: var(--boh-text-secondary, #515154);
  box-shadow: var(--liquid-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
}

[data-theme='dark'] .shipping-address-panel :deep(.am-add-tile) {
  border-color: rgba(255, 255, 255, 0.24);
}

.shipping-address-panel :deep(.am-add-tile:hover) {
  border-color: var(--boh-accent, #007aff);
  color: var(--boh-accent, #007aff);
}

/* 空态说明（「还没有收货地址…」）是 grid 里的一行，默认贴到卡片边缘；
   加一点左右内边距，竖屏下才不会被裁在屏幕边上。 */
.shipping-address-panel :deep(.am-empty-note) {
  padding: 6px 16px;
  line-height: 1.6;
}

.shipping-address-panel :deep(.am-addr-card:hover) {
  box-shadow: var(--liquid-shadow-md, 0 6px 18px rgba(15, 23, 42, 0.08));
}

@media (prefers-reduced-motion: reduce) {
  .shipping-address-panel {
    animation: none;
  }
}
</style>
