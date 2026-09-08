import {
  CLOUD_UPLOAD_MAX_DIMENSION,
  CLOUD_UPLOAD_MAX_IMAGE_SIZE_BYTES,
  CLOUD_UPLOAD_MAX_PIXELS,
  readBrowserImageDimensions
} from './cloud-upload-guard.js';

const COMPRESSIBLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DEFAULT_TARGET_SIZE_MB = 9.6;
const DEFAULT_OPTIMIZED_TARGET_SIZE_MB = 2;
const DEFAULT_OPTIMIZED_MAX_DIMENSION = 2048;
let imageCompressionLoader = null;

export function formatImageFileSize(bytes = 0) {
  const safeBytes = Math.max(0, Number(bytes || 0));
  return `${(safeBytes / 1024 / 1024).toFixed(safeBytes >= 10 * 1024 * 1024 ? 1 : 2)}MB`;
}

export function formatImageMegapixels(width = 0, height = 0) {
  const pixels = Math.max(0, Number(width || 0) * Number(height || 0));
  return `${(pixels / 1000 / 1000).toFixed(1)}MP`;
}

function normalizeMimeType(value = '') {
  const mimeType = String(value || '').trim().toLowerCase();
  return mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
}

function resolveTargetMaxSide(dimensions = null, options = {}) {
  const maxDimension = Number(options.maxDimension || CLOUD_UPLOAD_MAX_DIMENSION);
  const maxPixels = Number(options.maxPixels || CLOUD_UPLOAD_MAX_PIXELS);
  const width = Number(dimensions?.width || 0);
  const height = Number(dimensions?.height || 0);
  if (!width || !height) return maxDimension;

  const dimensionScale = Math.min(1, maxDimension / Math.max(width, height));
  const pixelScale = Math.min(1, Math.sqrt(maxPixels / Math.max(1, width * height)));
  const scale = Math.min(dimensionScale, pixelScale);
  return Math.max(512, Math.floor(Math.max(width, height) * scale));
}

export async function getImageCompressionPlan(file, options = {}) {
  const maxSizeBytes = Number(options.maxSizeBytes || CLOUD_UPLOAD_MAX_IMAGE_SIZE_BYTES);
  const maxDimension = Number(options.maxDimension || CLOUD_UPLOAD_MAX_DIMENSION);
  const maxPixels = Number(options.maxPixels || CLOUD_UPLOAD_MAX_PIXELS);
  const optimizeForUpload = options.optimizeForUpload === true;
  const optimizedTargetSizeMB = Number(options.optimizedTargetSizeMB || DEFAULT_OPTIMIZED_TARGET_SIZE_MB);
  const optimizedMaxDimension = Number(options.optimizedMaxDimension || DEFAULT_OPTIMIZED_MAX_DIMENSION);
  const mimeType = normalizeMimeType(file?.type);
  const originalSizeBytes = Number(file?.size || 0);
  const dimensions = await readBrowserImageDimensions(file).catch(() => null);
  const reasons = [];

  if (originalSizeBytes > maxSizeBytes) {
    reasons.push(`文件 ${formatImageFileSize(originalSizeBytes)}，超过 ${formatImageFileSize(maxSizeBytes)}`);
  }
  if (dimensions?.width > maxDimension || dimensions?.height > maxDimension) {
    reasons.push(`边长 ${dimensions.width}x${dimensions.height}，超过 ${maxDimension}px`);
  }
  if (dimensions?.width && dimensions?.height && dimensions.width * dimensions.height > maxPixels) {
    reasons.push(`分辨率 ${formatImageMegapixels(dimensions.width, dimensions.height)}，超过 ${formatImageMegapixels(maxPixels, 1)}`);
  }

  const requiresCompression = reasons.length > 0;
  const canOptimizeLossyImage = mimeType === 'image/jpeg' || mimeType === 'image/webp';
  const shouldOptimize = optimizeForUpload
    && canOptimizeLossyImage
    && (
      originalSizeBytes > optimizedTargetSizeMB * 1024 * 1024
      || Number(dimensions?.width || 0) > optimizedMaxDimension
      || Number(dimensions?.height || 0) > optimizedMaxDimension
    );
  const shouldCompress = requiresCompression || shouldOptimize;
  const targetSizeMB = shouldOptimize ? optimizedTargetSizeMB : Number(options.targetSizeMB || DEFAULT_TARGET_SIZE_MB);
  const requiredMaxSide = resolveTargetMaxSide(dimensions, { maxDimension, maxPixels });

  return {
    shouldCompress,
    requiresCompression,
    shouldOptimize,
    canCompress: COMPRESSIBLE_IMAGE_TYPES.has(mimeType),
    reasons,
    dimensions,
    mimeType,
    originalSizeBytes,
    maxSizeBytes,
    maxDimension,
    maxPixels,
    targetSizeMB,
    maxWidthOrHeight: shouldOptimize
      ? Math.min(requiredMaxSide, optimizedMaxDimension)
      : requiredMaxSide
  };
}

async function loadImageCompression() {
  if (!imageCompressionLoader) {
    imageCompressionLoader = import('browser-image-compression')
      .then((module) => module.default || module)
      .catch((error) => {
        imageCompressionLoader = null;
        throw error;
      });
  }
  return imageCompressionLoader;
}

function normalizeCompressedFile(file, compressedBlob) {
  const baseName = String(file?.name || 'compressed-image').replace(/\.[a-z0-9]+$/i, '');
  if (compressedBlob instanceof File) {
    if (compressedBlob.type === 'image/webp' && !/\.webp$/i.test(compressedBlob.name || '')) {
      return new File([compressedBlob], `${baseName}.webp`, { type: 'image/webp', lastModified: Date.now() });
    }
    return compressedBlob;
  }
  const type = compressedBlob?.type || file.type || 'image/jpeg';
  const ext = type === 'image/webp' ? '.webp' : (type === 'image/png' ? '.png' : '.jpg');
  return new File([compressedBlob], `${baseName}${ext}`, {
    type,
    lastModified: Date.now()
  });
}

export async function compressImageFileToUploadLimit(file, plan = {}, options = {}) {
  const imageCompression = await loadImageCompression();
  // A1 首击率调优：按原始体积分桶定首轮质量，绝大多数图 1~2 次编码即收敛到目标体积，
  // 迭代上限 8→4。此前固定 0.85 起步，大图要 4~6 次重编码，单张压缩耗时 -30~50%。
  const rawSizeMB = Number(file?.size || 0) / (1024 * 1024);
  const bucketedInitialQuality = rawSizeMB >= 8 ? 0.78 : rawSizeMB >= 4 ? 0.82 : 0.85;
  // 统一输出 WebP：PNG 截图类图片体积可降 60%+，显著缩短上传时间；
  // 展示端 Cloudinary 走 f_auto 自动格式，源图格式无关紧要（动图 GIF 已在入口处被拒绝）
  const compressedBlob = await imageCompression(file, {
    maxSizeMB: Number(options.targetSizeMB || plan.targetSizeMB || DEFAULT_TARGET_SIZE_MB),
    maxWidthOrHeight: Number(options.maxWidthOrHeight || plan.maxWidthOrHeight || CLOUD_UPLOAD_MAX_DIMENSION),
    useWebWorker: true,
    initialQuality: Number(options.initialQuality || bucketedInitialQuality),
    maxIteration: Number(options.maxIteration || 4),
    fileType: 'image/webp',
    onProgress: typeof options.onProgress === 'function' ? options.onProgress : undefined,
    signal: options.signal
  });
  return normalizeCompressedFile(file, compressedBlob);
}
