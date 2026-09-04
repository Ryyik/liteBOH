import { getImageUrl } from '@/utils/asset-helper.js';
import { getCloudinaryTransformedUrl } from '@/utils/cloudinary-client.js';

// 与论坛 FORUM_LIST_IMAGE_TRANSFORM 同族（f_auto,q_auto:good,c_fill），按概览小图尺寸缩放
const CARD_IMAGE_TRANSFORM = 'f_auto,q_auto:good,c_fill,w_360,h_240';
const MODAL_IMAGE_TRANSFORM = 'f_auto,q_auto:good,c_limit,w_1600';

const isCloudinaryImageUrl = (imageUrl) => {
  const safeUrl = String(imageUrl || '').trim();
  if (!safeUrl) return false;
  try {
    const parsed = new URL(safeUrl);
    return parsed.protocol === 'https:' && parsed.hostname === 'res.cloudinary.com' && parsed.pathname.includes('/image/upload/');
  } catch (_error) {
    return false;
  }
};

const resolveImage = (imageUrl, transform) => {
  const safeUrl = String(imageUrl || '').trim();
  if (!safeUrl) return '';
  if (isCloudinaryImageUrl(safeUrl)) {
    return getCloudinaryTransformedUrl(safeUrl, transform);
  }
  return getImageUrl(safeUrl);
};

export const getOverviewCardImage = (imageUrl) => resolveImage(imageUrl, CARD_IMAGE_TRANSFORM);

export const getOverviewModalImage = (imageUrl) => resolveImage(imageUrl, MODAL_IMAGE_TRANSFORM);
