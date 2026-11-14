/**
 * photo-album-auto-layout.test.js — 自动初排的**字段名契约**（2026-11-14）
 *
 * 为什么单独钉这个：`auto-layout.js` 曾经吐蛇形（`page_type` / `photo_refs`），
 * 而 `useAlbumEditor` / `PageCanvas` / `saveAlbumPages` 全程只读驼峰。
 * 于是「自动初排」之后：
 *   · 编辑器里内容页渲染成空（pageType 是 undefined，谁的分支都不进）；
 *   · 保存时 `page.photoRefs` 读不到 ⇒ 写库的 `photo_refs` 全是 `[]` ⇒ 照片引用全丢。
 * 这两条都没有任何报错，只能靠断言锁住。
 */
import { describe, expect, it } from 'vitest';
import {
  appendPhotosToPages,
  buildAutoLayoutPages,
} from '../../src/utils/photo-albums/auto-layout.js';

const photo = (id, createdAt) => ({ id, ratio: 'landscape', createdAt });

describe('buildAutoLayoutPages · 输出形状', () => {
  it('产出驼峰页面对象（与编辑器同一套字段名）', () => {
    const pages = buildAutoLayoutPages([photo('p1', '2026-11-01T10:00:00Z')], {
      appendEndPage: false,
    });
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      pageType: 'content',
      layoutId: 'note',
      chapterTitle: '',
      note: '',
      photoRefs: ['p1'],
    });
    // 蛇形键必须一个都不能有，否则就是又退回老 bug
    for (const key of ['page_type', 'layout_id', 'chapter_title', 'photo_refs']) {
      expect(pages[0]).not.toHaveProperty(key);
    }
  });

  it('一页最多两张，尾页可选', () => {
    const photos = ['a', 'b', 'c'].map((id) => photo(id, '2026-11-01T10:00:00Z'));
    const withEnd = buildAutoLayoutPages(photos);
    expect(withEnd.map((page) => page.photoRefs)).toEqual([['a', 'b'], ['c'], []]);
    expect(withEnd[withEnd.length - 1].pageType).toBe('end');

    const withoutEnd = buildAutoLayoutPages(photos, { appendEndPage: false });
    expect(withoutEnd).toHaveLength(2);
  });
});

describe('appendPhotosToPages · 不丢已有的照片引用', () => {
  it('优先填未满的内容页，并保留原有 photoRefs', () => {
    const existing = [
      { pageType: 'cover', layoutId: 'full', chapterTitle: '', note: '', photoRefs: [] },
      { pageType: 'content', layoutId: 'note', chapterTitle: '', note: '', photoRefs: ['old'] },
    ];
    const { pages, changed } = appendPhotosToPages(existing, [{ id: 'new' }]);
    expect(changed).toBe(true);
    // 封面页不动
    expect(pages[0].photoRefs).toEqual([]);
    // 老照片还在，新照片追加在它后面
    expect(pages[1].photoRefs).toEqual(['old', 'new']);
    expect(pages[1].pageType).toBe('content');
  });

  it('已有页都满了就开一页新的（同样是驼峰）', () => {
    const existing = [
      { pageType: 'content', layoutId: 'note', chapterTitle: '', note: '', photoRefs: ['a', 'b'] },
    ];
    const { pages } = appendPhotosToPages(existing, [{ id: 'c' }]);
    expect(pages).toHaveLength(2);
    expect(pages[1]).toMatchObject({ pageType: 'content', layoutId: 'note', photoRefs: ['c'] });
    expect(pages[1]).not.toHaveProperty('photo_refs');
  });
});
