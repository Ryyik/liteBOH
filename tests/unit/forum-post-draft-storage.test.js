import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useForumPostDraftStorage,
  isDraftInSyncWithEditor,
  normalizeDraftImageList,
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
    storage.writeLocalPostDraft({
      title: '第二版',
      content: '正文二',
      tag: 'question',
      savedAt: 2,
    });
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
    expect(
      isDraftInSyncWithEditor({ draft, title: '标题', content: '正文', hasImages: true }),
    ).toBe(false);
    expect(isDraftInSyncWithEditor({ draft: null, hasImages: true })).toBe(false);
  });

  it('compares image urls when the caller can supply them (autosave can hold images)', () => {
    const withImage = {
      title: '标题',
      content: '正文',
      tag: 'daily',
      savedAt: 1,
      images: [{ url: 'https://cdn.example.com/a.jpg', width: 0, height: 0 }],
    };
    expect(
      isDraftInSyncWithEditor({
        draft: withImage,
        title: '标题',
        content: '正文',
        imageUrls: ['https://cdn.example.com/a.jpg'],
      }),
    ).toBe(true);
    // 图数量/顺序不同就不是同一份
    expect(
      isDraftInSyncWithEditor({ draft: withImage, title: '标题', content: '正文', imageUrls: [] }),
    ).toBe(false);
    expect(
      isDraftInSyncWithEditor({
        draft: withImage,
        title: '标题',
        content: '正文',
        imageUrls: ['https://cdn.example.com/b.jpg'],
      }),
    ).toBe(false);
    // 云端草稿没有图片列 ⇒ 编辑器里有图就一定算脏
    expect(
      isDraftInSyncWithEditor({
        draft,
        title: '标题',
        content: '正文',
        imageUrls: ['https://cdn.example.com/a.jpg'],
      }),
    ).toBe(false);
  });
});

/**
 * 实时暂存（2026-10-29）：为「刷新 / 崩溃 / 误关标签页」兜底的**本机镜像**。
 * 它不是第二份草稿 —— 这组测试锁住它与正式草稿的边界：两条 key 各管各的，
 * 清一边不连带另一边，且绝不接受刷新后必失效的 blob: 地址。
 */
describe('forum post draft autosave (refresh / crash recovery)', () => {
  it('stores autosave and the single draft independently', () => {
    const storage = createDraftStorage();
    storage.writeLocalPostDraft({ title: '正式', content: '草稿', tag: 'daily', savedAt: 10 });
    storage.writeAutoSaveDraft({ title: '实时', content: '暂存', tag: 'daily', savedAt: 20 });

    expect(storage.readPostDraft()).toMatchObject({ title: '正式', savedAt: 10 });
    expect(storage.readAutoSaveDraft()).toMatchObject({ title: '实时', savedAt: 20 });
  });

  it('does not mark the draft as cleared when only the autosave is dropped', () => {
    const storage = createDraftStorage();
    storage.writeAutoSaveDraft({ title: '实时', content: '暂存', tag: 'daily', savedAt: 20 });
    storage.writeAutoSaveDraft(null);

    expect(storage.readAutoSaveDraft()).toBeNull();
    // 清暂存 ≠ 用户删除草稿：墓碑必须保持 0，否则下一份新草稿会被误拦
    expect(storage.readDraftClearedAt()).toBe(0);
  });

  it('keeps uploaded image urls across a read/write round trip', () => {
    const storage = createDraftStorage();
    storage.writeAutoSaveDraft({
      title: '带图',
      content: '',
      tag: 'daily',
      savedAt: 30,
      images: [
        { url: 'https://cdn.example.com/a.jpg', width: 1200, height: 800 },
        { url: 'blob:https://boh.example/1234', width: 0, height: 0 },
      ],
    });

    const back = storage.readAutoSaveDraft();
    expect(back.images).toEqual([
      { url: 'https://cdn.example.com/a.jpg', width: 1200, height: 800 },
    ]);
  });

  it('returns null instead of an empty husk so an empty autosave cannot overwrite a draft', () => {
    const storage = createDraftStorage();
    storage.writeAutoSaveDraft({ title: '   ', content: '\n', tag: 'daily', savedAt: 1 });
    expect(storage.readAutoSaveDraft()).toBeNull();
  });

  it('drops non-http(s) urls and caps the list', () => {
    const images = normalizeDraftImageList(
      [
        { url: 'blob:https://x/1' },
        { url: 'data:image/png;base64,AAA' },
        { url: 'https://cdn.example.com/ok.jpg' },
        { url: '  https://cdn.example.com/ok2.jpg  ' },
      ],
      1,
    );
    expect(images).toEqual([{ url: 'https://cdn.example.com/ok.jpg', width: 0, height: 0 }]);
  });
});

/**
 * 「本机欠云端一次写入」标记（2026-10-29 第二轮，跨设备僵尸草稿）。
 *
 * 以前判断"本机草稿要不要覆盖云端"靠比较 savedAt —— 那只说明本机这份看起来更新，
 * 不说明云端**欠它一次写入**。于是另一台设备把草稿删掉后，任何仍留着旧副本的设备
 * 在"云端查不到草稿"时都会把它推回去，用户看到"怎么删都删不掉"。
 *
 * 现在只有这个标记存在时才允许回写。语义边界必须锁死：
 *   · 用户主动保存 ⇒ 置位（本地确实领先云端）；
 *   · 云端写成功 / 用户删草稿 ⇒ 清除；
 *   · 恢复时把远端草稿写回本地 ⇒ **不**置位（那是云端领先，不是本地领先）。
 */
describe('draft pending-push marker (cross-device zombie gate)', () => {
  it('round-trips the marker and clears it on demand', () => {
    const storage = createDraftStorage();
    expect(storage.readDraftPendingPush()).toBe(0);
    storage.markDraftPendingPush();
    expect(storage.readDraftPendingPush()).toBeGreaterThan(0);
    storage.clearDraftPendingPush();
    expect(storage.readDraftPendingPush()).toBe(0);
  });

  it('keeps the marker through a read of the draft (marker is not derived from content)', () => {
    const storage = createDraftStorage();
    storage.writeLocalPostDraft({ title: '待发', content: '正文', tag: 'daily', savedAt: 5 });
    storage.markDraftPendingPush();
    expect(storage.readPostDraft()).toMatchObject({ title: '待发' });
    expect(storage.readDraftPendingPush()).toBeGreaterThan(0);
  });

  it('drops the marker when the local draft is deleted (single point of truth)', () => {
    const storage = createDraftStorage();
    storage.writeLocalPostDraft({ title: '待发', content: '正文', tag: 'daily', savedAt: 5 });
    storage.markDraftPendingPush();
    storage.writeLocalPostDraft(null);
    // 本地草稿都没了 ⇒ 按定义不存在"本机欠云端一次写入"，标记必须一起清
    expect(storage.readDraftPendingPush()).toBe(0);
  });

  it('does not set the marker when only the autosave (unconfirmed edit) is written', () => {
    const storage = createDraftStorage();
    storage.writeAutoSaveDraft({ title: '打到一半', content: '正文', tag: 'daily', savedAt: 9 });
    // 实时暂存不是用户的保存动作：它绝不能让本机获得"覆盖云端"的资格
    expect(storage.readDraftPendingPush()).toBe(0);
  });
});
