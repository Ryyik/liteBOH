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
import { Camera, ChevronLeft, ChevronRight, SwitchCamera, X } from 'lucide-vue-next';
import ImageEditorFilmFx from '@/views/Forum/components/ImageEditorFilmFx.vue';
import {
  useCameraStream,
  detectCameraBlocker,
  readCameraPermission,
} from '@/composables/useCameraStream.js';
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
  ins: 'INS',
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
/** 暂存的成片：{ id, file, url, stock } */
const shots = ref([]);
const isReviewOpen = ref(false);
/** 大图预览下标：-1 = 未打开 */
const previewIndex = ref(-1);
const previewShot = computed(() => shots.value[previewIndex.value] || null);

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

/**
 * 起不来的原因 → 文案。
 *
 * 分这么细的理由：这四种情况的**用户动作完全不同**，混成一句「相机不可用」
 * 等于把人晾在原地。
 *   insecure  → 换 https 地址（非安全上下文永远不会弹权限框）
 *   webview   → 换浏览器打开（微信内嵌内核不给摄像头）
 *   blocked   → 去站点设置改（浏览器已经记住「拒绝」，不会再弹窗）
 *   timeout   → 关掉别的用相机的 App 再试
 *   stalled   → 流拿到了但没有画面（autoplay 被拦），重试一次通常就好
 */
const UNAVAILABLE_TEXT = {
  unsupported: '这个浏览器没有开放摄像头接口，请用 Safari 或 Chrome 直接打开本站。',
  insecure:
    '当前地址不是 https，浏览器不会把摄像头交给网页。请用 https://www.blockofhome.cn 打开。',
  webview: '微信 / QQ 等内置浏览器不开放摄像头。点右上角「···」，选「在浏览器打开」。',
  denied:
    '摄像头权限被拒绝了。点「重试」再选一次「允许」；如果不再弹窗，就去浏览器的站点设置里把「相机」改成「允许」，然后刷新页面。',
  blocked:
    '摄像头权限被浏览器记住了「拒绝」，怎么点都不会再弹窗。请到「站点设置 → 相机」改成「允许」；如果那里本来就是允许，就再检查手机系统设置里 Safari / Chrome 的相机权限是不是被关掉了。改完刷新页面。',
  timeout: '相机一直没有响应。可能被别的应用占着，关掉它再点重试。',
  stalled: '摄像头已连上，但画面没有出来。点「重试」再要一次。',
  'in-use': '摄像头正被别的应用占用，关掉它再试。',
  'not-found': '没有找到可用的摄像头。',
  error: '相机启动失败，可以重试一次。',
};
const unavailableText = computed(
  () => UNAVAILABLE_TEXT[errorReason.value] || UNAVAILABLE_TEXT.error,
);
const canRetry = computed(
  () =>
    status.value === 'unavailable' &&
    !['unsupported', 'insecure', 'webview', 'blocked'].includes(errorReason.value),
);

/**
 * 「开机台」：取流之前的中转屏。
 *
 * ⚠️ 这是本页最重要的一处设计约束 —— **不能进页面就自动调 getUserMedia**。
 * iOS Safari 要求它发生在用户手势里（click / touchend 的同步调用栈）；
 * 放在 onMounted / setTimeout / Promise.then 里会被**静默拒绝**：不弹权限框、
 * 不报错给用户，只在控制台留一条 NotAllowedError。用户看到的就是黑屏。
 *
 * 所以默认落在这一屏，等一次真实点击。只有一种例外：`permissions` 已经明确
 * 是 granted —— 那一次调用不会弹窗，也就不需要手势。
 */
const gateOpen = computed(() => status.value === 'idle' && !blocker.value);
/** 静态预检结论（insecure / webview / unsupported，空串=没问题） */
const blocker = ref('');
const permissionState = ref('');

/**
 * 本次会话内「已经授权成功过」的记号。
 *
 * 为什么需要它：iOS Safari 对 `permissions.query({ name: 'camera' })` 支持不稳定，
 * 多数版本直接抛错（我们这边退化成 ''），于是每次进页面都会被当成「未授权」，
 * 让用户再点一次开机按钮 —— 这会变成无意义的重复劳动。
 *
 * 记住一次成功之后就能静默开：**已经授权的情况下不需要手势**，iOS 也不会再弹窗。
 * 万一缓存过期（用户后来撤销了权限），调用会失败并落到「被拒绝」文案，
 * 仍然是有说明的界面，不会退回黑屏。
 */
const GRANT_KEY = 'boh-camera-granted';
function readGrantCache() {
  try {
    return window.sessionStorage.getItem(GRANT_KEY) === '1';
  } catch {
    return false;
  }
}
function writeGrantCache(value) {
  try {
    if (value) window.sessionStorage.setItem(GRANT_KEY, '1');
    else window.sessionStorage.removeItem(GRANT_KEY);
  } catch {
    /* 隐私模式下 sessionStorage 会抛，忽略即可 */
  }
}

/* ── 流绑定 ──────────────────────────────────────────────────────────── */
/**
 * 「有流但没有画面」的兜底。
 *
 * 授权给了、`status` 也是 live、`<video>` 却一直是黑的 —— 真实存在，两种成因：
 *   · `play()` 被自动播放策略拦下（不在手势调用栈里 play，或用户开了低电量模式）
 *   · 轨道拿到了但一直没有首帧（部分安卓机型首帧要几百毫秒，个别机型永远不来）
 * 这时候界面和「没有权限」长得一模一样，用户只会说「黑屏」。所以给死线：
 * 3.5s 内 `videoWidth` 还是 0 就转成可重试的错误态，并给出对应文案。
 */
let frameWatchdog = 0;
function armFrameWatchdog() {
  window.clearTimeout(frameWatchdog);
  frameWatchdog = window.setTimeout(() => {
    if (status.value !== 'live') return;
    const video = videoRef.value;
    if (video && video.videoWidth > 0) return;
    errorReason.value = 'stalled';
    status.value = 'unavailable';
    stop();
  }, 3500);
}

watch(
  stream,
  async (current) => {
    const video = videoRef.value;
    if (!video) return;
    if (video.srcObject !== current) video.srcObject = current || null;
    if (!current) {
      window.clearTimeout(frameWatchdog);
      return;
    }
    armFrameWatchdog();
    // 首帧到了就撤掉死线（loadeddata 比轮询可靠，也不会漏掉 play() 结算后才有帧的情况）
    video.addEventListener('loadeddata', () => window.clearTimeout(frameWatchdog), {
      once: true,
    });
    // iOS 上这行偶发抛 NotAllowedError（同一路流二次 play），不 catch 会冒到全局
    try {
      await video.play();
    } catch {
      /* 不在这里判死：play() 抛错也偶有「其实有画面」的情况，交给上面的死线 */
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

/** 飞行副本的边长，与片位卡片完全一致 */
const FLY_SIZE = 46;

/**
 * 过片动效。
 *
 * ⚠️ 副本是 `document.createElement` 建的，**scoped CSS 对它无效** ——
 * Vue 的 `data-v-*` 属性只在模板编译时写入，动态创建的元素没有它，
 * 选择器匹配不上。所以尺寸 / 定位 / 外观**必须全部走内联样式**。
 *
 * 这一条踩过：`.boh-cam__fly { width: 46px }` 完全不生效，`<img>` 按整屏宽
 * 渲染、`left/top` 也不生效 ⇒ 用户看到的是"屏幕左边闪过一片画面"，
 * 而不是"一张小卡飞进口袋"。探针现在会断言真实宽度，别再退回 CSS。
 *
 * 落点是**最新那张卡片的中心**（不能用 stack 容器：卡片在容器里左上对齐，
 * 容器 52px、卡片 46px，两者中心不重合）。
 */
function playFilmAdvance(url) {
  const layer = flyLayerRef.value;
  const shutter = shutterRef.value;
  const stack = stackRef.value;
  if (reducedMotion || !layer || !shutter || !stack) return;

  const cards = stack.querySelectorAll('.boh-cam__stack-card');
  const card = cards[cards.length - 1] || stack;
  const base = layer.getBoundingClientRect();
  const from = shutter.getBoundingClientRect();
  const to = card.getBoundingClientRect();
  if (!from.width || !to.width) return;

  const half = FLY_SIZE / 2;
  const fromX = from.left + from.width / 2;
  const fromY = from.top + from.height / 2;
  const toX = to.left + to.width / 2;
  const toY = to.top + to.height / 2;

  const el = document.createElement('img');
  el.className = 'boh-cam__fly';
  el.src = url;
  el.alt = '';
  Object.assign(el.style, {
    position: 'absolute',
    left: `${fromX - base.left - half}px`,
    top: `${fromY - base.top - half}px`,
    width: `${FLY_SIZE}px`,
    height: `${FLY_SIZE}px`,
    borderRadius: '9px',
    objectFit: 'cover',
    border: '1.5px solid rgba(255, 255, 255, 0.9)',
    boxShadow: '0 10px 22px -8px rgba(0, 0, 0, 0.85)',
    willChange: 'transform',
  });
  layer.appendChild(el);

  const dx = toX - fromX;
  const dy = toY - fromY;

  /* 位移和「缩放/旋转」拆成两个动画。
   *
   * 为什么拆：位移必须是一条**速率可控**的曲线。把 scale/rotate 塞进同一个
   * keyframes 就多出中间帧，easing 会被中间帧的 offset 切碎 —— 试过四段，
   * 中段出现 150ms 位移停滞（实测 x 从 93 到 83），看起来是「飞一半卡住再掉」。
   *
   * 为什么用 cubic-bezier(.33,.33,.4,1)：实测旧曲线 (.16,.86,.28,1) 在 15%
   * 的时间点就走完 59% 的位移 ⇒ 人眼直接读成「闪一下」。这条曲线在
   * 15/30/45/60% 时间点分别是 19/46/70/86%，全程都在动，末段自然减速。
   *
   * duration：480ms。430ms 配 160px 的位移信息量不足，480ms 仍不拖沓。
   */
  const FLY_MS = 480;
  const move = el.animate(
    [{ transform: 'translate(0px, 0px)' }, { transform: `translate(${dx}px, ${dy}px)` }],
    { duration: FLY_MS, easing: 'cubic-bezier(.33,.33,.4,1)', fill: 'forwards' },
  );
  // 甩出去时略微缩小并倾斜，落位时轻轻弹一下 —— 这是「过片」的机械感来源
  const settle = el.animate(
    [
      { scale: '1', rotate: '0deg' },
      { scale: '0.86', rotate: '-7deg', offset: 0.5 },
      { scale: '1.02', rotate: '1deg', offset: 0.86 },
      { scale: '1', rotate: '0deg' },
    ],
    { duration: FLY_MS, fill: 'forwards' },
  );
  const drop = () => el.remove();
  Promise.all([move.finished, settle.finished]).then(drop, drop);
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
  // 预览开着时同步收口：删掉的在它前面就整体前移；删的是它自己就让下一张顶上来
  if (previewIndex.value >= 0) {
    if (!shots.value.length) previewIndex.value = -1;
    else if (index < previewIndex.value) previewIndex.value -= 1;
    else previewIndex.value = Math.min(previewIndex.value, shots.value.length - 1);
  }
  if (!shots.value.length) isReviewOpen.value = false;
}

/* ── 大图预览 ────────────────────────────────────────────────────────── */
function openPreview(index) {
  if (index < 0 || index >= shots.value.length) return;
  previewIndex.value = index;
}

function closePreview() {
  previewIndex.value = -1;
}

function stepPreview(delta) {
  if (!previewShot.value) return;
  const next = previewIndex.value + delta;
  if (next < 0 || next >= shots.value.length) return;
  previewIndex.value = next;
}

function removePreviewShot() {
  if (!previewShot.value) return;
  removeShot(previewShot.value.id);
}

let previewPointer = null;
function onPreviewDown(event) {
  previewPointer = { x: event.clientX, y: event.clientY };
}
function onPreviewUp(event) {
  if (!previewPointer) return;
  const dx = event.clientX - previewPointer.x;
  const dy = event.clientY - previewPointer.y;
  previewPointer = null;
  // 横向要够远、且明显大于纵向：否则会和上下拖动抢
  if (Math.abs(dx) < 44 || Math.abs(dx) <= Math.abs(dy)) return;
  stepPreview(dx < 0 ? 1 : -1);
}
function onPreviewKeydown(event) {
  if (previewIndex.value < 0) return;
  if (event.key === 'Escape') {
    closePreview();
    return;
  }
  if (event.key === 'ArrowLeft') stepPreview(-1);
  else if (event.key === 'ArrowRight') stepPreview(1);
}

/* ── 存到本地 ────────────────────────────────────────────────────────── */
const isSaving = ref(false);
/** 保存成功后的短暂文案反馈（1.8s 复原），没有全局 toast 就用按钮自己说话 */
const saveFlash = ref(false);
let saveFlashTimer = 0;

/**
 * 存到本地。
 *
 * 两条通道，**优先系统分享**：`navigator.share({ files })` 在 iOS / 安卓都会
 * 弹系统面板，用户选「存储图像」就真进相册了 —— 这是 Web 上唯一能进相册的路径。
 * 不支持时才退回 `<a download>`（落进「下载 / 文件」，iOS 叫「存储到文件」）。
 *
 * ⚠️ `share()` 必须在用户手势里**同步**发起。所以这里不做任何 await 前置，
 * 文件从 shots 里同步取；先 await 别的东西再调，Safari 会直接拒绝。
 *
 * 文件名统一重建成「卷名-序号」，否则一批存下来全是 boh-camera-edited.jpg，
 * 用户在相册里根本分不清哪张是哪张。
 */
async function saveShotsToDevice(list, offset = 0) {
  if (!list.length) return;
  const files = list.map((shot, index) => {
    const stock = (shot.stock || 'BOH').replace(/[^A-Za-z0-9]+/g, '').slice(0, 12) || 'BOH';
    const name = `${stock}-${padNo(offset + index + 1)}.jpg`;
    try {
      return new File([shot.file], name, { type: shot.file.type || 'image/jpeg' });
    } catch {
      return shot.file;
    }
  });
  if (typeof navigator.canShare === 'function' && typeof navigator.share === 'function') {
    if (navigator.canShare({ files })) {
      try {
        // share() 在用户把面板划走、或系统不响应时**可能永不 resolve**
        // （实测：按钮会一直停在 disabled）。这里加超时兜底，
        // 超时按「已交给系统」处理、不再退回下载，避免重复存一遍。
        await Promise.race([
          navigator.share({ files }),
          new Promise((resolve) => window.setTimeout(resolve, 15000)),
        ]);
        return;
      } catch (error) {
        // 用户自己取消：别再偷偷退回下载（会突然开始存文件）
        if (error?.name === 'AbortError') return;
        // 其他错误（部分安卓机型对 files 报 NotSupportedError）继续走下载
      }
    }
  }
  files.forEach((file) => {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name || 'boh-camera.jpg';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    // 立刻 revoke 会让部分浏览器的下载中断，留一段时间
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
}

function flashSaved() {
  saveFlash.value = true;
  window.clearTimeout(saveFlashTimer);
  saveFlashTimer = window.setTimeout(() => {
    saveFlash.value = false;
  }, 1800);
}

/** 整批存到本地。**不清空暂存** —— 想「既存又传」的用户接着点完成就行 */
async function saveAllShots() {
  if (!shots.value.length || isSaving.value) return;
  isSaving.value = true;
  try {
    await saveShotsToDevice(shots.value, 0);
    flashSaved();
  } finally {
    isSaving.value = false;
  }
}

async function savePreviewShot() {
  if (!previewShot.value || isSaving.value) return;
  isSaving.value = true;
  try {
    await saveShotsToDevice([previewShot.value], previewIndex.value);
    flashSaved();
  } finally {
    isSaving.value = false;
  }
}

function releaseAllShots() {
  for (const shot of shots.value) URL.revokeObjectURL(shot.url);
  shots.value = [];
  isReviewOpen.value = false;
  previewIndex.value = -1;
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

/**
 * 用户点「开启相机」——**这必须是调用 getUserMedia 的唯一入口**。
 * 这里处在 click 的同步调用栈里，iOS 才会正常弹权限框。
 */
async function beginCamera() {
  const media = await start();
  if (!media) {
    // 明确被拒就把缓存清掉，下次别自作聪明地静默重试
    if (errorReason.value === 'denied' || errorReason.value === 'blocked') writeGrantCache(false);
    return;
  }
  writeGrantCache(true);
  // 权限刚被允许：把状态回读一次，后续「重试」才知道该不该提「去设置里改」
  permissionState.value = await readCameraPermission();
}

/** 站点设置改完必须刷新才生效（iOS Safari 尤其如此） */
function reloadPage() {
  if (typeof window !== 'undefined') window.location.reload();
}

/** 内置浏览器里没法直接「在浏览器打开」，只能把地址递出去 */
const linkCopied = ref(false);
async function copyLink() {
  const url = 'https://www.blockofhome.cn/#/user-space/note/camera';
  try {
    await navigator.clipboard.writeText(url);
    linkCopied.value = true;
  } catch {
    // 老 WebView 常常没有 clipboard：退回到手选
    window.prompt('复制这个地址到浏览器打开：', url);
  }
}

onMounted(async () => {
  observeFrame();
  window.addEventListener('keydown', onPreviewKeydown);

  // 第一层：静态预检。这三类问题不会弹窗、也不因用户允许而好转，
  // 所以连 getUserMedia 都不该调 —— 直接给准确原因。
  blocker.value = detectCameraBlocker();
  if (blocker.value) {
    status.value = 'unavailable';
    errorReason.value = blocker.value;
    return;
  }

  // 第二层：已经授权过就直接开（不会弹窗，也就不需要手势）。
  // 其余情况（prompt / 读不到）一律停在「开机台」等一次真实点击。
  permissionState.value = await readCameraPermission();
  if (permissionState.value === 'denied') {
    // 浏览器已经记住「拒绝」，再调只会立刻失败且不弹窗 —— 直接说清怎么改
    writeGrantCache(false);
    status.value = 'unavailable';
    errorReason.value = 'blocked';
    return;
  }
  // granted，或本会话内成功过（iOS 读不到 permissions 的兜底）→ 静默开
  if (permissionState.value === 'granted' || readGrantCache()) {
    const media = await start();
    // 缓存过期（用户后来撤销了权限）：别装作没事，落到明确文案上
    if (!media && (errorReason.value === 'denied' || errorReason.value === 'blocked')) {
      writeGrantCache(false);
    }
    return;
  }
  // 否则停在 gateOpen（status 仍是 idle），等用户点「开启相机」
});

onBeforeUnmount(() => {
  frameObserver?.disconnect();
  frameObserver = null;
  window.clearTimeout(frameWatchdog);
  if (focusTimer) window.clearTimeout(focusTimer);
  focusTimer = null;
  window.clearTimeout(saveFlashTimer);
  window.removeEventListener('keydown', onPreviewKeydown);
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
        <!-- 有画面之后才有意义：取流前显示「数码变焦」是没依据的断言 -->
        <div v-if="status === 'live'" class="boh-cam__zoom" aria-label="变焦">
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

        <!-- 开机台：取流前的中转屏。任何自动取流都会在 iOS 上被静默拒绝，-->
        <!-- 所以第一次 getUserMedia 必须由这里的点击触发（见 beginCamera）。 -->
        <div v-if="gateOpen" class="boh-cam__gate" data-testid="camera-gate">
          <p class="boh-cam__gate-kicker">BOH CAMERA</p>
          <h1 class="boh-cam__gate-title">点一下，开启取景器</h1>
          <p class="boh-cam__gate-sub">首次会请求摄像头权限。画面只在本机实时处理，不上传。</p>
          <button type="button" class="boh-cam__gate-btn" @click="beginCamera">
            <Camera :size="18" :stroke-width="1.9" aria-hidden="true" />
            开启相机
          </button>
          <p class="boh-cam__gate-hint">
            没反应？确认是用 Safari / Chrome 打开，且没有在无痕模式下禁用摄像头。
          </p>
        </div>

        <div v-if="status === 'unavailable'" class="boh-cam__fallback" role="alert">
          <p>{{ unavailableText }}</p>
          <div class="boh-cam__fallback-actions">
            <button v-if="canRetry" type="button" class="boh-cam__retry" @click="beginCamera">
              重试
            </button>
            <!-- 改完站点设置后刷新才会重新走一遍权限判定，给一个明确的下一步 -->
            <button
              v-if="errorReason === 'blocked' || errorReason === 'denied'"
              type="button"
              class="boh-cam__retry"
              :class="{ 'is-secondary': canRetry }"
              @click="reloadPage"
            >
              我已改好，刷新页面
            </button>
            <!-- 内置浏览器里没有「在浏览器打开」这种能力，只能把地址复制出去 -->
            <button
              v-if="errorReason === 'webview'"
              type="button"
              class="boh-cam__retry"
              @click="copyLink"
            >
              {{ linkCopied ? '已复制，去浏览器粘贴' : '复制本站链接' }}
            </button>
          </div>
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
            <!-- 点图放大：选片要看清细节才敢删 -->
            <button
              type="button"
              class="boh-cam__review-open"
              :aria-label="`查看第 ${index + 1} 张`"
              @click="openPreview(index)"
            >
              <img :src="shot.url" alt="" draggable="false" />
              <figcaption class="boh-cam__review-cap">
                {{ shot.stock || stockName }} · {{ padNo(index + 1) }}
              </figcaption>
            </button>
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
          <button
            type="button"
            class="boh-cam__ghost"
            :disabled="isSaving"
            data-testid="camera-save-all"
            @click="saveAllShots"
          >
            {{ saveFlash ? '已存到本地' : '存到本地' }}
          </button>
          <button type="button" class="boh-cam__ghost" @click="isReviewOpen = false">继续拍</button>
          <button type="button" class="boh-cam__primary" @click="finish">
            完成（{{ shots.length }}）
          </button>
        </footer>
      </div>
    </Transition>

    <!-- 大图预览：看细节 / 左右切换 / 删除 / 存到本地 -->
    <Transition name="boh-cam-fade">
      <div
        v-if="previewShot"
        class="boh-cam__preview"
        role="dialog"
        aria-modal="true"
        aria-label="查看照片"
        data-testid="camera-preview"
        @click.self="closePreview"
        @pointerdown="onPreviewDown"
        @pointerup="onPreviewUp"
      >
        <img
          class="boh-cam__preview-img"
          :src="previewShot.url"
          alt="拍到的照片"
          draggable="false"
        />

        <header class="boh-cam__preview-head">
          <span class="boh-cam__preview-count">{{ previewIndex + 1 }} / {{ shots.length }}</span>
          <button
            type="button"
            class="boh-cam__preview-close"
            aria-label="收起大图"
            data-testid="camera-preview-close"
            @click="closePreview"
          >
            <X :size="18" :stroke-width="2" aria-hidden="true" />
          </button>
        </header>

        <button
          v-if="previewIndex > 0"
          type="button"
          class="boh-cam__preview-nav is-prev"
          aria-label="上一张"
          @click.stop="stepPreview(-1)"
        >
          <ChevronLeft :size="22" :stroke-width="1.8" aria-hidden="true" />
        </button>
        <button
          v-if="previewIndex < shots.length - 1"
          type="button"
          class="boh-cam__preview-nav is-next"
          aria-label="下一张"
          @click.stop="stepPreview(1)"
        >
          <ChevronRight :size="22" :stroke-width="1.8" aria-hidden="true" />
        </button>

        <footer class="boh-cam__preview-foot">
          <span class="boh-cam__preview-cap">
            {{ previewShot.stock || stockName }} · {{ padNo(previewIndex + 1) }}
          </span>
          <div class="boh-cam__preview-actions">
            <button
              type="button"
              class="boh-cam__ghost"
              :disabled="isSaving"
              data-testid="camera-preview-save"
              @click.stop="savePreviewShot"
            >
              {{ saveFlash ? '已保存' : '存到本地' }}
            </button>
            <button type="button" class="boh-cam__ghost is-danger" @click.stop="removePreviewShot">
              删除这张
            </button>
            <button type="button" class="boh-cam__primary" @click.stop="finish">
              完成（{{ shots.length }}）
            </button>
          </div>
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

/* ── 开机台 ──────────────────────────────────────────────────────────────
 * 不是错误页，是「取景器还没通电」。所以用取景器的语言：暗底、字距拉开的
 * 小标、银色按钮（与银圈快门同色系），不用红色告警色。
 * 这一屏存在的唯一理由是拿到一次真实点击 —— 它是权限弹窗的前提。 */
.boh-cam__gate {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 32px 30px;
  text-align: center;
  background: radial-gradient(120% 80% at 50% 34%, #1b1b1f 0%, #0b0b0c 62%);
}

.boh-cam__gate-kicker {
  margin: 0;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.32em;
  color: rgba(255, 255, 255, 0.42);
}

.boh-cam__gate-title {
  margin: 6px 0 0;
  font-size: 20px;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: #f5f5f7;
}

.boh-cam__gate-sub {
  margin: 0;
  max-width: 260px;
  font-size: 12.5px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.5);
}

.boh-cam__gate-btn {
  margin-top: 14px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 46px;
  padding: 0 26px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(180deg, #fdfdfb 0%, #d8d8d2 100%);
  color: #14141a;
  font-size: 14.5px;
  font-weight: 500;
  letter-spacing: 0.02em;
  cursor: pointer;
  box-shadow: 0 10px 26px -12px rgba(0, 0, 0, 0.9);
  transition: transform 140ms ease;
}

.boh-cam__gate-btn:active {
  transform: scale(0.97);
}

.boh-cam__gate-hint {
  margin: 10px 0 0;
  max-width: 268px;
  font-size: 11px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.3);
}

.boh-cam__fallback-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

/* 次要动作：与主「重试」并列时不能抢眼，否则用户会先点刷新、又跑一遍权限流程 */
.boh-cam__retry.is-secondary {
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.9);
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

/* ── 大图预览 ────────────────────────────────────────────────────────── */
.boh-cam__preview {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  background: #000;
  /* 横向滑动自己判定，纵向留给系统 */
  touch-action: pan-y;
}

.boh-cam__preview-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}

.boh-cam__preview-head {
  position: absolute;
  top: calc(8px + env(safe-area-inset-top));
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
}

.boh-cam__preview-count {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
  font-family: var(--boh-cam-mono);
  font-size: 12px;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.82);
}

.boh-cam__preview-close {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(6px);
}

.boh-cam__preview-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(6px);
}

.boh-cam__preview-nav.is-prev {
  left: 8px;
}

.boh-cam__preview-nav.is-next {
  right: 8px;
}

.boh-cam__preview-foot {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(12px + env(safe-area-inset-bottom));
  padding: 0 16px;
}

.boh-cam__preview-cap {
  display: block;
  margin-bottom: 10px;
  text-align: center;
  font-family: var(--boh-cam-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: rgba(255, 255, 255, 0.62);
}

.boh-cam__preview-actions {
  display: flex;
  gap: 12px;
}

.boh-cam__ghost.is-danger {
  border-color: rgba(255, 130, 110, 0.42);
  color: #ff9f90;
}

/* ── 过片飞行层 ──────────────────────────────────────────────────────── */
/* 飞行副本的样式写在 playFilmAdvance() 的内联 style 里，不在这里：
   副本是 createElement 建的，没有 data-v-* 属性，scoped 选择器对它无效。
   曾经在这里写过 .boh-cam__fly { width: 46px }，实测完全不生效（img 撑成
   整屏宽），所以别把样式搬回来 —— 加了也是死的。 */
.boh-cam__fly-layer {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
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

/* 缩略图本身是按钮：点开大图看细节（cursor 用 zoom-in 提示可放大） */
.boh-cam__review-open {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  cursor: zoom-in;
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
