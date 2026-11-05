<template>
  <Teleport to="body">
    <Transition name="imgedit-fade">
      <div
        v-if="visible"
        class="imgedit-overlay"
        role="dialog"
        aria-modal="true"
        :aria-label="view === 'confirm' ? '确认所选图片' : '编辑图片'"
      >
        <!-- ══ 确认页（流法 C）：选完图先横滑过一遍，确认才回填网格并启动管线 ══ -->
        <section v-if="view === 'confirm'" class="imgedit-card is-confirm">
          <header class="imgedit-head">
            <button type="button" class="imgedit-pill" @click="emit('close')">取消</button>
            <span class="imgedit-title">确认图片</span>
            <button
              type="button"
              class="imgedit-pill is-primary"
              :disabled="isBusy || !entries.length"
              @click="handleConfirmAll"
            >
              全部确认{{ entries.length ? `（${entries.length}）` : '' }}
            </button>
          </header>

          <div ref="swipeRef" class="imgedit-swipe" @scroll.passive="syncActiveIndex">
            <figure v-for="(entry, index) in entries" :key="entry.id" class="imgedit-slide">
              <img :src="entry.previewUrl" :alt="`第 ${index + 1} 张待确认图片`" decoding="async" />
              <figcaption v-if="entry.edited" class="imgedit-slide-tag">已编辑</figcaption>
            </figure>
            <p v-if="!entries.length" class="imgedit-empty">没有待确认的图片</p>
          </div>

          <footer class="imgedit-confirm-foot">
            <!-- 左右翻页按钮：显式的「下一张」入口。横滑仍然可用，但不再依赖它 ——
                 从首张向右滑会撞到浏览器/iOS 的边缘返回手势，把整个编辑器带走。 -->
            <div class="imgedit-pager">
              <button
                v-if="entries.length > 1"
                type="button"
                class="imgedit-page-btn"
                :disabled="activeIndex <= 0"
                aria-label="上一张"
                @click="goToSlide(activeIndex - 1)"
              >
                <ChevronLeft :size="18" :stroke-width="2.2" aria-hidden="true" />
              </button>
              <div class="imgedit-dots">
                <button
                  v-for="(entry, index) in entries"
                  :key="entry.id"
                  type="button"
                  class="imgedit-dot"
                  :class="{ 'is-on': index === activeIndex }"
                  :aria-label="`查看第 ${index + 1} 张`"
                  @click="goToSlide(index)"
                ></button>
              </div>
              <button
                v-if="entries.length > 1"
                type="button"
                class="imgedit-page-btn"
                :disabled="activeIndex >= entries.length - 1"
                aria-label="下一张"
                @click="goToSlide(activeIndex + 1)"
              >
                <ChevronRight :size="18" :stroke-width="2.2" aria-hidden="true" />
              </button>
            </div>
            <div class="imgedit-actionbar">
              <button
                type="button"
                class="imgedit-action"
                :disabled="isBusy || !activeEntry"
                @click="activeEntry && openEditor(activeEntry)"
              >
                编辑本张
              </button>
              <button
                type="button"
                class="imgedit-action is-danger"
                :disabled="isBusy || !activeEntry"
                @click="activeEntry && removeEntry(activeEntry)"
              >
                移除
              </button>
            </div>
          </footer>
        </section>

        <!-- ══ 编辑器：分层非破坏编辑（裁切 / 旋转 / 滤镜 / 贴纸） ══ -->
        <section v-else class="imgedit-card is-editor">
          <header class="imgedit-head">
            <button type="button" class="imgedit-pill" @click="handleEditorCancel">
              {{ mode === 'confirm' ? '返回' : '取消' }}
            </button>
            <span class="imgedit-title">编辑图片</span>
            <button
              type="button"
              class="imgedit-pill is-primary"
              :disabled="isBusy || isLoadingEditor || Boolean(editorError)"
              @click="handleEditorDone"
            >
              {{ isExporting ? '处理中…' : '完成' }}
            </button>
          </header>

          <div ref="stageRef" class="imgedit-stage">
            <!-- 裁切工具：cropper 负责框选，滤镜用 CSS 预览（与导出同一根串） -->
            <div
              v-if="activeTool === 'crop'"
              class="imgedit-crop-layer"
              :style="[photoBoxStyle, { filter: currentFilterCss }]"
            >
              <Cropper
                v-if="editor.previewUrl"
                ref="cropperRef"
                class="imgedit-cropper"
                :src="editor.previewUrl"
                :stencil-props="{ aspectRatio: null }"
                :default-size="fullImageDefaultSize"
                :default-position="fullImageDefaultPosition"
              />
            </div>

            <!-- 非裁切工具：照片满铺 + 贴纸浮层（用 DOM 摆位，拖动零重渲染） -->
            <template v-else-if="editor.previewUrl">
              <img
                ref="photoImgRef"
                class="imgedit-photo"
                :src="stickerBaseUrl || editor.previewUrl"
                :style="{ filter: currentFilterCss }"
                alt="正在编辑的图片"
                decoding="async"
                @load="syncPhotoBox"
              />
              <div
                v-if="activeTool === 'sticker'"
                class="imgedit-sticker-layer"
                :style="photoBoxStyle"
              >
                <div
                  v-for="sticker in liveStickers"
                  :key="sticker.id"
                  class="imgedit-sticker"
                  :class="{ 'is-active': sticker.id === selectedStickerId }"
                  :style="stickerStyle(sticker)"
                  @pointerdown="beginStickerDrag($event, sticker)"
                >
                  <img :src="sticker.asset" alt="" aria-hidden="true" draggable="false" />
                  <button
                    type="button"
                    class="imgedit-sticker-del"
                    aria-label="删除这枚贴纸"
                    @pointerdown.stop
                    @click.stop="removeSticker(sticker)"
                  >
                    ×
                  </button>
                  <span
                    class="imgedit-sticker-handle"
                    aria-hidden="true"
                    @pointerdown.stop="beginStickerResize($event, sticker)"
                  ></span>
                </div>
              </div>
            </template>

            <div v-if="isLoadingEditor" class="imgedit-stage-note">正在载入图片…</div>
            <div v-else-if="editorError" class="imgedit-stage-note is-error">{{ editorError }}</div>
          </div>

          <!-- 工具面板：随选中的工具切换（玻璃 sheet，和发帖器的弹出层同一材质） -->
          <div v-if="activeTool === 'rotate'" class="imgedit-sheet">
            <div class="imgedit-sheet-row">
              <button
                type="button"
                class="imgedit-sheet-btn"
                :disabled="toolBusy"
                @click="handleRotate('ccw')"
              >
                左转 90°
              </button>
              <button
                type="button"
                class="imgedit-sheet-btn"
                :disabled="toolBusy"
                @click="handleRotate('cw')"
              >
                右转 90°
              </button>
              <button
                type="button"
                class="imgedit-sheet-btn"
                :disabled="toolBusy"
                @click="handleFlip"
              >
                水平翻转
              </button>
            </div>
          </div>

          <div v-else-if="activeTool === 'filter'" class="imgedit-sheet">
            <div class="imgedit-chips" role="radiogroup" aria-label="滤镜">
              <button
                v-for="preset in filters"
                :key="preset.id"
                type="button"
                class="imgedit-chip"
                :class="{ 'is-on': preset.id === currentFilterId }"
                role="radio"
                :aria-checked="preset.id === currentFilterId"
                @click="applyFilter(preset.id)"
              >
                <img
                  v-if="chipThumbUrl"
                  class="imgedit-chip-thumb"
                  :src="chipThumbUrl"
                  :style="{ filter: filterStringOf(preset.id) }"
                  alt=""
                  aria-hidden="true"
                />
                <span
                  v-else
                  class="imgedit-chip-thumb"
                  :style="{ background: preset.swatch }"
                ></span>
                <span class="imgedit-chip-label">{{ preset.label }}</span>
              </button>
            </div>
          </div>

          <div v-else-if="activeTool === 'sticker'" class="imgedit-sheet">
            <div class="imgedit-chips" aria-label="贴纸">
              <button
                v-for="sticker in stickers"
                :key="sticker.id"
                type="button"
                class="imgedit-chip is-sticker"
                :aria-label="`添加${sticker.label}`"
                @click="addSticker(sticker)"
              >
                <img :src="sticker.src" alt="" aria-hidden="true" />
              </button>
            </div>
            <p class="imgedit-sheet-hint">
              点猫猫贴到图上，拖动移动、右下角缩放；贴纸会挡住后面的画面
            </p>
          </div>

          <footer class="imgedit-toolbar" aria-label="图片编辑工具">
            <button
              v-for="tool in tools"
              :key="tool.id"
              type="button"
              class="imgedit-tool"
              :class="{ 'is-on': activeTool === tool.id }"
              :disabled="toolBusy"
              @click="selectTool(tool.id)"
            >
              <component :is="tool.icon" :size="20" :stroke-width="1.9" aria-hidden="true" />
              <span>{{ tool.label }}</span>
            </button>
            <button
              type="button"
              class="imgedit-tool"
              :disabled="!canUndo || toolBusy"
              @click="handleUndo"
            >
              <Undo2 :size="20" :stroke-width="1.9" aria-hidden="true" />
              <span>撤销</span>
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
/**
 * 发帖图片编辑器（2026-11-05：P0 骨架 + 滤镜 + 猫贴纸遮挡，UI 对齐发帖器）。
 *
 * 两种宿主形态（由 mode 决定）：
 *  · confirm —— 系统面板选图后的**确认页**：一屏一张大图横滑 + 底栏「编辑/移除」
 *    +「全部确认」。确认前不进 PostComposer 的上传管线（零浪费零竞态：编辑
 *    全部发生在上传前）；确认后由宿主 emit image-selection 走既有管线。
 *  · edit —— 从网格缩略图画笔角标再进入的**单图编辑**：产物交给宿主撤销在途
 *    上传并重启管线（发布快照 url 归一已有，见 useForumDraftImagePipelines）。
 *
 * 视觉口径：与 PostComposer 同一套材质语言 —— 液态玻璃卡（--liquid-*）+ 胶囊
 * 按钮 + 深色主操作（发帖器的「发布」是 #111827，不是主操作蓝）+ 玻璃工具条。
 * 这是 2026-11-05 用户口径「不契合发帖器」之后的返工：上一版是浅灰不透明满屏
 * + 内嵌黑舞台 + 三个灰方块，等于换了个 App。
 *
 * 渲染分工（关键，别合并）：
 *  · 像素事实在 utils/image-editor-export.js（几何折叠 + 贴纸合成 + 导出编码）
 *  · 命令语义在 composables/useImageEditorDoc.js（归一化坐标 / 撤销 / 贴纸 fold）
 *  · 滤镜是**纯 CSS**：预览把它挂在 img 上、导出时同一根串喂 ctx.filter ⇒
 *    切滤镜零重渲染。这样也保证「所见即所得」不会因为两次编码跑偏。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  ChevronLeft,
  ChevronRight,
  Crop,
  RotateCw,
  Sparkles,
  Sticker,
  Undo2,
} from 'lucide-vue-next';
import { Cropper } from 'vue-advanced-cropper';
import 'vue-advanced-cropper/dist/style.css';
import { useBodyScrollLock } from '@/composables/useBodyScrollLock.js';
import {
  canvasToObjectUrl,
  createWorkingSource,
  exportCanvasToJpegFile,
  renderDocToCanvas,
} from '@/utils/image-editor-export.js';
import {
  clampNormalizedRect,
  foldStickers,
  isFullRect,
  resolveFilterId,
  useImageEditorDoc,
} from '../composables/useImageEditorDoc.js';
import {
  getEditorFilterString,
  IMAGE_EDITOR_FILTERS,
} from '../composables/image-editor-filters.js';
import {
  EDITOR_STICKER_DEFAULT_SIZE,
  EDITOR_STICKERS,
  getLoadedStickerImages,
  preloadEditorStickers,
} from '../composables/image-editor-stickers.js';

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** confirm = 选图确认页（内部可进编辑器再返回）；edit = 网格单图再编辑 */
  mode: { type: String, default: 'confirm' },
  /** confirm 模式：本次选中的全部文件；edit 模式：[待编辑文件] */
  files: { type: Array, default: () => [] },
});

const emit = defineEmits(['close', 'confirm', 'save']);

const filters = IMAGE_EDITOR_FILTERS;
const stickers = EDITOR_STICKERS;

const tools = [
  { id: 'crop', label: '裁切', icon: Crop },
  { id: 'rotate', label: '旋转', icon: RotateCw },
  { id: 'filter', label: '滤镜', icon: Sparkles },
  { id: 'sticker', label: '贴纸', icon: Sticker },
];

const view = ref('confirm');
const entries = ref([]);
const activeIndex = ref(0);
const editingId = ref(null);
const activeTool = ref('crop');
const isExporting = ref(false);
const isLoadingEditor = ref(false);
const editorError = ref('');
const cropperRef = ref(null);
const stageRef = ref(null);
const photoImgRef = ref(null);
const swipeRef = ref(null);
const stickerBaseUrl = ref('');
const liveStickers = ref([]);
const selectedStickerId = ref('');
const photoBox = reactive({ left: 0, top: 0, width: 0, height: 0 });
let photoObserver = null;

const isBusy = computed(() => isExporting.value);
const toolBusy = computed(() => isBusy.value || isLoadingEditor.value);
const editingEntry = computed(
  () => entries.value.find((entry) => entry.id === editingId.value) || null,
);
const activeEntry = computed(() => entries.value[activeIndex.value] || null);

const editor = reactive({
  source: null,
  previewUrl: '',
  previewWidth: 0,
  previewHeight: 0,
});

const { commands, canUndo, pushCommand, undo, reset } = useImageEditorDoc();

const currentFilterId = computed(() => resolveFilterId(commands.value));
const currentFilterCss = computed(() => getEditorFilterString(currentFilterId.value));
const filterStringOf = (id) => getEditorFilterString(id);
/** 滤镜 chip 的缩略图：贴纸工具下预览图是「含贴纸」的旧帧，要用底图代替。 */
const chipThumbUrl = computed(() =>
  activeTool.value === 'sticker' ? stickerBaseUrl.value || editor.previewUrl : editor.previewUrl,
);
const photoBoxStyle = computed(() => ({
  left: `${photoBox.left}px`,
  top: `${photoBox.top}px`,
  width: `${photoBox.width}px`,
  height: `${photoBox.height}px`,
}));

/* ⚠️ cropper 默认裁切框是「中心 80%×80%」而非整幅 —— 不覆写的话，用户没动框、
   点一下「旋转」就会被当成 pending crop 固化，每转一次悄悄裁掉 10% 边。
   覆写成「默认整幅」后，commitPendingCrop 的 isFullRect 判定才成立：
   框没动过 = 无 crop 命令 = 旋转/翻转是纯刚体变换。 */
const fullImageDefaultSize = ({ imageSize }) => ({
  width: Number(imageSize?.width) || 0,
  height: Number(imageSize?.height) || 0,
});
const fullImageDefaultPosition = () => ({ left: 0, top: 0 });

const revokePreviewUrl = (url) => {
  const target = String(url || '').trim();
  if (!target || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
  try {
    URL.revokeObjectURL(target);
  } catch {
    /* ignore */
  }
};

/**
 * ⚠️ 预览 URL 不能「换新即 revoke 旧」：cropper 正在解码的 <img> 一旦被抽掉，
 * 它的 imageSize 会永久停在 0 ⇒ 裁切工具里整张图变成 0×0（2026-11-05 实测：
 * 切走再切回裁切，cropperImg 量到 [195,416,0,0]，画面全空）。
 * 延迟回收，让在途解码先跑完；内存代价最多多留一帧位图。
 */
const DEFERRED_REVOKE_MS = 2000;
const releaseUrlLater = (url) => {
  const target = String(url || '').trim();
  if (!target) return;
  if (typeof setTimeout !== 'function') {
    revokePreviewUrl(target);
    return;
  }
  setTimeout(() => revokePreviewUrl(target), DEFERRED_REVOKE_MS);
};

const makeEntry = (file, fileIndex) => {
  let previewUrl = '';
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      previewUrl = URL.createObjectURL(file);
    } catch {
      /* ignore */
    }
  }
  return {
    id: `entry-${Date.now()}-${fileIndex}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    previewUrl,
    edited: false,
  };
};

/* 确认页与编辑页共用的清理：所有 entry 预览 + 编辑器预览 + 贴纸底图都要撤。 */
const cleanupObjectUrls = () => {
  entries.value.forEach((entry) => revokePreviewUrl(entry.previewUrl));
  revokePreviewUrl(editor.previewUrl);
  revokePreviewUrl(stickerBaseUrl.value);
  stickerBaseUrl.value = '';
  editor.previewUrl = '';
  editor.source = null;
  editor.previewWidth = 0;
  editor.previewHeight = 0;
};

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      const files = Array.isArray(props.files) ? props.files.filter(Boolean) : [];
      entries.value = files.map(makeEntry);
      activeIndex.value = 0;
      view.value = props.mode === 'edit' ? 'editor' : 'confirm';
      activeTool.value = 'crop';
      reset();
      liveStickers.value = [];
      editorError.value = '';
      // 贴纸位图必须先解码好：canvas 合成是同步的，导出时再加载就来不及
      void preloadEditorStickers();
      if (props.mode === 'edit') {
        void openEditorForEntry(entries.value[0]);
      }
    } else {
      cleanupObjectUrls();
      editingId.value = null;
      liveStickers.value = [];
      reset();
    }
  },
);

/* 页面滚动锁：走单源（引用计数）——编辑器可能叠在发布会话（已持锁）之上，
   直写 overflow 会在任一方离场时误清另一方的锁。 */
useBodyScrollLock(() => props.visible, 'ImageEditModal');

const startPhotoObserver = () => {
  stopPhotoObserver();
  if (typeof ResizeObserver !== 'function' || !stageRef.value) return;
  photoObserver = new ResizeObserver(() => syncPhotoBox());
  photoObserver.observe(stageRef.value);
};
const stopPhotoObserver = () => {
  photoObserver?.disconnect?.();
  photoObserver = null;
};

onMounted(() => {
  if (props.visible) startPhotoObserver();
});
watch(
  () => props.visible,
  (visible) => {
    if (visible) startPhotoObserver();
    else stopPhotoObserver();
  },
);
onBeforeUnmount(() => {
  stopPhotoObserver();
  cleanupObjectUrls();
});

/**
 * 量出「照片在舞台里实际占的矩形」。
 * 贴纸浮层和 cropper 容器都按这个矩形定位 —— 坐标系才和 canvas 的归一化
 * 坐标一一对应；object-fit:contain 的留白必须扣掉，否则位置整体偏。
 *
 * ⚠️ cropper 自己也做 contain 布局，留白会铺一层遮罩色（默认还是纯黑）——
 * 把容器收窄到照片实际矩形，留白就彻底不存在，遮罩只落在照片上。
 */
const syncPhotoBox = () => {
  const stage = stageRef.value;
  if (!stage) return;
  const stageRect = stage.getBoundingClientRect();
  const naturalWidth = editor.previewWidth;
  const naturalHeight = editor.previewHeight;
  if (!stageRect.width || !stageRect.height || !naturalWidth || !naturalHeight) return;
  const scale = Math.min(stageRect.width / naturalWidth, stageRect.height / naturalHeight);
  photoBox.width = naturalWidth * scale;
  photoBox.height = naturalHeight * scale;
  photoBox.left = (stageRect.width - photoBox.width) / 2;
  photoBox.top = (stageRect.height - photoBox.height) / 2;
};

/* ── 渲染 ─────────────────────────────────────────────────────────── */

const renderPreview = async ({ includeStickers = true } = {}) => {
  if (!editor.source) return;
  const stickerList = includeStickers ? foldStickers(commands.value) : [];
  const canvas = renderDocToCanvas(editor.source, commands.value, {
    stickers: stickerList,
    stickerImages: getLoadedStickerImages(),
  });
  const url = await canvasToObjectUrl(canvas);
  if (includeStickers) {
    releaseUrlLater(editor.previewUrl);
    editor.previewUrl = url;
    // 含贴纸的预览已是最新 ⇒ 贴纸底图作废（留着会被当成 chip 缩略图用成旧图）
    releaseUrlLater(stickerBaseUrl.value);
    stickerBaseUrl.value = '';
  } else {
    releaseUrlLater(stickerBaseUrl.value);
    stickerBaseUrl.value = url;
  }
  editor.previewWidth = canvas.width;
  editor.previewHeight = canvas.height;
  await nextTick();
  syncPhotoBox();
};

const renderForTool = async (toolId = activeTool.value) => {
  // 贴纸工具要一张「不含贴纸」的底图，否则浮层会与烘焙进预览的贴纸重影
  await renderPreview({ includeStickers: toolId !== 'sticker' });
};

const openEditorForEntry = async (entry) => {
  if (!entry?.file) return;
  editingId.value = entry.id;
  editorError.value = '';
  isLoadingEditor.value = true;
  reset();
  liveStickers.value = [];
  try {
    const source = await createWorkingSource(entry.file);
    editor.source = source.canvas;
    await renderForTool();
  } catch (error) {
    editorError.value = String(error?.message || '图片载入失败');
    editor.source = null;
  } finally {
    isLoadingEditor.value = false;
  }
};

const openEditor = (entry) => {
  if (isBusy.value) return;
  view.value = 'editor';
  activeTool.value = 'crop';
  void openEditorForEntry(entry);
};

/* ── 命令 ─────────────────────────────────────────────────────────── */

/**
 * 把裁切框当前状态固化为命令（若覆盖整幅则不记）。
 * ⚠️ 坐标系：cropper 的 coordinates 是「预览图自然像素」空间 —— 预览就是我们
 * 合成的 canvas（无 transform），除以预览尺寸即归一化。
 */
const commitPendingCrop = () => {
  const cropper = cropperRef.value;
  if (!cropper || !editor.previewWidth || !editor.previewHeight) return false;
  let coordinates = null;
  try {
    coordinates = cropper.getResult()?.coordinates;
  } catch {
    return false;
  }
  if (!coordinates) return false;
  const rect = clampNormalizedRect({
    x: Number(coordinates.left) / editor.previewWidth,
    y: Number(coordinates.top) / editor.previewHeight,
    width: Number(coordinates.width) / editor.previewWidth,
    height: Number(coordinates.height) / editor.previewHeight,
  });
  if (isFullRect(rect)) return false;
  pushCommand({ type: 'crop', rect });
  return true;
};

const handleRotate = async (direction = 'cw') => {
  if (toolBusy.value) return;
  commitPendingCrop();
  pushCommand({ type: 'rotate', dir: direction });
  await renderForTool();
};

const handleFlip = async () => {
  if (toolBusy.value) return;
  commitPendingCrop();
  pushCommand({ type: 'flip' });
  await renderForTool();
};

const applyFilter = (id) => {
  if (toolBusy.value || id === currentFilterId.value) return;
  pushCommand({ type: 'filter', id });
};

const selectTool = async (id) => {
  if (toolBusy.value || id === activeTool.value) return;
  // ⚠️ 必须先取坐标系再切工具：activeTool 一变，cropper 就开始卸载，
  // 之后再读 cropperRef 拿到的是 null（裁切框会被静默丢掉）
  if (activeTool.value === 'crop') commitPendingCrop();
  // ⚠️ 顺序也是坑：先把目标形态的预览渲染好，**再**切 activeTool。
  // 反过来的话 cropper 会先用「即将被替换」的 blob 挂载，随后 URL 被收回 ⇒
  // 图片 0×0、整块画面空白（2026-11-05 用户报障「裁切后图片不可见」的真因）。
  await renderForTool(id);
  activeTool.value = id;
  await nextTick();
  syncPhotoBox();
};

const handleUndo = async () => {
  if (!canUndo.value || toolBusy.value) return;
  undo();
  await renderForTool();
};

/* ── 贴纸 ─────────────────────────────────────────────────────────── */

const syncLiveStickers = () => {
  liveStickers.value = foldStickers(commands.value).map((sticker) => ({ ...sticker }));
  if (
    selectedStickerId.value &&
    !liveStickers.value.some((item) => item.id === selectedStickerId.value)
  ) {
    selectedStickerId.value = '';
  }
};
watch(commands, syncLiveStickers, { deep: true });

const stickerStyle = (sticker) => ({
  left: `${sticker.x * 100}%`,
  top: `${sticker.y * 100}%`,
  width: `${sticker.size * 100}%`,
});

const addSticker = (preset) => {
  if (toolBusy.value) return;
  const id = `st-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  // 连贴几张时不要完全重叠（全叠在正中央的话，用户以为没贴上去）
  const cascade = (liveStickers.value.length % 3) * 0.07;
  pushCommand({
    type: 'sticker-add',
    id,
    asset: preset.src,
    x: 0.5 + cascade,
    y: 0.5 + cascade * 0.6,
    size: EDITOR_STICKER_DEFAULT_SIZE,
  });
  selectedStickerId.value = id;
  syncLiveStickers();
};

const removeSticker = (sticker) => {
  if (toolBusy.value || !sticker?.id) return;
  pushCommand({ type: 'sticker-remove', id: sticker.id });
  syncLiveStickers();
};

/**
 * 贴纸拖动 / 缩放都走同一套：pointerdown 记起点，move 只改本地 liveStickers
 * （零重渲染），pointerup 才 push 一条 sticker-update 进命令栈。
 * ⇒ 一次手势 = 一条撤销记录，拖动过程中不产生几十条垃圾命令。
 */
const startStickerGesture = (event, sticker, mode) => {
  if (toolBusy.value) return;
  selectedStickerId.value = sticker.id;
  const startX = Number(event.clientX) || 0;
  const startY = Number(event.clientY) || 0;
  const origin = { x: sticker.x, y: sticker.y, size: sticker.size };
  const target = event.currentTarget;
  target?.setPointerCapture?.(event.pointerId);

  const onMove = (moveEvent) => {
    if (!photoBox.width || !photoBox.height) return;
    const dx = (Number(moveEvent.clientX) - startX) / photoBox.width;
    const dy = (Number(moveEvent.clientY) - startY) / photoBox.height;
    const item = liveStickers.value.find((entry) => entry.id === sticker.id);
    if (!item) return;
    if (mode === 'resize') {
      item.size = Math.min(2, Math.max(0.08, origin.size + dx));
    } else {
      item.x = Math.min(1, Math.max(0, origin.x + dx));
      item.y = Math.min(1, Math.max(0, origin.y + dy));
    }
  };

  const onUp = () => {
    target?.removeEventListener?.('pointermove', onMove);
    target?.removeEventListener?.('pointerup', onUp);
    target?.removeEventListener?.('pointercancel', onUp);
    const item = liveStickers.value.find((entry) => entry.id === sticker.id);
    if (!item) return;
    if (item.x !== origin.x || item.y !== origin.y || item.size !== origin.size) {
      pushCommand({
        type: 'sticker-update',
        id: sticker.id,
        x: item.x,
        y: item.y,
        size: item.size,
      });
    }
    syncLiveStickers();
  };

  target?.addEventListener?.('pointermove', onMove);
  target?.addEventListener?.('pointerup', onUp);
  target?.addEventListener?.('pointercancel', onUp);
  event.preventDefault?.();
};

const beginStickerDrag = (event, sticker) => startStickerGesture(event, sticker, 'move');
const beginStickerResize = (event, sticker) => startStickerGesture(event, sticker, 'resize');

/* ── 导出 / 确认页 ────────────────────────────────────────────────── */

const backToConfirm = () => {
  view.value = 'confirm';
  editingId.value = null;
  activeTool.value = 'crop';
  liveStickers.value = [];
};

const handleEditorCancel = () => {
  if (props.mode === 'confirm') {
    backToConfirm();
    return;
  }
  emit('close');
};

const handleEditorDone = async () => {
  const entry = editingEntry.value;
  if (!entry || isBusy.value || isLoadingEditor.value || editorError.value) return;
  commitPendingCrop();
  // 没有任何命令 = 没编辑过（或全部撤销）：不重编码，原文件直接过
  if (!commands.value.length) {
    if (props.mode === 'confirm') backToConfirm();
    else emit('save', null);
    return;
  }
  isExporting.value = true;
  try {
    const finalCanvas = renderDocToCanvas(editor.source, commands.value, {
      filter: currentFilterCss.value,
      stickers: foldStickers(commands.value),
      stickerImages: getLoadedStickerImages(),
    });
    const file = await exportCanvasToJpegFile(finalCanvas, { name: entry.file?.name || '' });
    // 同理：确认页那张大图可能正在解码旧 URL，延迟回收免得它闪成空白
    releaseUrlLater(entry.previewUrl);
    let previewUrl = '';
    try {
      previewUrl = URL.createObjectURL(file);
    } catch {
      /* ignore */
    }
    entry.file = file;
    entry.previewUrl = previewUrl;
    entry.edited = true;
    if (props.mode === 'confirm') backToConfirm();
    else emit('save', file);
  } catch (error) {
    editorError.value = String(error?.message || '图片导出失败');
  } finally {
    isExporting.value = false;
  }
};

/* 确认页：横滑一张一屏，计数与底栏动作都跟着当前张走 */
const syncActiveIndex = () => {
  const track = swipeRef.value;
  if (!track) return;
  const width = track.clientWidth || 1;
  const next = Math.round(track.scrollLeft / width);
  activeIndex.value = Math.min(entries.value.length - 1, Math.max(0, next));
};

const goToSlide = (index) => {
  const track = swipeRef.value;
  if (!track) return;
  activeIndex.value = index;
  track.scrollTo?.({ left: index * (track.clientWidth || 0), behavior: 'smooth' });
};

const removeEntry = (entry) => {
  if (isBusy.value || !entry) return;
  revokePreviewUrl(entry.previewUrl);
  entries.value = entries.value.filter((item) => item.id !== entry.id);
  activeIndex.value = Math.min(activeIndex.value, Math.max(0, entries.value.length - 1));
  if (!entries.value.length) emit('close');
};

const handleConfirmAll = () => {
  if (isBusy.value) return;
  const files = entries.value.map((entry) => entry.file).filter(Boolean);
  emit('confirm', files);
};
</script>

<style scoped>
/* ── 层级：发布前图片预览（220200）之上、与 PostComposer 浮层同族 ── */
.imgedit-overlay {
  position: fixed;
  inset: 0;
  z-index: 220300;
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: 8px;
  padding-top: calc(8px + env(safe-area-inset-top));
  padding-bottom: calc(8px + env(safe-area-inset-bottom));
  /* 页面本身透出来一点，卡片才有「浮在发帖器上」的层次；不写成不透明层 */
  background: rgba(20, 20, 24, 0.12);
  overscroll-behavior: contain;
}

/* ── 卡片：直接复用 .editor-card 的液态玻璃配方（--liquid-* 同一批 token） ── */
.imgedit-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border-radius: var(--liquid-radius-lg, 28px);
  background: var(--liquid-bg, rgba(255, 255, 255, 0.72));
  border: 1px solid var(--liquid-border, rgba(255, 255, 255, 0.65));
  box-shadow:
    var(--liquid-highlight, inset 0 1px 0 rgba(255, 255, 255, 0.86)),
    var(--liquid-shadow, 0 20px 60px rgba(15, 23, 42, 0.07));
  backdrop-filter: blur(var(--liquid-blur, 28px)) saturate(var(--liquid-saturate, 180%))
    brightness(1.02);
  -webkit-backdrop-filter: blur(var(--liquid-blur, 28px)) saturate(var(--liquid-saturate, 180%))
    brightness(1.02);
  isolation: isolate;
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .imgedit-card {
    background: rgba(255, 255, 255, 0.97);
  }
}
.boh-perf-lite .imgedit-card {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: var(--glass-filter-sm, blur(18px));
  -webkit-backdrop-filter: var(--glass-filter-sm, blur(18px));
}

/* ── 顶栏：与发帖器同构（左玻璃胶囊 / 中标题 / 右深色主操作） ── */
.imgedit-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--liquid-border-hairline, rgba(15, 23, 42, 0.06));
}

.imgedit-title {
  flex: 1;
  min-width: 0;
  text-align: center;
  font-size: 15px;
  font-weight: 700;
  color: var(--liquid-text-primary, #1d1d1f);
  letter-spacing: -0.01em;
}

.imgedit-pill {
  flex-shrink: 0;
  border: 1px solid var(--liquid-border, rgba(255, 255, 255, 0.65));
  background: var(--liquid-bg-subtle, rgba(255, 255, 255, 0.58));
  color: var(--liquid-text-primary, #1d1d1f);
  font-size: 13.5px;
  font-weight: 700;
  padding: 7px 14px;
  border-radius: 999px;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    transform 0.14s ease;
}

.imgedit-pill:active:not(:disabled) {
  transform: scale(0.96);
}

/* 主操作沿用发帖器「发布」的深色胶囊 —— 上一版用了主操作蓝，与相邻界面打架 */
.imgedit-pill.is-primary {
  border-color: transparent;
  background: #111827;
  color: #fff;
}

.imgedit-pill:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ── 确认页：一屏一张大图（上一版是 148px 卡片横排 + 535px 空白） ── */
.imgedit-swipe {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  /* ⚠️ 横向滚动到底不把手势继续抛给上层：iOS/Android 的「从边缘右滑 = 返回上一页」
     就是靠这条被拦下来的（Chrome/Edge 认这个；iOS Safari 的边缘手势属于系统级，
     CSS 拦不住 —— 所以底栏另给了显式的「上一张 / 下一张」按钮，别只靠横滑）。 */
  overscroll-behavior-x: contain;
  overscroll-behavior-y: none;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x;
}
.imgedit-swipe::-webkit-scrollbar {
  display: none;
}

.imgedit-slide {
  position: relative;
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  margin: 0;
  scroll-snap-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  min-height: 0;
}

.imgedit-slide img {
  max-width: 100%;
  max-height: 100%;
  border-radius: 18px;
  object-fit: contain;
  box-shadow: var(--liquid-shadow-sm, 0 8px 24px rgba(15, 23, 42, 0.08));
}

.imgedit-slide-tag {
  position: absolute;
  top: 20px;
  right: 24px;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.72);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  backdrop-filter: var(--glass-filter-sm, blur(18px));
}

.imgedit-empty {
  margin: auto;
  font-size: 13px;
  color: var(--liquid-text-tertiary, #8b9098);
}

.imgedit-confirm-foot {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 14px 14px;
  border-top: 1px solid var(--liquid-border-hairline, rgba(15, 23, 42, 0.06));
}

/* 翻页行：点点居中，左右各一枚极简箭头（只有一张图时不渲染，避免两枚死按钮） */
.imgedit-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  min-height: 30px;
}

.imgedit-page-btn {
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--liquid-border-hairline, rgba(15, 23, 42, 0.06));
  border-radius: 999px;
  background: var(--liquid-bg-subtle, rgba(255, 255, 255, 0.58));
  color: var(--liquid-text-secondary, #6e6e73);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    color 0.18s ease,
    transform 0.14s ease,
    background-color 0.18s ease;
}

.imgedit-page-btn:active:not(:disabled) {
  transform: scale(0.92);
}

.imgedit-page-btn:not(:disabled):hover {
  color: var(--liquid-text-primary, #1d1d1f);
  background: var(--liquid-bg-strong, rgba(255, 255, 255, 0.84));
}

.imgedit-page-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.imgedit-dots {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 14px;
}

.imgedit-dot {
  width: 6px;
  height: 6px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.16);
  cursor: pointer;
  transition:
    width 0.22s var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1)),
    background-color 0.2s ease;
}

.imgedit-dot.is-on {
  width: 16px;
  background: #111827;
}

/* ── 动作条：发帖器 .composer-actions 的同款玻璃胶囊条 ── */
.imgedit-actionbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  border-radius: 999px;
  background: var(--liquid-bg-subtle, rgba(255, 255, 255, 0.58));
  border: 1px solid var(--liquid-border, rgba(255, 255, 255, 0.65));
  box-shadow:
    var(--liquid-highlight-subtle, inset 0 1px 0 rgba(255, 255, 255, 0.55)), var(--liquid-shadow-sm);
}

.imgedit-action {
  flex: 1;
  min-height: 38px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--liquid-text-primary, #1d1d1f);
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    transform 0.14s ease;
}

.imgedit-action:active:not(:disabled) {
  transform: scale(0.96);
}

.imgedit-action:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.05);
}

.imgedit-action.is-danger {
  color: #ef4444;
}

.imgedit-action:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

/* ── 编辑器舞台：照片满铺，不再套一块黑色圆角补丁 ── */
.imgedit-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  margin: 10px 12px 6px;
  border-radius: 18px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 位置由 photoBoxStyle 给（照片实际矩形），不用 inset —— inset:0 会把留白
   还给 cropper，遮罩又变成一整块灰板 */
.imgedit-crop-layer {
  position: absolute;
}

.imgedit-cropper {
  width: 100%;
  height: 100%;
}

/* ⚠️ cropper 默认给「照片外的留白」铺一块纯黑（.vue-advanced-cropper__background）
   —— 4:3 照片放进竖屏舞台时上下就是两条黑边，等于把上一版的黑舞台又请回来了。
   这里让留白透出卡片材质，只保留框外的 50% 遮罩（__foreground）当裁切反馈。 */
.imgedit-crop-layer :deep(.vue-advanced-cropper__background) {
  background: transparent;
}

.imgedit-crop-layer :deep(.vue-advanced-cropper__foreground) {
  background: #111827;
}

.imgedit-photo {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}

.imgedit-sticker-layer {
  position: absolute;
  z-index: 3;
  touch-action: none;
}

.imgedit-sticker {
  position: absolute;
  transform: translate(-50%, -50%);
  cursor: grab;
  touch-action: none;
}

.imgedit-sticker img {
  display: block;
  width: 100%;
  height: auto;
  pointer-events: none;
  -webkit-user-drag: none;
  filter: drop-shadow(0 4px 10px rgba(15, 23, 42, 0.18));
}

.imgedit-sticker.is-active {
  outline: 1.5px dashed rgba(255, 255, 255, 0.9);
  outline-offset: 4px;
  border-radius: 8px;
}

.imgedit-sticker-del,
.imgedit-sticker-handle {
  position: absolute;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.85);
  background: rgba(17, 24, 39, 0.78);
  color: #fff;
  display: none;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  backdrop-filter: blur(8px);
}

.imgedit-sticker.is-active .imgedit-sticker-del,
.imgedit-sticker.is-active .imgedit-sticker-handle {
  display: inline-flex;
}

.imgedit-sticker-del {
  top: -12px;
  right: -12px;
}

.imgedit-sticker-handle {
  right: -12px;
  bottom: -12px;
  cursor: nwse-resize;
}

.imgedit-sticker-handle::after {
  content: '';
  width: 9px;
  height: 9px;
  border-right: 1.6px solid currentColor;
  border-bottom: 1.6px solid currentColor;
}

.imgedit-stage-note {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--liquid-text-secondary, #6e6e73);
  font-size: 14px;
  font-weight: 600;
  padding: 0 20px;
  text-align: center;
}

.imgedit-stage-note.is-error {
  color: #ef4444;
}

/* ── 工具面板：玻璃 sheet（与发帖器 .composer-tag-menu 同一材质） ── */
.imgedit-sheet {
  margin: 0 12px 6px;
  padding: 10px;
  border-radius: 22px;
  background: var(--liquid-bg-strong, rgba(255, 255, 255, 0.84));
  border: 1px solid var(--liquid-border, rgba(255, 255, 255, 0.65));
  box-shadow:
    var(--liquid-highlight-subtle, inset 0 1px 0 rgba(255, 255, 255, 0.55)), var(--liquid-shadow-sm);
  backdrop-filter: var(--glass-filter-sm, blur(18px)) saturate(var(--liquid-saturate, 180%));
  -webkit-backdrop-filter: var(--glass-filter-sm, blur(18px)) saturate(var(--liquid-saturate, 180%));
}

.imgedit-sheet-row {
  display: flex;
  gap: 8px;
}

.imgedit-sheet-btn {
  flex: 1;
  min-height: 40px;
  border: 1px solid var(--liquid-border-hairline, rgba(15, 23, 42, 0.06));
  border-radius: 14px;
  background: var(--liquid-bg-subtle, rgba(255, 255, 255, 0.58));
  color: var(--liquid-text-primary, #1d1d1f);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 0.14s ease,
    background-color 0.18s ease;
}

.imgedit-sheet-btn:active:not(:disabled) {
  transform: scale(0.96);
}

.imgedit-sheet-btn:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.imgedit-sheet-hint {
  margin: 8px 4px 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--liquid-text-tertiary, #8b9098);
}

.imgedit-chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  padding-bottom: 2px;
}
.imgedit-chips::-webkit-scrollbar {
  display: none;
}

.imgedit-chip {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 3px;
  border: 1.5px solid transparent;
  border-radius: 14px;
  background: transparent;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    transform 0.14s ease;
}

.imgedit-chip:active {
  transform: scale(0.95);
}

.imgedit-chip.is-on {
  border-color: var(--apple-blue, #0071e3);
}

.imgedit-chip-thumb {
  display: block;
  width: 52px;
  height: 52px;
  border-radius: 11px;
  object-fit: cover;
  background: rgba(0, 0, 0, 0.05);
}

.imgedit-chip-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--liquid-text-secondary, #6e6e73);
  line-height: 1.2;
}

.imgedit-chip.is-on .imgedit-chip-label {
  color: var(--apple-blue, #0071e3);
}

.imgedit-chip.is-sticker {
  width: 64px;
  height: 64px;
  justify-content: center;
  background: var(--liquid-bg-subtle, rgba(255, 255, 255, 0.6));
  border-color: var(--liquid-border-hairline, rgba(15, 23, 42, 0.06));
}

.imgedit-chip.is-sticker img {
  width: 54px;
  height: 54px;
  object-fit: contain;
}

/* ── 工具条：发帖器 .composer-actions 的同款玻璃胶囊容器 ── */
.imgedit-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  margin: 0 12px 12px;
  padding: 5px;
  border-radius: 26px;
  background: var(--liquid-bg-subtle, rgba(255, 255, 255, 0.58));
  border: 1px solid var(--liquid-border, rgba(255, 255, 255, 0.65));
  box-shadow:
    var(--liquid-highlight-subtle, inset 0 1px 0 rgba(255, 255, 255, 0.55)), var(--liquid-shadow-sm);
  backdrop-filter: var(--glass-filter-sm, blur(18px)) saturate(var(--liquid-saturate, 180%));
  -webkit-backdrop-filter: var(--glass-filter-sm, blur(18px)) saturate(var(--liquid-saturate, 180%));
}

.imgedit-tool {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 7px 2px;
  border: 1px solid transparent;
  border-radius: 18px;
  background: transparent;
  color: var(--liquid-text-secondary, #6e6e73);
  font-size: 10.5px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    color 0.18s ease,
    transform 0.14s ease;
}

.imgedit-tool:active:not(:disabled) {
  transform: scale(0.95);
}

/* 选中态走实心蓝（= 发帖器 .composer-action-btn.active 的同一口径） */
.imgedit-tool.is-on {
  background: var(--apple-blue, #0071e3);
  color: #fff;
}

.imgedit-tool:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.imgedit-fade-enter-active,
.imgedit-fade-leave-active {
  transition: opacity 0.22s ease;
}

.imgedit-fade-enter-from,
.imgedit-fade-leave-to {
  opacity: 0;
}

/* ── 桌面：卡片居中限宽，与发帖器桌面态的 860px 内容宽对齐 ── */
@media (min-width: 901px) {
  .imgedit-overlay {
    align-items: center;
    padding: 24px;
  }

  .imgedit-card {
    flex: 0 1 auto;
    width: min(860px, 100%);
    height: min(660px, calc(100vh - 48px));
  }

  .imgedit-slide img {
    max-width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .imgedit-fade-enter-active,
  .imgedit-fade-leave-active {
    transition: none;
  }

  .imgedit-dot,
  .imgedit-pill,
  .imgedit-action,
  .imgedit-tool,
  .imgedit-chip {
    transition: none;
  }
}
</style>
