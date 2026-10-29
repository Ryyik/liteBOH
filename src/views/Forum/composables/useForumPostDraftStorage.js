/**
 * 发帖草稿存储 —— **单草稿**模型（2026-10-26 起）。
 *
 * 语义（用户 2026-10-26 明确要求）：
 *   · 一个用户只有**一份**草稿，云端 `forum_post_drafts` 那份为准；
 *   · 本地 localStorage 只是它的缓存 / 离线兜底，不存在"草稿列表"这种东西；
 *   · 清空内容、或退出时选「不保存」= **删除**这份草稿；
 *   · 多版本草稿（`*_versions`）已整体移除，残留 key 由 `purgeLegacyDraftVersions` 清掉。
 *
 * 2026-10-29 补的**实时暂存**（`<prefix>_<uid>_autosave`）不是第二份草稿，别混：
 *   它是编辑器当前状态的本机镜像，用于兜住"刷新 / 崩溃 / 误关标签页"丢内容与图片。
 *   不进云端、不出现在任何"草稿列表"、也不参与用户可见的"保存草稿"语义；
 *   用户明确删除草稿时它一起被清掉。
 *
 * ⚠️ 别再引入"草稿列表 / 历史版本"：那是被明确否掉的产品形态。
 */

/**
 * 草稿变更的**同标签页广播**（2026-10-26）。
 *
 * 为什么需要：论坛有两个宿主实例 —— 首页 `/`（无 keepAlive，离开即销毁重建）与
 * UserSpace 的 embedded 形态（keepAlive 路由 + 分区壳 v-show 常驻）。两者共享同一个
 * localStorage key，却各持一份 `newPost` 副本。没有同步通道时，一个实例发布/清空后，
 * 另一个实例仍保留旧文本 ⇒ 切回去看到「已发布的内容复活」，点「保存草稿」还会把旧
 * 内容写回去覆盖新草稿。
 *
 * ⚠️ 不能用 `storage` 事件：同一标签页内的 localStorage 写入**不会**触发自己的
 * `storage` 事件，而两个宿主实例恰好都活在同一个 tab 里。
 */
export const FORUM_POST_DRAFT_CHANGE_EVENT = 'boh:forum-post-draft-changed';

/**
 * 编辑器内容是否与某份草稿一致（= 没有未保存的改动）。
 *
 * 两种口径，调用方按拿不拿得到图片列表二选一：
 *   · 传 `imageUrls`（本机实时暂存草稿，能存图）⇒ 逐张比对 URL；
 *   · 不传 ⇒ 退回旧语义「有图一律算脏」（云端草稿表没有图片列，图片确实存不进去）。
 *
 * ⚠️ 这是**同一个判据**的三个用途，必须只有一份实现：
 *   ① 跨实例广播时「能不能动对方的编辑器」；
 *   ② KeepAlive 唤醒 / 重新打开编辑器时「能不能用草稿覆盖 newPost」；
 *   ③ beforeunload「刷新会不会丢东西」。
 * 各写一份就会分叉出「一个说脏、一个说干净」的假绿。
 */
export function isDraftInSyncWithEditor({
  draft,
  title = '',
  content = '',
  hasImages = false,
  imageUrls = null,
}) {
  const safeTitle = String(title || '');
  const safeContent = String(content || '');
  if (Array.isArray(imageUrls)) {
    /* 有图时不能再用 hasImages 的「永远脏」口径 —— 实时暂存草稿已经能存图，
       继续按旧口径判脏会让 beforeunload 在"图与草稿完全一致"时也弹提示。 */
    const editorUrls = imageUrls.map((url) => String(url || '').trim()).filter(Boolean);
    const draftUrls = (Array.isArray(draft?.images) ? draft.images : [])
      .map((image) => String(image?.url || '').trim())
      .filter(Boolean);
    if (editorUrls.length !== draftUrls.length) return false;
    if (editorUrls.some((url, index) => url !== draftUrls[index])) return false;
    if (!draft) return editorUrls.length === 0 && !safeTitle.trim() && !safeContent.trim();
    return safeTitle === String(draft.title || '') && safeContent === String(draft.content || '');
  }
  if (hasImages) return false;
  if (!draft) return !safeTitle.trim() && !safeContent.trim();
  return safeTitle === String(draft.title || '') && safeContent === String(draft.content || '');
}

/** 草稿里能保存的图片：只接受**持久化** URL。
 *  `blob:` 刷新后必失效 —— 存进草稿会把"图片回来了"变成假象（一个打不开的灰块），
 *  比不恢复更糟，所以这里直接丢掉，由 UI 提示"有 N 张图未保存"。 */
export function normalizeDraftImageList(images, maxCount = 9) {
  if (!Array.isArray(images)) return [];
  return images
    .map((item) => {
      const url = String(item?.url || item?.uploadedUrl || '').trim();
      if (!/^https?:\/\//i.test(url)) return null;
      const width = Number(item?.width || 0);
      const height = Number(item?.height || 0);
      return { url, width: width > 0 ? width : 0, height: height > 0 ? height : 0 };
    })
    .filter(Boolean)
    .slice(0, Math.max(0, Number(maxCount) || 0));
}

export function useForumPostDraftStorage({ getUserId, normalizeTag, prefix, logger }) {
  const getDraftStorageKey = (userId = getUserId()) => {
    const uid = String(userId || 'guest').trim() || 'guest';
    return `${prefix}_${uid}`;
  };
  const getDraftClearedAtStorageKey = (userId = getUserId()) =>
    `${getDraftStorageKey(userId)}_cleared_at`;
  /**
   * 「本机有一份**尚未成功同步到云端**的改动」标记（2026-10-29）。
   *
   * 存在的唯一理由：把「本机草稿要不要覆盖云端」从**猜测**（比较 savedAt 谁更晚）
   * 变成**事实**。没有它时，任何一台仍持有旧副本的设备都能在「云端查不到草稿」时
   * 把旧内容 upsert 回去 —— 用户在另一台设备上删掉的草稿就这样复活，
   * 且每写一次都刷新 updated_at，表现为"怎么删都删不掉"的僵尸草稿。
   *
   * 语义（只在这两处变）：
   *   · 置位：用户在本机**主动保存**草稿时（此刻本地确实领先云端）；
   *   · 清除：这次改动真的写进云端之后，或用户明确删除草稿之后。
   * 于是"云端没有草稿 + 本机没有该标记" ⇒ 云端被别处删过，本机副本是历史遗迹，
   * **不许回写**（只留在本地给用户看，不复活云端）。
   */
  const getDraftPendingPushStorageKey = (userId = getUserId()) =>
    `${getDraftStorageKey(userId)}_pending_push`;
  /** 本机实时暂存（"输入即落盘"那一份）。与云端草稿**不是**同一份东西：
   *  · 云端草稿 = 用户明确说"保存"的内容，跨设备、只有 title/content/tag；
   *  · 实时暂存 = 编辑器当前状态的本机镜像（含已上传图片 URL），只为兜住
   *    "刷新 / 崩溃 / 手滑关标签页"这类事故，从不参与云端写入。
   *  两条 key 分开，是为了让"清草稿"与"清暂存"能各自独立失败、独立重试。 */
  const getAutoSaveStorageKey = (userId = getUserId()) => `${getDraftStorageKey(userId)}_autosave`;

  /** 多版本时代的遗留缓存（`<prefix>_<uid>_versions`）—— 单草稿模型下没有任何用处，
   *  留着只会让"只有一份草稿"的语义在地面上失真。按前缀扫一遍全清。 */
  const purgeLegacyDraftVersions = () => {
    try {
      const legacyKeys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${prefix}_`) && key.endsWith('_versions')) {
          legacyKeys.push(key);
        }
      }
      legacyKeys.forEach((key) => localStorage.removeItem(key));
    } catch (error) {
      logger?.warn?.('forum', '清理旧版草稿版本缓存失败:', error);
    }
  };

  const normalizeDraftPayload = (draft) => {
    if (!draft || typeof draft !== 'object') return null;
    const title = String(draft.title || '');
    const content = String(draft.content || '');
    const tag = normalizeTag(draft.tag) || 'daily';
    const savedAt = Number(draft.savedAt || Date.now()) || Date.now();
    const images = normalizeDraftImageList(draft.images);
    if (!title.trim() && !content.trim() && !images.length) return null;
    /* images 只在真有图时才落字段：`toEqual` 口径的守卫（单草稿语义那一组）按
       「权威结构 = title/content/tag/savedAt」断言，凭空多一个空数组会让人以为
       草稿结构变了。 */
    return images.length
      ? { title, content, tag, savedAt, images }
      : { title, content, tag, savedAt };
  };

  const readDraftClearedAt = (userId = getUserId()) => {
    try {
      const clearedAt = Number(localStorage.getItem(getDraftClearedAtStorageKey(userId)) || 0);
      return Number.isFinite(clearedAt) ? clearedAt : 0;
    } catch {
      return 0;
    }
  };

  const markDraftCleared = () => {
    try {
      localStorage.setItem(getDraftClearedAtStorageKey(), String(Date.now()));
    } catch (error) {
      logger?.warn?.('forum', '记录草稿清空状态失败:', error);
    }
  };

  const clearDraftClearedMarker = (userId = getUserId()) => {
    try {
      localStorage.removeItem(getDraftClearedAtStorageKey(userId));
    } catch (error) {
      logger?.warn?.('forum', '清理草稿清空状态失败:', error);
    }
  };

  /** 读出「待同步」标记的时间戳（0 = 没有待同步改动）。 */
  const readDraftPendingPush = (userId = getUserId()) => {
    try {
      const at = Number(localStorage.getItem(getDraftPendingPushStorageKey(userId)) || 0);
      return Number.isFinite(at) && at > 0 ? at : 0;
    } catch {
      return 0;
    }
  };

  const markDraftPendingPush = (userId = getUserId()) => {
    try {
      localStorage.setItem(getDraftPendingPushStorageKey(userId), String(Date.now()));
    } catch (error) {
      logger?.warn?.('forum', '记录草稿待同步状态失败:', error);
    }
  };

  const clearDraftPendingPush = (userId = getUserId()) => {
    try {
      localStorage.removeItem(getDraftPendingPushStorageKey(userId));
    } catch (error) {
      logger?.warn?.('forum', '清理草稿待同步状态失败:', error);
    }
  };

  const readPostDraft = () => {
    try {
      const raw = localStorage.getItem(getDraftStorageKey());
      return raw ? normalizeDraftPayload(JSON.parse(raw)) : null;
    } catch (error) {
      logger?.warn?.('forum', '读取发帖草稿失败:', error);
      return null;
    }
  };

  const writeLocalPostDraft = (draft) => {
    try {
      if (!draft) {
        localStorage.removeItem(getDraftStorageKey());
        markDraftCleared();
        /* 本地草稿被清掉 ⇒ 按定义就没有「本机欠云端一次写入」这回事了。
           在这一处统一清（而不是每个调用点各清一遍），漏一个调用点就会留下一个
           让旧副本重新上云的通行证。 */
        clearDraftPendingPush();
        return;
      }
      clearDraftClearedMarker();
      localStorage.setItem(getDraftStorageKey(), JSON.stringify(draft));
    } catch (error) {
      logger?.warn?.('forum', '写入发帖草稿失败:', error);
    }
  };

  /**
   * 实时暂存：编辑器一边打字一边写，只为「刷新 / 崩溃 / 误关标签页」兜底。
   * ⚠️ 与 `writeLocalPostDraft` 的语义差别必须保持：
   *   · 写 null **不**设"已清空"墓碑 —— 暂存消失不是用户的删除意图（例如发布成功后
   *     清暂存），设墓碑会让紧接着的一篇新帖永远存不进云端草稿；
   *   · 它也不参与云端写入，读写失败一律只 warn。
   */
  const readAutoSaveDraft = () => {
    try {
      const raw = localStorage.getItem(getAutoSaveStorageKey());
      return raw ? normalizeDraftPayload(JSON.parse(raw)) : null;
    } catch (error) {
      logger?.warn?.('forum', '读取发帖实时暂存失败:', error);
      return null;
    }
  };

  const writeAutoSaveDraft = (draft) => {
    try {
      if (!draft) {
        localStorage.removeItem(getAutoSaveStorageKey());
        return;
      }
      localStorage.setItem(getAutoSaveStorageKey(), JSON.stringify(draft));
    } catch (error) {
      logger?.warn?.('forum', '写入发帖实时暂存失败:', error);
    }
  };

  purgeLegacyDraftVersions();

  return {
    normalizeDraftPayload,
    readDraftClearedAt,
    clearDraftClearedMarker,
    readDraftPendingPush,
    markDraftPendingPush,
    clearDraftPendingPush,
    readPostDraft,
    writeLocalPostDraft,
    readAutoSaveDraft,
    writeAutoSaveDraft,
  };
}
