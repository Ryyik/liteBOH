import { describe, expect, it } from 'vitest';
import {
  parseLegacyMarkdownBlocks,
  normalizeCloudBlocks,
  flattenCloudBlocksToText,
  deriveCloudEntryType,
  pickCloudCoverImage,
  buildCloudPreview,
  serializeCloudTextAndImages,
} from '../../src/utils/boh-cloud-content.js';

describe('boh-cloud-content: parseLegacyMarkdownBlocks', () => {
  it('parses text-only content', () => {
    const result = parseLegacyMarkdownBlocks('Hello world');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: 'text', text: 'Hello world' });
  });

  it('parses content with images', () => {
    const result = parseLegacyMarkdownBlocks('Check this ![alt text](https://example.com/img.png) out');
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: 'text', text: 'Check this' });
    expect(result[1]).toEqual({ type: 'image', url: 'https://example.com/img.png', alt: 'alt text' });
    expect(result[2]).toEqual({ type: 'text', text: 'out' });
  });

  it('handles multiple images', () => {
    const result = parseLegacyMarkdownBlocks('![a](https://a.com/1.png) ![b](https://b.com/2.png)');
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('image');
    expect(result[1].type).toBe('image');
  });

  it('returns single text block for empty/whitespace', () => {
    const result = parseLegacyMarkdownBlocks('   ');
    expect(result).toHaveLength(0);
  });

  it('handles image without alt text', () => {
    const result = parseLegacyMarkdownBlocks('![](https://example.com/img.png)');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: 'image', url: 'https://example.com/img.png', alt: '' });
  });

  it('trims trailing text', () => {
    const result = parseLegacyMarkdownBlocks('![img](https://e.com/1.png)\nSome text');
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('image');
    expect(result[1].type).toBe('text');
    expect(result[1].text).toBe('Some text');
  });
});

describe('boh-cloud-content: normalizeCloudBlocks', () => {
  it('normalizes text blocks', () => {
    const result = normalizeCloudBlocks([
      { type: 'text', text: 'Hello' },
      { type: 'text', value: 'World' },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: 'text', text: 'Hello' });
    expect(result[1]).toEqual({ type: 'text', text: 'World' });
  });

  it('normalizes image blocks', () => {
    const result = normalizeCloudBlocks([
      { type: 'image', url: 'https://example.com/img.png', publicId: 'pub123', alt: 'desc', width: 800, height: 600 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: 'image',
      url: 'https://example.com/img.png',
      publicId: 'pub123',
      alt: 'desc',
      width: 800,
      height: 600,
    });
  });

  it('filters out blocks without url for images', () => {
    const result = normalizeCloudBlocks([
      { type: 'image', url: '' },
      { type: 'image', url: 'https://example.com/img.png' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://example.com/img.png');
  });

  it('filters out empty text blocks', () => {
    const result = normalizeCloudBlocks([
      { type: 'text', text: '' },
      { type: 'text', text: 'Valid' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Valid');
  });

  it('falls back to markdown parsing when blocks are empty', () => {
    const result = normalizeCloudBlocks([], '![img](https://example.com/img.png)');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('image');
    expect(result[0].url).toBe('https://example.com/img.png');
  });

  it('handles image with src fallback', () => {
    const result = normalizeCloudBlocks([
      { type: 'image', url: '', src: 'https://example.com/alt.png' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://example.com/alt.png');
  });
});

describe('boh-cloud-content: flattenCloudBlocksToText', () => {
  it('flattens text blocks', () => {
    const result = flattenCloudBlocksToText([
      { type: 'text', text: 'First' },
      { type: 'text', text: 'Second' },
    ]);
    expect(result).toBe('First\n\nSecond');
  });

  it('represents images with alt text', () => {
    const result = flattenCloudBlocksToText([
      { type: 'image', url: 'https://e.com/img.png', alt: 'A cat' },
    ]);
    expect(result).toBe('[图片:A cat]');
  });

  it('represents images without alt text', () => {
    const result = flattenCloudBlocksToText([
      { type: 'image', url: 'https://e.com/img.png', alt: '' },
    ]);
    expect(result).toBe('[图片]');
  });

  it('flattens mixed content', () => {
    const result = flattenCloudBlocksToText([
      { type: 'text', text: 'Look at this' },
      { type: 'image', url: 'https://e.com/img.png', alt: 'photo' },
      { type: 'text', text: 'Cool right?' },
    ]);
    expect(result).toBe('Look at this\n\n[图片:photo]\n\nCool right?');
  });
});

describe('boh-cloud-content: deriveCloudEntryType', () => {
  it('returns text for text-only blocks', () => {
    expect(deriveCloudEntryType([{ type: 'text', text: 'Hello' }])).toBe('text');
  });

  it('returns image for image-only blocks', () => {
    expect(deriveCloudEntryType([{ type: 'image', url: 'https://e.com/img.png' }])).toBe('image');
  });

  it('returns mixed for both text and image', () => {
    expect(deriveCloudEntryType([
      { type: 'text', text: 'Hello' },
      { type: 'image', url: 'https://e.com/img.png' },
    ])).toBe('mixed');
  });

  it('returns text for empty blocks', () => {
    expect(deriveCloudEntryType([])).toBe('text');
  });
});

describe('boh-cloud-content: pickCloudCoverImage', () => {
  it('returns first image URL', () => {
    const result = pickCloudCoverImage([
      { type: 'text', text: 'Hello' },
      { type: 'image', url: 'https://e.com/img1.png' },
      { type: 'image', url: 'https://e.com/img2.png' },
    ]);
    expect(result).toBe('https://e.com/img1.png');
  });

  it('returns fallback when no images', () => {
    const result = pickCloudCoverImage(
      [{ type: 'text', text: 'Hello' }],
      'https://default.com/img.png'
    );
    expect(result).toBe('https://default.com/img.png');
  });

  it('returns empty string with no fallback', () => {
    expect(pickCloudCoverImage([])).toBe('');
  });
});

describe('boh-cloud-content: buildCloudPreview', () => {
  it('truncates long content', () => {
    const result = buildCloudPreview(
      [{ type: 'text', text: 'A'.repeat(200) }],
      '',
      50
    );
    expect(result).toBe('A'.repeat(50) + '...');
  });

  it('returns full content if within limit', () => {
    const result = buildCloudPreview(
      [{ type: 'text', text: 'Short text' }],
      '',
      120
    );
    expect(result).toBe('Short text');
  });

  it('returns empty string for empty content', () => {
    expect(buildCloudPreview([], '')).toBe('');
  });
});

describe('boh-cloud-content: serializeCloudTextAndImages', () => {
  it('serializes text and images', () => {
    const result = serializeCloudTextAndImages({
      text: 'Hello world',
      images: [
        { url: 'https://e.com/1.png', publicId: 'pub1', alt: 'Image 1', width: 100, height: 200 },
        { url: 'https://e.com/2.png', alt: 'Image 2' },
      ],
    });
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: 'text', text: 'Hello world' });
    expect(result[1].type).toBe('image');
    expect(result[1].url).toBe('https://e.com/1.png');
    expect(result[1].publicId).toBe('pub1');
    expect(result[1].width).toBe(100);
    expect(result[1].height).toBe(200);
    expect(result[2].type).toBe('image');
    expect(result[2].url).toBe('https://e.com/2.png');
  });

  it('filters out images without URL', () => {
    const result = serializeCloudTextAndImages({
      text: 'Text only',
      images: [{ url: '' }, { src: '' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('text');
  });

  it('returns only image blocks when text is empty', () => {
    const result = serializeCloudTextAndImages({
      text: '',
      images: [{ url: 'https://e.com/img.png' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('image');
  });

  it('handles src fallback for image URL', () => {
    const result = serializeCloudTextAndImages({
      images: [{ url: '', src: 'https://e.com/fallback.png' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://e.com/fallback.png');
  });
});