/**
 * forum-album.test.js — 锁影集帖的「A 投影」数据契约
 *
 * 事故/动机：影集帖最容易走成「再存一份图片地址」的第三份副本（plans/039 §9.2
 * 实测过 forum_post_images ↔ boh_cloud_entries 的单向漂移）。本文件锁三件事：
 *   1. entries 里**不含 url**，只有文字四字段；
 *   2. entries 与图片按下标一一对齐（删图/加图后不能错位）；
 *   3. 空 entries = 普通帖（`isAlbumPost` 是唯一判据，不认 post_kind）。
 */
import { describe, expect, it } from 'vitest';
import {
  ALBUM_INTRO_MAX,
  ALBUM_MAX_ENTRIES,
  buildEmptyAlbumEntries,
  getAlbumEntry,
  getAlbumPhotoCount,
  hasAlbumBook,
  isAlbumPost,
  normalizeAlbumBook,
  normalizeAlbumEntries,
  syncAlbumEntriesToCount,
  toAlbumEntriesRpcPayload,
  validateAlbumDraft,
} from '../../src/utils/forum-album.js';

describe('影集帖 —— 数据契约', () => {
  it('空数组 / 非法输入 = 普通帖', () => {
    expect(isAlbumPost({ album_entries: [] })).toBe(false);
    expect(isAlbumPost({})).toBe(false);
    expect(isAlbumPost(null)).toBe(false);
    expect(isAlbumPost({ album_entries: [{ title: 'a' }] })).toBe(true);
  });

  it('不认 post_kind：即使标了 album，没有 entries 也不算影集帖', () => {
    expect(isAlbumPost({ post_kind: 'album', album_entries: [] })).toBe(false);
  });

  it('entries 里不保留图片地址（防止第三份副本）', () => {
    const [entry] = normalizeAlbumEntries([
      {
        title: '塔在雾里',
        date: '2026.11.08',
        place: '塔下',
        body: '阴天。',
        url: 'https://x/y.jpg',
      },
    ]);
    expect(entry).toEqual({ title: '塔在雾里', date: '2026.11.08', place: '塔下', body: '阴天。' });
    expect(Object.keys(entry)).not.toContain('url');
  });

  it('超长文本按上限截断，条数按 10 截断', () => {
    const many = Array.from({ length: ALBUM_MAX_ENTRIES + 5 }, () => ({ title: 'x'.repeat(40) }));
    const safe = normalizeAlbumEntries(many);
    expect(safe).toHaveLength(ALBUM_MAX_ENTRIES);
    expect(safe[0].title.length).toBe(16);
  });

  it('字符串来源（本地草稿 / RPC）也能解析', () => {
    const safe = normalizeAlbumEntries('[{"title":"一杯冰的","body":"十一月了。"}]');
    expect(safe).toHaveLength(1);
    expect(safe[0].title).toBe('一杯冰的');
    expect(normalizeAlbumEntries('not-json')).toEqual([]);
  });

  it('删图后 entries 跟着前移，不错位', () => {
    const entries = [{ title: 'A' }, { title: 'B' }, { title: 'C' }];
    expect(syncAlbumEntriesToCount(entries, 2).map((e) => e.title)).toEqual(['A', 'B']);
    expect(syncAlbumEntriesToCount([{ title: 'A' }], 3)).toHaveLength(3);
    expect(syncAlbumEntriesToCount([{ title: 'A' }], 3)[1].title).toBe('');
  });

  it('取越界张返回空结构，不抛错', () => {
    expect(getAlbumEntry({ album_entries: [{ title: 'A' }] }, 5)).toEqual({
      title: '',
      date: '',
      place: '',
      body: '',
    });
  });

  it('照片数：entries 优先，缺 entries 时退回图片数', () => {
    expect(getAlbumPhotoCount({ album_entries: [{ title: 'A' }, { title: 'B' }] })).toBe(2);
    expect(getAlbumPhotoCount({ images: [{}, {}, {}] })).toBe(3);
  });

  it('RPC 载荷保留原始下标（空白张不能被压缩掉）', () => {
    const payload = toAlbumEntriesRpcPayload([
      { title: 'A', body: '1' },
      { title: '', body: '' },
      { title: 'C', body: '3' },
    ]);
    expect(payload.map((e) => e.image_index)).toEqual([0, 1, 2]);
  });

  it('发布校验：图必传（1..10），配文可空（2026-11-15 流程）', () => {
    expect(validateAlbumDraft({ entries: [], imageCount: 0 }).code).toBe('NO_IMAGE');
    // 只传图、一句字都不写也允许 —— 名称/简介在初次建本时已经写过
    expect(validateAlbumDraft({ entries: buildEmptyAlbumEntries(2), imageCount: 2 }).ok).toBe(true);
    expect(validateAlbumDraft({ entries: [], imageCount: 2 }).ok).toBe(true);
    expect(
      validateAlbumDraft({ entries: [{ title: 'A' }], imageCount: ALBUM_MAX_ENTRIES + 1 }).code,
    ).toBe('TOO_MANY_IMAGES');
    expect(validateAlbumDraft({ entries: [{ title: 'A' }], imageCount: 1 }).ok).toBe(true);
  });

  it('影集本体：名称决定「是否已建本」，简介裁剪到上限', () => {
    expect(hasAlbumBook({ title: '', intro: 'x' })).toBe(false);
    expect(hasAlbumBook({ title: '山河有信' })).toBe(true);
    const book = normalizeAlbumBook({ album_title: '  山河有信  ', album_intro: 'a'.repeat(400) });
    expect(book.title).toBe('山河有信');
    expect(book.intro.length).toBe(ALBUM_INTRO_MAX);
  });
});
