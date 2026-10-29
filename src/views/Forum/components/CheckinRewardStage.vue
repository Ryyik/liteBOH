<script setup>
/**
 * CheckinRewardStage —— 签到成功后的「卡面 3D 旋转 + 极简到账提示」
 *
 * 设计口径（plans/034）：
 *   1. **资源就绪才挂载**。父级等 `preloadPointsCardAssets()` 落定后才 v-if 打开本组件，
 *      所以这里的入场动画第一帧就能画出一张完整的卡（`img.onload` 不够，要 `decode()`）。
 *   2. **双面卡**。单面卡转 360° 时，90°~270° 区间用户看到的是镜像的「方块积分」字样 ——
 *      背面必须是独立的一张纯色卡背（`backface-visibility: hidden`），不是第二张 PointsCard
 *      （那会双份解码同一张大图）。
 *   3. **横竖屏**：竖屏卡在上、文案在下；短横屏（高度 ≤ 520）改左右并排，文字左对齐。
 *      卡片尺寸用 `min(px, vw, vh)` 三重上限，不写死断点像素值。
 *   4. `Teleport to body` ⇒ 暗色覆盖前缀必须是 `html[data-theme='dark']`，
 *      不能依赖页根（`.forum-page[data-theme=dark]` 这类）—— 节点已不在页根里。
 *   5. **已签到再点也复用本组件**（`alreadySigned`）：用户要的是「再看一遍这张卡转圈」，
 *      只是文案换成「已签到」、不显示到账数字。v-if 挂载 ⇒ 每次都是全新动画。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import PointsCard from '@/views/user-center/UserSpace/components/PointsCard.vue';

const props = defineProps({
  pointsAfter: { type: Number, default: 0 },
  /* 后端 points_awarded。现在口径是「每周签到固定 +5」，所以这里正常就是 5；
     仍读后端字段而不是写死 5 —— 万一某周函数没结算（返回 0），
     文案会退回「本周已记录」，不会出现「显示 +5 但余额没动」的假账。 */
  awardAmount: { type: Number, default: 0 },
  /* true = 已签到用户点「再看一遍」：同一套动画，文案改成「已签到」，不显示到账数字。
     之所以复用同一个组件而不是另做一个，是因为用户要看的就是这张卡再转一圈。 */
  alreadySigned: { type: Boolean, default: false },
  username: { type: String, default: '未命名用户' },
  tierLabel: { type: String, default: 'BOH' },
  skin: { type: String, default: 'blank' },
  imageUrl: { type: String, default: '' },
  /* false 表示预取超时/失败 → 卡面回落 blank，但动画照播（钱已经到账，不能吞掉反馈） */
  assetsReady: { type: Boolean, default: true },
});

const emit = defineEmits(['dismiss']);

const LEAVE_MS = 260;
const isLeaving = ref(false);
const prefersReducedMotion =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 停留时间：动效播完（~1.56s）后留 ~0.9s 阅读 */
const holdMs = prefersReducedMotion ? 1600 : 2500;

/* 触发本组件的那次点击可能还在冒泡（例如按钮的 click 在 pointerup 后才结束），
   350ms 内忽略点任意处关闭，避免「一闪而过」 */
const MIN_TAP_GUARD_MS = 350;

const displaySkin = computed(() => (props.assetsReady ? props.skin : 'blank'));
const displayImageUrl = computed(() => (props.assetsReady ? props.imageUrl : ''));
const pointsText = computed(() =>
  Math.max(0, Number(props.pointsAfter) || 0).toLocaleString('zh-CN'),
);

/* 每周固定 +5，不看连签 ⇒ 只留一行到账数字，不显示周进度/下次日期。
   文案取后端值，不硬编码 5（见 props 注释）。
   已签到重播时没有到账数字，主文案直接说「本周已签到」。 */
const titleText = computed(() => (props.alreadySigned ? '已签到' : '签到成功'));

const primaryLine = computed(() => {
  if (props.alreadySigned) return '本周已签到';
  const award = Number(props.awardAmount) || 0;
  return award > 0 ? `+${award} 积分` : '本周已记录';
});

let holdTimer = 0;
let leaveTimer = 0;
const mountedAt = Date.now();

const close = () => {
  if (isLeaving.value) return;
  isLeaving.value = true;
  leaveTimer = window.setTimeout(() => emit('dismiss'), LEAVE_MS);
};

const onStageClick = () => {
  if (Date.now() - mountedAt < MIN_TAP_GUARD_MS) return;
  close();
};

const onKeydown = (event) => {
  if (event.key === 'Escape') close();
};

/* 滚动锁：**不要**去改 body 的 overflow ——
   全局 `src/views/Home/style.global.css` 把 `body { overflow: visible !important }`、
   `html { overflow-y: scroll !important }` 钉死了，要盖住它只能再写一条 !important
   （撞 check:important-budget 预算），而且桌面端抽掉滚动条会让整页横向抖一下。
   改成在事件层拦：舞台铺满视口，wheel / touchmove 一律吃掉，页面自然不动。 */
const preventScroll = (event) => {
  event.preventDefault();
};

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('wheel', preventScroll, { passive: false });
  window.addEventListener('touchmove', preventScroll, { passive: false });
  holdTimer = window.setTimeout(close, holdMs);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('wheel', preventScroll);
  window.removeEventListener('touchmove', preventScroll);
  if (holdTimer) clearTimeout(holdTimer);
  if (leaveTimer) clearTimeout(leaveTimer);
});
</script>

<template>
  <div
    class="checkin-stage"
    :class="{ 'is-leaving': isLeaving, 'is-reduced': prefersReducedMotion }"
    role="status"
    aria-live="polite"
    data-checkin-stage
    :data-asset-ready="assetsReady ? '1' : '0'"
    :data-award="awardAmount"
    :data-already-signed="alreadySigned ? '1' : '0'"
    @click="onStageClick"
  >
    <div class="checkin-stage-scrim" aria-hidden="true"></div>

    <div class="checkin-stage-body">
      <div class="checkin-card-persp" aria-hidden="true">
        <div class="checkin-card-3d" :data-skin="displaySkin">
          <div class="checkin-card-face is-front">
            <PointsCard
              eager
              :points="pointsAfter"
              :username="username"
              :tier-label="tierLabel"
              :skin="displaySkin"
              :image-url="displayImageUrl"
            />
            <span class="checkin-card-sheen" aria-hidden="true"></span>
          </div>
          <div class="checkin-card-face is-back">
            <span class="checkin-card-back-mark">BOH</span>
          </div>
        </div>
      </div>

      <div class="checkin-stage-copy">
        <p class="checkin-copy-title">{{ titleText }}</p>
        <p class="checkin-copy-points">{{ primaryLine }}</p>
        <p class="checkin-copy-balance">当前积分 {{ pointsText }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.checkin-stage {
  position: fixed;
  inset: 0;
  z-index: 200050;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(env(safe-area-inset-top, 0px) + 24px) 24px
    calc(env(safe-area-inset-bottom, 0px) + 24px);
  cursor: default;
  touch-action: none;
  overscroll-behavior: contain;
  animation: checkin-stage-in 180ms ease-out both;
}

.checkin-stage.is-leaving {
  opacity: 0;
  transform: scale(0.99);
  transition:
    opacity 260ms ease,
    transform 260ms ease;
}

.checkin-stage-scrim {
  position: absolute;
  inset: 0;
  /* 浅色页面上 0.34 的深遮罩算下来底色仍接近 #b9bdc0，白字对比度不到 2:1。
     0.62 + blur 才能把「白底白字」救回来（实测约 7:1），也让背景帖子真正退场。 */
  background: rgba(10, 16, 22, 0.62);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.checkin-stage-body {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  min-width: 0;
}

.checkin-card-persp {
  /* 三重上限：360px 设计宽 / 78vw 窄屏 / 68vh 矮屏（横屏） */
  width: min(360px, 78vw, 68vh);
  perspective: 1200px;
  perspective-origin: 50% 46%;
}

.checkin-card-3d {
  position: relative;
  width: 100%;
  aspect-ratio: 8 / 5;
  transform-style: preserve-3d;
  animation: checkin-card-spin 1500ms cubic-bezier(0.34, 0.72, 0.28, 1) 60ms both;
  will-change: transform;
}

.checkin-card-face {
  position: absolute;
  inset: 0;
  border-radius: 18px;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  overflow: hidden;
}

.checkin-card-face.is-front {
  box-shadow: 0 22px 48px rgba(13, 27, 39, 0.28);
}

.checkin-card-face.is-back {
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotateY(180deg);
  background: #33404d;
  color: rgba(255, 255, 255, 0.92);
  box-shadow: 0 22px 48px rgba(13, 27, 39, 0.28);
}

/* cats 皮肤偏暖，卡背跟着走一点，避免纯冷灰蓝突兀 */
.checkin-card-3d[data-skin='cats'] .checkin-card-face.is-back {
  background: #46383d;
}

.checkin-card-back-mark {
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.28em;
  text-indent: 0.28em;
}

/* 卡片自身的 aspect-ratio 与容器一致，这里只兜圆角，避免 3D 下的边缘撕裂 */
.checkin-card-face.is-front :deep(.points-card) {
  border-radius: 18px;
  box-shadow: none;
}

.checkin-card-sheen {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  background: linear-gradient(
    105deg,
    transparent 34%,
    rgba(255, 255, 255, 0.5) 48%,
    rgba(255, 255, 255, 0.16) 56%,
    transparent 66%
  );
  transform: translateX(-120%);
  animation: checkin-sheen-sweep 720ms ease-out 520ms both;
}

.checkin-stage-copy {
  display: grid;
  justify-items: center;
  gap: 2px;
  min-width: 0;
  text-align: center;
  animation: checkin-copy-in 420ms ease-out 1050ms both;
}

.checkin-copy-title {
  margin: 0;
  color: rgba(255, 255, 255, 0.86);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.checkin-copy-points {
  margin: 0;
  color: #fff;
  font-size: 28px;
  font-weight: 500;
  line-height: 1.15;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
}

.checkin-copy-balance {
  margin: 4px 0 0;
  color: rgba(255, 255, 255, 0.66);
  font-size: 11.5px;
  font-weight: 400;
  line-height: 1.4;
}

/* 竖屏小屏：卡片别顶到安全区，文案贴紧一点 */
@media (max-width: 380px) {
  .checkin-stage-body {
    gap: 14px;
  }

  .checkin-copy-points {
    font-size: 26px;
  }
}

/* 短横屏（手机横放 / 分屏）：左右并排，文字左对齐 —— 竖排堆叠会把卡片压到很小 */
@media (orientation: landscape) and (max-height: 560px) {
  .checkin-stage {
    padding: calc(env(safe-area-inset-top, 0px) + 14px) 28px
      calc(env(safe-area-inset-bottom, 0px) + 14px);
  }

  .checkin-stage-body {
    flex-direction: row;
    align-items: center;
    gap: 26px;
  }

  .checkin-card-persp {
    width: min(320px, 46vw, 72vh);
  }

  .checkin-stage-copy {
    justify-items: start;
    text-align: left;
    animation-delay: 900ms;
  }

  .checkin-copy-points {
    font-size: 26px;
  }
}

/* 横屏但很高（平板横放）：卡片可以给到 420px，仍走上下结构 */
@media (orientation: landscape) and (min-height: 561px) and (min-width: 900px) {
  .checkin-card-persp {
    width: min(420px, 62vw, 56vh);
  }

  .checkin-copy-points {
    font-size: 32px;
  }
}

@keyframes checkin-stage-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes checkin-card-spin {
  0% {
    opacity: 0;
    transform: rotateY(-24deg) rotateX(8deg) scale(0.92);
  }
  10% {
    opacity: 1;
    transform: rotateY(-18deg) rotateX(7deg) scale(1);
  }
  62% {
    transform: rotateY(330deg) rotateX(2deg) scale(1.045);
  }
  80% {
    transform: rotateY(360deg) rotateX(0deg) scale(1);
  }
  100% {
    opacity: 1;
    transform: rotateY(360deg) rotateX(0deg) scale(1);
  }
}

@keyframes checkin-sheen-sweep {
  from {
    transform: translateX(-120%);
  }
  to {
    transform: translateX(120%);
  }
}

@keyframes checkin-copy-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 降级：只保留淡化，不转、不扫光（前庭敏感人群） */
.checkin-stage.is-reduced .checkin-card-3d {
  animation: checkin-stage-in 160ms ease-out both;
}

.checkin-stage.is-reduced .checkin-card-sheen {
  display: none;
}

.checkin-stage.is-reduced .checkin-stage-copy {
  animation: checkin-stage-in 160ms ease-out both;
}

@media (prefers-reduced-motion: reduce) {
  .checkin-stage.is-leaving {
    transition-duration: 120ms;
  }
}

/* 暗色：**不写 `html[data-theme='dark']` 覆盖**（也不需要）。
   舞台本来就压在一层深遮罩上，文案恒为浅色、卡背恒为深石墨 —— 两套主题下都成立；
   真去写覆盖反而会往暗色裸色棘轮里加三处新字面量。
   卡面本身（blank 深色渐变）由 PointsCard 自带规则负责。 */
</style>
