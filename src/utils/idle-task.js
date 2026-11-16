/**
 * 把「首屏不需要、但迟早要发」的请求推到浏览器空闲时再发。
 *
 * 为什么需要它：`onMounted` 里同步发起的每一条请求都会和首屏关键数据抢
 * HTTP/2 连接与并发槽（`request-core` 只有 6 个槽）。右栏周报、信息流中段的
 * 广告都属于「首屏看不见、晚 1 秒无感」的取数，放在 `onMounted` 里直发纯属浪费。
 *
 * 三条实现约束（都已踩过）：
 * 1. `requestIdleCallback` 在长任务密集的首屏可能长时间不触发 ⇒ 必须带 `timeout`
 *    兜底，否则周报会一直停在骨架屏；
 * 2. Safari 老版本没有 `requestIdleCallback` ⇒ 退回 `setTimeout`；
 * 3. 组件卸载后必须能取消，否则会对已销毁的实例写状态。
 *
 * @param {() => void} task 空闲时要执行的任务；异常请由 task 自己 try/catch 收口
 * @param {{ timeout?: number, fallbackDelay?: number }} [options]
 *   timeout       requestIdleCallback 的最晚触发时限（毫秒），默认 2500
 *   fallbackDelay 没有 requestIdleCallback 时的 setTimeout 延时，默认 300
 * @returns {() => void} 取消函数
 */
export function runWhenIdle(task, options = {}) {
  const { timeout = 2500, fallbackDelay = 300 } = options;

  if (typeof window === 'undefined') return () => {};

  let cancelled = false;
  let handle = null;
  let timer = null;

  const run = () => {
    if (cancelled) return;
    cancelled = true;
    task();
  };

  if (typeof window.requestIdleCallback === 'function') {
    handle = window.requestIdleCallback(run, { timeout });
  } else {
    timer = window.setTimeout(run, fallbackDelay);
  }

  return () => {
    if (cancelled) return;
    cancelled = true;
    if (handle !== null && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(handle);
    }
    if (timer !== null) window.clearTimeout(timer);
  };
}
