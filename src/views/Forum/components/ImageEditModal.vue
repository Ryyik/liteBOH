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
        <!-- ── 确认页（流法 C）：系统面板选图后先到这里，确认才回填网格并启动管线 ── -->
        <div v-if="view === 'confirm'" class="imgedit-confirm">
          <header class="imgedit-head">
            <button type="button" class="imgedit-head-btn" @click="emit('close')">取消</button>
            <span class="imgedit-head-title">确认图片</span>
            <button
              type="button"
              class="imgedit-head-primary"
              :disabled="isBusy"
              @click="handleConfirmAll"
            >
              全部确认{{ entries.length ? `（${entries.length}）` : '' }}
            </button>
          </header>

          <div class="imgedit-strip" aria-label="待确认图片列表">
            <div v-for="(entry, index) in entries" :key="entry.id" class="imgedit-card">
              <span class="imgedit-card-index">{{ index + 1 }}</span>
              <span v-if="entry.edited" class="imgedit-card-edited">已编辑</span>
              <img
                class="imgedit-card-img"
                :src="entry.previewUrl"
                :alt="`第 ${index + 1} 张待确认图片`"
                decoding="async"
              />
              <div class="imgedit-card-actions">
                <button
                  type="button"
                  class="imgedit-card-btn"
                  :disabled="isBusy"
                  @click="openEditor(entry)"
                >
                  编辑
                </button>
                <button
                  type="button"
                  class="imgedit-card-btn is-danger"
                  :disabled="isBusy"
                  :aria-label="`移除第 ${index + 1} 张图片`"
                  @click="removeEntry(entry)"
                >
                  移除
                </button>
              </div>
            </div>
            <p v-if="!entries.length" class="imgedit-empty">没有待确认的图片</p>
          </div>

          <p class="imgedit-hint">确认后才开始上传；之后在编辑器的图片网格里还能继续编辑</p>
        </div>

        <!-- ── 编辑器：分层非破坏编辑（裁切 / 旋转 / 翻转 / 撤销） ── -->
        <div v-else class="imgedit-editor">
          <header class="imgedit-head">
            <button type="button" class="imgedit-head-btn" @click="handleEditorCancel">
              {{ mode === 'confirm' ? '返回' : '取消' }}
            </button>
            <span class="imgedit-head-title">编辑图片</span>
            <button
              type="button"
              class="imgedit-head-primary"
              :disabled="isBusy || isLoadingEditor"
              @click="handleEditorDone"
            >
              {{ isExporting ? '处理中…' : '完成' }}
            </button>
          </header>

          <div class="imgedit-stage">
            <div v-if="isLoadingEditor" class="imgedit-stage-note">正在载入图片…</div>
            <div v-else-if="editorError" class="imgedit-stage-note is-error">{{ editorError }}</div>
            <Cropper
              v-else-if="editor.previewUrl"
              ref="cropperRef"
              class="imgedit-cropper"
              :src="editor.previewUrl"
              :stencil-props="{ aspectRatio: null }"
              :default-size="fullImageDefaultSize"
              :default-position="fullImageDefaultPosition"
            />
          </div>

          <footer class="imgedit-toolbar" aria-label="图片编辑工具">
            <button
              type="button"
              class="imgedit-tool"
              :disabled="!canUndo || isBusy || isLoadingEditor"
              @click="handleUndo"
            >
              <Undo2 :size="18" :stroke-width="2" aria-hidden="true" />
              <span>撤销</span>
            </button>
            <button
              type="button"
              class="imgedit-tool"
              :disabled="isBusy || isLoadingEditor"
              @click="handleRotate"
            >
              <RotateCw :size="18" :stroke-width="2" aria-hidden="true" />
              <span>旋转</span>
            </button>
            <button
              type="button"
              class="imgedit-tool"
              :disabled="isBusy || isLoadingEditor"
              @click="handleFlip"
            >
              <FlipHorizontal :size="18" :stroke-width="2" aria-hidden="true" />
              <span>翻转</span>
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
/**
 * 发帖图片编辑器（P0，2026-11-05 定稿方案「流法 C」）。
 *
 * 两种宿主形态（由 mode 决定）：
 *  · confirm —— 系统面板选图后的**确认页**：横滑预览 + 每张「编辑 / 移除」+
 *    「全部确认」。确认前不进 PostComposer 的上传管线（零浪费零竞态：编辑
 *    全部发生在上传前）；确认后由宿主 emit image-selection 走既有管线。
 *  · edit —— 从编辑器网格缩略图的画笔角标再进入的**单图编辑**：产物交给宿主
 *    撤销在途上传并重启管线（发布快照 url: img.uploadedUrl || img.url 归一
 *    口径已有，见 useForumDraftImagePipelines）。
 *
 * 像素事实在 utils/image-editor-export.js（工作位图 ≤2560 / 导出 ≤1600 JPEG
 * q0.9，从工作位图合成，不经过预览编码）；命令语义在
 * composables/useImageEditorDoc.js（归一化坐标 + 撤销栈上限 30）。
 * 这里只做交互编排。UI 风格对齐 PostComposer（--apple-blue / --liquid-* token）。
 */
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { FlipHorizontal, RotateCw, Undo2 } from 'lucide-vue-next';
import { Cropper } from 'vue-advanced-cropper';
import 'vue-advanced-cropper/dist/style.css';
import { useBodyScrollLock } from '@/composables/useBodyScrollLock.js';
import {
  canvasToObjectUrl,
  createWorkingSource,
  exportCanvasToJpegFile,
  renderDocToCanvas,
} from '@/utils/image-editor-export.js';
import { clampNormalizedRect, isFullRect, useImageEditorDoc } from '../composables/useImageEditorDoc.js';

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** confirm = 选图确认页（内部可进编辑器再返回）；edit = 网格单图再编辑 */
  mode: { type: String, default: 'confirm' },
  /** confirm 模式：本次选中的全部文件；edit 模式：[待编辑文件] */
  files: { type: Array, default: () => [] },
});

const emit = defineEmits(['close', 'confirm', 'save']);

const view = ref('confirm');
const entries = ref([]);
const editingId = ref(null);
const isExporting = ref(false);
const isLoadingEditor = ref(false);
const editorError = ref('');
const cropperRef = ref(null);

const isBusy = computed(() => isExporting.value);
const editingEntry = computed(() => entries.value.find((entry) => entry.id === editingId.value) || null);

const editor = reactive({
  source: null,
  previewUrl: '',
  previewWidth: 0,
  previewHeight: 0,
});

const { commands, canUndo, pushCommand, undo, reset } = useImageEditorDoc();

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

/* 确认页与编辑页共用的清理：所有 entry 预览 + 编辑器预览的 objectURL 都要撤。 */
const cleanupObjectUrls = () => {
  entries.value.forEach((entry) => revokePreviewUrl(entry.previewUrl));
  revokePreviewUrl(editor.previewUrl);
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
      view.value = props.mode === 'edit' ? 'editor' : 'confirm';
      if (props.mode === 'edit') {
        // edit 模式：单个文件直接进编辑器（不给确认页兜一圈）
        reset();
        void openEditorForEntry(entries.value[0]);
      } else {
        reset();
        editorError.value = '';
      }
    } else {
      cleanupObjectUrls();
      editingId.value = null;
      reset();
    }
  },
);

/* 页面滚动锁：走单源（引用计数，见 composables/useBodyScrollLock.js）——
   编辑器可能叠在发布会话（已持锁）之上，直写 overflow 会在任一方离场时误清另一方的锁。
   touchmove 不 prevent —— 裁切手势靠 CSS touch-action 放行。 */
useBodyScrollLock(() => props.visible, 'ImageEditModal');
onBeforeUnmount(() => {
  cleanupObjectUrls();
});

/* ── 编辑器 ─────────────────────────────────────────────────────────── */

const renderEditorPreview = async () => {
  if (!editor.source) return;
  const canvas = renderDocToCanvas(editor.source, commands.value);
  const url = await canvasToObjectUrl(canvas);
  revokePreviewUrl(editor.previewUrl);
  editor.previewUrl = url;
  editor.previewWidth = canvas.width;
  editor.previewHeight = canvas.height;
};

const openEditorForEntry = async (entry) => {
  if (!entry?.file) return;
  editingId.value = entry.id;
  editorError.value = '';
  isLoadingEditor.value = true;
  reset();
  try {
    const source = await createWorkingSource(entry.file);
    editor.source = source.canvas;
    await renderEditorPreview();
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
  void openEditorForEntry(entry);
};

/**
 * 把裁切框当前状态固化为命令（若覆盖整幅则不记）。
 * ⚠️ 坐标系：cropper 的 coordinates 是「预览图自然像素」空间 —— 预览就是我们
 * 合成的 canvas（无 transform），除以预览尺寸即归一化。
 */
const commitPendingCrop = () => {
  const cropper = cropperRef.value;
  if (!cropper || !editor.previewWidth || !editor.previewHeight) return;
  let coordinates = null;
  try {
    coordinates = cropper.getResult()?.coordinates;
  } catch {
    return;
  }
  if (!coordinates) return;
  const rect = clampNormalizedRect({
    x: Number(coordinates.left) / editor.previewWidth,
    y: Number(coordinates.top) / editor.previewHeight,
    width: Number(coordinates.width) / editor.previewWidth,
    height: Number(coordinates.height) / editor.previewHeight,
  });
  if (!isFullRect(rect)) {
    pushCommand({ type: 'crop', rect });
  }
};

const handleRotate = async () => {
  if (isBusy.value || isLoadingEditor.value) return;
  commitPendingCrop();
  pushCommand({ type: 'rotate' });
  await renderEditorPreview();
};

const handleFlip = async () => {
  if (isBusy.value || isLoadingEditor.value) return;
  commitPendingCrop();
  pushCommand({ type: 'flip' });
  await renderEditorPreview();
};

const handleUndo = async () => {
  if (!canUndo.value || isBusy.value || isLoadingEditor.value) return;
  undo();
  await renderEditorPreview();
};

const backToConfirm = () => {
  view.value = 'confirm';
  editingId.value = null;
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
    const finalCanvas = renderDocToCanvas(editor.source, commands.value);
    const file = await exportCanvasToJpegFile(finalCanvas, { name: entry.file?.name || '' });
    revokePreviewUrl(entry.previewUrl);
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

/* ── 确认页 ────────────────────────────────────────────────────────── */

const removeEntry = (entry) => {
  if (isBusy.value) return;
  revokePreviewUrl(entry.previewUrl);
  entries.value = entries.value.filter((item) => item.id !== entry.id);
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
  background: rgba(245, 245, 247, 0.96);
  overscroll-behavior: contain;
}

.imgedit-confirm,
.imgedit-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* ── 顶栏（两视图共用）：对齐 PostComposer 的发布按钮主操作蓝 ── */
.imgedit-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  padding-top: calc(14px + env(safe-area-inset-top));
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.imgedit-head-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--liquid-text-primary, #1d1d1f);
}

.imgedit-head-btn {
  border: none;
  background: rgba(0, 0, 0, 0.06);
  color: var(--liquid-text-primary, #1d1d1f);
  font-size: 14px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 999px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.imgedit-head-btn:hover {
  background: rgba(0, 0, 0, 0.1);
}

.imgedit-head-primary {
  border: none;
  background: var(--apple-blue, #0071e3);
  color: #fff;
  font-size: 14px;
  font-weight: 650;
  padding: 8px 18px;
  border-radius: 999px;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.imgedit-head-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ── 确认页：横滑胶片条 ── */
.imgedit-strip {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 16px;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
}

.imgedit-card {
  position: relative;
  flex-shrink: 0;
  width: 148px;
  border-radius: 20px;
  padding: 8px;
  background: var(--liquid-bg-subtle, rgba(255, 255, 255, 0.58));
  border: 1px solid var(--liquid-border, rgba(255, 255, 255, 0.65));
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
  box-shadow:
    var(--liquid-highlight-subtle, inset 0 1px 0 rgba(255, 255, 255, 0.55)),
    var(--liquid-shadow-sm, 0 8px 24px rgba(15, 23, 42, 0.06));
}

.imgedit-card-img {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.04);
}

.imgedit-card-index {
  position: absolute;
  top: 14px;
  left: 14px;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.38);
  color: #fff;
  font-size: 11px;
  font-weight: 650;
  line-height: 20px;
  text-align: center;
}

.imgedit-card-edited {
  position: absolute;
  top: 14px;
  right: 14px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0, 113, 227, 0.12);
  color: var(--apple-blue, #0071e3);
  font-size: 11px;
  font-weight: 650;
}

.imgedit-card-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 8px;
}

.imgedit-card-btn {
  border: none;
  background: rgba(0, 0, 0, 0.06);
  color: var(--liquid-text-primary, #1d1d1f);
  font-size: 12.5px;
  font-weight: 600;
  padding: 7px 0;
  border-radius: 12px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.imgedit-card-btn:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.1);
}

.imgedit-card-btn.is-danger {
  color: #ef4444;
}

.imgedit-card-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.imgedit-empty {
  align-self: center;
  margin: 0 auto;
  font-size: 13px;
  color: var(--liquid-text-tertiary, #8b9098);
}

.imgedit-hint {
  padding: 10px 20px calc(14px + env(safe-area-inset-bottom));
  font-size: 12px;
  line-height: 1.6;
  color: var(--liquid-text-tertiary, #8b9098);
  text-align: center;
}

/* ── 编辑器：暗底舞台 + 玻璃工具条（裁切区域刻意用暗底，照片编辑的通用形态） ── */
.imgedit-stage {
  flex: 1;
  min-height: 0;
  margin: 12px 14px 6px;
  border-radius: 18px;
  overflow: hidden;
  background: rgba(13, 13, 16, 0.94);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.imgedit-cropper {
  width: 100%;
  height: 100%;
}

.imgedit-stage-note {
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  font-weight: 600;
  padding: 0 20px;
  text-align: center;
}

.imgedit-stage-note.is-error {
  color: #ff9f9f;
}

.imgedit-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 10px 16px calc(16px + env(safe-area-inset-bottom));
}

.imgedit-tool {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-width: 74px;
  border: none;
  border-radius: 16px;
  padding: 9px 12px;
  background: rgba(0, 0, 0, 0.06);
  color: var(--liquid-text-primary, #1d1d1f);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.imgedit-tool:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.1);
}

.imgedit-tool:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── 桌面顺带适配：内容居中限宽，舞台变宽 ── */
@media (min-width: 901px) {
  .imgedit-overlay {
    align-items: center;
    padding: 24px;
  }

  .imgedit-confirm,
  .imgedit-editor {
    flex: 0 1 auto;
    width: min(860px, 100%);
    height: min(640px, calc(100vh - 48px));
    border-radius: 28px;
    background: var(--liquid-bg, rgba(255, 255, 255, 0.72));
    backdrop-filter: var(--liquid-filter);
    -webkit-backdrop-filter: var(--liquid-filter);
    border: 1px solid var(--liquid-border, rgba(255, 255, 255, 0.65));
    box-shadow:
      var(--liquid-highlight, inset 0 1px 0 rgba(255, 255, 255, 0.86)),
      var(--liquid-shadow, 0 20px 60px rgba(15, 23, 42, 0.07));
    overflow: hidden;
  }

  .imgedit-head {
    padding-top: 14px;
  }
}

.imgedit-fade-enter-active,
.imgedit-fade-leave-active {
  transition: opacity 0.22s ease;
}

.imgedit-fade-enter-from,
.imgedit-fade-leave-to {
  opacity: 0;
}
</style>
