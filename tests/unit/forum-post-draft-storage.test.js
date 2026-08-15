import { afterEach, describe, expect, it, vi } from 'vitest';
import { useForumPostDraftStorage } from '../../src/views/Forum/composables/useForumPostDraftStorage.js';

const createDraftStorage = () => useForumPostDraftStorage({
  getUserId: () => 'user-1',
  normalizeTag: (tag) => ['daily', 'question'].includes(tag) ? tag : '',
  prefix: 'forum_draft',
  versionLimit: 2,
  logger: { warn: vi.fn() }
});

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('forum post draft storage', () => {
  it('keeps local drafts and their latest versions in sync', () => {
    const storage = createDraftStorage();
    const first = storage.normalizeDraftPayload({ title: '标题', content: '正文', tag: 'daily', savedAt: 1 });
    storage.writeLocalPostDraft(first);
    storage.rememberPostDraftVersion(first);
    storage.rememberPostDraftVersion({ title: '标题 2', content: '正文', tag: 'question', savedAt: 2 });
    expect(storage.readPostDraft()).toEqual(first);
    expect(storage.postDraftVersions.value).toHaveLength(2);
  });

  it('marks a cleared local draft so an older remote copy cannot overwrite it', () => {
    const storage = createDraftStorage();
    storage.writeLocalPostDraft(null);
    expect(storage.readPostDraft()).toBeNull();
    expect(storage.readDraftClearedAt()).toBeGreaterThan(0);
  });
});
