<template>
  <Teleport to="body">
    <Transition name="payment-success">
      <div v-if="visible" class="payment-success-overlay" role="presentation">
        <section class="payment-success-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-success-title">
          <button type="button" class="payment-success-close" aria-label="关闭支付成功提示" @click="$emit('close')">
            <X :size="19" aria-hidden="true" />
          </button>

          <p class="payment-success-kicker">BOH STORE</p>
          <div class="payment-card-scene" :class="{ 'is-flipping': isFlipping }" aria-hidden="true">
            <div class="payment-card-flip">
              <div class="payment-card-face payment-card-front">
                <PointsCard
                  :points="points"
                  :username="username"
                  tier-label="BOH"
                  :skin="skin"
                  :image-url="imageUrl"
                  compact
                />
              </div>
              <div class="payment-card-face payment-card-back">
                <span class="payment-card-back-mark"><Check :size="25" :stroke-width="2.5" aria-hidden="true" /></span>
                <span class="payment-card-back-brand">方块商店</span>
                <strong>支付成功</strong>
                <span class="payment-card-back-order">{{ orderNo }}</span>
                <span class="payment-card-back-footer">BOH STORE</span>
              </div>
            </div>
          </div>

          <div class="payment-success-copy" :class="{ revealed: isComplete }">
            <h2 id="payment-success-title">支付成功</h2>
            <p>{{ paymentSummary }}</p>
          </div>
          <dl class="payment-success-details" :class="{ revealed: isComplete }">
            <div><dt>订单号</dt><dd>{{ orderNo }}</dd></div>
            <div><dt>剩余积分</dt><dd>{{ formattedPoints }}</dd></div>
          </dl>
          <button type="button" class="payment-success-confirm" :class="{ revealed: isComplete }" @click="$emit('close')">完成</button>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { Check, X } from 'lucide-vue-next';
import PointsCard from '@/views/user-center/UserSpace/components/PointsCard.vue';

const props = defineProps({
  visible: { type: Boolean, default: false },
  username: { type: String, default: '未命名用户' },
  points: { type: Number, default: 0 },
  skin: { type: String, default: 'blank' },
  imageUrl: { type: String, default: '' },
  orderNo: { type: String, default: '' },
  paymentSummary: { type: String, default: '订单已确认' }
});

defineEmits(['close']);

const isFlipping = ref(false);
const isComplete = ref(false);
let flipStartTimer = null;
let flipCompleteTimer = null;
const formattedPoints = computed(() => `${Math.max(0, Number(props.points) || 0).toLocaleString('zh-CN')} 积分`);

watch(() => props.visible, async (visible) => {
  if (flipStartTimer) clearTimeout(flipStartTimer);
  if (flipCompleteTimer) clearTimeout(flipCompleteTimer);
  isFlipping.value = false;
  isComplete.value = false;
  if (!visible) return;
  await nextTick();
  flipStartTimer = setTimeout(() => { isFlipping.value = true; }, 220);
  flipCompleteTimer = setTimeout(() => { isComplete.value = true; }, 1920);
});

onBeforeUnmount(() => {
  if (flipStartTimer) clearTimeout(flipStartTimer);
  if (flipCompleteTimer) clearTimeout(flipCompleteTimer);
});
</script>

<style scoped>
.payment-success-overlay { position: fixed; z-index: 1000; inset: 0; display: grid; place-items: center; padding: 24px; color: #1d1d1f; background: rgba(233, 237, 242, .68); backdrop-filter: blur(22px) saturate(140%); -webkit-backdrop-filter: blur(22px) saturate(140%); }
.payment-success-dialog { position: relative; width: min(424px, 100%); padding: 31px 31px 28px; overflow: hidden; border: 1px solid rgba(255, 255, 255, .74); border-radius: 22px; text-align: center; background: rgba(255, 255, 255, .75); box-shadow: 0 28px 80px rgba(23, 39, 58, .2), inset 0 1px rgba(255, 255, 255, .86); }
.payment-success-close { position: absolute; top: 14px; right: 14px; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 50%; display: grid; place-items: center; color: #5d6269; background: rgba(235, 238, 242, .9); cursor: pointer; transition: transform 160ms ease, background-color 160ms ease; }.payment-success-close:hover { background: #e5e8ec; }.payment-success-close:active { transform: scale(.92); }
.payment-success-kicker { margin: 0 0 22px; color: #7a8089; font-size: 11px; font-weight: 700; line-height: 1; letter-spacing: .08em; }
.payment-card-scene { width: min(344px, 100%); margin: 0 auto; perspective: 1000px; }.payment-card-flip { position: relative; width: 100%; aspect-ratio: 2.08 / 1; transform-style: preserve-3d; transition: transform 1700ms cubic-bezier(.22, .92, .3, 1); }.payment-card-scene.is-flipping .payment-card-flip { transform: rotateY(360deg); }
.payment-card-face { position: absolute; inset: 0; overflow: hidden; border-radius: 14px; backface-visibility: hidden; -webkit-backface-visibility: hidden; }.payment-card-front { pointer-events: none; }.payment-card-front :deep(.points-card) { max-width: none; height: 100%; }.payment-card-back { display: flex; flex-direction: column; align-items: flex-start; padding: 19px 20px; color: #fff; transform: rotateY(180deg); background: linear-gradient(135deg, #1d2735 0%, #344861 58%, #192938 100%); box-shadow: 0 14px 24px rgba(24, 40, 57, .22); text-align: left; }.payment-card-back::before { position: absolute; inset: 18px 0 auto; height: 26px; content: ''; background: rgba(255, 255, 255, .12); }.payment-card-back-mark { position: relative; z-index: 1; width: 33px; height: 33px; border-radius: 50%; display: grid; place-items: center; color: #18334d; background: #fff; }.payment-card-back-brand { position: relative; z-index: 1; margin-top: auto; color: rgba(255, 255, 255, .7); font-size: 10px; font-weight: 700; }.payment-card-back strong { position: relative; z-index: 1; margin-top: 3px; font-size: 25px; line-height: 1.1; letter-spacing: 0; }.payment-card-back-order { position: absolute; right: 19px; bottom: 20px; color: rgba(255, 255, 255, .68); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; }.payment-card-back-footer { position: absolute; right: 19px; top: 18px; color: rgba(255, 255, 255, .64); font-size: 10px; font-weight: 700; letter-spacing: .07em; }
.payment-success-copy { margin-top: 23px; opacity: 0; transform: translateY(7px); transition: opacity 320ms ease 260ms, transform 320ms ease 260ms; }.payment-success-copy.revealed, .payment-success-details.revealed, .payment-success-confirm.revealed { opacity: 1; transform: none; }.payment-success-copy h2 { margin: 0; font-size: 25px; line-height: 1.2; letter-spacing: 0; }.payment-success-copy p { margin: 8px 0 0; color: #6d7279; font-size: 14px; }
.payment-success-details { margin: 20px 0 0; padding: 13px 15px; border: 1px solid rgba(74, 86, 101, .1); border-radius: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: rgba(246, 248, 250, .78); opacity: 0; transform: translateY(7px); transition: opacity 320ms ease 350ms, transform 320ms ease 350ms; }.payment-success-details div { min-width: 0; text-align: left; }.payment-success-details dt { color: #858b92; font-size: 11px; }.payment-success-details dd { margin: 5px 0 0; overflow: hidden; color: #333a42; font-size: 12px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }.payment-success-details div + div { padding-left: 12px; border-left: 1px solid rgba(74, 86, 101, .1); }
.payment-success-confirm { width: 100%; min-height: 44px; margin-top: 18px; border: 0; border-radius: 12px; color: #fff; background: #1d2735; font-size: 14px; font-weight: 700; cursor: pointer; opacity: 0; transform: translateY(7px); transition: opacity 320ms ease 430ms, transform 320ms ease 430ms, background-color 160ms ease; }.payment-success-confirm:hover { background: #2a4055; }.payment-success-confirm:active { transform: scale(.985); }
.payment-success-enter-active, .payment-success-leave-active { transition: opacity 220ms ease; }.payment-success-enter-from, .payment-success-leave-to { opacity: 0; }.payment-success-enter-active .payment-success-dialog, .payment-success-leave-active .payment-success-dialog { transition: transform 280ms cubic-bezier(.22, .92, .3, 1), opacity 180ms ease; }.payment-success-enter-from .payment-success-dialog, .payment-success-leave-to .payment-success-dialog { opacity: 0; transform: translateY(12px) scale(.98); }
@media (max-width: 440px) { .payment-success-overlay { padding: 14px; align-items: end; }.payment-success-dialog { padding: 27px 22px calc(22px + env(safe-area-inset-bottom)); border-radius: 20px; }.payment-success-kicker { margin-bottom: 19px; }.payment-card-back { padding: 16px 17px; }.payment-card-back strong { font-size: 22px; }.payment-card-back-order, .payment-card-back-footer { right: 16px; }.payment-card-back-footer { top: 15px; }.payment-card-back-order { bottom: 17px; } }
@media (prefers-reduced-motion: reduce) { .payment-card-flip { transition-duration: 1ms; }.payment-card-scene.is-flipping .payment-card-flip { transform: rotateY(360deg); }.payment-success-copy, .payment-success-details, .payment-success-confirm { transition-duration: 1ms; } }
</style>
