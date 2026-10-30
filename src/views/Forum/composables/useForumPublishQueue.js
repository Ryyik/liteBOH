/**
 * 发帖发布链路 —— 从 ForumMain.vue 外搬（2026-10-30，审查报告 P1-1 第 1 步）。
 *
 * 这一段是「即发即走」的全部状态机：入队 → 图片管线消费 → 落库 → 成功替换 / 失败留卡，
 * 外加常驻任务岛同步（进度环 / 重试 / 编辑 / 移除违规图 / 取消）与三条恢复路径
 * （组件重建接手、网络恢复自动重试、失败中断后由用户处置续跑）。
 *
 * **为什么自成一体**：状态真源已经是 Pinia 的 `forumPublishQueue` store，
 * 这里只持有一个实例级的「单飞锁」+ AbortController 表，对宿主只暴露
 * 入队后的副作用（乐观卡）与四个用户动作。所以搬运不改语义。
 *
 * **依赖注入而不是直接 import 宿主私有函数**：本文用到的那几个函数
 * （`prepareForumPostForDisplay` / `cleanupUploadedForumImage` / 岛 fallback …）
 * 目前仍住在 ForumMain.vue 里，是后续 P1-1 第 2、3 步的搬迁对象。
 * 用参数传进来，把它们搬走时只需改宿主那一处调用。
 *
 * 调用点必须在 `<script setup>` 尾部：那些依赖都是 `const` 箭头函数，
 * 中途调用会 TDZ。
 */
import { computed, onMounted, onUnmounted, triggerRef, watch } from 'vue';
import { useForumPublishQueueStore } from '@/stores/forumPublishQueue.js';
import { FORUM_POST_IMAGE_MAX_COUNT } from '../forum-config.js';
import { applyPoints } from '../forum-points.js';
import {
  createPost,
  markForumImagesPendingRecheck,
  enqueueForumImageRecheck,
  claimPostPublishReward,
} from '../../../utils/api/forum-api.js';
import { addExperience, XP_REWARDS } from '../../../utils/xp.js';
import { createMyCloudEntry } from '../../../utils/api/boh-cloud-api.js';
import { supabase } from '../../../utils/supabase-client.js';
import { showIsland } from '@/composables/useIsland.js';
import { logger } from '@/utils/logger.js';

export function useForumPublishQueue(deps) {
  const {
    forumData,
    highlightedPostIds,
    userInfo,
    postImages,
    newPost,
    selectedPostTag,
    postLocation,
    postImageUploadStatus,
    draftImagePipelines,
    scheduleDraftImagePipeline,
    cancelDraftImagePipeline,
    prepareForumPostForDisplay,
    resolveFrameForAuthor,
    normalizePostImageSortState,
    cleanupUploadedForumImage,
    applyRateLimitCooldown,
    addUiMarker,
    emitProfileSync,
    isLikelyNetworkError,
    shouldCleanupImagesAfterPostError,
    loadForumWeeklyReport,
    persistForumFeedSnapshot,
    showEmbeddedSuccessIsland,
  } = deps;

  const showPublishIsland = (payload) => {
    // 统一走灵动岛调度中心；导航栏不存在时（嵌入模式）fallback 到外层 UserSpace 的 island-message
    showIsland.notify({
      ...payload,
      at: Date.now(),
      fallback: () => showEmbeddedSuccessIsland(payload),
    });
  };

  // ===== 即发即走：后台发布队列（与灵动岛/顶部常驻条联动，简化进度不暴露压缩/检测细节） =====
  const publishQueueStore = useForumPublishQueueStore();
  const publishQueueItems = computed(() => publishQueueStore.items);
  let publishWorkerRunning = false;
  const publishAbortControllers = new Map();

  // ===== 发布队列 → 统一任务岛（showIsland.task）同步 =====
  // 常驻进度岛：进行中显示进度环，成功自动收起，失败常驻并带操作按钮
  let publishTaskHandle = null;
  let publishTaskHandleId = '';
  const PUBLISH_TASK_ACTIONS = {
    moderation: [
      { id: 'fix', label: '移除该图', kind: 'danger' },
      { id: 'edit', label: '编辑', kind: 'ghost' },
      { id: 'cancel', label: '取消', kind: 'ghost' },
    ],
    network: [
      { id: 'retry', label: '重试', kind: 'primary' },
      { id: 'edit', label: '编辑', kind: 'ghost' },
      { id: 'cancel', label: '取消', kind: 'ghost' },
    ],
  };
  watch(
    publishQueueItems,
    (items) => {
      const active =
        items.find((i) => ['queued', 'uploading', 'publishing'].includes(i.state)) ||
        items.find((i) => i.state === 'failed') ||
        items[0] ||
        null;
      if (!active) {
        publishTaskHandle?.close();
        publishTaskHandle = null;
        publishTaskHandleId = '';
        return;
      }
      const queueId = String(active.id);
      if (publishTaskHandleId !== queueId || !publishTaskHandle) {
        publishTaskHandle?.close();
        publishTaskHandle = showIsland.task({
          id: `forum-publish-${queueId}`,
          onAction: (actionId) => {
            if (actionId === 'retry') retryPublish(queueId);
            else if (actionId === 'fix') fixModerationPublish(queueId);
            else if (actionId === 'edit') editFailedPublish(queueId);
            else if (actionId === 'cancel') cancelPublish(queueId);
          },
        });
        publishTaskHandleId = queueId;
      }

      const progress = Math.round(active.progress || 0);
      const thumbs = (active.images || [])
        .map((i) => String(i.localPreviewUrl || i.url || '').trim())
        .filter(Boolean)
        .slice(0, 3);

      if (active.state === 'success') {
        publishTaskHandle.success({ title: '发帖成功', message: '已发布', durationMs: 900 });
      } else if (active.state === 'failed') {
        const isModeration = active.failType === 'moderation';
        const detail = String(active.errorMessage || '').trim();
        publishTaskHandle.fail({
          tone: isModeration ? 'warning' : 'danger',
          title: isModeration ? '审核未通过' : '发布失败',
          message: detail ? detail.slice(0, 60) : isModeration ? '点击处理' : '点击重试',
          actions: isModeration ? PUBLISH_TASK_ACTIONS.moderation : PUBLISH_TASK_ACTIONS.network,
        });
      } else if (active.state === 'queued') {
        publishTaskHandle.update({
          title: '已提交，后台处理中',
          message: '系统会继续处理',
          progress,
          thumbs,
        });
      } else {
        publishTaskHandle.update({
          title: '正在处理',
          message: active.images?.length
            ? `正在处理图片 · ${progress}%`
            : `正在发布 · ${progress}%`,
          progress,
          thumbs,
        });
      }
    },
    // immediate：队列存在 Pinia 里（跨组件实例存活），而「常驻岛」是组件内状态。
    // 发帖途中切走路由 / 切 tab 回来，本组件重建 ⇒ 不会再有 items 变化去触发这条 watch
    // ⇒ 在途的帖既看不见进度、也点不到「重试 / 取消」，用户视角就是「发帖卡住了、没反应」。
    // 挂载时按当前队列补一次同步（active 为 null 时只是一次空跑）。
    { deep: true, immediate: true },
  );
  onUnmounted(() => {
    publishTaskHandle?.close();
    publishTaskHandle = null;
    publishTaskHandleId = '';
  });
  const buildOptimisticPost = (queueItem) => {
    const nowIso = new Date().toISOString();
    // 上传队列快照全量图（≤ FORUM_POST_IMAGE_MAX_COUNT=6），经 prepare 进入 allImages 单一来源
    const queuedImages = (queueItem.images || [])
      .slice(0, FORUM_POST_IMAGE_MAX_COUNT)
      .map((img, idx) => ({
        id: img.uploadId || `optimistic-img-${queueItem.id}-${idx}`,
        url: img.localPreviewUrl || img.url || '',
        originalUrl: img.localPreviewUrl || img.url || '',
        detailUrl: img.localPreviewUrl || img.url || '',
        width: img.width || 0,
        height: img.height || 0,
        sortOrder: idx,
        _optimistic: true,
        _failed: queueItem.state === 'failed' && queueItem.failedImageIndex === idx,
      }))
      .filter((i) => i.url);
    const titleText = String(queueItem.title || '').trim();
    const bodyText = String(queueItem.body || '').trim();
    const combined =
      titleText && bodyText ? `【${titleText}】\n${bodyText}` : titleText || bodyText;
    // 头像自动加载：使用队列快照中的头像，失败时回退到当前 userInfo
    const rawAvatar = String(
      queueItem.authorAvatarUrl || userInfo.avatarUrl || userInfo.avatar_url || '',
    ).trim();
    return prepareForumPostForDisplay(
      {
        id: queueItem.id,
        title: titleText,
        body: bodyText,
        content: combined,
        author_id: queueItem.authorId,
        author_username: queueItem.authorUsername,
        author_avatar_url: rawAvatar,
        author_avatar_frame_url: resolveFrameForAuthor('', queueItem.authorId)?.url || '',
        created_at: nowIso,
        tag: queueItem.tag,
        location_name: queueItem.location?.name || queueItem.location?.cityName || '',
        images: queuedImages,
        cover_image_url: queuedImages[0]?.url || '',
        like_count: 0,
        comment_count: 0,
        isLiked: false,
        status: 'approved',
        // 乐观扩展字段
        _optimistic: true,
        _queueId: queueItem.id,
        _publishState: queueItem.state,
        _progress: queueItem.progress,
        _failType: queueItem.failType,
        _failMessage: queueItem.errorMessage || '',
        _failedImageIndex: queueItem.failedImageIndex,
      },
      0,
    );
  };
  const insertOptimisticPost = (queueItem) => {
    const optimistic = buildOptimisticPost(queueItem);
    // 去重：若已存在同 queueId 乐观卡则替换
    const existsIdx = forumData.value.findIndex((p) => p._queueId === queueItem.id);
    if (existsIdx >= 0) {
      const next = [...forumData.value];
      next[existsIdx] = optimistic;
      forumData.value = next;
    } else {
      forumData.value = [optimistic, ...forumData.value];
    }
    addUiMarker(highlightedPostIds, queueItem.id, 2600, 'new-post');
    triggerRef(forumData);
  };
  const updateOptimisticPost = (queueId, patch = {}) => {
    const idx = forumData.value.findIndex((p) => p._queueId === queueId || p.id === queueId);
    if (idx < 0) return;
    const cur = forumData.value[idx];
    const next = { ...cur, ...patch, _queueId: queueId };
    // 只有「状态 / 失败信息 / 失败图序号」变化才需要重建图片块。
    // 进度 tick 每 300ms 一次（processPublishImagesForQueue 的 progressTicker），
    // 若一并 rebuild 就要重跑 buildOptimisticPost + 整列替换 + triggerRef，
    // 长列表下每次 tick 都是一次全量 diff —— 这是发布过程中肉眼可见的卡顿来源。
    // 重建不是纯性能开销而是有语义的：allImages 只取 localPreviewUrl（blob），
    // 上传完成不会改变它，所以跳过进度 tick 的重建不影响画面。
    if (
      patch._publishState !== undefined ||
      patch._failType !== undefined ||
      patch._failedImageIndex !== undefined
    ) {
      const q = publishQueueStore.items.find((i) => i.id === queueId);
      if (q) {
        const rebuilt = buildOptimisticPost(q);
        // 保留已有的 display 字段但更新状态相关
        Object.assign(next, {
          _publishState: q.state,
          _progress: q.progress,
          _failType: q.failType,
          _failMessage: q.errorMessage || '',
          _failedImageIndex: q.failedImageIndex,
          allImages: rebuilt.allImages,
          hasImages: rebuilt.hasImages,
          imageCount: rebuilt.imageCount,
          hiddenImageCount: rebuilt.hiddenImageCount,
          hasMultipleImages: rebuilt.hasMultipleImages,
        });
      }
    }
    const arr = [...forumData.value];
    arr[idx] = next;
    forumData.value = arr;
    triggerRef(forumData);
  };
  const removeOptimisticPost = (queueId) => {
    const beforeLen = forumData.value.length;
    forumData.value = forumData.value.filter((p) => p._queueId !== queueId && p.id !== queueId);
    if (forumData.value.length !== beforeLen) triggerRef(forumData);
  };
  const replaceOptimisticWithReal = (queueId, realPost) => {
    const idx = forumData.value.findIndex((p) => p._queueId === queueId || p.id === queueId);
    const queueItem = publishQueueStore.items.find((i) => i.id === queueId);
    // 真实接口仅返回 id，头像/用户名需用队列快照或当前用户信息回填，否则会显示 R
    const merged = {
      ...realPost,
      author_id: realPost.author_id || queueItem?.authorId || userInfo.id,
      author_username: realPost.author_username || queueItem?.authorUsername || userInfo.username,
      author_avatar_url:
        realPost.author_avatar_url || queueItem?.authorAvatarUrl || userInfo.avatarUrl || '',
      title: realPost.title || queueItem?.title || '',
      body: realPost.body || queueItem?.body || '',
      content: realPost.content || (queueItem ? `【${queueItem.title}】\n${queueItem.body}` : ''),
      tag: realPost.tag || queueItem?.tag || 'daily',
      location_name:
        realPost.location_name || queueItem?.location?.name || queueItem?.location?.cityName || '',
      // 若真实返回未含图片，使用队列最终上传结果
      images:
        Array.isArray(realPost.images) && realPost.images.length
          ? realPost.images
          : queueItem?.images || [],
      cover_image_url:
        realPost.cover_image_url ||
        queueItem?.images?.[0]?.url ||
        queueItem?.images?.[0]?.localPreviewUrl ||
        '',
    };
    const prepared = prepareForumPostForDisplay(merged, 0);
    if (idx >= 0) {
      const arr = [...forumData.value];
      arr[idx] = prepared;
      forumData.value = arr;
    } else {
      forumData.value = [prepared, ...forumData.value];
    }
    addUiMarker(highlightedPostIds, String(realPost.id || queueId), 2600, 'new-post');
    triggerRef(forumData);
  };
  const getQueueItemErrorType = (error) => {
    const msg = String(error?.message || '').toLowerCase();
    const code = String(error?.code || '').toUpperCase();
    // 审核类：仅限真正的判定未通过（本地关键词、同步审核、NSFW 判定失败）
    if (
      ['LOCAL_KEYWORD_BLOCK', 'SYNC_MODERATION_BLOCK', 'BETA5_IMAGE_PIPELINE_FAILED'].includes(code)
    )
      return 'moderation';
    if (msg.includes('未通过') || msg.includes('敏感') || msg.includes('审核')) return 'moderation';
    // 检测环境不可用（模型加载失败/超时/WebGL 挂起）按网络类处理，允许直接重试
    if (['IMAGE_MODERATION_UNAVAILABLE', 'IMAGE_MODERATION_TIMEOUT'].includes(code))
      return 'network';
    if (isLikelyNetworkError(error)) return 'network';
    return 'network';
  };
  /**
   * Phase 2（plans/023）：发帖成功后把图片**自动备份**为 Cloud+ 底账（source='forum'）。
   * best-effort：失败只记日志，绝不影响发帖结果；无图帖不备份（底账按约定只存图）。
   * 关联字段 source_post_id 让删帖时由数据库级联删除备份（2026100202 迁移）；
   * 备份本身在 Cloud+ 里禁止单独删除/公开（FORUM_SYNCED_CLOUD_ENTRY_LOCKED）。
   */
  async function backupPostImagesToCloud(realPost, images, queueItem) {
    try {
      const urls = (Array.isArray(images) ? images : [])
        .map((img) => String(img?.url || '').trim())
        .filter(Boolean);
      const userId = String(queueItem?.authorId || '').trim();
      if (!urls.length || !userId) return;
      const result = await createMyCloudEntry(userId, {
        title: String(realPost?.title || '').slice(0, 120),
        entryDate: new Date().toISOString().slice(0, 10),
        visibility: 'private',
        source: 'forum',
        contentBlocks: urls.map((url) => ({ type: 'image', url, alt: '' })),
        coverImageUrl: urls[0],
        sourcePostId: String(realPost?.id || ''),
      });
      if (!result.ok) {
        logger.warn('forum', '发帖图片自动备份 Cloud+ 失败:', result.error);
      }
    } catch (error) {
      logger.warn('forum', '发帖图片自动备份 Cloud+ 异常:', error);
    }
  }

  /* 图片管线的停滞看门狗。
   `entry.promise` 自己不会 reject（失败也在内部吞掉后返回 entry），唯一的坏情况是它
   **永远不 settle** —— 压缩线程卡住、检测模型加载挂住、上传请求被系统挂起。那时
   runPublishQueue 就永久停在下面那个 await 上：岛一直显示"发送中"、进度不动、
   没有任何按钮可点，后面排队的帖子也一起冻死（用户报障"发帖卡住"的典型形态）。
   判据用「进度连续 90s 没前进」而不是总时长：真实进度每 300ms 被聚合读一次，
   只要字节还在走就不会误杀慢网；完全不动才判失败，且失败是**可重试**的网络类错误。 */
  const PIPELINE_STALL_IDLE_MS = 90000;
  const awaitPipelineSettled = (entry, { uploadId } = {}) =>
    new Promise((resolve, reject) => {
      let lastProgress = Math.max(0, Number(entry.progress || 0));
      let lastMovedAt = Date.now();
      const poll = setInterval(() => {
        const now = Date.now();
        const progress = Math.max(0, Number(entry.progress || 0));
        if (progress > lastProgress + 0.0001) {
          lastProgress = progress;
          lastMovedAt = now;
          return;
        }
        if (now - lastMovedAt < PIPELINE_STALL_IDLE_MS) return;
        clearInterval(poll);
        // 卡死的管线必须从 map 里摘掉，否则重试会被「已存在」挡回去、复用同一条死 promise
        if (uploadId) cancelDraftImagePipeline(uploadId);
        const error = new Error('图片处理长时间无响应，请重试');
        error.code = 'IMAGE_UPLOAD_FAILED';
        error.failType = 'network';
        reject(error);
      }, 5000);
      Promise.resolve(entry.promise).then(
        (value) => {
          clearInterval(poll);
          resolve(value);
        },
        (error) => {
          clearInterval(poll);
          reject(error);
        },
      );
    });

  const processPublishImagesForQueue = async (queueItem, signal) => {
    // 全部已就绪（预热已完成）：直接返回
    const allApproved =
      (queueItem.images || []).length > 0 &&
      (queueItem.images || []).every(
        (img) => img?.uploadStatus === 'approved' && (img?.url || img?.originalUrl),
      );
    if (allApproved) {
      publishQueueStore.setProgress(queueItem.id, 82);
      return queueItem.images;
    }

    const pending = (queueItem.images || []).filter(
      (img) => img?.file && img.uploadStatus !== 'approved',
    );
    const total = pending.length;
    publishQueueStore.setProgress(queueItem.id, 2);
    // 进度写回要「只在整数百分比真的变了」时做：ticker 每 300ms 一次，
    // 管线卡住/匀速阶段常常算出同一个值 —— 同值也写就会白白替换 forumData 整列
    // （乐观卡在父模板里内联渲染，百分比一变就重渲染整列可见卡片）。
    let lastRenderedProgress = -1;
    const setProg = (v) => {
      const rounded = Math.round(Number(v) || 0);
      if (rounded === lastRenderedProgress) return;
      lastRenderedProgress = rounded;
      publishQueueStore.setProgress(queueItem.id, v);
      updateOptimisticPost(queueItem.id, { _progress: v });
    };
    const replaceUploadedImage = (uploadId, data) => {
      const qIdx = publishQueueStore.items.findIndex((i) => i.id === queueItem.id);
      if (qIdx < 0) return;
      const curItem = publishQueueStore.items[qIdx];
      const imgIdx = curItem.images.findIndex((x) => x.uploadId === uploadId);
      if (imgIdx < 0) return;
      const nextImages = [...curItem.images];
      nextImages[imgIdx] = {
        ...data,
        uploadStatus: 'approved',
        sortOrder: imgIdx,
        file: null,
        localPreviewUrl: data.url || nextImages[imgIdx].localPreviewUrl,
      };
      publishQueueStore.updateItem(queueItem.id, { images: nextImages });
    };
    const markImageFailure = (img, failIdx, error) => {
      const failType = getQueueItemErrorType(error);
      publishQueueStore.updateItem(queueItem.id, {
        failType: failType === 'moderation' ? 'moderation' : 'network',
        failedImageIndex: failIdx,
        failedImageId: img?.uploadId || null,
        errorMessage: error?.message || '图片处理失败',
      });
      updateOptimisticPost(queueItem.id, {
        _publishState: 'failed',
        _failType: failType === 'moderation' ? 'moderation' : 'network',
        _failMessage: error?.message || '图片处理失败',
        _failedImageIndex: failIdx,
      });
      const wrapped = new Error(error?.message || '图片处理失败');
      wrapped.code =
        error?.code ||
        (failType === 'moderation' ? 'BETA5_IMAGE_PIPELINE_FAILED' : 'IMAGE_UPLOAD_FAILED');
      wrapped.failType = failType;
      return wrapped;
    };

    // 消费预热管线：等待每张图的「压缩→检测→上传」结果，成功则落库替换
    let resolvedCount = 0;
    const recalcProgress = () => {
      setProg(2 + (resolvedCount / total) * 80);
    };
    recalcProgress();
    let pipelineError = null; // { img, failIdx, error }

    // 细粒度进度：轮询聚合各图管线进度（压缩 0-0.35 / 检测 0.35-0.5 / 上传 0.5-1.0）。
    // 旧模型只有整张图 resolved 才跳格（+80/total），点发送后第一张未完成时进度死停 2%。
    const resolvedUploadIds = new Set();
    let progressTicker = null;
    const stopProgressTicker = () => {
      if (progressTicker) {
        clearInterval(progressTicker);
        progressTicker = null;
      }
    };
    const startProgressTicker = () => {
      if (total <= 0) return;
      stopProgressTicker();
      progressTicker = setInterval(() => {
        let agg = 0;
        pending.forEach((img) => {
          if (resolvedUploadIds.has(img.uploadId)) {
            agg += 1;
            return;
          }
          const entry = draftImagePipelines.get(img.uploadId);
          agg += entry ? Math.min(1, Math.max(0, Number(entry.progress || 0))) : 0;
        });
        setProg(2 + (agg / total) * 80);
      }, 300);
    };
    startProgressTicker();

    const releaseSlot = (img) => {
      // 仅在编辑器未持有该图（已发布清空）时释放管线槽位；编辑器仍持有时（编辑失败重发）保留给下一轮
      const stillInEditor = postImages.value.some((x) => x.uploadId === img?.uploadId);
      if (!stillInEditor) draftImagePipelines.delete(img?.uploadId);
    };

    try {
      for (let idx = 0; idx < pending.length; idx++) {
        if (signal?.aborted)
          throw Object.assign(new Error('已取消'), { code: 'PUBLISH_CANCELLED' });
        const img = pending[idx];
        const imgFailIdx = (queueItem.images || []).findIndex((x) => x.uploadId === img.uploadId);
        let entry = draftImagePipelines.get(img.uploadId);
        // 无预热管线（模型不可用/会话失效/边界场景）：现场补建一条，走同一套等待逻辑
        if (!entry && img.file) {
          scheduleDraftImagePipeline(img, idx, total);
          entry = draftImagePipelines.get(img.uploadId);
        }
        if (!entry) {
          pipelineError = {
            img,
            failIdx: imgFailIdx >= 0 ? imgFailIdx : idx,
            error: new Error('图片处理失败'),
          };
          break;
        }
        let stallError = null;
        try {
          await awaitPipelineSettled(entry, { uploadId: img.uploadId });
        } catch (error) {
          // 管线自身失败时错误已在 entry.error 里，这里只有看门狗会 reject
          stallError = error;
        }
        if (signal?.aborted)
          throw Object.assign(new Error('已取消'), { code: 'PUBLISH_CANCELLED' });
        if (stallError) {
          pipelineError = {
            img,
            failIdx: imgFailIdx >= 0 ? imgFailIdx : idx,
            error: stallError,
          };
          break;
        }
        if (entry.cancelled) {
          pipelineError = {
            img,
            failIdx: imgFailIdx >= 0 ? imgFailIdx : idx,
            error: Object.assign(new Error('已取消'), { code: 'PUBLISH_CANCELLED' }),
          };
          break;
        }
        if (entry.state === 'done' && entry.data) {
          replaceUploadedImage(img.uploadId, entry.data);
          resolvedUploadIds.add(img.uploadId);
          releaseSlot(img);
          resolvedCount += 1;
          recalcProgress();
        } else {
          const rawError = entry.error || new Error('图片处理失败');
          // 会话级失败：标记并取消后续图的预热（仍在等待的会被跳过/中止）
          (queueItem.images || []).forEach((other) => {
            if (other?.uploadId && other.uploadId !== img.uploadId)
              cancelDraftImagePipeline(other.uploadId);
          });
          // 失败图自身的 entry 同样必须清除：否则残留在 map 中，
          // retryPublish 的 scheduleDraftImagePipeline 会因「已存在」拒绝重建 → 重试永远立即失败
          cancelDraftImagePipeline(img.uploadId);
          pipelineError = { img, failIdx: imgFailIdx >= 0 ? imgFailIdx : idx, error: rawError };
          break;
        }
      }
    } finally {
      stopProgressTicker();
    }

    if (pipelineError) {
      if (pipelineError.error?.code === 'PUBLISH_CANCELLED') throw pipelineError.error;
      throw markImageFailure(pipelineError.img, pipelineError.failIdx, pipelineError.error);
    }

    setProg(82);
    const finalItem = publishQueueStore.items.find((i) => i.id === queueItem.id);
    return finalItem ? finalItem.images : queueItem.images;
  };
  const runPublishQueue = async () => {
    if (publishWorkerRunning) return;
    publishWorkerRunning = true;
    try {
      while (true) {
        const next = publishQueueStore.items.find((i) => i.state === 'queued');
        if (!next) break;
        publishQueueStore.setState(next.id, 'uploading');
        updateOptimisticPost(next.id, { _publishState: 'uploading' });
        const controller = new AbortController();
        publishAbortControllers.set(next.id, controller);
        try {
          // 图片流水线（只要有图就走消费逻辑：内部判断全就绪则秒过，等待中则等剩余部分）
          let finalImages = next.images;
          if ((next.images || []).length > 0) {
            finalImages = await processPublishImagesForQueue(next, controller.signal);
          }
          if (controller.signal.aborted)
            throw Object.assign(new Error('已取消'), { code: 'PUBLISH_CANCELLED' });
          // 发布阶段 82->96
          publishQueueStore.setProgress(next.id, 88);
          updateOptimisticPost(next.id, { _progress: 88, _publishState: 'publishing' });
          publishQueueStore.setState(next.id, 'publishing');
          const result = await createPost(
            next.body,
            next.authorId,
            next.authorUsername,
            'approved',
            next.title,
            finalImages,
            next.tag,
            next.location,
            { submissionId: next.submissionId },
          );
          if (controller.signal.aborted)
            throw Object.assign(new Error('已取消'), { code: 'PUBLISH_CANCELLED' });
          if (result.error) throw result.error;
          const realPost = Array.isArray(result.data) ? result.data[0] : result.data;
          if (!realPost || !realPost.id) throw new Error('发布返回异常，请刷新后查看');
          // 成功
          publishQueueStore.setProgress(next.id, 100);
          publishQueueStore.setState(next.id, 'success');
          updateOptimisticPost(next.id, { _progress: 100, _publishState: 'success' });
          // 清理预览 URL
          (next.images || []).forEach((img) => {
            if (img.localPreviewUrl) {
              try {
                URL.revokeObjectURL(img.localPreviewUrl);
              } catch {
                /* 同下：纯清理动作，失败无需处理。 */
              }
            }
          });
          // 替换乐观卡为真实卡
          replaceOptimisticWithReal(next.id, realPost);
          // Phase 2（plans/023）：图片自动备份到 Cloud+ 底账（best-effort，不阻塞发帖）
          void backupPostImagesToCloud(realPost, finalImages, next);
          // 两级审核都没能裁决的图：标记待复审 + 入队（服务端约 6 分钟内给裁决）。
          // best-effort —— 此刻图已经可见，这里失败只意味着「这一轮没被复审」，
          // 不该让用户看到发布失败。
          void (async () => {
            const recheckPublicIds = (finalImages || [])
              .filter((img) => img?.needsRecheck)
              .map((img) => String(img?.publicId || '').trim())
              .filter(Boolean);
            if (recheckPublicIds.length === 0) return;
            await markForumImagesPendingRecheck(realPost.id, recheckPublicIds);
            await enqueueForumImageRecheck(realPost.id, 30);
          })().catch((err) => logger.warn('forum', '图片复审入队失败:', err));
          // 经验与奖励
          void addExperience(supabase, next.authorId, XP_REWARDS.POST).catch((err) =>
            logger.error('forum', '经验值增加失败:', err),
          );
          if (realPost.id) {
            claimPostPublishReward(supabase, String(realPost.id))
              .then((reward) => {
                if (reward && reward.ok && Number(reward.awarded) > 0) {
                  // 同签到：只有后端真回了余额才写回，缺字段时不能拿 0 覆盖界面余额
                  applyPoints(userInfo, reward.currentPoints);
                  const tip = reward.campaignTitle ? `「${reward.campaignTitle}」` : '';
                  // 奖励用瞬时岛（队列成功岛 900ms 后已收起，不冲突）
                  showPublishIsland({
                    title: '发帖得积分',
                    message: `获得 ${reward.awarded} 积分${tip}`,
                    icon: 'gift',
                    type: 'success',
                  });
                }
              })
              .catch((err) => logger.error('forum', '发帖奖励发放失败:', err));
          }
          emitProfileSync({
            userId: next.authorId,
            username: next.authorUsername,
            reason: 'post_created',
          });
          // 成功态由常驻 Airdrop 岛展示（isSuccess），不再发瞬时岛避免重叠
          // 刷新周报但不整页重拉（避免覆盖刚插入的帖子）；后台静默刷新快照
          void loadForumWeeklyReport();
          persistForumFeedSnapshot();
          // 成功后短暂保留队列项给常驻岛收尾（900ms），但**不要 await**：
          // 那会把队列里排队的下一篇一起冻住 900ms（连发两帖时第二篇凭空慢近 1 秒）。
          publishAbortControllers.delete(next.id);
          setTimeout(() => publishQueueStore.removeItem(next.id), 900);
        } catch (error) {
          publishAbortControllers.delete(next.id);
          if (error?.code === 'PUBLISH_CANCELLED' || controller.signal.aborted) {
            // 已在 cancel 分支处理移除
            continue;
          }
          logger.error('forum', '后台发帖失败', error);
          // 限流
          applyRateLimitCooldown(error, 'post');
          const failType = error?.failType || getQueueItemErrorType(error);
          const isMod = failType === 'moderation';
          // 若为不可重试的本地校验类，直接清理图片但保留卡片供用户编辑
          const shouldCleanup = shouldCleanupImagesAfterPostError(error);
          if (shouldCleanup && !isMod) {
            // 对审核失败不清理，后续可移除单图重试
          }
          publishQueueStore.setState(next.id, 'failed', {
            failType: isMod ? 'moderation' : 'network',
            errorMessage: error?.message || (isMod ? '图片未通过审核' : '网络异常，发送失败'),
            failedImageIndex:
              publishQueueStore.items.find((i) => i.id === next.id)?.failedImageIndex ?? null,
          });
          publishQueueStore.setProgress(
            next.id,
            Math.max(
              12,
              Number(publishQueueStore.items.find((i) => i.id === next.id)?.progress || 62),
            ),
          );
          updateOptimisticPost(next.id, {
            _publishState: 'failed',
            _failType: isMod ? 'moderation' : 'network',
            _failMessage: error?.message || (isMod ? '图片未通过审核' : '网络异常，发送失败'),
          });
          // 失败态由常驻岛展示（橙/红常驻需操作），不再发瞬时岛
          break; // 中断队列，等待用户操作后继续
        }
      }
    } finally {
      publishWorkerRunning = false;
    }
  };
  // 队列存在 Pinia 里（跨组件实例存活），但 worker 的「单飞锁」publishWorkerRunning 是实例级的：
  // 发帖途中切走路由再回来（keep-alive 被回收 / 重新 mount），新实例不会自动接手，
  // queued 的帖就永久躺在队列里 —— 岛上看不到、也没有任何按钮能救。
  // 只在「没有在途任务」时接手：uploading / publishing 由旧实例的 promise 链自然收尾，
  // 两个实例同时取任务会并发发帖。
  onMounted(() => {
    const items = publishQueueStore.items;
    if (items.some((i) => ['uploading', 'publishing'].includes(i.state))) return;
    if (items.some((i) => i.state === 'queued')) void runPublishQueue();
  });
  const retryPublish = async (queueId) => {
    const item = publishQueueStore.items.find((i) => i.id === queueId);
    if (!item) return;
    publishQueueStore.incrementRetry(queueId);
    // 重置进度与失败标记，但保留已成功上传的图；未完成的图需重启预热管线（重试时可能已被取消）
    (item.images || []).forEach((img, idx) => {
      if (img?.file && img.uploadStatus !== 'approved') {
        scheduleDraftImagePipeline(img, idx, item.images.length);
      }
    });
    publishQueueStore.updateItem(queueId, {
      state: 'queued',
      failType: null,
      failedImageIndex: null,
      failedImageId: null,
      errorMessage: '',
      progress: Math.max(8, Number(item.progress || 0) - 12),
    });
    updateOptimisticPost(queueId, {
      _publishState: 'queued',
      _failType: null,
      _progress: Math.max(8, Number(item.progress || 0) - 12),
    });
    // 失败提示无需手动隐藏：上面已把 _publishState 改回 'queued'，模板上的
    // v-if="item.post._publishState === 'failed'" 随之卸载该节点（2026-10-30 P3-10，
    // 原先这里用 document.querySelector 直改子组件 DOM，既绕开响应式又是一层冗余补丁）。
    // 重试由常驻岛环恢复为发送态
    void runPublishQueue();
  };

  // E1 网络恢复自动重试：弱网/断网失败的帖子在网络恢复后自动重发（2s 节流防抖），
  // 地铁/电梯场景「发送失败」自动变成功，用户无需手动点重试
  let lastOnlineRecoveryAt = 0;
  const handleNetworkOnline = () => {
    const now = Date.now();
    if (now - lastOnlineRecoveryAt < 2000) return;
    lastOnlineRecoveryAt = now;
    const failedItems = publishQueueStore.items.filter(
      (i) => i.state === 'failed' && i.failType === 'network',
    );
    failedItems.forEach((item) => retryPublish(item.id));
  };
  onMounted(() => window.addEventListener('online', handleNetworkOnline));
  onUnmounted(() => window.removeEventListener('online', handleNetworkOnline));

  const cancelPublish = async (queueId) => {
    const controller = publishAbortControllers.get(queueId);
    if (controller) {
      try {
        controller.abort();
      } catch {
        /* abort() 在已结束的 signal 上可能抛；此处只是尽力取消，失败不影响后续清理。 */
      }
      publishAbortControllers.delete(queueId);
    }
    const item = publishQueueStore.items.find((i) => i.id === queueId);
    if (item) {
      // 取消未完成的预热管线；正在上传的让其自然完成并登记 pending（由云端兜底清理），不再主动删除
      (item.images || []).forEach((img) => {
        if (img?.uploadId) cancelDraftImagePipeline(img.uploadId);
      });
      // 清理已上传但未落库的云端图（跳过仍被编辑器持有的管线图，避免误删）
      const toCleanup = (item.images || []).filter(
        (img) =>
          (img.publicId || img.deleteToken) &&
          !postImages.value.some((x) => x.uploadId === img.uploadId),
      );
      if (toCleanup.length) {
        toCleanup.forEach((img) => {
          void cleanupUploadedForumImage(img, { silent: true });
          if (img.localPreviewUrl)
            try {
              URL.revokeObjectURL(img.localPreviewUrl);
            } catch {
              /* revokeObjectURL 对已释放/非法 URL 抛错，纯属清理动作，失败无需处理。 */
            }
        });
      } else {
        (item.images || []).forEach((img) => {
          if (img.localPreviewUrl)
            try {
              URL.revokeObjectURL(img.localPreviewUrl);
            } catch {
              /* revokeObjectURL 对已释放/非法 URL 抛错，纯属清理动作，失败无需处理。 */
            }
        });
      }
    }
    publishQueueStore.removeItem(queueId);
    removeOptimisticPost(queueId);
    // 取消后常驻岛自动收起（无瞬时岛）
    // 若还有队列则继续
    if (publishQueueStore.items.some((i) => i.state === 'queued')) void runPublishQueue();
  };
  const fixModerationPublish = async (queueId) => {
    const item = publishQueueStore.items.find((i) => i.id === queueId);
    if (!item) return;
    const failedIdx = Number(item.failedImageIndex);
    const hasFailed =
      Number.isInteger(failedIdx) && failedIdx >= 0 && failedIdx < (item.images || []).length;
    let nextImages;
    if (hasFailed) {
      const failedImg = item.images[failedIdx];
      if (failedImg?.uploadId) cancelDraftImagePipeline(failedImg.uploadId);
      if (failedImg?.localPreviewUrl)
        try {
          URL.revokeObjectURL(failedImg.localPreviewUrl);
        } catch {
          /* 同上：释放预览图 URL 是清理动作，失败无需处理。 */
        }
      // 若已上传到云端但未落库，需删除
      if (failedImg?.publicId || failedImg?.deleteToken)
        void cleanupUploadedForumImage(failedImg, { silent: true });
      nextImages = item.images
        .filter((_, i) => i !== failedIdx)
        .map((img, i) => ({ ...img, sortOrder: i }));
      // 若移除后无图，则保留纯文
    } else {
      nextImages = item.images;
    }
    // 重启剩余未完成图的预热管线（失败时可能已被取消）
    (nextImages || []).forEach((img, idx) => {
      if (img?.file && img.uploadStatus !== 'approved') {
        scheduleDraftImagePipeline(img, idx, nextImages.length);
      }
    });
    publishQueueStore.updateItem(queueId, {
      images: nextImages,
      state: 'queued',
      failType: null,
      failedImageIndex: null,
      failedImageId: null,
      errorMessage: '',
      progress: Math.max(18, Number(item.progress || 0) - 10),
    });
    updateOptimisticPost(queueId, {
      _publishState: 'queued',
      _failType: null,
      _progress: Math.max(18, Number(item.progress || 0) - 10),
    });
    // 移除后由常驻岛恢复发送态
    void runPublishQueue();
  };
  // 发布失败后取回内容重新编辑：快照（含未上传的本地图片）交还编辑器，队列项与乐观卡移除
  const editFailedPublish = (queueId) => {
    const item = publishQueueStore.items.find((i) => i.id === queueId);
    if (!item) return;
    const controller = publishAbortControllers.get(queueId);
    if (controller) {
      try {
        controller.abort();
      } catch {
        /* abort() 在已结束的 signal 上可能抛；此处只是尽力取消，失败不影响后续清理。 */
      }
      publishAbortControllers.delete(queueId);
    }
    newPost.value.title = String(item.title || '');
    newPost.value.content = String(item.body || '');
    selectedPostTag.value = item.tag || 'daily';
    postLocation.value = item.location ? { ...item.location } : null;
    // 已上传成功的图保留 approved 状态（带云端 url，重发时跳过上传），
    // 未完成的图保留 file + 本地预览，重发时由队列重新走压缩/检测/上传
    postImages.value = normalizePostImageSortState(
      (item.images || []).map((img, idx) => ({ ...img, sortOrder: idx })),
    );
    postImageUploadStatus.value = '';
    publishQueueStore.removeItem(queueId);
    removeOptimisticPost(queueId);
    // 失败会中断整条队列（runPublishQueue 的 catch 走 break 等用户处置）。把内容交还编辑器
    // 就等于「这条处置完了」，必须把 worker 拉起来 —— 否则后面排着的帖永远停在 queued：
    // 常驻岛一直显示「已提交，后台处理中」、进度不动、也没有任何可点的失败入口（2026-10-29 实读）。
    // retry / fix / cancel 三条路径都已各自拉起，只有 edit 这条漏了。
    if (publishQueueStore.items.some((i) => i.state === 'queued')) void runPublishQueue();
    // 未完成的图重启预热管线（回到编辑器期间继续后台处理，再次发布时接近秒发）
    postImages.value.forEach((img, idx) => {
      if (img?.file && img.uploadStatus !== 'approved') {
        scheduleDraftImagePipeline(img, idx, postImages.value.length);
      }
    });
    // 草稿恢复后，发布会话由外层显式打开（FAB / 左栏「发布」）。
  };

  return {
    publishQueueItems,
    insertOptimisticPost,
    updateOptimisticPost,
    removeOptimisticPost,
    runPublishQueue,
    retryPublish,
    cancelPublish,
    editFailedPublish,
    fixModerationPublish,
  };
}
