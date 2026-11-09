/**
 * 本机使用计数（plans/042 B2 灰度决策用）。
 *
 * 背景：B2 把行内铅笔改成「进详情再编辑」，抽屉降级成 ⋯ 里的逃生口。
 * 「跑两周再感觉一下」不是判据 —— 两周后没人记得看过几次。所以在两个入口各打
 * 一个计数：跑一段时间读一次，抽屉为 0 就用证据删掉它；不为 0 说明详情页确实
 * 覆盖不到某些场景，该修的是详情页。
 *
 * 只写本机 localStorage（不上报、不落库）：这是判断「运营还点不点这个菜单项」，
 * 一个计数器够了；跨设备汇总反而会掩盖「某个人习惯用抽屉」这种真实信号。
 *
 * `storage` 可注入，便于在 node（无 localStorage）下单测。
 */
import { ADMIN_STORAGE_KEYS } from './useDataAdminPersistence.js';

export const USAGE_COUNTERS_KEY = ADMIN_STORAGE_KEYS.usageCounters;

/** 两个入口的计数名（与 UI 上的文案一一对应，改名要同步改读表的人） */
export const USAGE_DRAWER_QUICK_EDIT = 'drawer-quick-edit';
export const USAGE_DETAIL_EDIT = 'detail-edit';

const resolveStorage = (storage) => {
  if (storage) return storage;
  return typeof localStorage === 'undefined' ? null : localStorage;
};

export const readUsageCounters = (storage) => {
  const target = resolveStorage(storage);
  if (!target) return {};
  try {
    const raw = target.getItem(USAGE_COUNTERS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const readUsageCounter = (name, storage) => Number(readUsageCounters(storage)[name]) || 0;

/** +1 并返回新的计数（写失败也只返回当前值，绝不影响调用方的业务动作） */
export const bumpUsageCounter = (name, storage) => {
  const target = resolveStorage(storage);
  if (!target) return 0;
  const counters = readUsageCounters(target);
  const next = (Number(counters[name]) || 0) + 1;
  try {
    target.setItem(USAGE_COUNTERS_KEY, JSON.stringify({ ...counters, [name]: next }));
  } catch {
    return next;
  }
  return next;
};
