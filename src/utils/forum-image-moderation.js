// 模型本地化（B1）：tfjs/nsfwjs 走 npm 静态依赖，权重由 nsfwjs 包内动态 import 加载
// （dist/models/*.min.js，Vite 自动拆为按需 chunk，同源 + hash 文件名永久缓存）。
// 彻底移除 jsdelivr CDN 动态脚本加载——此前 CDN 偶发 >20s 且失败率高，是首图审核卡顿的主因。
const DEFAULT_MODEL_NAME = 'MobileNetV2';

const NSFW_REJECT_THRESHOLD = 0.75;
const NSFW_REVIEW_THRESHOLD = 0.45;
const NSFW_SINGLE_CLASS_REJECT_THRESHOLD = 0.6;
const NSFW_SEXY_REVIEW_THRESHOLD = 0.65;
const MODEL_INIT_TIMEOUT_MS = 30000;
const IMAGE_DECODE_TIMEOUT_MS = 15000;
const IMAGE_CLASSIFY_TIMEOUT_MS = 20000;
// B3：MobileNetV2 输入即 224×224。此前画 448px 再被 resizeBilinear 二次插值，
// 直接 224 省一次插值与显存带宽，单张推理耗时 -20~30%。
const MODERATION_SURFACE_MAX_SIDE = 224;

let modelPromise = null;

// D2 输入让路：classify 在主线程 WebGL 执行，用户正在打字时先让路，
// 静默窗口出现后再推理，保证输入全程不掉帧（最多等 800ms 防饿死）。
let lastUserInputAt = 0;
if (typeof document !== 'undefined') {
  const markUserInput = () => { lastUserInputAt = Date.now(); };
  document.addEventListener('input', markUserInput, { capture: true, passive: true });
  document.addEventListener('keydown', markUserInput, { capture: true, passive: true });
}

async function yieldToTyping(maxWaitMs = 800) {
  const quietWindowMs = 150;
  const startAt = Date.now();
  while (Date.now() - lastUserInputAt < quietWindowMs) {
    if (Date.now() - startAt >= maxWaitMs) break;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
}

function createTimeoutError(message) {
  const error = new Error(message);
  error.code = 'IMAGE_MODERATION_TIMEOUT';
  return error;
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId = null;
  return new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(createTimeoutError(message));
    }, timeoutMs);

    Promise.resolve(promise)
      .then(resolve, reject)
      .finally(() => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      });
  });
}

async function getNsfwModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const modelName = String(import.meta.env?.VITE_NSFWJS_MODEL_NAME || DEFAULT_MODEL_NAME).trim() || DEFAULT_MODEL_NAME;
      // 运行时与权重全部来自 npm 包：tfjs 负责注册 WebGL backend，
      // nsfwjs.load(name) 内部按 DEFAULT_MODELS 注册表动态 import 包内权重 chunk。
      const [tfModule, nsfwjsModule] = await Promise.all([
        import('@tensorflow/tfjs'),
        import('nsfwjs')
      ]);
      const tf = tfModule?.enableProdMode ? tfModule : tfModule?.default;
      if (typeof tf?.enableProdMode === 'function') {
        tf.enableProdMode();
      }
      const nsfwjs = nsfwjsModule?.default?.load ? nsfwjsModule.default : nsfwjsModule;
      if (!nsfwjs || typeof nsfwjs.load !== 'function') {
        throw new Error('图片安全检测模块初始化失败');
      }
      return withTimeout(
        nsfwjs.load(modelName),
        MODEL_INIT_TIMEOUT_MS,
        '图片安全检测模型初始化超时，请刷新页面后重试'
      );
    })();
  }

  try {
    return await modelPromise;
  } catch (error) {
    modelPromise = null;
    throw new Error(String(error?.message || '').trim() || '图片安全检测模型初始化失败，请刷新后重试');
  }
}

function createImageElement(file) {
  if (
    typeof Image === 'undefined'
    || typeof URL === 'undefined'
    || typeof URL.createObjectURL !== 'function'
    || typeof URL.revokeObjectURL !== 'function'
  ) {
    return Promise.reject(new Error('当前浏览器不支持图片安全检测'));
  }

  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      reject(createTimeoutError('图片解析超时，请换一张图片或稍后重试'));
    }, IMAGE_DECODE_TIMEOUT_MS);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve({ image, objectUrl });
    };
    image.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      URL.revokeObjectURL(objectUrl);
      reject(new Error('图片无法解析，请换一张图片'));
    };
    image.src = objectUrl;
  });
}

function createModerationSurface(image) {
  if (typeof document === 'undefined') {
    throw new Error('当前浏览器不支持图片安全检测');
  }
  const sourceWidth = Number(image?.naturalWidth || image?.width || 0);
  const sourceHeight = Number(image?.naturalHeight || image?.height || 0);
  if (!sourceWidth || !sourceHeight) {
    throw new Error('图片尺寸无效，请换一张图片');
  }

  const scale = Math.min(1, MODERATION_SURFACE_MAX_SIDE / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    throw new Error('当前浏览器无法创建图片安全检测画布');
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function classifyNsfwPredictions(predictions = []) {
  const scores = Object.fromEntries(
    (Array.isArray(predictions) ? predictions : [])
      .map((item) => [
        String(item?.className || '').trim(),
        Math.max(0, Math.min(1, Number(item?.probability || 0)))
      ])
      .filter(([key]) => key)
  );

  const porn = scores.Porn || 0;
  const hentai = scores.Hentai || 0;
  const sexy = scores.Sexy || 0;
  const drawing = scores.Drawing || 0;
  const neutral = scores.Neutral || 0;
  const risk = porn + hentai + sexy * 0.45;

  if (porn >= NSFW_SINGLE_CLASS_REJECT_THRESHOLD || hentai >= NSFW_SINGLE_CLASS_REJECT_THRESHOLD || risk >= NSFW_REJECT_THRESHOLD) {
    return {
      status: 'rejected',
      score: risk,
      reason: '图片疑似包含不适宜公开发布的内容',
      scores
    };
  }

  if (risk >= NSFW_REVIEW_THRESHOLD || sexy >= NSFW_SEXY_REVIEW_THRESHOLD) {
    return {
      status: 'needs_review',
      score: risk,
      reason: '图片安全检测结果不够明确，请换一张更清晰、低风险的图片',
      scores
    };
  }

  return {
    status: 'approved',
    score: Math.max(risk, drawing * 0.05, neutral * 0.02),
    reason: '通过',
    scores
  };
}

let classifyMutex = Promise.resolve();
let classifyBlockedError = null;

// 导出供 image-moderation-pipeline.js 复用：云端审核同样以 224px 降采样图编码发送，
// 体积（15-30KB jpeg）可控且与本地检测共用同一单一真相源的解码/降采样实现。
export async function createImageElementForModeration(file) {
  return createImageElement(file);
}

export function createModerationSurfaceForModeration(image) {
  return createModerationSurface(image);
}

export async function moderateForumImageFile(file) {
  try {
    return await runForumImageModeration(file);
  } catch (error) {
    // 环境类错误（模型加载失败/超时/图片解析失败）统一打标，供上层区分
    // 「检测服务不可用（可重试）」与「图片真的未过审（只能移除图）」
    if (!error?.code) error.code = 'IMAGE_MODERATION_UNAVAILABLE';
    throw error;
  }
}

async function runForumImageModeration(file) {
  const { image, objectUrl } = await createImageElement(file);
  let surface;
  let classificationOwnsSurface = false;
  try {
    surface = createModerationSurface(image);
  } finally {
    try { image.src = ''; } catch { /* ignore */ }
    URL.revokeObjectURL(objectUrl);
  }

  try {
    if (classifyBlockedError) throw classifyBlockedError;
    const model = await getNsfwModel();

    // TFJS WebGL backend 不支持并发 classify，必须串行化避免 GPU 崩溃
    const prev = classifyMutex;
    let release;
    classifyMutex = new Promise((resolve) => { release = resolve; });
    await prev;

    if (classifyBlockedError) {
      release();
      throw classifyBlockedError;
    }

    classificationOwnsSurface = true;
    const classificationPromise = Promise.resolve().then(async () => {
      // D2：拿到锁后先看用户是否正在输入，正在打字就让路，保证输入不掉帧
      await yieldToTyping();
      return model.classify(surface);
    });
    try {
      const predictions = await withTimeout(
        classificationPromise,
        IMAGE_CLASSIFY_TIMEOUT_MS,
        '图片安全检测超时，请稍后重试或换一张图片'
      );
      return classifyNsfwPredictions(predictions);
    } catch (error) {
      if (error?.code === 'IMAGE_MODERATION_TIMEOUT') {
        classifyBlockedError = error;
      }
      throw error;
    } finally {
      let watchdogId = setTimeout(() => {
        watchdogId = null;
        // 兜底：若 TFJS 底层推理永久挂起（promise 永不 settle），
        // 强制清锁并重置模型，避免后续所有图片永远卡在互斥队列里
        classifyBlockedError = null;
        modelPromise = null;
        release();
      }, 30000);
      // 超时无法取消 TFJS 底层推理。等真实任务结束后再释放锁，避免下一张与残留 GPU 任务重叠。
      void classificationPromise
        .catch(() => {
          modelPromise = null;
        })
        .finally(() => {
          if (watchdogId) { clearTimeout(watchdogId); watchdogId = null; }
          classifyBlockedError = null;
          if (surface) {
            surface.width = 1;
            surface.height = 1;
            surface = null;
          }
          release();
        });
    }
  } finally {
    // 正常完成时上面的任务清理会先执行；模型加载失败时在这里释放画布。
    if (surface && !classificationOwnsSurface) {
      surface.width = 1;
      surface.height = 1;
      surface = null;
    }
  }
}

export async function preloadForumImageModerationModel() {
  await getNsfwModel();
  return { ok: true };
}
