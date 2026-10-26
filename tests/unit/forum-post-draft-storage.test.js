import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useForumPostDraftStorage,
  isDraftInSyncWithEditor,
} from '../../src/views/Forum/composables/useForumPostDraftStorage.js';

const createDraftStorage = () =>
  useForumPostDraftStorage({
    getUserId: () => 'user-1',
    normalizeTag: (tag) => (['daily', 'question'].includes(tag) ? tag : ''),
    prefix: 'forum_draft',
    logger: { warn: vi.fn() },
  });

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

/**
 * 单草稿模型（2026-10-26 产品定稿）：一个用户只有一份草稿，云端那份为准，
 * 本地只是它的缓存。**没有草稿列表 / 历史版本** —— 这几条锁住这个语义，
 * 防止有人把多版本那套加回来。
 */
describe('forum post draft storage (single draft)', () => {
  it('keeps exactly one draft: a later save overwrites the earlier one', () => {
    const storage = createDraftStorage();
    storage.writeLocalPostDraft({ title: '第一版', content: '正文一', tag: 'daily', savedAt: 1 });
    storage.writeLocalPostDraft({ title: '第二版', content: '正文二', tag: 'question', savedAt: 2 });
    expect(storage.readPostDraft()).toEqual({
      title: '第二版',
      content: '正文二',
      tag: 'question',
      savedAt: 2,
    });
  });

  it('marks a cleared draft so an older remote copy cannot overwrite it', () => {
    const storage = createDraftStorage();
    storage.writeLocalPostDraft(null);
    expect(storage.readPostDraft()).toBeNull();
    expect(storage.readDraftClearedAt()).toBeGreaterThan(0);
  });

  it('purges legacy multi-version caches on init without touching the live draft', () => {
    const legacyKey = 'forum_draft_user-1_versions';
    const liveKey = 'forum_draft_user-1';
    localStorage.setItem(
      legacyKey,
      JSON.stringify([{ title: '旧版本', content: '历史', tag: 'daily', savedAt: 1 }]),
    );
    localStorage.setItem(
      liveKey,
      JSON.stringify({ title: '当前草稿', content: '正文', tag: 'daily', savedAt: 2 }),
    );

    createDraftStorage();

    expect(localStorage.getItem(legacyKey)).toBeNull();
    expect(localStorage.getItem(liveKey)).not.toBeNull();
  });
});

/**
 * 「编辑器与草稿是否一致」是跨实例广播、KeepAlive 唤醒恢复、beforeunload 拦截三处的
 * **同一个**判据（2026-10-26）。这里锁住它的三条边界，特别是"有图就算脏"——草稿不含
 * 图片，如果判成"一致"，另一个实例广播清空时会把用户刚选的图连同内容一起抹掉。
 */
describe('forum draft vs editor sync predicate', () => {
  const draft = { title: '标题', content: '正文', tag: 'daily', savedAt: 1 };

  it('treats identical text as in sync and any edit as dirty', () => {
    expect(isDraftInSyncWithEditor({ draft, title: '标题', content: '正文' })).toBe(true);
    expect(isDraftInSyncWithEditor({ draft, title: '标题', content: '正文补一句' })).toBe(false);
    expect(isDraftInSyncWithEditor({ draft, title: '改过的标题', content: '正文' })).toBe(false);
  });

  it('treats a missing draft as in sync only when the editor is empty', () => {
    expect(isDraftInSyncWithEditor({ draft: null, title: '', content: '  \n ' })).toBe(true);
    expect(isDraftInSyncWithEditor({ draft: null, title: '', content: '刚写的' })).toBe(false);
    expect(isDraftInSyncWithEditor({ draft: undefined, title: '只有标题' })).toBe(false);
  });

  it('always treats attached images as unsaved work (drafts cannot hold images)', () => {
    expect(isDraftInSyncWithEditor({ draft, title: '标题', content: '正文', hasImages: true })).toBe(
      false,
    );
    expect(isDraftInSyncWithEditor({ draft: null, hasImages: true })).toBe(false);
  });
});
