const DEFAULT_MODEL_NAME = 'MobileNetV2Mid';

const NSFW_REJECT_THRESHOLD = 0.75;
const NSFW_REVIEW_THRESHOLD = 0.45;
const NSFW_SINGLE_CLASS_REJECT_THRESHOLD = 0.6;
const NSFW_SEXY_REVIEW_THRESHOLD = 0.65;
const SCRIPT_LOAD_TIMEOUT_MS = 20000;
const MODEL_BUNDLE_LOAD_TIMEOUT_MS = 30000;
const MODEL_INIT_TIMEOUT_MS = 30000;
const IMAGE_DECODE_TIMEOUT_MS = 15000;
const IMAGE_CLASSIFY_TIMEOUT_MS = 20000;
const TFJS_CDN_URL = String(
  import.meta.env?.VITE_NSFWJS_TFJS_CDN_URL
  || 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js'
).trim();
const NSFWJS_CDN_URL = String(
  import.meta.env?.VITE_NSFWJS_CDN_URL
  || 'https://cdn.jsdelivr.net/npm/nsfwjs@4.3.0/dist/browser/nsfwjs.min.js'
).trim();
const NSFWJS_MODEL_CDN_BASE_URL = String(
  import.meta.env?.VITE_NSFWJS_MODEL_CDN_BASE_URL
  || 'https://cdn.jsdelivr.net/npm/nsfwjs@4.3.0/dist/models'
).replace(/\/+$/, '');
const NSFWJS_MODEL_BUNDLES = {
  MobileNetV2: { directory: 'mobilenet_v2', shards: 1 },
  MobileNetV2Mid: { directory: 'mobilenet_v2_mid', shards: 2 },
  InceptionV3: { directory: 'inception_v3', shards: 6 }
};

let modelPromise = null;
let scriptLoadPromise = null;
let modelBundleLoadPromise = null;

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

function loadScriptOnce(src, globalName) {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('当前环境不支持图片安全检测'));
  }

  const existingGlobal = globalName ? globalThis[globalName] : null;
  if (existingGlobal) return Promise.resolve(existingGlobal);

  const existingScript = document.querySelector(`script[data-boh-dynamic-src="${src}"]`);
  if (existingScript) {
    return withTimeout(new Promise((resolve, reject) => {
      existingScript.addEventListener('load', () => resolve(globalName ? globalThis[globalName] : true), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('图片安全检测模型加载失败')), { once: true });
    }), SCRIPT_LOAD_TIMEOUT_MS, '图片安全检测模型加载超时，请检查网络后重试');
  }

  return withTimeout(new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.dataset.bohDynamicSrc = src;
    script.onload = () => resolve(globalName ? globalThis[globalName] : true);
    script.onerror = () => reject(new Error('图片安全检测模型加载失败，请检查网络后重试'));
    document.head.appendChild(script);
  }), SCRIPT_LOAD_TIMEOUT_MS, '图片安全检测模型加载超时，请检查网络后重试');
}

async function loadNsfwRuntime() {
  if (!scriptLoadPromise) {
    scriptLoadPromise = (async () => {
      const tf = await loadScriptOnce(TFJS_CDN_URL, 'tf');
      if (typeof tf?.enableProdMode === 'function') {
        tf.enableProdMode();
      }
      const nsfwjs = await loadScriptOnce(NSFWJS_CDN_URL, 'nsfwjs');
      if (!nsfwjs || typeof nsfwjs.load !== 'function') {
        throw new Error('图片安全检测模型加载失败');
      }
      return nsfwjs;
    })();
  }

  try {
    return await scriptLoadPromise;
  } catch (error) {
    scriptLoadPromise = null;
    throw error;
  }
}

async function getNsfwModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const modelName = String(import.meta.env?.VITE_NSFWJS_MODEL_NAME || DEFAULT_MODEL_NAME).trim() || DEFAULT_MODEL_NAME;
      const nsfwjs = await loadNsfwRuntime();
      await loadNsfwModelBundle(modelName);
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
    const message = String(error?.message || '').trim();
    if (/Could not load the (model|weight data)|model\.min\.js|shard files/i.test(message)) {
      throw new Error('图片安全检测模型加载失败，请刷新页面后重试');
    }
    throw new Error(message || '图片安全检测模型初始化失败，请刷新后重试');
  }
}

async function loadNsfwModelBundle(modelName) {
  const bundle = NSFWJS_MODEL_BUNDLES[modelName];
  if (!bundle) return;

  if (!modelBundleLoadPromise) {
    modelBundleLoadPromise = (async () => {
      const baseUrl = `${NSFWJS_MODEL_CDN_BASE_URL}/${bundle.directory}`;
      await withTimeout(
        loadScriptOnce(`${baseUrl}/model.min.js`, 'model'),
        MODEL_BUNDLE_LOAD_TIMEOUT_MS,
        '图片安全检测模型文件加载超时，请检查网络后重试'
      );
      for (let index = 1; index <= bundle.shards; index += 1) {
        await withTimeout(
          loadScriptOnce(
            `${baseUrl}/group1-shard${index}of${bundle.shards}.min.js`,
            `group1_shard${index}of${bundle.shards}`
          ),
          MODEL_BUNDLE_LOAD_TIMEOUT_MS,
          '图片安全检测模型权重加载超时，请检查网络后重试'
        );
      }
    })();
  }

  try {
    await modelBundleLoadPromise;
  } catch (error) {
    modelBundleLoadPromise = null;
    throw error;
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

export async function moderateForumImageFile(file) {
  const { image, objectUrl } = await createImageElement(file);
  try {
    const model = await getNsfwModel();
    const predictions = await withTimeout(
      model.classify(image),
      IMAGE_CLASSIFY_TIMEOUT_MS,
      '图片安全检测超时，请稍后重试或换一张图片'
    );
    return classifyNsfwPredictions(predictions);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function preloadForumImageModerationModel() {
  await getNsfwModel();
  return { ok: true };
}
