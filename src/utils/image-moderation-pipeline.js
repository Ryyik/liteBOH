// 云端优先、本地兜底的图片审核管线（2026-09-17 审核降级改造）
//
// 第一层：Gemini 云端审核 —— 走 api-key-vault runtime-chat，mode='moderation-image'
//         （模型/上游/温度全部由 bohai_model_configs 的 moderation-image 行服务端裁决）。
//         Gemini OpenAI 兼容层支持 image_url base64 dataURL，Worker 对 messages 原样透传。
// 兜底层：本地 nsfwjs（forum-image-moderation.js），仅在云端不可达/未配置时进入，
//         且判定从宽：仅 rejected（≥0.75 阈值）拦截，needs_review 放行 ——
//         本地模型误杀率高（如上肢肌肉照被判 risky），兜底场景宁可放行待抽查，不阻断正常上传。
//
// 不可达判定与冷却见 classifyCloudFailure / COOLDOWN_*；冷却状态与文字审核共享
// （content-moderation.js 引用本模块导出的 mark/is 函数），因为两条链路最终走同一个
// vault → Worker 出口，一处故障两类审核都不可达。

import { callVaultSiliconChat } from './api/api-key-runtime-api.js';
import { logger } from './logger.js';
import {
  createImageElementForModeration,
  createModerationSurfaceForModeration,
  moderateForumImageFile
} from './forum-image-moderation.js';

const MODERATION_IMAGE_MODE = 'moderation-image';
const CLOUD_TIMEOUT_MS = 8000;
const CLOUD_RETRY_DELAY_MS = 250;

// 冷却时长：不可达（网络/超时/上游故障/限流）60s；配额耗尽 300s。
// 冷却期内直接走本地兜底，避免多图上传每张都等满超时。
const COOLDOWN_UNREACHABLE_MS = 60000;
const COOLDOWN_QUOTA_MS = 300000;

// 面板/排错时用来看冷却原因
let cloudCooldownUntil = 0;
let cloudCooldownReason = '';

export function isCloudModerationCoolingDown(now = Date.now()) {
  return now < cloudCooldownUntil;
}

export function markCloudModerationUnreachable(cooldownMs, reason = '') {
  const until = Date.now() + Math.max(1000, Number(cooldownMs) || COOLDOWN_UNREACHABLE_MS);
  if (until > cloudCooldownUntil) {
    cloudCooldownUntil = until;
    cloudCooldownReason = String(reason || '').slice(0, 80);
  }
  logger.warn('image-moderation-pipeline', '云端审核不可达，进入冷却', {
    reason: cloudCooldownReason,
    cooldownUntil: new Date(cloudCooldownUntil).toISOString()
  });
}

export function markCloudModerationSuccess() {
  cloudCooldownUntil = 0;
  cloudCooldownReason = '';
}

export function getCloudModerationCooldownState() {
  return {
    coolingDown: isCloudModerationCoolingDown(),
    cooldownUntil: cloudCooldownUntil || null,
    reason: cloudCooldownReason
  };
}

// 调试开关：localStorage.boh_moderation_force_layer = 'cloud' | 'local'（探针/排错用）
function getForcedLayer() {
  try {
    return String(localStorage.getItem('boh_moderation_force_layer') || '').trim().toLowerCase();
  } catch {
    return '';
  }
}

const IMAGE_MODERATION_SYSTEM_PROMPT = [
  '<role>你是图片内容安全审查助手，负责判断图片是否适合在社区公开发布。</role>',
  '<constraints>',
  '- 仅在明确包含严重违规内容时才拒绝：色情/性行为/未成年人性相关、暴恐血腥、毒品或枪支交易展示',
  '- 以下内容必须通过：健身/运动肌肉照、泳装海滩照、艺术人体雕塑、哺乳/医疗图片、美食、风景、人物合影',
  '- 存疑时一律通过，尽量降低误判',
  '</constraints>',
  '<output_format>',
  '严格只输出 JSON：{"status":"approved|rejected","confidence":0~1,"reason_code":"...","reason":"..."}',
  '</output_format>'
].join('\n');

const IMAGE_MODERATION_BATCH_PROMPT = [
  '<role>你是图片内容安全审查助手，负责判断图片是否适合在社区公开发布。</role>',
  '<constraints>',
  '- 仅在明确包含严重违规内容时才拒绝：色情/性行为/未成年人性相关、暴恐血腥、毒品或枪支交易展示',
  '- 以下内容必须通过：健身/运动肌肉照、泳装海滩照、艺术人体雕塑、哺乳/医疗图片、美食、风景、人物合影',
  '- 存疑时一律通过，尽量降低误判',
  '</constraints>',
  '<output_format>',
  '严格只输出 JSON：{"results":[{"index":0,"status":"approved|rejected","confidence":0~1,"reason_code":"...","reason":"..."}, ...]}',
  'results 必须覆盖每一张图片，index 从 0 开始按图片出现顺序编号。',
  '</output_format>'
].join('\n');

// File → 224px jpeg dataURL（复用本地检测的解码/降采样，体积约 15-30KB）
export async function encodeImageForCloudModeration(file) {
  const { image, objectUrl } = await createImageElementForModeration(file);
  try {
    const surface = createModerationSurfaceForModeration(image);
    return surface.toDataURL('image/jpeg', 0.7);
  } finally {
    try { image.src = ''; } catch { /* ignore */ }
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

function extractJsonBlock(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeVerdict(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const rawStatus = String(parsed.status || parsed.decision || parsed.result || '').trim().toLowerCase();
  if (!rawStatus) return null;
  const rejected = rawStatus === 'rejected' || rawStatus === 'reject' || rawStatus === 'block' || rawStatus === 'blocked';
  return {
    status: rejected ? 'rejected' : 'approved',
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? parsed.score ?? parsed.probability ?? (rejected ? 0.9 : 0.1)))),
    reason: String(parsed.reason || parsed.message || '').trim().slice(0, 120) || (rejected ? '云端审核判定图片包含不适宜内容' : '云端审核通过'),
    reasonCode: String(parsed.reason_code || parsed.reasonCode || '').trim().slice(0, 48)
  };
}

// 云端响应 → 裁决。返回 null 表示「响应异常」（触发 bad_response 降级），
// safety block 是明确裁决（rejected），不算异常。
function parseCloudResponse(data, { batchCount = 0 } = {}) {
  if (!data || typeof data !== 'object') return null;

  const choices = Array.isArray(data.choices) ? data.choices : [];
  const firstChoice = choices[0] || {};
  const finishReason = String(firstChoice.finish_reason || '').toLowerCase();
  const content = String(firstChoice?.message?.content || '').trim();

  if (!content) {
    const blockReason = String(data.promptFeedback?.blockReason || '').trim();
    if (blockReason || finishReason === 'content_filter' || finishReason === 'safety') {
      return {
        status: 'rejected',
        confidence: 0.99,
        reason: '云端安全策略拦截了该图片',
        reasonCode: 'CLOUD_SAFETY_BLOCK'
      };
    }
    return null;
  }

  const parsed = extractJsonBlock(content);
  if (batchCount > 1) {
    const results = Array.isArray(parsed?.results) ? parsed.results : null;
    if (!results) return null;
    return results;
  }
  return normalizeVerdict(parsed);
}

// 把 callVaultSiliconChat 的失败归类为不可达类型。
// 返回 { kind, cooldownMs }；kind='unconfigured' 表示云端未启用（不冷却，直接本地）。
function classifyCloudFailure(failure = {}) {
  const code = String(failure?.code || '').trim().toUpperCase();
  const status = Number(failure?.status || 0);
  const message = String(failure?.message || '');

  if (code === 'MODE_UNAVAILABLE' || code === 'MODE_ID_INVALID' || code === 'MODE_CONFIG_INVALID') {
    return { kind: 'unconfigured', cooldownMs: 0 };
  }
  if (code === 'API_KEY_RUNTIME_TIMEOUT') {
    return { kind: 'timeout', cooldownMs: COOLDOWN_UNREACHABLE_MS };
  }
  if (code === 'MISSING_SUPABASE_RUNTIME_CONFIG' || code === 'FUNCTION_INVOKE_ERROR') {
    return { kind: 'network', cooldownMs: COOLDOWN_UNREACHABLE_MS };
  }
  if (status === 429) {
    const isQuota = message.includes('额度') || message.toLowerCase().includes('quota');
    return { kind: isQuota ? 'quota' : 'rate_limited', cooldownMs: isQuota ? COOLDOWN_QUOTA_MS : COOLDOWN_UNREACHABLE_MS };
  }
  if (status === 502 || status === 503 || status === 504) {
    return { kind: 'upstream', cooldownMs: COOLDOWN_UNREACHABLE_MS };
  }
  return { kind: 'bad_response', cooldownMs: COOLDOWN_UNREACHABLE_MS };
}

async function callCloudImageModeration(dataUrls, { timeoutMs = CLOUD_TIMEOUT_MS, signal } = {}) {
  const urls = Array.isArray(dataUrls) ? dataUrls : [dataUrls];
  const count = urls.length;
  const textPrompt = count > 1
    ? `请按顺序审核以下 ${count} 张图片，输出覆盖全部图片的 JSON 结果。`
    : '请审核这张图片是否适合在社区公开发布。';

  const payload = {
    messages: [
      { role: 'system', content: count > 1 ? IMAGE_MODERATION_BATCH_PROMPT : IMAGE_MODERATION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: textPrompt },
          ...urls.map((url) => ({ type: 'image_url', image_url: { url } }))
        ]
      }
    ],
    stream: false
    // model / temperature / max_tokens 由 vault 端 moderation-image 行裁决，前端不可篡改
  };

  return callVaultSiliconChat({
    provider: 'custom',
    purpose: 'moderation',
    mode: MODERATION_IMAGE_MODE,
    payload,
    apiUrl: '',
    timeoutMs,
    signal
  });
}

// 本地兜底：宽放行。仅 rejected 拦截；needs_review 视为放行（标记待抽查）。
async function localFallbackModerate(file) {
  const localResult = await moderateForumImageFile(file);
  if (localResult?.status === 'rejected') {
    return {
      status: 'rejected',
      score: localResult.score,
      reason: localResult.reason || '图片未通过安全检测（云端审核暂不可用，本地检测拦截）',
      source: 'local_fallback',
      scores: localResult.scores
    };
  }
  if (localResult?.status === 'needs_review') {
    return {
      status: 'approved',
      score: localResult.score,
      reason: `本地兜底放行（检测低置信 ${Number(localResult.score || 0).toFixed(2)}，建议后台抽查）`,
      source: 'local_fallback_borderline',
      scores: localResult.scores
    };
  }
  return {
    status: 'approved',
    score: localResult?.score || 0,
    reason: '本地兜底检测通过',
    source: 'local_fallback',
    scores: localResult?.scores
  };
}

function isRetryableFailureKind(kind) {
  return kind === 'upstream' || kind === 'bad_response';
}

async function attemptCloudVerdict(dataUrls, { timeoutMs, signal }) {
  const first = await callCloudImageModeration(dataUrls, { timeoutMs, signal });
  if (first?.ok) return { ok: true, data: first.data, keyInfo: first.keyInfo || null };

  const failure = {
    code: first?.error?.code,
    status: first?.status,
    message: first?.error?.message
  };
  const classified = classifyCloudFailure(failure);
  if (isRetryableFailureKind(classified.kind)) {
    await new Promise((resolve) => setTimeout(resolve, CLOUD_RETRY_DELAY_MS));
    const second = await callCloudImageModeration(dataUrls, { timeoutMs, signal });
    if (second?.ok) return { ok: true, data: second.data, keyInfo: second.keyInfo || null };
    const secondClassified = classifyCloudFailure({
      code: second?.error?.code,
      status: second?.status,
      message: second?.error?.message
    });
    return { ok: false, failure: { ...failure, kind: secondClassified.kind, cooldownMs: secondClassified.cooldownMs } };
  }
  return { ok: false, failure: { ...failure, kind: classified.kind, cooldownMs: classified.cooldownMs } };
}

function handleUnreachable(failure) {
  if (failure?.cooldownMs > 0) {
    markCloudModerationUnreachable(failure.cooldownMs, `image:${failure.kind}`);
  } else {
    logger.info('image-moderation-pipeline', '云端图片审核未配置，使用本地兜底');
  }
  return failure?.kind || 'bad_response';
}

// 单图入口：云端优先，不可达回退本地兜底。
// 返回结构与旧版 moderateForumImageFile 兼容：{status:'approved'|'rejected', score, reason, source}
export async function moderateImageWithFallback(file, { timeoutMs = CLOUD_TIMEOUT_MS, signal } = {}) {
  const forced = getForcedLayer();

  if (forced === 'local') {
    return localFallbackModerate(file);
  }

  const cloudEnabled = forced === 'cloud' || !isCloudModerationCoolingDown();
  if (cloudEnabled) {
    try {
      const dataUrl = await encodeImageForCloudModeration(file);
      const attempt = await attemptCloudVerdict(dataUrl, { timeoutMs, signal });
      if (attempt.ok) {
        const verdict = parseCloudResponse(attempt.data, { batchCount: 1 });
        if (verdict) {
          markCloudModerationSuccess();
          return {
            status: verdict.status,
            score: verdict.confidence,
            reason: verdict.reason,
            reasonCode: verdict.reasonCode,
            source: 'gemini'
          };
        }
        const kind = handleUnreachable({ kind: 'bad_response', cooldownMs: COOLDOWN_UNREACHABLE_MS });
        logger.warn('image-moderation-pipeline', '云端审核响应无法解析，回退本地兜底', { kind });
      } else {
        const kind = handleUnreachable(attempt.failure);
        logger.warn('image-moderation-pipeline', '云端审核不可达，回退本地兜底', { kind, status: attempt.failure?.status });
      }
    } catch (error) {
      // 编码失败（图片无法解析）属于图片本身问题，不是云端不可达 —— 原样抛出，
      // 与旧版行为一致（调用方按「图片无法解析」提示用户换图）。
      if (error?.code === 'IMAGE_MODERATION_TIMEOUT' || error?.code === 'IMAGE_MODERATION_UNAVAILABLE'
        || String(error?.message || '').includes('图片')) {
        throw error;
      }
      const kind = handleUnreachable({ kind: 'network', cooldownMs: COOLDOWN_UNREACHABLE_MS });
      logger.warn('image-moderation-pipeline', '云端审核调用异常，回退本地兜底', { kind, message: error?.message });
    }
  }

  return localFallbackModerate(file);
}

// 批量入口：多图合并为一次云端请求（省配额预扣与限流计数）。
// 云端不可达时整组逐张走本地兜底；单图结果缺失时仅该图单独兜底。
export async function moderateImagesWithFallback(files, { timeoutMs = CLOUD_TIMEOUT_MS + 4000, signal } = {}) {
  const list = Array.isArray(files) ? files.filter(Boolean) : [];
  if (list.length === 0) return [];
  if (list.length === 1) {
    const single = await moderateImageWithFallback(list[0], { timeoutMs: CLOUD_TIMEOUT_MS, signal });
    return [single];
  }

  const forced = getForcedLayer();
  if (forced !== 'local' && (forced === 'cloud' || !isCloudModerationCoolingDown())) {
    try {
      const dataUrls = await Promise.all(list.map((file) => encodeImageForCloudModeration(file)));
      const attempt = await attemptCloudVerdict(dataUrls, { timeoutMs, signal });
      if (attempt.ok) {
        const results = parseCloudResponse(attempt.data, { batchCount: list.length });
        if (Array.isArray(results)) {
          markCloudModerationSuccess();
          const verdictByIndex = new Map();
          for (const item of results) {
            const idx = Number(item?.index);
            const verdict = normalizeVerdict(item);
            if (Number.isInteger(idx) && idx >= 0 && idx < list.length && verdict) {
              verdictByIndex.set(idx, verdict);
            }
          }
          return Promise.all(list.map(async (file, idx) => {
            const verdict = verdictByIndex.get(idx);
            if (verdict) {
              return {
                status: verdict.status,
                score: verdict.confidence,
                reason: verdict.reason,
                reasonCode: verdict.reasonCode,
                source: 'gemini'
              };
            }
            // 个别图缺结果：仅该图单独走本地兜底（标记冷却但不阻断其他图）
            logger.warn('image-moderation-pipeline', '批量结果缺失，单图走本地兜底', { index: idx });
            try {
              return await localFallbackModerate(file);
            } catch (error) {
              return {
                status: 'rejected',
                score: 0,
                reason: error?.message || '图片安全检测失败',
                source: 'local_fallback_error'
              };
            }
          }));
        }
        const kind = handleUnreachable({ kind: 'bad_response', cooldownMs: COOLDOWN_UNREACHABLE_MS });
        logger.warn('image-moderation-pipeline', '批量审核响应无法解析，整组回退本地', { kind });
      } else {
        const kind = handleUnreachable(attempt.failure);
        logger.warn('image-moderation-pipeline', '批量审核不可达，整组回退本地', { kind });
      }
    } catch (error) {
      const kind = handleUnreachable({ kind: 'network', cooldownMs: COOLDOWN_UNREACHABLE_MS });
      logger.warn('image-moderation-pipeline', '批量审核调用异常，整组回退本地', { kind, message: error?.message });
    }
  }

  return Promise.all(list.map((file) => localFallbackModerate(file)));
}

// 面板「连通性测试」：直接发一张内置测试图到 moderation-image 行，返回裁决与耗时。
// 不经过冷却包装（测试本身就是验证云端是否可达），也不会写任何用户数据。
export async function testCloudImageModeration({ timeoutMs = 10000 } = {}) {
  const startedAt = Date.now();
  let dataUrl;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    context.fillStyle = '#4a90d9';
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = '#ffffff';
    context.font = 'bold 28px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('B', 32, 32);
    dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  } catch (error) {
    return { ok: false, message: `无法生成测试图片：${error?.message || 'unknown'}`, verdict: null, elapsedMs: 0 };
  }

  try {
    const result = await callCloudImageModeration(dataUrl, { timeoutMs });
    const elapsedMs = Date.now() - startedAt;
    if (!result?.ok) {
      return {
        ok: false,
        message: result?.error?.message || `云端审核返回失败 (${result?.status || 0})`,
        keyInfo: result?.data?.keyInfo || null,
        verdict: null,
        elapsedMs
      };
    }
    const verdict = parseCloudResponse(result.data, { batchCount: 1 });
    if (!verdict) {
      return {
        ok: false,
        message: '云端返回了响应，但无法解析出审核裁决（请检查 moderation-image 行的模型是否具备视觉能力）',
        keyInfo: result.keyInfo,
        verdict: null,
        elapsedMs
      };
    }
    return { ok: true, message: verdict.reason, keyInfo: result.keyInfo, verdict, elapsedMs };
  } catch (error) {
    return { ok: false, message: error?.message || '云端审核调用失败', verdict: null, elapsedMs: Date.now() - startedAt };
  }
}
