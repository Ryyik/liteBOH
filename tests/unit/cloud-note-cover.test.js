import { describe, expect, it } from 'vitest';
import {
  CLOUD_NOTE_COVER_THEME_COUNT,
  buildCloudNoteWorkCard,
  hashCloudNoteSeed,
  pickCloudNoteCoverTheme,
} from '../../src/utils/cloud-note-cover.js';

describe('hashCloudNoteSeed / pickCloudNoteCoverTheme', () => {
  it('同一条笔记永远同一配色（稳定）', () => {
    expect(hashCloudNoteSeed('abc:我的笔记')).toBe(hashCloudNoteSeed('abc:我的笔记'));
    expect(pickCloudNoteCoverTheme('entry-1:标题')).toBe(pickCloudNoteCoverTheme('entry-1:标题'));
  });

  it('主题号落在色板范围内', () => {
    for (let index = 0; index < 200; index += 1) {
      const theme = pickCloudNoteCoverTheme(`seed-${index}`);
      expect(theme).toBeGreaterThanOrEqual(0);
      expect(theme).toBeLessThan(CLOUD_NOTE_COVER_THEME_COUNT);
    }
  });

  it('空串不崩且有确定值', () => {
    expect(pickCloudNoteCoverTheme('')).toBe(hashCloudNoteSeed('') % CLOUD_NOTE_COVER_THEME_COUNT);
  });
});

describe('buildCloudNoteWorkCard', () => {
  const entry = {
    id: 'entry-1',
    title: '周末手记',
    previewText: '去公园走了一圈。',
    contentText: '去公园走了一圈。',
    contentBlocks: [
      { type: 'text', text: '去公园走了一圈。' },
      { type: 'image', url: 'img-1' },
    ],
    coverImageUrl: 'https://res.cloudinary.com/demo/a.png',
    entryDate: '2026-09-28',
    updatedAt: '2026-09-29T10:00:00+08:00',
    visibility: 'public',
  };

  it('折成统一卡片视图模型，日期优先 updatedAt', () => {
    const card = buildCloudNoteWorkCard(entry);
    expect(card).toMatchObject({
      id: 'entry-1',
      isCloudNote: true,
      title: '周末手记',
      summary: '去公园走了一圈。',
      imageCount: 1,
      coverImageUrl: 'https://res.cloudinary.com/demo/a.png',
      dateValue: '2026-09-29T10:00:00+08:00',
    });
    expect(card.coverTheme).toBe(pickCloudNoteCoverTheme('entry-1:周末手记'));
    expect(card.entry).toBe(entry);
  });

  it('没有 updatedAt 时回退 entryDate', () => {
    const card = buildCloudNoteWorkCard({ ...entry, updatedAt: '' });
    expect(card.dateValue).toBe('2026-09-28');
  });

  it('缺 id 返回 null（调用方过滤）', () => {
    expect(buildCloudNoteWorkCard({ title: 'x' })).toBeNull();
    expect(buildCloudNoteWorkCard(null)).toBeNull();
  });
});
