/**
 * 发帖图片管线 —— 从 ForumMain.vue 外搬（2026-10-30，审查报告 P1-1 第 2 步）。
 *
 * 管的是「选图 → 可用」这一段：选图落位、卡顿提示、压缩/检测/上传三级有界池、
 * 取消与清理、草稿图排序与删除。发布链路（useForumPublishQueue）**消费**这里产出的
 * `draftImagePipelines` 表，所以两边必须拿到同一个 Map 实例 —— 由宿主统一取一次再分别注入。
 *
 * ── 为什么这一段能整体搬 ──────────────────────────────────────────────
 * 它的状态是「一张表 + 三条并发池计数器 + 一个 debounce 定时器」，全是实例级的，
 * 不与宿主的筛选/路由/草稿状态纠缠。对外只有两类出口：模板绑定的几个动作，
 * 以及发布链路要的三张凭据（管线表 / 调度 / 取消）+ 两个纯工具（排序归一 / 云端清理）。
 *
 * ── 依赖注入而不是 import ────────────────────────────────────────────
 * `showModal` / `applyImageUploadRateLimitCooldown` / 冷却读数是宿主的 UI 与冷却子系统，
 * 图片管线只是**使用**它们。用参数传，宿主换实现时这里不用改；直接 import 反而会把
 * 「宿主怎么弹窗」变成这个文件的隐藏契约。
 *
 * ⚠️ 调用点与其他外搬模块一样，必须放在 `<script setup>` 尾部 —— 注入项里有
 * `const` 箭头函数（`showModal` 就在宿主中段才声明），中途调用会 TDZ。
 * 尾部声明对模板绑定与「函数体内运行时调用」都安全。
 */
import { nextTick, onUnmounted } from 'vue';
import {
  FORUM_POST_IMAGE_MAX_COUNT,
  FORUM_UPLOAD_IMAGE_OPTIMIZE_OPTIONS,
} from '../forum-config.js';
import { restoreImageAtPosition } from '../../../utils/forum-helpers.js';
import {
  moderateForumImage,
  uploadApprovedForumImageQueued,
  deleteUploadedForumImage,
  PENDING_REVIEW_STATUS,
} from '../../../utils/api/forum-api.js';

export function useForumDraftImagePipelines(deps) {
  const {
    postImages,
    postImageUploadStatus,
    isUploadingPostImage,
    isSubmitting,
    imageUploadCooldownSeconds,
    imageUploadCooldownLabel,
    showModal,
    applyImageUploadRateLimitCooldown,
    scheduleForumImageModerationPreload,
  } = deps;

  // 云端删除的幂等锁：同一个 deleteToken/publicId 并发删两次会双报错（第二次 404）
  const postImageCleanupLocks = new Set();

  const ensureCanAddPostImage = () => {
    if (postImages.value.length >= FORUM_POST_IMAGE_MAX_COUNT) {
      showModal('warning', '图片已满', `每个帖子最多发布 ${FORUM_POST_IMAGE_MAX_COUNT} 张图片`);
      return false;
    }
    if (imageUploadCooldownSeconds.value > 0) {
      showModal('warning', '图片上传太频繁', `请 ${imageUploadCooldownLabel.value}`);
      return false;
    }
    if (isUploadingPostImage.value || isSubmitting.value) return false;
    return true;
  };

  const openPostImagePicker = (triggerPicker) => {
    if (!ensureCanAddPostImage()) return;
    if (typeof triggerPicker === 'function') {
      triggerPicker();
    }
  };

  const openPostCamera = (triggerCamera) => {
    if (!ensureCanAddPostImage()) return;
    if (typeof triggerCamera === 'function') {
      triggerCamera();
    }
  };

  const revokePostImagePreview = (image) => {
    const previewUrl = String(image?.localPreviewUrl || '').trim();
    if (!previewUrl || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function')
      return;
    try {
      URL.revokeObjectURL(previewUrl);
    } catch {
      /* ignore */
    }
  };

  const updatePendingPostImage = (uploadId, patch = {}) => {
    const index = postImages.value.findIndex((image) => image.uploadId === uploadId);
    if (index < 0) return null;
    const current = postImages.value[index];
    const next = { ...current, ...patch, sortOrder: index };
    const images = [...postImages.value];
    images[index] = next;
    postImages.value = images;
    return next;
  };

  // 产品口径（2026-10-02 拍板）：选图→发布之间保持安静，不给常驻过程反馈（状态徽章/进度
  // 文案均不做）；只有「卡顿」才给一次性提示 —— 选图后 4s，本批图就绪（approved/failed）
  // 的不足一半时，视为管线卡住（云端审核不可达 / 网络差 / 模型首次初始化），写一次底部提示，
  // 编辑器内全部图 settle 后自动清除。发布路径会等待剩余图（processPublishImagesForQueue），
  // 文案承诺的「发布时自动等待」属实。
  const IMAGE_STALL_HINT = '图片正在后台处理，可先编辑文字，发布时会自动等待';
  const IMAGE_STALL_HINT_DELAY_MS = 4000;
  let imageStallTimer = null;
  const clearImageStallWatch = () => {
    if (imageStallTimer) {
      clearTimeout(imageStallTimer);
      imageStallTimer = null;
    }
  };
  const maybeSettleStallHint = () => {
    if (postImageUploadStatus.value !== IMAGE_STALL_HINT) return;
    const hasPending = postImages.value.some(
      (x) => !['approved', 'failed'].includes(String(x?.uploadStatus || '')),
    );
    if (!hasPending) postImageUploadStatus.value = '';
  };
  const scheduleImageStallWatch = (batchImages) => {
    clearImageStallWatch();
    let hintShownThisBatch = false;
    imageStallTimer = setTimeout(() => {
      imageStallTimer = null;
      if (hintShownThisBatch || !batchImages.length) return;
      const total = batchImages.length;
      const settledCount = batchImages.filter((img) => {
        const cur = postImages.value.find((x) => x.uploadId === img.uploadId);
        return cur && ['approved', 'failed'].includes(String(cur.uploadStatus || ''));
      }).length;
      if (settledCount * 2 >= total) return;
      hintShownThisBatch = true;
      postImageUploadStatus.value = IMAGE_STALL_HINT;
    }, IMAGE_STALL_HINT_DELAY_MS);
  };

  const handlePostImageSelection = async (payload) => {
    const files = Array.from(
      payload?.files || payload?.event?.target?.files || payload?.target?.files || [],
    );
    if (!files.length) return;

    const remaining = Math.max(0, FORUM_POST_IMAGE_MAX_COUNT - postImages.value.length);
    if (remaining <= 0) {
      showModal('warning', '图片已满', `每个帖子最多发布 ${FORUM_POST_IMAGE_MAX_COUNT} 张图片`);
      return;
    }

    const selectedFiles = files.slice(0, remaining);
    if (files.length > remaining) {
      showModal(
        'warning',
        '图片数量已限制',
        `每个帖子最多发布 ${FORUM_POST_IMAGE_MAX_COUNT} 张图片，多余图片未处理`,
      );
    }

    const batchKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const pendingImages = selectedFiles.map((file, fileIndex) => {
      let localPreviewUrl = '';
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        try {
          localPreviewUrl = URL.createObjectURL(file);
        } catch {
          /* ignore */
        }
      }
      return {
        id: `uploading-${batchKey}-${fileIndex}`,
        uploadId: `uploading-${batchKey}-${fileIndex}`,
        name: String(file?.name || `第 ${fileIndex + 1} 张图片`).trim(),
        file,
        url: localPreviewUrl,
        localPreviewUrl,
        uploadStatus: 'staged',
        uploadStatusLabel: '',
        sortOrder: postImages.value.length + fileIndex,
      };
    });
    postImages.value = normalizePostImageSortState([...postImages.value, ...pendingImages]);

    // 选图后立刻后台预热「压缩 → 检测(串行) → 上传(并发)」，点发布时多半已就绪
    postImageUploadStatus.value = '';
    // P1（首帧）：先把一帧让给缩略图渲染，再启动模型预载/压缩 —— 此前 tfjs+nsfwjs 的动态
    // import 与 WebGL 初始化在选图同一拍抢占主线程，缩略图的 DOM patch 与首帧绘制被排到后面
    // （症状即「卡一下才出图」）。
    await nextTick();
    // 模型预载与压缩并行（幂等），避免第一张图检测时阻塞等待 NSFW 模型 CDN 下载
    scheduleForumImageModerationPreload({ immediate: true });
    // D2：预热推迟 300ms 启动，躲开相册关闭动画与主线程峰值；批次内过滤已移除的图
    if (draftPipelineDebounceTimer) clearTimeout(draftPipelineDebounceTimer);
    const batchImages = pendingImages;
    scheduleImageStallWatch(batchImages);
    draftPipelineDebounceTimer = setTimeout(() => {
      draftPipelineDebounceTimer = null;
      batchImages.forEach((img, idx) => {
        if (!postImages.value.some((x) => x.uploadId === img.uploadId)) return;
        scheduleDraftImagePipeline(img, idx, batchImages.length);
      });
    }, 300);
  };

  const retryPostImageUpload = async (image, index) => {
    const retryFile = image?.file;
    if (!retryFile) {
      showModal('warning', '无法重试', '这张图片缺少本地文件，请重新选择');
      return;
    }
    // 临时移除失败图片，保留原位置信息
    revokePostImagePreview(image);
    const before = postImages.value.slice(0, index);
    const after = postImages.value.slice(index + 1);
    postImages.value = normalizePostImageSortState([...before, ...after]);
    // 重试上传并插入回原位置
    const previousCount = postImages.value.length;
    await handlePostImageSelection({ files: [retryFile] });
    // 将新上传的图片移回原位置
    if (postImages.value.length > previousCount) {
      const newImages = postImages.value.slice(previousCount);
      postImages.value = normalizePostImageSortState(
        restoreImageAtPosition(postImages.value.slice(0, previousCount), newImages, index),
      );
    }
  };

  // ===== 边选边传：选图后立刻后台预热「压缩(2 路) → 检测(3 路) → 上传(3 路)」 =====
  // 用户打字期间图片往往已传完，点发布时只需等待剩余部分 + 一次发帖 RPC，感知接近秒发。
  // 取消发帖/移除图片时中断对应预热；已传完但未发帖的图由 cloudinary_pending_uploads 兜底清理。
  const DRAFT_PIPELINE_FAILED = 'DRAFT_IMAGE_PIPELINE_FAILED';
  const draftImagePipelines = new Map(); // uploadId -> { state, file, moderation, data, error, promise, signal, controller, cleanupPending, cancelled }
  // 检测并发池：**云端审核是纯网络请求**（fetch，无 WebGL、无共享可变状态），本地兜底的
  // classify 由 forum-image-moderation.js 的 `classifyMutex` 全局互斥（TFJS WebGL 不支持
  // 并发 classify）⇒ 放开到多路是安全的：云端真并发、本地自动排队。
  //
  // ⚠️ 3 路的来历与边界：
  //  · 上限不能放开到「全部图一起上」：一次 6 张并发打 6 个请求，网络抖一下就会在**同一瞬间**
  //    凑满 image-moderation-pipeline 的连续失败阈值（3 次）⇒ 云端被冻结 60s，整批转本地从宽
  //    判定。这是并发把「抖动」放大成「故障」，所以 pipeline 侧同步加了 burst 合并计数。
  //    3 路时一个抖动最多贡献 1 次（合并后），阈值仍需要 3 个独立波次才触发。
  //  · 与上传并发（cloud-upload-guard 的 3 路）取同一数量级：两者都不占 CPU，是网络等待。
  //  · 影集那条路（share-moderation / useAlbumEditor）审的是**原图 4032px**（解码位图约 65MB/张），
  //    所以那边必须保持 DECODE_CONCURRENCY=2。论坛审的是压缩后的 1600px（约 10MB/张），
  //    3 路峰值约 30MB，安全 —— **别把这里的数字直接抄到影集**。
  const MODERATION_CONCURRENCY = 3;
  let activeModerations = 0;
  const moderationWaitQueue = [];
  const acquireModerationSlot = () =>
    new Promise((resolve) => {
      if (activeModerations < MODERATION_CONCURRENCY) {
        activeModerations += 1;
        resolve();
        return;
      }
      moderationWaitQueue.push(resolve);
    });
  const releaseModerationSlot = () => {
    activeModerations -= 1;
    const next = moderationWaitQueue.shift();
    if (next) {
      activeModerations += 1;
      next();
    }
  };
  let draftPipelineDebounceTimer = null; // D2：选图预热 300ms debounce

  // A2 压缩并发池：压缩跑在 browser-image-compression 的 Web Worker 里，天然可并行；
  // 与检测解耦后，第 N 张的压缩可与第 N-1 张的检测重叠执行，多图总耗时从「压缩+检测之和」
  // 变为「两者取 max」。检测仍严格串行。低端机（deviceMemory<4）降回 1 路保内存。
  const COMPRESSION_CONCURRENCY = (() => {
    try {
      return Number(navigator.deviceMemory || 8) < 4 ? 1 : 2;
    } catch {
      return 2;
    }
  })();
  let activeCompressions = 0;
  const compressionWaitQueue = [];
  const acquireCompressionSlot = () =>
    new Promise((resolve) => {
      if (activeCompressions < COMPRESSION_CONCURRENCY) {
        activeCompressions += 1;
        resolve();
        return;
      }
      compressionWaitQueue.push(resolve);
    });
  const releaseCompressionSlot = () => {
    activeCompressions -= 1;
    const next = compressionWaitQueue.shift();
    if (next) {
      activeCompressions += 1;
      next();
    }
  };

  const scheduleDraftImagePipeline = (img, index, total) => {
    const uploadId = String(img?.uploadId || '').trim();
    const file = img?.file;
    if (!uploadId || !file) return;
    // 已失败的旧管线必须先删除再重建：否则重试时被下方守卫拦截，
    // 发布循环永远拿到已 settled 的失败 promise → 重试立即再失败（重试失效根因）。
    // 进行中（pending/preparing/uploading/done）的管线不重复调度。
    const existing = draftImagePipelines.get(uploadId);
    if (existing) {
      if (existing.state !== 'failed') return;
      draftImagePipelines.delete(uploadId);
    }
    const controller = new AbortController();
    const entry = {
      uploadId,
      state: 'pending',
      file: null,
      moderation: null,
      data: null,
      error: null,
      promise: null,
      progress: 0, // 0~1：压缩 0-0.35，检测 0.35-0.5，上传 0.5-1.0（供发布进度聚合）
      signal: controller.signal,
      controller,
      cleanupPending: false,
      cancelled: false,
    };
    draftImagePipelines.set(uploadId, entry);
    // 阶段一 A：压缩进 2 路并发池（Web Worker 内执行，不占检测串行链）
    const compressionPromise = (async () => {
      await acquireCompressionSlot();
      try {
        if (entry.cancelled)
          throw Object.assign(new Error('已取消'), { code: DRAFT_PIPELINE_FAILED });
        entry.state = 'preparing';
        // quiet（产品口径 2026-10-02 拍板）：预热阶段不向编辑器写「优化中/压缩中」中间状态，
        // 选图→发布之间保持安静；慢/卡场景由 scheduleImageStallWatch 给一次性底部提示。
        const prepared = await prepareForumImageForUpload(file, index, total, uploadId, {
          signal: entry.signal,
          quiet: true,
          onProgress: (p) => {
            entry.progress = Math.min(0.35, Math.max(0, Number(p || 0) / 100) * 0.35);
          },
        });
        entry.progress = 0.35; // 压缩完成，等待/进入检测
        return prepared;
      } finally {
        releaseCompressionSlot();
      }
    })();
    // 阶段一 B：检测进 MODERATION_CONCURRENCY 路并发池；池任务内先等本张压缩完成——
    // 压缩与上一张的检测重叠执行，多图总耗时 ≈ max(压缩流水, 检测并发批次数 × 单次检测)。
    //
    // 2026-10-29：这里此前是一条**全局串行链**（`draftPipelineChain`），注释理由是
    // 「WebGL classify 不并发」。但那个约束只对**本地兜底**成立，而本地 classify 早已由
    // forum-image-moderation.js 的 `classifyMutex`（模块级互斥）串起来 ⇒ 外层链对本地是
    // 双重保险，对**云端**则是纯排队。云端走 fetch，不碰 WebGL、不共享可变状态，本可并发。
    // 串行的代价实测：每张图自己的 CPU 成本只有「224px 编码 17ms + 本地 classify 33ms」，
    // 其余全在等云端 RTT（单张 0.8~2.5s，超时 2.5s）⇒ 6 张串行 = 6 次 RTT 相加。
    const preparePromise = (async () => {
      await acquireModerationSlot();
      try {
        if (entry.cancelled)
          throw Object.assign(new Error('已取消'), { code: DRAFT_PIPELINE_FAILED });
        try {
          entry.file = await compressionPromise;
          entry.moderation = await moderateForumImage(entry.file);
          // pending_review：云端不可达 + 本地模型未就绪 ⇒ 放行并转后台复审（2026-10-29）。
          // 只有明确的 rejected 才拦人。
          const moderationStatus = entry.moderation?.status;
          if (moderationStatus !== 'approved' && moderationStatus !== PENDING_REVIEW_STATUS) {
            const err = new Error(entry.moderation?.reason || '图片未通过安全检测');
            err.code = 'BETA5_IMAGE_PIPELINE_FAILED';
            throw err;
          }
          entry.progress = 0.5; // 检测完成，进入上传
        } catch (error) {
          if (!entry.cancelled && error?.code !== DRAFT_PIPELINE_FAILED) {
            entry.state = 'failed';
            entry.error = error;
            updatePendingPostImage(uploadId, {
              uploadStatus: 'failed',
              uploadStatusLabel: '处理失败',
              uploadError: error?.message || '图片处理失败',
            });
            maybeSettleStallHint();
          }
          throw error;
        }
      } finally {
        // 成功/失败/取消都释放槽位：一个坏图不能把池子占死（否则整批检测永久停摆）
        releaseModerationSlot();
      }
    })();
    // 阶段二：上传进入全局并发队列（仅网络层并发），不占检测池，不阻塞下一张的压缩/检测
    entry.promise = preparePromise.then(async () => {
      if (entry.cancelled) return entry;
      const uploadPromise = uploadApprovedForumImageQueued(entry.file, entry.moderation, {
        signal: entry.signal,
        onProgress: (p) => {
          entry.progress = 0.5 + Math.min(1, Math.max(0, Number(p || 0) / 100)) * 0.5;
        },
      });
      entry.uploadPromise = uploadPromise;
      entry.state = 'uploading';
      try {
        const result = await uploadPromise;
        if (entry.cancelled) return entry;
        if (!result?.ok) {
          const err = result?.error || new Error('图片上传失败');
          if (err?.code === 'CLOUDINARY_UPLOAD_RATE_LIMIT') applyImageUploadRateLimitCooldown(err);
          err.code = err?.code || 'IMAGE_UPLOAD_FAILED';
          throw err;
        }
        entry.state = 'done';
        entry.data = result.data;
        // P1（不闪白）：url 保留 blob 本地预览，远端地址写 uploadedUrl。此前上传完成会把
        // url 从 blob 覆盖成 Cloudinary 远端地址 ⇒ 移动网络下这张已显示的图要重新下载，
        // 表现为闪白/回退。远端 url 在发布快照处归一（handlePost 的 snapshotImages：
        // url = uploadedUrl || url），乐观卡与灵动岛缩略图仍优先 localPreviewUrl，均不受影响。
        const { url: uploadedUrl, ...uploadedRest } = result.data;
        updatePendingPostImage(uploadId, {
          ...uploadedRest,
          uploadedUrl,
          uploadStatus: 'approved',
          uploadStatusLabel: '已就绪',
          file: entry.file,
        });
        maybeSettleStallHint();
      } catch (error) {
        if (!entry.cancelled) {
          entry.state = 'failed';
          entry.error = error;
          updatePendingPostImage(uploadId, {
            uploadStatus: 'failed',
            uploadStatusLabel: '上传失败',
            uploadError: error?.message || '图片上传失败',
          });
          maybeSettleStallHint();
        }
      }
      return entry;
    });
    // 兜底：取消/失败均吞掉，等待发布路径或清理路径消费
    entry.promise.catch(() => {});
  };

  const cancelDraftImagePipeline = (uploadId) => {
    const entry = draftImagePipelines.get(uploadId);
    if (!entry) return null;
    entry.cancelled = true;
    // 上传进行中：不 abort 网络请求，让其自然完成并登记 pending（孤儿图由 Edge Function 兜底清理），
    // 同时标记不再走云端删除（避免 pending 登记与删除竞态）
    if (entry.state === 'uploading') {
      entry.cleanupPending = true;
      entry.uploadPromise?.catch(() => {});
    } else {
      try {
        entry.controller.abort();
      } catch {
        /* ignore */
      }
    }
    draftImagePipelines.delete(uploadId);
    return entry;
  };

  const clearAllDraftImagePipelines = () => {
    if (draftPipelineDebounceTimer) {
      clearTimeout(draftPipelineDebounceTimer);
      draftPipelineDebounceTimer = null;
    }
    for (const uploadId of [...draftImagePipelines.keys()]) {
      cancelDraftImagePipeline(uploadId);
    }
  };

  const prepareForumImageForUpload = async (
    file,
    fileIndex,
    totalCount,
    uploadId = '',
    options = {},
  ) => {
    const { compressImageFileToUploadLimit, formatImageFileSize, getImageCompressionPlan } =
      await import('@/utils/image-compression.js');
    // 档位来自 forum-format 的单源常量（≤ 详情展示上限 1600）：超出的像素任何界面都不会加载，
    // 上传它们只换来更长的上行与更高的 Cloudinary 存储/流量，见常量处的实测数据。
    const plan = await getImageCompressionPlan(file, FORUM_UPLOAD_IMAGE_OPTIMIZE_OPTIONS);
    if (!plan.shouldCompress) return file;

    if (!plan.canCompress) {
      throw new Error('图片超过上传限制，且当前格式不支持自动压缩，请换成 JPG、PNG 或 WebP 后重试');
    }

    const actionLabel = plan.shouldOptimize ? '正在优化' : '正在压缩';
    // quiet（Beta5 预热管线）：不向编辑器写「优化中/压缩中/待审核」中间状态，
    // 图片上不显示任何加载态（设计意图：真实进度只在灵动岛展示）
    if (!options.quiet) {
      updatePendingPostImage(uploadId, {
        uploadStatus: 'optimizing',
        uploadStatusLabel: plan.shouldOptimize ? '优化中' : '压缩中',
      });
      postImageUploadStatus.value = `${actionLabel}第 ${fileIndex + 1}/${totalCount} 张图片...`;
    }
    const compressedFile = await compressImageFileToUploadLimit(file, plan, {
      onProgress: options.onProgress,
      signal: options.signal,
    });
    if (Number(compressedFile.size || 0) > Number(plan.maxSizeBytes || 0)) {
      throw new Error(
        `压缩后仍超过限制（${formatImageFileSize(compressedFile.size)}），请手动压缩后再上传`,
      );
    }
    if (!options.quiet) {
      updatePendingPostImage(uploadId, {
        uploadStatus: 'queued',
        uploadStatusLabel: '待审核',
      });
    }
    return compressedFile;
  };

  const normalizePostImageSortState = (images = []) => {
    const source = Array.isArray(images) ? images : [];
    return source.map((item, itemIndex) => ({
      ...item,
      sortOrder: itemIndex,
    }));
  };

  const removePostImage = async (image, index) => {
    const pipeline = cancelDraftImagePipeline(image?.uploadId);
    revokePostImagePreview(image);
    const nextImages = postImages.value.filter((_, itemIndex) => itemIndex !== index);
    postImages.value = normalizePostImageSortState(nextImages);
    // 移除图片后批次构成已变：停掉卡顿观察器，不再对剩余图做本批提示（剩余图仍会正常管线）
    clearImageStallWatch();
    if (postImageUploadStatus.value === IMAGE_STALL_HINT) postImageUploadStatus.value = '';
    // 正在上传中的预热让其自然完成并登记 pending（云端兜底清理），不再走云端删除避免竞态
    if (pipeline?.cleanupPending) return;
    /* 从实时暂存恢复回来的图只有 URL，没有 deleteToken / publicId / originalUrl ——
     云端删除需要凭据，拿 URL 硬删只会报"图片清理失败"（用户只是想去掉一张图）。
     没有凭据就只在本机移除，云端那份交给 Cloudinary 的 pending 清理兜底。 */
    if (!image?.deleteToken && !image?.publicId && !image?.originalUrl) return;
    await cleanupUploadedForumImage(image, { silent: false });
  };

  const reorderPostImage = ({ fromIndex, toIndex } = {}) => {
    const from = Number(fromIndex);
    const to = Number(toIndex);
    const total = postImages.value.length;
    if (!Number.isInteger(from) || !Number.isInteger(to)) return;
    if (from < 0 || from >= total || to < 0 || to >= total || from === to) return;
    const images = [...postImages.value];
    const [moved] = images.splice(from, 1);
    images.splice(to, 0, moved);
    postImages.value = normalizePostImageSortState(images);
  };

  const cleanupUploadedForumImage = async (image, { silent = true } = {}) => {
    const lockKey = String(
      image?.deleteToken || image?.publicId || image?.originalUrl || image?.url || '',
    ).trim();
    if (!lockKey || postImageCleanupLocks.has(lockKey)) return { ok: true, skipped: true };
    postImageCleanupLocks.add(lockKey);
    try {
      const result = await deleteUploadedForumImage(image);
      if (!result.ok && !silent) {
        showModal(
          'warning',
          '图片清理失败',
          result.error?.message || '云端图片删除失败，请稍后在 Cloudinary 后台检查',
        );
      }
      return result;
    } finally {
      postImageCleanupLocks.delete(lockKey);
    }
  };

  const cleanupDraftPostImages = async ({ silent = true } = {}) => {
    const images = [...postImages.value];
    if (!images.length) return;
    await Promise.allSettled(images.map((image) => cleanupUploadedForumImage(image, { silent })));
  };

  const clearPostImages = ({ cleanup = false, silent = true } = {}) => {
    const images = [...postImages.value];
    // 先收集正在上传中的管线（cancel 后 entry 已从 map 移除，需提前标记）
    const pendingCleanupIds = new Set(
      images
        .filter((image) => draftImagePipelines.get(image?.uploadId)?.state === 'uploading')
        .map((image) => image.uploadId),
    );
    clearAllDraftImagePipelines();
    images.forEach(revokePostImagePreview);
    postImages.value = [];
    postImageUploadStatus.value = '';
    clearImageStallWatch();
    if (cleanup && images.length) {
      // 正在上传中的预热让其自然完成并登记 pending（云端兜底清理），不再走云端删除避免竞态
      void Promise.allSettled(
        images
          .filter((image) => !pendingCleanupIds.has(image?.uploadId))
          .map((image) => cleanupUploadedForumImage(image, { silent })),
      );
    }
  };

  const discardDraftPostImages = async ({ silent = true } = {}) => {
    await cleanupDraftPostImages({ silent });
    clearPostImages({ cleanup: false });
  };

  // 卡顿提示的定时器归本模块所有，所以卸载也由本模块收尾 —— 让宿主记得调
  // clearImageStallWatch() 是「跨文件的隐式约定」，搬走后最容易漏（漏了就是
  // 卸载后再弹一次底部提示，指向一个已销毁的编辑器）。
  // 必须写在这里（clearImageStallWatch 声明之后）：中途注册会 TDZ。
  onUnmounted(clearImageStallWatch);

  return {
    // 模板 / 宿主动作
    openPostImagePicker,
    openPostCamera,
    handlePostImageSelection,
    retryPostImageUpload,
    removePostImage,
    reorderPostImage,
    clearPostImages,
    discardDraftPostImages,
    // 发布链路要的凭据：管线表必须是**这一个**实例，否则发布时看不到预热结果
    draftImagePipelines,
    scheduleDraftImagePipeline,
    cancelDraftImagePipeline,
    normalizePostImageSortState,
    cleanupUploadedForumImage,
  };
}
