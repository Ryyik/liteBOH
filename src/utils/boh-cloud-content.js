const IMAGE_BLOCK_TYPES = new Set(['image']);

function limitText(value, maxLen = 0) {
  const text = String(value || '').trim();
  if (!maxLen || text.length <= maxLen) return text;
  return text.slice(0, maxLen);
}

export function parseLegacyMarkdownBlocks(content = '') {
  const source = String(content || '');
  const regex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
  const blocks = [];
  let lastIndex = 0;

  source.replace(regex, (match, alt, url, offset) => {
    const textPart = source.slice(lastIndex, offset).trim();
    if (textPart) {
      blocks.push({ type: 'text', text: textPart });
    }

    if (url) {
      blocks.push({
        type: 'image',
        url: String(url || '').trim(),
        alt: limitText(alt, 120)
      });
    }

    lastIndex = offset + match.length;
    return match;
  });

  const trailingText = source.slice(lastIndex).trim();
  if (trailingText) {
    blocks.push({ type: 'text', text: trailingText });
  }

  if (!blocks.length && source.trim()) {
    blocks.push({ type: 'text', text: source.trim() });
  }

  return blocks;
}

export function normalizeCloudBlocks(blocks = [], fallbackText = '') {
  const source = Array.isArray(blocks) ? blocks : [];
  const normalized = source
    .map((block) => {
      const type = String(block?.type || '').trim().toLowerCase();
      if (IMAGE_BLOCK_TYPES.has(type)) {
        const url = String(block?.url || block?.src || '').trim();
        if (!url) return null;
        return {
          type: 'image',
          url,
          publicId: limitText(block?.publicId || block?.public_id, 255),
          alt: limitText(block?.alt, 120),
          width: Number(block?.width || 0) || null,
          height: Number(block?.height || 0) || null
        };
      }

      const text = limitText(block?.text || block?.value, 12000);
      if (!text) return null;
      return {
        type: 'text',
        text
      };
    })
    .filter(Boolean);

  if (normalized.length) return normalized;
  return parseLegacyMarkdownBlocks(fallbackText);
}

export function flattenCloudBlocksToText(blocks = [], fallbackText = '') {
  const normalized = normalizeCloudBlocks(blocks, fallbackText);
  return normalized
    .map((block) => {
      if (block.type === 'image') {
        return block.alt ? `[图片:${block.alt}]` : '[图片]';
      }
      return block.text;
    })
    .join('\n\n')
    .trim();
}

export function deriveCloudEntryType(blocks = [], fallbackText = '') {
  const normalized = normalizeCloudBlocks(blocks, fallbackText);
  const hasImage = normalized.some((block) => block.type === 'image');
  const hasText = normalized.some((block) => block.type === 'text' && String(block.text || '').trim());

  if (hasImage && hasText) return 'mixed';
  if (hasImage) return 'image';
  return 'text';
}

export function pickCloudCoverImage(blocks = [], fallbackCover = '') {
  const normalized = normalizeCloudBlocks(blocks);
  const firstImage = normalized.find((block) => block.type === 'image');
  return String(firstImage?.url || fallbackCover || '').trim();
}

export function buildCloudPreview(blocks = [], fallbackText = '', maxLen = 120) {
  const plainText = flattenCloudBlocksToText(blocks, fallbackText);
  if (!plainText) return '';
  return plainText.length > maxLen ? `${plainText.slice(0, maxLen)}...` : plainText;
}

export function serializeCloudTextAndImages({
  text = '',
  images = []
} = {}) {
  const normalizedText = limitText(text, 40000);
  const normalizedImages = Array.isArray(images) ? images : [];
  const blocks = [];

  if (normalizedText) {
    blocks.push({ type: 'text', text: normalizedText });
  }

  normalizedImages.forEach((image) => {
    const url = String(image?.url || image?.src || '').trim();
    if (!url) return;
    blocks.push({
      type: 'image',
      url,
      publicId: limitText(image?.publicId || image?.public_id, 255),
      alt: limitText(image?.alt, 120),
      width: Number(image?.width || 0) || null,
      height: Number(image?.height || 0) || null
    });
  });

  return blocks;
}
