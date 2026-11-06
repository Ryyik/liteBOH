<script setup>
/**
 * BOH Camera Beta —— 图库内嵌的实时滤镜取景器（plans/041）。
 *
 * 四条口径：
 * 1. **所见即所得**：取景用 DOM（`<video>` 挂 CSS filter + 胶片层），快门只把
 *    「取景框里那一块」抓进画布合成一次。取景与成片吃同一份 `resolveFilterLook()`。
 * 2. **不许直接用 `<video>` 当画布源**：`applyFilmLook` 按 `source.width/height`
 *    建画布，而 `<video>` 这两个属性是布局尺寸 —— 颗粒与暗角会整片错位。
 *    必须先落一张原生分辨率的中间画布。
 * 3. **按取景框裁切 + 扣数码变焦**：几何计算在 `utils/camera-capture.js`（有单测）。
 * 4. **拍完先暂存**：成片进「层叠相册」，可以连拍、逐张删，点「完成」才整批
 *    交给图库。交接走 `camera-capture-bridge`（只放内存）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { SwitchCamera, X } from 'lucide-vue-next';
import ImageEditorFilmFx from '@/views/Forum/components/ImageEditorFilmFx.vue';
import { useCameraStream } from '@/composables/useCameraStream.js';
import { IMAGE_EDITOR_FILTERS, resolveFilterLook } from '@/utils/image-editor-filters.js';
import { exportCanvasToJpegFile, renderDocToCanvas } from '@/utils/image-editor-export.js';
import { stashCameraCapture } from '@/utils/camera-capture-bridge.js';
import { MAX_USABLE_ZOOM, buildZoomSteps, computeCaptureRect } from '@/utils/camera-capture.js';

const GALLERY_PATH = '/user-space/note';
/** 一轮最多暂存几张。与 Cloud+ 单批上传上限（9）对齐，避免「拍完才被告知超了」。 */
const MAX_SHOTS = 9;
/** 胶卷容量（纯展示：卷号牌的 /36 是这一卷的格数，不是本批上限） */
const ROLL_LENGTH = 36;

/**
 * 卷名表：滤镜条上的「胶片盒」与左下卷号牌共用。
 *
 * 没有写进 `utils/image-editor-filters.js` —— 那张表是相机与发帖编辑器共用的
 * 单一真源，加字段会连带改动编辑器侧的断言；卷名只是相机的展示层。
 */
const FILM_STOCK = {
  none: 'RAW',
  ccd: 'CCD 200',
  gold: 'GOLD 200',
  ektar: 'EKTAR 100',
  pro400h: 'PRO 400H',
  provia: 'PROVIA 100F',
  vista: 'VISTA 400',
  portra: 'PORTRA 400',
  superia: 'SUPERIA 400',
  velvia: 'VELVIA 50',
  mono: 'ACROS 100',
  disposable: 'SUPER 400',
  night: '800T',
  indoor: 'TUNGSTEN',
  airy: 'AIRY 400',
};

const router = useRouter();
const {
  stream,
  status,
  errorReason,
  facing,
  zoom,
  zoomRange,
  digitalZoom,
  start,
  stop,
  flip,
  setZoom,
  focusAt,
} = useCameraStream();

const presets = IMAGE_EDITOR_FILTERS;
const filterId = ref('none');
const strengthPct = ref(100);
const look = computed(() => resolveFilterLook(filterId.value, strengthPct.value / 100));

const videoRef = ref(null);
const frameRef = ref(null);
const shutterRef = ref(null);
const stackRef = ref(null);
const flyLayerRef = ref(null);
const frameWidth = ref(320);

const isCapturing = ref(false);
/** 暂存的成片：{ id, file, url } */
const shots = ref([]);
const isReviewOpen = ref(false);

/** 卷号：这一卷已拍多少格（0 起，与真实计数器一致） */
const rollLabel = computed(() => String(shots.value.length).padStart(2, '0'));
const stockName = computed(() => FILM_STOCK[filterId.value] || 'BOH 400D');
const padNo = (value) => String(value).padStart(2, '0');

/* ── 点按对焦（尽力而为，见 useCameraStream.focusAt 的注释）──────────────── */
const focusPoint = ref(null);
let focusTimer = null;

function onFrameTap(event) {
  if (status.value !== 'live') return;
  // 取景框里还压着变焦等按钮：点它们不算对焦
  if (event.target?.closest?.('button')) return;
  const frame = frameRef.value;
  if (!frame) return;
  const rect = frame.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  focusPoint.value = {
    x: ((event.clientX - rect.left) / rect.width) * 100,
    y: ((event.clientY - rect.top) / rect.height) * 100,
    key: Date.now(),
  };
  // 触发不到就只是画个框：不谎报「已对焦」
  void focusAt();
  if (focusTimer) window.clearTimeout(focusTimer);
  focusTimer = window.setTimeout(() => {
    focusPoint.value = null;
    focusTimer = null;
  }, 900);
}

const mirrored = computed(() => facing.value === 'user');
/** 档位跟着本机能力走：有硬件变焦就列到设备上限，没有就退回 1/2/3× 数码 */
const zoomSteps = computed(() => buildZoomSteps(zoomRange.value));
/**
 * 变焦口径。
 *
 * ⚠️ 不写「镜头」二字：`zoom.max` 常常是**数码**上限（128× 这类），
 * 写「镜头」会让人以为整段都是光学。网页拿不到物理焦段，只能说「能变到多少倍」。
 * `min < 1` 是唯一可确证的光学信号 —— 只有超广角并进了同一颗逻辑相机，
 * 下限才会低于 1×。
 */
const zoomCaption = computed(() => {
  const { min, max, supported } = zoomRange.value;
  if (!supported) return '数码变焦';
  const fmt = (value) => String(Math.round(value * 10) / 10);
  return `${fmt(min)}×–${fmt(Math.min(max, MAX_USABLE_ZOOM))}× 变焦`;
});
const isActiveZoom = (step) => Math.abs(zoom.value - step) < 0.01;
/** 层叠缩略图只显示最近 3 张，多了就压成一摞 */
const stackShots = computed(() => shots.value.slice(-3));
const isFull = computed(() => shots.value.length >= MAX_SHOTS);

const videoStyle = computed(() => ({
  filter: look.value.css === 'none' ? 'none' : look.value.css,
  // 数码变焦只是把画面放大；成片由 computeCaptureRect 把这块裁出来
  transform: `scale(${digitalZoom.value}) scaleX(${mirrored.value ? -1 : 1})`,
}));

const UNAVAILABLE_TEXT = {
  unsupported: '这个浏览器没有开放摄像头接口，请用 Safari 或 Chrome 直接打开本站。',
  denied: '摄像头权限被拒绝了。在地址栏的站点设置里允许摄像头，然后点重试。',
  'in-use': '摄像头正被别的应用占用，关掉它再试。',
  'not-found': '没有找到可用的摄像头。',
  error: '相机启动失败，可以重试一次。',
};
const unavailableText = computed(
  () => UNAVAILABLE_TEXT[errorReason.value] || UNAVAILABLE_TEXT.error,
);
const canRetry = computed(
  () => status.value === 'unavailable' && errorReason.value !== 'unsupported',
);

/* ── 流绑定 ──────────────────────────────────────────────────────────── */
watch(
  stream,
  async (current) => {
    const video = videoRef.value;
    if (!video) return;
    if (video.srcObject !== current) video.srcObject = current || null;
    if (!current) return;
    // iOS 上这行偶发抛 NotAllowedError（同一路流二次 play），不 catch 会冒到全局
    try {
      await video.play();
    } catch {
      /* 交给 status 兜底：黑屏时用户会看到「重试」 */
    }
  },
  { flush: 'post' },
);

/* ── 取景框宽度：颗粒/泛光的像素换算基准 ─────────────────────────────── */
let frameObserver = null;
function observeFrame() {
  if (typeof ResizeObserver === 'undefined' || !frameRef.value) return;
  frameObserver = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect?.width;
    if (width > 0) frameWidth.value = width;
  });
  frameObserver.observe(frameRef.value);
}

/* ── 过片：成片从快门飞向片位 ─────────────────────────────────────────── */
const reducedMotion =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * 过片动效。
 *
 * 落点必须**与最新那张卡片完全重合**（46px、无旋转）：副本在终点直接移除，
 * 底下就是真卡片，视觉上没有接缝。所以末帧的 scale/rotate 要回到 1 / 0，
 * 中途的倾斜只是"甩过去"的感觉。
 */
function playFilmAdvance(url) {
  const layer = flyLayerRef.value;
  const shutter = shutterRef.value;
  const stack = stackRef.value;
  if (reducedMotion || !layer || !shutter || !stack) return;
  const base = layer.getBoundingClientRect();
  const from = shutter.getBoundingClientRect();
  const to = stack.getBoundingClientRect();
  if (!from.width || !to.width) return;

  const el = document.createElement('img');
  el.className = 'boh-cam__fly';
  el.src = url;
  el.alt = '';
  el.style.left = `${from.left - base.left + from.width / 2 - 23}px`;
  el.style.top = `${from.top - base.top + from.height / 2 - 23}px`;
  layer.appendChild(el);

  const dx = to.left + 23 - (from.left + from.width / 2);
  const dy = to.top + 23 - (from.top + from.height / 2);
  const anim = el.animate(
    [
      { transform: 'translate(0,0) scale(1) rotate(0deg)', offset: 0 },
      {
        transform: `translate(${dx * 0.45}px, ${dy * 0.3 - 24}px) scale(0.86) rotate(-9deg)`,
        offset: 0.5,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(1) rotate(0deg)`, offset: 1 },
    ],
    { duration: 430, easing: 'cubic-bezier(.34,.06,.2,1)', fill: 'forwards' },
  );
  const drop = () => el.remove();
  anim.onfinish = drop;
  anim.oncancel = drop;
}

/* ── 快门 ────────────────────────────────────────────────────────────── */
async function capture() {
  const video = videoRef.value;
  const frame = frameRef.value;
  if (!video || !frame || status.value !== 'live' || isCapturing.value || isFull.value) return;
  isCapturing.value = true;
  try {
    const rect = computeCaptureRect(
      video.videoWidth,
      video.videoHeight,
      frame.offsetWidth / Math.max(1, frame.offsetHeight),
      digitalZoom.value,
    );
    if (!rect) return;
    const shot = document.createElement('canvas');
    shot.width = rect.sw;
    shot.height = rect.sh;
    const shotCtx = shot.getContext('2d');
    // 前置摄像头：取景是镜像的，成片保留真实方向（native 相机的默认行为）
    shotCtx.drawImage(video, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, rect.sw, rect.sh);
    const composed = renderDocToCanvas(shot, [], { look: look.value });
    const file = await exportCanvasToJpegFile(composed, { name: 'boh-camera.jpg' });
    const url = URL.createObjectURL(file);
    shots.value.push({
      id: `shot-${Date.now()}-${shots.value.length}`,
      file,
      url,
      // 记下这张用的卷名：切滤镜之后再回看，底片上的字不能跟着变
      stock: stockName.value,
    });
    // 必须等 DOM 把这张卡片渲染出来，飞行落点才量得到真实位置
    void nextTick().then(() => playFilmAdvance(url));
  } finally {
    isCapturing.value = false;
  }
}

function removeShot(id) {
  const index = shots.value.findIndex((item) => item.id === id);
  if (index < 0) return;
  URL.revokeObjectURL(shots.value[index].url);
  shots.value.splice(index, 1);
  if (!shots.value.length) isReviewOpen.value = false;
}

function releaseAllShots() {
  for (const shot of shots.value) URL.revokeObjectURL(shot.url);
  shots.value = [];
  isReviewOpen.value = false;
}

/* ── 交接 / 离开 ─────────────────────────────────────────────────────── */
function finish() {
  if (!shots.value.length) return;
  // 交接的是 File；blob URL 只用于本页预览，走之前撤掉
  const files = shots.value.map((shot) => shot.file);
  for (const shot of shots.value) URL.revokeObjectURL(shot.url);
  shots.value = [];
  isReviewOpen.value = false;
  stashCameraCapture(files);
  leaveToGallery();
}

/** 关闭：有暂存就先让用户看一眼（避免手滑丢照片），没有就直接走 */
function close() {
  if (shots.value.length) {
    isReviewOpen.value = true;
    return;
  }
  leaveToGallery();
}

function leaveToGallery() {
  if (window.history.state?.back) {
    router.back();
    return;
  }
  void router.replace(GALLERY_PATH);
}

/* ── 生命周期 ────────────────────────────────────────────────────────── */
onMounted(async () => {
  observeFrame();
  // 首次取流放在挂载后尝试；若浏览器要求手势（iOS 常见），会落到 unavailable
  // 并给出「重试」按钮 —— 那一次点击就是合法手势，不用用户重新进页面。
  await start();
});

onBeforeUnmount(() => {
  frameObserver?.disconnect();
  frameObserver = null;
  if (focusTimer) window.clearTimeout(focusTimer);
  focusTimer = null;
  releaseAllShots();
  stop();
});
</script>

<template>
  <div class="boh-cam">
    <header class="boh-cam__top">
      <button type="button" class="boh-cam__icon" aria-label="关闭相机" @click="close">
        <X :size="20" :stroke-width="1.8" aria-hidden="true" />
      </button>
      <span class="boh-cam__beta">Beta</span>
      <button
        type="button"
        class="boh-cam__icon"
        aria-label="切换前后摄像头"
        :disabled="status !== 'live'"
        @click="flip"
      >
        <SwitchCamera :size="20" :stroke-width="1.8" aria-hidden="true" />
      </button>
    </header>

    <div class="boh-cam__stage">
      <div ref="frameRef" class="boh-cam__frame" @pointerdown="onFrameTap">
        <video
          ref="videoRef"
          class="boh-cam__video"
          :style="videoStyle"
          playsinline
          muted
          autoplay
        ></video>

        <ImageEditorFilmFx
          v-if="status === 'live'"
          :look="look"
          :src="''"
          :box-width="frameWidth"
          :halation-stream="stream"
          :mirror="mirrored"
          :zoom="digitalZoom"
        />

        <!-- 画幅角标：取景器该有的四个 L，胶卷机取景框的「框感」主要来自这一圈 -->
        <span class="boh-cam__corner is-nw" aria-hidden="true"></span>
        <span class="boh-cam__corner is-ne" aria-hidden="true"></span>
        <span class="boh-cam__corner is-sw" aria-hidden="true"></span>
        <span class="boh-cam__corner is-se" aria-hidden="true"></span>

        <!-- 对焦框：点了就出现，1s 后自己消失（能真正触发 AF 的机型很少见） -->
        <span
          v-if="focusPoint"
          :key="focusPoint.key"
          class="boh-cam__focus"
          :style="{ left: `${focusPoint.x}%`, top: `${focusPoint.y}%` }"
          aria-hidden="true"
        ></span>

        <!-- 变焦：档位由本机 `getCapabilities().zoom` 决定，没有硬件变焦就退回数码 -->
        <div class="boh-cam__zoom" aria-label="变焦">
          <div role="radiogroup" aria-label="变焦档位" class="boh-cam__zoom-pills">
            <button
              v-for="step in zoomSteps"
              :key="step"
              type="button"
              class="boh-cam__zoom-step"
              :class="{ 'is-active': isActiveZoom(step) }"
              role="radio"
              :aria-checked="isActiveZoom(step)"
              :disabled="status !== 'live'"
              @click="setZoom(step)"
            >
              {{ step }}×
            </button>
          </div>
          <span class="boh-cam__zoom-caption">{{ zoomCaption }}</span>
        </div>

        <div v-if="status === 'unavailable'" class="boh-cam__fallback" role="alert">
          <p>{{ unavailableText }}</p>
          <button v-if="canRetry" type="button" class="boh-cam__retry" @click="start">重试</button>
        </div>

        <div v-if="status === 'requesting'" class="boh-cam__fallback is-quiet">
          <p>正在打开相机…</p>
        </div>

        <span v-if="isCapturing" class="boh-cam__flash" aria-hidden="true"></span>
      </div>
    </div>

    <div class="boh-cam__controls">
      <div class="boh-cam__filters" role="radiogroup" aria-label="滤镜">
        <button
          v-for="preset in presets"
          :key="preset.id"
          type="button"
          class="boh-cam__chip"
          :class="{ 'is-active': preset.id === filterId }"
          role="radio"
          :aria-checked="preset.id === filterId"
          :aria-label="`${preset.label}（${FILM_STOCK[preset.id] || 'RAW'}）`"
          @click="filterId = preset.id"
        >
          <!-- 色块：小屏/降级时用；正常显示胶卷盒 -->
          <span class="boh-cam__swatch" :style="{ background: preset.swatch }"></span>
          <!-- 胶卷盒：色带 + 卷名 + 中文，选中时底部一条红带 -->
          <span class="boh-cam__box">
            <span class="boh-cam__box-band" :style="{ background: preset.swatch }"></span>
            <span class="boh-cam__box-name">{{ FILM_STOCK[preset.id] || 'RAW' }}</span>
            <span class="boh-cam__box-cn">{{ preset.label }}</span>
          </span>
          <span class="boh-cam__chip-label">{{ preset.label }}</span>
        </button>
      </div>

      <label class="boh-cam__strength">
        <span class="boh-cam__strength-label">强度 {{ strengthPct }}%</span>
        <input v-model.number="strengthPct" type="range" min="0" max="100" step="1" />
      </label>

      <div class="boh-cam__action-row">
        <div class="boh-cam__left">
          <!-- 卷号：胶卷机的计数器，一格一格跳。拍满本批时转琥珀色 -->
          <div class="boh-cam__roll" :class="{ 'is-full': isFull }" data-testid="camera-roll">
            <span class="boh-cam__roll-name">{{ stockName }}</span>
            <span class="boh-cam__roll-num">
              <b>{{ rollLabel }}</b
              ><s>/</s><span>{{ ROLL_LENGTH }}</span>
            </span>
          </div>

          <!-- 层叠相册：最近 3 张错开叠放，点开可以逐张删 -->
          <button
            v-if="shots.length"
            ref="stackRef"
            type="button"
            class="boh-cam__stack"
            :aria-label="`已拍 ${shots.length} 张，点开查看`"
            data-testid="camera-stack"
            @click="isReviewOpen = true"
          >
            <img
              v-for="(shot, index) in stackShots"
              :key="shot.id"
              class="boh-cam__stack-card"
              :class="`is-${index}`"
              :src="shot.url"
              alt=""
            />
          </button>
          <span v-else class="boh-cam__stack is-empty" aria-hidden="true"></span>
        </div>

        <button
          ref="shutterRef"
          type="button"
          class="boh-cam__shutter"
          :aria-label="isFull ? '本批已满' : '拍摄'"
          data-testid="camera-shutter"
          :disabled="status !== 'live' || isCapturing || isFull"
          @click="capture"
        >
          <span></span>
        </button>

        <button type="button" class="boh-cam__done" :disabled="!shots.length" @click="finish">
          完成{{ shots.length ? ` ${shots.length}` : '' }}
        </button>
      </div>
    </div>

    <!-- 过片飞行层：成片从快门飞向片位，落在最新那张卡片上 -->
    <div ref="flyLayerRef" class="boh-cam__fly-layer" aria-hidden="true"></div>

    <!-- 暂存相册：逐张过一遍、删掉不要的，再整批交给图库 -->
    <Transition name="boh-cam-fade">
      <div
        v-if="isReviewOpen"
        class="boh-cam__review"
        role="dialog"
        aria-modal="true"
        aria-label="已拍照片"
      >
        <header class="boh-cam__review-head">
          <span>已拍 {{ shots.length }} 张</span>
          <button
            type="button"
            class="boh-cam__review-close"
            aria-label="收起"
            @click="isReviewOpen = false"
          >
            <X :size="18" :stroke-width="1.8" aria-hidden="true" />
          </button>
        </header>

        <div class="boh-cam__review-grid">
          <figure v-for="(shot, index) in shots" :key="shot.id" class="boh-cam__review-item">
            <img :src="shot.url" alt="拍到的照片" />
            <figcaption class="boh-cam__review-cap">
              {{ shot.stock || stockName }} · {{ padNo(index + 1) }}
            </figcaption>
            <button
              type="button"
              class="boh-cam__review-remove"
              aria-label="删除这张"
              @click="removeShot(shot.id)"
            >
              <X :size="14" :stroke-width="2.2" aria-hidden="true" />
            </button>
          </figure>
        </div>

        <footer class="boh-cam__review-foot">
          <button type="button" class="boh-cam__ghost" @click="isReviewOpen = false">继续拍</button>
          <button type="button" class="boh-cam__primary" @click="finish">
            完成（{{ shots.length }}）
          </button>
        </footer>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 取景器是「媒体容器」：底色固定为黑，不跟随站点主题（浅色主题下也必须是黑）。
   这些字面量不在任何 [data-theme] 块里，不会被 check:dark-tokens 计数。 */
.boh-cam {
  position: fixed;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  background: #0b0b0c;
  color: #f5f5f7;
  overscroll-behavior: contain;
  /* 计数器/卷名/信息条共用一套等宽字（胶片机的印字都是等宽的） */
  --boh-cam-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.boh-cam__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: calc(10px + env(safe-area-inset-top)) 16px 8px;
  flex: none;
}

.boh-cam__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: inherit;
  cursor: pointer;
}

.boh-cam__icon:disabled {
  opacity: 0.35;
  cursor: default;
}

.boh-cam__beta {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.86);
}

.boh-cam__stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 0;
}

.boh-cam__frame {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
}

/* 桌面端不要把取景框拉成整屏：3:4 竖幅更接近相机 */
@media (min-width: 720px) {
  .boh-cam__frame {
    width: auto;
    height: 100%;
    aspect-ratio: 3 / 4;
    max-width: 100%;
    border-radius: 18px;
  }
}

.boh-cam__video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform-origin: center;
}

/* 画幅角标：四条 L 形短边。比整圈描边轻，不抢画面，但一眼就是「取景框」 */
.boh-cam__corner {
  position: absolute;
  width: 20px;
  height: 20px;
  border: 0 solid rgba(255, 255, 255, 0.5);
  pointer-events: none;
}

.boh-cam__corner.is-nw {
  top: 12px;
  left: 12px;
  border-top-width: 2px;
  border-left-width: 2px;
  border-top-left-radius: 4px;
}

.boh-cam__corner.is-ne {
  top: 12px;
  right: 12px;
  border-top-width: 2px;
  border-right-width: 2px;
  border-top-right-radius: 4px;
}

.boh-cam__corner.is-sw {
  bottom: 12px;
  left: 12px;
  border-bottom-width: 2px;
  border-left-width: 2px;
  border-bottom-left-radius: 4px;
}

.boh-cam__corner.is-se {
  right: 12px;
  bottom: 12px;
  border-right-width: 2px;
  border-bottom-width: 2px;
  border-bottom-right-radius: 4px;
}

.boh-cam__focus {
  position: absolute;
  width: 64px;
  height: 64px;
  margin: -32px 0 0 -32px;
  border: 1.5px solid rgba(255, 255, 255, 0.92);
  border-radius: 6px;
  pointer-events: none;
  animation: boh-cam-focus 900ms ease-out forwards;
}

@keyframes boh-cam-focus {
  0% {
    transform: scale(1.4);
    opacity: 0;
  }
  18% {
    transform: scale(1);
    opacity: 1;
  }
  70% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 0;
  }
}

.boh-cam__zoom {
  position: absolute;
  right: 12px;
  bottom: 22px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.boh-cam__zoom-pills {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.boh-cam__zoom-caption {
  font-size: 10px;
  line-height: 1.2;
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.42);
  color: rgba(255, 255, 255, 0.66);
  backdrop-filter: blur(6px);
  white-space: nowrap;
}

.boh-cam__zoom-step {
  min-width: 44px;
  height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.42);
  color: rgba(255, 255, 255, 0.72);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  backdrop-filter: blur(6px);
}

.boh-cam__zoom-step.is-active {
  background: rgba(255, 255, 255, 0.92);
  color: #111;
}

.boh-cam__zoom-step:disabled {
  opacity: 0.4;
  cursor: default;
}

.boh-cam__fallback {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 24px;
  text-align: center;
  background: rgba(11, 11, 12, 0.92);
  font-size: 14px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.82);
}

.boh-cam__fallback.is-quiet {
  background: transparent;
}

.boh-cam__retry {
  min-height: 40px;
  padding: 0 20px;
  border: 0;
  border-radius: 999px;
  background: #fff;
  color: #111;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.boh-cam__flash {
  position: absolute;
  inset: 0;
  background: #fff;
  animation: boh-cam-flash 180ms ease-out forwards;
  pointer-events: none;
}

@keyframes boh-cam-flash {
  from {
    opacity: 0.9;
  }
  to {
    opacity: 0;
  }
}

.boh-cam__controls {
  flex: none;
  padding: 8px 0 calc(16px + env(safe-area-inset-bottom));
}

.boh-cam__filters {
  display: flex;
  gap: 10px;
  padding: 2px 16px 10px;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.boh-cam__filters::-webkit-scrollbar {
  display: none;
}

.boh-cam__chip {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 44px;
  padding: 0;
  border: 0;
  background: none;
  color: rgba(255, 255, 255, 0.6);
  font-size: 11px;
  cursor: pointer;
}

/* 相机页统一用胶卷盒：色块与下方中文名会与盒面重复，一律收掉 */
.boh-cam__swatch,
.boh-cam__chip-label {
  display: none;
}

/* 胶卷盒：色带 + 英文卷名 + 中文小字。选中的不是"滤镜"，是"这一卷" */
.boh-cam__box {
  position: relative;
  display: block;
  width: 44px;
  height: 52px;
  border-radius: 4px;
  overflow: hidden;
  background: #efe6d6;
  transition: box-shadow 140ms ease;
}

.boh-cam__box-band {
  display: block;
  height: 23px;
}

.boh-cam__box-name {
  display: block;
  padding-top: 4px;
  font-family: var(--boh-cam-mono);
  font-size: 6.6px;
  line-height: 1.1;
  letter-spacing: 0.02em;
  color: #2c2419;
  text-align: center;
  white-space: nowrap;
}

.boh-cam__box-cn {
  display: block;
  font-size: 6.6px;
  line-height: 1.4;
  color: rgba(44, 36, 25, 0.62);
  text-align: center;
}

.boh-cam__chip.is-active {
  color: #fff;
}

.boh-cam__chip.is-active .boh-cam__box {
  box-shadow:
    0 0 0 1.5px #fff,
    0 0 0 3px rgba(0, 0, 0, 0.55);
}

.boh-cam__chip.is-active .boh-cam__box::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2.5px;
  background: #c0392b;
}

.boh-cam__strength {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 20px 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.66);
}

.boh-cam__strength input {
  flex: 1;
  accent-color: #fff;
}

.boh-cam__action-row {
  /* 左右定宽、中间 1fr：快门永远落在正中，卷号牌变宽也不会把它挤偏 */
  display: grid;
  grid-template-columns: 96px 1fr 78px;
  align-items: center;
  padding: 8px 18px 0;
}

.boh-cam__left {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: flex-start;
  gap: 5px;
  min-width: 0;
}

/* ── 卷号牌：机身顶盖的计数器 ────────────────────────────────────────── */
.boh-cam__roll {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-variant-numeric: tabular-nums;
}

.boh-cam__roll-name {
  font-family: var(--boh-cam-mono);
  font-size: 7.5px;
  letter-spacing: 0.14em;
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
}

.boh-cam__roll-num {
  display: flex;
  align-items: flex-end;
  font-family: var(--boh-cam-mono);
  line-height: 1;
  color: #fff;
}

.boh-cam__roll-num b {
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.boh-cam__roll-num s {
  text-decoration: none;
  font-size: 10px;
  opacity: 0.4;
  margin: 0 2px 2px;
}

.boh-cam__roll-num span {
  font-size: 10px;
  opacity: 0.55;
  margin-bottom: 2px;
}

/* 本批满了（9 张）：数字转琥珀，配合快门禁用，别让人以为相机坏了 */
.boh-cam__roll.is-full .boh-cam__roll-num {
  color: #e0a458;
}

/* ── 层叠相册 ────────────────────────────────────────────────────────── */
.boh-cam__stack {
  position: relative;
  width: 52px;
  height: 52px;
  flex: none;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}

.boh-cam__stack.is-empty {
  width: 44px;
  height: 44px;
  margin: 4px;
  border: 1.5px dashed rgba(255, 255, 255, 0.5);
  border-radius: 10px;
  opacity: 0.28;
}

.boh-cam__stack-card {
  position: absolute;
  top: 0;
  left: 0;
  width: 46px;
  height: 46px;
  object-fit: cover;
  border-radius: 9px;
  /* 暖白边而不是纯白：和暂存相册里的片基同一套纸色 */
  border: 1.5px solid #efe6d6;
  background: #222;
  transition: transform 160ms ease;
}

/* 三张卡各自往右下错开一点并轻微旋转，才看得出是「一摞」而不是一张
   （实测 2px/3deg 太保守：拍同样的场景时几乎看不出来） */
.boh-cam__stack-card.is-0 {
  transform: translate(6px, 6px) rotate(9deg);
  opacity: 0.7;
}

.boh-cam__stack-card.is-1 {
  transform: translate(3px, 3px) rotate(4deg);
  opacity: 0.88;
}

.boh-cam__stack-card.is-2 {
  transform: none;
}

/* 银圈红点：康泰时 T2 / 富士傻瓜机的视觉锚。
   外圈金属用 conic-gradient 做，内圈红点按下缩到 93% —— 比整颗按钮缩
   更接近机械快门的手感（外圈不动，只有中心被按下去）。 */
.boh-cam__shutter {
  width: 68px;
  height: 68px;
  margin: 0 auto;
  padding: 3px;
  border-radius: 50%;
  border: 0;
  background: conic-gradient(
    from 210deg,
    #fff,
    #a5a5a0 16%,
    #fafaf6 38%,
    #8b8b86 60%,
    #f2f2ee 80%,
    #fff
  );
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.5),
    0 8px 18px -6px rgba(0, 0, 0, 0.7),
    inset 0 0 0 1px rgba(255, 255, 255, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.boh-cam__shutter span {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: radial-gradient(circle at 38% 32%, #d9564a, #c0392b 52%, #9e2b20 100%);
  box-shadow:
    inset 0 -2px 6px rgba(0, 0, 0, 0.35),
    inset 0 2px 4px rgba(255, 255, 255, 0.28);
  transition: transform 90ms ease;
}

.boh-cam__shutter:active span {
  transform: scale(0.93);
}

.boh-cam__shutter:disabled {
  opacity: 0.4;
  cursor: default;
}

/* ── 过片飞行层 ──────────────────────────────────────────────────────── */
.boh-cam__fly-layer {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

/* 尺寸与最新那张片位卡片（46px）完全一致：末帧无缩放无旋转，落地即重合 */
.boh-cam__fly {
  position: absolute;
  width: 46px;
  height: 46px;
  border-radius: 9px;
  object-fit: cover;
  border: 1.5px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 10px 22px -8px rgba(0, 0, 0, 0.85);
}

.boh-cam__done {
  flex: none;
  min-width: 52px;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  border: 0;
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.boh-cam__done:disabled {
  opacity: 0.32;
  cursor: default;
}

/* ── 暂存相册浮层 ────────────────────────────────────────────────────── */
.boh-cam__review {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  /* 必须不透明：0.96 会把底下的 BETA / 变焦 / 滤镜条透出来，看着像重影 */
  background: #0b0b0c;
  padding: calc(12px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom));
}

.boh-cam__review-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 500;
  padding-bottom: 12px;
}

.boh-cam__review-close {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.boh-cam__review-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  align-content: start;
  overflow-y: auto;
}

/* 片基：暖白底 + 上下齿孔 + 底部卷号，交错倾斜一点，
   像刚冲出来摊在桌上的底片 —— 而不是一排 App 缩略图 */
.boh-cam__review-item {
  position: relative;
  margin: 0;
  padding: 8px 8px 20px;
  border-radius: 2px;
  background: #efe6d6;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.45);
  transform: rotate(-0.6deg);
}

.boh-cam__review-item:nth-child(even) {
  transform: rotate(0.5deg);
}

.boh-cam__review-item img {
  display: block;
  width: 100%;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  border-radius: 1px;
}

/* 齿孔是小方孔，不是虚线：间距 8px、孔宽 3px，肉眼才像底片 */
.boh-cam__review-item::before,
.boh-cam__review-item::after {
  content: '';
  position: absolute;
  left: 5px;
  right: 5px;
  height: 4px;
  background-image: repeating-linear-gradient(
    90deg,
    rgba(70, 56, 40, 0.45) 0 3px,
    transparent 3px 8px
  );
  pointer-events: none;
}

.boh-cam__review-item::before {
  top: 2px;
}

.boh-cam__review-item::after {
  bottom: 2px;
}

.boh-cam__review-cap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 5px;
  text-align: center;
  font-family: var(--boh-cam-mono);
  font-size: 6.4px;
  letter-spacing: 0.1em;
  color: rgba(60, 48, 35, 0.72);
  white-space: nowrap;
}

.boh-cam__review-remove {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 24px;
  height: 24px;
  border: 1.5px solid #0b0b0c;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.boh-cam__review-foot {
  display: flex;
  gap: 12px;
  padding-top: 14px;
}

.boh-cam__ghost,
.boh-cam__primary {
  flex: 1;
  min-height: 46px;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
}

.boh-cam__ghost {
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: transparent;
  color: inherit;
}

.boh-cam__primary {
  border: 0;
  background: #fff;
  color: #111;
}

.boh-cam-fade-enter-active,
.boh-cam-fade-leave-active {
  transition: opacity 160ms ease;
}

.boh-cam-fade-enter-from,
.boh-cam-fade-leave-to {
  opacity: 0;
}
</style>
