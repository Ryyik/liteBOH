/**
 * 详情页返回标记 —— 让列表「这一次」不重播入场动画（2026-10-31）
 *
 * 为什么需要一个模块：这个标记是**跨三个组件、只靠 CSS 消费**的，
 * 消费方（`Forum/styles/feed.css`、`UserSpace/styles/shell-community.css`）
 * 通过 `html[data-boh-detail-returning]` 命中。它不能挂在任何组件根上 ——
 * 返回目的地不固定（首页 / 用户中心 / 个人页），挂容器类必漏。
 *
 * ⚠️⚠️ 三条踩过的坑，改这里之前先读完：
 *
 * ① **抑制手段必须是「时长归零」而不是 `animation: none`。**
 *    `Forum/styles/base.css` 里 `.fade-in-up { animation: … forwards;
 *    opacity: 0; transform: translateY(30px) }` —— 可见性是靠动画 fill
 *    撑住的，禁掉动画 = 退回 `opacity: 0` = 整块列表消失（实测过）。
 *
 * ② **摘除时刻必须从「列表挂载」起算，不能从「离开详情」起算。**
 *    摘掉 `!important` 的时长覆盖，等于把 `animation-duration` 从 0s 改回 1s，
 *    浏览器会按「已过时间 / 新时长」把动画 **re-seek 到中间帧**，而不是保持终点。
 *    实测（`scripts/probes/_tmp-return-jitter.mjs`，视口 390×844）：
 *    从离开详情起算 900ms 摘除，`.posts-feed` 被 seek 回 `fadeInUp` 的 85%
 *    ⇒ `opacity 1 → 0.963`、`translateY 0 → 1.1px`，再用 330ms 爬回去。
 *    用户对这件事的报障原话是「返回的时候列表整个像刷新了一样短暂的抖了一下」。
 *    而列表元素在**离开详情后约 80ms** 才挂上（骨架态），卡片更晚（~950ms），
 *    所以就着「离开时刻」的定时器永远算不准。这里改成盯 `.posts-feed` 出现，
 *    挂了才开始计时 —— 计时起点与动画创建时刻对齐，误差不到一帧。
 *
 * ③ **等待时长必须长于被抑制元素最长的那条基础动画**（当前是
 *    `.posts-feed` 的 `fadeInUp 1s`；卡片是 420ms + 最多 360ms 交错延迟 = 780ms）。
 *    短了就会 re-seek 到中间帧（同 ②）。`SETTLE_AFTER_MOUNT` 取 1400ms，
 *    留 400ms 余量；多等一会儿**没有任何视觉代价**（抑制只是「不播动画」）。
 *
 * 失败兜底：列表一直没出现（返回到了没有 feed 的页面）也不会把标记永久留在
 * `<html>` 上 —— `FAILSAFE_MS` 到点无条件摘。
 */

export const RETURN_FLAG = 'bohDetailReturning';

/** 列表挂载后还要抑制多久（必须 > 最长的被抑制基础动画，见文件头 ③） */
const SETTLE_AFTER_MOUNT = 1400;
/** 兜底：列表压根没出现时，标记最多存活多久 */
const FAILSAFE_MS = 3000;
/** 「列表已挂载」的判据：任一被压制块的宿主 */
const FEED_SELECTOR = '.posts-feed, .tab-page, .profile-hero-panel';

let active = null;

/**
 * 打上「正在从详情返回」标记，并安排好自摘。
 * 重复调用（连按返回 / 返回后又点开）会先清掉上一轮的定时器与观察器。
 */
export function markDetailReturning(options = {}) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const settleAfter = options.settleAfter ?? SETTLE_AFTER_MOUNT;
  const failsafe = options.failsafe ?? FAILSAFE_MS;

  releaseDetailReturning();

  const root = document.documentElement;
  root.dataset[RETURN_FLAG] = '1';

  let released = false;
  const timers = [];
  const release = () => {
    if (released) return;
    released = true;
    observer?.disconnect();
    timers.forEach((id) => window.clearTimeout(id));
    active = null;
    delete root.dataset[RETURN_FLAG];
  };
  const observer =
    typeof MutationObserver === 'function'
      ? new MutationObserver(() => {
          if (!document.querySelector(FEED_SELECTOR)) return;
          observer.disconnect();
          timers.push(window.setTimeout(release, settleAfter));
        })
      : null;

  observer?.observe(document.documentElement, { childList: true, subtree: true });
  timers.push(window.setTimeout(release, failsafe));
  active = release;
}

/** 立刻摘掉标记（路由又有新跳转时用，避免抑制泄漏到下一次进入） */
export function releaseDetailReturning() {
  if (typeof document === 'undefined') return;
  if (active) active();
  delete document.documentElement.dataset[RETURN_FLAG];
}

/** 当前是否处于「刚从详情返回」的抑制窗口内 */
export function isDetailReturning() {
  if (typeof document === 'undefined') return false;
  return document.documentElement.dataset[RETURN_FLAG] === '1';
}
