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
  updatePhotoCaption,
} from '@/utils/api/photo-albums-api.js';
import { buildAutoLayoutPages, appendPhotosToPages } from '@/utils/photo-albums/auto-layout.js';
import { getLayout } from '@/utils/photo-albums/layouts.js';
import { checkPhotoQuota } from '@/utils/photo-albums/quota.js';
import { resolveCloudUploadConcurrency } from '@/utils/cloud-upload-guard.js';

/**
 * 云端审核的**分块大小**：批量入口 `moderateImagesWithFallback` 会把一个块里的图
 * 合进**一次**云端请求（省配额与限流计数，也省掉 N-1 次串行往返）。
 * 不一次全塞的两个原因：① 批量超时是 12s，图越多越容易整块超时回落本地；
 * ② 块内每张都要在主线程解码一次全分辨率原图（见 moderation pipeline 的 DECODE_CONCURRENCY）。
 * 6 是「一次请求的收益」与「超时 / 内存风险」之间的折中。
 */
const MODERATION_CHUNK_SIZE = 6;

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

  const unusedPhotos = computed(() =>
    photos.value.filter((p) => !usedPhotoIds.value.has(String(p.id))),
  );

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
        photoRefs: [],
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
      photoRefs: [...p.photoRefs],
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
        coverUrl: album.value.coverUrl,
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
   *
   * 流水线（2026-10-03 提速改造，2026-10-04 审核批量化的补充）：
   * - **审核阶段：分块批量**（`MODERATION_CHUNK_SIZE` = 6 张/次，走 `moderateImagesWithFallback`）
   *   —— 一个块合进**一次**云端请求，取代此前「每张一次」。
   *   块内整批失败时退回逐张（`moderateChunkIndividually`），保证一张坏图不连坐其他张。
   *   ⚠️ 不放开审核的**并发**：云端审核是配额/限流计数的来源，本地兜底走 tfjs WebGL
   *   （`forum-image-moderation.js` 的 `classifyMutex` 不允许并发 classify）。这条与论坛同口径。
   * - **「压缩 → 上传」进入并发池**（默认 3 路，与 `forum-images-api.js` 的
   *   `MAX_CONCURRENT_UPLOADS` 同口径；`hardwareConcurrency <= 4` 的低配机降为 2 路）。
   *   改造前整批是**纯串行**，N 张图耗时 = N ×（审核 + 压缩 + 签名 + 上传）；
   *   现在第 i 张在上传时第 i+1 块已在审核，总耗时 ≈
   *   max(审核总时长, (压缩+上传)总时长 / 并发数)。
   *   峰值负载仍低于论坛链路（论坛是 2 路压缩 + 3 路上传并存，这里是 3 路择一）。
   * - 结果**按下标落位** ⇒ 与改造前一样保序（`addAlbumPhotos` 依赖顺序写 `sort_order`）。
   *
   * 回调约定：
   * - onProgress(done, total, stage)    已落定张数 / 总数 + 阶段文案
   * - onPhotoRejected({name, reason})   保留旧回调，**调用方应不展示 UI**（避免逐张通知风暴）
   * - onUploadedSummary({total, added, rejected: [{name, reason}]})
   *     整批结束后一次性回调；调用方把 rejected 一次性渲染到聚合岛（UploadResultIsland）
   *     —— **新逻辑唯一真源**，不要在这里 notify。
   *
   * @param {File[]} files
   * @param {object} [options] { onProgress?, onPhotoRejected?, onUploadedSummary? }
   */
  async function uploadPhotos(files, options = {}) {
    if (!album.value || !files?.length) return { ok: false, added: 0, error: '没有可上传的文件' };

    const quota = await checkPhotoQuota(album.value.id, files.length);
    if (!quota.allowed) {
      return {
        ok: false,
        added: 0,
        error: quota.hint || `单集照片数已达上限（${quota.limit} 张）`,
      };
    }

    const { moderateImageWithFallback, moderateImagesWithFallback } =
      await import('@/utils/image-moderation-pipeline.js');
    const { compressImageFileToUploadLimit, getImageCompressionPlan } =
      await import('@/utils/image-compression.js');
    const { uploadImageToCloudinary } = await import('@/utils/cloudinary-client.js');

    isUploading.value = true;
    uploadAbortController.value = new AbortController();
    const { signal } = uploadAbortController.value;

    const total = files.length;
    const rejected = []; // 整批累计，避免逐张 callback → UI 通知风暴
    const rowByIndex = []; // 稀疏数组：按下标落位，保证入库顺序 == 选图顺序
    let settledCount = 0; // 已落定（成功 / 被拒 / 失败）张数，仅用于进度
    let uploadedCount = 0;
    let producerDone = false; // 审核阶段是否走完，仅用于阶段文案

    const report = () =>
      options.onProgress?.(settledCount, total, producerDone ? '上传中' : '审核中');

    // ---------- 「压缩 → 上传」并发池 ----------
    const concurrency = resolveCloudUploadConcurrency();
    const queue = [];
    let activeCount = 0;
    let drainResolve = null;
    const drained = new Promise((resolve) => {
      drainResolve = resolve;
    });

    const pump = () => {
      while (activeCount < concurrency && queue.length) {
        const runJob = queue.shift();
        activeCount += 1;
        runJob()
          .catch(() => {})
          .finally(() => {
            activeCount -= 1;
            settledCount += 1;
            report();
            if (queue.length || activeCount) pump();
            else drainResolve();
          });
      }
    };

    const makeUploadJob = (index, file, moderation) => async () => {
      if (signal.aborted) return;
      try {
        const plan = await getImageCompressionPlan(file, { optimizeForUpload: true });
        const payload = plan.shouldCompress
          ? await compressImageFileToUploadLimit(file, plan, { signal })
          : file;

        const uploaded = await uploadImageToCloudinary(payload, {
          folder: 'photo-album',
          pendingSource: 'photo-album',
          signal,
        });

        const width = Number(uploaded?.width || plan.dimensions?.width || 0);
        const height = Number(uploaded?.height || plan.dimensions?.height || 0);
        const ratio =
          width && height
            ? Math.abs(width - height) <= Math.max(width, height) * 0.08
              ? 'square'
              : width > height
                ? 'landscape'
                : 'portrait'
            : 'landscape';

        rowByIndex[index] = {
          url: uploaded.secure_url,
          publicId: uploaded.public_id || '',
          width,
          height,
          ratio,
          moderationStatus: 'approved',
          moderationScore: Number(moderation?.score || 0),
          moderationSource: moderation?.source || 'auto',
          createdAt: new Date(file.lastModified || Date.now()).toISOString(),
          // 仅供入库失败时定位文件名，不会落库（addAlbumPhotos 按白名单取字段）
          sourceIndex: index,
        };
        uploadedCount += 1;
      } catch (photoError) {
        if (photoError?.name === 'AbortError') return;
        const entry = { name: file?.name || '图片', reason: photoError?.message || '上传失败' };
        rejected.push(entry);
        options.onPhotoRejected?.(entry);
      }
    };

    /**
     * 逐张审核兜底：分块批量通道整块失败时使用（例如块内有一张图解不开）。
     * 目的是保证「一张坏图不连坐同块的其他张」——与逐张改造前的语义一致。
     * 返回稀疏数组：已取消的槽位留空，调用方按 `signal.aborted` 提前退出即可。
     */
    const moderateChunkIndividually = async (chunkFiles) => {
      const verdicts = [];
      for (let i = 0; i < chunkFiles.length; i += 1) {
        if (signal.aborted) break;
        try {
          verdicts[i] = await moderateImageWithFallback(chunkFiles[i], { signal });
        } catch (error) {
          if (error?.name === 'AbortError') break;
          verdicts[i] = {
            status: 'rejected',
            score: 0,
            reason: error?.message || '图片安全检测失败',
            source: 'local_fallback_error',
          };
        }
      }
      return verdicts;
    };

    try {
      // ---------- 生产者：分块批量审核（一次请求审多张），通过一张就丢进并发池 ----------
      for (let chunkStart = 0; chunkStart < total; chunkStart += MODERATION_CHUNK_SIZE) {
        if (signal.aborted) break;
        const chunkFiles = files.slice(chunkStart, chunkStart + MODERATION_CHUNK_SIZE);
        report();

        let verdicts;
        try {
          verdicts = await moderateImagesWithFallback(chunkFiles, { signal });
        } catch (chunkError) {
          if (chunkError?.name === 'AbortError') break;
          // 整块通道失败 ⇒ 退回逐张，避免一张坏图把同块其余张一起判死
          verdicts = await moderateChunkIndividually(chunkFiles);
        }

        for (let i = 0; i < chunkFiles.length; i += 1) {
          if (signal.aborted) break;
          const file = chunkFiles[i];
          const moderation = verdicts[i];
          if (!moderation || moderation.status !== 'approved') {
            const entry = { name: file.name, reason: moderation?.reason || '未通过安全检测' };
            rejected.push(entry);
            options.onPhotoRejected?.(entry); // 旧回调保留，调用方应忽视 UI
            settledCount += 1;
            continue;
          }
          queue.push(makeUploadJob(chunkStart + i, file, moderation));
          pump();
        }
        report();
      }

      producerDone = true;
      report();
      // 队列与在飞任务都空时才不必等（否则 drained 永远不会 resolve）
      if (queue.length || activeCount) await drained;

      if (signal.aborted && !uploadedCount) {
        // 提前取消且没有成功入库 → 一次性回调，剩下的也明示给调用方
        options.onUploadedSummary?.({ total, added: 0, rejected });
        return { ok: false, added: 0, error: '已取消上传' };
      }

      if (uploadedCount) {
        options.onProgress?.(total, total, '入库中');
        const rows = rowByIndex.filter(Boolean); // 稀疏数组去洞 ⇒ 升序，保持原选图顺序
        const insertResult = await addAlbumPhotos(album.value.id, rows);
        if (!insertResult.ok) {
          // 入库失败：把整批（含已上传）作为被拒回传，让聚合岛展示可执行回退
          const failed = rows.map((row, idx) => ({
            name: files[row.sourceIndex]?.name || `第 ${idx + 1} 张`,
            reason: insertResult.error || '入库失败',
          }));
          options.onUploadedSummary?.({ total, added: 0, rejected: [...rejected, ...failed] });
          return { ok: false, added: 0, error: insertResult.error };
        }

        // addAlbumPhotos 保序插入：data[i] 对应 rows[i]
        const newPhotos = insertResult.data.map((photo, idx) => ({
          ...photo,
          createdAt: rows[idx]?.createdAt,
        }));
        photos.value = [...photos.value, ...newPhotos];

        const { pages: nextPages, changed } = appendPhotosToPages(pages.value, newPhotos);
        if (changed) {
          pages.value = nextPages;
          markDirty();
        }
      }
      options.onUploadedSummary?.({ total, added: uploadedCount, rejected });
      return { ok: true, added: uploadedCount, error: null };
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
      photoRefs: (page.photoRefs || []).filter((id) => String(id) !== String(photo.id)),
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
    if (patch.chapterTitle !== undefined)
      page.chapterTitle = String(patch.chapterTitle).slice(0, 80);
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
      photoRefs: [],
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
      pages.value[0]?.pageType === 'cover'
        ? pages.value[0]
        : { pageType: 'cover', layoutId: 'full', chapterTitle: '', note: '', photoRefs: [] },
      ...generated,
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
    markDirty,
  };
}
