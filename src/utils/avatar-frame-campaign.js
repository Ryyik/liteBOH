/**
 * 头像框限时活动口径（纯函数 · 零依赖）
 *
 * 语义：清单里 `freeUntil: 'YYYY-MM-DD'` = 「含当日全天免费」，次日 00:00 起回落到声明档位 tier。
 *   例：freeUntil '2026-09-25' + tier 'ultra' → 9/25 23:59:59 前全员可戴，9/26 00:00 起 Ultra 专属。
 *
 * 为什么单独成文件：这是限免判定的唯一真相源。UI（useAvatarFrame / AvatarFrameGrid）、
 * 探针、脚本断言都走这一条口径，避免出现"页面按一套算法、测试按另一套"的双实现。
 */

/** 限免截止时刻（本地时区当日 23:59:59.999）；无 freeUntil 或格式非法 -> null */
export function freeUntilMs(frame) {
  const raw = frame?.freeUntil;
  if (!raw) return null;
  const t = new Date(`${raw}T23:59:59.999`).getTime();
  return Number.isFinite(t) ? t : null;
}

/** 是否处于限免期 */
export function isFrameFreeNow(frame, nowMs = Date.now()) {
  const end = freeUntilMs(frame);
  return end !== null && nowMs <= end;
}

/** 当刻生效档位：限免期内一律 'free'，到期回落到声明档位 */
export function resolveFrameTier(frame, nowMs = Date.now()) {
  if (!frame) return 'free';
  return isFrameFreeNow(frame, nowMs) ? 'free' : String(frame.tier || 'free');
}

/** 距下一次限免到期还有多少毫秒；非限免或已到期 -> null */
export function msUntilFreeEnds(frame, nowMs = Date.now()) {
  const end = freeUntilMs(frame);
  if (end === null || nowMs > end) return null;
  return end - nowMs;
}

/** 限免截止日展示串（"9/25"）；非限免返回 '' */
export function freeUntilLabel(frame) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(frame?.freeUntil || ''));
  if (!m) return '';
  return `${Number(m[2])}/${Number(m[3])}`;
}
