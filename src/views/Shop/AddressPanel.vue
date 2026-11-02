<template>
  <!-- 周边 · 「地址」分区（2026-11-02）
       用户口径：「地址是单独的子 Tab，不收在购物袋里」—— 地址与「产品 / 抽奖 / 购物袋 / 订单」
       平级，不再塞进购物袋的二级分段里，也不再借弹层中转。

       内容全部来自 AddressManager（列表 / 新增 / 编辑 / 设默认 / 删除 / AI 智能填充都在里面），
       本组件只做两件事：未登录时的登录引导，以及把组件的区块头收掉。

       为什么要收掉区块头（`show-header=false`）：组件自带的头是
       「SHIPPING / 收货地址 / + 添加地址」，而列表末尾还有一块「+ 添加新地址」虚线瓷砖 ——
       两者同屏就是**两个添加入口**（用户实测截图反馈「横屏有两个添加地址」）。
       顶栏已经写着「地址」，这个头既不提供新信息、又占掉一整行高度，
       所以只留瓷砖那一个入口：它同时在空态时充当唯一的新增引导。 -->
  <section class="addr-panel">
    <div v-if="!isLoggedIn" class="addr-empty">
      <MapPin :size="22" :stroke-width="1.6" aria-hidden="true" />
      <p>登录后管理收货地址</p>
      <button type="button" class="addr-login" @click="showLoginModal = true">登录</button>
    </div>

    <AddressManager v-else variant="glass" :show-header="false" @loaded="$emit('loaded', $event)" />
  </section>
</template>

<script setup>
import { storeToRefs } from 'pinia';
import { MapPin } from 'lucide-vue-next';
import AddressManager from '@/components/AddressManager.vue';
import { useAuthStore } from '@/stores/auth';

defineEmits(['loaded']);

const authStore = useAuthStore();
const { isLoggedIn, showLoginModal } = storeToRefs(authStore);
</script>

<style scoped>
/* 与 .bag-panel / .order-panel 同宽（760）：切分区时左右边界不跳 */
.addr-panel {
  width: 100%;
  max-width: 760px;
  color: var(--boh-text-primary, #1d1d1f);
}

.addr-empty {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 48px 16px;
  border: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.08));
  border-radius: 18px;
  background: var(--boh-bg-primary, #fff);
  color: var(--boh-text-secondary, #86868b);
  text-align: center;
}

.addr-empty p {
  margin: 0;
  font-size: 14px;
}

.addr-login {
  height: 32px;
  padding: 0 20px;
  border: 0;
  border-radius: 999px;
  background: var(--boh-brand-blue, #0071e3);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}

.addr-login:focus-visible {
  outline: 2px solid var(--boh-brand-blue, #0071e3);
  outline-offset: 2px;
}
</style>
