<script setup>
/**
 * BOH Camera Beta —— 图库内嵌的实时滤镜取景器（plans/041）。
 *
 * 三条口径：
 * 1. **所见即所得**：取景用 DOM（`<video>` 挂 CSS filter + 胶片层），快门只把
 *    「取景框里那一块」抓进画布合成一次。取景与成片吃同一份 `resolveFilterLook()`。
 * 2. **不许直接用 `<video>` 当画布源**：`applyFilmLook` 按 `source.width/height`
 *    建画布，而 `<video>` 这两个属性是布局尺寸 —— 颗粒与暗角会整片错位。
 *    必须先落一张原生分辨率的中间画布。
 * 3. **按取景框裁切**：取景是 object-fit: cover 的 3:4，成片若直接取整帧，
 *    用户会看到「拍出来比看到的多了两条边」。这里按可视区域中心裁切。
 *
 * 成片去向：一次性 File 交给 `camera-capture-bridge`，图库回来后自动开「新建」。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { SwitchCamera, X } from 'lucide-vue-next';
import ImageEditorFilmFx from '@/views/Forum/components/ImageEditorFilmFx.vue';
import { useCameraStream } from '@/composables/useCameraStream.js';
import { IMAGE_EDITOR_FILTERS, resolveFilterLook } from '@/utils/image-editor-filters.js';
import { exportCanvasToJpegFile, renderDocToCanvas } from '@/utils/image-editor-export.js';
import { stashCameraCapture } from '@/utils/camera-capture-bridge.js';

const GALLERY_PATH = '/user-space/note';

const router = useRouter();
const { stream, status, errorReason, facing, start, stop, flip } = useCameraStream();

const presets = IMAGE_EDITOR_FILTERS;
const filterId = ref('none');
const strengthPct = ref(100);
const look = computed(() => resolveFilterLook(filterId.value, strengthPct.value / 100));

const videoRef = ref(null);
const frameRef = ref(null);
const frameWidth = ref(320);

const isCapturing = ref(false);
const capturedFile = ref(null);
const capturedUrl = ref('');
const captured = computed(() => Boolean(capturedUrl.value));
const mirrored = computed(() => facing.value === 'user');

const filterCss = computed(() => look.value.css);

const videoStyle = computed(() => ({
  filter: filterCss.value === 'none' ? 'none' : filterCss.value,
  transform: mirrored.value ? 'scaleX(-1)' : 'none',
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
const canRetry = computed(() => status.value === 'unavailable' && errorReason.value !== 'unsupported');

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

/* ── 快门 ────────────────────────────────────────────────────────────── */
async function capture() {
  const video = videoRef.value;
  const frame = frameRef.value;
  if (!video || !frame || status.value !== 'live' || isCapturing.value) return;
  if (!video.videoWidth || video.videoHeight < 2) return;
  isCapturing.value = true;
  try {
    const aspect = frame.offsetWidth / Math.max(1, frame.offsetHeight);
    let sourceWidth = video.videoWidth;
    let sourceHeight = video.videoHeight;
    // 只取取景框看得见的那一块（居中的最大内接矩形）
    if (sourceWidth / sourceHeight > aspect) sourceWidth = Math.round(sourceHeight * aspect);
    else sourceHeight = Math.round(sourceWidth / aspect);
    const sourceX = Math.round((video.videoWidth - sourceWidth) / 2);
    const sourceY = Math.round((video.videoHeight - sourceHeight) / 2);

    const shot = document.createElement('canvas');
    shot.width = sourceWidth;
    shot.height = sourceHeight;
    const shotCtx = shot.getContext('2d');
    // 前置摄像头：取景是镜像的，成片保留真实方向（native 相机的默认行为）
    shotCtx.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight,
    );

    const composed = renderDocToCanvas(shot, [], { look: look.value });
    const file = await exportCanvasToJpegFile(composed, { name: 'boh-camera.jpg' });
    releaseCaptureUrl();
    capturedFile.value = file;
    capturedUrl.value = URL.createObjectURL(file);
  } finally {
    isCapturing.value = false;
  }
}

function releaseCaptureUrl() {
  if (!capturedUrl.value) return;
  URL.revokeObjectURL(capturedUrl.value);
  capturedUrl.value = '';
  capturedFile.value = null;
}

function retake() {
  releaseCaptureUrl();
  if (status.value !== 'live') void start();
}

function useShot() {
  if (!capturedFile.value) return;
  const file = capturedFile.value;
  const url = capturedUrl.value;
  capturedFile.value = null;
  capturedUrl.value = '';
  stashCameraCapture(file);
  // 先导航再撤 URL：review 图会随页面一起卸载，不需要等过渡结束
  leaveToGallery();
  if (url) URL.revokeObjectURL(url);
}

function leaveToGallery() {
  const hasBack = Boolean(window.history.state?.back);
  if (hasBack) {
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
  releaseCaptureUrl();
  stop();
});
</script>

<template>
  <div class="boh-cam">
    <header class="boh-cam__top">
      <button type="button" class="boh-cam__icon" aria-label="关闭相机" @click="leaveToGallery">
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
      <div ref="frameRef" class="boh-cam__frame">
        <video
          v-show="!captured"
          ref="videoRef"
          class="boh-cam__video"
          :style="videoStyle"
          playsinline
          muted
          autoplay
        ></video>

        <ImageEditorFilmFx
          v-if="status === 'live' && !captured"
          :look="look"
          :src="''"
          :box-width="frameWidth"
          :halation-stream="stream"
          :mirror="mirrored"
        />

        <img v-if="captured" class="boh-cam__shot" :src="capturedUrl" alt="拍摄结果" />

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

    <div v-if="!captured" class="boh-cam__controls">
      <div class="boh-cam__filters" role="radiogroup" aria-label="滤镜">
        <button
          v-for="preset in presets"
          :key="preset.id"
          type="button"
          class="boh-cam__chip"
          :class="{ 'is-active': preset.id === filterId }"
          role="radio"
          :aria-checked="preset.id === filterId"
          @click="filterId = preset.id"
        >
          <span class="boh-cam__swatch" :style="{ background: preset.swatch }"></span>
          <span class="boh-cam__chip-label">{{ preset.label }}</span>
        </button>
      </div>

      <label class="boh-cam__strength">
        <span class="boh-cam__strength-label">强度 {{ strengthPct }}%</span>
        <input v-model.number="strengthPct" type="range" min="0" max="100" step="1" />
      </label>

      <div class="boh-cam__shutter-row">
        <button
          type="button"
          class="boh-cam__shutter"
          aria-label="拍摄"
          :disabled="status !== 'live' || isCapturing"
          @click="capture"
        >
          <span></span>
        </button>
      </div>
    </div>

    <div v-else class="boh-cam__review">
      <button type="button" class="boh-cam__ghost" @click="retake">重拍</button>
      <button type="button" class="boh-cam__primary" @click="useShot">用这张</button>
    </div>
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

.boh-cam__video,
.boh-cam__shot {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 成片按「拍摄那一刻取景框的宽高比」裁过，这里必须继续 cover：
   回顾态少了滤镜条/快门，舞台高度变高 ⇒ 用 contain 会上下出现黑边
   （实测 390×844：上下各 80px 的假黑边，看着像拍坏了）。 */
.boh-cam__shot {
  background: #000;
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
  gap: 6px;
  width: 52px;
  padding: 0;
  border: 0;
  background: none;
  color: rgba(255, 255, 255, 0.6);
  font-size: 11px;
  cursor: pointer;
}

.boh-cam__swatch {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 2px solid transparent;
  transition: border-color 140ms ease;
}

.boh-cam__chip.is-active {
  color: #fff;
}

.boh-cam__chip.is-active .boh-cam__swatch {
  border-color: #fff;
}

.boh-cam__chip-label {
  white-space: nowrap;
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

.boh-cam__shutter-row {
  display: flex;
  justify-content: center;
  padding-top: 6px;
}

.boh-cam__shutter {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 0;
  background: rgba(255, 255, 255, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.boh-cam__shutter span {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: #fff;
}

.boh-cam__shutter:disabled {
  opacity: 0.4;
  cursor: default;
}

.boh-cam__review {
  flex: none;
  display: flex;
  gap: 12px;
  padding: 12px 16px calc(20px + env(safe-area-inset-bottom));
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
</style>
