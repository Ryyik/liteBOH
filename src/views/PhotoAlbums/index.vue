<template>
  <div class="photo-albums-page">
    <main class="pa-main">
      <header class="pa-header">
        <div class="pa-heading">
          <span class="pa-kicker"><Camera :size="14" :stroke-width="2.2" aria-hidden="true" /> PHOTO ALBUMS</span>
          <h1>我的摄影集</h1>
          <p>上传照片，自动初排成页，亲手装帧一本可以翻阅、可以带走的影集。</p>
        </div>
        <button type="button" class="pa-create-btn" :disabled="creating" @click="openCreateModal">
          <Plus :size="16" :stroke-width="2.4" aria-hidden="true" />
          {{ creating ? '创建中…' : '新建影集' }}
        </button>
      </header>

      <div v-if="quotaInfo" class="pa-quota-bar" aria-label="影集配额">
        <span v-if="quotaInfo.limit === -1">影集数量不限</span>
        <span v-else>{{ quotaInfo.used }} / {{ quotaInfo.limit }} 本影集</span>
      </div>

      <section v-if="isLoading" class="pa-grid" aria-hidden="true">
        <article v-for="item in 3" :key="item" class="pa-card skeleton">
          <div class="pa-cover skeleton-block"></div>
          <div class="pa-card-body">
            <div class="skeleton-block line"></div>
            <div class="skeleton-block line short"></div>
          </div>
        </article>
      </section>

      <section v-else-if="loadError" class="pa-empty">
        <h2>影集加载失败</h2>
        <p>{{ loadError }}</p>
        <button type="button" class="pa-secondary-btn" @click="loadAlbums">重试</button>
      </section>

      <section v-else-if="!albums.length" class="pa-empty">
        <span class="pa-empty-icon"><Camera :size="30" :stroke-width="1.6" aria-hidden="true" /></span>
        <h2>还没有影集</h2>
        <p>从一次旅行、一个季节或一段故事开始，装帧你的第一本影集。</p>
        <button type="button" class="pa-primary-btn" @click="openCreateModal">新建影集</button>
      </section>

      <section v-else class="pa-grid">
        <article v-for="album in albums" :key="album.id" class="pa-card">
          <RouterLink :to="`/studio/albums/${album.id}`" class="pa-cover" :aria-label="`编辑 ${album.title}`">
            <img v-if="album.coverUrl" :src="album.coverUrl" :alt="album.title" loading="lazy" decoding="async"
              @error="onCoverError(album, $event)" />
            <span v-else class="pa-cover-placeholder"><Camera :size="26" :stroke-width="1.6" aria-hidden="true" /></span>
            <span class="pa-status" :class="album.status">{{ statusLabel(album.status) }}</span>
            <span v-if="album.sharedToCommunity" class="pa-shared-badge"><Share2 :size="12" :stroke-width="2.2" aria-hidden="true" /> 已分享</span>
          </RouterLink>
          <div class="pa-card-body">
            <h2>{{ album.title }}</h2>
            <p v-if="album.subtitle" class="pa-subtitle">{{ album.subtitle }}</p>
            <div class="pa-meta">
              <span><Images :size="13" :stroke-width="2" aria-hidden="true" /> {{ album.photoCount }} 张</span>
              <span>{{ formatTime(album.updatedAt) }}</span>
            </div>
            <div class="pa-actions">
              <button type="button" class="pa-action" @click="goEditor(album)">编辑</button>
              <button type="button" class="pa-action" :disabled="album.photoCount === 0" @click="goReader(album)">阅读</button>
              <button type="button" class="pa-action" :disabled="album.photoCount === 0" @click="downloadOffline(album)">
                {{ exportingId === album.id ? '导出中…' : '下载 HTML' }}
              </button>
              <button type="button" class="pa-action" :class="{ danger: !album.sharedToCommunity }" :disabled="album.photoCount === 0"
                @click="toggleShare(album)">
                {{ album.sharedToCommunity ? '取消分享' : '分享到社区' }}
              </button>
              <button type="button" class="pa-action danger" @click="removeAlbum(album)">删除</button>
            </div>
          </div>
        </article>
      </section>
    </main>

    <!-- 新建影集弹窗 -->
    <Transition name="pa-modal">
      <div v-if="showCreateModal" class="pa-modal-overlay" @click.self="closeCreateModal">
        <div class="pa-modal" role="dialog" aria-modal="true" aria-label="新建影集">
          <header class="pa-modal-head">
            <h3>新建影集</h3>
            <button type="button" class="pa-modal-close" aria-label="关闭" @click="closeCreateModal">
              <X :size="18" :stroke-width="2.2" aria-hidden="true" />
            </button>
          </header>
          <div class="pa-modal-body">
            <label class="pa-field">
              <span>标题</span>
              <input v-model="createForm.title" type="text" maxlength="80" placeholder="例如：山与海的夏天" />
            </label>
            <label class="pa-field">
              <span>副标题（可选）</span>
              <input v-model="createForm.subtitle" type="text" maxlength="120" placeholder="一句话说明这本影集" />
            </label>
            <div class="pa-field">
              <span>封面（可选，可自由裁切）</span>
              <button type="button" class="pa-cover-pick" @click="pickCover">
                <img v-if="createForm.coverUrl" :src="createForm.coverUrl" alt="封面预览" />
                <span v-else><ImagePlus :size="18" :stroke-width="1.8" aria-hidden="true" /> 选择图片</span>
              </button>
              <input ref="coverInputRef" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="onCoverFileChange" />
            </div>
          </div>
          <footer class="pa-modal-foot">
            <button type="button" class="pa-secondary-btn" @click="closeCreateModal">取消</button>
            <button type="button" class="pa-primary-btn" :disabled="createSubmitting" @click="submitCreate">
              {{ createSubmitting ? '创建中…' : '创建并开始编辑' }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>

    <AvatarCropModal v-model:visible="showCoverCrop" :image-src="coverCropSrc" title="裁切封面" shape="rectangle"
      :aspect-ratio="null" hint="拖动选区自由调整构图" sub-hint="封面用于列表与社区入口卡" output-type="image/webp" :output-quality="0.9"
      @confirm="onCoverCropConfirm" />
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Camera, Images, ImagePlus, Plus, Share2, X } from 'lucide-vue-next';
import AvatarCropModal from '@/components/AvatarCropModal.vue';
import { showIsland } from '@/composables/useIsland.js';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';
import {
  createAlbum,
  deleteAlbum,
  listMyAlbums,
  logAlbumExport,
  updateAlbum
} from '@/utils/api/photo-albums-api.js';
import { checkAlbumCountQuota, checkExportQuota } from '@/utils/photo-albums/quota.js';
import { exportAlbumOffline } from '@/utils/photo-albums/offline-export.js';
import { recheckAlbumForShare } from '@/utils/photo-albums/share-moderation.js';
import { compressImageFileToUploadLimit, getImageCompressionPlan } from '@/utils/image-compression.js';
import { uploadImageToCloudinary } from '@/utils/cloudinary-client.js';
import { normalizeDbError } from '@/utils/request-core.js';

const router = useRouter();
const { confirm } = useConfirmDialog();

const albums = ref([]);
const isLoading = ref(true);
const loadError = ref('');
const quotaInfo = ref(null);

const creating = ref(false);
const showCreateModal = ref(false);
const createSubmitting = ref(false);
const createForm = ref({ title: '', subtitle: '', coverUrl: '' });

const showCoverCrop = ref(false);
const coverCropSrc = ref('');
const coverRawFile = ref(null);
const coverInputRef = ref(null);
const coverUploading = ref(false);

const exportingId = ref('');

function statusLabel(status) {
  return status === 'published' ? '已发布' : '草稿';
}

function formatTime(value) {
  const t = Date.parse(value || '');
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function onCoverError(album, event) {
  if (event?.target) {
    event.target.style.display = 'none';
  }
  album.coverUrl = '';
}

async function loadAlbums() {
  isLoading.value = true;
  loadError.value = '';
  const result = await listMyAlbums();
  if (result.ok) {
    albums.value = result.data;
  } else {
    loadError.value = result.error || '读取影集失败';
  }
  isLoading.value = false;
  checkAlbumCountQuota().then((quota) => {
    quotaInfo.value = quota;
  }).catch(() => {});
}

// ---------- 新建 ----------
async function openCreateModal() {
  creating.value = true;
  try {
    const quota = await checkAlbumCountQuota();
    quotaInfo.value = quota;
    if (!quota.allowed) {
      showIsland.notify({ type: 'warning', title: '影集数量已达上限', message: quota.hint || '升级订阅可获得更多影集' });
      return;
    }
    createForm.value = { title: '', subtitle: '', coverUrl: '' };
    showCreateModal.value = true;
  } finally {
    creating.value = false;
  }
}

function closeCreateModal() {
  if (createSubmitting.value) return;
  showCreateModal.value = false;
}

async function submitCreate() {
  if (createSubmitting.value) return;
  createSubmitting.value = true;
  try {
    const result = await createAlbum({
      title: createForm.value.title,
      subtitle: createForm.value.subtitle,
      coverUrl: createForm.value.coverUrl
    });
    if (!result.ok) {
      showIsland.notify({ type: 'error', title: '创建失败', message: result.error || '请稍后再试' });
      return;
    }
    showCreateModal.value = false;
    showIsland.notify({ type: 'success', title: '影集已创建', message: '去上传照片，自动初排成页' });
    router.push(`/studio/albums/${result.data.id}`);
  } finally {
    createSubmitting.value = false;
  }
}

// ---------- 封面 ----------
function pickCover() {
  coverInputRef.value?.click();
}

function onCoverFileChange(event) {
  const file = event?.target?.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
    showIsland.notify({ type: 'warning', title: '格式不支持', message: '封面仅支持 JPG / PNG / WebP' });
    return;
  }
  coverRawFile.value = file;
  coverCropSrc.value = URL.createObjectURL(file);
  showCoverCrop.value = true;
}

async function onCoverCropConfirm(blob) {
  showCoverCrop.value = false;
  if (!blob || coverUploading.value) return;
  coverUploading.value = true;
  try {
    const plan = await getImageCompressionPlan(blob);
    const file = plan.shouldCompress
      ? await compressImageFileToUploadLimit(blob, plan)
      : blob;
    const uploaded = await uploadImageToCloudinary(file, {
      folder: 'photo-album',
      pendingSource: 'photo-album'
    });
    createForm.value.coverUrl = uploaded?.secure_url || '';
    showIsland.notify({ type: 'success', title: '封面已就绪', message: '创建影集后可随时更换' });
  } catch (error) {
    showIsland.notify({ type: 'error', title: '封面上传失败', message: normalizeDbError(error, '请稍后再试') });
  } finally {
    coverUploading.value = false;
    if (coverCropSrc.value) {
      URL.revokeObjectURL(coverCropSrc.value);
      coverCropSrc.value = '';
    }
    coverRawFile.value = null;
  }
}

// ---------- 跳转 ----------
function goEditor(album) {
  router.push(`/studio/albums/${album.id}`);
}

function goReader(album) {
  router.push(`/albums/${album.id}`);
}

// ---------- 分享 ----------
async function toggleShare(album) {
  if (album.sharedToCommunity) {
    const ok = await confirm({
      title: '取消分享',
      message: `「${album.title}」将从社区影集区下架，已拿到的链接也会失效。`,
      confirmText: '取消分享',
      tone: 'warning'
    });
    if (!ok) return;
    const result = await updateAlbum(album.id, { sharedToCommunity: false });
    if (result.ok) {
      album.sharedToCommunity = false;
      showIsland.notify({ type: 'success', title: '已取消分享' });
    } else {
      showIsland.notify({ type: 'error', title: '操作失败', message: result.error });
    }
    return;
  }

  const ok = await confirm({
    title: '分享到社区',
    message: '分享前会对全部照片做一次安全复审，通过后影集将出现在社区影集区，任何人可阅读。',
    confirmText: '开始复审并分享'
  });
  if (!ok) return;

  const task = showIsland.task({ title: '分享前复审', progress: 0 });
  try {
    const recheck = await recheckAlbumForShare(album.id, {
      onProgress: (done, total) => task.progress(Math.round((done / Math.max(total, 1)) * 100))
    });
    if (!recheck.ok) {
      task.close();
      if (recheck.error !== 'aborted') {
        showIsland.notify({ type: 'error', title: '无法分享', message: recheck.error });
      }
      return;
    }
    const result = await updateAlbum(album.id, { status: 'published', sharedToCommunity: true });
    if (result.ok) {
      album.sharedToCommunity = true;
      album.status = 'published';
      // success() 会在停留展示后自动收起，不要再手动 close()
      task.success({ title: '已分享到社区', message: '社区影集区现在可以看到这本影集了' });
    } else {
      task.close();
      showIsland.notify({ type: 'error', title: '分享失败', message: result.error });
    }
  } catch {
    task.close();
  }
}

// ---------- 导出 ----------
async function downloadOffline(album) {
  if (exportingId.value) return;
  exportingId.value = album.id;
  try {
    const quota = await checkExportQuota();
    if (!quota.allowed) {
      showIsland.notify({ type: 'warning', title: '本月导出次数已用完', message: quota.hint || '升级订阅可获得更多导出次数' });
      return;
    }
    const { getMyAlbum } = await import('@/utils/api/photo-albums-api.js');
    const bundle = await getMyAlbum(album.id);
    if (!bundle.ok) {
      showIsland.notify({ type: 'error', title: '导出失败', message: bundle.error });
      return;
    }
    const task = showIsland.task({ title: '正在打包离线影集', progress: 0 });
    try {
      const result = await exportAlbumOffline(bundle.data, {
        onProgress: (done, total) => task.progress(Math.round((done / Math.max(total, 1)) * 100))
      });
      await logAlbumExport(album.id, result.kind);
      task.success({ title: '导出完成', message: `${result.fileName} 已保存，断网也能翻开` });
    } catch (exportError) {
      task.close();
      throw exportError;
    }
  } catch (error) {
    showIsland.notify({ type: 'error', title: '导出失败', message: normalizeDbError(error, '请稍后再试') });
  } finally {
    exportingId.value = '';
  }
}

// ---------- 删除 ----------
async function removeAlbum(album) {
  const ok = await confirm({
    title: '删除影集',
    message: `「${album.title}」及其全部照片、页面将被永久删除，无法恢复。`,
    confirmText: '永久删除',
    tone: 'danger'
  });
  if (!ok) return;
  const result = await deleteAlbum(album.id);
  if (result.ok) {
    albums.value = albums.value.filter((item) => item.id !== album.id);
    showIsland.notify({ type: 'success', title: '影集已删除' });
  } else {
    showIsland.notify({ type: 'error', title: '删除失败', message: result.error });
  }
}

onMounted(loadAlbums);
</script>

<style scoped>
.photo-albums-page {
  min-height: 100vh;
  background: var(--boh-page-bg, #f4f4f6);
  color: var(--text-primary, #1d1d1f);
}

.pa-main {
  max-width: 1080px;
  margin: 0 auto;
  padding: 32px 20px 80px;
}

.pa-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.pa-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: var(--text-tertiary, #86868b);
}

.pa-header h1 {
  margin: 6px 0 4px;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.pa-header p {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary, #515154);
}

.pa-create-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  border: 0;
  border-radius: 999px;
  background: var(--brand, #0a84ff);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.pa-create-btn:hover { transform: translateY(-1px); }
.pa-create-btn:disabled { opacity: 0.6; cursor: default; }

.pa-quota-bar {
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-tertiary, #86868b);
}

.pa-grid {
  margin-top: 24px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.pa-card {
  display: flex;
  flex-direction: column;
  background: var(--surface-primary, #fff);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.pa-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.1);
}

.pa-cover {
  position: relative;
  display: block;
  aspect-ratio: 4 / 3;
  background: var(--surface-secondary, #f2f2f7);
  overflow: hidden;
}

.pa-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pa-cover-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-quaternary, #c7c7cc);
}

.pa-status {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: rgba(29, 29, 31, 0.55);
  backdrop-filter: blur(6px);
}

.pa-status.published { background: rgba(48, 209, 88, 0.85); }
.pa-status.draft { background: rgba(142, 142, 147, 0.8); }

.pa-shared-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: rgba(10, 132, 255, 0.85);
  backdrop-filter: blur(6px);
}

.pa-card-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.pa-card-body h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pa-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary, #515154);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pa-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--text-tertiary, #86868b);
}

.pa-meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.pa-actions {
  margin-top: auto;
  padding-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pa-action {
  padding: 6px 12px;
  border: 1px solid var(--border-color, #e5e5ea);
  border-radius: 999px;
  background: transparent;
  color: var(--text-primary, #1d1d1f);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.pa-action:hover:not(:disabled) { background: var(--surface-secondary, #f2f2f7); }
.pa-action.danger { color: var(--danger, #ff3b30); border-color: currentColor; }
.pa-action:disabled { opacity: 0.45; cursor: default; }

.pa-empty {
  margin-top: 48px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.pa-empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 22px;
  background: var(--surface-primary, #fff);
  color: var(--text-tertiary, #86868b);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.pa-empty h2 { margin: 4px 0 0; font-size: 20px; }
.pa-empty p { margin: 0; font-size: 14px; color: var(--text-secondary, #515154); }

.pa-primary-btn,
.pa-secondary-btn {
  padding: 10px 18px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.pa-primary-btn {
  border: 0;
  background: var(--brand, #0a84ff);
  color: #fff;
}

.pa-secondary-btn {
  border: 1px solid var(--border-color, #d1d1d6);
  background: var(--surface-primary, #fff);
  color: var(--text-primary, #1d1d1f);
}

.pa-primary-btn:hover,
.pa-secondary-btn:hover { opacity: 0.85; }
.pa-primary-btn:disabled { opacity: 0.6; cursor: default; }

/* 骨架 */
.skeleton-block {
  background: linear-gradient(90deg, #ececec 25%, #f6f6f6 50%, #ececec 75%);
  background-size: 200% 100%;
  animation: pa-shimmer 1.4s ease infinite;
  border-radius: 8px;
}

.pa-card.skeleton .pa-cover { border-radius: 0; }
.pa-card.skeleton .line { height: 14px; margin: 4px 0; }
.pa-card.skeleton .line.short { width: 55%; }

@keyframes pa-shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

/* 弹窗 */
.pa-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
}

.pa-modal {
  width: 100%;
  max-width: 440px;
  max-height: 86vh;
  max-height: 86dvh;
  overflow: auto;
  background: var(--surface-primary, #fff);
  border-radius: 24px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.24);
}

.pa-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 0;
}

.pa-modal-head h3 { margin: 0; font-size: 18px; font-weight: 700; }

.pa-modal-close {
  display: inline-flex;
  padding: 6px;
  border: 0;
  border-radius: 999px;
  background: var(--surface-secondary, #f2f2f7);
  color: var(--text-secondary, #515154);
  cursor: pointer;
}

.pa-modal-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pa-field { display: flex; flex-direction: column; gap: 6px; }

.pa-field > span {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #515154);
}

.pa-field input {
  padding: 10px 14px;
  border: 1px solid var(--border-color, #d1d1d6);
  border-radius: 12px;
  font-size: 14px;
  background: var(--surface-secondary, #f8f8fa);
  color: var(--text-primary, #1d1d1f);
  outline: none;
}

.pa-field input:focus { border-color: var(--brand, #0a84ff); }

.pa-cover-pick {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 130px;
  border: 1.5px dashed var(--border-color, #c7c7cc);
  border-radius: 14px;
  background: var(--surface-secondary, #f8f8fa);
  color: var(--text-tertiary, #86868b);
  font-size: 13px;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.15s ease;
}

.pa-cover-pick:hover { border-color: var(--brand, #0a84ff); }
.pa-cover-pick img { width: 100%; height: 100%; object-fit: cover; }
.pa-cover-pick span { display: inline-flex; align-items: center; gap: 6px; }

.pa-modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 0 20px 20px;
}

.pa-modal-enter-active,
.pa-modal-leave-active { transition: opacity 0.2s ease; }
.pa-modal-enter-active .pa-modal,
.pa-modal-leave-active .pa-modal { transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1); }
.pa-modal-enter-from,
.pa-modal-leave-to { opacity: 0; }
.pa-modal-enter-from .pa-modal,
.pa-modal-leave-to .pa-modal { transform: translateY(16px) scale(0.97); }

@media (max-width: 640px) {
  .pa-main { padding: 20px 14px 64px; }
  .pa-header h1 { font-size: 24px; }
  .pa-grid { grid-template-columns: 1fr; gap: 14px; }
}
</style>
