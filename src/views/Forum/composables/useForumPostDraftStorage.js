/**
 * 发帖草稿存储 —— **单草稿**模型（2026-10-26 起）。
 *
 * 语义（用户 2026-10-26 明确要求）：
 *   · 一个用户只有**一份**草稿，云端 `forum_post_drafts` 那份为准；
 *   · 本地 localStorage 只是它的缓存 / 离线兜底，不存在"草稿列表"这种东西；
 *   · 清空内容、或退出时选「不保存」= **删除**这份草稿；
 *   · 多版本草稿（`*_versions`）已整体移除，残留 key 由 `purgeLegacyDraftVersions` 清掉。
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
 * 草稿只存 title/content/tag ⇒ 有图一律视为「有未保存改动」（图片存不进草稿）。
 *
 * ⚠️ 这是**同一个判据**的三个用途，必须只有一份实现：
 *   ① 跨实例广播时「能不能动对方的编辑器」；
 *   ② KeepAlive 唤醒 / 重新打开编辑器时「能不能用草稿覆盖 newPost」；
 *   ③ beforeunload「刷新会不会丢东西」。
 * 各写一份就会分叉出「一个说脏、一个说干净」的假绿。
 */
export function isDraftInSyncWithEditor({ draft, title = '', content = '', hasImages = false }) {
  const safeTitle = String(title || '');
  const safeContent = String(content || '');
  if (hasImages) return false;
  if (!draft) return !safeTitle.trim() && !safeContent.trim();
  return safeTitle === String(draft.title || '') && safeContent === String(draft.content || '');
}

export function useForumPostDraftStorage({ getUserId, normalizeTag, prefix, logger }) {
  const getDraftStorageKey = (userId = getUserId()) => {
    const uid = String(userId || 'guest').trim() || 'guest';
    return `${prefix}_${uid}`;
  };
  const getDraftClearedAtStorageKey = (userId = getUserId()) =>
    `${getDraftStorageKey(userId)}_cleared_at`;

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
    if (!title.trim() && !content.trim()) return null;
    return { title, content, tag, savedAt };
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
        return;
      }
      clearDraftClearedMarker();
      localStorage.setItem(getDraftStorageKey(), JSON.stringify(draft));
    } catch (error) {
      logger?.warn?.('forum', '写入发帖草稿失败:', error);
    }
  };

  purgeLegacyDraftVersions();

  return {
    normalizeDraftPayload,
    readDraftClearedAt,
    clearDraftClearedMarker,
    readPostDraft,
    writeLocalPostDraft,
  };
}
