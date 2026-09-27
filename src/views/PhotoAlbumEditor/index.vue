<template>
  <div class="album-editor-page">
    <!-- 顶部工具栏 -->
    <header class="editor-toolbar">
      <div class="toolbar-left">
        <button type="button" class="tb-icon-btn" aria-label="返回" @click="goBack">
          <ArrowLeft :size="17" :stroke-width="2.2" aria-hidden="true" />
        </button>
        <input v-model="albumTitle" class="tb-title-input" type="text" maxlength="80" placeholder="未命名影集"
          aria-label="影集标题" @change="onTitleChange" />
      </div>
      <div class="toolbar-right">
        <span v-if="isDirty" class="tb-dirty-dot" title="有未保存的改动" aria-hidden="true"></span>
        <button type="button" class="tb-btn ghost" :disabled="autoArranging" @click="onAutoArrange">
          <Sparkles :size="15" :stroke-width="2" aria-hidden="true" /> 自动初排
        </button>
        <button type="button" class="tb-btn ghost" @click="goReader">
          <BookOpen :size="15" :stroke-width="2" aria-hidden="true" /> 预览
        </button>
        <button type="button" class="tb-btn ghost" :disabled="photos.length === 0 || exporting" @click="onDownload">
          <Download :size="15" :stroke-width="2" aria-hidden="true" /> {{ exporting ? '导出中…' : '下载 HTML' }}
        </button>
        <button type="button" class="tb-btn ghost" :disabled="photos.length === 0 || sharing" @click="onShare">
          <Share2 :size="15" :stroke-width="2" aria-hidden="true" />
          {{ album?.sharedToCommunity ? '已分享' : '分享' }}
        </button>
        <button type="button" class="tb-btn primary" :disabled="isSaving" @click="onSave">
          {{ isSaving ? '保存中…' : '保存' }}
        </button>
      </div>
    </header>

    <!-- 加载/错误态 -->
    <div v-if="isLoading" class="editor-loading" aria-hidden="true">
      <div class="loading-skeleton"></div>
    </div>
    <div v-else-if="loadError" class="editor-error">
      <h2>无法打开影集</h2>
      <p>{{ loadError }}</p>
      <button type="button" class="tb-btn ghost" @click="reload">重试</button>
    </div>

    <!-- 三栏工作区 -->
    <div v-else-if="album" class="editor-workspace">
      <PhotoPoolPanel class="ws-pool" :photos="unusedPhotos" :uploading="isUploading"
        :upload-progress="uploadProgress" @upload="onUpload" @remove="onRemovePhoto" @use="onUsePhoto"
        @cancel-upload="cancelUpload" />

      <div class="ws-center">
        <PageCanvas :page="currentPage" :album="album" :photos="photos" @drop-photo="onDropPhoto"
          @remove-photo="onRemoveSlot" />
      </div>

      <PageSettingsPanel class="ws-settings" :page="currentPage" :album="album" :photos="photos"
        @set-layout="setPageLayout" @update-page="updateCurrentPage" @update-album="onUpdateAlbum"
        @set-caption="onSetCaption" @cover-file="onCoverFile" />
    </div>

    <!-- 页面缩略图条 -->
    <PageStrip v-if="!isLoading && !loadError" class="editor-strip" :pages="pages" :photos="photos"
      :current-index="currentIndex" :album="album" @select="setCurrentIndex" @move="onMovePage" @add="addPageAfterCurrent"
      @remove="onRemovePage" />

    <AvatarCropModal v-model:visible="showCoverCrop" :image-src="coverCropSrc" title="裁切封面" shape="rectangle"
      :aspect-ratio="null" hint="拖动选区自由调整构图" sub-hint="封面用于列表、阅读页与社区入口卡" output-type="image/webp"
      :output-quality="0.9" @confirm="onCoverCropConfirm" />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, BookOpen, Download, Share2, Sparkles } from 'lucide-vue-next';
import AvatarCropModal from '@/components/AvatarCropModal.vue';
import PhotoPoolPanel from './components/PhotoPoolPanel.vue';
import PageCanvas from './components/PageCanvas.vue';
import PageSettingsPanel from './components/PageSettingsPanel.vue';
import PageStrip from './components/PageStrip.vue';
import { useAlbumEditor } from './composables/useAlbumEditor.js';
import { showIsland } from '@/composables/useIsland.js';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';
import { logAlbumExport, updateAlbum } from '@/utils/api/photo-albums-api.js';
import { checkExportQuota, photosQuotaFor, fetchMyTier } from '@/utils/photo-albums/quota.js';
import { exportAlbumOffline } from '@/utils/photo-albums/offline-export.js';
import { recheckAlbumForShare } from '@/utils/photo-albums/share-moderation.js';
import { normalizeDbError } from '@/utils/request-core.js';

const route = useRoute();
const router = useRouter();
const { confirm, confirmThree } = useConfirmDialog();

const editor = useAlbumEditor();
const {
  album, photos, pages, currentIndex, currentPage,
  isLoading, isSaving, isUploading, isDirty, loadError, unusedPhotos,
  load, save, uploadPhotos, cancelUpload, removePhoto, setCaption,
  setCurrentIndex, setPageLayout, updateCurrentPage, addPhotoToCurrentPage,
  removePhotoFromPage, addPageAfterCurrent, removePage, movePage, autoArrange,
  updateCover, markDirty
} = editor;

const albumTitle = ref('');
const uploadProgress = ref({ done: 0, total: 0, stage: '' });
const exporting = ref(false);
const sharing = ref(false);
const autoArranging = ref(false);

const showCoverCrop = ref(false);
const coverCropSrc = ref('');

const albumId = computed(() => String(route.params.id || ''));

async function reload() {
  if (!albumId.value) return;
  const ok = await load(albumId.value);
  if (ok) albumTitle.value = album.value?.title || '';
}

// ---------- 跳转 ----------
function goBack() {
  navigateAway(() => router.push('/user-space?tab=posts'));
}

function goReader() {
  navigateAway(() => router.push(`/albums/${albumId.value}`));
}

async function navigateAway(action) {
  if (!isDirty.value) {
    action();
    return;
  }
  const answer = await confirmThree({
    title: '有未保存的改动',
    message: '离开前要保存吗？',
    confirmText: '保存并离开',
    cancelText: '直接离开',
    tertiaryText: '留在本页'
  });
  if (answer === 'tertiary') return;
  if (answer === 'confirm') {
    await onSave({ silent: true });
  }
  action();
}

// ---------- 保存 ----------
async function onSave({ silent = false } = {}) {
  if (!album.value) return;
  const result = await save();
  if (result.ok) {
    if (!silent) showIsland.notify({ type: 'success', title: '已保存' });
  } else {
    showIsland.notify({ type: 'error', title: '保存失败', message: result.error });
  }
}

async function onTitleChange() {
  if (!album.value) return;
  album.value.title = albumTitle.value.trim() || '未命名影集';
  markDirty();
  await updateAlbum(album.value.id, { title: album.value.title });
}

function onUpdateAlbum(patch) {
  if (!album.value) return;
  if (patch.subtitle !== undefined) {
    album.value.subtitle = patch.subtitle;
    markDirty();
    updateAlbum(album.value.id, { subtitle: patch.subtitle });
  }
}

// ---------- 上传 ----------
async function onUpload(files) {
  const tier = await fetchMyTier();
  const limit = photosQuotaFor(tier);
  if (limit !== -1 && photos.value.length >= limit) {
    showIsland.notify({ type: 'warning', title: '单集照片数已达上限', message: `当前档位最多 ${limit} 张，升级可获得更多` });
    return;
  }

  try {
    const result = await uploadPhotos(files, {
      onProgress: (done, total, stage) => {
        uploadProgress.value = { done, total, stage };
      },
      onPhotoRejected: ({ name, reason }) => {
        showIsland.notify({ type: 'warning', title: '照片未通过检测', message: `${name}：${reason}` });
      }
    });
    if (!result.ok && result.error) {
      showIsland.notify({ type: 'error', title: '上传中断', message: result.error });
    } else if (result.added > 0) {
      showIsland.notify({ type: 'success', title: `已上传 ${result.added} 张`, message: '已自动初排进页面，可手动微调' });
    }
  } catch (error) {
    showIsland.notify({ type: 'error', title: '上传失败', message: normalizeDbError(error, '请稍后再试') });
  } finally {
    uploadProgress.value = { done: 0, total: 0, stage: '' };
  }
}

// ---------- 照片操作 ----------
function onUsePhoto(photo) {
  const result = addPhotoToCurrentPage(photo.id);
  if (!result.ok) {
    showIsland.notify({ type: 'warning', title: '放不进当前页', message: result.error });
  }
}

function onDropPhoto(photoId) {
  const result = addPhotoToCurrentPage(photoId);
  if (!result.ok) {
    showIsland.notify({ type: 'warning', title: '放不进当前页', message: result.error });
  }
}

async function onRemovePhoto(photo) {
  const ok = await confirm({
    title: '删除照片',
    message: '照片将从影集和所有页面中移除，Cloudinary 源文件保留但不再使用。',
    confirmText: '移除',
    tone: 'danger'
  });
  if (!ok) return;
  const result = await removePhoto(photo);
  if (!result.ok) {
    showIsland.notify({ type: 'error', title: '移除失败', message: result.error });
  }
}

function onRemoveSlot(slotIndex) {
  removePhotoFromPage(currentIndex.value, slotIndex);
}

async function onSetCaption(photoId, caption) {
  const result = await setCaption(photoId, caption);
  if (!result.ok) {
    showIsland.notify({ type: 'error', title: '配文保存失败', message: result.error });
  }
}

// ---------- 页面操作 ----------
function onMovePage(from, to) {
  movePage(from, to);
}

async function onRemovePage(index) {
  const page = pages.value[index];
  const ok = await confirm({
    title: '删除页面',
    message: `确定删除第 ${index + 1} 页（${page?.pageType === 'chapter' ? '章节页' : page?.pageType === 'end' ? '尾页' : '内容页'}）？照片会退回照片池。`,
    confirmText: '删除',
    tone: 'danger'
  });
  if (!ok) return;
  const result = removePage(index);
  if (!result.ok) {
    showIsland.notify({ type: 'warning', title: '无法删除', message: result.error });
  }
}

async function onAutoArrange() {
  if (!photos.value.length) {
    showIsland.notify({ type: 'warning', title: '还没有照片', message: '先上传几张照片再自动初排' });
    return;
  }
  const ok = await confirm({
    title: '重新自动初排',
    message: '将按拍摄/上传时间与横竖比重新生成全部内容页，现有手动排版会被覆盖（配文保留）。',
    confirmText: '重新初排',
    tone: 'warning'
  });
  if (!ok) return;
  autoArranging.value = true;
  try {
    autoArrange();
    showIsland.notify({ type: 'success', title: '初排完成', message: '拖动页面条可换序，点版式可微调' });
  } finally {
    autoArranging.value = false;
  }
}

// ---------- 封面 ----------
function onCoverFile(file) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
    showIsland.notify({ type: 'warning', title: '格式不支持', message: '封面仅支持 JPG / PNG / WebP' });
    return;
  }
  coverCropSrc.value = URL.createObjectURL(file);
  showCoverCrop.value = true;
}

async function onCoverCropConfirm(blob) {
  showCoverCrop.value = false;
  if (!blob) return;
  try {
    const { compressImageFileToUploadLimit: compress, getImageCompressionPlan: planOf } =
      await import('@/utils/image-compression.js');
    const { uploadImageToCloudinary: upload } = await import('@/utils/cloudinary-client.js');
    const plan = await planOf(blob);
    const payload = plan.shouldCompress ? await compress(blob, plan) : blob;
    const uploaded = await upload(payload, { folder: 'photo-album', pendingSource: 'photo-album' });
    await updateCover(uploaded?.secure_url || '');
    showIsland.notify({ type: 'success', title: '封面已更新' });
  } catch (error) {
    showIsland.notify({ type: 'error', title: '封面上传失败', message: normalizeDbError(error, '请稍后再试') });
  } finally {
    if (coverCropSrc.value) {
      URL.revokeObjectURL(coverCropSrc.value);
      coverCropSrc.value = '';
    }
  }
}

// ---------- 分享 ----------
async function onShare() {
  if (!album.value || sharing.value) return;
  if (album.value.sharedToCommunity) {
    router.push(`/albums/${albumId.value}`);
    return;
  }
  const ok = await confirm({
    title: '分享到社区',
    message: '分享前会对全部照片做一次安全复审，通过后影集将出现在社区影集区，任何人可阅读。',
    confirmText: '开始复审并分享'
  });
  if (!ok) return;

  sharing.value = true;
  const task = showIsland.task({ title: '分享前复审', progress: 0 });
  try {
    const recheck = await recheckAlbumForShare(albumId.value, {
      onProgress: (done, total) => task.progress(Math.round((done / Math.max(total, 1)) * 100))
    });
    if (!recheck.ok) {
      task.close();
      if (recheck.error !== 'aborted') {
        showIsland.notify({ type: 'error', title: '无法分享', message: recheck.error });
      }
      return;
    }
    const result = await updateAlbum(albumId.value, { status: 'published', sharedToCommunity: true });
    if (result.ok) {
      album.value.sharedToCommunity = true;
      album.value.status = 'published';
      task.success({ title: '已分享到社区' });
    } else {
      task.close();
      showIsland.notify({ type: 'error', title: '分享失败', message: result.error });
    }
  } catch {
    task.close();
  } finally {
    sharing.value = false;
  }
}

// ---------- 导出 ----------
async function onDownload() {
  if (exporting.value) return;
  exporting.value = true;
  try {
    const quota = await checkExportQuota();
    if (!quota.allowed) {
      showIsland.notify({ type: 'warning', title: '本月导出次数已用完', message: quota.hint || '升级订阅可获得更多导出次数' });
      return;
    }
    const task = showIsland.task({ title: '正在打包离线影集', progress: 0 });
    try {
      const result = await exportAlbumOffline({
        album: album.value,
        photos: photos.value,
        pages: pages.value
      }, {
        onProgress: (done, total) => task.progress(Math.round((done / Math.max(total, 1)) * 100))
      });
      await logAlbumExport(albumId.value, result.kind);
      task.success({ title: '导出完成', message: `${result.fileName} 已保存，断网也能翻开` });
    } catch (exportError) {
      task.close();
      throw exportError;
    }
  } catch (error) {
    showIsland.notify({ type: 'error', title: '导出失败', message: normalizeDbError(error, '请稍后再试') });
  } finally {
    exporting.value = false;
  }
}

// ---------- 键盘翻页 ----------
function onKeydown(event) {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.key === 'ArrowLeft') setCurrentIndex(currentIndex.value - 1);
  if (event.key === 'ArrowRight') setCurrentIndex(currentIndex.value + 1);
  // Ctrl/Cmd + S 保存
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    onSave();
  }
}

function onBeforeUnload(event) {
  if (isDirty.value) {
    event.preventDefault();
    event.returnValue = '';
  }
}

onMounted(() => {
  reload();
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('beforeunload', onBeforeUnload);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('beforeunload', onBeforeUnload);
  cancelUpload();
});
</script>

<style scoped>
.album-editor-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--boh-page-bg, #f4f4f6);
  color: var(--text-primary, #1d1d1f);
}

.editor-toolbar {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  background: color-mix(in srgb, var(--surface-primary, #fff) 88%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border-color, rgba(0, 0, 0, 0.06));
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.tb-icon-btn {
  display: inline-flex;
  padding: 8px;
  border: 0;
  border-radius: 12px;
  background: var(--surface-secondary, #f2f2f7);
  color: var(--text-primary, #1d1d1f);
  cursor: pointer;
}

.tb-title-input {
  flex: 1;
  min-width: 0;
  max-width: 320px;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  font-size: 16px;
  font-weight: 650;
  color: var(--text-primary, #1d1d1f);
  outline: none;
}

.tb-title-input:hover { background: var(--surface-secondary, #f2f2f7); }
.tb-title-input:focus { border-color: var(--brand, #0a84ff); background: var(--surface-primary, #fff); }

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.tb-dirty-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #ff9f0a;
}

.tb-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease, background 0.15s ease;
}

.tb-btn.ghost {
  border: 1px solid var(--border-color, #e5e5ea);
  background: var(--surface-primary, #fff);
  color: var(--text-primary, #1d1d1f);
}

.tb-btn.ghost:hover:not(:disabled) { background: var(--surface-secondary, #f2f2f7); }

.tb-btn.primary {
  border: 0;
  background: var(--brand, #0a84ff);
  color: #fff;
}

.tb-btn.primary:hover:not(:disabled) { opacity: 0.85; }
.tb-btn:disabled { opacity: 0.5; cursor: default; }

.editor-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
}

.loading-skeleton {
  width: min(760px, 92%);
  height: 420px;
  border-radius: 20px;
  background: linear-gradient(90deg, #ececec 25%, #f6f6f6 50%, #ececec 75%);
  background-size: 200% 100%;
  animation: editor-shimmer 1.4s ease infinite;
}

@keyframes editor-shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

.editor-error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
}

.editor-error h2 { margin: 0; font-size: 20px; }
.editor-error p { margin: 0; font-size: 14px; color: var(--text-secondary, #515154); }

.editor-workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 260px;
  gap: 14px;
  padding: 14px 20px;
  align-items: stretch;
}

.ws-pool,
.ws-settings {
  max-height: calc(100vh - 220px);
}

.editor-strip {
  margin: 0 20px;
  margin-bottom: 16px;
}

@media (max-width: 1080px) {
  .editor-workspace {
    grid-template-columns: 200px minmax(0, 1fr);
  }
  .ws-settings {
    grid-column: 1 / -1;
    max-height: none;
  }
}

@media (max-width: 720px) {
  .editor-workspace {
    display: flex;
    flex-direction: column;
  }
  .ws-pool {
    max-height: 300px;
  }
  .ws-pool :deep(.pool-grid) {
    grid-template-columns: repeat(4, 1fr);
  }
  .editor-toolbar {
    flex-wrap: wrap;
  }
  .tb-title-input { max-width: none; }
}
</style>
