/**
 * 影集编辑器状态与动作（单页完成创作，设计文档 §4）
 *
 * 页面流约定：pages[0] 恒为封面页（pageType='cover'，渲染取 album 封面，不可删除）；
 * 其后为章节/内容页，末尾通常有尾页（pageType='end'）。
 * 照片池为本集照片；页面 photoRefs 按 id 引用照片池。
 */

import { computed, ref } from 'vue';
import {
  addAlbumPhotos,
  deleteAlbumPhoto,
  getMyAlbum,
  saveAlbumPages,
  updateAlbum,
  updatePhotoCaption
} from '@/utils/api/photo-albums-api.js';
import { buildAutoLayoutPages, appendPhotosToPages } from '@/utils/photo-albums/auto-layout.js';
import { getLayout } from '@/utils/photo-albums/layouts.js';
import { checkPhotoQuota } from '@/utils/photo-albums/quota.js';

export function useAlbumEditor() {
  const album = ref(null);
  const photos = ref([]);
  const pages = ref([]);
  const currentIndex = ref(0);
  const isLoading = ref(true);
  const isSaving = ref(false);
  const isUploading = ref(false);
  const isDirty = ref(false);
  const loadError = ref('');

  const uploadAbortController = ref(null);

  const usedPhotoIds = computed(() => {
    const set = new Set();
    for (const page of pages.value) {
      for (const id of page.photoRefs || []) set.add(String(id));
    }
    return set;
  });

  const unusedPhotos = computed(() => photos.value.filter((p) => !usedPhotoIds.value.has(String(p.id))));

  const currentPage = computed(() => pages.value[currentIndex.value] || null);

  const isCoverPage = computed(() => currentPage.value?.pageType === 'cover');

  function markDirty() {
    isDirty.value = true;
  }

  function ensureCoverPage() {
    if (!pages.value.length || pages.value[0]?.pageType !== 'cover') {
      pages.value.unshift({
        pageType: 'cover',
        layoutId: 'full',
        chapterTitle: '',
        note: '',
        photoRefs: []
      });
    }
  }

  async function load(albumId) {
    isLoading.value = true;
    loadError.value = '';
    const result = await getMyAlbum(albumId);
    if (!result.ok) {
      loadError.value = result.error || '影集不存在或无权访问';
      isLoading.value = false;
      return false;
    }
    album.value = result.data.album;
    photos.value = result.data.photos;
    pages.value = result.data.pages.map((p) => ({
      pageType: p.pageType,
      layoutId: p.layoutId,
      chapterTitle: p.chapterTitle,
      note: p.note,
      photoRefs: [...p.photoRefs]
    }));
    ensureCoverPage();
    currentIndex.value = 0;
    isDirty.value = false;
    isLoading.value = false;
    return true;
  }

  /**
   * 保存：基础信息 + 页面流
   */
  async function save() {
    if (!album.value || isSaving.value) return { ok: false, error: '正在保存中' };
    isSaving.value = true;
    try {
      const baseResult = await updateAlbum(album.value.id, {
        title: album.value.title,
        subtitle: album.value.subtitle,
        coverUrl: album.value.coverUrl
      });
      if (!baseResult.ok) return { ok: false, error: baseResult.error };
      album.value = baseResult.data;

      const pagesResult = await saveAlbumPages(album.value.id, pages.value);
      if (!pagesResult.ok) return { ok: false, error: pagesResult.error };
      isDirty.value = false;
      return { ok: true, error: null };
    } finally {
      isSaving.value = false;
    }
  }

  /**
   * 上传照片进照片池：审核 → 压缩 → 上传 → 入库 → 自动追加进页面流
   * @param {File[]} files
   * @param {object} [options] {onProgress?(done,total,stage), onPhotoRejected?({name,reason})}
   */
  async function uploadPhotos(files, options = {}) {
    if (!album.value || !files?.length) return { ok: false, added: 0, error: '没有可上传的文件' };

    const quota = await checkPhotoQuota(album.value.id, files.length);
    if (!quota.allowed) {
      return { ok: false, added: 0, error: quota.hint || `单集照片数已达上限（${quota.limit} 张）` };
    }

    const { moderateImageWithFallback } = await import('@/utils/image-moderation-pipeline.js');
    const { compressImageFileToUploadLimit, getImageCompressionPlan } = await import('@/utils/image-compression.js');
    const { uploadImageToCloudinary } = await import('@/utils/cloudinary-client.js');

    isUploading.value = true;
    uploadAbortController.value = new AbortController();
    const { signal } = uploadAbortController.value;

    const uploadedRows = [];
    try {
      const total = files.length;
      for (let i = 0; i < total; i += 1) {
        if (signal.aborted) break;
        const file = files[i];
        const report = (stage) => options.onProgress?.(i, total, stage);

        try {
          report('审核中');
          const moderation = await moderateImageWithFallback(file, { signal });
          if (moderation.status !== 'approved') {
            options.onPhotoRejected?.({ name: file.name, reason: moderation.reason || '未通过安全检测' });
            continue;
          }

          report('压缩中');
          const plan = await getImageCompressionPlan(file, { optimizeForUpload: true });
          const payload = plan.shouldCompress
            ? await compressImageFileToUploadLimit(file, plan, { signal })
            : file;

          report('上传中');
          const uploaded = await uploadImageToCloudinary(payload, {
            folder: 'photo-album',
            pendingSource: 'photo-album',
            signal
          });

          const width = Number(uploaded?.width || plan.dimensions?.width || 0);
          const height = Number(uploaded?.height || plan.dimensions?.height || 0);
          const ratio = width && height
            ? (Math.abs(width - height) <= Math.max(width, height) * 0.08 ? 'square' : (width > height ? 'landscape' : 'portrait'))
            : 'landscape';

          uploadedRows.push({
            url: uploaded.secure_url,
            publicId: uploaded.public_id || '',
            width,
            height,
            ratio,
            moderationStatus: 'approved',
            moderationScore: Number(moderation.score || 0),
            moderationSource: moderation.source || 'auto',
            createdAt: new Date(file.lastModified || Date.now()).toISOString()
          });
        } catch (photoError) {
          if (photoError?.name === 'AbortError') break;
          options.onPhotoRejected?.({ name: file?.name || '图片', reason: photoError?.message || '上传失败' });
        }
      }

      if (signal.aborted && !uploadedRows.length) {
        return { ok: false, added: 0, error: '已取消上传' };
      }

      if (uploadedRows.length) {
        report('入库中');
        const insertResult = await addAlbumPhotos(album.value.id, uploadedRows);
        if (!insertResult.ok) return { ok: false, added: 0, error: insertResult.error };

        // addAlbumPhotos 保序插入：data[i] 对应 uploadedRows[i]
        const newPhotos = insertResult.data.map((photo, idx) => ({
          ...photo,
          createdAt: uploadedRows[idx]?.createdAt
        }));
        photos.value = [...photos.value, ...newPhotos];

        const { pages: nextPages, changed } = appendPhotosToPages(pages.value, newPhotos);
        if (changed) {
          pages.value = nextPages;
          markDirty();
        }
      }
      return { ok: true, added: uploadedRows.length, error: null };
    } finally {
      isUploading.value = false;
      uploadAbortController.value = null;
    }
  }

  function cancelUpload() {
    uploadAbortController.value?.abort();
  }

  /**
   * 从照片池删除照片：同时从所有页面引用中移除
   */
  async function removePhoto(photo) {
    const result = await deleteAlbumPhoto(album.value.id, photo.id);
    if (!result.ok) return result;
    photos.value = photos.value.filter((p) => p.id !== photo.id);
    pages.value = pages.value.map((page) => ({
      ...page,
      photoRefs: (page.photoRefs || []).filter((id) => String(id) !== String(photo.id))
    }));
    markDirty();
    return result;
  }

  /**
   * 更新配文（本地 + 落库，由调用方在输入提交时触发）
   */
  async function setCaption(photoId, caption) {
    const photo = photos.value.find((p) => String(p.id) === String(photoId));
    if (photo) photo.caption = String(caption || '').slice(0, 300);
    const result = await updatePhotoCaption(photoId, caption);
    return result;
  }

  function setCurrentIndex(index) {
    if (index >= 0 && index < pages.value.length) {
      currentIndex.value = index;
    }
  }

  function setPageLayout(layoutId) {
    const page = currentPage.value;
    if (!page || page.pageType !== 'content') return;
    const layout = getLayout(layoutId);
    // 收窄槽位时把多余照片退回照片池
    if ((page.photoRefs || []).length > layout.maxPhotos) {
      page.photoRefs = page.photoRefs.slice(0, layout.maxPhotos);
    }
    page.layoutId = layout.id;
    markDirty();
  }

  function updateCurrentPage(patch = {}) {
    const page = currentPage.value;
    if (!page) return;
    if (patch.chapterTitle !== undefined) page.chapterTitle = String(patch.chapterTitle).slice(0, 80);
    if (patch.note !== undefined) page.note = String(patch.note).slice(0, 500);
    markDirty();
  }

  /**
   * 把照片放入当前页下一个空槽（点击照片池或拖入画布）
   */
  function addPhotoToCurrentPage(photoId) {
    const page = currentPage.value;
    if (!page || page.pageType !== 'content') return { ok: false, error: '当前页不接受照片' };
    const layout = getLayout(page.layoutId);
    if ((page.photoRefs || []).length >= layout.maxPhotos) {
      return { ok: false, error: `当前版式最多 ${layout.maxPhotos} 张照片` };
    }
    if (page.photoRefs.some((id) => String(id) === String(photoId))) {
      return { ok: false, error: '这张照片已在当前页' };
    }
    page.photoRefs = [...(page.photoRefs || []), String(photoId)];
    markDirty();
    return { ok: true, error: null };
  }

  function removePhotoFromPage(pageIndex, slotIndex) {
    const page = pages.value[pageIndex];
    if (!page) return;
    page.photoRefs = (page.photoRefs || []).filter((_, i) => i !== slotIndex);
    markDirty();
  }

  function addPageAfterCurrent(pageType = 'content') {
    const insertAt = Math.min(currentIndex.value + 1, pages.value.length);
    pages.value.splice(insertAt, 0, {
      pageType,
      layoutId: pageType === 'content' ? 'full' : 'full',
      chapterTitle: '',
      note: '',
      photoRefs: []
    });
    currentIndex.value = insertAt;
    markDirty();
  }

  function removePage(index) {
    if (index <= 0 || index >= pages.value.length) return { ok: false, error: '封面页不可删除' };
    if (pages.value.length <= 2) return { ok: false, error: '至少保留一个页面' };
    pages.value.splice(index, 1);
    if (currentIndex.value >= pages.value.length) {
      currentIndex.value = pages.value.length - 1;
    }
    markDirty();
    return { ok: true, error: null };
  }

  /**
   * 原生 HTML5 DnD 换序：from → to
   */
  function movePage(from, to) {
    if (from === to || from <= 0 || from >= pages.value.length) return;
    if (to <= 0) to = 1;
    const [moved] = pages.value.splice(from, 1);
    pages.value.splice(Math.min(to, pages.value.length), 0, moved);
    currentIndex.value = pages.value.indexOf(moved);
    markDirty();
  }

  /**
   * 自动初排：按时间聚类+横竖比重排全部内容页（保留封面页）
   */
  function autoArrange() {
    const contentPhotos = photos.value;
    const generated = buildAutoLayoutPages(contentPhotos);
    pages.value = [
      pages.value[0]?.pageType === 'cover' ? pages.value[0] : { pageType: 'cover', layoutId: 'full', chapterTitle: '', note: '', photoRefs: [] },
      ...generated
    ];
    currentIndex.value = pages.value.length > 1 ? 1 : 0;
    markDirty();
  }

  async function updateCover(coverUrl) {
    if (!album.value) return;
    album.value.coverUrl = coverUrl;
    markDirty();
    await updateAlbum(album.value.id, { coverUrl });
  }

  return {
    // 状态
    album,
    photos,
    pages,
    currentIndex,
    currentPage,
    isCoverPage,
    isLoading,
    isSaving,
    isUploading,
    isDirty,
    loadError,
    unusedPhotos,
    usedPhotoIds,
    // 动作
    load,
    save,
    uploadPhotos,
    cancelUpload,
    removePhoto,
    setCaption,
    setCurrentIndex,
    setPageLayout,
    updateCurrentPage,
    addPhotoToCurrentPage,
    removePhotoFromPage,
    addPageAfterCurrent,
    removePage,
    movePage,
    autoArrange,
    updateCover,
    markDirty
  };
}
