export const CLOUD_UPLOAD_ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
]);

export const CLOUD_UPLOAD_ALLOWED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
export const CLOUD_UPLOAD_MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
export const CLOUD_UPLOAD_MAX_DIMENSION = 8192;
export const CLOUD_UPLOAD_MAX_PIXELS = 25 * 1000 * 1000;
export const CLOUD_UPLOAD_BURST_WINDOW_MS = 60 * 1000;
export const CLOUD_UPLOAD_BURST_LIMIT = 18;

function normalizeMimeType(value = '') {
  const mimeType = String(value || '').trim().toLowerCase();
  return mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
}

function getFileExtension(name = '') {
  const match = String(name || '').trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

function assertImageDimensions({ width = 0, height = 0 } = {}) {
  const safeWidth = Number(width || 0);
  const safeHeight = Number(height || 0);
  if (!Number.isFinite(safeWidth) || !Number.isFinite(safeHeight) || safeWidth <= 0 || safeHeight <= 0) {
    throw new Error('图片尺寸无效，请换一张图片');
  }
  if (safeWidth > CLOUD_UPLOAD_MAX_DIMENSION || safeHeight > CLOUD_UPLOAD_MAX_DIMENSION) {
    throw new Error(`图片边长不能超过 ${CLOUD_UPLOAD_MAX_DIMENSION}px`);
  }
  if (safeWidth * safeHeight > CLOUD_UPLOAD_MAX_PIXELS) {
    throw new Error('图片像素过大，请压缩后再上传');
  }
}

async function readFileHeader(file) {
  if (!file || typeof file.arrayBuffer !== 'function') return new Uint8Array();
  const source = typeof file.slice === 'function' ? file.slice(0, 16) : file;
  const buffer = await source.arrayBuffer();
  return new Uint8Array(buffer || []);
}

export function detectImageMimeFromSignature(bytes = []) {
  const header = Array.from(bytes || []);
  if (header.length < 4) return '';

  if (
    header[0] === 0x89
    && header[1] === 0x50
    && header[2] === 0x4e
    && header[3] === 0x47
  ) {
    return 'image/png';
  }

  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    header[0] === 0x47
    && header[1] === 0x49
    && header[2] === 0x46
    && header[3] === 0x38
  ) {
    return 'image/gif';
  }

  if (
    header[0] === 0x52
    && header[1] === 0x49
    && header[2] === 0x46
    && header[3] === 0x46
    && header[8] === 0x57
    && header[9] === 0x45
    && header[10] === 0x42
    && header[11] === 0x50
  ) {
    return 'image/webp';
  }

  return '';
}

export function validateImageFileBasics(file) {
  if (!file || typeof file !== 'object' || typeof file.size !== 'number') {
    throw new Error('请选择有效的图片文件');
  }

  const mimeType = normalizeMimeType(file.type);
  if (!CLOUD_UPLOAD_ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error('仅支持 PNG、JPG、WebP 或 GIF 图片');
  }

  if (file.size <= 0) {
    throw new Error('图片文件为空，请换一张图片');
  }
  if (file.size > CLOUD_UPLOAD_MAX_IMAGE_SIZE_BYTES) {
    throw new Error('图片大小不能超过 10MB');
  }

  const extension = getFileExtension(file.name);
  if (extension && !CLOUD_UPLOAD_ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error('图片后缀与 Cloud+ 支持格式不匹配');
  }

  return mimeType;
}

export async function readBrowserImageDimensions(file) {
  if (
    typeof Image === 'undefined'
    || typeof URL === 'undefined'
    || typeof URL.createObjectURL !== 'function'
    || typeof URL.revokeObjectURL !== 'function'
  ) {
    return null;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({
        width: Number(image.naturalWidth || image.width || 0),
        height: Number(image.naturalHeight || image.height || 0)
      });
      image.onerror = () => reject(new Error('图片无法解析，请换一张图片'));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function validateImageFileBeforeUpload(file) {
  const mimeType = validateImageFileBasics(file);
  const signatureMimeType = detectImageMimeFromSignature(await readFileHeader(file));

  if (!signatureMimeType) {
    throw new Error('图片文件头异常，请换一张图片');
  }
  if (signatureMimeType !== mimeType) {
    throw new Error('图片类型与文件内容不一致，请换一张图片');
  }

  const dimensions = await readBrowserImageDimensions(file);
  if (dimensions) {
    assertImageDimensions(dimensions);
  }

  return { mimeType, signatureMimeType };
}

export function validateCloudinaryUploadResult(data = {}, options = {}) {
  const secureUrl = String(data.secure_url || data.url || '').trim();
  const publicId = String(data.public_id || data.publicId || '').trim();
  const cloudName = String(options.cloudName || '').trim();
  const folder = String(options.folder || '').trim().replace(/^\/+|\/+$/g, '');

  if (!secureUrl) {
    throw new Error('Cloudinary 未返回有效图片地址');
  }

  let parsed;
  try {
    parsed = new URL(secureUrl);
  } catch (_error) {
    throw new Error('Cloudinary 图片地址无效');
  }

  const path = parsed.pathname || '';
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') {
    throw new Error('图片来源异常，已阻止保存');
  }
  if (cloudName && !path.startsWith(`/${cloudName}/image/upload/`)) {
    throw new Error('图片不属于当前 Cloudinary 空间');
  }
  if (!/\.(png|jpe?g|webp|gif)$/i.test(path)) {
    throw new Error('Cloudinary 返回了不支持的图片格式');
  }
  if (folder && publicId && !publicId.startsWith(`${folder}/`)) {
    throw new Error('图片目录异常，已阻止保存');
  }

  assertImageDimensions({
    width: Number(data.width || 0),
    height: Number(data.height || 0)
  });

  return true;
}

export function registerCloudUploadBurst(timestamps = [], count = 1, options = {}) {
  const nowTs = Number(options.nowTs || Date.now());
  const windowMs = Number(options.windowMs || CLOUD_UPLOAD_BURST_WINDOW_MS);
  const limit = Number(options.limit || CLOUD_UPLOAD_BURST_LIMIT);
  const safeCount = Math.max(1, Math.trunc(Number(count || 1)));
  const recent = (Array.isArray(timestamps) ? timestamps : [])
    .map((item) => Number(item || 0))
    .filter((item) => Number.isFinite(item) && nowTs - item < windowMs);

  if (recent.length + safeCount > limit) {
    const oldest = recent[0] || nowTs;
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (nowTs - oldest)) / 1000));
    return {
      ok: false,
      timestamps: recent,
      retryAfterSeconds
    };
  }

  return {
    ok: true,
    timestamps: recent.concat(Array.from({ length: safeCount }, () => nowTs)),
    retryAfterSeconds: 0
  };
}
