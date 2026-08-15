import { ref } from 'vue';

export function useForumPostDraftStorage({
  getUserId,
  normalizeTag,
  prefix,
  versionLimit,
  logger
}) {
  const postDraftVersions = ref([]);

  const getDraftStorageKey = (userId = getUserId()) => {
    const uid = String(userId || 'guest').trim() || 'guest';
    return `${prefix}_${uid}`;
  };
  const getDraftVersionStorageKey = () => `${getDraftStorageKey()}_versions`;
  const getDraftClearedAtStorageKey = (userId = getUserId()) => `${getDraftStorageKey(userId)}_cleared_at`;

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

  const readPostDraftVersions = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(getDraftVersionStorageKey()) || '[]');
      return Array.isArray(parsed)
        ? parsed.map(normalizeDraftPayload).filter(Boolean).slice(0, versionLimit)
        : [];
    } catch (error) {
      logger?.warn?.('forum', '读取发帖草稿版本失败:', error);
      return [];
    }
  };

  const writePostDraftVersions = (versions = []) => {
    const safeVersions = Array.isArray(versions)
      ? versions.map(normalizeDraftPayload).filter(Boolean).slice(0, versionLimit)
      : [];
    postDraftVersions.value = safeVersions;
    try {
      if (!safeVersions.length) {
        localStorage.removeItem(getDraftVersionStorageKey());
      } else {
        localStorage.setItem(getDraftVersionStorageKey(), JSON.stringify(safeVersions));
      }
    } catch (error) {
      logger?.warn?.('forum', '写入发帖草稿版本失败:', error);
    }
  };

  const rememberPostDraftVersion = (draft) => {
    const normalizedDraft = normalizeDraftPayload(draft);
    if (!normalizedDraft) return;
    const versions = readPostDraftVersions();
    const latest = versions[0];
    if (latest && latest.title === normalizedDraft.title && latest.content === normalizedDraft.content && latest.tag === normalizedDraft.tag) {
      postDraftVersions.value = versions;
      return;
    }
    writePostDraftVersions([normalizedDraft, ...versions]);
  };

  return {
    postDraftVersions,
    normalizeDraftPayload,
    readDraftClearedAt,
    clearDraftClearedMarker,
    readPostDraft,
    writeLocalPostDraft,
    readPostDraftVersions,
    writePostDraftVersions,
    rememberPostDraftVersion
  };
}
