/**
 * 云端审核的「健康状态」单源（2026-11-14 从 image-moderation-pipeline.js 拆出）。
 *
 * 为什么单独一个模块：
 *   这套冷却状态本来是图片审核管线的一部分，但**文本审核也要读它** —— 两条链路最终
 *   走同一个 vault → Worker 出口，一处故障两类审核都不可达（见 content-moderation.js
 *   的 isCloudUnreachableSource 注释）。于是 content-moderation 曾经静态 import
 *   image-moderation-pipeline，而后者又静态 import forum-image-moderation（nsfwjs 那条
 *   本地兜底链），一拖就是整整一层：
 *
 *     post-api/_shared → unified-content-moderation → content-moderation
 *       → image-moderation-pipeline → forum-image-moderation
 *
 *   结果：**首屏进「内容 / 我」就白下载了图片审核管线**，而真正用到它的时刻是「用户
 *   点发布一张图」。性能勘察实测这部分 ≈ 11.4 KiB gzip 进的是入口闭包（
 *   docs/2026-11-14-首屏与userspace性能勘察.md §5 P1）。
 *
 *   把状态挪到这个「只依赖 logger」的薄模块后，两边各自 import 它，状态仍然是同一份
 *   内存（ESM 单例），文本审核的同步判定语义完全不变，而图片管线回到「动态 import
 *   才加载」的正确状态（其余调用方本来就是 `import()`）。
 *
 * ⚠️ 语义别改：这里是**全局**冷却，不是按 scene / 按图片。图与文共享一次故障判定。
 */

import { logger } from './logger.js';

// 冷却时长：不可达（网络/超时/上游故障/限流）60s 起步；配额耗尽 300s。
export const COOLDOWN_UNREACHABLE_MS = 60000;
export const COOLDOWN_QUOTA_MS = 300000;
// 指数退避上限：连续故障时冷却不会无限增长，避免「一次故障 → 半小时都用不上云端」。
// 60s → 120s → 240s → 300s（封顶）。
export const COOLDOWN_MAX_MS = 300000;

/* ── 「偶发失败」与「服务真的挂了」必须分开（2026-10-20）──────────────────────
 *
 * 旧行为：任意一次失败立刻冻结全局 60s（见 markCloudModerationUnreachable 的历史实现）。
 * 后果（线上实测 2026-10-20）：4 张图的帖子第 1 张超时 ⇒ 后 3 张连云端都不问，
 * 直接走本地；近 30 天 30 张图云端实际生效 0 张。
 *
 * 但「一次失败就不该信云端」这个直觉本身是错的：实测 6 次调用 4 次成功（67%），
 * 失败是**零星**的，不是持续挂机。用单点失败去推断整体健康度，等于把抖动当故障。
 *
 * 新口径 —— 错误预算：
 *   ① 单次失败只记数，**不影响下一张**（下一张照常问云端）；
 *   ② 连续失败达到 FAILURE_THRESHOLD 才冻结，说明「这不像抖动了」；
 *   ③ 任意一次成功立即清零计数并解除冷却（成功是最强的健康信号）；
 *   ④ 连续故障时按 60s → 120s → 240s 指数退避（封顶 5 分钟），避免长时间失联。
 *
 * 代价（明确接受）：云端真挂时，本批前 N 张会各自等满超时（N = 阈值）。
 * 换来的是：**偶发失败不再误伤同批其余图片**，且用户等待总时长下降（旧行为下
 * 每张都要走一遍本地兜底，反而更慢）。
 */
export const FAILURE_THRESHOLD = 3;

/* ── 并发审核下的「连续失败」必须按**波次**记，不能按调用次数（2026-10-29）────────
 *
 * 上面那套错误预算的前提是「调用是串行排队的一次一次」。2026-10-29 起论坛预热把
 * 云端审核放开到 3 路并发（纯网络请求，无 WebGL 副作用），这个前提就破了：
 *
 *   一次 300ms 的网络抖动会让**在飞的 3 个请求同一瞬间失败** ⇒ 计数一步跳到 3
 *   ⇒ 直接冻结云端 60s ⇒ 整批图全部转本地**从宽**判定。
 *   串行时同一场抖动最多打死 1 个请求（另两个还没发出）—— 这就是并发把「抖动」
 *   放大成「故障」的路径。
 *
 * 口径：**同一波次只记一次**。判据用「在飞请求数」而不是时间窗口 ——
 * 时间窗口会把**串行**路径上的快速失败（如 429 在 50ms 内返回、连续 3 张）
 * 也并成一次，那等于把阈值废掉；只有在飞的并发才是「同一场事故」。
 *
 * 实现：调用方在发起云端请求前后各调一次 enterCloudAttempt / exitCloudAttempt；
 * 失败记账时若此刻**还有别的请求在飞**，说明这不是这一波的最后一声，不计数；
 * 最后一个失败的（在飞数归零）代表整波 +1。串行时每次失败都看到在飞数 0
 * ⇒ 行为与改造前完全一致。
 */
let cloudInFlight = 0;
let lastFailureAt = 0;

// 面板/排错时用来看冷却原因
let cloudCooldownUntil = 0;
let cloudCooldownReason = '';
// 连续失败计数（成功即清零）。用于区分「抖动」与「故障」。
let consecutiveFailures = 0;
// 连续故障期数（每次真正进入冷却 +1），仅用于指数退避。
let cooldownStreak = 0;

/** 云端请求「起飞」。与 exitCloudAttempt 成对，用来判定失败是否属于同一波次。 */
export function enterCloudAttempt() {
  cloudInFlight += 1;
}

/** 云端请求「落地」。即使抛错也必须走到，否则在飞计数会永久虚高、波次判定失效。 */
export function exitCloudAttempt() {
  cloudInFlight = Math.max(0, cloudInFlight - 1);
}

export function isCloudModerationCoolingDown(now = Date.now()) {
  return now < cloudCooldownUntil;
}

/**
 * 记录一次云端失败。
 *
 * ⚠️ 与旧版的语义差异（这是本次改造的核心）：
 * 旧版「调用即冻结」；新版「连续 FAILURE_THRESHOLD 次才冻结」。
 * 单次失败只累加计数并返回 false（未进入冷却），调用方据此**继续**让下一张问云端。
 *
 * @param {number} cooldownMs 基础冷却时长（进入冷却时按 streak 做指数退避）
 * @param {string} reason     冷却原因（写进日志/面板）
 * @returns {{ cooling: boolean, failures: number }} cooling=true 表示本次确实进入了冷却
 */
export function markCloudModerationUnreachable(cooldownMs, reason = '') {
  const base = Math.max(1000, Number(cooldownMs) || COOLDOWN_UNREACHABLE_MS);
  const now = Date.now();
  // 同一波次（并发请求同时失败）只算一次事故，见 cloudInFlight 处的说明。
  const mergedIntoBurst = cloudInFlight > 0;
  const sinceLastFailureMs = lastFailureAt > 0 ? now - lastFailureAt : null;
  lastFailureAt = now;
  if (!mergedIntoBurst) consecutiveFailures += 1;

  // 未达阈值：只记账，不冻结。下一张照常问云端。
  if (consecutiveFailures < FAILURE_THRESHOLD) {
    // 日志 tag 仍沿用 'image-moderation-pipeline'：线上日志检索与排错手册都按它过滤，
    // 这里只是代码位置搬了家，不改观测口径。
    logger.warn('image-moderation-pipeline', '云端审核单次失败（未达冻结阈值，下一张继续尝试）', {
      reason: String(reason || '').slice(0, 80),
      consecutiveFailures,
      threshold: FAILURE_THRESHOLD,
      mergedIntoBurst,
      sinceLastFailureMs,
    });
    return { cooling: false, failures: consecutiveFailures };
  }

  // 达到阈值：进入冷却，并按连续故障期数做指数退避。
  cooldownStreak += 1;
  const backoff = Math.min(COOLDOWN_MAX_MS, base * 2 ** (cooldownStreak - 1));
  const until = Date.now() + backoff;
  if (until > cloudCooldownUntil) {
    cloudCooldownUntil = until;
    cloudCooldownReason = String(reason || '').slice(0, 80);
    // 只有真的把冷却**延长**了才记日志：同一次失败会先由 attemptCloudVerdict 标记、
    // 再由调用方的 handleUnreachable 收口，这里不设条件就会打两条一模一样的 warn。
    logger.warn('image-moderation-pipeline', '云端审核连续失败达阈值，进入冷却', {
      reason: cloudCooldownReason,
      consecutiveFailures,
      cooldownStreak,
      cooldownMs: backoff,
      cooldownUntil: new Date(cloudCooldownUntil).toISOString(),
    });
  }
  return { cooling: true, failures: consecutiveFailures };
}

export function markCloudModerationSuccess() {
  // 成功是最强的健康信号：清冷却 + 清连续失败计数 + 退避期数归零 + 清波次时间戳
  // （不清 time stamp 会让「成功后立刻又失败」被误并进上一波次）。
  cloudCooldownUntil = 0;
  cloudCooldownReason = '';
  consecutiveFailures = 0;
  cooldownStreak = 0;
  lastFailureAt = 0;
}

export function getCloudModerationCooldownState() {
  return {
    coolingDown: isCloudModerationCoolingDown(),
    cooldownUntil: cloudCooldownUntil || null,
    reason: cloudCooldownReason,
    // 连续失败计数与阈值：面板/探针用它判断「是抖动还是故障」。
    consecutiveFailures,
    failureThreshold: FAILURE_THRESHOLD,
    cooldownStreak,
  };
}

/* ── 调试开关与「移动端跳过本地模型」（2026-11-14 从 image-moderation-pipeline.js 搬来）──
 *
 * 为什么放在这个薄模块里而不是留在管线：论坛的**预载守卫**
 * （views/Forum/composables/useForumImageModerationPreload.js）只需要这两个判定，
 * 但它原来静态 import 整条 pipeline ⇒ ForumMain 的静态图把图片审核管线一起带上了
 * （实测随论坛流多下 7.4 KiB，见性能勘察 §8.3）。判定本身只依赖 localStorage 与
 * matchMedia，放在这里零成本，管线仍然 re-export（既有调用方不用改）。
 */

// 调试开关：localStorage.boh_moderation_force_layer = 'cloud' | 'local'（探针/排错用）
export function getForcedLayer() {
  try {
    return String(localStorage.getItem('boh_moderation_force_layer') || '')
      .trim()
      .toLowerCase();
  } catch {
    return '';
  }
}

/* ── 移动端跳过本地模型（2026-11-05 方案 A，用户拍板）──────────────────────
 * 本地 nsfwjs 兜底的 tfjs 模块解析、权重下载（3.5MB）、WebGL 初始化与 classify
 * 全部发生在主线程 —— iPhone 上是数秒级冻结（2026-11-05 用户报障：传图几秒后
 * 整页卡死、无法打字，只能杀掉浏览器重进）。而本地兜底本就「从宽判定」（只拦
 * ≥0.75 的明显违规，needs_review 放行），移动端放弃这层拦截面换「不卡死」。
 * 云端不可达时直接走既有的 pending_review + 后台复审（约 6 分钟内真实裁决，
 * 违规则软删该图）—— 与「本地模型未就绪」路径完全同一出口（2026-10-29 决策）。
 *
 * ⚠️ 调试开关 boh_moderation_force_layer='local' 不受此门控：显式要求测本地
 * 模型时必须真的跑本地模型。导出给 useForumImageModerationPreload 复用 ——
 * 否则移动端 classify 永不运行、预载却照下 3.5MB 权重，卡顿原样保留。
 */
export function shouldSkipLocalModel() {
  if (getForcedLayer() === 'local') return false;
  try {
    // 用 globalThis 而不是 window：浏览器里两者相同，node 测试环境里 window 不存在
    const matchMedia = globalThis.matchMedia;
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches === true;
  } catch {
    return false;
  }
}
