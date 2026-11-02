/**
 * useImageFailure —— 图片加载失败时的**降级开关**（每个组件一份，按 key 记账）
 *
 * 为什么需要：`<img>` 加载失败时浏览器会画一个「碎图」图标（Safari 是蓝底问号），
 * 那东西出现在商品卡/订单缩略图里比不显示更糟 —— 用户会以为页面坏了。但这层兜底
 * 没法写在工具函数里（它要驱动模板分支），所以收敛成一个 20 行的 composable，
 * 而不是在 6 个组件里各写一遍 `failed = ref(false)` 然后慢慢漂移。
 *
 * 用法：
 *   const { isFailed, markFailed } = useImageFailure();
 *   <img v-if="url && !isFailed(id)" :src="url" @error="markFailed(id)" />
 *   <Package v-else />
 *
 * key 用**稳定标识**（商品 id / 订单 key / 图片 URL 本身），不要用数组下标 ——
 * 列表重排后下标会指向另一行，会出现「这张挂了那张跟着变占位」的错位。
 */
import { ref } from 'vue';

export function useImageFailure() {
  const failedKeys = ref(new Set());

  const isFailed = (key) => failedKeys.value.has(key);

  const markFailed = (key) => {
    // Set 在 ref 里是响应式代理，add 会触发依赖；用新实例替换只是为了
    // 让「换一批数据」时可以整体 reset 而不必逐项删
    if (failedKeys.value.has(key)) return;
    const next = new Set(failedKeys.value);
    next.add(key);
    failedKeys.value = next;
  };

  const resetFailures = () => {
    failedKeys.value = new Set();
  };

  return { isFailed, markFailed, resetFailures };
}

export default useImageFailure;
