<script setup>
/**
 * 帖子详情弹窗（横屏）— 全局唯一宿主，挂在 App.vue。
 *
 * - 本组件很轻，静态导入不增首屏负担；重的 PostDetailMain 走 defineAsyncComponent，
 *   与整页路由共享同一 chunk，首次打开弹窗时才加载。
 * - 开关状态与历史栈同步在 usePostDetailModal（单源），本组件只负责壳与视觉。
 * - 层级：overlay z-index 2147482400 —— 盖过 UserSpace bottom-nav(2147482200)/
 *   BohaiSidebar 底层(2147482100/2200)，让位图片查看器(2147483000)与全局弹窗(2147483647)。
 *   编辑器等 fixed 子层在 panel 的 stacking context 内自然置顶，无需改其 z-index。
 */
import { computed, defineAsyncComponent, h, ref, watch, nextTick } from 'vue';
import { usePostDetailModal } from '@/composables/usePostDetailModal.js';
import {
  animateMorph,
  canMorph,
  insetFromRect,
  insetOpen,
  peekOrigin,
} from '@/utils/motion-origin.js';
import { motionEase, motionMs, motionNum } from '@/utils/motion.js';
import { recoverDynamicImportFailure } from '@/utils/vite-preload-recovery.js';
import { forceCleanAndReload } from '@/utils/version-checker.js';

// runtime-only 构建不支持 template 选项，加载占位用 h() 渲染函数
const PdModalLoading = () =>
  h('div', { class: 'pd-modal-loading', 'aria-hidden': 'true' }, [
    h('span', { class: 'pd-modal-loading-dot' }),
    h('span', { class: 'pd-modal-loading-dot' }),
    h('span', { class: 'pd-modal-loading-dot' }),
  ]);

// 加载失败态：弹窗壳在、内容为空的「空白弹窗」事故（2026-10-02）——
// 部署窗口期旧入口 import 旧 hash chunk 404，若无 errorComponent 则渲染为空。
const PdModalError = {
  name: 'PdModalError',
  setup() {
    return () =>
      h('div', { class: 'pd-modal-error' }, [
        h('p', { class: 'pd-modal-error-text' }, '详情内容加载失败'),
        h(
          'button',
          {
            class: 'pd-modal-error-retry',
            type: 'button',
            onClick: () => void forceCleanAndReload(),
          },
          '刷新页面',
        ),
      ]);
  },
};

const PostDetailMain = defineAsyncComponent({
  loader: () => import('./PostDetailMain.vue'),
  delay: 200,
  loadingComponent: PdModalLoading,
  errorComponent: PdModalError,
  // 前 2 次失败自动重试（瞬时网络抖动 / dev server 重启大多能恢复）；
  // 重试耗尽 → 错误态兜底 + 生产环境发起 SW 感知的强刷（30s 冷却）。
  onError(error, retry, fail, attempts) {
    if (attempts <= 2) {
      setTimeout(() => retry(), attempts * 300);
      return;
    }
    fail(error);
    recoverDynamicImportFailure();
  },
});

const { isOpen, postId, close, open } = usePostDetailModal();

/* 关闭一律只调 close()，形变交给下面的 isOpen watcher —— 关闭有五条路径
   （遮罩 / 关闭钮 / 详情内 @close / Esc / 浏览器后退），只有前三条经过本组件，
   在 handleClose 里挂形变会让 Esc 与后退「只剩淡出」。 */
const handleClose = (options) => close(options);
const handleOpenPost = (id) => open(id, { replace: true });

/* ── 从卡片「推开」/ 收回（plans/035 §L4 P4 / §16）─────────────────────
   横屏弹窗的起点同样是列表卡片，终点是 `.pd-modal-panel`。
   两段式：进场只按**面板当前**矩形算形变，图片比例（media-ratio）到达后
   面板还会走既有的 520ms 变宽过渡 —— 这里不等网络，否则入场被拖住。

   ⚠️ 形变只能挂在 panel 上，不能挂 `.pd-modal-overlay`：overlay 是 fixed 铺满，
   而且它是 Vue <Transition> 的根，动它会和 enter/leave 的类名打架。

   ⚠️ 2026-10-31 改口径：不再是 FLIP 矩形变形，改成 **窗口 clip-path + 内容纵深**
   （与竖屏整页同一套，见 motion-origin.js 的 insetFromRect）。面板 `1024×752`
   被卡片 `667×644` 拉伸时 sx/sy 差得不算离谱，但「矩形变形」和竖屏的观感是
   两套东西 —— 用户要的是同一件事：从点开的那一格推开。 */
const panelRef = ref(null);
const panelOriginKey = () => `post-detail:${String(postId.value || '')}`;

const playPanelMorph = async (direction) => {
  if (!canMorph()) return false;
  const source = peekOrigin(panelOriginKey());
  if (!source) return false;
  await nextTick();
  /* ⚠️ 退场时 `panelRef.value` 已经是 null（2026-10-31 实测，这正是「关闭不缩回」的真因）：
     v-if 翻假的瞬间 Vue 就解绑模板 ref，即使节点被 <Transition> 的 leave 留着继续淡出。
     所以这里必须回落到 DOM 查询 —— 那 460ms 里节点确实还在文档里，量得到矩形。 */
  const el = panelRef.value || document.querySelector('.pd-modal-panel');
  if (!el) return false;
  const box = el.getBoundingClientRect();
  if (!box.width || !box.height) return false;
  const target = { left: box.left, top: box.top, width: box.width, height: box.height };
  const win = insetFromRect(source, target, { radius: source.radius || 12 });
  if (!win) return false;
  const radiusTo = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;

  /* ⚠️ 形变期间必须把面板的 `transition-property` 收成只剩 width（2026-10-31 修）。
     起因：关闭时「面板原地微缩 + 淡出」，没有缩回卡片。
     真因是**级联顺序**：CSS Cascade 里 transitions 是最后一档（高于 animations），
     而 Vue 的 enter/leave 类会给面板挂 `transition: transform … / opacity …`：
       · leave-active 面板 transition: transform 340ms + leave-to 的 scale(1.008)
         ⇒ 起跑后 rAF 一加 leave-to，transition 就从当前值走向 scale(1.008)，
           把 WAAPI 形变整段压掉（元素宽度实测全程 ~1000px 不动）；
       · enter-active 同理（380ms），进场只是「碰巧」因为 transition 起点取到了
           形变第一帧的值，看起来像在长，实际圆角与不透明度都没参与。
     只留 width：面板宽度那条 520ms 的「随图变宽」过渡照常工作，
     transform / opacity 的过渡被摘掉，WAAPI 成为唯一真源。
     恢复交给调用方（进场动画结束后置空，退场元素随即被移除）。 */
  const restoreTransition = () => {
    el.style.transitionProperty = '';
    el.style.transform = '';
  };
  el.style.transitionProperty = 'width';
  /* ⚠️ transform 同样要钉成 none（2026-10-31 实测）。`transition-property: width` 的
     副作用是 enter-from/leave-to 里那两条件奏位移变成**瞬间**生效：
       · leave-to `scale(1.008)` ⇒ 面板立刻变成 1032×758，末帧窗口落不到卡片上（偏 8px）；
       · enter-from `translateY(12px) scale(.985)` ⇒ 起点比卡片高 12px。
     窗口方案里面板自己不该动，动的是裁剪窗口，所以直接钉平。 */
  el.style.transform = 'none';

  const duration =
    direction === 'in'
      ? motionMs('--motion-morph-in-near', 380)
      : motionMs('--motion-morph-out', 340);
  const easing = motionEase('--ease-morph');
  const depth = motionNum('--morph-depth', 1.12);

  /* 纵深挂在 `.pd-modal-scroll`（面板的内容层）上，原点取卡片中心 ——
     用默认的 50% 50% 会让放大从面板中心发散，方向与「从这一格推开」相反。 */
  const inner = el.querySelector('.pd-modal-scroll');
  const origin = `${(source.left + source.width / 2 - box.left).toFixed(1)}px ${(source.top + source.height / 2 - box.top).toFixed(1)}px`;
  const depthFrames =
    direction === 'in'
      ? [
          { transform: `scale(${depth.toFixed(3)})`, transformOrigin: origin },
          { transform: 'scale(1)', transformOrigin: origin },
        ]
      : [
          { transform: 'scale(1)', transformOrigin: origin },
          { transform: `scale(${depth.toFixed(3)})`, transformOrigin: origin },
        ];
  if (inner && depth > 1.001) {
    void animateMorph(inner, depthFrames, {
      duration,
      easing,
      // 退场同样要保留终态，否则 cancel 的瞬间内容「弹回」1.0
      keepFinal: direction === 'out',
    });
  }

  if (direction === 'in') {
    // 先钉住起始帧：nextTick 与 animate() 之间跨帧会露出全尺寸的一帧
    el.style.clipPath = win.value;
    await animateMorph(el, [{ clipPath: win.value }, { clipPath: insetOpen(radiusTo) }], {
      duration,
      easing,
    });
    el.style.clipPath = '';
    restoreTransition();
  } else {
    /* 退场保留终态：cancel 的瞬间面板会弹回全屏，紧接着才淡出（P1 事故原样） */
    void animateMorph(el, [{ clipPath: insetOpen(radiusTo) }, { clipPath: win.value }], {
      duration,
      easing,
      keepFinal: true,
    });
    /* ⚠️ 透明度必须是**独立一条 linear 动画**（2026-10-31 修，这是「关闭没有动画」的真因）。
       上面把 transition-property 收成 width（防 CSS 过渡压掉形变）的副作用是
       `.pd-modal-leave-to` 的 `opacity: 0` 瞬间生效 —— 实测 t=43ms 面板 opacity 已 0.00，
       于是「窗口收到卡片」这 340ms 全程在**全透明**里跑，用户只看得到遮罩淡出。

       也不能把 opacity 塞进上面那条的关键帧：曲线是**前载**的（--ease-morph 在
       45% 墙钟时间已走完 79% 进度），`offset: 0.78` 实际会被跨过在 ~53% 的时间点，
       后两成行程又变回全透明 —— 窗口还没落到卡片上就消失了。
       linear 的 offset 才是墙钟时间：前 78%（265ms）完全可见，最后 1/5 交给底下那张卡。 */
    void animateMorph(el, [{ opacity: 1 }, { opacity: 1, offset: 0.78 }, { opacity: 0 }], {
      duration,
      easing: 'linear',
      keepFinal: true,
    });
  }
  return true;
};

/* 两个方向都挂在这里：close() 的所有入口（含 Esc / popstate）都能缩回卡片。
   flush 用默认 'pre' —— 回调跑在渲染前，元素还在 DOM 里，peekOrigin 量得到卡片；
   playPanelMorph 内部再 await nextTick() 等到 leave 类挂上、尺寸稳定后再动。 */
watch(isOpen, (open) => {
  void playPanelMorph(open ? 'in' : 'out');
});

/* ── 左栏随图比例自适应（2026-10-22，用户定稿口径）────────────────────────
   口径（用户 2026-10-22 拍板）：
     · Q1 信息列固定 **460px**（文案与评论区宽度恒定，不随图抖动）；
     · Q2 宽图时**面板真的变宽**，上限维持 1120px；
     · Q3 多图切换时**实时变**，配「慢速优雅」过渡。

   几何推导（关键）：媒体列的高度是固定的（= 面板高 − 内衬），
   所以媒体列的宽度可以由图片比例直接反推：媒体列宽 = 媒体列高 × 图片宽高比。
   面板宽 = 媒体列宽 + 信息列 460 + 两侧内衬。

   三条夹紧，缺一不可：
   ① 媒体列下限 380px —— 再窄，左右导航箭头与底部圆点无处安放；
   ② 媒体列上限 = 面板上限 1120 − 信息列 460 = 660px ——
      横图时吃满后剩余交给 contain 成左右留白，这是**有意的**：
      面板再宽正文行长会失控；
   ③ 面板下限 760px —— 没有图 / 比例未知时的安全值。

   ⚠️ 比例未知（无图帖、或图还没量出来）时一律回落到 760px 的单栏形态，
   否则会按 media-ratio=null 算出个非法宽度，面板瞬间塌掉。 */
const PANEL_MIN = 760;
const INFO_COL = 460;
const MEDIA_MIN = 380;
/* 媒体列上限要按**视口**算，不能按面板上限算。
   实测教训（2026-10-22）：先写死 PANEL_MAX 1120 ⇒ MEDIA_MAX 660，
   而 130 张真实图的比例中位数是 0.75、p90 是 1.50，媒体列高约 850
   ⇒ 1:1 图需要 850px 宽，被 660 夹掉 190px，左右各留一条白边。
   也就是说「宽图左栏多长出来」的效果被上限吃掉了，与用户口径相反。
   改为：媒体列上限 = 视口可用宽 − 内衬 − 信息列，面板上限同步放到「视口可用宽」
   （见 panelMaxWidth）—— 两者必须同一来源，否则列宽相加会超过面板自身。 */
const PANEL_GUTTER = 48; // overlay 的 padding: 24px × 2
/* 面板绝对上限（2026-10-22 用户二次口径「不要太特别宽，比参考例图再宽一点点」）
   参考图实测：972 视口下面板 902.5px。这里取 1040 ≈ 比参考宽 15%，
   既兑现「比参考宽一点点」，又不会在大屏上撑成整屏。
   ⚠️ 与媒体列上限是同一来源：媒体列最多 = 1040 − 460 = 580。 */
const PANEL_HARD_MAX = 1040;

// null = 无图 / 未知比例 ⇒ 走单栏，不加宽
const mediaRatio = ref(null);

const handleMediaRatio = (ratio) => {
  mediaRatio.value = Number.isFinite(Number(ratio)) && Number(ratio) > 0 ? Number(ratio) : null;
};

// 视口可用宽（overlay 有 24px 内衬）—— 面板与媒体列的真实上限都从这里派生
// 同时受 PANEL_HARD_MAX（1040）与视口夹紧：小屏跟随屏宽，大屏不再无限变宽。
const panelMaxWidth = computed(() => {
  const available =
    typeof window === 'undefined' ? PANEL_HARD_MAX : window.innerWidth - PANEL_GUTTER;
  // 取「视口可用宽」与「硬上限 1040」的较小者，再保证不低于单栏最小宽
  return Math.max(PANEL_MIN, Math.min(PANEL_HARD_MAX, available));
});

// 媒体列高：与 .pd-modal-panel 的 height: min(880px, 100vh−48px) 保持一致地推算
const mediaColHeight = computed(() => {
  if (typeof window === 'undefined') return 850;
  return Math.max(320, Math.min(880, window.innerHeight - PANEL_GUTTER));
});

// 媒体列宽：比例 × 列高，夹在 [380, 视口可用宽 − 信息列]
const mediaColWidth = computed(() => {
  const r = mediaRatio.value;
  if (!r) return null;
  const maxCol = Math.max(MEDIA_MIN, panelMaxWidth.value - INFO_COL);
  return Math.round(Math.min(maxCol, Math.max(MEDIA_MIN, mediaColHeight.value * r)));
});

// 面板宽度 = 媒体列宽 + 信息列；无比例（无图/未知）时回落单栏最小宽
const panelWidth = computed(() => {
  const col = mediaColWidth.value;
  if (!col) return PANEL_MIN;
  return Math.min(panelMaxWidth.value, Math.max(PANEL_MIN, col + INFO_COL));
});
</script>

<template>
  <Teleport to="body">
    <Transition name="pd-modal">
      <div v-if="isOpen" class="pd-modal-overlay" @click="handleClose()">
        <div
          ref="panelRef"
          class="pd-modal-panel"
          :class="{ 'is-ratio-adaptive': mediaRatio !== null }"
          :style="{
            '--pd-panel-width': panelWidth + 'px',
            '--pd-media-col': mediaColWidth ? mediaColWidth + 'px' : null,
            '--pd-info-col': INFO_COL + 'px',
          }"
          role="dialog"
          aria-modal="true"
          aria-label="帖子详情"
          @click.stop
        >
          <button class="pd-modal-close" type="button" aria-label="关闭" @click="handleClose()">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </button>
          <div class="pd-modal-scroll">
            <PostDetailMain
              :post-id-override="postId"
              modal-mode
              @close="handleClose"
              @open-post="handleOpenPost"
              @media-ratio="handleMediaRatio"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.pd-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147482400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.32);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.pd-modal-panel {
  position: relative;
  /* 宽度真源：由 JS（PostDetailModal 的 panelWidth）算出并写进 --pd-panel-width；
     回退值保持原行为 min(1120px, 100vw−48px)，所以 JS 没算出来时视觉不变。 */
  width: min(var(--pd-panel-width, 1120px), calc(100vw - 48px));
  /* 慢速优雅过渡（用户 2026-10-22 口径）：切图时面板/媒体列平滑改宽。
     只过渡 width 与 grid-template-columns —— 别写 all，否则背景/阴影也会跟着动。 */
  transition: width 520ms cubic-bezier(0.22, 1, 0.36, 1);
  height: min(880px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  border-radius: var(--liquid-radius-lg, 28px);
  background: var(--liquid-bg-strong, rgba(255, 255, 255, 0.84));
  border: 1px solid var(--liquid-border, rgba(255, 255, 255, 0.65));
  box-shadow: var(--liquid-shadow-overlay, 0 24px 80px rgba(15, 23, 42, 0.14));
  backdrop-filter: var(--liquid-filter, blur(28px) saturate(180%));
  -webkit-backdrop-filter: var(--liquid-filter, blur(28px) saturate(180%));
  overflow: hidden;
}

.pd-modal-close {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--liquid-radius-pill, 999px);
  border: 1px solid var(--liquid-border, rgba(255, 255, 255, 0.65));
  background: var(--liquid-bg, rgba(255, 255, 255, 0.72));
  color: var(--liquid-text-secondary, #6e6e73);
  cursor: pointer;
  backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%));
  -webkit-backdrop-filter: var(--liquid-filter-sm, blur(18px) saturate(180%));
  transition:
    background var(--duration-fast, 180ms) ease,
    color var(--duration-fast, 180ms) ease,
    transform var(--duration-fast, 180ms) ease;
}

.pd-modal-close:hover {
  background: var(--liquid-bg-strong, rgba(255, 255, 255, 0.84));
  color: var(--liquid-text-primary, #1d1d1f);
}

.pd-modal-close:active {
  transform: scale(0.94);
}

.pd-modal-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.pd-modal-scroll::-webkit-scrollbar {
  display: none;
}

.pd-modal-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 200px;
}

.pd-modal-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  height: 240px;
  padding: 24px;
}

.pd-modal-error-text {
  margin: 0;
  color: var(--liquid-text-secondary, #6e6e73);
  font-size: 14px;
}

.pd-modal-error-retry {
  padding: 8px 22px;
  border: none;
  border-radius: var(--liquid-radius-pill, 999px);
  background: var(--liquid-text-primary, #1d1d1f);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity var(--duration-fast, 180ms) ease;
}

.pd-modal-error-retry:hover {
  opacity: 0.88;
}

.pd-modal-loading-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--liquid-text-tertiary, #8b9098);
  opacity: 0.5;
  animation: pd-modal-dot-pulse 1.1s ease-in-out infinite;
}

.pd-modal-loading-dot:nth-child(2) {
  animation-delay: 0.15s;
}

.pd-modal-loading-dot:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes pd-modal-dot-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.85);
  }
  50% {
    opacity: 0.9;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pd-modal-loading-dot {
    animation: none;
  }
}

/* ── 开关过渡（2026-10-22 重做） ──────────────────────────────────────
   原来只有「淡入 + translateY(20px) scale(0.975)」，三处不够：
   ① 透明度与位移共用 `ease`，进出场节拍一样，离场显得拖；
   ② scale(0.975) 在 1040px 面板上是 ~26px 的缩放摆动，肉眼像整块弹一下，
      而不是「浮起来」；
   ③ 遮罩与面板同时淡出，没有主次。

   现在的做法（对齐 iOS modal 的呼吸感）：
   · **入场分两层错拍**：遮罩 200ms 先压暗，面板 380ms 稍慢跟进 ——
     眼睛先看到背景被压下去，再看到面板升起来，有层次；
   · **位移用 --ease-out**（快出慢收，Tailwind 那档 expo-out 的近似），
     缩放只给 0.985 且从 12px 起 —— 大幅缩小换成「几乎不缩、只上浮」，
     观感是升起而非弹跳；
   · **离场更快更浅**：关闭不耐等（进 > 出的时长比约 1.5:1）。
     有来源矩形时面板缩回列表卡片（`--motion-morph-out` 340ms，WAAPI 接管，
     见 playPanelMorph），遮罩 360ms 同步淡出；
     **没有**来源矩形（Esc 从地址栏直接进、刷新还原、reduce 档）才走 CSS 兜底：
     scale(1.008) 微胀后散开，避免「缩回小盒子」那种廉价感。
   · 全部走 opacity/transform（合成层），不触发重排。 */
.pd-modal-enter-active {
  transition: opacity 200ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}

.pd-modal-leave-active {
  /* 退场时长同时是**节点摘除时刻**：面板的收回形变 340ms（--motion-morph-out）
     必须短于它，否则末帧被截断（2026-10-31 从 260 → 360 → 500 → 随标准档回 360）。 */
  transition: opacity 360ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}

.pd-modal-enter-active .pd-modal-panel {
  transition:
    transform 380ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    opacity 260ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}

.pd-modal-leave-active .pd-modal-panel {
  /* 只在「没有来源矩形、形变跳过」时生效（形变期间 JS 会把 transition-property
     收成 width，见 playPanelMorph 的注释）。时长同样短于根节点的 360ms。 */
  transition:
    transform 340ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    opacity 300ms linear;
}

.pd-modal-enter-from,
.pd-modal-leave-to {
  opacity: 0;
}

.pd-modal-enter-from .pd-modal-panel {
  opacity: 0;
  transform: translateY(12px) scale(0.985);
}

.pd-modal-leave-to .pd-modal-panel {
  opacity: 0;
  transform: scale(1.008);
}

@media (prefers-reduced-motion: reduce) {
  .pd-modal-enter-active,
  .pd-modal-leave-active,
  .pd-modal-enter-active .pd-modal-panel,
  .pd-modal-leave-active .pd-modal-panel {
    transition: opacity 120ms linear;
  }
  .pd-modal-enter-from .pd-modal-panel,
  .pd-modal-leave-to .pd-modal-panel {
    transform: none;
  }
}
</style>
