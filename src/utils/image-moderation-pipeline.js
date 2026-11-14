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
  moderateForumImageFile,
} from './forum-image-moderation.js';

const MODERATION_IMAGE_MODE = 'moderation-image';
// 单图云端审核超时。
//
// ⚠️ 2026-10-29 从 2500 **抬到 6000**。这不是回滚 10-04 的提速，而是修一个当时没算到的死结：
//    服务端 moderation-image 有降级链（3.5-flash-lite → 3.5-flash → 3.6-flash），
//    实测单跳耗时 **2.8s / 3.6s / 4.3s**（EF → Worker → Gemini，224px 图，2026-10-29 实测）。
//    2500 < 最快一跳 2.8s ⇒ **客户端永远先超时**，云端审核在图片路径上 100% 不生效，
//    全部静默回落本地**从宽**判定（只有 ≥0.75 才拦）。也就是说 10-04 之后所有
//    「云端审核降级链/模型排序」的优化在图片上都跑不到，被这一个常量吃掉了。
//
// 6000 的取值依据（覆盖的是真实路径，不是拍脑袋的余量）：
//   · 第 1 跳就成功          ≈ 2.8s  ✅ 覆盖
//   · 第 1 跳快速失败 + 第 2 跳 ≈ 0.3 + 3.6 = 3.9s  ✅ 覆盖
//   · 两个慢跳全串行          ≈ 2.8 + 3.6 = 6.4s  ❌ 超时回落本地（**刻意接受**）
// 多出来的约 1.6s 是给网络抖动的，不是给第三跳的。
//
// 代价（明确接受）：云端真不可达时，单批等待从 2.5s 变 6s。但
//   ① 论坛侧审核是 3 路并发（见 ForumMain 的 MODERATION_CONCURRENCY），一批只付一次；
//   ② 连续失败 3 次（≈一波）即进冷却，之后整批直接走本地，不会每张都等满 6s。
// 反向对照：把 6000 改回 2500 → `image-moderation-pipeline.test.js` 的超时契约条红。
const CLOUD_TIMEOUT_MS = 6000;
// 批量云端审核超时：与单图**解耦**。此前写的是 `CLOUD_TIMEOUT_MS + 4000`，
// 一旦下调单图超时就会把批量也一起压到 6.5s —— 而 `share-moderation.js` 是把
// **整集照片（最多 60 张）**一次丢进批量入口的，6.5s 必然全超时 → 整组回落本地。
// 所以批量给一个独立、显式的大值；调用方（影集上传）自己分块控制单次张数。
const CLOUD_BATCH_TIMEOUT_MS = 12000;
const CLOUD_RETRY_DELAY_MS = 250;
// 重试的最小可用预算：剩余低于这个数就干脆不重试（发了也大概率被 abort）。
const MIN_RETRY_TIMEOUT_MS = 1200;
// 「每项解码一张全分辨率原图」的并发上限 —— 云端编码与本地兜底共用。
// 此前两处都是 `Promise.all` 全量并发：分享前复审最多 60 张，等于同时解码 60 张原图，
// 移动端必然 OOM/卡死。收敛成 2 路：多花一点时间换峰值内存。
const DECODE_CONCURRENCY = 2;

/* ── 云端审核的健康状态已拆到 moderation-cloud-state.js（2026-11-14）──────────
 *
 * 冷却时长 / 失败阈值 / 在飞计数 / 指数退避全在那里，连同它们的取舍注释。
 * 拆出去的原因不是「归置代码好看」，而是**文本审核也要读这份状态**：
 * 拆分前 content-moderation.js 必须静态 import 本模块，于是「发帖才用」的图片审核
 * 管线（含 forum-image-moderation → nsfwjs 兜底链）被拖进首屏入口闭包 ≈ 11.4 KiB gzip。
 * 现在两边都只 import 状态模块，状态仍是同一份内存（ESM 单例）。
 *
 * 这里 re-export 是为了不打断既有调用方（forum-image-moderation / 探针 / 单测
 * 都从本模块取这几个函数），语义完全等价。
 */
import {
  COOLDOWN_QUOTA_MS,
  COOLDOWN_UNREACHABLE_MS,
  enterCloudAttempt,
  exitCloudAttempt,
  getCloudModerationCooldownState,
  getForcedLayer,
  isCloudModerationCoolingDown,
  markCloudModerationSuccess,
  markCloudModerationUnreachable,
  shouldSkipLocalModel,
} from './moderation-cloud-state.js';

export {
  getCloudModerationCooldownState,
  getForcedLayer,
  isCloudModerationCoolingDown,
  markCloudModerationSuccess,
  markCloudModerationUnreachable,
  shouldSkipLocalModel,
};

/* 调试开关与「移动端跳过本地模型」的判定都搬到了 moderation-cloud-state.js
   （2026-11-14）：论坛的预载守卫要读它们，而它不该为此把整条图片审核管线拖进
   ForumMain 的静态图。这里保留 re-export，既有调用方与单测无需改路径。 */

const IMAGE_MODERATION_SYSTEM_PROMPT = [
  '<role>你是图片内容安全审查助手，负责判断图片是否适合在社区公开发布。</role>',
  '<constraints>',
  '- 仅在明确包含严重违规内容时才拒绝：色情/性行为/未成年人性相关、暴恐血腥、毒品或枪支交易展示',
  '- 以下内容必须通过：健身/运动肌肉照、泳装海滩照、艺术人体雕塑、哺乳/医疗图片、美食、风景、人物合影',
  '- 存疑时一律通过，尽量降低误判',
  '</constraints>',
  '<output_format>',
  '严格只输出 JSON：{"status":"approved|rejected","confidence":0~1,"reason_code":"...","reason":"..."}',
  '</output_format>',
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
  '</output_format>',
].join('\n');

// File → 224px jpeg dataURL（复用本地检测的解码/降采样，体积约 15-30KB）
export async function encodeImageForCloudModeration(file) {
  const { image, objectUrl } = await createImageElementForModeration(file);
  try {
    const surface = createModerationSurfaceForModeration(image);
    return surface.toDataURL('image/jpeg', 0.7);
  } finally {
    try {
      image.src = '';
    } catch {
      /* ignore */
    }
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

/**
 * 有界并发 map：结果按入参下标落位 ⇒ 保持「返回顺序 == 入参顺序」契约。
 *
 * 用在**两处每项都要解码一张全分辨率原图**的地方（云端编码 / 本地兜底）。
 * 两者此前都是 `Promise.all` 全量并发 —— 影集分享前复审最多 60 张，等于同时解码
 * 60 张原图，移动端必然 OOM/卡死。收敛成 `DECODE_CONCURRENCY` 路。
 *
 * 任一项抛错：记下第一个错误并让其余 worker 尽快收工，最后统一抛出
 * —— 与旧的 `Promise.all` 语义一致（一项失败即整批失败）。
 */
async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let firstError = null;
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length && !firstError) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        if (!firstError) firstError = error;
        return;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  if (firstError) throw firstError;
  return results;
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
  const rawStatus = String(parsed.status || parsed.decision || parsed.result || '')
    .trim()
    .toLowerCase();
  if (!rawStatus) return null;
  const rejected =
    rawStatus === 'rejected' ||
    rawStatus === 'reject' ||
    rawStatus === 'block' ||
    rawStatus === 'blocked';
  return {
    status: rejected ? 'rejected' : 'approved',
    confidence: Math.max(
      0,
      Math.min(
        1,
        Number(parsed.confidence ?? parsed.score ?? parsed.probability ?? (rejected ? 0.9 : 0.1)),
      ),
    ),
    reason:
      String(parsed.reason || parsed.message || '')
        .trim()
        .slice(0, 120) || (rejected ? '云端审核判定图片包含不适宜内容' : '云端审核通过'),
    reasonCode: String(parsed.reason_code || parsed.reasonCode || '')
      .trim()
      .slice(0, 48),
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
        reasonCode: 'CLOUD_SAFETY_BLOCK',
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
  const code = String(failure?.code || '')
    .trim()
    .toUpperCase();
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
    return {
      kind: isQuota ? 'quota' : 'rate_limited',
      cooldownMs: isQuota ? COOLDOWN_QUOTA_MS : COOLDOWN_UNREACHABLE_MS,
    };
  }
  if (status === 502 || status === 503 || status === 504) {
    return { kind: 'upstream', cooldownMs: COOLDOWN_UNREACHABLE_MS };
  }
  return { kind: 'bad_response', cooldownMs: COOLDOWN_UNREACHABLE_MS };
}

async function callCloudImageModeration(dataUrls, { timeoutMs = CLOUD_TIMEOUT_MS, signal } = {}) {
  const urls = Array.isArray(dataUrls) ? dataUrls : [dataUrls];
  const count = urls.length;
  const textPrompt =
    count > 1
      ? `请按顺序审核以下 ${count} 张图片，输出覆盖全部图片的 JSON 结果。`
      : '请审核这张图片是否适合在社区公开发布。';

  const payload = {
    messages: [
      {
        role: 'system',
        content: count > 1 ? IMAGE_MODERATION_BATCH_PROMPT : IMAGE_MODERATION_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: textPrompt },
          ...urls.map((url) => ({ type: 'image_url', image_url: { url } })),
        ],
      },
    ],
    stream: false,
    // model / temperature / max_tokens 由 vault 端 moderation-image 行裁决，前端不可篡改
  };

  return callVaultSiliconChat({
    provider: 'custom',
    purpose: 'moderation',
    mode: MODERATION_IMAGE_MODE,
    payload,
    apiUrl: '',
    timeoutMs,
    signal,
  });
}

// 本地兜底：宽放行。仅 rejected 拦截；needs_review 视为放行（标记待抽查）。
//
// ⚠️ **本地兜底强制单并发**（2026-10-29）。
// 实测教训：本地 nsfwjs 批量并发在移动端会崩 —— 整组解码全分辨率位图 + WebGL classify
// 叠加，峰值内存和 GPU 队列一起爆。此前靠 ForumMain 的一条全局串行链顺带挡住了，
// 但那条链同时把**云端**串成了 6 次 RTT 相加，所以拆开：云端放开并发（纯网络，无副作用），
// 本地在**这一层**兜住单并发。
//
// 放在这一层而不是调用方，是因为调用方无法预知「这次会不会降级到本地」：3 路并发进
// moderateImageWithFallback 时，可能三张同时云端失败、同时降级 —— 按入口并发数判断
// 会漏。这里的互斥对**所有**入口生效（论坛预热、影集分享复审、强制 local 调试开关）。
let localFallbackChain = Promise.resolve();

async function localFallbackModerate(file) {
  // 方案 A：移动端不加载/不运行本地模型，直接转后台复审（见 shouldSkipLocalModel 注释）
  if (shouldSkipLocalModel()) {
    return {
      status: 'pending_review',
      score: 0,
      reason: '云端审核暂不可用，已放行并提交后台复审',
      source: 'pending_server_review',
    };
  }
  // 排队取锁：先接住上一位的 promise，再把自己的 release 挂上去。
  const prev = localFallbackChain;
  let release;
  localFallbackChain = new Promise((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    return await runLocalFallbackModerate(file);
  } finally {
    // 无论成功/抛错都放锁：一张坏图不能把后面的图永久卡在队列里
    release();
  }
}

/**
 * 本地检测「模型没就绪」与「图片本身有问题」都带 IMAGE_MODERATION_UNAVAILABLE，
 * 但两者的正确处置完全相反：前者应放行+后台复审，后者必须让用户换图。
 * 因此只能按文案精确区分，**绝不能只看 code**。
 *
 * 反例（必须继续抛错）：图片尺寸无效 / 无法创建图片安全检测画布 / 不支持图片安全检测。
 */
function isLocalModelUnavailableError(error) {
  const code = String(error?.code || '');
  if (code !== 'IMAGE_MODERATION_TIMEOUT' && code !== 'IMAGE_MODERATION_UNAVAILABLE') {
    return false;
  }
  const message = String(error?.message || '');
  return /检测模型|模型初始化|初始化超时|初始化失败|模块初始化/.test(message);
}

async function runLocalFallbackModerate(file) {
  let localResult;
  try {
    localResult = await moderateForumImageFile(file);
  } catch (error) {
    if (!isLocalModelUnavailableError(error)) throw error;
    // 2026-10-29 产品决策：云端不可达 + 本地未就绪时**不再阻断发布**。
    // 此前这里把 30s 初始化超时直接抛给用户（"图片安全检测模型初始化超时"），
    // 结果是两级都不可用时用户彻底发不出帖。现在改为放行 + 后台复审，
    // 由 forum-async-worker 的 image_recheck 任务在约 6 分钟内给出真实裁决。
    logger.warn('image-moderation-pipeline', '本地兜底模型未就绪，放行并转后台复审', {
      code: error?.code,
      message: error?.message,
    });
    return {
      status: 'pending_review',
      score: 0,
      reason: '云端审核暂不可用，本地检测未就绪，已放行并提交后台复审',
      source: 'pending_server_review',
    };
  }
  if (localResult?.status === 'rejected') {
    return {
      status: 'rejected',
      score: localResult.score,
      reason: localResult.reason || '图片未通过安全检测（云端审核暂不可用，本地检测拦截）',
      source: 'local_fallback',
      scores: localResult.scores,
    };
  }
  if (localResult?.status === 'needs_review') {
    return {
      status: 'approved',
      score: localResult.score,
      reason: `本地兜底放行（检测低置信 ${Number(localResult.score || 0).toFixed(2)}，建议后台抽查）`,
      source: 'local_fallback_borderline',
      scores: localResult.scores,
    };
  }
  return {
    status: 'approved',
    score: localResult?.score || 0,
    reason: '本地兜底检测通过',
    source: 'local_fallback',
    scores: localResult?.scores,
  };
}

function isRetryableFailureKind(kind) {
  return kind === 'upstream' || kind === 'bad_response';
}

async function attemptCloudVerdict(dataUrls, { timeoutMs, signal }) {
  // 在飞计数：失败记账用它判断「这一声是不是本波的最后一声」
  // （计数的语义与注释都在 moderation-cloud-state.js 的 cloudInFlight 处）。
  // 包住整个 attempt（含重试）—— 重试是同一次事故的延续，不该被算成第二波。
  enterCloudAttempt();
  try {
    return await runCloudAttempt(dataUrls, { timeoutMs, signal });
  } finally {
    exitCloudAttempt();
  }
}

async function runCloudAttempt(dataUrls, { timeoutMs, signal }) {
  // 本次 attempt 的**总预算**（含下面最多一次的重试）。2026-10-29 加：
  // 此前重试直接复用完整 timeoutMs ⇒ 最坏 6s + 250ms + 6s = 12.25s，
  // 而「云端不可达」时用户就是白白多看一倍等待。现在重试用**剩余预算**：
  //   第一次吃满 6s 才失败 ⇒ 剩余约 0 ⇒ 不重试（总 6s）
  //   第一次 0.3s 快速 503 ⇒ 剩余 5.7s ⇒ 重试（总 ≈ 6.25s）
  // 于是上限回到「一个预算 + 一次重试延迟」，与服务端「一条链共用一份预算」同口径。
  const budgetMs = Math.max(1000, Number(timeoutMs) || CLOUD_TIMEOUT_MS);
  const deadline = Date.now() + budgetMs;
  const first = await callCloudImageModeration(dataUrls, { timeoutMs, signal });
  if (first?.ok) return { ok: true, data: first.data, keyInfo: first.keyInfo || null };

  const failure = {
    code: first?.error?.code,
    status: first?.status,
    message: first?.error?.message,
  };
  const classified = classifyCloudFailure(failure);

  // ⚠️ 2026-10-20 改造：这里**不再**立即冻结冷却。
  //
  // 旧实现（2026-10-04「首次失败即冷却」）在此处直接 markCloudModerationUnreachable，
  // 于是多图批次里第 1 张一次超时就把全局 60s 冷却立起来，后 3 张连云端都不问
  // —— 线上实测「1 次云端调用 + 4 张本地兜底」的成因。
  // 现在改为：**记账下沉到最终判定之后**（重试完再记，避免一次失败被算两次），
  // 由 markCloudModerationUnreachable 内部按连续失败数决定是否真的冻结。

  if (isRetryableFailureKind(classified.kind)) {
    await new Promise((resolve) => setTimeout(resolve, CLOUD_RETRY_DELAY_MS));
    const remainingMs = deadline - Date.now();
    if (remainingMs < MIN_RETRY_TIMEOUT_MS) {
      // 预算见底：再发一次只会把「不可达」拖成两倍等待（且客户端可能已经放弃）
      return {
        ok: false,
        failure: { ...failure, kind: classified.kind, cooldownMs: classified.cooldownMs },
      };
    }
    const second = await callCloudImageModeration(dataUrls, { timeoutMs: remainingMs, signal });
    if (second?.ok) return { ok: true, data: second.data, keyInfo: second.keyInfo || null };
    const secondClassified = classifyCloudFailure({
      code: second?.error?.code,
      status: second?.status,
      message: second?.error?.message,
    });
    return {
      ok: false,
      failure: {
        ...failure,
        kind: secondClassified.kind,
        cooldownMs: secondClassified.cooldownMs,
      },
    };
  }
  return {
    ok: false,
    failure: {
      ...failure,
      kind: classified.kind,
      cooldownMs: classified.cooldownMs,
    },
  };
}

/**
 * 失败收口：**唯一的失败记账入口**（单图/批量两条路径都走这里）。
 *
 * 2026-10-20 起，是否冻结冷却由 markCloudModerationUnreachable 内部按连续失败数决定；
 * 本函数只负责「把这次失败记上」，不再假设「失败就等于冻结」。
 *
 * @returns {string} 失败类型（给调用方打日志用）
 */
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
export async function moderateImageWithFallback(
  file,
  { timeoutMs = CLOUD_TIMEOUT_MS, signal } = {},
) {
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
            source: 'gemini',
          };
        }
        const kind = handleUnreachable({
          kind: 'bad_response',
          cooldownMs: COOLDOWN_UNREACHABLE_MS,
        });
        logger.warn('image-moderation-pipeline', '云端审核响应无法解析，回退本地兜底', { kind });
      } else {
        const kind = handleUnreachable(attempt.failure);
        logger.warn('image-moderation-pipeline', '云端审核不可达，回退本地兜底', {
          kind,
          status: attempt.failure?.status,
        });
      }
    } catch (error) {
      // 编码失败（图片无法解析）属于图片本身问题，不是云端不可达 —— 原样抛出，
      // 与旧版行为一致（调用方按「图片无法解析」提示用户换图）。
      if (
        error?.code === 'IMAGE_MODERATION_TIMEOUT' ||
        error?.code === 'IMAGE_MODERATION_UNAVAILABLE' ||
        String(error?.message || '').includes('图片')
      ) {
        throw error;
      }
      const kind = handleUnreachable({ kind: 'network', cooldownMs: COOLDOWN_UNREACHABLE_MS });
      logger.warn('image-moderation-pipeline', '云端审核调用异常，回退本地兜底', {
        kind,
        message: error?.message,
      });
    }
  }

  return localFallbackModerate(file);
}

// 批量入口：多图合并为一次云端请求（省配额预扣与限流计数）。
// 云端不可达时整组逐张走本地兜底；单图结果缺失时仅该图单独兜底。
export async function moderateImagesWithFallback(
  files,
  { timeoutMs = CLOUD_BATCH_TIMEOUT_MS, signal } = {},
) {
  const list = Array.isArray(files) ? files.filter(Boolean) : [];
  if (list.length === 0) return [];
  if (list.length === 1) {
    const single = await moderateImageWithFallback(list[0], {
      timeoutMs: CLOUD_TIMEOUT_MS,
      signal,
    });
    return [single];
  }

  const forced = getForcedLayer();
  if (forced !== 'local' && (forced === 'cloud' || !isCloudModerationCoolingDown())) {
    try {
      const dataUrls = await mapWithConcurrency(list, DECODE_CONCURRENCY, (file) =>
        encodeImageForCloudModeration(file),
      );
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
          return mapWithConcurrency(list, DECODE_CONCURRENCY, async (file, idx) => {
            const verdict = verdictByIndex.get(idx);
            if (verdict) {
              return {
                status: verdict.status,
                score: verdict.confidence,
                reason: verdict.reason,
                reasonCode: verdict.reasonCode,
                source: 'gemini',
              };
            }
            // 个别图缺结果：仅该图单独走本地兜底（标记冷却但不阻断其他图）
            logger.warn('image-moderation-pipeline', '批量结果缺失，单图走本地兜底', {
              index: idx,
            });
            try {
              return await localFallbackModerate(file);
            } catch (error) {
              return {
                status: 'rejected',
                score: 0,
                reason: error?.message || '图片安全检测失败',
                source: 'local_fallback_error',
              };
            }
          });
        }
        const kind = handleUnreachable({
          kind: 'bad_response',
          cooldownMs: COOLDOWN_UNREACHABLE_MS,
        });
        logger.warn('image-moderation-pipeline', '批量审核响应无法解析，整组回退本地', { kind });
      } else {
        const kind = handleUnreachable(attempt.failure);
        logger.warn('image-moderation-pipeline', '批量审核不可达，整组回退本地', { kind });
      }
    } catch (error) {
      const kind = handleUnreachable({ kind: 'network', cooldownMs: COOLDOWN_UNREACHABLE_MS });
      logger.warn('image-moderation-pipeline', '批量审核调用异常，整组回退本地', {
        kind,
        message: error?.message,
      });
    }
  }

  // 整组本地兜底：同样有界并发（每项都要解码一张原图）
  return mapWithConcurrency(list, DECODE_CONCURRENCY, (file) => localFallbackModerate(file));
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
    return {
      ok: false,
      message: `无法生成测试图片：${error?.message || 'unknown'}`,
      verdict: null,
      elapsedMs: 0,
    };
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
        elapsedMs,
      };
    }
    const verdict = parseCloudResponse(result.data, { batchCount: 1 });
    if (!verdict) {
      return {
        ok: false,
        message:
          '云端返回了响应，但无法解析出审核裁决（请检查 moderation-image 行的模型是否具备视觉能力）',
        keyInfo: result.keyInfo,
        verdict: null,
        elapsedMs,
      };
    }
    return { ok: true, message: verdict.reason, keyInfo: result.keyInfo, verdict, elapsedMs };
  } catch (error) {
    return {
      ok: false,
      message: error?.message || '云端审核调用失败',
      verdict: null,
      elapsedMs: Date.now() - startedAt,
    };
  }
}
