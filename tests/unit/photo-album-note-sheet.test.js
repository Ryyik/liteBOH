/**
 * 影集「笔记版式」解析与兜底链（2026-11-14）
 *
 * 锁死四件事：
 *   ① 竖图判定优先用实际宽高、缺失才回退 ratio；
 *   ② 单图内容页走笔记版式，多图页仍走网格（一面墙塞两张竖图会互相挤压）；
 *   ③ 老影集三列全空时的兜底链：标题→配文→章节标题→影集标题，日期→首图创建时间；
 *   ④ 离线导出与阅读页共用同一套解析（标记里必须出现 note-sheet 与元信息）。
 */

import { describe, expect, it } from 'vitest';
import {
  formatNoteDate,
  isNoteSheetPage,
  photoIsPortrait,
  resolveNoteContent,
} from '@/utils/photo-albums/note-sheet.js';
import { buildAlbumExportHtml } from '@/utils/photo-albums/offline-export.js';
import { buildAutoLayoutPages, appendPhotosToPages } from '@/utils/photo-albums/auto-layout.js';

const album = { title: '山与海的一周' };

describe('photoIsPortrait', () => {
  it('优先用实际宽高', () => {
    expect(photoIsPortrait({ width: 1200, height: 1600, ratio: 'landscape' })).toBe(true);
    expect(photoIsPortrait({ width: 1600, height: 1200, ratio: 'portrait' })).toBe(false);
    expect(photoIsPortrait({ width: 1200, height: 1200 })).toBe(false);
  });

  it('宽高缺失时回退 ratio', () => {
    expect(photoIsPortrait({ ratio: 'portrait' })).toBe(true);
    expect(photoIsPortrait({ ratio: 'landscape' })).toBe(false);
    expect(photoIsPortrait(null)).toBe(false);
  });
});

describe('isNoteSheetPage', () => {
  it('内容页 1–2 张照片都走笔记版式（含历史版式）', () => {
    for (const layoutId of [
      'note',
      'full',
      'duo',
      'img-left-text',
      'img-right-text',
      'hero-text',
    ]) {
      expect(isNoteSheetPage({ pageType: 'content', layoutId, photoRefs: ['p1'] })).toBe(true);
      expect(isNoteSheetPage({ pageType: 'content', layoutId, photoRefs: ['p1', 'p2'] })).toBe(
        true,
      );
    }
  });

  it('三图及以上历史页、封面/章节/尾页不走笔记版式', () => {
    expect(
      isNoteSheetPage({ pageType: 'content', layoutId: 'trio', photoRefs: ['a', 'b', 'c'] }),
    ).toBe(false);
    expect(isNoteSheetPage({ pageType: 'cover', layoutId: 'note', photoRefs: [] })).toBe(false);
    expect(isNoteSheetPage(null)).toBe(false);
  });
});

describe('formatNoteDate', () => {
  it('只输出 YYYY.MM.DD', () => {
    expect(formatNoteDate('2026-10-03')).toBe('2026.10.03');
    expect(formatNoteDate('2026-10-03T12:30:00Z')).toBe('2026.10.03');
    expect(formatNoteDate('')).toBe('');
    expect(formatNoteDate('不是日期')).toBe('');
  });
});

describe('resolveNoteContent 兜底链', () => {
  const photos = [
    {
      id: 'p1',
      caption: '沿海公路一直开',
      createdAt: '2026-10-03T08:00:00Z',
      width: 1200,
      height: 1600,
    },
  ];

  it('优先用页面自己的标题 / 日期 / 地点', () => {
    const note = resolveNoteContent({
      page: {
        pageType: 'content',
        layoutId: 'note',
        headline: '杂货店闲逛',
        takenOn: '2026-10-03',
        place: '福冈',
        note: '第一段\n\n第二段',
        photoRefs: ['p1'],
      },
      photos,
      album,
    });
    expect(note.headline).toBe('杂货店闲逛');
    expect(note.dateText).toBe('2026.10.03');
    expect(note.placeText).toBe('福冈');
    expect(note.paragraphs).toEqual(['第一段', '第二段']);
    // 标题不是配文来的 ⇒ 配文仍作为末尾段落展示
    expect(note.captions).toEqual(['沿海公路一直开']);
    expect(note.isPortrait).toBe(true);
  });

  it('两图页：返回两张照片、不走竖图变体', () => {
    const note = resolveNoteContent({
      page: { pageType: 'content', layoutId: 'note', photoRefs: ['p1', 'p2'] },
      photos: [
        ...photos,
        { id: 'p2', caption: '', createdAt: '2026-10-03T09:00:00Z', width: 1200, height: 1600 },
      ],
      album,
    });
    expect(note.photos).toHaveLength(2);
    expect(note.isPair).toBe(true);
    // 两图页统一「上图下文」，不吃单图竖图的左图右文变体
    expect(note.isPortrait).toBe(false);
  });

  it('三列全空：标题回退首图配文，日期回退首图创建时间', () => {
    const note = resolveNoteContent({
      page: { pageType: 'content', layoutId: 'full', note: '', photoRefs: ['p1'] },
      photos,
      album,
    });
    expect(note.headline).toBe('沿海公路一直开');
    expect(note.dateText).toBe('2026.10.03');
    expect(note.placeText).toBe('');
    // 标题已用配文 ⇒ 正文不再重复同一条
    expect(note.captions).toEqual([]);
  });

  it('无配文时回退章节标题，再回退影集标题', () => {
    expect(
      resolveNoteContent({
        page: { pageType: 'content', layoutId: 'full', chapterTitle: '山海之间', photoRefs: [] },
        photos: [],
        album,
      }).headline,
    ).toBe('山海之间');
    expect(
      resolveNoteContent({ page: { pageType: 'content', layoutId: 'full' }, photos: [], album })
        .headline,
    ).toBe('山与海的一周');
  });
});

describe('自动初排与追加页面', () => {
  it('自动初排一页最多两图，全部用 note 版式', () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, ratio: 'landscape' }));
    const pages = buildAutoLayoutPages(five, { appendEndPage: false });
    expect(pages.map((page) => page.layout_id)).toEqual(['note', 'note', 'note']);
    expect(pages.map((page) => page.photo_refs.length)).toEqual([2, 2, 1]);
  });

  it('新开页默认 note，已有页最多再补到两张', () => {
    const { pages } = appendPhotosToPages([], [{ id: 'x', ratio: 'portrait' }]);
    expect(pages[0].layout_id).toBe('note');

    const filled = appendPhotosToPages(
      [{ page_type: 'content', layout_id: 'note', photo_refs: ['a'] }],
      [{ id: 'b' }, { id: 'c' }],
    ).pages;
    expect(filled[0].photo_refs).toEqual(['a', 'b']);
    expect(filled[1].photo_refs).toEqual(['c']);
  });
});

describe('离线导出沿用笔记版式', () => {
  it('导出 HTML 含 note-sheet 标记、两图并排、元信息与宋体栈', async () => {
    const { html } = await buildAlbumExportHtml(
      {
        album,
        photos: [
          {
            id: 'p1',
            url: 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg',
            caption: '',
            createdAt: '2026-10-03T08:00:00Z',
            width: 1600,
            height: 1200,
          },
          {
            id: 'p2',
            url: 'https://res.cloudinary.com/demo/image/upload/v1/sample2.jpg',
            caption: '',
            createdAt: '2026-10-03T09:00:00Z',
            width: 1600,
            height: 1200,
          },
        ],
        pages: [
          {
            pageType: 'content',
            layoutId: 'note',
            headline: '等绿灯',
            takenOn: '2026-10-03',
            place: '福冈',
            note: '旅行途中，在城市的街角等待绿灯亮起的时刻。',
            photoRefs: ['p1', 'p2'],
          },
        ],
      },
      { mode: 'zip' },
    );
    expect(html).toContain('class="note-sheet');
    expect(html).toContain('note-photo is-pair');
    expect(html).toContain('note-title');
    expect(html).toContain('2026.10.03 福冈');
    expect(html).toContain('Songti SC');
  });
});
